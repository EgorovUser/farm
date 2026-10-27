/**
 * FarmModule (M05.1 + M05.2 + M05.3) — каркас и монтаж (карточка M05 §1–§4,
 * §6–§7).
 *
 * Изоляция (01 §5–§7): модуль не импортирует другие модули; контент —
 * чтение общих реестров (П4 п.6); энергия/семя/урожай/вместимость — колбэки
 * app-слоя через ModuleRegistry (паттерн craft, прецеденты D33/D38/C4):
 *   withEnergy → player.withEnergy (энергию списывает ТОЛЬКО успех действия);
 *   removeSeed → inventory.remove (публичный API M02 — F6; item.consumed
 *   {source: 'farm.plant'}); deliverCrop → inventory.add (acquire-путь с
 *   готовым качеством — тир роллит ферма по F7; источник-тег 'farm.grown'
 *   для будущих квестов «вырасти»); probeCapacity → inventory.canAcquire
 *   (канон D23-решения M04.1: вместимость ДО действия). Удобрение — валюта
 *   fertilizer кошелька: ТОЛЬКО TransactionService (F6).
 *
 * Механика действий — FarmActions (actions.ts); сбор — FarmHarvest
 * (harvest.ts, wc-распил M05.3); покупки улучшений — FarmUpgrades
 * (upgrades.ts, G1/G2: данные + TransactionService); логика — чистые функции
 * logic/ (паттерн M01/M02); часовые правила — logic/weeds.ts через подписку
 * time.hourTick (манифест, 02 §4); штраф сорняков — провайдер
 * logic/weeds-provider.ts (StatBus, тег тайла). Витрина — farm.state
 * (sweep + данные тайлов с оставшимся временем).
 *
 * [M05.2 · F4 · catchUp] участие = ПОДПИСКА time.hourTick: OfflineCatchup
 * ядра публикует hourTick с per-hour now (кап 72) — оффлайн-часы проходят
 * ТЕМ ЖЕ обработчиком; ленивая переоценка (готовность/сухость) — sweep на
 * каждом обращении + на каждом часовом проходе.
 *
 * [M05.2 · F5 · исполнители] при активации регистрируются тонкие обёртки
 * TaskRegistry: farm.plow/plant/water/weed/harvest → publicApi (действия
 * сами несут энергию/транзакции/изъятия). worker.actionDone НЕ публикуем —
 * событие каталога 02 §4 за работниками M11.
 *
 * [M05.3 · G1] publicApi += farm.upgrade (покупка) / farm.upgrades (витрина);
 * действия адресуются (tileIdx, tabId='field') — вкладки улучшений.
 */
import type { GameModule, ModuleContext } from '@/game/module-registry';
import type { TaskContext, TaskResultInfo } from '@/kernel/services/task-registry/task-registry';
import type { StatId, ID, QualityTier } from '@/shared/types/ids';
import type { Result } from '@/shared/types/result';
import type { CropDef } from '@/content/farm/crops';
import type { FarmUpgradeDef } from '@/content/farm/upgrades';
import type { FarmTable } from '@/content/balance/farm';
import { createFarmManifest } from './manifest';
import { defaultFarmState, farmSaveSlice, type FarmState, type FarmTile } from './state';
import { isWatered } from './logic/fsm';
import { makeWeedsProvider, WEEDS_PROVIDER_ID } from './logic/weeds-provider';
import { makeUpgradesProvider, UPGRADES_PROVIDER_ID } from './logic/upgrades-provider';
import { farmGateCtx } from './logic/gates';
import { growMsOf } from './logic/growth';
import { factorOfScore } from './logic/quality';
import { makeFarmHourly, registerSprinklerTask } from './hourly';
import { FarmActions, type HarvestLine } from './actions';
import { FarmHarvest } from './harvest';
import { FarmUpgrades } from './upgrades';

export interface FarmModuleDeps {
  gateExtras(): Record<string, unknown>;
  withEnergy(stat: StatId, action: () => Result<unknown>, reason?: string): Result<unknown>;
  removeSeed(defId: ID, qty: number, source: string): Result<unknown>;
  deliverCrop(defId: ID, tier: QualityTier, value: number, qty: number, source: string): Result<unknown>;
  probeCapacity(defId: ID, qty: number): Result<{ fits: boolean; free: number; newEntries: number }>;
}

/** витрина тайла для debug-панели/команды farm.state */
export interface FarmTileView extends FarmTile {
  tabId: string;
  /** гейт «был полит после посадки» (M05.1) */
  watered: boolean;
  /** окно влажности живо сейчас (F3: false + watered = сухой, рост на паузе) */
  wet: boolean;
  remainingMs: number | null;
}

