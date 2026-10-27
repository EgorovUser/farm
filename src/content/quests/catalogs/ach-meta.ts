/**
 * АЧИВКИ · квесты-мета (M15.2, карточка §5): забранные награды + мета-ачивки
 * на счётчике achievements.unlocked.count (данные о данных — событие M15
 * считает счётчик ядра; Eventually-consistent: unlock в текущем/следующем
 * sync — счётчик поднимается публикацией). Числа — тюнюется (П6).
 */
import type { AchievementDef } from '../types';

export const ACH_META: AchievementDef[] = [
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
