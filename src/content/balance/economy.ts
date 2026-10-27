/**
 * Экономика (04-DISCOUNTS §4, 03-DATA §1).
 * Все числа баланса живут здесь, не в логике (П6).
 */
import type { EconomyConfig } from '@/kernel/bus/price-bus/price-bus';
import type { QualityTier, Rarity } from '@/shared/types/ids';

/** Стартовый капитал нового игрока */
export const START_GOLD = 50;

export const ECONOMY_TABLE: EconomyConfig = {
  /** скупка: 40% базовой цены (04-DISCOUNTS §4.4) */
  sellRatePercent: 40,
  /** суммарная скидка ≤ 90% */
  maxTotalDiscountPercent: 90,
  /** цена ≥ ceil(base × 0.1) — бесплатно ничего не бывает */
  minPriceFactor: 0.1,
  /** кап суммы внутри глобальной группы */
  globalGroupCapPercent: 60,
  /** кап суммы внутри локальной группы */
  localGroupCapPercent: 40,

  /** редкость к цене (03-DATA §1) */
  rarityPriceMult: {
    common: 1,
    uncommon: 1.5,
    rare: 2.5,
    epic: 4,
    legendary: 7,
    mythic: 12,
  } satisfies Record<Rarity, number>,

  /** качество к цене (03-DATA §1) */
  qualityPriceMult: {
    D: 0.7,
    C: 1,
    B: 1.35,
    A: 1.8,
    S: 2.5,
    SS: 3.5,
  } satisfies Record<QualityTier, number>,
};
