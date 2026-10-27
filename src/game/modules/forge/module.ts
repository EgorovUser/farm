/**
 * ForgeModule (M10.1) — «Заточка: шанс, pity, откат» (карточка §2–§4).
 * Сервисы: WhetstoneService (станок/круг §2), attempt-цикл (§4.4, attempt.ts),
 * ForgingProvider (§6, R3 — только станочные моды). Карточки §5 — M10.2.
 *
 * Швы M02 (П4, прецедент D38/C4 — app-колбэк вместо импорта):
 *  - forge.statScale(iid) → EquipmentProvider умножает БАЗУ стата
 *    (1 + 0.05×L; база не мутируется, П2);
 *  - forge.effectiveTier(iid, tier) → SellService подставляет эффективный
 *    тир (R2) в priceBus.sellPrice (качество входит в base множителем).
 *
 * DEBT-8 (ратифицировано): самоподключение в activate() — легальная конвенция
 * до авто-монтажа координаторами.
 */
import type { GameModule, ModuleContext } from '@/game/module-registry';
import type { ItemDef } from '@/content/items/items';
import type { ForgeTable } from '@/content/balance/forging';
import { attemptCostOf } from '@/content/balance/forging';
import type { ConditionCtx } from '@/shared/types/requirement';
import type { ID, QualityTier } from '@/shared/types/ids';
import type { Result } from '@/shared/types/result';
import { err, ok } from '@/shared/types/result';
import type { RolledModEntry } from '@/shared/types/rolled-mod';
import { createForgeManifest } from './manifest';
import { defaultForgeState, forgeSaveSlice, type ForgeState } from './state';
import { createAttemptService, type AttemptReceipt } from './attempt';
import { createCardsService, type LevelUpReceipt } from './cards';
import { WhetstoneService, type StationBuyReceipt } from './station';
import { ForgingProvider } from './provider';
import {
  baseSuccessOf,
  effectiveQualityOf,
  rollbackChanceOf,
  statScaleOf,
  successChanceOf,
} from './outcome';

export interface ForgeModuleDeps {
  /** app-слой: inventory.list — рюкзак (D30: экипированные исключены);
   *  [M10.2] полный профиль: rolledMods нужны карточному сервису */
  listItems?(): Array<{ iid: ID; defId: ID; quality: { tier: QualityTier; value: number }; rolledMods?: RolledModEntry[] }>;
  /** app-слой: витрина craft.stations → built (гейт наковальни, П4) */
  craftStationBuilt?(id: string): boolean;
  /** app-слой: player.ctxExtras — уровень игрока для гейтов покупок (П4) */
  gateExtras?(): Record<string, unknown>;
  /** [M10.2 · §5] app-слой: modforge.rollFor — карточные роллы (П4) */
  rollFor?(req: Record<string, unknown>): Result<{ rolls: RolledModEntry[]; detail: { budget: number; refund: number; spent: number } }>;
  /** [M10.2 · §5] app-слой: inventory.setRolls — применение партии (append карточки) */
  applyRolls?(iid: ID, rolls: RolledModEntry[]): Result<unknown>;
}

/** строка таблицы шансов forge.info (П6: числа на стол) */
export interface ForgeInfoRow {
  level: number;
  cost: { ingots: number; gold: number };
  baseSuccess: number;
  pity0: number;
  pity5: number;
  rollback: number;
}

export class ForgeModule implements GameModule {
  readonly manifest: GameModule['manifest'] = createForgeManifest();

  private state: ForgeState = defaultForgeState();
  private readonly moduleDeps: ForgeModuleDeps;
  /** dev-форс исхода (02-BUSES §12): память сессии, НЕ сериализуется */
  private forced: 'success' | 'fail' | 'rollback' | null = null;
  /** [M10.2] auto-режим карточек (карточка §7: до фазы 6 — auto; debug-переключатель) */
  private autoCards = true;
  private attachedStatBus: { unregisterProvider(id: string): void } | null = null;
  private attempt: ReturnType<typeof createAttemptService> | null = null;
  private cards: ReturnType<typeof createCardsService> | null = null;
  private whetstone: WhetstoneService | null = null;

  /** публичный API для других модулей — только через ModuleRegistry (П4) */
  api: Record<string, (...args: unknown[]) => unknown> = {};

