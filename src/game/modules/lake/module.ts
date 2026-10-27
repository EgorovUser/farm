/**
 * LakeModule (M08.1 + M08.2) — каркас и монтаж (карточка M08, брифы §3.2/§2.2).
 *
 * Изоляция (01 §5–§7): модуль не импортирует другие модули; рыба читается
 * из общих таблиц контента (ContentRegistry: 'fishing.fish'/'fishing.river'
 * — П4 п.6); энергия/инвентарь — колбэки app-слоя через ModuleRegistry
 * (паттерн pen/fishing — прецеденты D33/D38/C4). Корм, золото, лекарство —
 * ТОЛЬКО TransactionService.
 *
 * [M08.2 · F14] sweep — по ВСЕМ озёрам (завершение пар → рождение икры →
 * формирование новых пар); [F11] бонус Инкубатора — резолв
 * lake.mutation.plus1Bonus с контекстным тегом lake:N (провайдер
 * lake.upgrades пер-озёрный); [F13] форс Лаборатории — опция прохода.
 * Уход/витрина/покупки/исполнители — на АКТИВНОЕ озеро (care/upgrades).
 *
 * [M08.2 · F16] манифест ОДИН bump 1.0.0 → 1.1.0: publicApi ×12 (+ upgrade/
 * switch/research), modifierProviders ['lake.upgrades'], taskExecutors ×4
 * (тонкие обёртки; worker.actionDone НЕ публикуется — домен M11).
 */
import type { GameModule, ModuleContext } from '@/game/module-registry';
import type { StatId, ID, QualityTier } from '@/shared/types/ids';
import type { Result } from '@/shared/types/result';
import { err } from '@/shared/types/result';
import type { LakeTable } from '@/content/balance/lake';
import type { FishDef } from '@/content/fishing/fish';
import type { LakeUpgradeDef } from '@/content/lake/upgrades';
import { createLakeManifest } from './manifest';
import { defaultLakeState, lakeSaveSlice, canonicalSlot, type LakeGroup, type LakeState } from './state';
import { activeLakeOf, groupOf, lakeIndices, withGroup } from './state';
import { birthRoePass, completePairsPass, formPairsPass } from './logic/breeding';
import { makeLakeUpgradesProvider, LAKE_UPGRADES_PROVIDER_ID, lakeTagOf } from './logic/upgrades-provider';
import { makeLakeHourly } from './hourly';
import { LakeCare, type InventoryEntryLike } from './care';
import { LakeDev } from './dev';
import { LakeUpgrades } from './upgrades';
import { buildLakeStateView, type LakeStateView } from './view';

export interface LakeModuleDeps {
  withEnergy(stat: StatId, action: () => Result<unknown>, reason?: string): Result<unknown>;
  listInventory(): InventoryEntryLike[];
  removeItem(defId: ID, qty: number, source: string): Result<unknown>;
  deliverFish(defId: ID, tier: QualityTier, value: number, qty: number, source: string): Result<unknown>;
  probeCapacity(defId: ID, qty: number): Result<{ fits: boolean; free: number; newEntries: number }>;
}

/** дополнить слоты группы до её вместимости (лениво; «Глубоководье» +N) */
function ensureGroupCapacity(g: LakeGroup, table: LakeTable, upgradesDefs: LakeUpgradeDef[]): LakeGroup {
  const deep = upgradesDefs.find((u) => u.effect.t === 'deepWater');
  const plus =
    deep && deep.effect.t === 'deepWater' && (g.upgrades ?? []).includes(deep.id) ? deep.effect.addSlots : 0;
  const capacity = table.slots.base + plus;
  if (g.slots.length >= capacity) return g;
  const slots = [...g.slots];
  while (slots.length < capacity) slots.push(canonicalSlot({ sick: false }));
  return { ...g, slots };
}

export class LakeModule implements GameModule {
  readonly manifest = createLakeManifest();
  api: Record<string, (...args: unknown[]) => unknown> = {};
  private state: LakeState = defaultLakeState();
  private readonly moduleDeps: LakeModuleDeps;
  private detach: (() => void) | null = null;

  constructor(deps: LakeModuleDeps) {
    this.moduleDeps = deps;
  }

