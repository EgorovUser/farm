/**
 * АЧИВКИ · модфорж/игрок/инвентарь (M15.2, карточка §5): рероллы (hidden
 * «Терпение»), уровни (playerLevel — lifetime, НЕ daily-материал N9),
 * энергия, расход, коллекции предметов. Числа — стартовые (тюнюется, П6).
 */
import type { AchievementDef } from '../types';

export const ACH_LIFE: AchievementDef[] = [
  {
    id: 'ach_reroll_gourmet',
    name: 'Реролл-гурман',
    condition: { t: 'counterAtLeast', counter: 'modforge.rerolls', value: 10 },
    rewards: [{ t: 'xp', qty: 80 }], // тюнюется
    unlockFlags: ['ach.modforge.rerolls'], // гейт ассортимента M04 (фикстура «Монета перерождений»)
  },
  {
    id: 'ach_rivens_alchemist',
    name: 'Алхимик ривенов',
    condition: { t: 'counterAtLeast', counter: 'modforge.rerolls', value: 50 },
    rewards: [
      { t: 'currency', id: 'gold', qty: 350 }, // тюнюется
      { t: 'xp', qty: 200 }, // тюнюется
    ],
    unlockFlags: ['ach.modforge.alchemist'],
  },
  {
    id: 'ach_patience',
    name: 'Терпение',
    hidden: true, // пасхалка: 100 рероллов — путь мастера долог
    condition: { t: 'counterAtLeast', counter: 'modforge.rerolls', value: 100 },
    rewards: [{ t: 'passivePoint', qty: 1 }], // слушатель M14 (фаза 4)
    unlockFlags: ['ach.modforge.patience'],
  },
  {
    id: 'ach_growing_up',
    name: 'Крепнущий хозяин',
    condition: { t: 'playerLevel', level: 5 },
    rewards: [{ t: 'xp', qty: 30 }], // тюнюется
    unlockFlags: ['player.level5'],
  },
  {
    id: 'ach_mature_master',
    name: 'Зрелый мастер',
    condition: { t: 'playerLevel', level: 10 },
    rewards: [{ t: 'currency', id: 'gold', qty: 200 }], // тюнюется
    unlockFlags: ['player.level10'],
  },
  {
    id: 'ach_homestead_glory',
    name: 'Слава хутора',
    condition: { t: 'playerLevel', level: 20 },
    rewards: [
      { t: 'currency', id: 'gold', qty: 600 }, // тюнюется
      { t: 'item', defId: 'lucky_charm', qty: 1 }, // тюнюется
    ],
    unlockFlags: ['player.level20'],
  },
  {
    id: 'ach_valley_legend',
    name: 'Легенда долины',
    condition: { t: 'playerLevel', level: 30 },
    rewards: [
      { t: 'passivePoint', qty: 1 }, // слушатель M14 (фаза 4)
      { t: 'item', defId: 'ancient_idol', qty: 1 }, // тюнюется (крупная)
    ],
    unlockFlags: ['player.level30'],
  },
  {
    id: 'ach_hard_worker',
    name: 'Трудяга',
    condition: { t: 'counterAtLeast', counter: 'player.energy.spent', value: 1000 },
    rewards: [
      { t: 'currency', id: 'gold', qty: 200 }, // тюнюется
      { t: 'item', defId: 'energy_tonic', qty: 3 }, // тюнюется
    ],
    unlockFlags: ['player.hardworker'],
  },
  {
    id: 'ach_tireless',
    name: 'Неутомимый',
    condition: { t: 'counterAtLeast', counter: 'player.energy.spent', value: 5000 },
    rewards: [
      { t: 'passivePoint', qty: 1 }, // слушатель M14 (фаза 4)
      { t: 'xp', qty: 350 }, // тюнюется
    ],
    unlockFlags: ['player.tireless'],
  },
  {
    id: 'ach_simple_tastes',
    name: 'Неприхотливый',
    condition: { t: 'counterAtLeast', counter: 'consume.items', value: 100 },
    rewards: [{ t: 'currency', id: 'gold', qty: 150 }], // тюнюется
    unlockFlags: ['ach.consume.simple'],
  },
  {
    id: 'ach_gourmet_life',
    name: 'Живу со вкусом',
    condition: { t: 'counterAtLeast', counter: 'consume.items', value: 500 },
    rewards: [
      { t: 'currency', id: 'gold', qty: 500 }, // тюнюется
      { t: 'item', defId: 'hearty_stew', qty: 3 }, // тюнюется
    ],
    unlockFlags: ['ach.consume.gourmet'],
  },
  {
    id: 'ach_potion_collection',
    name: 'Зельевар',
    condition: {
      t: 'all',
      cs: [
        { t: 'hasItem', defId: 'growth_elixir', qty: 1 },
        { t: 'hasItem', defId: 'luck_elixir', qty: 1 },
        { t: 'hasItem', defId: 'battle_draught', qty: 1 },
      ],
    },
    rewards: [
      { t: 'currency', id: 'gold', qty: 300 }, // тюнюется
      { t: 'xp', qty: 150 }, // тюнюется
    ],
    unlockFlags: ['ach.items.potions'],
  },
];