export interface FarmStateView {
  now: number;
  tabs: Array<{ id: string; kind: string; tiles: FarmTileView[] }>;
  /** [M05.3] купленные улучшения (id дефов) */
  upgrades: string[];
}

export class FarmModule implements GameModule {
  readonly manifest = createFarmManifest();
  api: Record<string, (...args: unknown[]) => unknown> = {};
  private state: FarmState = defaultFarmState();
  private readonly moduleDeps: FarmModuleDeps;
  private detach: (() => void) | null = null;

  constructor(deps: FarmModuleDeps) {
    this.moduleDeps = deps;
  }

  activate(ctx: ModuleContext): void {
    const { time, save, content, bus, statBus, rngBus, tasks } = ctx;
    const table = content.get<FarmTable>('farm');
    const crops = content.get<CropDef[]>('farm.crops');
    const upgradesDefs = content.get<FarmUpgradeDef[]>('farm.upgrades');
    const cropById = new Map(crops.map((c) => [c.id, c] as const));

    save.registerSlice(
      'farm',
      farmSaveSlice(
        () => this.state,
        (s) => {
          this.state = s;
        },
      ),
    );

    // --- [M05.3 · G1/G2/G3] покупки улучшений: данные + TransactionService.
    //     Спринклеры: исполнитель TaskRegistry регистрируется при покупке
    //     (условная точка — манифест документирует; registerSprinklerTask —
    //     hourly.ts, идемпотентен); часовая ветка будит по каденсу из данных
    //     и восстанавливает после перезагрузки
    const upgrades = new FarmUpgrades({
      upgrades: upgradesDefs,
      transaction: ctx.transaction,
      time: ctx.time,
      save,
      getState: () => this.state,
      setState: (s) => {
        this.state = s;
      },
      gateCtx: () => farmGateCtx({ statBus, time, gateExtras: () => this.moduleDeps.gateExtras() }),
      onApplied: (def) => {
        bus.publish('invalidate.stat', {}); // новые моды улучшений
        if (def.effect.t === 'sprinkler') {
          registerSprinklerTask({ tasks, time, save, table, getState: () => this.state, setState: (s: FarmState) => (this.state = s) });
        }
      },
    });

    const actions = new FarmActions({
      bus: ctx.bus,
      statBus: ctx.statBus,
      transaction: ctx.transaction,
      time: ctx.time,
      save,
      table,
      crops,
      composter: () => upgrades.composterOf(),
      getState: () => this.state,
      setState: (s) => {
        this.state = s;
      },
      gateExtras: () => this.moduleDeps.gateExtras(),
      withEnergy: (stat, action, reason) => this.moduleDeps.withEnergy(stat, action, reason),
      removeSeed: (defId, qty, source) => this.moduleDeps.removeSeed(defId, qty, source),
    });

    const harvest = new FarmHarvest({
      bus: ctx.bus,
      rngBus: ctx.rngBus,
      time: ctx.time,
      save,
      table,
      crops,
      getState: () => this.state,
      setState: (s) => {
        this.state = s;
      },
      withEnergy: (stat, action, reason) => this.moduleDeps.withEnergy(stat, action, reason),
      deliverCrop: (defId, tier, value, qty, source) => this.moduleDeps.deliverCrop(defId, tier, value, qty, source),
      probeCapacity: (defId, qty) => this.moduleDeps.probeCapacity(defId, qty),
      factorOf: () => factorOfScore(table, actions.autoScore('harvest')), // [ЖИВАЯ находка проб] фактор, НЕ сырой score
      // [M05.3 · G4] перки навыка farming (резолв стата) + «Парник-люкс»
      skillTierUpChance: () =>
        statBus.resolve({ stat: 'farm.harvest.tierUpChance', ctx: time.ctx('player') }),
      tierBonusOf: (tabKind: string) => upgrades.tierBonusOf(tabKind),
      // [M05.3 · G5] регроу винограда: как посадка — growHours × текущая скорость
      regrowMsOf: (crop, tabKind) => growMsOf(crop, actions.growthSpeedFor(crop, tabKind)),
      sweep: () => actions.sweep(),
    });

    // --- F1/F2 + G3: провайдеры StatBus (манифест): штраф сорняков (тег
    //     тайла) + моды улучшений (Плодородие/Чернозём/Гербициды/Теплица)
    statBus.registerProvider(makeWeedsProvider(() => this.state, table));
    statBus.registerProvider(makeUpgradesProvider(() => this.state, upgradesDefs));

    // --- F1/F4 + G2: часовые правила — подписка по манифесту (02 §4);
    //     catchUp ядра публикует те же hourTick с per-hour now (кап 72);
    //     обработчик целиком — hourly.ts (wc-распил: sweep → сорняки →
    //     каденс спринклеров через TaskRegistry)
    const hourly = makeFarmHourly({
      bus,
      statBus,
      rngBus,
      tasks,
      time,
      save,
      table,
      crops: cropById,
      upgradesDefs,
      upgrades,
      sweep: (now) => actions.sweep(now),
      getState: () => this.state,
      setState: (s) => {
        this.state = s;
      },
    });

    // --- F5: исполнители TaskRegistry — тонкие обёртки publicApi (02 §10):
    //     действия сами несут энергию/транзакции/изъятия; обёртка только
    //     перекладывает params и возвращает человекочитаемый message
    const thin = (label: string, run: (params: Record<string, unknown>) => Result<unknown>) => ({
      label,
      run: (taskCtx: TaskContext): Result<TaskResultInfo> => {
        const r = run(taskCtx.params ?? {});
        return r.ok ? { ok: true, value: { message: `${label}: ok` } } : r;
      },
    });
    const num = (v: unknown): number => Number(v);
    const str = (v: unknown): string => String(v);
    const tab = (v: unknown): string | undefined => (typeof v === 'string' && v.length > 0 ? v : undefined);
    tasks.register('farm.plow', thin('вспахать тайл фермы', (p) => actions.plow(num(p.tileIdx), tab(p.tab))));
    tasks.register('farm.plant', thin('посадить культуру', (p) => actions.plant(str(p.cropId), num(p.tileIdx), tab(p.tab))));
    tasks.register('farm.water', thin('полить тайл фермы', (p) => actions.water(num(p.tileIdx), tab(p.tab))));
    tasks.register('farm.weed', thin('прополоть тайл фермы', (p) => actions.weed(num(p.tileIdx), tab(p.tab))));
    tasks.register('farm.harvest', thin('собрать урожай', (p) => harvest.run(num(p.tileIdx), tab(p.tab))));

    this.detach = () => {
      hourly.off();
      statBus.unregisterProvider(WEEDS_PROVIDER_ID);
      statBus.unregisterProvider(UPGRADES_PROVIDER_ID);
      for (const id of ['farm.plow', 'farm.plant', 'farm.water', 'farm.weed', 'farm.harvest', 'farm.sprinkler']) {
        tasks.unregister(id);
      }
    };

    this.api = {
      'farm.state': (): FarmStateView => {
        actions.sweep();
        const now = time.now();
        return {
          now,
          tabs: this.state.tabs.map((t) => ({
            id: t.id,
            kind: t.kind,
            tiles: t.tiles.map((tile) => ({
              ...tile,
              tabId: t.id,
              watered: tile.state === 'growing' ? isWatered(tile) : false,
              wet: tile.state === 'growing' && tile.wateredUntil !== undefined && tile.wateredUntil > now,
              remainingMs: tile.state === 'growing' && tile.grownAt !== undefined ? Math.max(0, tile.grownAt - now) : null,
            })),
          })),
          upgrades: [...this.state.upgrades],
        };
      },
      'farm.plow': (tileIdx: unknown, tabId?: unknown) => actions.plow(Number(tileIdx), tabId === undefined ? undefined : String(tabId)),
      'farm.plant': (cropId: unknown, tileIdx: unknown, tabId?: unknown) =>
        actions.plant(String(cropId), Number(tileIdx), tabId === undefined ? undefined : String(tabId)),
      'farm.water': (tileIdx: unknown, tabId?: unknown) => actions.water(Number(tileIdx), tabId === undefined ? undefined : String(tabId)),
      'farm.fertilize': (tileIdx: unknown, tabId?: unknown) =>
        actions.fertilize(Number(tileIdx), tabId === undefined ? undefined : String(tabId)),
      'farm.weed': (tileIdx: unknown, tabId?: unknown) => actions.weed(Number(tileIdx), tabId === undefined ? undefined : String(tabId)),
      'farm.harvest': (tileIdx: unknown, tabId?: unknown) => harvest.run(Number(tileIdx), tabId === undefined ? undefined : String(tabId)),
      'farm.sweep': () => actions.sweep(),
      'farm.grow': (tileIdx: unknown, tabId?: unknown) => actions.grow(Number(tileIdx), tabId === undefined ? undefined : String(tabId)),
      // --- [M05.3 · G1/G3] покупки улучшений: данные + TransactionService
      'farm.upgrade': (id: unknown) => upgrades.buy(String(id)),
      'farm.upgrades': () => upgrades.view(),
    };
  }

  deactivate(): void {
    this.detach?.();
    this.detach = null;
  }

  getState(): FarmState {
    return this.state;
  }
}

export type { HarvestLine };
