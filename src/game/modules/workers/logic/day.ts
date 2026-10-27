/**
 * Дневной проход работников (M11.1, брифы F4–F7; карточка §4) — чистые
 * функции переходов. ПОРЯДОК дня (F6: расчётный день — ПОСЛЕ роллов
 * настроения/болезней):
 *   1) ролл настроения ±10 (стрим workers:mood:<defId> — «свой день у
 *      каждого», журнал П6);
 *   2) ролл болезни 2%/день (стрим workers:sick:<defId>; 1–3 дня,
 *      sickUntil абсолютна; событие worker.sick; лечение временем —
 *      [DECISION F5: лекарства M11.2 НЕ создаются]);
 *   3) расчётный день: Σ зарплат — TransactionService eventId worker.payday
 *      (кошелёк, атомарно; без денег НЕ списывать) → вовремя +2 каждому;
 *      нехватка → увольняется РОВНО ОДИН СЛУЧАЙНЫЙ (стрим
 *      workers:payday:fire; событие worker.fired {reason: payday}),
 *      остальные −15; прогноз-предупреждение за 24ч (событие
 *      worker.payday {forecast});
 *   4) «грязный объект» −5 (признаки из витрин живых систем — данные
 *      content/workers, чтение ТОЛЬКО срезов/publicApi [DECISION-архитектура]);
 *   5) увольнение по настроению: mood < 20 три дня ПОДРЯД → 10%/день
 *      (стрим workers:quit:<defId>; событие worker.fired {reason: mood}).
 *
 * worker.actionDone НЕ публикуется (домен автоматизации M11.2).
 */
import type { RngBus } from '@/kernel/bus/rng-bus/rng-bus';
import type { WorkersTable, WorkerObjectId } from '@/content/workers/table';
import type { WorkerInstance, WorkersState } from '../state';
import { isSick } from '../state';

export const DAY_MS = 86_400_000;

/** «грязный ли объект» — признаки дня (F4): из витрин живых систем */
export interface DirtyProbe {
  /** озеро №N (0-based): чистота (undefined — озера нет) */
  lakeCleanliness: Array<number | undefined>;
  /** ферма: максимальная стадия сорняков по вкладкам (id → стадия) */
  farmWeeds: Record<string, number>;
  /** загон №N (0-based): среднее счастье (null — загон пуст) */
  penHappiness: Array<number | null>;
}

export function isObjectDirty(object: WorkerObjectId, probe: DirtyProbe, table: WorkersTable): boolean {
  switch (object) {
    case 'lake':
    case 'lake2': {
      const c = probe.lakeCleanliness[object === 'lake' ? 0 : 1];
      return c !== undefined && c < table.dirty.lakeCleanlinessBelow;
    }
    case 'field':
    case 'field2': {
      const weeds = probe.farmWeeds[object] ?? 0;
      return weeds >= table.dirty.farmWeedsAtLeast;
    }
    case 'pen':
    case 'animals2': {
      const h = probe.penHappiness[object === 'pen' ? 0 : 1];
      return h !== null && h !== undefined && h < table.dirty.penHappinessBelow;
    }
  }
}

/** применить дельту настроения с клампом [0, кап] (кап — по умолчанию
 *  table.mood.max; [M11.2 · F15] Домик: moodCap 105) */
export function withMood(w: WorkerInstance, delta: number, table: WorkersTable, moodCap?: number): WorkerInstance {
  const cap = moodCap ?? table.mood.max;
  return { ...w, mood: Math.min(cap, Math.max(table.mood.min, w.mood + delta)) };
}

export interface DayPassDeps {
  rngBus: RngBus;
  table: WorkersTable;
  /** признаки «грязного объекта» из витрин живих систем (день прохода) */
  probe: DirtyProbe;
  /** кошелёк: золото (для расчётного дня) */
  gold: number;
  /** списание зарплат (TransactionService eventId worker.payday) */
  paySalaries(total: number): boolean;
  /** сценарный rng (self-checks): null — живые стримы RngBus */
  scenario?: (streamId: string) => number;
  // --- [M11.2 · F15] эффекты улучшений (ОПЦИОНАЛЬНЫ — отсутствие = базовое
  //     поведение M11.1; чеки 5–8 группы живут без них)
  /** Домик: кап настроения (по умолчанию table.mood.max) */
  moodCap?: number;
  /** Столовая/Праздник: добавка настроения каждому за день (по умолчанию 0;
  *  еда Столовой уже списана вызывающим — здесь только число) */
  extraMood?: number;
  /** Баня: эффективный sickFactor (по умолчанию table.sickness.sickFactor) */
  sickFactor?: number;
}

export interface DayPassResult {
  state: WorkersState;
  events: Array<{ name: 'worker.hired' | 'worker.fired' | 'worker.sick' | 'worker.payday'; payload: Record<string, unknown> }>;
}

