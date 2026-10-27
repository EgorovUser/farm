/**
 * ModForgeModule (M03) — «Ривен-генератор: конструктор характеристик по
 * бюджету». M03.2: движок rollFor (§5) за публичным API + событие
 * modforge.rolled + costOf + rollItem (стартовые роллы предмета по
 * modSlots.budgetBase + форме редкости — потребитель применит через M02).
 * M03.3: реролл-цикл §6 (reroll/choose/rerollView) — доступ к предмету через
 * колбэки app-слоя (getSubject/applyRolls, прецедент D33 applyUseEffect):
 * модуль НЕ импортирует инвентарь (П4), bootstrap вайрит inventory-каналы.
 *
 * Зависимости — только ядро (карточка §9). Без вайринга колбэков реролл
 * отказывает fail-closed («канал не подключён») — деньги не списываются.
 *
 * DEBT-8 (ратифицировано): самоподключение в activate() — легальная
 * конвенция до авто-монтажа координаторами.
 */
import type { GameModule, ModuleContext } from '@/game/module-registry';
import type { ModTypeDef } from '@/content/mods/registry';
import type { ModForgeTable } from '@/content/balance/modforge';
import type { ItemDef } from '@/content/items/items';
import type { ID, Rarity, Tag } from '@/shared/types/ids';
import { err, ok, type Result } from '@/shared/types/result';
import type { RolledModEntry } from '@/shared/types/rolled-mod';
import { createModForgeManifest } from './manifest';
import { costOf as pureCostOf, type CostCurve } from './cost';
import { rollFor, type RollOutcome, type RollShape } from './roll';
import { RerollService, type ChooseReceipt, type RerollReceipt, type RerollSubject, type RerollView } from './reroll';
import { defaultModForgeState, modForgeSaveSlice, type ModForgeState } from './state';

const RARITIES: Rarity[] = ['common', 'uncommon', 'rare', 'epic', 'legendary', 'mythic'];

/** [M10.1 · C1 леджера AUDIT-M03] адресат роллов для payload события
 *  modforge.rolled: кто получает партию (предмет — iid; карточки заточки —
 *  тоже iid предмета-носителя). null — адресат неизвестен в момент ролла
 *  (прероллы магазина/крафта: запись создаётся ПОСЛЕ оплаты — см. отчёт M10.1). */
export interface RollTarget {
  kind: 'item';
  refId: ID;
}

/** запрос модульного API rollFor (валидируется на месте, неизвестное — отказ) */
export interface ApiRollRequest {
  budget: number;
  scopeTags: Tag[];
  /** форма из byRarity (дефолт) либо явное переопределение shape */
  rarity?: Rarity;
  shape?: RollShape;
  /** детерминизм извне (self-checks); дефолт — стрим rngBus */
  rng?: () => number;
  streamKey?: string;
  from?: 'initial' | 'forge';
  forgeLevel?: number;
  /** [C1] адресат роллов — попадает в payload modforge.rolled (опционально) */
  target?: RollTarget;
}

export interface RollItemReceipt extends RollOutcome {
  defId: ID;
  rarity: Rarity;
}

/** [M03.3] колбэки app-слоя: предмет и применение роллов — через инвентарь
 *  по ModuleRegistry (П4). Прецедент — InventoryModuleDeps (D33-канал).
 *  [M04.1 · C6] saveId — основа стабильного сида реролла (канон §5). */
export interface ModForgeModuleDeps {
  /** app-слой: (inventory.list → iid); null — не найден */
  getSubject?(iid: ID): RerollSubject | null;
  /** app-слой: inventory.setRolls (партия, атомарно) */
  applyRolls?(iid: ID, rolls: RolledModEntry[]): Result<unknown>;
  /** app-слой: saveId сейва — сид реролла стабилен ВСЕГДА (C6, не от дня) */
  saveId?(): string;
}

export class ModForgeModule implements GameModule {
  readonly manifest: GameModule['manifest'] = createModForgeManifest();

  /** монотонный счётчик уникальных стримов демо-роллов (не персистится) */
  private rollSeq = 0;
  private state: ModForgeState = defaultModForgeState();
  private readonly moduleDeps: ModForgeModuleDeps;
  /** [M03.3] реролл-сервис (создаётся в activate) */
  private rerollService: RerollService | null = null;

  /** публичный API для других модулей — только через ModuleRegistry (П4) */
  api: Record<string, (...args: unknown[]) => unknown> = {};

  constructor(deps: ModForgeModuleDeps = {}) {
    this.moduleDeps = deps;
  }

