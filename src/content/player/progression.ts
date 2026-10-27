/**
 * ПРОГРЕССИЯ ИГРОКА (M01 §4–§5): кривые уровня и навыка, бонусы, XP-таблица.
 * Формулы из карточки: xpToNext(L) = 100 × 1.15^L; навык — 50 × 1.2^L
 * ([FIX-M01 · DEBT-19] кривая навыка перенесена из литералов модуля сюда:
 * skillXpBase × skillXpGrowth^level — единственное место чисел, П6).
 */
import type { XpEventRule } from './rules';

export interface PlayerTable {
  level: {
    /** xpToNext(L) = xpBase × (1 + growthPercent/100)^L (карточка: 100 × 1.15^L) */
    xpBase: number;
    growthPercent: number;
    /** [DECISION] maxLevel: 60 — якорь баланса Фазы 1 (D9, ратифицировано
     * 2026-10-22): пересмотр только вместе с престиж-механикой, которой
     * в Фазе 1 нет. Гейт разблокировок, карточка §8: тест 1→60. */
    maxLevel: number;
  };
  /** кривая навыка (карточка §5): xpToNext(skillLevel) = skillXpBase × skillXpGrowth^skillLevel */
  skillXpBase: number;
  skillXpGrowth: number;
  /** levelBonusProvider (§7): прибавки к капам за каждый уровень СВЕРХ первого */
  levelBonus: {
    energyMaxPerLevel: number;
    hpMaxPerLevel: number;
  };
  /** события → XP игрока; квесты несут количество в пейлоаде (50–500) */
  xpEvents: XpEventRule[];
}

export const PLAYER_TABLE: PlayerTable = {
  level: { xpBase: 100, growthPercent: 15, maxLevel: 60 },
  skillXpBase: 50,
  skillXpGrowth: 1.2,
  levelBonus: { energyMaxPerLevel: 2, hpMaxPerLevel: 5 },
  xpEvents: [
    { event: 'farm.plotPlowed', xp: 2 }, // вспашка 2 (M05 опубликует)
    { event: 'farm.cropHarvested', xp: 5 }, // сбор 5
    { event: 'fish.caught', xp: 8 }, // рыба 8 (M07)
    { event: 'craft.completed', xp: 10 }, // крафт 10 (M09)
    { event: 'mine.enemyKilled', xp: 15 }, // моб 15 (M12)
    { event: 'mine.bossKilled', xp: 100 }, // босс 100 (M12)
    { event: 'quest.completed', xpKey: 'xp' }, // квест 50–500 — из данных квеста (M15)
    // [M15] ачивка с xp-наградой — тот же канал «событие → XP» (карточка M01 §4);
    // количество — поле xp пейлоада achievement.unlocked (сумма Reward{t:'xp'})
    { event: 'achievement.unlocked', xpKey: 'xp' },
  ],
};
