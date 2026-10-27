/**
 * Качество урожая при сборе (F7, карточка M05 §3) — базовая версия M05.1;
 * полные факторы (перки навыка, «Парник-люкс» +1 тир, монте-карло) — M05.3.
 *
 * [DECISION · M05.1 · F7] фактор мини-игры (×0.8–1.3) применяется К ВЕСАМ
 * тиров: w_i × factor^i (D..SS, i — индекс тира): мини-игра геймплейно
 * значимо смещает качество (карточка §3 «качество роллится из факторов:
 * мини-игра (×0.8–1.3)»), при factor = 1 распределение = стартовой таблице
 * (преемственность acquire M02). value — равномерно 0..100 как в acquire.
 * Удобрение: отдельный бросок nextFloat < tierUpChance → +1 тир (кап SS).
 *
 * Детерминизм: именованные стримы RngBus ('farm:harvest:*'), роллы
 * логируются (rollRange пишет в журнал — П6 «шансы на стол»).
 */
import type { RngBus } from '@/kernel/bus/rng-bus/rng-bus';
import { QUALITY_TIERS, type QualityTier } from '@/shared/types/ids';
import type { FarmTable } from '@/content/balance/farm';

export interface HarvestQuality {
  tier: QualityTier;
  value: number;
}

/** целое количество урожая [minQty..maxQty] (детерминированный стрим;
 * [M05.2] перенос из actions.ts — роллы сбора живут с качеством) */
export function rollYieldQty(rngBus: RngBus, minQty: number, maxQty: number): number {
  if (maxQty <= minQty) return minQty;
  return minQty + Math.floor(rngBus.rollRange(0, maxQty - minQty + 1, 'uniform', 'farm:harvest:qty'));
}

/** фактор мини-игры из auto-score: [minFactor..maxFactor] линейно (карточка §3) */
export function factorOfScore(table: FarmTable, score: number): number {
  const { minFactor, maxFactor } = table.harvest;
  const s = Math.min(1, Math.max(0, score));
  return minFactor + (maxFactor - minFactor) * s;
}

/** веса тиров под фактором (экспорт для чеков направления; w_i × factor^i) */
export function adjustedWeights(table: FarmTable, factor: number): number[] {
  return QUALITY_TIERS.map((tier, i) => table.harvest.qualityWeights[tier] * Math.pow(factor, i));
}

/** ролл качества урожая — ПОЛНЫЙ факторный расчёт (карточка §3, G4):
 *  тир по весам × фактор мини-игры → удобрение (шанс +1, отдельный бросок)
 *  → перки навыка farming (шанс +1, отдельный бросок — [DECISION · G4]:
 *  пороговые моды на 'farm.harvest.tierUpChance', семантика как удобрения;
 *  бросок пропускается при нулевом шансе — журнал роллов без шума) →
 *  «Парник-люкс» (безусловный +tierBonus, кап SS на каждом шаге);
 *  value — равномерно 0..100 как в acquire */
export function rollHarvestQuality(
  rngBus: RngBus,
  table: FarmTable,
  factor: number,
  fertilized: boolean,
  skillTierUpChance = 0,
  tierBonus = 0,
): HarvestQuality {
  const weights = adjustedWeights(table, factor);
  const total = weights.reduce((a, b) => a + b, 0);
  let tier: QualityTier = 'D';
  if (total > 0) {
    const x = rngBus.rollRange(0, 1, 'uniform', 'farm:harvest:tier') * total;
    let acc = 0;
    for (let i = 0; i < QUALITY_TIERS.length; i++) {
      acc += weights[i];
      if (x < acc) {
        tier = QUALITY_TIERS[i];
        break;
      }
    }
  }
  const bump = (t: QualityTier): QualityTier => {
    const idx = QUALITY_TIERS.indexOf(t);
    return idx >= 0 && idx < QUALITY_TIERS.length - 1 ? QUALITY_TIERS[idx + 1] : t;
  };
  if (fertilized && rngBus.nextFloat('farm:harvest:fert') < table.fertilizer.tierUpChance) {
    tier = bump(tier);
  }
  if (skillTierUpChance > 0 && rngBus.nextFloat('farm:harvest:skill') < skillTierUpChance) {
    tier = bump(tier);
  }
  for (let k = 0; k < tierBonus; k++) {
    tier = bump(tier);
  }
  const value = Math.round(rngBus.rollRange(0, 100, 'uniform', 'farm:harvest:value'));
  return { tier, value };
}

/** максимум строки yields (для probeCapacity до выдачи; [M05.2] из actions.ts) */
export function maxOf(line: { minQty: number; maxQty: number }): number {
  return Math.max(line.minQty, line.maxQty);
}
