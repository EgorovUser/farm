/**
 * Роллы M15 (карточка §3): daily 3 шт в 00:00, weekly 3 шт на границе недели.
 * ЧИСТЫЕ функции от (saveId, ключ периода, пул) — детерминизм как ротация M04
 * (shop/rotation.ts: свежий mulberry32 от dailySeed-хэша с пространством имён,
 * НЕ общий стрим RngBus — повторный вывод тем же днём байт-в-байт).
 *
 * Неделя — ISO-ключ «YYYY-Www» (понедельник): смена ключа = реролл недели;
 * граница года входит в ключ ISO-годом (последние дни декабря принадлежат
 * неделе января следующего года и наоборот — канон ISO 8601).
 */
import { dailySeed, hashString, mulberry32 } from '@/shared/utils/rng';
import type { QuestDef } from '@/content/quests/types';

/** ролл `count` различных шаблонов из пула (пул меньше — сколько есть, П5) */
export function rollQuestIds(
  saveId: string,
  periodKey: string,
  pool: readonly QuestDef[],
  count: number,
  namespace: string,
): string[] {
  const candidates = pool.map((q) => q.id);
  const n = Math.min(Math.max(1, count), candidates.length);
  const rng = mulberry32(hashString(`${dailySeed(saveId, periodKey)}:${namespace}`));
  const picked: string[] = [];
  while (picked.length < n && candidates.length > 0) {
    const idx = Math.floor(rng() * candidates.length);
    picked.push(candidates.splice(idx, 1)[0] as string);
  }
  return picked;
}

/** ISO-неделя даты: { year, week }; неделя начинается с понедельника,
 *  первой считается неделя с 4 января (канон ISO 8601) */
export function isoWeekOf(dateISO: string): { year: number; week: number } {
  const [y, m, d] = dateISO.split('-').map(Number);
  const date = new Date(y, (m ?? 1) - 1, d ?? 1);
  const dayNum = (date.getDay() + 6) % 7; // Пн=0
  const thursday = new Date(date);
  thursday.setDate(date.getDate() - dayNum + 3); // четверг ISO-недели
  const isoYear = thursday.getFullYear();
  const jan4 = new Date(isoYear, 0, 4);
  const jan4Day = (jan4.getDay() + 6) % 7;
  const week1Monday = new Date(isoYear, 0, 4 - jan4Day);
  const week = Math.floor((thursday.getTime() - week1Monday.getTime()) / 604_800_000) + 1;
  return { year: isoYear, week };
}

/** ключ недели «2026-W43» — детерминизм weekly-ролла */
export function weekKeyOf(dateISO: string): string {
  const { year, week } = isoWeekOf(dateISO);
  return `${year}-W${String(week).padStart(2, '0')}`;
}
