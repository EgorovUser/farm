/**
 * worker.tick (M11.2, бриф F10–F11; карточка M11 §3) — чистые функции.
 *
 * Тик по checkPeriodHours 2|4|6ч — границы hourTick ОТ ФАЗЫ hiredAt
 * («у каждого свой ритм»): часовая граница H = floor(now/1ч); работник
 * тикает, если H > H(найма) и (H − H(найма)) кратно периоду. Перезапуск
 * НЕ сдвигает ритм (фаза — абсолютная дата найма в срезе).
 *
 * ШАНС УСПЕХА (F11) — f(звёзды, уход, инструмент, настроение) ДАННЫМИ
 * (WORKERS_TABLE.success): chance = (base[звёзды] + (уход−3)×step) ×
 * moodFactor × (больной? sickEfficiency : 1) × (инструмент требован и
 * не закрыт Шкафом? toolPenaltyFactor : 1), клэмп [0, 1]. Провал ролла —
 * действие НЕ выполнено, БЕЗ последствий (вызов исполнителя не происходит).
 * Ролл — именованный стрим workers:tick:<defId> (шанс/успех наблюдаемы,
 * П6; прецедент lake:breed).
 *
 * ПРАЗДНИК (F15): в праздничный день тики НЕ выполняются (actionDone-тишина)
 * — проверка isHolidayDay ДО ролла (данные holiday; календарь от
 * абсолютного локального дня — тот же канон, что и границы dayTick).
 */
import type { RngBus } from '@/kernel/bus/rng-bus/rng-bus';
import type { WorkersTable } from '@/content/workers/table';
import type { WorkerInstance } from '../state';
import { isSick } from '../state';

export const TICK_HOUR_MS = 3_600_000;
export const TICK_DAY_MS = 86_400_000;

/** индекс часовой границы (глобальный, от epoch) */
export function hourIndexOf(now: number): number {
  return Math.floor(now / TICK_HOUR_MS);
}

/** тик ли работника на часовой границе now (фаза — hiredAt; свой ритм) */
export function isTickHour(w: WorkerInstance, now: number): boolean {
  const h = hourIndexOf(now);
  const h0 = hourIndexOf(w.hiredAt);
  return h > h0 && (h - h0) % w.checkPeriodHours === 0;
}

export interface ChanceOpts {
  /** больной сейчас (ленивая дата — вызывающий) */
  sick: boolean;
  /** требование инструмента не закрыто Шкафом (F15) и не выполнено */
  toolMissing: boolean;
}

/** [F11] шанс успеха действия — чистая функция данных (клэмп [0, 1]) */
export function successChanceOf(w: WorkerInstance, table: WorkersTable, opts: ChanceOpts): number {
  const s = table.success;
  const base = (s.baseByStars[w.stars] ?? 0) + (w.care - 3) * s.careStep;
  const moodFactor = s.moodFactorMin + (w.mood / 100) * s.moodFactorSpan;
  let chance = base * moodFactor;
  if (opts.sick) chance *= s.sickEfficiency;
  if (opts.toolMissing) chance *= s.toolPenaltyFactor;
  return Math.min(1, Math.max(0, chance));
}

/** ролл успеха тика — именованный стрим workers:tick:<defId> (журнал П6) */
export function rollTickSuccess(rngBus: RngBus, w: WorkerInstance, chance: number): boolean {
  const roll = rngBus.rollRange(0, 1, 'uniform', `workers:tick:${w.defId}`);
  return roll < chance;
}

/** [F15] абсолютный локальный день (канон границ dayTick time-service:
 *  полночь по локальному календарю игрока → Date.UTC(y, m, d)/день) */
export function calendarDayOf(now: number): number {
  const d = new Date(now);
  return Math.floor(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()) / TICK_DAY_MS);
}

/** праздничный ли день (данные holiday; действует при купленном улучшении —
 *  владение проверяет вызывающий) */
export function isHolidayDay(now: number, table: WorkersTable): boolean {
  const h = table.holiday;
  return calendarDayOf(now) % h.everyDays === h.remainder;
}

/** больной ли работник сейчас (удобный пере-экспорт для тика) */
export function tickSickOf(w: WorkerInstance, now: number): boolean {
  return isSick(w, now);
}
