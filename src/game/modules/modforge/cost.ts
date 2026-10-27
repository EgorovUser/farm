/**
 * Формулы стоимости ривен-характеристик (M03 §3) — ЧИСТЫЕ функции без шин/состояния:
 *
 *   costPositive(v) = round( costWeight × (v / maxPositive)^P × 100 ) / 100
 *   costNegative(v) = − round( costWeight × (|v| / |maxNegative|)^N × 100 ) / 100
 *
 * P > 1 — суперлинейно (у максимума дорого), N < 1 — почти линейно. Экспоненты
 * и refundRate — контент (balance/modforge.ts, П6). Значения роллов живут
 * на сетке 0.1 (округление движка §5). Потребители: rollFor (M03.2),
 * debug `mods cost`, self-checks M03. Границы клэмпятся типом (защита от
 * чужих писателей, П5): v вне [maxNegative..maxPositive] считается по краю.
 */
import type { ModTypeDef } from '@/content/mods/registry';

/** Параметры кривых стоимости — срез ModForgeTable (передаётся явно: чистота) */
export interface CostCurve {
  positiveExponent: number;
  negativeExponent: number;
}

/** округление до 2 знаков — канон §3 («× 100 / 100») */
function round2(x: number): number {
  return Math.round(x * 100) / 100;
}

/** Стоимость бафа ≥ 0 (2 знака). v ≤ 0 или тип без плюса → 0. */
export function costPositive(curve: CostCurve, mod: ModTypeDef, value: number): number {
  if (!(value > 0) || !(mod.maxPositive > 0)) return 0;
  const v = Math.min(value, mod.maxPositive);
  return round2(mod.costWeight * Math.pow(v / mod.maxPositive, curve.positiveExponent));
}

/** Стоимость дебафа ≤ 0 (2 знака, знак минус при результате). v ≥ 0 или тип
 *  без минуса (maxNegative = 0) → 0. */
export function costNegative(curve: CostCurve, mod: ModTypeDef, value: number): number {
  if (!(value < 0) || !(mod.maxNegative < 0)) return 0;
  const v = Math.min(-value, -mod.maxNegative);
  return -round2(mod.costWeight * Math.pow(v / -mod.maxNegative, curve.negativeExponent));
}

/** Знаковая стоимость по знаку значения (дебаф — отрицательная) */
export function costOf(curve: CostCurve, mod: ModTypeDef, value: number): number {
  return value < 0 ? costNegative(curve, mod, value) : costPositive(curve, mod, value);
}

/**
 * Обращение кривой бафа (§5 шаг 4: «решение уравнения кривой стоимости —
 * бинарный поиск по v»): наибольшее значение на сетке 0.1, чья стоимость
 * ≤ targetCost. costPositive монотонна по v → бинарный поиск корректен.
 * target ≥ стоимости maxPositive → maxPositive; target ≤ 0 → 0.
 */
export function fitPositiveValue(curve: CostCurve, mod: ModTypeDef, targetCost: number): number {
  if (!(mod.maxPositive > 0) || !(targetCost > 0)) return 0;
  let lo = 0;
  let hi = Math.round(mod.maxPositive * 10);
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1; // верхняя середина: ищем ПОСЛЕДНЕЕ подходящее
    if (costPositive(curve, mod, mid / 10) <= targetCost) {
      lo = mid;
    } else {
      hi = mid - 1;
    }
  }
  return lo / 10;
}

/**
 * Рефанд дебафа (§3): |costNegative| × refundRate. Дебаф «возвращает» в бюджет
 * больше отнятого — слабые дебафы выгодны и встречаются у сильных роллов.
 */
export function negativeRefund(refundRate: number, negativeCost: number): number {
  if (!(negativeCost < 0) || !(refundRate > 0)) return 0;
  return round2(-negativeCost * refundRate);
}

/**
 * Инвариант бюджета (§3): Σ costPositive − Σ |costNegative| × refundRate ≤ budget.
 * Возвращает фактический «потраченный» бюджет ролла (для UI/логов П6).
 */
export function spentBudget(
  refundRate: number,
  positiveCosts: readonly number[],
  negativeCosts: readonly number[],
): number {
  const pos = positiveCosts.reduce((a, b) => a + Math.max(0, b), 0);
  const neg = negativeCosts.reduce((a, b) => a + Math.max(0, -b), 0);
  return round2(pos - neg * refundRate);
}
