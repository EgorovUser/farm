/**
 * АЧИВКИ · шахта (M12.2, бриф G2/G3): ach_mine_boss_<n> ×9 — поимённо, по
 * одному на слой. Санкционированное расширение M15-пула (леджер сеанса:
 * «ТОЛЬКО ачивки ach_mine_boss_<n> поимённо»).
 *
 * Механика: условие hasItem(трофей слоя) — трофей гарантированно падает за
 * победу над боссом слоя (транзакция mine.bossLoot), auto-claim M15 живой:
 * item.acquired → syncAchievements → unlockFlags. Проданный трофей ачивку
 * не отзывает (unlock персистентен в срезе quests).
 *
 * [DECISION · G2] материальных rewards НЕТ: функция ачивки — unlockFlags-гейт
 * следующего слоя (G3); материальная награда = лут босса (золото/руда/A+),
 * XP-канал — событие mine.bossKilled → 100 XP (M01 progression, за каждый
 * килл — повторяемый); дублировать награды значило бы задвоить экономику.
 */
import type { AchievementDef } from './types';

export const ACHIEVEMENTS_MINE: AchievementDef[] = [
  {
    id: 'ach_mine_boss_1',
    name: 'Паучья погибель',
    condition: { t: 'hasItem', defId: 'trophy_mine_1' },
    unlockFlags: ['ach.mine.boss.1'],
  },
  {
    id: 'ach_mine_boss_2',
    name: 'Камнепад',
    condition: { t: 'hasItem', defId: 'trophy_mine_2' },
    unlockFlags: ['ach.mine.boss.2'],
  },
  {
    id: 'ach_mine_boss_3',
    name: 'Глубинный ужас',
    condition: { t: 'hasItem', defId: 'trophy_mine_3' },
    unlockFlags: ['ach.mine.boss.3'],
  },
  {
    id: 'ach_mine_boss_4',
    name: 'Вторая королева',
    condition: { t: 'hasItem', defId: 'trophy_mine_4' },
    unlockFlags: ['ach.mine.boss.4'],
  },
  {
    id: 'ach_mine_boss_5',
    name: 'Каменный крах',
    condition: { t: 'hasItem', defId: 'trophy_mine_5' },
    unlockFlags: ['ach.mine.boss.5'],
  },
  {
    id: 'ach_mine_boss_6',
    name: 'Змей во второй раз',
    condition: { t: 'hasItem', defId: 'trophy_mine_6' },
    unlockFlags: ['ach.mine.boss.6'],
  },
  {
    id: 'ach_mine_boss_7',
    name: 'Терновый венец',
    condition: { t: 'hasItem', defId: 'trophy_mine_7' },
    unlockFlags: ['ach.mine.boss.7'],
  },
  {
    id: 'ach_mine_boss_8',
    name: 'Титан повержен',
    condition: { t: 'hasItem', defId: 'trophy_mine_8' },
    unlockFlags: ['ach.mine.boss.8'],
  },
  {
    id: 'ach_mine_boss_9',
    name: 'Око бездны',
    condition: { t: 'hasItem', defId: 'trophy_mine_9' },
    unlockFlags: ['ach.mine.boss.9'],
  },
];
