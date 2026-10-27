/**
 * DAILY-ПУЛ · торговля (M15.2 §4.3 + FIX-PHASE-2 §4.6): продажи предметов
 * (sell.items) и ДЕНЕЖНЫЙ шаблон (sell.gold — N6 введён ОБЕИМИ частями по
 * маркеру карточки M15 §3 / Task 29: payload item.sold обогащён полем gold
 * + счётчик sell.gold {event: item.sold, valueKey: gold} данными), покупки,
 * объёмы. Числа — стартовые (тюнюется, П6). Часть пула daily.ts (распил >500,
 * §4.8).
 */
import type { QuestDef } from './types';

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
    // [FIX-PHASE-2 · 4.6 · N6] денежный daily-шаблон — ввод ОБЕИМИ частями
    // (маркер карточки M15 §3, вариант (а), Task 29): счётчик sell.gold
    // суммирует поле gold payload item.sold (порог — content, тюнюется)
    id: 'qd_gold_rush',
    kind: 'daily',
    name: 'Золотая лихорадка',
    steps: [
      {
        id: 'qd_gold_rush_main',
        description: 'Продай товаров на 150 золота за день',
        condition: { t: 'counterAtLeast', counter: 'sell.gold', value: 150 }, // тюнюется
        rewards: [
          { t: 'currency', id: 'gold', qty: 70 }, // тюнюется
          { t: 'xp', qty: 45 }, // тюнюется
        ],
      },
    ],
  },
];
