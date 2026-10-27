/**
 * Каталог: инструменты, снаряжение, редкости (03-DATA §4).
 * modSlots — только на скоупах с достаточными кандидатами реестра
 * (инвариент C3 · AUDIT-M03: candidates ≥ maxPos редкости; чек — в M04-группе).
 * [DECISION · M04.1] лопата/лейка/лук — БЕЗ modSlots: статов их скоупов в
 * реестре нет (инвариант «stat только на существующие базы», прецедент M02.2);
 * слоты добавит владелец системы (M05 ферма / M12 шахта) строкой реестра.
 */
import type { ItemDef } from './items';

export const GEAR_ITEMS: ItemDef[] = [
  // --- инструменты
  {
    id: 'iron_pickaxe',
    name: 'Железная кирка',
    itemType: 'tool',
    subType: 'pickaxe',
    rarity: 'uncommon',
    basePrice: 120,
    durabilityMax: 100,
    // [M03.1] ривен-слоты: budgetBase выровнен с uncommon-строкой таблицы §4
    // (16). Канон заказчика «кирка common → бюджет 10» ждёт common-кирку
    // будущих тиров (владелец инструментария шахты — M12)
    modSlots: { budgetBase: 16, tags: ['tool', 'pickaxe'] },
  },
  {
    // базовый ассортимент M04 §2 («базовые лопата и лейка»)
    id: 'shovel',
    name: 'Лопата',
    itemType: 'tool',
    subType: 'shovel',
    rarity: 'common',
    basePrice: 45,
    durabilityMax: 60,
  },
  {
    id: 'watering_can',
    name: 'Лейка',
    itemType: 'tool',
    subType: 'wateringCan',
    rarity: 'common',
    basePrice: 40,
    durabilityMax: 60,
  },
  {
    id: 'steel_pickaxe',
    name: 'Стальная кирка',
    itemType: 'tool',
    subType: 'pickaxe',
    rarity: 'rare',
    basePrice: 400,
    durabilityMax: 140,
    // [M04.1 · C3] rare [2,2] — кандидатов tool/pickaxe стало 2 (mine_instinct)
    modSlots: { budgetBase: 25, tags: ['tool', 'pickaxe'] },
    unlock: { t: 'playerLevel', level: 8 },
  },
  {
    // [FIX-PHASE-2 · 4.2] буква карточки M09 §2: наковальня — «инструменты
    // (кирки, топоры, удочки)»; топоры раньше отсутствовали в каталоге
    id: 'iron_axe',
    name: 'Железный топор',
    itemType: 'tool',
    subType: 'axe',
    rarity: 'uncommon',
    basePrice: 140, // тюнюется
    durabilityMax: 100,
    modSlots: { budgetBase: 16, tags: ['tool', 'axe'] }, // uncommon-строка §4 (16)
  },
  {
    id: 'steel_axe',
    name: 'Стальной топор',
    itemType: 'tool',
    subType: 'axe',
    rarity: 'rare',
    basePrice: 420, // тюнюется
    durabilityMax: 140,
    modSlots: { budgetBase: 25, tags: ['tool', 'axe'] },
    unlock: { t: 'playerLevel', level: 10 },
  },
  // --- снаряжение
  {
    id: 'iron_sword',
    name: 'Железный меч',
    itemType: 'weapon',
    subType: 'sword',
    rarity: 'uncommon',
    basePrice: 140,
    durabilityMax: 80,
    // гейт использования (карточка §3): уровень 5, причина видна игроку
    requirements: [{ t: 'playerLevel', level: 5 }],
    // БАЗА стата (П2): отдаётся шиной через equipmentProvider (M02.2)
    baseStats: { 'combat.attack': 12 },
    // предмет может принять ривен-роллы (M03); [M03.1] budgetBase выровнен с
    // uncommon-строкой таблицы §4 (16) — стартовое число M02.2 было приёмочным
    modSlots: { budgetBase: 16, tags: ['weapon', 'melee'] },
  },
  {
    id: 'leather_armor',
    name: 'Кожаная броня',
    itemType: 'armor',
    rarity: 'common',
    basePrice: 90,
    durabilityMax: 60,
    baseStats: { 'combat.defense': 6 },
  },
  {
    id: 'buckler',
    name: 'Баклер',
    itemType: 'shield',
    rarity: 'common',
    basePrice: 70,
    durabilityMax: 50,
    baseStats: { 'combat.block': 4 },
  },
  {
    id: 'willow_rod',
    name: 'Вербы удочка',
    itemType: 'rod',
    subType: 'rod',
    rarity: 'common',
    basePrice: 60,
    durabilityMax: 40,
    // [M03.1] budgetBase выровнен с common-строкой таблицы §4 (10)
    modSlots: { budgetBase: 10, tags: ['rod'] },
  },
  {
    // [FIX-PHASE-2 · 4.2] удочка крафта на наковальне (буква M09 §2).
    // [DECISION] БЕЗ ривен-слотов (прецедент buckler): в скоупе 'rod' один мод
    // реестра — uncommon-строка [1,2] сломала бы C3-инвариант M03/M04
    // (candidates ≥ maxPos); слоты — прерогатива ролового снаряжения (willow_rod)
    id: 'oak_rod',
    name: 'Дубовая удочка',
    itemType: 'rod',
    subType: 'rod',
    rarity: 'uncommon',
    basePrice: 150, // тюнюется
    durabilityMax: 60,
    unlock: { t: 'playerLevel', level: 6 },
  },
  {
    id: 'hunting_bow',
    name: 'Охотничий лук',
    itemType: 'weapon',
    subType: 'bow',
    rarity: 'rare',
    basePrice: 260,
    durabilityMax: 70,
    baseStats: { 'combat.attack': 18 },
    requirements: [{ t: 'playerLevel', level: 7 }],
  },
  {
    id: 'knight_armor',
    name: 'Рыцарская броня',
    itemType: 'armor',
    rarity: 'rare',
    basePrice: 520,
    durabilityMax: 120,
    baseStats: { 'combat.defense': 12 },
    requirements: [{ t: 'playerLevel', level: 9 }],
    // [M04.1 · C3] rare [2,2] — кандидатов armor-скоупа стало 2 (def_mastery)
    modSlots: { budgetBase: 25, tags: ['armor'] },
  },
  // --- редкости (полка «Редкости» — ветка Категории, legendary+ в пуле, M04 §3)
  {
    id: 'dragon_fang',
    name: 'Клык дракона',
    itemType: 'weapon',
    subType: 'sword',
    rarity: 'legendary',
    basePrice: 1500,
    durabilityMax: 90,
    baseStats: { 'combat.attack': 25 },
    requirements: [{ t: 'playerLevel', level: 15 }],
    // [M04.1 · C3] legendary [3,3] — кандидатов weapon/melee стало 3 (atk_mastery)
    modSlots: { budgetBase: 60, tags: ['weapon', 'melee'] },
  },
  {
    id: 'ancient_idol',
    name: 'Древний идол',
    itemType: 'treasure',
    rarity: 'legendary',
    basePrice: 900,
    stackable: false,
  },
  {
    id: 'phoenix_charm',
    name: 'Талисман феникса',
    itemType: 'treasure',
    rarity: 'legendary',
    basePrice: 1200,
    stackable: false,
  },
  {
    id: 'star_gem',
    name: 'Звёздный самоцвет',
    itemType: 'treasure',
    rarity: 'mythic',
    basePrice: 4000,
    stackable: false,
    unlock: { t: 'playerLevel', level: 20 },
  },
];
