/**
 * Каталог: зелья и наживки — «закрытые полки» магазина (ветка «Категории»,
 * M04 §3: «Наживки», «Зелья»). useAction — только живые гранты (D33).
 * Числа — стартовые (П6), тюнятся здесь без миграций.
 */
import type { ItemDef } from './items';

export const SHELF_ITEMS: ItemDef[] = [
  // --- зелья (полка «Зелья»)
  {
    // [M02.3] hp-расходник для живой проверки ветки grantHp (D33, бриф §2.2)
    id: 'healing_salve',
    name: 'Целебная мазь',
    itemType: 'consumable',
    rarity: 'common',
    basePrice: 12,
    stackable: true,
    maxStack: 50,
    useAction: { effects: [{ t: 'grantHp', value: 15 }] },
    // гейт использования (бриф §2.2: «уровень 2–3, тюнюемое») — живая проба §2.3
    requirements: [{ t: 'playerLevel', level: 2 }],
  },
  {
    id: 'herbal_tea',
    name: 'Травяной чай',
    itemType: 'consumable',
    rarity: 'uncommon',
    basePrice: 22,
    stackable: true,
    maxStack: 50,
    useAction: { effects: [{ t: 'grantEnergy', value: 15 }, { t: 'grantHp', value: 15 }] },
    unlock: { t: 'playerLevel', level: 3 },
  },
  {
    id: 'energy_tonic',
    name: 'Энергетический настой',
    itemType: 'consumable',
    rarity: 'uncommon',
    basePrice: 30,
    stackable: true,
    maxStack: 50,
    useAction: { effects: [{ t: 'grantEnergy', value: 50 }] },
    unlock: { t: 'playerLevel', level: 4 },
  },
  {
    id: 'hp_potion',
    name: 'Зелье лечения',
    itemType: 'consumable',
    rarity: 'uncommon',
    basePrice: 45,
    stackable: true,
    maxStack: 50,
    useAction: { effects: [{ t: 'grantHp', value: 30 }] },
    unlock: { t: 'playerLevel', level: 4 },
  },
  {
    id: 'night_broth',
    name: 'Ночной бульон',
    itemType: 'consumable',
    rarity: 'rare',
    basePrice: 70,
    stackable: true,
    maxStack: 50,
    useAction: { effects: [{ t: 'grantEnergy', value: 40 }, { t: 'grantHp', value: 25 }] },
    // [M04 §4] пример ачивка-гейта: «Нужна ачивка „Первый улов“» — ачивки
    // заведёт M15; до того предмет виден в каталоге с замком (гейты показываем)
    unlock: { t: 'achievement', id: 'first_catch' },
  },
  // --- наживки (полка «Наживки»; рыбалка — M07)
  {
    id: 'worm_bait',
    name: 'Червяк',
    itemType: 'bait',
    rarity: 'common',
    // [M07.2 · D4 · Task 45] 1з → 2з — канон = ратифицированная таблица F5
    // [DECISION: 2/5/25/40/150] (решение №4, 2026-10-25); полка «baits»
    // остаётся закрытой — покупка только fish.buy worm_bait
    basePrice: 2,
    stackable: true,
    maxStack: 50,
  },
  {
    id: 'maggot_bait',
    name: 'Опарыш',
    itemType: 'bait',
    rarity: 'common',
    basePrice: 3,
    stackable: true,
    maxStack: 50,
  },
  {
    id: 'sweet_dough',
    name: 'Сладкое тесто',
    itemType: 'bait',
    rarity: 'common',
    basePrice: 5,
    stackable: true,
    maxStack: 50,
    unlock: { t: 'skill', skill: 'fishing', level: 2 },
  },
  {
    id: 'cricket_bait',
    name: 'Кузнечик',
    itemType: 'bait',
    rarity: 'common',
    basePrice: 8,
    stackable: true,
    maxStack: 50,
    unlock: { t: 'skill', skill: 'fishing', level: 3 },
  },
  {
    id: 'glowing_lure',
    name: 'Светящаяся блесна',
    itemType: 'bait',
    rarity: 'uncommon',
    basePrice: 12,
    stackable: true,
    maxStack: 50,
    unlock: { t: 'skill', skill: 'fishing', level: 4 },
  },
  {
    id: 'spike_lure',
    name: 'Колючая блесна',
    itemType: 'bait',
    rarity: 'uncommon',
    basePrice: 15,
    stackable: true,
    maxStack: 50,
    unlock: { t: 'skill', skill: 'fishing', level: 5 },
  },
];