  activate(ctx: ModuleContext): void {
    const { rngBus, content, save, bus, time, transaction } = ctx;
    const mods = content.get<ModTypeDef[]>('mods');
    const table = content.get<ModForgeTable>('modforge');
    const itemsTable = content.get<ItemDef[]>('items');
    const itemById = new Map(itemsTable.map((d) => [d.id, d] as const));
    const curve: CostCurve = {
      positiveExponent: table.positiveExponent,
      negativeExponent: table.negativeExponent,
    };
    const costTable = {
      negativeRefund: table.negativeRefund,
      positiveExponent: table.positiveExponent,
      negativeExponent: table.negativeExponent,
    };

    save.registerSlice(
      'modforge',
      modForgeSaveSlice(
        () => this.state,
        (s) => {
          this.state = s;
        },
      ),
    );

    /** форма ролла: явный shape перекрывает редкость */
    const shapeOf = (rarity: Rarity | undefined, shape: RollShape | undefined): Result<RollShape> => {
      if (shape) {
        if (
          !Array.isArray(shape.positives) ||
          shape.positives.length !== 2 ||
          !shape.positives.every((n) => Number.isInteger(n) && n >= 0 && n <= 6) ||
          shape.positives[0] > shape.positives[1] ||
          !(shape.negChance >= 0 && shape.negChance <= 1)
        ) {
          return err('shape некорректен: positives [min≤max, 0..6], negChance 0..1');
        }
        return ok({ positives: [shape.positives[0], shape.positives[1]], negChance: shape.negChance });
      }
      if (!rarity || !RARITIES.includes(rarity)) {
        return err('укажите rarity (форма из byRarity) или явный shape');
      }
      const row = table.byRarity[rarity];
      return ok({ positives: [row.positives[0], row.positives[1]], negChance: row.negChance });
    };

    /** [C1 · AUDIT-M03, M10.1] payload += target — адресат роллов (аддитивно,
     *  слушателей не ломает; null = адресат в момент ролла неизвестен) */
    const publishRolled = (
      source: string,
      req: { budget: number; scopeTags: Tag[] },
      outcome: RollOutcome,
      target?: RollTarget | null,
    ): void => {
      bus.publish('modforge.rolled', {
        source,
        budget: outcome.detail.budget,
        scopeTags: [...req.scopeTags],
        rolls: outcome.rolls.map((r) => ({ ...r })),
        refund: outcome.detail.refund,
        spent: outcome.detail.spent,
        target: target ?? null,
      });
    };

    // --- [M03.3] реролл-цикл §6: доступ к предмету — колбэки app-слоя
    //     (D33-прецедент); без вайринга — fail-closed отказ
    const reroll = new RerollService({
      table,
      mods,
      tryItem: (defId) => itemById.get(defId),
      rngBus,
      transaction,
      bus,
      now: () => time.now(),
      getState: () => this.state,
      setState: (s) => {
        this.state = s;
      },
      markDirty: () => save.markDirty(),
      saveId: () => this.moduleDeps.saveId?.() ?? '',
      getSubject: (iid) =>
        this.moduleDeps.getSubject ? this.moduleDeps.getSubject(iid) : null,
      applyRolls: (iid, rolls) =>
        this.moduleDeps.applyRolls
          ? this.moduleDeps.applyRolls(iid, rolls)
          : err('канал записи роллов не подключён (app-слой: inventory.setRolls)'),
    });
    this.rerollService = reroll;

    this.api = {
      // --- M03.3: реролл-цикл §6
      'modforge.reroll': (iid: unknown): Result<RerollReceipt> => {
        if (typeof iid !== 'string' || !iid) return err('укажите iid предмета (inv list)');
        return reroll.reroll(iid);
      },
      'modforge.choose': (iid: unknown, choice: unknown): Result<ChooseReceipt> => {
        if (typeof iid !== 'string' || !iid) return err('укажите iid предмета (inv list)');
        if (choice !== 'new' && choice !== 'keep') return err('choice должен быть "new" или "keep"');
        return reroll.choose(iid, choice);
      },
      'modforge.rerollView': (iid?: unknown): RerollView[] | RerollView | null => {
        if (typeof iid === 'string' && iid) return reroll.view(iid);
        return reroll.views();
      },
      'modforge.rerollCost': (rarity: unknown, attempts?: unknown): Result<number> => {
        // [C2 · M04.2] цена зависит от редкости предмета: база по редкости
        // (common 10 … mythic 300), кап ×10 базы; сигнатура 1.3.0
        if (typeof rarity !== 'string' || !RARITIES.includes(rarity as Rarity)) {
          return err(`rarity должна быть одной из: ${RARITIES.join(', ')}`);
        }
        if (
          typeof attempts !== 'number' ||
          !Number.isFinite(attempts) ||
          attempts < 0
        ) {
          return err('attempts должен быть числом ≥ 0');
        }
        return ok(reroll.costOf(rarity as Rarity, Math.floor(attempts)));
      },

      'modforge.rollFor': (req: unknown): Result<RollOutcome> => {
        const r = (req ?? {}) as Partial<ApiRollRequest>;
        const budget = r.budget;
        if (typeof budget !== 'number' || !Number.isFinite(budget) || budget < 0) {
          return err('budget должен быть конечным числом ≥ 0');
        }
        if (!Array.isArray(r.scopeTags) || !r.scopeTags.every((t) => typeof t === 'string')) {
          return err('scopeTags должен быть массивом строк (пустой = все кандидаты)');
        }
        const shapeR = shapeOf(r.rarity, r.shape);
        if (!shapeR.ok) return shapeR;
        const from: RolledModEntry['from'] = r.from === 'forge' ? 'forge' : 'initial';
        if (r.forgeLevel !== undefined && (!Number.isInteger(r.forgeLevel) || r.forgeLevel < 0)) {
          return err('forgeLevel должен быть целым ≥ 0');
        }
        // [C1] адресат роллов: форма { kind: 'item', refId } — опционально
        if (
          r.target !== undefined &&
          (typeof r.target !== 'object' ||
            r.target === null ||
            r.target.kind !== 'item' ||
            typeof r.target.refId !== 'string' ||
            !r.target.refId)
        ) {
          return err('target должен быть { kind: \'item\', refId: <iid> }');
        }
        const rng =
          typeof r.rng === 'function'
            ? r.rng
            : rngBus.stream(typeof r.streamKey === 'string' && r.streamKey ? r.streamKey : `modforge:roll:${++this.rollSeq}`);
        const outcome = rollFor(
          {
            budget,
            scopeTags: r.scopeTags as Tag[],
            shape: shapeR.value,
            mods,
            rng,
            ...(from === 'forge' && r.forgeLevel !== undefined ? { forgeLevel: r.forgeLevel } : {}),
            from,
          },
          costTable,
        );
        publishRolled('modforge.rollFor', { budget, scopeTags: r.scopeTags as Tag[] }, outcome, r.target ?? null);
        return ok(outcome);
      },

      'modforge.rollItem': (defId: unknown, streamKey?: unknown, target?: unknown): Result<RollItemReceipt> => {
        if (typeof defId !== 'string' || !defId) return err('укажите defId предмета');
        const def = itemById.get(defId);
        if (!def) return err(`предмет "${defId}" не найден в реестре`);
        if (!def.modSlots) return err(`у предмета "${defId}" нет ривен-слотов (modSlots)`);
        // [C1] адресат (опционально): { kind: 'item', refId: <iid> } — в payload
        if (
          target !== undefined &&
          target !== null &&
          (typeof target !== 'object' ||
            (target as RollTarget).kind !== 'item' ||
            typeof (target as RollTarget).refId !== 'string' ||
            !(target as RollTarget).refId)
        ) {
          return err('target должен быть { kind: \'item\', refId: <iid> }');
        }
        const row = table.byRarity[def.rarity];
        // [M04.1 · C4] именованный стрим выдачи: потребитель (магазин) передаёт
        // свой стрим-ключ shop:issue:<seq> — «именованный стрим RngBus на выдаче»;
        // дефолт — собственный счётчик (прежнее поведение, совместимость)
        const stream =
          typeof streamKey === 'string' && streamKey
            ? streamKey
            : `modforge:item:${defId}:${++this.rollSeq}`;
        const outcome = rollFor(
          {
            budget: def.modSlots.budgetBase,
            scopeTags: def.modSlots.tags,
            shape: { positives: [row.positives[0], row.positives[1]], negChance: row.negChance },
            mods,
            rng: rngBus.stream(stream),
            from: 'initial',
          },
          costTable,
        );
        publishRolled('modforge.rollItem', { budget: def.modSlots.budgetBase, scopeTags: def.modSlots.tags }, outcome, (target as RollTarget | undefined | null) ?? null);
        return ok({ defId, rarity: def.rarity, ...outcome });
      },

      'modforge.costOf': (type: unknown, value: unknown): Result<number> => {
        if (typeof type !== 'string' || !type) return err('укажите тип мода (mods list)');
        const mod = mods.find((m) => m.id === type);
        if (!mod) return err(`неизвестный тип мода: ${type}`);
        if (typeof value !== 'number' || !Number.isFinite(value)) return err('значение должно быть числом');
        return ok(pureCostOf(curve, mod, value));
      },
    };
  }

  deactivate(): void {
    this.api = {};
    this.rollSeq = 0;
    this.rerollService = null;
  }
}
