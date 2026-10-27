/**
 * АЧИВКИ · квесты-мета (M15.2 §5): claim-квесты и «данные о данных» — мета-
 * ачивки на счётчик achievements.unlocked.count (событие M15, счётчик N3).
 * КАЖДАЯ несёт unlockFlags. Числа — стартовые (тюнюется, П6). Часть
 * ACHIEVEMENTS (распил §4.8).
 */
import type { AchievementDef } from './types';

export const ACHIEVEMENTS_META: AchievementDef[] = [
  {
    id: 'ach_first_earnings',
    name: 'Первые заработки',
    condition: { t: 'counterAtLeast', counter: 'quests.claimed', value: 5 },
    rewards: [{ t: 'xp', qty: 50 }], // тюнюется
    unlockFlags: ['ach.quests.earnings'],
  },
  {
    id: 'ach_reward_hunter',
    name: 'Охотник за наградами',
    condition: { t: 'counterAtLeast', counter: 'quests.claimed', value: 50 },
    rewards: [
      { t: 'currency', id: 'gold', qty: 300 }, // тюнюется
      { t: 'xp', qty: 200 }, // тюнюется
    ],
    unlockFlags: ['ach.quests.hunter'],
  },
  {
    id: 'ach_reward_sage',
    name: 'Награды сами не придут',
    condition: { t: 'counterAtLeast', counter: 'quests.claimed', value: 200 },
    rewards: [
      { t: 'passivePoint', qty: 1 }, // слушатель M14 (фаза 4)
      { t: 'item', defId: 'woven_banner', qty: 1 }, // тюнюется
    ],
    unlockFlags: ['ach.quests.sage'],
  },
  {
    id: 'ach_dozen',
    name: 'Собрание сочинений',
    // мета: счётчик открытий ачивок (данные о данных — счётчик на событие M15)
    condition: { t: 'counterAtLeast', counter: 'achievements.unlocked.count', value: 10 },
    rewards: [{ t: 'currency', id: 'gold', qty: 150 }], // тюнюется
    unlockFlags: ['ach.meta.dozen'],
  },
  {
    id: 'ach_full_collection',
    name: 'Полная коллекция',
    condition: { t: 'counterAtLeast', counter: 'achievements.unlocked.count', value: 25 },
    rewards: [
      { t: 'passivePoint', qty: 1 }, // слушатель M14 (фаза 4)
      { t: 'item', defId: 'star_gem', qty: 1 }, // тюнюется (крупная)
    ],
    unlockFlags: ['ach.meta.collection'],
  },
];