/** дневной проход: см. шапку файла (порядок 1–5 ратифицирован F6) */
export function dayPass(state: WorkersState, now: number, d: DayPassDeps): DayPassResult {
  const events: DayPassResult['events'] = [];
  const roll01 = (streamId: string): number =>
    d.scenario !== undefined ? d.scenario(streamId) : d.rngBus.rollRange(0, 1, 'uniform', streamId);
  const moodCap = d.moodCap ?? d.table.mood.max;
  const extraMood = d.extraMood ?? 0;
  let hired = state.hired.map((w) => ({ ...w }));
  const mood = (w: WorkerInstance, delta: number): WorkerInstance =>
    withMood(w, delta, d.table, moodCap);

  // --- 1) ролл настроения ±10 (свой день у каждого; стрим workers:mood:<defId>)
  //     [M11.2 · F15] добавка Столовой/Праздника — ПОСЛЕ ролла, ДО расчёта
  for (const w of hired) {
    const roll = roll01(`workers:mood:${w.defId}`);
    const delta = roll < 0.5 ? -d.table.mood.rollDelta : d.table.mood.rollDelta;
    w.mood = Math.min(moodCap, Math.max(d.table.mood.min, w.mood + delta + extraMood));
  }

  // --- 2) ролл болезни 2%/день (только здоровые; 1–3 дня; событие worker.sick)
  //     [M11.2 · F15] Баня: sickFactor 0.5 (болезни реже вдвое)
  const sickChance = d.table.sickness.chance * (d.sickFactor ?? d.table.sickness.sickFactor);
  for (const w of hired) {
    if (isSick(w, now)) continue;
    const roll = roll01(`workers:sick:${w.defId}`);
    if (roll < sickChance) {
      const span = d.table.sickness.maxDays - d.table.sickness.minDays + 1;
      const days = d.table.sickness.minDays + Math.floor(roll01(`workers:sickdur:${w.defId}`) * span);
      w.sickUntil = now + Math.min(d.table.sickness.maxDays, Math.max(d.table.sickness.minDays, days)) * DAY_MS;
      events.push({ name: 'worker.sick', payload: { defId: w.defId, name: w.name, sickUntil: w.sickUntil } });
    }
  }

  // --- 3) расчётный день (F6): после роллов настроения/болезней
  let paidThisDay = 0;
  if (hired.length > 0) {
    const total = hired.reduce((s, w) => s + w.salaryPerDay, 0);
    if (d.gold >= total) {
      const paid = d.paySalaries(total);
      if (paid) {
        paidThisDay = total;
        hired = hired.map((w) => mood(w, d.table.mood.paydayOnTime));
        events.push({
          name: 'worker.payday',
          payload: { paid: true, total, workers: hired.length },
        });
      }
    } else {
      // нехватка: НЕ списывать; увольняется РОВНО ОДИН СЛУЧАЙНЫЙ (стрим
      // workers:payday:fire), остальные −15 (карточка §4)
      const roll = roll01('workers:payday:fire');
      const victimIdx = Math.floor(roll * hired.length);
      const victim = hired[victimIdx] as WorkerInstance;
      events.push({
        name: 'worker.fired',
        payload: { defId: victim.defId, name: victim.name, reason: 'payday' },
      });
      hired = hired.filter((_, i) => i !== victimIdx).map((w) => mood(w, d.table.mood.paydayDelay));
      events.push({
        name: 'worker.payday',
        payload: { paid: false, shortage: true, fired: { defId: victim.defId, name: victim.name }, total, have: d.gold },
      });
    }
  }

  // --- 4) «грязный объект» −5 (признаки из витрин живых систем)
  hired = hired.map((w) =>
    isObjectDirty(w.object, d.probe, d.table) ? mood(w, d.table.mood.dirtyObject) : w,
  );

  // --- 5) увольнение по настроению: < 20 три дня ПОДРЯД → 10%/день
  const survivors: WorkerInstance[] = [];
  for (const w of hired) {
    const low = w.mood < d.table.moodFire.moodBelow;
    const lowMoodDays = low ? (w.lowMoodDays ?? 0) + 1 : 0;
    let next: WorkerInstance = { ...w, ...(lowMoodDays > 0 ? { lowMoodDays } : {}) };
    if (lowMoodDays === 0) delete next.lowMoodDays;
    if (lowMoodDays >= d.table.moodFire.daysInRow) {
      const roll = roll01(`workers:quit:${w.defId}`);
      if (roll < d.table.moodFire.chance) {
        events.push({
          name: 'worker.fired',
          payload: { defId: w.defId, name: w.name, reason: 'mood' },
        });
        continue;
      }
    }
    survivors.push(next);
  }
  hired = survivors;

  // --- 6) прогноз-предупреждение за 24ч (F6): на утро расчёта сумма ЗП
  //     больше кошелька — событие worker.payday {forecast: нехватка};
  //     кошелёк после сегодняшнего расчёта = d.gold − уплачено сегодня
  if (hired.length > 0 && d.table.payday.forecast) {
    const nextTotal = hired.reduce((s, w) => s + w.salaryPerDay, 0);
    const walletAfter = d.gold - paidThisDay;
    if (walletAfter < nextTotal) {
      events.push({
        name: 'worker.payday',
        payload: { forecast: true, needed: nextTotal, have: walletAfter },
      });
    }
  }

  // публикация ВСЕХ событий шины — вызывающим (порядок массива = порядок возникновения)
  // [M11.2] поле upgrades (и прочие аддитивные) СОХРАНЯЕТСЯ — день меняет
  // только hired (баг state-loss найден живой пробой: Столовая переставала
  // действовать после первого дня — upgrades терялся в урезанном возврате)
  return { state: { ...state, v: 1, hired }, events };
}
