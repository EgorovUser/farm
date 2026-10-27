/**
 * DAILY-ПУЛ · инвентарь и игрок (M15.2, N8): пополнение/расход/энергия.
 * Числа — стартовые (тюнюется, П6). Сборка пула — daily.ts.
 */
import type { QuestDef } from '../types';

export const DAILY_LIFE: QuestDef[] = [
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
];
