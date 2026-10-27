/**
 * Каталог рецептов: кузнечный блок (верстак / плавильня / наковальня).
 * Строки данных (П1); числа — стартовые (П6). Документация форматов и
 * [DECISION] — recipes.ts (типы) и balance/craft.ts (числа формулы).
 */
import type { RecipeDef } from './recipes';

export const FORGE_RECIPES: RecipeDef[] = [  {
    id: 'wb_planks',
    station: 'workbench',
    inputs: [{ defId: 'logs', qty: 3 }],
    output: { defId: 'planks', qty: 2 },
    craftSeconds: 30,
  },
  {
    id: 'wb_nails',
    station: 'workbench',
    inputs: [{ defId: 'planks', qty: 2 }],
    output: { defId: 'nails', qty: 4 },
    craftSeconds: 45,
  },
  {
    id: 'wb_feed',
    station: 'workbench',
    inputs: [{ defId: 'wheat_grain', qty: 2 }],
    output: { defId: 'feed', qty: 3 },
    craftSeconds: 40,
  },
  {
    id: 'wb_fertilizer',
    station: 'workbench',
    inputs: [
      { defId: 'healing_herb', qty: 2 },
      { defId: 'fiber', qty: 1 },
    ],
    output: { defId: 'fertilizer', qty: 2 },
    craftSeconds: 50,
  },
  {
    id: 'wb_shovel',
    station: 'workbench',
    inputs: [
      { defId: 'planks', qty: 2 },
      { defId: 'iron_ingot', qty: 1 },
    ],
    output: { defId: 'shovel', qty: 1 },
    craftSeconds: 90,
  },
  {
    id: 'wb_watering_can',
    station: 'workbench',
    inputs: [
      { defId: 'iron_ingot', qty: 1 },
      { defId: 'copper_ore', qty: 1 },
    ],
    output: { defId: 'watering_can', qty: 1 },
    craftSeconds: 90,
  },
  {
    id: 'wb_repair_kit',
    station: 'workbench',
    inputs: [
      { defId: 'cloth', qty: 1 },
      { defId: 'nails', qty: 2 },
    ],
    output: { defId: 'repair_kit', qty: 1 },
    craftSeconds: 60,
  },
  {
    id: 'wb_plow',
    station: 'workbench',
    inputs: [
      { defId: 'planks', qty: 3 },
      { defId: 'iron_ingot', qty: 2 },
      { defId: 'nails', qty: 4 },
    ],
    output: { defId: 'plow', qty: 1 },
    craftSeconds: 120,
    unlock: { t: 'playerLevel', level: 4 },
  },
  {
    id: 'sm_iron',
    station: 'smelter',
    inputs: [
      { defId: 'iron_ore', qty: 2 },
      { defId: 'coal', qty: 1 },
    ],
    output: { defId: 'iron_ingot', qty: 1 },
    craftSeconds: 60,
  },
  {
    id: 'sm_bronze',
    station: 'smelter',
    inputs: [
      { defId: 'copper_ore', qty: 1 },
      { defId: 'tin_ore', qty: 1 },
      { defId: 'coal', qty: 1 },
    ],
    output: { defId: 'ingot:bronze', qty: 2 },
    craftSeconds: 80,
    unlock: { t: 'playerLevel', level: 3 },
  },
  {
    id: 'sm_silver',
    station: 'smelter',
    inputs: [
      { defId: 'silver_ore', qty: 2 },
      { defId: 'coal', qty: 2 },
    ],
    output: { defId: 'silver', qty: 1 },
    craftSeconds: 100,
    unlock: { t: 'playerLevel', level: 6 },
  },
  {
    id: 'av_plate',
    station: 'anvil',
    inputs: [{ defId: 'iron_ingot', qty: 2 }],
    output: { defId: 'iron_plate', qty: 1 },
    craftSeconds: 70,
  },
  {
    id: 'av_pickaxe',
    station: 'anvil',
    inputs: [
      { defId: 'iron_plate', qty: 2 },
      { defId: 'planks', qty: 1 },
    ],
    output: { defId: 'iron_pickaxe', qty: 1 },
    craftSeconds: 150,
    unlock: { t: 'playerLevel', level: 5 },
  },
  {
    id: 'av_sword',
    station: 'anvil',
    inputs: [
      { defId: 'iron_plate', qty: 2 },
      { defId: 'leather', qty: 1 },
    ],
    output: { defId: 'iron_sword', qty: 1 },
    craftSeconds: 150,
    unlock: { t: 'playerLevel', level: 5 },
  },
  {
    id: 'av_buckler',
    station: 'anvil',
    inputs: [
      { defId: 'iron_plate', qty: 1 },
      { defId: 'planks', qty: 2 },
    ],
    output: { defId: 'buckler', qty: 1 },
    craftSeconds: 120,
  },
  {
    id: 'av_knight_armor',
    station: 'anvil',
    inputs: [
      { defId: 'iron_plate', qty: 4 },
      { defId: 'cloth', qty: 2 },
    ],
    output: { defId: 'knight_armor', qty: 1 },
    craftSeconds: 240,
    unlock: { t: 'playerLevel', level: 9 },
  },
  // [FIX-PHASE-2 · 4.2] буква карточки M09 §2 — наковальня куёт «инструменты
  // (кирки, топоры, удочки)»: топоры и удочка крафта; числа стартовые (П6)
  {
    id: 'av_axe',
    station: 'anvil',
    inputs: [
      { defId: 'iron_plate', qty: 2 },
      { defId: 'planks', qty: 2 },
    ],
    output: { defId: 'iron_axe', qty: 1 },
    craftSeconds: 150,
    unlock: { t: 'playerLevel', level: 5 },
  },
  {
    id: 'av_steel_axe',
    station: 'anvil',
    inputs: [
      { defId: 'iron_plate', qty: 3 },
      { defId: 'iron_ingot', qty: 2 },
      { defId: 'leather', qty: 1 },
    ],
    output: { defId: 'steel_axe', qty: 1 },
    craftSeconds: 210,
    unlock: { t: 'playerLevel', level: 10 },
  },
  {
    id: 'av_rod',
    station: 'anvil',
    inputs: [
      { defId: 'iron_plate', qty: 1 },
      { defId: 'rope', qty: 2 },
    ],
    output: { defId: 'oak_rod', qty: 1 },
    craftSeconds: 120,
    unlock: { t: 'playerLevel', level: 6 },
  },
];
