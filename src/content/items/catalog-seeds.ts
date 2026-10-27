/**
 * Каталог: семена (03-DATA §4; посадка — M05, данные опережают системы — П1).
 * Числа — стартовые (П6), тюнятся здесь без миграций. Имена — в def (locale
 * для валют/систем, предметы носят имя с собой — прецедент фазы 0).
 */
import type { ItemDef } from './items';

export const SEED_ITEMS: ItemDef[] = [
  {
    id: 'seed_turnip',
    name: 'Семена репы',
    itemType: 'seed',
    rarity: 'common',
    basePrice: 5,
    stackable: true,
    // [M02] карточка §2: семена — до 50 (было 500 в демо фазы 0)
    maxStack: 50,
  },
  {
    id: 'seed_carrot',
    name: 'Семена моркови',
    itemType: 'seed',
    rarity: 'common',
    basePrice: 8,
    stackable: true,
    maxStack: 50,
    // [M04] гейт-предмет §4: виден в каталоге с замком до уровня (П6)
    unlock: { t: 'playerLevel', level: 2 },
  },
  {
    id: 'seed_potato',
    name: 'Семена картофеля',
    itemType: 'seed',
    rarity: 'common',
    basePrice: 10,
    stackable: true,
    maxStack: 50,
    unlock: { t: 'playerLevel', level: 3 },
  },
  {
    id: 'seed_wheat',
    name: 'Семена пшеницы',
    itemType: 'seed',
    rarity: 'common',
    basePrice: 12,
    stackable: true,
    maxStack: 50,
    unlock: { t: 'playerLevel', level: 4 },
  },
  {
    id: 'seed_tomato',
    name: 'Семена томатов',
    itemType: 'seed',
    rarity: 'common',
    basePrice: 18,
    stackable: true,
    maxStack: 50,
    unlock: { t: 'playerLevel', level: 6 },
  },
  {
    id: 'seed_strawberry',
    name: 'Семена клубники',
    itemType: 'seed',
    rarity: 'uncommon',
    basePrice: 25,
    stackable: true,
    maxStack: 50,
    unlock: { t: 'playerLevel', level: 8 },
  },
  {
    id: 'seed_pumpkin',
    name: 'Семена тыквы',
    itemType: 'seed',
    rarity: 'uncommon',
    basePrice: 30,
    stackable: true,
    maxStack: 50,
    unlock: { t: 'playerLevel', level: 10 },
  },
  {
    id: 'seed_corn',
    name: 'Семена кукурузы',
    itemType: 'seed',
    rarity: 'uncommon',
    basePrice: 35,
    stackable: true,
    maxStack: 50,
    unlock: { t: 'playerLevel', level: 12 },
  },
  {
    id: 'seed_sunflower',
    name: 'Семена подсолнуха',
    itemType: 'seed',
    rarity: 'rare',
    basePrice: 45,
    stackable: true,
    maxStack: 50,
    unlock: { t: 'playerLevel', level: 14 },
  },
  {
    id: 'seed_lavender',
    name: 'Семена лаванды',
    itemType: 'seed',
    rarity: 'rare',
    basePrice: 60,
    stackable: true,
    maxStack: 50,
    unlock: { t: 'playerLevel', level: 16 },
  },
  // [M05.1 · F5 · [QUESTION] №1 сеанса] семена культур карточки M05 §2
  // (грибы/виноград), дефов не было — добавлены АДДИТИВНО (громко, НЕ молча),
  // пул магазина M04 НЕ тронут: посадка до вкладок «Грибница»/«Виноградник»
  // (M05.3) недоступна по allowedTabs, в ротации магазина их нет. Числа —
  // стартовые по времени роста (П6); ратификация — при приёмке.
  {
    id: 'seed_mushroom',
    name: 'Споры грибов',
    itemType: 'seed',
    rarity: 'common',
    basePrice: 6,
    stackable: true,
    maxStack: 50,
  },
  {
    id: 'seed_grape',
    name: 'Черенки винограда',
    itemType: 'seed',
    rarity: 'uncommon',
    basePrice: 50,
    stackable: true,
    maxStack: 50,
    unlock: { t: 'playerLevel', level: 15 },
  },
];
