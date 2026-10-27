/**
 * DAILY-ПУЛ · крафт (M15.2, N8): партии + станции (фильтр счётчика по полю
 * station события craft.completed). Качество — N8-факт: payload quality
 * вложенный, плоский фильтр счётчиков его не видит (данные → отчёт).
 * Числа — стартовые (тюнюется, П6). Сборка пула — daily.ts.
 */
import type { QuestDef } from '../types';

export const DAILY_CRAFT: QuestDef[] = [
  {
    id: 'qd_craft_shift',
    kind: 'daily',
    name: 'Мастеровая смена',
    steps: [
      {
        id: 'qd_craft_shift_main',
        description: 'Скрафти 2 партии на станциях',
        condition: { t: 'counterAtLeast', counter: 'craft.batches', value: 2 },
        rewards: [
          { t: 'currency', id: 'gold', qty: 50 }, // тюнюется
          { t: 'currency', id: 'planks', qty: 8 }, // тюнюется
          { t: 'xp', qty: 35 }, // тюнюется
        ],
      },
    ],
  },
  {
    id: 'qd_craft_bulk',
    kind: 'daily',
    name: 'Оптовая партия',
    steps: [
      {
        id: 'qd_craft_bulk_main',
        description: 'Скрафти 4 партии за день',
        condition: { t: 'counterAtLeast', counter: 'craft.batches', value: 4 },
        rewards: [
          { t: 'currency', id: 'gold', qty: 80 }, // тюнюется
          { t: 'xp', qty: 50 }, // тюнюется
        ],
      },
    ],
  },
  {
    id: 'qd_craft_workbench',
    kind: 'daily',
    name: 'Смена у верстака',
    steps: [
      {
        id: 'qd_craft_workbench_main',
        description: 'Скрафти 1 партию на верстаке',
        condition: { t: 'counterAtLeast', counter: 'craft.batches.workbench', value: 1 },
        rewards: [
          { t: 'currency', id: 'gold', qty: 40 }, // тюнюется
          { t: 'xp', qty: 30 }, // тюнюется
        ],
      },
    ],
  },
  {
    id: 'qd_craft_smelter',
    kind: 'daily',
    name: 'Жар плавильни',
    steps: [
      {
        id: 'qd_craft_smelter_main',
        description: 'Скрафти 1 партию в плавильне',
        condition: { t: 'counterAtLeast', counter: 'craft.batches.smelter', value: 1 },
        rewards: [
          { t: 'currency', id: 'gold', qty: 40 }, // тюнюется
          { t: 'currency', id: 'coal', qty: 5 }, // тюнюется
          { t: 'xp', qty: 30 }, // тюнюется
        ],
      },
    ],
  },
  {
    id: 'qd_craft_kitchen',
    kind: 'daily',
    name: 'У кухонного котла',
    steps: [
      {
        id: 'qd_craft_kitchen_main',
        description: 'Приготовь 1 партию на кухне',
        condition: { t: 'counterAtLeast', counter: 'craft.batches.kitchen', value: 1 },
        rewards: [
          { t: 'currency', id: 'gold', qty: 35 }, // тюнюется
          { t: 'item', defId: 'bread', qty: 2 }, // тюнюется
          { t: 'xp', qty: 25 }, // тюнюется
        ],
      },
    ],
  },
  {
    id: 'qd_craft_anvil',
    kind: 'daily',
    name: 'Наковальня гудит',
    steps: [
      {
        id: 'qd_craft_anvil_main',
        description: 'Скрафти 1 партию на наковальне',
        condition: { t: 'counterAtLeast', counter: 'craft.batches.anvil', value: 1 },
        rewards: [
          { t: 'currency', id: 'gold', qty: 45 }, // тюнюется
          { t: 'xp', qty: 30 }, // тюнюется
        ],
      },
    ],
  },
];
