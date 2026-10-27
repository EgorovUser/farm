/**
 * Качество результата крафта (карточка M09 §4) — ЧИСТЫЕ функции, детерминизм
 * без RNG (входы/навык/мини-игра → тир): сетка приёмки §7 импортирует их
 * напрямую, живой модуль — из тех же функций (один источник истины).
 *
 *   outputTier = round( 0.5 × avgInputTier + 0.4 × craftSkillTier
 *                       + (−1..+1 за мини-игру) )
 *
 * - avgInputTier: средневзвешенное (по qty) значение тира ПОТРЕБЛЯЕМЫХ входов
 *   (шкала 0..5: D=0 … SS=5 + value/100); валюты без качества — нейтральный
 *   тир из данных ([DECISION] M09: neutralInputTier, по умолчанию 1 = C);
 * - craftSkillTier: уровень навыка «Крафт» → skillTierPerLevels уровней = +1
 *   тир, кап skillTierCap ([DECISION] M09: тир навыка — данные, не код);
 * - мини-игра: MinigameContract auto-режим — 0 до фазы 6 (карточка §4);
 * - перки порогов навыка: stat craft.qualityBonus (база 100, пороги inc) →
 *   (resolve − 100)/100 тира ([DECISION] M09, баланс-файл);
 * - ItemQuality: tier = TIERS[clamp(round(v))], value = дробная часть ×100
 *   («для сверки цен», 03-DATA §4; [DECISION] M09).
 */
import type { QualityTier } from '@/shared/types/ids';
import { QUALITY_TIERS } from '@/shared/types/ids';
import type { CraftTable } from '@/content/balance/craft';

/** значение тира в шкале 0..5 (D=0 … SS=5) + дробная часть value/100 */
export function tierValue(tier: QualityTier, value: number): number {
  const idx = QUALITY_TIERS.indexOf(tier);
  return Math.max(0, idx) + Math.min(100, Math.max(0, value)) / 100;
}

/** обратное преобразование шкалы 0..5 → ItemQuality (tier + value 0..100) */
export function qualityFromValue(v: number): { tier: QualityTier; value: number } {
  const clamped = Math.min(5, Math.max(0, v));
  const idx = Math.min(QUALITY_TIERS.length - 1, Math.max(0, Math.round(clamped)));
  const frac = clamped - Math.floor(clamped);
  return { tier: QUALITY_TIERS[idx], value: Math.round(frac * 100) };
}

/** тир навыка в формуле: каждые skillTierPerLevels уровней = +1 тир, кап */
export function skillTierOf(skillLevel: number, table: CraftTable): number {
  const { skillTierPerLevels, skillTierCap } = table.quality;
  return Math.min(skillTierCap, Math.max(0, skillLevel) / skillTierPerLevels);
}

export interface QualityInputs {
  /** средневзвешенный тир входов (шкала 0..5) — снапшот постановки */
  avgInputTier: number;
  /** уровень навыка «Крафт» (M01, через контекст шины) */
  skillLevel: number;
  /** итог craft.qualityBonus из шины (база 100; пороги навыка inc +5/+10) */
  qualityBonus: number;
  /** поправка мини-игры −1..+1 (auto-режим = 0 до фазы 6) */
  minigameAdj?: number;
}

/**
 * Значение тира результата (непрерывное, до округления). Формула карточки §4
 * + интеграция перков (qualityBonus). Чистая функция от данных и входов.
 */
export function outputTierValue(inputs: QualityInputs, table: CraftTable): number {
  const { inputWeight, skillWeight, maxMinigameAdj } = table.quality;
  const adj = Math.min(maxMinigameAdj, Math.max(-maxMinigameAdj, inputs.minigameAdj ?? 0));
  const skillTier = skillTierOf(inputs.skillLevel, table);
  const perkTier = (inputs.qualityBonus - 100) / 100;
  return inputWeight * inputs.avgInputTier + skillWeight * skillTier + adj + perkTier;
}

/** Итоговое качество ItemInstance (карточка §4: «результат — ItemInstance») */
export function outputQuality(inputs: QualityInputs, table: CraftTable): { tier: QualityTier; value: number } {
  return qualityFromValue(outputTierValue(inputs, table));
}

/**
 * MinigameContract (карточка §4): авто-режим 0 по умолчанию до фазы 6.
 * Фаза 6 подключит живые мини-игры тем же контрактом — код модуля не изменится.
 */
export interface MinigameContract {
  /** −1..+1; за пределами — клэмп maxMinigameAdj */
  adjustment: number;
}

export const AUTO_MINIGAME: MinigameContract = { adjustment: 0 };
