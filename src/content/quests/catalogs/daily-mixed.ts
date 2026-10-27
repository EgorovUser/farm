/**
 * DAILY-ПУЛ · смешанные (M15.2, §4.3): «полный цикл: купи → скрафти → заточи»
 * и другие комбинации — ОДНИМ шагом {t:'all'} (evaluate.ts: N/K «сколько из»).
 * Числа — стартовые (тюнюется, П6). Сборка пула — daily.ts.
 */
import type { QuestDef } from '../types';

export const DAILY_MIXED: QuestDef[] = [
  {
    id: 'qd_full_cycle',
    kind: 'daily',
    name: 'Полный цикл',
    steps: [
      {
        id: 'qd_full_cycle_main',
        description: 'Сделай полный цикл: купи 1 товар → скрафти 1 партию → сделай 1 попытку заточки',
        condition: {
          t: 'all',
          cs: [
            { t: 'counterAtLeast', counter: 'shop.purchases', value: 1 },
            { t: 'counterAtLeast', counter: 'craft.batches', value: 1 },
            { t: 'counterAtLeast', counter: 'forge.attempts', value: 1 },
          ],
        },
        rewards: [
          { t: 'currency', id: 'gold', qty: 65 }, // тюнюется
          { t: 'xp', qty: 45 }, // тюнюется
        ],
      },
    ],
  },
  {
    id: 'qd_production_line',
    kind: 'daily',
    name: 'От станка до прилавка',
    steps: [
      {
        id: 'qd_production_line_main',
        description: 'Производственная цепочка: партия крафта → успешная заточка → продажа предмета',
        condition: {
          t: 'all',
          cs: [
            { t: 'counterAtLeast', counter: 'craft.batches', value: 1 },
            { t: 'counterAtLeast', counter: 'forge.success', value: 1 },
            { t: 'counterAtLeast', counter: 'sell.items', value: 1 },
          ],
        },
        rewards: [
          { t: 'currency', id: 'gold', qty: 60 }, // тюнюется
          { t: 'xp', qty: 40 }, // тюнюется
        ],
      },
    ],
  },
  {
    id: 'qd_trade_triangle',
    kind: 'daily',
    name: 'Купи-продай',
    steps: [
      {
        id: 'qd_trade_triangle_main',
        description: 'Оборот дня: 2 покупки и 2 продажи',
        condition: {
          t: 'all',
          cs: [
            { t: 'counterAtLeast', counter: 'shop.purchases', value: 2 },
            { t: 'counterAtLeast', counter: 'sell.items', value: 2 },
          ],
        },
        rewards: [
          { t: 'currency', id: 'gold', qty: 45 }, // тюнюется
          { t: 'xp', qty: 30 }, // тюнюется
        ],
      },
    ],
  },
  {
    id: 'qd_steam_workshop',
    kind: 'daily',
    name: 'Пар из мастерской',
    steps: [
      {
        id: 'qd_steam_workshop_main',
        description: 'Двойная смена: 2 партии крафта и 2 попытки заточки',
        condition: {
          t: 'all',
          cs: [
            { t: 'counterAtLeast', counter: 'craft.batches', value: 2 },
            { t: 'counterAtLeast', counter: 'forge.attempts', value: 2 },
          ],
        },
        rewards: [
          { t: 'currency', id: 'gold', qty: 55 }, // тюнюется
          { t: 'currency', id: 'planks', qty: 6 }, // тюнюется
        ],
      },
    ],
  },
  {
    id: 'qd_supply_and_demand',
    kind: 'daily',
    name: 'Добыча и сбыт',
    steps: [
      {
        id: 'qd_supply_and_demand_main',
        description: 'Добудь 5 предметов и продай 3 из них',
        condition: {
          t: 'all',
          cs: [
            { t: 'counterAtLeast', counter: 'items.acquired', value: 5 },
            { t: 'counterAtLeast', counter: 'sell.items', value: 3 },
          ],
        },
        rewards: [
          { t: 'currency', id: 'gold', qty: 50 }, // тюнюется
          { t: 'xp', qty: 35 }, // тюнюется
        ],
      },
    ],
  },
  {
    id: 'qd_perfectionism',
    kind: 'daily',
    name: 'Совершенство во всём',
    steps: [
      {
        id: 'qd_perfectionism_main',
        description: 'Улучши и снаряжение, и себя: 1 успешная заточка и 1 реролл модов',
        condition: {
          t: 'all',
          cs: [
            { t: 'counterAtLeast', counter: 'forge.success', value: 1 },
            { t: 'counterAtLeast', counter: 'modforge.rerolls', value: 1 },
          ],
        },
        rewards: [
          { t: 'currency', id: 'gold', qty: 50 }, // тюнюется
          { t: 'xp', qty: 35 }, // тюнюется
        ],
      },
    ],
  },
  {
    id: 'qd_market_day',
    kind: 'daily',
    name: 'Ярмарочный день',
    steps: [
      {
        id: 'qd_market_day_main',
        description: 'Ярмарка в разгаре: покупка, 4 продажи и 6 добытых предметов',
        condition: {
          t: 'all',
          cs: [
            { t: 'counterAtLeast', counter: 'shop.purchases', value: 1 },
            { t: 'counterAtLeast', counter: 'sell.items', value: 4 },
            { t: 'counterAtLeast', counter: 'items.acquired', value: 6 },
          ],
        },
        rewards: [
          { t: 'currency', id: 'gold', qty: 60 }, // тюнюется
          { t: 'item', defId: 'honey', qty: 2 }, // тюнюется
          { t: 'xp', qty: 40 }, // тюнюется
        ],
      },
    ],
  },
];
