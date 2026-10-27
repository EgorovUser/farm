/**
 * Каталог: предметы крафта M09 (03-DATA §4) — входы и выходы рецептов.
 * Существующие предметы переиспользуются (iron_ore/iron_ingot/cloth/rope/
 * river_perch/hearty_stew/shovel/watering_can/repair_kit/кирка/меч/броня…),
 * здесь — только новые. НЕ добавляются в пул магазина (пул — M04, оракулы
 * ротации сидированы): добыча — крафт, give-debug, будущие источники (wool/
 * egg — животноводство M06).
 *
 * Зелья алхимии — компоненты-заготовки: useAction-эффект 'modifier' заморожен
 * D36 (M02.3), активные бафы — после спека-процесса ([QUESTION] в recipes.ts).
 * Числа — стартовые (П6), тюнятся здесь без миграций.
 */
import type { ItemDef } from './items';

export const CRAFT_ITEMS: ItemDef[] = [
  // --- инструменты (верстак → плуг для фермы M05)
  {
    id: 'plow',
    name: 'Плуг',
    itemType: 'tool',
    subType: 'plow',
    rarity: 'common',
    basePrice: 60,
    durabilityMax: 60,
  },
  // --- сырьё (входы цепочек; wool/egg даст животноводство M06)
  {
    id: 'wool',
    name: 'Шерсть',
    itemType: 'component',
    rarity: 'common',
    // [M07.2 · D1 · Task 45] 7з → 15з — канон брифа M06.1 «3/15» (решение №1, 2026-10-25)
    basePrice: 15,
    stackable: true,
    maxStack: 200,
  },
  {
    id: 'egg',
    name: 'Яйцо',
    itemType: 'component',
    rarity: 'common',
    // [M07.2 · D1 · Task 45] 5з → 3з — канон брифа M06.1 «3/15» (решение №1, 2026-10-25)
    basePrice: 3,
    stackable: true,
    maxStack: 200,
  },
  {
    id: 'iron_plate',
    name: 'Железная пластина',
    itemType: 'component',
    rarity: 'uncommon',
    basePrice: 26,
    stackable: true,
    maxStack: 200,
  },
  // --- кожевенный верстак: трофей-рюкзак (+4 слота за скрафт) и изделия
  {
    id: 'backpack',
    name: 'Рюкзак',
    itemType: 'treasure',
    rarity: 'uncommon',
    basePrice: 150,
    stackable: false,
    // слоты даёт craftStationProvider за КАЖДУЮ скрафченную партию (рецепт
    // tn_backpack: effects +4 flat player.inventory.slots, кап 60 — M02);
    // продажа трофея бонус не отбирает (cozy, [DECISION] M09)
  },
  // --- ткацкий станок: одежда и знамёна
  {
    id: 'warm_scarf',
    name: 'Тёплый шарф',
    itemType: 'consumable',
    rarity: 'common',
    basePrice: 18,
    stackable: true,
    maxStack: 50,
    useAction: { effects: [{ t: 'grantHp', value: 12 }] },
  },
  {
    id: 'woven_banner',
    name: 'Знамя хутора',
    itemType: 'treasure',
    rarity: 'uncommon',
    basePrice: 80,
    stackable: false,
    // декор деревни M16 (giftable-шов M02 §3): пока — продаваемый трофей
  },
  // --- кухня: еда (энергия/HP; «временные модификаторы» — [QUESTION] D36)
  {
    id: 'omelet',
    name: 'Омлет',
    itemType: 'consumable',
    rarity: 'common',
    basePrice: 18,
    stackable: true,
    maxStack: 50,
    useAction: { effects: [{ t: 'grantEnergy', value: 20 }] },
  },
  {
    id: 'fish_soup',
    name: 'Рыбный суп',
    itemType: 'consumable',
    rarity: 'uncommon',
    basePrice: 34,
    stackable: true,
    maxStack: 50,
    useAction: { effects: [{ t: 'grantEnergy', value: 30 }, { t: 'grantHp', value: 10 }] },
  },
  {
    id: 'spiced_stew',
    name: 'Пряное рагу',
    itemType: 'consumable',
    rarity: 'uncommon',
    basePrice: 40,
    stackable: true,
    maxStack: 50,
    useAction: { effects: [{ t: 'grantEnergy', value: 45 }] },
  },
  // --- алхимия: зелья-заготовки (боевые/роста/удча) и лекарства
  {
    id: 'battle_draught',
    name: 'Боевой отвар',
    itemType: 'component',
    rarity: 'uncommon',
    basePrice: 30,
    stackable: true,
    maxStack: 50,
  },
  {
    id: 'growth_elixir',
    name: 'Эликсир роста',
    itemType: 'component',
    rarity: 'uncommon',
    basePrice: 32,
    stackable: true,
    maxStack: 50,
  },
  {
    id: 'luck_elixir',
    name: 'Эликсир удачи',
    itemType: 'component',
    rarity: 'rare',
    basePrice: 55,
    stackable: true,
    maxStack: 50,
  },
  {
    id: 'animal_remedy',
    name: 'Лекарство для животных',
    itemType: 'component',
    rarity: 'common',
    basePrice: 16,
    stackable: true,
    maxStack: 50,
    // лекарства для рыб/животных (карточка §2): потребители — M06/M08
  },
];
