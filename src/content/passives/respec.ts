/**
 * M14 · Кривая респека (карточка §2: «респек платный: золото, растёт с числом
 * сброшенных узлов (данные); полный и поузельный»). ЕДИНСТВЕННОЕ место чисел.
 *
 * cost(respecTotal) = round(baseCost × growthMult^respecTotal) — цена ОДНОЙ
 * операции респека (поузельной ИЛИ полной): кривая растёт от накопленного
 * числа сброшенных узлов (вход кривой — respecTotal ДО операции); после
 * операции respecTotal += число снятых узлов (поузельная +1, полный +K).
 *
 * [DECISION] одна цена на операцию (полный сброс K узлов = ОДНА операция по
 * цене кривой, не K цен): «полный и поузельный» — равные права на кривую,
 * полный выигрывает экономно; запрет поузельного респека узла-моста —
 * инвариант связности (бриф F4), не цена.
 */
import type { PassivesRespecTable } from './types';

export const PASSIVES_RESPEC: PassivesRespecTable = {
  baseCost: 50,
  growthMult: 1.5,
};

/** цена следующей операции респека при накопленных n сброшенных узлах */
export function respecCostOf(table: PassivesRespecTable, n: number): number {
  return Math.round(table.baseCost * Math.pow(table.growthMult, Math.max(0, Math.floor(n))));
}
