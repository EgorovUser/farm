/**
 * CraftModule (M09) — «Крафт: станции, рецепты, качество результата».
 * Сервисы: StationService §2 (покупка станций/улучшений), QueueService §5
 * (make/sweep/cancel/collect), RepairService (наковальня, 10% базы),
 * CraftStationProvider §6 ( очереди/капы/рюкзаки — единый провайдер шины).
 * Формула качества §4 — quality.ts (чистые функции, детерминизм).
 *
 * Каналы app-слоя (П4: модуль никого не импортирует; module-wiring вайрит
 * через ModuleRegistry): inventory.list/canAcquire/addWithQuality/setRolls/
 * dur, modforge.rollItem, player.withEnergy/ctxExtras, wallet (гейт-чтение).
 * Без вайринга каналов make/collect отказывают fail-closed — состояние
 * (энергия/входы/золото) не трогается.
 *
 * DEBT-8 (ратифицировано): самоподключение в activate() — легальная конвенция
 * до авто-монтажа координаторами.
 */
import type { GameModule, ModuleContext } from '@/game/module-registry';
import type { ItemDef } from '@/content/items/items';
import type { RecipeDef } from '@/content/craft/recipes';
import type { StationDef, StationId } from '@/content/craft/stations';
import type { CraftTable } from '@/content/balance/craft';
import type { CurrencyInfo } from '@/content/player/currencies';
import type { ConditionCtx } from '@/shared/types/requirement';
import { checkCondition } from '@/shared/utils/condition-check';
import type { ID, QualityTier, StatId } from '@/shared/types/ids';
import type { Result } from '@/shared/types/result';
import { err, ok } from '@/shared/types/result';
import type { RolledModEntry } from '@/shared/types/rolled-mod';
import { createCraftManifest } from './manifest';
import {
  craftSaveSlice,
  defaultCraftState,
  type CraftState,
} from './state';
import { StationService, type StationBuyReceipt, type StationViewRow } from './stations';
import {
  QueueService,
  type CollectReceipt,
  type MakeReceipt,
  type QueueViewRow,
  type SweepReceipt,
  type CancelReceipt,
} from './queue';
import { RepairService, type RepairReceipt } from './repair';
import { CraftStationProvider } from './providers';
import type { InventoryEntryLike } from './inputs';

/** колбэки app-слоя: выдача/роллы/энергия/гейты (bootstrap через ModuleRegistry) */
export interface CraftModuleDeps {
  /** inventory.list — рюкзак (D30: экипированные исключены) */
  listItems?(): InventoryEntryLike[];
  /** wallet.get — чтение валют (план входов; списание — только транзакцией) */
  walletGet?(id: ID): number;
  /** inventory.addWithQuality — выдача с явным качеством крафта */
  deliverOutput?(defId: ID, tier: QualityTier, value: number, qty: number, source: string): Result<{ iids: ID[] }>;
  /** inventory.canAcquire — проба вместимости до выдачи (D23-канон) */
  probeCapacity?(defId: ID, qty: number): Result<{ fits: boolean; free: number; newEntries: number }>;
  /** modforge.rollItem — стартовые ривен-роллы modSlots-выходов (C4) */
  rollItem?(defId: ID, streamKey: string): Result<{ rolls: RolledModEntry[] }>;
  /** inventory.setRolls — применение партии роллов */
  applyRolls?(iid: ID, rolls: RolledModEntry[]): Result<unknown>;
  /** player.ctxExtras — уровень/навыки для гейтов и формулы (П4) */
  gateExtras?(): Record<string, unknown>;
  /** player.withEnergy — энергия списывается ТОЛЬКО при успехе действия */
  withEnergy?(stat: StatId, action: () => Result<unknown>, reason?: string): Result<unknown>;
  /** inventory.dur — установка прочности (ремонт) */
  setDurability?(iid: ID, current: number): Result<{ iid: ID; current: number; max: number }>;
}

export class CraftModule implements GameModule {
  readonly manifest: GameModule['manifest'] = createCraftManifest();

