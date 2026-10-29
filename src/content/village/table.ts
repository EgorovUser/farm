/**
 * Общий баланс деревни (бриф G1/G4/G5) + БАЗЫ домена (П2). Гейт открытия
 * модуля — уровень 30 + ачивка «Мастер хутора» (ветка (б) [DECISION
 * M161-гейт]: пул ачивок хоумстед-ряда не содержит семантики «Мастер
 * хутора» — chain_homestead финал = обучающий «Хозяин мастерской»,
 * ach_homestead_glory = уровень 20; добавлена РОВНО ОДНА новая ачивка
 * ach_homestead_master, пул 61 → 62 — открыто в отчёте/worklog).
 *
 * XP-кривая уровней 1–25 (G5): xpToNext(L) = round(baseXp × growth^(L−1));
 * уровень — ПРОИЗВОДНАЯ от xp (levelOf), в срезе не хранится.
 * Счастье/ворчание (G4): игнор потребности grumbleThreshold дней →
 * «ворчун»: −dropPerGrumbleDay счастья в день + минус к налогам
 * (величины — tax.ts).
 */
import type { VillageBasesTable, VillageTable } from './types';
import { VILLAGE_TAX } from './tax';

export const VILLAGE_TABLE: VillageTable = {
  gate: {
    t: 'all',
    cs: [
      { t: 'playerLevel', level: 30 },
      { t: 'flag', flag: 'village.homestead.master' },
    ],
  },
  happiness: {
    start: 70,
    max: 100,
    gainOnSatisfy: 6,
    dropPerGrumbleDay: 5,
    grumbleThreshold: 3,
  },
  level: {
    min: 1,
    max: 25,
    baseXp: 30,
    growth: 1.15,
  },
  xp: {
    perDailyNeed: 8,
    perWeeklyNeed: 30,
  },
};

/** БАЗЫ домена (П2, сливаются в 'bases' — content-registration; паттерн
 *  PASSIVES_BASES_TABLE M14.1): налог — зеркало VILLAGE_TAX.baseGold
 *  (прецедент M14.2 зеркал), уровень деревни — 1 (провайдер даёт override
 *  фактическим уровнем). [M16.2] Кузница/Рынок — базы 0: провайдер даёт
 *  override силой эффекта построенного уровня (класс village.level). */
export const VILLAGE_BASES_TABLE: VillageBasesTable = {
  bases: {
    'village.tax.gold': VILLAGE_TAX.baseGold,
    'village.level': 1,
    'village.repair.discountPercent': 0,
    'village.market.discountPercent': 0,
  },
  meta: {
    'village.tax.gold': { min: 0, round: 'round' },
    'village.level': { min: 1, round: 'floor' },
    'village.repair.discountPercent': { min: 0, round: 'floor' },
    'village.market.discountPercent': { min: 0, round: 'floor' },
  },
};

/** xp, необходимый для ПОЛУЧЕНИЯ уровня L+1 (уровень 1 — стартовый) */
export function villageXpToNext(baseXp: number, growth: number, level: number): number {
  return Math.round(baseXp * Math.pow(growth, Math.max(0, level - 1)));
}

/** уровень деревни по накопленному XP (производная; кап max) */
export function villageLevelOf(
  xp: number,
  cfg: { min: number; max: number; baseXp: number; growth: number },
): number {
  let level = cfg.min;
  let rest = Math.max(0, Math.floor(xp));
  while (level < cfg.max) {
    const need = villageXpToNext(cfg.baseXp, cfg.growth, level);
    if (rest < need) break;
    rest -= need;
    level += 1;
  }
  return level;
}