  constructor(deps: ForgeModuleDeps = {}) {
    this.moduleDeps = deps;
  }

  activate(ctx: ModuleContext): void {
    const { bus, statBus, rngBus, pity, transaction, time, save, content } = ctx;
    const table = content.get<ForgeTable>('forge');
    const itemsTable = content.get<ItemDef[]>('items');
    const itemById = new Map(itemsTable.map((d) => [d.id, d] as const));

    save.registerSlice(
      'forge',
      forgeSaveSlice(
        () => this.state,
        (s) => {
          this.state = s;
        },
      ),
    );

    const gateExtras = () => this.moduleDeps.gateExtras?.() ?? {};
    const resolveCtx = () => ({ ...time.ctx('player'), extra: gateExtras() });
    const gateCtx = (): ConditionCtx => {
      const extra = gateExtras();
      return {
        tags: [],
        stat: (stat) => statBus.resolve({ stat, ctx: { ...time.ctx('player'), extra } }),
        hasFlag: (flag) => Boolean(extra[`flag:${flag}`]),
        skillLevel: (skill) => Number(extra[`skill:${skill}`] ?? 0),
        playerLevel: Number(extra['player:level'] ?? 0),
        itemCount: () => 0,
        hasAchievement: (id) => Boolean(extra[`achievement:${id}`]),
      };
    };

    const deps = {
      table,
      transaction,
      bus,
      statBus,
      rngBus,
      pity,
      now: () => time.now(),
      resolveCtx,
      gateCtx,
      getState: () => this.state,
      setState: (s: ForgeState) => {
        this.state = s;
      },
      markDirty: () => save.markDirty(),
      listItems: () => this.moduleDeps.listItems?.() ?? [],
      tryItem: (defId: ID): ItemDef | undefined => itemById.get(defId),
      craftStationBuilt: (id: string) => this.moduleDeps.craftStationBuilt?.(id) ?? false,
      forceMode: () => this.forced,
    };
    // --- [M10.2 · §5] карточный сервис: роллы/выбор/отказ/заморозка (до attempt:
    //     attempt держит его в deps для интеграции исходов); бюджет карточки —
    //     канон M03 (modforge.forgeBudgetPerLevel, П6: не литерал)
    const modforgeTable = content.get<{ forgeBudgetPerLevel: number }>('modforge');
    const cards = createCardsService({
      table,
      budgetPerLevel: modforgeTable.forgeBudgetPerLevel,
      bus,
      now: () => time.now(),
      getState: () => this.state,
      setState: (s) => {
        this.state = s;
      },
      markDirty: () => save.markDirty(),
      rollFor: (req) =>
        this.moduleDeps.rollFor
          ? this.moduleDeps.rollFor(req)
          : err('канал карточных роллов не подключён (app-слой: modforge.rollFor)'),
      applyRolls: (iid, rolls) =>
        this.moduleDeps.applyRolls
          ? this.moduleDeps.applyRolls(iid, rolls)
          : err('канал записи роллов не подключён (app-слой: inventory.setRolls)'),
      rollsOf: (iid) => this.moduleDeps.listItems?.().find((e) => e.iid === iid)?.rolledMods ?? [],
      autoMode: () => this.autoCards,
    });
    this.cards = cards;

    const attempt = createAttemptService(deps, cards);
    this.attempt = attempt;
    this.whetstone = new WhetstoneService({
      table,
      transaction,
      bus,
      gateCtx,
      getState: () => this.state,
      setState: (s) => {
        this.state = s;
      },
      markDirty: () => save.markDirty(),
    });

    // --- провайдер §6 (R3: только станочные моды — бонус круга)
    const provider = new ForgingProvider({ table, getState: () => this.state });
    statBus.registerProvider(provider);
    this.attachedStatBus = statBus;

    const levelOf = (iid: ID): number => this.state.sharpening[iid] ?? 0;
    /** [M10.2] iid последнего активного предложения (forge card без аргумента) */
    const lastOfferIid = (): string => {
      const keys = this.cards ? [...this.cards.offers.keys()] : [];
      return keys.length > 0 ? (keys[keys.length - 1] as string) : '';
    };

    this.api = {
      'forge.attempt': (iid: unknown): Result<AttemptReceipt> => {
        if (typeof iid !== 'string' || !iid) return err('укажите предмет: forge attempt <iid> (inv list)');
        return attempt.attempt(iid);
      },
      'forge.stats': (iid: unknown): Result<unknown> => {
        if (typeof iid !== 'string' || !iid) return err('укажите предмет: forge stats <iid> (inv list)');
        return attempt.statsView(iid);
      },
      /** таблица шансов L0..потолок (чистые функции outcome.ts; П6) */
      'forge.info': (): ForgeInfoRow[] => {
        const levelMax = attempt.levelMaxOf();
        const rows: ForgeInfoRow[] = [];
        for (let L = 0; L <= levelMax; L++) {
          rows.push({
            level: L,
            cost: attemptCostOf(L, table),
            baseSuccess: baseSuccessOf(L, table),
            pity0: successChanceOf(L, 0, table),
            pity5: successChanceOf(L, 5, table),
            rollback: rollbackChanceOf(L, table),
          });
        }
        return rows;
      },
      'forge.buy': (id: unknown): Result<StationBuyReceipt> => {
        if (typeof id !== 'string' || !id) return err('укажите: forge buy <whetstone|whetstone_circle>');
        return this.whetstone ? this.whetstone.buy(id) : err('модуль не активен');
      },
      'forge.force': (mode: unknown): Result<string> => {
        if (mode === null || mode === undefined || mode === '' || mode === 'off') {
          this.forced = null;
          return ok('форс снят — естественные роллы');
        }
        if (mode !== 'success' && mode !== 'fail' && mode !== 'rollback') {
          return err('режим: success | fail | rollback | off');
        }
        this.forced = mode;
        return ok(`форс: ${mode}`);
      },
      /** шов M02: множитель БАЗЫ стата предмета (1 + 0.05×L) */
      'forge.statScale': (iid: unknown): number => {
        if (typeof iid !== 'string' || !iid) return 1;
        return statScaleOf(levelOf(iid), table);
      },
      /** шов M02: эффективный тир (R2) для цены продажи */
      'forge.effectiveTier': (iid: unknown, tier: unknown): QualityTier => {
        if (typeof iid !== 'string' || !iid || typeof tier !== 'string') return tier as QualityTier;
        const entry = (this.moduleDeps.listItems?.() ?? []).find((e) => e.iid === iid);
        if (!entry) return tier as QualityTier;
        return effectiveQualityOf(entry.quality.tier, entry.quality.value, levelOf(iid), table).tier;
      },
      'forge.levelOf': (iid: unknown): number => {
        if (typeof iid !== 'string' || !iid) return 0;
        return levelOf(iid);
      },
      // --- [M10.2 · §5] ручной выбор/отказ (при активном предложении; auto off)
      'forge.card': (arg: unknown, iidArg?: unknown): Result<unknown> => {
        if (!this.cards) return err('модуль не активен');
        const iid = typeof iidArg === 'string' && iidArg ? iidArg : lastOfferIid();
        if (typeof iid !== 'string' || !iid) return err('укажите предмет: forge card <1..3|decline> [iid] — или сделайте успех в ручном режиме');
        if (arg === 'decline') {
          const r = this.cards.decline(iid);
          return r.ok ? ok({ declined: true, bonus: r.value.bonus }) : r;
        }
        const n = Number(arg);
        if (!Number.isInteger(n)) return err('forge card <1..3|decline> [iid]');
        return this.cards.choose(iid, n);
      },
      'forge.auto': (mode: unknown): Result<string> => {
        if (mode === 'off' || mode === false) {
          this.autoCards = false;
          return ok('карточки: РУЧНОЙ режим (успех оставляет предложение — forge card <1..3|decline>)');
        }
        this.autoCards = true;
        return ok('карточки: АВТО-режим (лучшая совместимая карточка выбирается сразу)');
      },
      'forge.offers': (): Array<{ iid: ID; level: number; cards: number }> =>
        this.cards
          ? [...this.cards.offers.values()].map((o) => ({ iid: o.iid, level: o.level, cards: o.cards.length }))
          : [],
    };
  }

  deactivate(): void {
    this.attachedStatBus?.unregisterProvider('forge.whetstone');
    this.attachedStatBus = null;
    this.attempt = null;
    this.cards = null;
    this.whetstone = null;
    this.forced = null;
    this.autoCards = true;
    this.api = {};
  }
}
