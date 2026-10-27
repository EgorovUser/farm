/**
 * АЧИВКИ · крафт (M15.2, карточка §5): партии/станции/мастерская.
 * Числа — стартовые (тюнюется, П6). Сборка — achievements.ts.
 */
import type { AchievementDef } from '../types';

export const ACH_CRAFT: AchievementDef[] = [
  {
    id: 'ach_craft_apprentice',
    name: 'Подмастерье',
    condition: { t: 'counterAtLeast', counter: 'craft.batches', value: 10 },
    rewards: [{ t: 'item', defId: 'bread', qty: 3 }], // тюнюется
    unlockFlags: ['ach.craft.apprentice'], // гейт ассортимента M04 (фикстура «Кружка подмастерья»)
  },
  {
    id: 'ach_craft_master',
    name: 'Мастер',
    condition: { t: 'counterAtLeast', counter: 'craft.batches', value: 50 },
    rewards: [
      { t: 'currency', id: 'gold', qty: 250 }, // тюнюется
      { t: 'xp', qty: 150 }, // тюнюется
    ],
    unlockFlags: ['ach.craft.master'],
  },
  {
    id: 'ach_craft_grandmaster',
    name: 'Гранд-мастер',
    condition: { t: 'counterAtLeast', counter: 'craft.batches', value: 150 },
    rewards: [
      { t: 'passivePoint', qty: 1 }, // слушатель M14 (фаза 4)
      { t: 'item', defId: 'healing_salve', qty: 3 }, // тюнюется
    ],
    unlockFlags: ['ach.craft.grand'],
  },
  {
    id: 'ach_smelter_master',
    name: 'Металлург',
    condition: { t: 'counterAtLeast', counter: 'craft.batches.smelter', value: 25 },
    rewards: [
      { t: 'currency', id: 'gold', qty: 180 }, // тюнюется
      { t: 'currency', id: 'coal', qty: 15 }, // тюнюется
    ],
    unlockFlags: ['ach.smelter.master'], // гейт ассортимента M04 ({t:'flag'} — фикстура «Молот металлурга»)
  },
  {
    id: 'ach_workbench_master',
    name: 'Столяр',
    condition: { t: 'counterAtLeast', counter: 'craft.batches.workbench', value: 25 },
    rewards: [
      { t: 'currency', id: 'gold', qty: 180 }, // тюнюется
      { t: 'currency', id: 'planks', qty: 20 }, // тюнюется
    ],
    unlockFlags: ['ach.workbench.master'],
  },
  {
    id: 'ach_kitchen_master',
    name: 'Шеф',
    condition: { t: 'counterAtLeast', counter: 'craft.batches.kitchen', value: 25 },
    rewards: [
      { t: 'currency', id: 'gold', qty: 180 }, // тюнюется
      { t: 'item', defId: 'apple_pie', qty: 5 }, // тюнюется
    ],
    unlockFlags: ['ach.kitchen.master'],
  },
  {
    id: 'ach_anvil_master',
    name: 'Молотобоец',
    condition: { t: 'counterAtLeast', counter: 'craft.batches.anvil', value: 25 },
    rewards: [
      { t: 'currency', id: 'gold', qty: 180 }, // тюнюется
      { t: 'item', defId: 'iron_ingot', qty: 15 }, // тюнюется
    ],
    unlockFlags: ['ach.anvil.master'],
  },
  {
    id: 'ach_first_workshop',
    name: 'Первая мастерская',
    condition: { t: 'counterAtLeast', counter: 'craft.stations.built', value: 1 },
    rewards: [{ t: 'xp', qty: 40 }], // тюнюется
    unlockFlags: ['workshop.built'],
  },
  {
    id: 'ach_full_workshop',
    name: 'Полный набор',
    condition: { t: 'counterAtLeast', counter: 'craft.stations.built', value: 7 }, // все станции фазы 2
    rewards: [
      { t: 'currency', id: 'gold', qty: 500 }, // тюнюется
      { t: 'passivePoint', qty: 1 }, // слушатель M14 (фаза 4)
    ],
    unlockFlags: ['workshop.complete'],
  },
];