  private state: CraftState = defaultCraftState();
  private readonly moduleDeps: CraftModuleDeps;
  private unsubs: Array<() => void> = [];
  private attachedStatBus: { unregisterProvider(id: string): void } | null = null;
  private queue: QueueService | null = null;

  /** публичный API для других модулей — только через ModuleRegistry (П4) */
  api: Record<string, (...args: unknown[]) => unknown> = {};

  constructor(deps: CraftModuleDeps = {}) {
    this.moduleDeps = deps;
  }

  activate(ctx: ModuleContext): void {
    const { bus, statBus, transaction, time, save, content, tasks } = ctx;
    const table = content.get<CraftTable>('craft');
    const recipes = content.get<RecipeDef[]>('craft.recipes');
    const stations = content.get<StationDef[]>('craft.stations');
    const currencies = content.get<Record<string, CurrencyInfo>>('player.currencies');
    const itemsTable = content.get<ItemDef[]>('items');
    const itemById = new Map(itemsTable.map((d) => [d.id, d] as const));
    const stationIds = stations.map((s) => s.id);

    save.registerSlice(
      'craft',
      craftSaveSlice(
        () => this.state,
        (s) => {
          this.state = s;
        },
        { readyCap: table.queue.readyCap, stationIds },
      ),
    );

    // --- контекст гейтов/резолвов: уровень/навыки игрока (player.ctxExtras, П4)
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
        itemCount: (defId) => this.countItems(defId),
        hasAchievement: (id) => Boolean(extra[`achievement:${id}`]),
      };
    };

    const stations$ = new StationService({
      stations,
      statBus,
      transaction,
      bus,
      getState: () => this.state,
      setState: (s) => {
        this.state = s;
      },
      markDirty: () => save.markDirty(),
      gateCtx,
      resolveCtx,
    });

    const listItems = () => this.moduleDeps.listItems?.() ?? [];
    const queue = new QueueService({
      table,
      recipes,
      stations: stations$,
      transaction,
      bus,
      statBus,
      now: () => time.now(),
      resolveCtx,
      gateCtx,
      skillLevel: () => Number(gateExtras()['skill:crafting'] ?? 0),
      getState: () => this.state,
      setState: (s) => {
        this.state = s;
      },
      markDirty: () => save.markDirty(),
      listItems,
      walletGet: (id) => this.moduleDeps.walletGet?.(id) ?? 0,
      isCurrency: (defId) => defId in currencies,
      tryItem: (defId) => itemById.get(defId),
      withEnergy: (stat, action, reason) =>
        this.moduleDeps.withEnergy
          ? this.moduleDeps.withEnergy(stat, action, reason)
          : { ok: false as const, error: 'канал энергии не подключён (app-слой: player.withEnergy)' },
      deliverOutput: (defId, tier, value, qty, source) =>
        this.moduleDeps.deliverOutput
          ? this.moduleDeps.deliverOutput(defId, tier, value, qty, source)
          : { ok: false as const, error: 'канал выдачи не подключён (app-слой: inventory.addWithQuality)' },
      probeCapacity: (defId, qty) =>
        this.moduleDeps.probeCapacity
          ? this.moduleDeps.probeCapacity(defId, qty)
          : { ok: false as const, error: 'канал вместимости не подключён (app-слой: inventory.canAcquire)' },
      rollItem: (defId, streamKey) =>
        this.moduleDeps.rollItem
          ? this.moduleDeps.rollItem(defId, streamKey)
          : { ok: false as const, error: 'канал роллов не подключён (app-слой: modforge.rollItem)' },
      applyRolls: (iid, rolls) =>
        this.moduleDeps.applyRolls
          ? this.moduleDeps.applyRolls(iid, rolls)
          : { ok: false as const, error: 'канал записи роллов не подключён (app-слой: inventory.setRolls)' },
    });
    this.queue = queue;

    const repair = new RepairService({
      table,
      stations: stations$,
      transaction,
      listItems,
      tryItem: (defId) => itemById.get(defId),
      setDurability: (iid, current) =>
        this.moduleDeps.setDurability
          ? this.moduleDeps.setDurability(iid, current)
          : { ok: false as const, error: 'канал прочности не подключён (app-слой: inventory.dur)' },
    });

    // --- провайдер §6 (карточка: craftStationProvider)
    const provider = new CraftStationProvider({ stations, getState: () => this.state });
    statBus.registerProvider(provider);
    this.attachedStatBus = statBus;

    // --- ход очередей: minuteTick (живая игра) + hourTick (catchUp, §8)
    this.unsubs = [
      bus.subscribe('time.minuteTick', () => queue.sweep()),
      bus.subscribe('time.hourTick', () => queue.sweep()),
    ];

    // --- TaskRegistry §6: craft.queue — работник-кузнец (M11 WorkersDirector)
    tasks.register('craft.queue', {
      label: 'досчёт очередей крафта (готовые партии)',
      run: () => {
        const r = queue.sweep();
        return {
          ok: true as const,
          value: { message: `стартов ${r.started}, завершено ${r.completed}, пауза: ${r.paused.join(',') || '—'}` },
        };
      },
    });

    this.api = {
      'craft.stations': (): StationViewRow[] => stations$.view(),
      'craft.buy': (id: unknown): Result<StationBuyReceipt> => {
        if (typeof id !== 'string' || !id) return err('укажите станцию или улучшение: craft.buy <id> (витрина — craft.stations)');
        return stations$.buy(id);
      },
      'craft.list': (station?: unknown): Array<RecipeDef & { locked: boolean }> => {
        const list = typeof station === 'string' && station ? recipes.filter((r) => r.station === station) : recipes;
        const gctx = gateCtx();
        return list.map((r) => ({ ...r, locked: r.unlock ? !safeCheck(r.unlock, gctx) : false }));
      },
      'craft.recipe': (id: unknown): Result<RecipeDef> => {
        if (typeof id !== 'string' || !id) return err('укажите рецепт: craft.recipe <id> (витрина — craft.list)');
        const recipe = queue.recipeById(id);
        return recipe ? ok(recipe) : err(`неизвестный рецепт "${id}" (craft.list — витрина)`);
      },
      'craft.make': (id: unknown, minigame?: unknown): Result<MakeReceipt> => {
        if (typeof id !== 'string' || !id) return err('укажите рецепт: craft.make <id> [поправка −1..+1] (витрина — craft.list)');
        const adj = typeof minigame === 'number' && Number.isFinite(minigame) ? minigame : 0;
        return queue.make(id, adj);
      },
      'craft.queue': (station?: unknown): QueueViewRow[] =>
        queue.view(typeof station === 'string' && station ? (station as StationId) : undefined),
      'craft.ready': () => queue.readyView(),
      'craft.collect': (batchId?: unknown): Result<CollectReceipt> =>
        queue.collect(typeof batchId === 'string' && batchId ? batchId : undefined),
      'craft.cancel': (batchId: unknown): Result<CancelReceipt> => {
        if (typeof batchId !== 'string' || !batchId) return err('укажите партию: craft.cancel <batchId> (витрина — craft.queue)');
        return queue.cancel(batchId);
      },
      'craft.repair': (iid: unknown): Result<RepairReceipt> => {
        if (typeof iid !== 'string' || !iid) return err('укажите предмет: craft.repair <iid> (vitрина — inv list)');
        return repair.repair(iid);
      },
      'craft.sweep': (): SweepReceipt => queue.sweep(),
    };
  }

  deactivate(): void {
    for (const off of this.unsubs) off();
    this.unsubs = [];
    this.attachedStatBus?.unregisterProvider('craft.stations');
    this.attachedStatBus = null;
    this.queue = null;
    this.api = {};
  }

  /** количество предмета в рюкзаке (для hasItem-гейтов рецептов) */
  private countItems(defId: ID): number {
    return (this.moduleDeps.listItems?.() ?? [])
      .filter((e) => e.defId === defId)
      .reduce((s, e) => s + e.qty, 0);
  }
}

/** безопасный вызов оценщика (гейт-витрина не имеет права падать, П5) */
function safeCheck(cond: import('@/shared/types/requirement').Condition, ctx: ConditionCtx): boolean {
  try {
    return checkCondition(cond, ctx);
  } catch {
    return false;
  }
}
