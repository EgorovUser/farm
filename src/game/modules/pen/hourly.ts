/**
 * PenHourly (M06.1 + M06.2): часовой и дневной обработчики загона — подписки
 * time.hourTick / time.dayTick по манифесту (02 §4/§8).
 *
 * hourTick: выздоровление временем (recoverPass — до продукции: выздоровевшая
 * возобновляет производство ленивым каскадом) → проход продукции (producePass
 * — тот же код, что ленивая переоценка) → рождение (tryBirth — лениво,
 * абсолютная дата dueAt) → каденс автокормушек (будильник дня; исполнение
 * ЧЕРЕЗ TaskRegistry — прецедент спринклеров; восстановление после
 * перезагрузки тем же due-проходом).
 *
 * dayTick: decay (decayPass с appetiteFactor «Тёплого загона»; больные
 * −10 health) → выздоровление → sick-ролл (pen:sick:<species>, П6) с
 * публикацией pen.animalSick { animalIdx, speciesId, dayIndex } → Симбиоз
 * (буфер навоза → Удобрение по курсу компостера — чтение ДАННЫХ M05
 * 'farm.upgrades', вызовов фермы нет; транзакция pen.compost).
 */
import type { EventBus } from '@/kernel/bus/event-bus/event-bus';
import type { RngBus } from '@/kernel/bus/rng-bus/rng-bus';
import type { TaskRegistry } from '@/kernel/services/task-registry/task-registry';
import type { TaskContext, TaskResultInfo } from '@/kernel/services/task-registry/task-registry';
import type { TransactionService } from '@/kernel/services/transaction/transaction-service';
import type { TimeService } from '@/kernel/time/time-service';
import type { SaveDirector } from '@/kernel/save/save-director';
import type { ContentRegistry } from '@/kernel/content/content-registry';
import type { Result } from '@/shared/types/result';
import type { AnimalDef } from '@/content/pen/animals';
import type { PenUpgradeDef } from '@/content/pen/upgrades';
import type { PenTable } from '@/content/balance/pen';
import type { PenState } from './state';
import { localDayIndex } from './state';
import { producePass } from './logic/produce';
import { decayPass } from './logic/decay';
import { recoverPass, sickPass } from './logic/sickness';
import { tryBirth } from './logic/breeding';
import { fertilizerFor, type ComposterRateLike } from './logic/manure';

/** payload time.hourTick / time.dayTick (ядро: живая граница и catchUp-проход) */
interface TimeTickPayload {
  now?: number;
  catchUp?: boolean;
}

export interface PenHourlyDeps {
  bus: EventBus;
  rngBus: RngBus;
  tasks: TaskRegistry;
  transaction: TransactionService;
  content: ContentRegistry;
  time: TimeService;
  save: SaveDirector;
  table: PenTable;
  animals: AnimalDef[];
  upgradesDefs: PenUpgradeDef[];
  /** слоты загона (Амбар; both pens) */
  slotsOf(pen: 1 | 2): { used: number; base: number };
  /** кормление без энергии (механизм автокормушки): транзакция 1 Корм,
   *  satiety → 100, навоз +1; false — Корм кончился */
  autofeedOne(idx: number, pen: 1 | 2, today: number): boolean;
  getState(): PenState;
  setState(s: PenState): void;
}

/** фактор «Тёплого загона» (данные улучшения; 1 — не куплен) */
export function warmFactorOf(deps: PenHourlyDeps, kind: 'sickFactor' | 'appetiteFactor'): number {
  const def = deps.upgradesDefs.find((u) => u.effect.t === 'warm');
  if (!def || def.effect.t !== 'warm') return 1;
  return (deps.getState().upgrades?.[def.id] ?? 0) >= 1 ? def.effect[kind] : 1;
}

/** регистрация исполнителя pen.autofeeder (идемпотентна): покупкой
 *  (module.onApplied) и due-проходом часовой ветки — одна точка правды */
export function registerAutofeederTask(d: PenHourlyDeps): void {
  if (d.tasks.has('pen.autofeeder')) return;
  d.tasks.register('pen.autofeeder', {
    label: 'автокормушки загона',
    run: (taskCtx: TaskContext): Result<TaskResultInfo> => {
      const now = typeof taskCtx.now === 'number' ? taskCtx.now : d.time.now();
      const today = localDayIndex(now);
      let fed = 0;
      let unfed = 0;
      for (const pen of [1, 2] as const) {
        const list = pen === 1 ? d.getState().animals : (d.getState().animals2 ?? []);
        list.forEach((a, idx) => {
          if (a.fedDay === today) return;
          unfed++;
          if (d.autofeedOne(pen === 1 ? idx : idx, pen, today)) fed++;
        });
      }
      if (fed > 0) {
        const s = d.getState();
        d.setState({ ...s, autofeedDay: today });
        d.save.markDirty();
        return { ok: true, value: { message: `автокормушки: накормлено ${fed} из ${unfed}` } };
      }
      if (unfed === 0) return { ok: true, value: { message: 'автокормушки: голодных нет' } };
      return { ok: true, value: { message: `автокормушки: Корма нет (голодных ${unfed})` } };
    },
  });
}

