/**
 * PenModule (M06.1 + M06.2) — каркас и монтаж (карточка M06, брифы §3.2+M06.2).
 *
 * Изоляция (01 §5–§7): модуль не импортирует другие модули; контент — чтение
 * общих реестров (П4 п.6; ДАННЫЕ M05 'farm.upgrades' — чтение через
 * ContentRegistry для курса компостера, вызовов фермы НЕТ); энергия и выдача
 * продукции — колбэки app-слоя через ModuleRegistry (паттерн farm):
 *   withEnergy → player.withEnergy; deliverProduct → inventory.add;
 *   probeCapacity → inventory.canAcquire (канон D23). Корм, золото, лекарство,
 *   навоз — ТОЛЬКО TransactionService.
 *
 * Механика: покупки/уход — PenActions; болезни/улучшения/разведение/продажа/
 * навоз — PenHusbandry; сбор — PenCollect; логика — чистые функции logic/;
 * часовые/дневные правила — hourly.ts (подписки по манифесту); ленивая
 * переоценка (recover → produce → birth) — sweep на каждом обращении.
 *
 * [F4] гейт Свиньи — ачивка «Грибник»: gateExtras += quests.gateExtras
 * (N10-прецедент — ленивый колбэк, порядок активации не важен).
 */
import type { GameModule, ModuleContext } from '@/game/module-registry';
import type { StatId, ID, QualityTier } from '@/shared/types/ids';
import type { Result } from '@/shared/types/result';
import type { AnimalDef } from '@/content/pen/animals';
import type { PenUpgradeDef } from '@/content/pen/upgrades';
import type { PenTable } from '@/content/balance/pen';
import { createPenManifest } from './manifest';
import { defaultPenState, penSaveSlice, type PenState } from './state';
import { penGateCtx } from './logic/gates';
import { producePass, forceProduce } from './logic/produce';
import { recoverPass } from './logic/sickness';
import { tryBirth } from './logic/breeding';
import { makePenUpgradesProvider, PEN_UPGRADES_PROVIDER_ID } from './logic/upgrades-provider';
import { makePenHourly, registerAutofeederTask } from './hourly';
import { PenActions, type BuyReceipt } from './actions';
import { PenHusbandry } from './husbandry';
import { PenCollect, type CollectLine } from './collect';
import { buildPenStateView, type PenStateView } from './view';

export interface PenModuleDeps {
  gateExtras(): Record<string, unknown>;
  withEnergy(stat: StatId, action: () => Result<unknown>, reason?: string): Result<unknown>;
  deliverProduct(defId: ID, tier: QualityTier, value: number, qty: number, source: string): Result<unknown>;
  probeCapacity(defId: ID, qty: number): Result<{ fits: boolean; free: number; newEntries: number }>;
}

const penNum = (v: unknown): 1 | 2 => (v === 2 || v === '2' ? 2 : 1);

export class PenModule implements GameModule {
  readonly manifest = createPenManifest();
  api: Record<string, (...args: unknown[]) => unknown> = {};
  private state: PenState = defaultPenState();
  private readonly moduleDeps: PenModuleDeps;
  private detach: (() => void) | null = null;

  constructor(deps: PenModuleDeps) {
    this.moduleDeps = deps;
  }

