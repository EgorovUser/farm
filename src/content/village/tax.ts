/**
 * Налог деревни (карточка M16 §3; бриф G6) — ЕЖЕДНЕВНЫЙ доход лейтгейма.
 *
 * gold = f(уровень деревни, среднее счастье) — расчёт ЦЕЛИКОМ через шину:
 *   база 'village.tax.gold' (bases, П2-зеркало baseGold) × inc-моды
 *   villageProvider:
 *     +perLevelPercent × (уровень − 1)            — рост от уровня
 *     ±happinessSwingPercent × (счастье − pivot)/50 — размах счастья
 *     −grumblerPenaltyPercent × ворчуны            — ворчун-минус (G4)
 * Итог — StatBus.resolve('village.tax.gold') с округлением шины. Формула —
 * данные; провайдер лишь переводит состояние в модификаторы (П2/П3).
 * Ворчун = житель с grumbleDays ≥ grumbleThreshold (table.ts).
 */
import type { VillageTaxTable } from './types';

export const VILLAGE_TAX: VillageTaxTable = {
  baseGold: 8,
  perLevelPercent: 12,
  happinessSwingPercent: 30,
  happinessPivot: 50,
  grumblerPenaltyPercent: 6,
};

/** oracle-помощник: ожидаемый налог по формуле данных (selftest G6/G9;
 *  потребитель в рантайме — ТОЛЬКО шина, эта функция — паритет-оракул) */
export function taxOracleGold(tax: VillageTaxTable, level: number, avgHappiness: number, grumblers: number): number {
  const levelInc = tax.perLevelPercent * Math.max(0, level - 1);
  const happinessInc = (tax.happinessSwingPercent * (avgHappiness - tax.happinessPivot)) / 50;
  const grumblerInc = -tax.grumblerPenaltyPercent * Math.max(0, grumblers);
  return Math.round(tax.baseGold * (1 + (levelInc + happinessInc + grumblerInc) / 100));
}
