/**
 * АЧИВКИ · торговля (M15.2 §5): покупки (порог ach_regular_customer 100 —
 * буква карточки §5), объёмы, продажи, добыча предметов. КАЖДАЯ несёт
 * unlockFlags. Числа — стартовые (тюнюется, П6). Часть ACHIEVEMENTS
 * (распил §4.8).
 */
import type { AchievementDef } from './types';

export const ACHIEVEMENTS_TRADE: AchievementDef[] = [
  {
    id: 'ach_regular_customer',
    name: 'Постоянный клиент',
    // карточка §5: 100 покупок (порог M15.1 был 25 — поднят, комментарий M15.1)
    condition: { t: 'counterAtLeast', counter: 'shop.purchases', value: 100 },
    rewards: [{ t: 'currency', id: 'gold', qty: 300 }], // тюнюется
    unlockFlags: ['ach.shop.regular'], // гейт ассортимента M04 (фикстура «Карта клиента»)
  },
  {
    id: 'ach_shop_patron',
    name: 'Меценат',
    condition: { t: 'counterAtLeast', counter: 'shop.purchases', value: 250 },
    rewards: [
      { t: 'currency', id: 'gold', qty: 800 }, // тюнюется
      { t: 'xp', qty: 300 }, // тюнюется
    ],
    unlockFlags: ['ach.shop.patron'],
  },
  {
    id: 'ach_wholesaler',
    name: 'Оптовик',
    condition: { t: 'counterAtLeast', counter: 'shop.purchased.qty', value: 500 },
    rewards: [{ t: 'currency', id: 'gold', qty: 400 }], // тюнюется
    unlockFlags: ['ach.shop.wholesale'],
  },
  {
    id: 'ach_merchant',
    name: 'Торговец',
    condition: { t: 'counterAtLeast', counter: 'sell.items', value: 50 },
    rewards: [{ t: 'currency', id: 'gold', qty: 250 }], // тюнюется
    unlockFlags: ['ach.trade.merchant'], // гейт ассортимента M04 (фикстура «Весы торговца»)
  },
  {
    id: 'ach_magnate',
    name: 'Магнат',
    condition: { t: 'counterAtLeast', counter: 'sell.items', value: 200 },
    rewards: [
      { t: 'currency', id: 'gold', qty: 700 }, // тюнюется
      { t: 'xp', qty: 300 }, // тюнюется
    ],
    unlockFlags: ['ach.trade.magnate'],
  },
  {
    id: 'ach_trade_empire',
    name: 'Торговая империя',
    condition: { t: 'counterAtLeast', counter: 'sell.items', value: 500 },
    rewards: [
      { t: 'passivePoint', qty: 1 }, // слушатель M14 (фаза 4)
      { t: 'item', defId: 'phoenix_charm', qty: 1 }, // тюнюется (крупная)
    ],
    unlockFlags: ['ach.trade.empire'],
  },
  {
    id: 'ach_collector',
    name: 'Коллекционер',
    condition: { t: 'counterAtLeast', counter: 'items.acquired', value: 100 },
    rewards: [{ t: 'currency', id: 'gold', qty: 200 }], // тюнюется
    unlockFlags: ['ach.items.collector'],
  },
  {
    id: 'ach_hoarder',
    name: 'Скопидом',
    condition: { t: 'counterAtLeast', counter: 'items.acquired', value: 500 },
    rewards: [
      { t: 'currency', id: 'gold', qty: 600 }, // тюнюется
      { t: 'item', defId: 'star_gem', qty: 1 }, // тюнюется (крупная)
    ],
    unlockFlags: ['ach.items.hoarder'],
  },
];