  activate(ctx: ModuleContext): void {
    const { save, content, time, statBus, tasks, transaction, bus, rngBus } = ctx;
    const table = content.get<PenTable>('pen');
    const animals = content.get<AnimalDef[]>('pen.animals');
    const upgradesDefs = content.get<PenUpgradeDef[]>('pen.upgrades');

    save.registerSlice(
      'pen',
      penSaveSlice(
        () => this.state,
        (s) => {
          this.state = s;
        },
      ),
    );

    statBus.registerProvider(makePenUpgradesProvider(() => this.state, upgradesDefs));

    const actions = new PenActions({
      bus: ctx.bus,
      rngBus: ctx.rngBus,
      statBus: ctx.statBus,
      transaction: ctx.transaction,
      time: ctx.time,
      save,
      table,
      animals,
      upgradesDefs,
      getState: () => this.state,
      setState: (s) => {
        this.state = s;
      },
      gateCtx: () =>
        penGateCtx({ statBus: ctx.statBus, time, gateExtras: () => this.moduleDeps.gateExtras(), table }),
      withEnergy: (stat, action, reason) => this.moduleDeps.withEnergy(stat, action, reason),
    });

    const husbandry = new PenHusbandry({
      transaction,
      time: ctx.time,
      save,
      table,
      animals,
      upgradesDefs,
      actions,
      getState: () => this.state,
      setState: (s) => {
        this.state = s;
      },
      probeCapacity: (defId, qty) => this.moduleDeps.probeCapacity(defId, qty),
    });

    /** ленивая переоценка (абсолютные даты — 02 §8 (1)): выздоровление →
     *  продукция → рождение (выздоровевшая возобновляет производство) */
    const sweep = (): void => {
      const now = time.now();
      const rec = recoverPass(this.state, now, table);
      if (rec.recovered.length > 0) this.state = rec.state;
      const r = producePass(this.state, now, table, animals);
      const birth = tryBirth(this.state, now, table, animals, (id) => rngBus.rollRange(0, 1, 'uniform', id), (pen) => actions.slots(pen));
      if (r.changed || rec.recovered.length > 0 || birth.born !== null) {
        this.state = birth.born !== null ? birth.state : r.state;
        save.markDirty();
      }
    };

    const collect = new PenCollect({
      bus: ctx.bus,
      rngBus: ctx.rngBus,
      time: ctx.time,
      save,
      table,
      animals,
      list: (pen) => actions.list(pen),
      getState: () => this.state,
      setState: (s) => {
        this.state = s;
      },
      withEnergy: (stat, action, reason) => this.moduleDeps.withEnergy(stat, action, reason),
      deliverProduct: (defId, tier, value, qty, source) =>
        this.moduleDeps.deliverProduct(defId, tier, value, qty, source),
      probeCapacity: (defId, qty) => this.moduleDeps.probeCapacity(defId, qty),
      sweep,
    });

    const hourlyDeps = {
      bus: ctx.bus,
      rngBus: ctx.rngBus,
      tasks,
      transaction,
      content,
      time: ctx.time,
      save,
      table,
      animals,
      upgradesDefs,
      slotsOf: (pen: 1 | 2) => actions.slots(pen),
      autofeedOne: (idx: number, pen: 1 | 2, today: number) => actions.feedByMachine(idx, pen, today),
      getState: () => this.state,
      setState: (s: PenState) => {
        this.state = s;
      },
    };
    const hourly = makePenHourly(hourlyDeps);

    // --- F6: исполнители TaskRegistry — тонкие обёртки publicApi (02 §10):
    //     действия сами несут энергию/транзакции; обёртка перекладывает params.
    //     worker.actionDone НЕ публикуется — домен M11 (запрет-прецедент)
    const thin = (label: string, run: (params: Record<string, unknown>) => Result<unknown>) => ({
      label,
      run: (taskCtx: { params?: Record<string, unknown> }): Result<{ message: string }> => {
        const r = run(taskCtx.params ?? {});
        return r.ok ? { ok: true, value: { message: `${label}: ok` } } : r;
      },
    });
    const num = (v: unknown): number => Number(v);
    const str = (v: unknown): string => String(v);
    tasks.register('pen.feed', thin('накормить животное загона', (p) => actions.feed(num(p.idx), penNum(p.pen))));
    tasks.register('pen.clean', thin('почистить животное загона', (p) => actions.clean(num(p.idx), penNum(p.pen))));
    tasks.register('pen.collect', thin('собрать продукцию загона', (p) => collect.run(p.species === undefined ? 'all' : str(p.species), penNum(p.pen))));
    tasks.register('pen.pet', thin('погладить животное загона', (p) => actions.pet(num(p.idx), penNum(p.pen))));

    this.detach = () => {
      hourly.off();
      statBus.unregisterProvider(PEN_UPGRADES_PROVIDER_ID);
      for (const id of ['pen.feed', 'pen.clean', 'pen.collect', 'pen.pet', 'pen.autofeeder']) {
        if (tasks.has(id)) tasks.unregister(id);
      }
    };

    this.api = {
      'pen.state': (): PenStateView => {
        sweep();
        return buildPenStateView({
          statBus, time, table, animals, upgradesDefs,
          slotsOf: (pen) => actions.slots(pen),
          pen2Ready: () => actions.pen2Ready(),
          getState: () => this.state,
        });
      },
      'pen.buy': (species: unknown, pen?: unknown) => actions.buy(String(species), penNum(pen)),
      'pen.feed': (idx: unknown, pen?: unknown) => actions.feed(Number(idx), penNum(pen)),
      'pen.clean': (idx: unknown, pen?: unknown) => actions.clean(Number(idx), penNum(pen)),
      'pen.pet': (idx: unknown, pen?: unknown) => actions.pet(Number(idx), penNum(pen)),
      'pen.collect': (species?: unknown, pen?: unknown) =>
        collect.run(species === undefined ? 'all' : String(species), penNum(pen)),
      'pen.heal': (idx: unknown, pen?: unknown) => husbandry.heal(Number(idx), penNum(pen)),
      'pen.breed': (idx1: unknown, idx2: unknown, pen?: unknown) =>
        husbandry.breed(Number(idx1), Number(idx2), penNum(pen)),
      'pen.sell': (idx: unknown, pen?: unknown) => husbandry.sell(Number(idx), penNum(pen)),
      'pen.upgrade': (id: unknown) => {
        const r = husbandry.upgrade(String(id));
        // покупка «Автокормушек» регистрирует исполнителя сразу (F3);
        // после перезагрузки — due-проход часовой ветки (прецедент спринклеров)
        if (r.ok && r.value.id === 'upg_autofeeder') registerAutofeederTask(hourlyDeps);
        return r;
      },
      'pen.upgrades': () => husbandry.upgradesView(),
      'pen.manure': () => husbandry.manureView(),
      'pen.manure.take': (qty?: unknown) =>
        husbandry.manureTake(qty === undefined ? undefined : Number(qty)),
      'pen.animals': () => actions.view(),
      // --- dev: форс продукции (nextProduceAt = now; produceNeeds честен)
      'pen.produce': (species?: unknown) => {
        const target = species === undefined ? 'all' : String(species);
        this.state = forceProduce(this.state, time.now(), target as ID | 'all');
        save.markDirty();
        return { forced: target };
      },
      // --- dev: форс болезни (заявлен SESSION-M06 §3.8) — тот же переход,
      //     что ролл: health → 40, sickAt = now, событие публикуется
      'pen.sick': (idx?: unknown, pen?: unknown) => {
        const r = husbandry.devSick(Number(idx), penNum(pen));
        if (r.ok) {
          bus.publish('pen.animalSick', {
            animalIdx: r.value.idx,
            speciesId: actions.list(penNum(pen))[r.value.idx]!.speciesId,
            dayIndex: r.value.dayIndex,
          });
        }
        return r;
      },
    };
  }

  deactivate(): void {
    this.detach?.();
    this.detach = null;
  }

  getState(): PenState {
    return this.state;
  }
}

export type { BuyReceipt, CollectLine, PenStateView };
