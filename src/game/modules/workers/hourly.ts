/**
 * WorkersHourly (M11.2, бриф F10–F13): часовой обработчик — подписка
 * time.hourTick по манифесту (прецедент lake/hourly.ts M08).
 *
 * На КАЖДОЙ часовой границе: работники с погашенным периодом
 * (checkPeriodHours 2|4|6ч от фазы hiredAt — logic/tick.isTickHour)
 * проходят тик:
 *   1) Праздничный день (куплен + календарь) → тик НЕ выполняется
 *      (actionDone-тишина, карточка §5);
 *   2) шанс успеха f(звёзды/уход/инструмент/настроение) — стрим
 *      workers:tick:<defId>; провал → тихо, БЕЗ последствий;
 *   3) WorkersDirector: план задач назначенной системы (данными) →
 *      перебор до первого ok через TaskRegistry (02 §10); вызов —
 *      энергетически нейтральной обёрткой ([DECISION-энергии]:
 *      резерв → вызов → восстановление; «механизм, не труд игрока»);
 *   4) lastAction в срез (в т.ч. оффлайн — витрина F13);
 *   5) worker.actionDone {defId, system, action, object, success}
 *      публикует ОБЁРТКА ПОСЛЕ runTask [DECISION-архитектура] —
 *      ТОЛЬКО для онлайн-тиков ([DECISION-catchUp F13]: оффлайн-границы
 *      выполняют эффекты без ленты; кап 72ч — канон 02 §8 ядра).
 */
import type { EventBus } from '@/kernel/bus/event-bus/event-bus';
import type { RngBus } from '@/kernel/bus/rng-bus/rng-bus';
import type { TaskRegistry } from '@/kernel/services/task-registry/task-registry';
import type { TimeService } from '@/kernel/time/time-service';
import type { SaveDirector } from '@/kernel/save/save-director';
import type { Result } from '@/shared/types/result';
import type { WorkersTable } from '@/content/workers/table';
import type { WorkersState, WorkerInstance } from './state';
import { isSick } from './state';
import { isTickHour, successChanceOf, rollTickSuccess, type ChanceOpts } from './logic/tick';
import { directorPlan, systemOfObject, type DirectorStep } from './logic/director';
import type { SystemViews } from './hire';
import type { WorkersUpgrades } from './upgrades';

interface TimeTickPayload {
  now?: number;
  catchUp?: boolean;
}

export interface WorkersHourlyDeps {
  bus: EventBus;
  rngBus: RngBus;
  tasks: TaskRegistry;
  time: TimeService;
  save: SaveDirector;
  table: WorkersTable;
  views: SystemViews;
  upgrades: WorkersUpgrades;
  /** энергетически нейтральный вызов исполнителя ([DECISION-энергий]) */
  withWorkerEnergy(run: () => Result<unknown>): Result<unknown>;
  getState(): WorkersState;
  setState(s: WorkersState): void;
}

export function makeWorkersHourly(d: WorkersHourlyDeps): { off(): void; tickForce(w: WorkerInstance, now?: number): void } {
  /** один тик работника (см. шапку файла) */
  const runWorkerTick = (w: WorkerInstance, now: number, online: boolean): void => {
    // [F15] Праздничный день: тики НЕ выполняются (actionDone-тишина)
    if (d.upgrades.isHolidayActive(now)) return;
    const chanceOpts: ChanceOpts = {
      sick: isSick(w, now),
      // [F11 · DECISION] инструмент — ШТРАФ (не отказ): требование профиля
      // не закрыто Шкафом → toolPenaltyFactor; Шкаф (F15) закрывает
      toolMissing: w.toolRequirement !== undefined && !d.upgrades.toolRequirementClosed(),
    };
    const chance = successChanceOf(w, d.table, chanceOpts);
    if (!rollTickSuccess(d.rngBus, w, chance)) return; // провал — БЕЗ последствий
    const system = systemOfObject(w.object);
    const steps: DirectorStep[] = directorPlan(w, d.table, d.views);
    let last: { taskId: string; ok: boolean } | null = null;
    for (const step of steps) {
      const r = d.withWorkerEnergy(() =>
        d.tasks.runTask(step.taskId, { now, workerId: w.defId, params: step.params }),
      );
      last = { taskId: step.taskId, ok: r.ok };
      if (r.ok) break; // «свободный исполнитель» 02 §10: первый ok — готово
    }
    if (last === null) return; // нечего делать — тихий пропуск (без actionDone)
    // витрина lastAction (в т.ч. catchUp — F13); аддитивные поля сохраняются
    const state = d.getState();
    d.setState({
      ...state,
      hired: state.hired.map((x) =>
        x.defId === w.defId ? { ...x, lastAction: { at: now, taskId: last.taskId, success: last.ok } } : x,
      ),
    });
    d.save.markDirty();
    // [F12] actionDone публикует ОБЁРТКА ПОСЛЕ runTask — только онлайн-тики
    if (online) {
      d.bus.publish('worker.actionDone', {
        defId: w.defId,
        system,
        action: last.taskId,
        object: w.object,
        success: last.ok,
      });
    }
  };

  const onHourTick = (payload: TimeTickPayload): void => {
    const now = typeof payload?.now === 'number' ? payload.now : d.time.now();
    // [F13] catchUp: эффекты вызовов есть, ленты actionDone нет
    const online = payload?.catchUp !== true;
    for (const w of d.getState().hired) {
      if (isTickHour(w, now)) runWorkerTick(w, now, online);
    }
  };

  const off = d.bus.subscribe('time.hourTick', onHourTick as (p: unknown) => void);
  return {
    off,
    /** dev (F17): тик вне расписания — для живых проб (workers tick force) */
    tickForce: (w: WorkerInstance, now?: number): void => runWorkerTick(w, now ?? d.time.now(), true),
  };
}
