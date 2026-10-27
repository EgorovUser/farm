/**
 * DAILY-ПУЛ · торговля и модфорж (M15.2, N8): продажи/покупки/объёмы +
 * рероллы. Продажи — ПРЕДМЕТАМИ (N6: денежного шаблона нет — payload
 * item.sold без gold, [QUESTION] в отчёте). Числа — стартовые (тюнюется, П6).
 */
import type { QuestDef } from '../types';

export const DAILY_TRADE: QuestDef[] = [
  {
    id: 'qd_trade_day',
    kind: 'daily',
    name: 'Торговый день',
    steps: [
      {
        id: 'qd_trade_day_main',
        description: 'Продай 5 предметов',
        condition: { t: 'counterAtLeast', counter: 'sell.items', value: 5 },
        rewards: [
          { t: 'currency', id: 'gold', qty: 45 }, // тюнюется
          { t: 'xp', qty: 30 }, // тюнюется
        ],
      },
    ],
  },
  {
    id: 'qd_sell_bulk',
    kind: 'daily',
    name: 'Большая распродажа',
    steps: [
      {
        id: 'qd_sell_bulk_main',
        description: 'Продай 12 предметов за день',
        condition: { t: 'counterAtLeast', counter: 'sell.items', value: 12 },
        rewards: [
          { t: 'currency', id: 'gold', qty: 85 }, // тюнюется
          { t: 'xp', qty: 50 }, // тюнюется
        ],
      },
    ],
  },
  {
    id: 'qd_supply_run',
    kind: 'daily',
    name: 'Завоз из города',
    steps: [
      {
        id: 'qd_supply_run_main',
        description: 'Купи 2 товара в магазине',
        condition: { t: 'counterAtLeast', counter: 'shop.purchases', value: 2 },
        rewards: [
          { t: 'currency', id: 'gold', qty: 35 }, // тюнюется
          { t: 'xp', qty: 25 }, // тюнюется
        ],
      },
    ],
  },
  {
    id: 'qd_supply_large',
    kind: 'daily',
    name: 'Деловые связи',
    steps: [
      {
        id: 'qd_supply_large_main',
        description: 'Сделай 4 покупки в магазине за день',
        condition: { t: 'counterAtLeast', counter: 'shop.purchases', value: 4 },
        rewards: [
          { t: 'currency', id: 'gold', qty: 65 }, // тюнюется
          { t: 'xp', qty: 40 }, // тюнюется
        ],
      },
    ],
  },
  {
    id: 'qd_big_order',
    kind: 'daily',
    name: 'Крупный заказ',
    steps: [
      {
        id: 'qd_big_order_main',
        description: 'Купи 10 единиц товара суммарно (shop buy ×qty)',
        condition: { t: 'counterAtLeast', counter: 'shop.purchased.qty', value: 10 },
        rewards: [
          { t: 'currency', id: 'gold', qty: 55 }, // тюнюется
          { t: 'item', defId: 'apple_pie', qty: 2 }, // тюнюется
        ],
      },
    ],
  },
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
];