export function makePenHourly(deps: PenHourlyDeps): { off(): void } {
  const roll01 = (streamId: string): number => deps.rngBus.rollRange(0, 1, 'uniform', streamId);

  const onHourTick = (payload: TimeTickPayload): void => {
    const now = typeof payload?.now === 'number' ? payload.now : deps.time.now();
    // выздоровление временем — ДО продукции (ленивый каскад возобновится)
    const rec = recoverPass(deps.getState(), now, deps.table);
    if (rec.recovered.length > 0) deps.setState(rec.state);
    const r = producePass(deps.getState(), now, deps.table, deps.animals);
    // рождение (лениво: dueAt ≤ now + свободный слот)
    const birth = tryBirth(
      deps.getState(), now, deps.table, deps.animals, roll01,
      (pen) => deps.slotsOf(pen),
    );
    if (r.changed || rec.recovered.length > 0 || birth.born !== null) {
      deps.setState(birth.born !== null ? birth.state : r.state);
      deps.save.markDirty();
    }
    // --- автокормушки: будильник дня (исполнение — ЧЕРЕЗ TaskRegistry)
    const feeder = deps.upgradesDefs.find((u) => u.effect.t === 'autofeeder');
    if (feeder && (deps.getState().upgrades?.[feeder.id] ?? 0) >= 1) {
      const today = localDayIndex(now);
      if (deps.getState().autofeedDay !== today) {
        const anyUnfed =
          deps.getState().animals.some((a) => a.fedDay !== today) ||
          (deps.getState().animals2 ?? []).some((a) => a.fedDay !== today);
        if (anyUnfed) {
          registerAutofeederTask(deps);
          deps.tasks.runTask('pen.autofeeder', { now });
        }
      }
    }
  };

  const onDayTick = (payload: TimeTickPayload): void => {
    const now = typeof payload?.now === 'number' ? payload.now : deps.time.now();
    // 1) decay (сытость ×appetiteFactor «Тёплого», больные −10 health)
    const dec = decayPass(deps.getState(), deps.table, warmFactorOf(deps, 'appetiteFactor'));
    if (dec.changed) deps.setState(dec.state);
    // 2) выздоровление временем (48ч от sickAt)
    const rec = recoverPass(deps.getState(), now, deps.table);
    if (rec.recovered.length > 0) deps.setState(rec.state);
    // 3) sick-ролл (шанс = (base + уход-штрафы) × sickFactor «Тёплого»)
    const sick = sickPass(deps.getState(), now, deps.table, warmFactorOf(deps, 'sickFactor'), roll01);
    if (sick.sickened.length > 0) {
      deps.setState(sick.state);
      for (const c of sick.sickened) {
        deps.bus.publish('pen.animalSick', { animalIdx: c.animalIdx, speciesId: c.speciesId, dayIndex: c.dayIndex });
      }
    }
    if (dec.changed || rec.recovered.length > 0 || sick.sickened.length > 0) deps.save.markDirty();
    // 4) «Симбиоз»: буфер навоза → Удобрение по живому курсу компостера M05
    const symb = deps.upgradesDefs.find((u) => u.effect.t === 'symbiosis');
    if (symb && (deps.getState().upgrades?.[symb.id] ?? 0) >= 1) {
      const manure = deps.getState().manure ?? 0;
      if (manure > 0) {
        // чтение ДАННЫХ M05 (реестр; без импорта типов фермы — структурная форма)
        const farmUpgrades = deps.content.get<Array<{ effect: { t: string } }>>('farm.upgrades') ?? [];
        const composter = farmUpgrades.find((u) => u.effect.t === 'composter') as
          | { effect: { t: 'composter' } & ComposterRateLike }
          | undefined;
        const rate = composter?.effect;
        const { fertilizer, leftoverManure, currency } = fertilizerFor(manure, rate);
        if (fertilizer > 0) {
          const tx = deps.transaction.transact({
            grants: [{ t: 'currency', id: currency as 'fertilizer', qty: fertilizer }],
            eventId: 'pen.compost',
            reason: `симбиоз: навоз ${manure - leftoverManure} → удобрение ${fertilizer} (курс компостера)`,
          });
          if (tx.ok) {
            const s = deps.getState();
            const next: PenState = { ...s, ...(leftoverManure > 0 ? { manure: leftoverManure } : {}) };
            if (leftoverManure <= 0) delete next.manure;
            deps.setState(next);
            deps.save.markDirty();
          }
        }
      }
    }
  };

  const offHour = deps.bus.subscribe('time.hourTick', onHourTick as (p: unknown) => void);
  const offDay = deps.bus.subscribe('time.dayTick', onDayTick as (p: unknown) => void);
  return { off: () => { offHour(); offDay(); } };
}
