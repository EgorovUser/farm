/**
 * Каталог рецептов: бытовой блок (кожевенный / ткацкий / кухня / алхимия).
 * Строки данных (П1); числа — стартовые (П6). [QUESTION] D36 — зелья-бафы
 * как useAction-'modifier' заморожены решением M02.3: алхимия даёт
 * компоненты-заготовки (детали — recipes.ts).
 */
import type { RecipeDef } from './recipes';

export const SOFT_RECIPES: RecipeDef[] = [  {
    id: 'tn_fish_leather',
    station: 'tannery',
    inputs: [{ defId: 'river_perch', qty: 2 }],
    output: { defId: 'leather', qty: 1 },
    craftSeconds: 90,
  },
  {
    id: 'tn_leather_armor',
    station: 'tannery',
    inputs: [
      { defId: 'leather', qty: 3 },
      { defId: 'cloth', qty: 1 },
    ],
    output: { defId: 'leather_armor', qty: 1 },
    craftSeconds: 130,
  },
  {
    id: 'tn_backpack',
    station: 'tannery',
    inputs: [
      { defId: 'leather', qty: 4 },
      { defId: 'rope', qty: 1 },
      { defId: 'cloth', qty: 1 },
    ],
    output: { defId: 'backpack', qty: 1 },
    craftSeconds: 200,
    unlock: { t: 'playerLevel', level: 6 },
    // «Рюкзак» (+4 слота инвентаря, карточка §2): постоянный модификатор,
    // уникальный id на партию; кап 60 — на стороне M02 (capacityOf)
    effects: [
      {
        id: 'craft.backpack.slots',
        source: { kind: 'item', refId: 'backpack' },
        stat: 'player.inventory.slots',
        op: 'flat',
        value: 4,
        label: 'рюкзак: +4 слота инвентаря',
      },
    ],
  },
  {
    id: 'lo_cloth',
    station: 'loom',
    inputs: [{ defId: 'wool', qty: 2 }],
    output: { defId: 'cloth', qty: 1 },
    craftSeconds: 60,
  },
  {
    id: 'lo_scarf',
    station: 'loom',
    inputs: [
      { defId: 'wool', qty: 1 },
      { defId: 'cloth', qty: 1 },
    ],
    output: { defId: 'warm_scarf', qty: 1 },
    craftSeconds: 90,
  },
  {
    id: 'lo_banner',
    station: 'loom',
    inputs: [
      { defId: 'cloth', qty: 3 },
      { defId: 'nails', qty: 1 },
    ],
    output: { defId: 'woven_banner', qty: 1 },
    craftSeconds: 150,
    unlock: { t: 'playerLevel', level: 7 },
  },
  {
    id: 'kt_omelet',
    station: 'kitchen',
    inputs: [
      { defId: 'egg', qty: 2 },
      { defId: 'turnip', qty: 1 },
    ],
    output: { defId: 'omelet', qty: 1 },
    craftSeconds: 50,
  },
  {
    id: 'kt_fish_soup',
    station: 'kitchen',
    inputs: [
      { defId: 'river_perch', qty: 1 },
      { defId: 'tomato', qty: 1 },
      { defId: 'egg', qty: 1 },
    ],
    output: { defId: 'fish_soup', qty: 1 },
    craftSeconds: 80,
  },
  {
    id: 'kt_spiced_stew',
    station: 'kitchen',
    inputs: [
      { defId: 'potato', qty: 1 },
      { defId: 'spices', qty: 1 },
    ],
    output: { defId: 'spiced_stew', qty: 1 },
    craftSeconds: 70,
    unlock: { t: 'playerLevel', level: 4 },
  },
  {
    id: 'kt_hearty_stew',
    station: 'kitchen',
    inputs: [
      { defId: 'potato', qty: 2 },
      { defId: 'carrot', qty: 1 },
      { defId: 'river_perch', qty: 1 },
    ],
    output: { defId: 'hearty_stew', qty: 1 },
    craftSeconds: 100,
  },
  {
    id: 'al_battle_draught',
    station: 'alchemy',
    inputs: [
      { defId: 'healing_herb', qty: 1 },
      { defId: 'iron_ore', qty: 1 },
    ],
    output: { defId: 'battle_draught', qty: 1 },
    craftSeconds: 100,
  },
  {
    id: 'al_growth_elixir',
    station: 'alchemy',
    inputs: [
      { defId: 'healing_herb', qty: 2 },
      { defId: 'amber_resin', qty: 1 },
    ],
    output: { defId: 'growth_elixir', qty: 1 },
    craftSeconds: 110,
  },
  {
    id: 'al_luck_elixir',
    station: 'alchemy',
    inputs: [
      { defId: 'healing_herb', qty: 2 },
      { defId: 'spices', qty: 1 },
    ],
    output: { defId: 'luck_elixir', qty: 1 },
    craftSeconds: 120,
    unlock: { t: 'playerLevel', level: 5 },
  },
  {
    id: 'al_animal_remedy',
    station: 'alchemy',
    inputs: [
      { defId: 'healing_herb', qty: 1 },
      { defId: 'honey', qty: 1 },
    ],
    output: { defId: 'animal_remedy', qty: 1 },
    craftSeconds: 80,
  },
];
