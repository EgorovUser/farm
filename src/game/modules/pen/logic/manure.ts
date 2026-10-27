/**
 * Навоз-цикл загона (M06.2, бриф F4) — чистые функции + чтение ДАННЫХ M05.
 *
 * Буфер: каждое кормление +perFeeding навоза (кап cap — данные PEN_TABLE).
 * Без «Симбиоза» — ручной обмен: буфер → предметы «Навоз» в инвентарь
 * (pen.manure take; канон d23 — проба вместимости ДО выдачи; дальше — живой
 * путь M05: компостер фермы при прополке принимает навоз из инвентаря,
 * БЕЗ импортов — загон о компостере не знает).
 *
 * С «Симбиозом» — автосбор на dayTick: буфер → валюта «Удобрение» по живому
 * курсу компостера (чтение 'farm.upgrades' через ContentRegistry — ДАННЫХ,
 * не вызовов; прецедент farm.compost — событийный обмен транзакцией
 * eventId 'pen.compost' [DECISION-имя]: чужой eventId не занимается —
 * канон farm.compost = ОБМЕН транзакцией, не чужой id).
 */
import type { PenTable } from '@/content/balance/pen';
import type { PenState } from '../state';

/** структурная форма эффекта компостера из данных M05 (без импорта типов
 *  фермы — изоляция контента; чтение через ContentRegistry 'farm.upgrades') */
export interface ComposterRateLike {
  input: { item: string; qty: number };
  output: { currency: string; qty: number };
}

/** курс компостера из данных M05: сколько удобрения за буфер навоза
 *  (живой курс 1:1; при смене данных — пересчитывается без правки модуля) */
export function fertilizerFor(
  manure: number,
  rate: ComposterRateLike | undefined,
): { fertilizer: number; leftoverManure: number; currency: string } {
  if (rate === undefined || manure <= 0 || rate.input.qty <= 0) {
    return { fertilizer: 0, leftoverManure: manure, currency: 'fertilizer' };
  }
  const batches = Math.floor(manure / rate.input.qty);
  return {
    fertilizer: batches * rate.output.qty,
    leftoverManure: manure - batches * rate.input.qty,
    currency: rate.output.currency,
  };
}

/** накопить навоз за кормление (кап из данных; чистая функция) */
export function addManure(state: PenState, table: PenTable): PenState {
  const next = Math.min(table.manure.cap, (state.manure ?? 0) + table.manure.perFeeding);
  if (next === (state.manure ?? 0)) return state;
  return { ...state, manure: next };
}
