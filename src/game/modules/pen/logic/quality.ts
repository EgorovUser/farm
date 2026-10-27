/**
 * Качество загона (M06.1, бриф F5/F7) — чистые функции.
 *
 * [F5] качество животного роллится ПРИ ПОКУПКЕ именованным стримом
 * `pen:buy:<species>` (roll01-контракт П6 — ролл логируется) из таблицы
 * тиров данных buyQualityWeights (старт D45 C35 B15 A5; S/SS недостижимы
 * покупкой — бизнес-случай разведения M06.2). value — равномерно 0..100
 * (стрим `pen:buy:<species>:value`).
 *
 * [F7] качество продукта: веса тиров produce.qualityWeights с фактором
 * factorOfScore(happiness/100) — ТА ЖЕ функция-преобразование, что у фермы
 * (d1265be: база × фактор, коридор [minFactor, maxFactor]); участие качества
 * животного — [DECISION · слот F7]: шанс +1 тира qualityTierUpChancePerTier ×
 * средний тир производителей продукта (отдельный бросок, пропускается при
 * нулевом шансе — журнал без шума, прецедент farm:harvest:skill; кап SS).
 *
 * Детерминизм: именованные стримы RngBus, все роллы логируются (rollRange
 * пишет в журнал — П6 «шансы на стол»).
 */
import type { RngBus } from '@/kernel/bus/rng-bus/rng-bus';
import { QUALITY_TIERS, type QualityTier } from '@/shared/types/ids';
import type { PenTable } from '@/content/balance/pen';

export interface PenQuality {
  tier: QualityTier;
  value: number;
}

/** фактор из доли (0..1): [minFactor..maxFactor] линейно — то же
 *  преобразование, что factorOfScore фермы (d1265be), коридор из PEN_TABLE */
export function factorOfShare(table: PenTable, share: number): number {
  const { minFactor, maxFactor } = table.produce;
  const s = Math.min(1, Math.max(0, share));
  return minFactor + (maxFactor - minFactor) * s;
}

/** [F5] ролл тира животного при покупке: weights × threshold по roll01 */
export function rollBuyQualityTier(rngBus: RngBus, table: PenTable, species: string): QualityTier {
  const weights = QUALITY_TIERS.map((t) => table.buyQualityWeights[t] ?? 0);
  const total = weights.reduce((a, b) => a + b, 0);
  if (total <= 0) return 'D';
  const x = rngBus.rollRange(0, 1, 'uniform', `pen:buy:${species}`) * total;
  let acc = 0;
  for (let i = 0; i < QUALITY_TIERS.length; i++) {
    acc += weights[i];
    if (x < acc) return QUALITY_TIERS[i];
  }
  return QUALITY_TIERS[QUALITY_TIERS.length - 1] as QualityTier;
}

/** value животного: равномерно 0..100 (стрим-суффикс :value — прецедент сбора) */
export function rollBuyQualityValue(rngBus: RngBus, species: string): number {
  return Math.round(rngBus.rollRange(0, 100, 'uniform', `pen:buy:${species}:value`));
}

/** веса тиров продукта под фактором счастья (w_i × factor^i — прецедент фермы) */
export function adjustedProduceWeights(table: PenTable, factor: number): number[] {
  return QUALITY_TIERS.map((tier, i) => table.produce.qualityWeights[tier] * Math.pow(factor, i));
}

const bump = (t: QualityTier): QualityTier => {
  const idx = QUALITY_TIERS.indexOf(t);
  return idx >= 0 && idx < QUALITY_TIERS.length - 1 ? QUALITY_TIERS[idx + 1] : t;
};

/** [F7] ролл качества продукта: веса × фактор счастья (roll01) → шанс +1 тира
 *  от качества животных (avgTier × qualityTierUpChancePerTier; 0 → без броска)
 *  → value равномерно 0..100. Потоки: `pen:collect:<defId>` / `:tierup` / `:value`. */
export function rollProduceQuality(
  rngBus: RngBus,
  table: PenTable,
  defId: string,
  factor: number,
  animalTierUpChance = 0,
): PenQuality {
  const weights = adjustedProduceWeights(table, factor);
  const total = weights.reduce((a, b) => a + b, 0);
  let tier: QualityTier = 'D';
  if (total > 0) {
    const x = rngBus.rollRange(0, 1, 'uniform', `pen:collect:${defId}`) * total;
    let acc = 0;
    for (let i = 0; i < QUALITY_TIERS.length; i++) {
      acc += weights[i];
      if (x < acc) {
        tier = QUALITY_TIERS[i];
        break;
      }
    }
  }
  if (animalTierUpChance > 0 && rngBus.nextFloat(`pen:collect:${defId}:tierup`) < animalTierUpChance) {
    tier = bump(tier);
  }
  const value = Math.round(rngBus.rollRange(0, 100, 'uniform', `pen:collect:${defId}:value`));
  return { tier, value };
}
