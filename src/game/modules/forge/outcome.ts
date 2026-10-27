/**
 * Чистые функции заточки (карточка M10 §3–§4) — детерминизм без состояния:
 * сетка приёмки §7 (группа M10) импортирует их напрямую, сервис попытки —
 * из тех же (один источник истины; прецедент craft/quality.ts).
 *
 *   baseSuccess(L)  = clamp(base − decay×L, min, base)
 *   successChance   = min(cap, baseSuccess + pityStep×fails + (bonusStat−100)/100)
 *   rollback(L)     = min(rb.base + rb.step×L, rb.cap)   // при ПРОВАЛЕ
 *   statScale(L)    = 1 + statScalePerLevel × L           // к БАЗЕ в M02 (П2)
 *   effectiveTier   = тир качества + floor(L / tierStepLevels), клэмп SS (R2)
 */
import type { QualityTier } from '@/shared/types/ids';
import { QUALITY_TIERS } from '@/shared/types/ids';
import type { ForgeTable } from '@/content/balance/forging';

/** Исходы попытки (карточка §4) */
export type ForgeOutcomeKind = 'success' | 'fail' | 'rollback';

/** §4: базовый шанс успеха на уровне L (затухание, клэмп снизу) */
export function baseSuccessOf(level: number, table: ForgeTable): number {
  const { base, decayPerLevel, min } = table.baseSuccess;
  const L = Math.max(0, Math.floor(level));
  return Math.min(base, Math.max(min, base - decayPerLevel * L));
}

/** §4: прибавка жалости — pityStep × подряд провальные попытки */
export function pityBonusOf(fails: number, table: ForgeTable): number {
  return table.pityStepPerFail * Math.max(0, Math.floor(fails));
}

/**
 * Итоговый шанс успеха. bonusStat — resolve('forge.success.bonus') (база 100,
 * «Точильный круг» даёт inc; вклад = (stat − 100)/100 — [DECISION · M10.1],
 * прецедент craft.qualityBonus: процентный стат с ненулевой базой).
 */
export function successChanceOf(level: number, fails: number, table: ForgeTable, bonusStat = 100): number {
  const raw = baseSuccessOf(level, table) + pityBonusOf(fails, table) + (bonusStat - 100) / 100;
  return Math.min(table.successCap, Math.max(0, raw));
}

/** [M10.2 · гигиена §1.1] разложение шанса: сумма компонентов = итогу ВСЕГДА
 *  (до клэмпа капа; итог = min(cap, Σ)). decline — одноразовый бонус отказа
 *  от карточки (R7, потребляется следующей попыткой предмета). */
export interface ChanceBreakdown {
  base: number;
  pity: number;
  circle: number;
  decline: number;
  /** итог после клэмпа капа */
  chance: number;
  /** клэмп сработал (Σ компонентов > кап) */
  capped: boolean;
}

export function chanceBreakdownOf(
  level: number,
  fails: number,
  table: ForgeTable,
  bonusStat = 100,
  decline = 0,
): ChanceBreakdown {
  const base = baseSuccessOf(level, table);
  const pity = pityBonusOf(fails, table);
  const circle = (bonusStat - 100) / 100;
  const d = Math.max(0, decline);
  const sum = base + pity + circle + d;
  const chance = Math.min(table.successCap, Math.max(0, sum));
  return { base, pity, circle, decline: d, chance, capped: sum > chance + 1e-12 };
}

/** §4: шанс отката ПРИ ПРОВАЛЕ на уровне L (от попыток не зависит) */
export function rollbackChanceOf(level: number, table: ForgeTable): number {
  const { base, stepPerLevel, cap } = table.rollback;
  const L = Math.max(0, Math.floor(level));
  return Math.min(cap, base + stepPerLevel * L);
}

/**
 * Решение попытки по двум роллам RngBus (u1 — успех, u2 — откат при провале).
 * Чистая функция: одинаковое (chance, rollback, u1, u2) → одинаковый исход.
 */
export function decideOutcome(u1: number, u2: number, chance: number, rollbackChance: number): ForgeOutcomeKind {
  if (u1 < chance) return 'success';
  return u2 < rollbackChance ? 'rollback' : 'fail';
}

/** §3: множитель к базовым статам предмета (применяется в провайдере M02) */
export function statScaleOf(level: number, table: ForgeTable): number {
  return 1 + table.statScalePerLevel * Math.max(0, Math.floor(level));
}

/**
 * R2: эффективный тир = тир качества + floor(L / tierStepLevels), потолок SS,
 * дробная часть качества СОХРАНЯЕТСЯ (C/58 + 1 тир = B/58); пересчёт
 * автоматический от уровня — НЕ персистится, ItemInstance.quality не мутируется (П2).
 */
export function effectiveQualityOf(
  tier: QualityTier,
  value: number,
  level: number,
  table: ForgeTable,
): { tier: QualityTier; value: number } {
  const base = QUALITY_TIERS.indexOf(tier);
  const idx = Math.min(QUALITY_TIERS.length - 1, Math.max(0, base) + Math.floor(Math.max(0, level) / table.tierStepLevels));
  return { tier: QUALITY_TIERS[idx], value: Math.min(100, Math.max(0, value)) };
}
