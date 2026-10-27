/**
 * Базовые идентификаторы и перечисления игры.
 * Источник имён: 03-DATA §1 + глоссарий 01-CORE §11.
 * Контент-id — snake_case, статы — точечные id.
 */

/** Идентификатор любой сущности контента: 'iron_pickaxe', 'node_042' */
export type ID = string;

/** Точечный id стата: 'player.energy.max', 'farm.growthSpeed' */
export type StatId = string;

/** Контекст-тег: 'fishing' | 'night' | 'layer:3' | 'status:cold' */
export type Tag = string;

/** Редкость предмета */
export type Rarity = 'common' | 'uncommon' | 'rare' | 'epic' | 'legendary' | 'mythic';

/** Качество экземпляра (D..SS) */
export type QualityTier = 'D' | 'C' | 'B' | 'A' | 'S' | 'SS';

/** Валюты и ресурсы (отдельно от предметов — 03-DATA §1) */
export type CurrencyId =
  | 'gold'
  | 'copper'
  | 'tin'
  | 'iron'
  | 'silver'
  | 'nuggets'
  | 'mithril'
  | 'adamant'
  | 'stone'
  | 'logs'
  | 'planks'
  | 'fiber'
  | 'leather'
  | 'nails'
  | 'coal'
  | 'feed'
  | 'fertilizer'
  | 'caviar'
  | 'ingot:bronze'
  | 'ingot:iron';

/** Операции модификаторов (02-BUSES §2) */
export type Op = 'flat' | 'inc' | 'more' | 'override' | 'cap';

export const RARITIES: readonly Rarity[] = [
  'common',
  'uncommon',
  'rare',
  'epic',
  'legendary',
  'mythic',
] as const;

export const QUALITY_TIERS: readonly QualityTier[] = ['D', 'C', 'B', 'A', 'S', 'SS'] as const;

/** Русские подписи редкости для UI/debug */
export const RARITY_LABELS_RU: Record<Rarity, string> = {
  common: 'обычный',
  uncommon: 'необычный',
  rare: 'редкий',
  epic: 'эпический',
  legendary: 'легендарный',
  mythic: 'мифический',
};

/** Русские подписи качества для UI/debug */
export const QUALITY_LABELS_RU: Record<QualityTier, string> = {
  D: 'D',
  C: 'C',
  B: 'B',
  A: 'A',
  S: 'S',
  SS: 'SS',
};