  activate(ctx: ModuleContext): void {
    const { save, content, time, transaction, bus, rngBus, statBus, tasks } = ctx;
    const table = content.get<LakeTable>('lake');
    const pond = content.get<FishDef[]>('fishing.fish') ?? [];
    const river = content.get<FishDef[]>('fishing.river') ?? [];
    const upgradesDefs = content.get<LakeUpgradeDef[]>('lake.upgrades') ?? [];
    const fishOf = (fishId: ID): FishDef | undefined =>
      pond.find((f) => f.id === fishId) ?? river.find((f) => f.id === fishId);
    const roll01 = (streamId: string): number => rngBus.rollRange(0, 1, 'uniform', streamId);

    save.registerSlice(
      'lake',
      lakeSaveSlice(
        () => this.state,
        (s) => {
          this.state = s;
        },
      ),
    );

    /** [F11] бонус Инкубатора озера №N — через шину (тег lake:N; кап —
     *  cap-мод провайдера по данным plusBonusCap) */
    const incubatorBonusOf = (idx: number): number =>
      statBus.resolve({
        stat: 'lake.mutation.plus1Bonus',
        ctx: { ...time.ctx('player'), tags: [lakeTagOf(idx)] },
      });

    /** ленивая переоценка ПО ВСЕМ озёрам [F14]: завершение пар (ролл
     *  мутации: [F13] ремап Лаборатории / [F11] окна с бонусом; событие
     *  lake.bred) → рождение готовой икры → формирование новых пар */
    const sweep = (now?: number): void => {
      const at = now ?? time.now();
      let whole = this.state;
      let changed = false;
      for (const idx of lakeIndices(whole)) {
        let g = ensureGroupCapacity(groupOf(whole, idx), table, upgradesDefs);
        const done = completePairsPass(g, at, table, roll01, {
          plus1BonusX: incubatorBonusOf(idx),
          research: g.research,
        });
        if (done.bred.length > 0) {
          g = done.state;
          for (const b of done.bred) {
            bus.publish('lake.bred', { fishId: b.fishId, childTier: b.childTier, parents: b.parents });
          }
        }
        const birth = birthRoePass(g, at);
        if (birth.born.length > 0) g = birth.state;
        const formed = formPairsPass(g, { now: at, table, fishOf });
        if (formed.formed.length > 0) g = formed.state;
        if (g !== groupOf(whole, idx)) {
          whole = withGroup(whole, idx, g);
          changed = true;
        }
      }
      if (changed) {
        this.state = whole;
        save.markDirty();
      }
    };

    const care = new LakeCare({
      bus,
      transaction,
      time,
      save,
      content,
      table,
      getState: () => this.state,
      setState: (s) => {
        this.state = s;
      },
      withEnergy: (stat, action, reason) => this.moduleDeps.withEnergy(stat, action, reason),
      listInventory: () => this.moduleDeps.listInventory(),
      removeItem: (defId, qty, source) => this.moduleDeps.removeItem(defId, qty, source),
      deliverFish: (defId, tier, value, qty, source) =>
        this.moduleDeps.deliverFish(defId, tier, value, qty, source),
      probeCapacity: (defId, qty) => this.moduleDeps.probeCapacity(defId, qty),
      fishOf,
      sweep,
    });

    // dev-форсы живых проб (карточка §6; расщепление care.ts по 01 §6);
    // [M11 · OBS-2 AUDIT-M08] incubatorBonusOf — те же окна, что живой sweep
    const dev = new LakeDev({
      bus,
      rngBus,
      time,
      save,
      table,
      getState: () => this.state,
      setState: (s) => {
        this.state = s;
      },
      fishOf,
      incubatorBonusOf,
      sweep,
    });

    // улучшения/лаборатория/второе озеро (F10/F13/F14);
    // [M11 · lake:research] rngBus — ролл-маркер применения Лаборатории
    const upgrades = new LakeUpgrades({
      transaction,
      rngBus,
      time,
      save,
      table,
      upgradesDefs,
      getState: () => this.state,
      setState: (s) => {
        this.state = s;
      },
      sweep,
    });

    const hourly = makeLakeHourly({
      bus,
      rngBus,
      time,
      save,
      table,
      upgradesDefs,
      transaction,
      fishOf,
      getState: () => this.state,
      setState: (s) => {
        this.state = s;
      },
      sweep,
    });

    // [F16] провайдер модов улучшений (Инкубатор + кап; пер-озёрные теги)
    statBus.registerProvider(makeLakeUpgradesProvider(() => this.state, upgradesDefs, table));

    // --- [F16] исполнители TaskRegistry — тонкие обёртки publicApi (02 §10);
    //     worker.actionDone НЕ публикуется — домен M11 (запрет-прецедент)
    const thin = (label: string, run: () => Result<unknown>) => ({
      label,
      run: (): Result<{ message: string }> => {
        const r = run();
        return r.ok ? { ok: true, value: { message: `${label}: ok` } } : r;
      },
    });
    tasks.register('lake.feed', thin('накормить рыб озера', () => care.feed()));
    tasks.register('lake.clean', thin('почистить озеро «Сачком»', () => care.clean()));
    tasks.register('lake.treat', thin('вылечить больную рыбу озера', () => {
      const idx = upgrades.firstSickSlot();
      return idx >= 0 ? care.treat(idx) : err('больных рыб нет (lake.state — витрина)');
    }));
    tasks.register('lake.harvest', thin('собрать взрослую рыбу озера', () => {
      const idx = upgrades.firstHarvestSlot();
      return idx >= 0 ? care.harvest(idx) : err('рыб в озере нет (lake.state — витрина)');
    }));

    this.detach = () => {
      hourly.off();
      statBus.unregisterProvider(LAKE_UPGRADES_PROVIDER_ID);
      for (const id of ['lake.feed', 'lake.clean', 'lake.treat', 'lake.harvest']) {
        if (tasks.has(id)) tasks.unregister(id);
      }
    };

    this.api = {
      'lake.state': (): LakeStateView => {
        sweep();
        return buildLakeStateView(this.state, time.now(), table, fishOf, content, upgradesDefs, upgrades);
      },
      'lake.release': (iid: unknown) => care.release(String(iid)),
      'lake.feed': () => care.feed(),
      'lake.treat': (slotIdx: unknown) => care.treat(Number(slotIdx)),
      'lake.clean': () => care.clean(),
      'lake.harvest': (slotIdx: unknown) => care.harvest(Number(slotIdx)),
      'lake.buy': (what: unknown, qty?: unknown) => {
        if (what !== 'feed') {
          return err(`озеро продаёт только Корм: lake.buy feed [qty] (получено: ${String(what)})`);
        }
        return care.buyFeed(qty === undefined ? 1 : Number(qty));
      },
      // --- [M08.2 · F10] покупка/витрина улучшений активного озера
      'lake.upgrade': (id?: unknown) =>
        id === undefined ? upgrades.upgradesView() : upgrades.upgrade(String(id)),
      // --- [M08.2 · F14] переключение активного озера
      'lake.switch': (idx: unknown) => upgrades.switchTo(Number(idx)),
      // --- [M08.2 · F13] Лаборатория: направить мутацию
      'lake.research': (mode: unknown) =>
        mode === 'plus1' || mode === 'plus2'
          ? upgrades.research(mode)
          : err('lake.research <plus1|plus2> — режим мутации (нужна «Лаборатория»)'),
      // --- dev: форс-пара (карточка §6; условия НЕ проверяются — это форс)
      'lake.pair': (slotA: unknown, slotB: unknown) => dev.pair(Number(slotA), Number(slotB)),
      // --- dev: форс болезни/икры/сброс кулдауна Лаборатории
      'lake.force': (what: unknown, a: unknown, b?: unknown) => {
        if (what === 'sick') return dev.sick(Number(a));
        if (what === 'roe') return dev.roe(Number(a), Number(b));
        if (what === 'research') return upgrades.devResetResearch();
        return err('lake.force sick <slot> | roe <slotA> <slotB> | research 0');
      },
    };
  }

  deactivate(): void {
    this.detach?.();
    this.detach = null;
  }

  getState(): LakeState {
    return this.state;
  }
}

export type { LakeStateView };
