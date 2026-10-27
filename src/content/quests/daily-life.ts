/**
 * DAILY-ПУЛ · быт хутора (M15.2 §4.3): модфорж (рероллы), инвентарь
 * (пополнение/расход), игрок (энергия). Числа — стартовые (тюнюется, П6).
 * Часть пула daily.ts (распил >500, §4.8).
 */
import type { QuestDef } from './types';

export const DAILY_LIFE: QuestDef[] = [
  // --- модфорж (рероллы)
  {
    id: 'qd_reroll_lab',
    kind: 'daily',
    name: 'Реролл-эксперимент',
    steps: [
      {
        id: 'qd_reroll_lab_main',
        description: 'Перекуй моды предмета 1 раз (mods reroll)',
        condition: { t: 'counterAtLeast', counter: 'modforge.rerolls', value: 1 },
        rewards: [
          { t: 'currency', id: 'gold', qty: 30 }, // тюнюется
          { t: 'xp', qty: 25 }, // тюнюется
        ],
      },
    ],
  },
  {
    id: 'qd_reroll_master',
    kind: 'daily',
    name: 'Перековка судьбы',
    steps: [
      {
        id: 'qd_reroll_master_main',
        description: 'Перекуй моды 3 раза за день',
        condition: { t: 'counterAtLeast', counter: 'modforge.rerolls', value: 3 },
        rewards: [
          { t: 'currency', id: 'gold', qty: 75 }, // тюнюется
          { t: 'xp', qty: 45 }, // тюнюется
        ],
      },
    ],
  },
  // --- инвентарь (пополнение/расход)
  {
    id: 'qd_stock_up',
    kind: 'daily',
    name: 'Пополни рюкзак',
    steps: [
      {
        id: 'qd_stock_up_main',
        description: 'Добудь 8 предметов (покупка/крафт/награды)',
        condition: { t: 'counterAtLeast', counter: 'items.acquired', value: 8 },
        rewards: [
          { t: 'currency', id: 'gold', qty: 40 }, // тюнюется
          { t: 'xp', qty: 30 }, // тюнюется
        ],
      },
    ],
  },
  {
    id: 'qd_full_pockets',
    kind: 'daily',
    name: 'Полные карманы',
    steps: [
      {
        id: 'qd_full_pockets_main',
        description: 'Добудь 15 предметов за день',
        condition: { t: 'counterAtLeast', counter: 'items.acquired', value: 15 },
        rewards: [
          { t: 'currency', id: 'gold', qty: 70 }, // тюнюется
          { t: 'xp', qty: 45 }, // тюнюется
        ],
      },
    ],
  },
  {
    id: 'qd_hearty_lunch',
    kind: 'daily',
    name: 'Запасливый обед',
    steps: [
      {
        id: 'qd_hearty_lunch_main',
        description: 'Используй 3 расходника (inv use)',
        condition: { t: 'counterAtLeast', counter: 'consume.items', value: 3 },
        rewards: [
          { t: 'currency', id: 'gold', qty: 30 }, // тюнюется
          { t: 'item', defId: 'herbal_tea', qty: 1 }, // тюнюется
        ],
      },
    ],
  },
  // --- игрок (энергия)
  {
    id: 'qd_workday',
    kind: 'daily',
    name: 'Рабочий день',
    steps: [
      {
        id: 'qd_workday_main',
        description: 'Потрать 40 энергии (крафт, заточка, дела)',
        condition: { t: 'counterAtLeast', counter: 'player.energy.spent', value: 40 },
        rewards: [
          { t: 'currency', id: 'gold', qty: 50 }, // тюнюется
          { t: 'xp', qty: 35 }, // тюнюется
        ],
      },
    ],
  },
  // --- ферма (M05.3 · G6: прецедент N6 qd_gold_rush — событие живой системы
  //     фазы 3 данными; пул daily 31 → 32)
  {
    id: 'qd_harvest_day',
    kind: 'daily',
    name: 'Жатва',
    steps: [
      {
        id: 'qd_harvest_day_main',
        description: 'Собери 20 единиц урожая (картошка, грибы, лоза…)',
        condition: { t: 'counterAtLeast', counter: 'farm.harvest.units', value: 20 },
        rewards: [
          { t: 'currency', id: 'gold', qty: 60 }, // тюнюется
          { t: 'xp', qty: 45 }, // тюнюется
        ],
      },
    ],
  },
];
