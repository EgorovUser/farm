/**
 * Жители деревни M16.1 (карточка §2; 03-DATA §8 канон VillagerDef) —
 * 12 персонажей (коридор 10–20). Кандидаты потребностей — ТОЛЬКО
 * существующие предметы/валюты (M05/M06/M07/M08/M09 чтением каталога
 * и CurrencyId): урожай/рыба/яйца (еда), руда/слитки/доски (материалы),
 * изделия (инструменты/одежда/зелья). Веса роллов — needs.ts.
 *
 * Разблокировка: уровни ДЕРЕВНИ (statAtLeast 'village.level' — провайдер
 * даёт override фактического уровня; селекционеры стартовых жителей — без
 * unlock). Стартовая тройка: Варвара/Мирон/Зоя (уровень 1).
 */
import type { VillagerDef } from './types';

export const VILLAGERS: VillagerDef[] = [
  {
    id: 'villager_varvara',
    name: 'Варвара',
    profession: 'Пекарь',
    needs: {
      daily: [
        { defId: 'wheat_grain', qty: 6 },
        { defId: 'carrot', qty: 4 },
        { defId: 'egg', qty: 3 },
      ],
      weekly: [{ defId: 'honey', qty: 2 }],
    },
  },
  {
    id: 'villager_miron',
    name: 'Мирон',
    profession: 'Кузнец',
    needs: {
      daily: [
        { defId: 'iron_ore', qty: 3 },
        { defId: 'copper_ore', qty: 4 },
      ],
      weekly: [{ defId: 'iron_ingot', qty: 2 }],
    },
  },
  {
    id: 'villager_zoya',
    name: 'Зоя',
    profession: 'Рыбачка',
    needs: {
      daily: [
        { defId: 'crucian', qty: 2 },
        { defId: 'rotan', qty: 3 },
        { defId: 'perch', qty: 2 },
      ],
      weekly: [{ defId: 'pike', qty: 1 }],
    },
  },
  {
    id: 'villager_akulina',
    name: 'Акулина',
    profession: 'Ткачиха',
    needs: {
      daily: [
        { defId: 'wool', qty: 3 },
        { defId: 'egg', qty: 2 },
      ],
      weekly: [{ defId: 'cloth', qty: 2 }],
    },
    unlock: { t: 'statAtLeast', stat: 'village.level', value: 3 },
  },
  {
    id: 'villager_gerasim',
    name: 'Герасим',
    profession: 'Плотник',
    needs: {
      daily: [
        { defId: 'planks', qty: 6 },
        { defId: 'logs', qty: 4 },
      ],
      weekly: [{ defId: 'nails', qty: 8 }],
    },
    unlock: { t: 'statAtLeast', stat: 'village.level', value: 5 },
  },
  {
    id: 'villager_taisia',
    name: 'Таисия',
    profession: 'Травница',
    needs: {
      daily: [
        { defId: 'healing_herb', qty: 3 },
        { defId: 'mushroom', qty: 4 },
      ],
      weekly: [{ defId: 'amber_resin', qty: 2 }],
    },
    unlock: { t: 'statAtLeast', stat: 'village.level', value: 8 },
  },
  {
    id: 'villager_frol',
    name: 'Фрол',
    profession: 'Скотник',
    needs: {
      daily: [
        { defId: 'milk', qty: 2 },
        { defId: 'truffle', qty: 1 },
      ],
      weekly: [{ defId: 'wool', qty: 4 }],
    },
    unlock: { t: 'statAtLeast', stat: 'village.level', value: 11 },
  },
  {
    id: 'villager_pelageya',
    name: 'Пелагея',
    profession: 'Кухарка',
    needs: {
      daily: [
        { defId: 'tomato', qty: 3 },
        { defId: 'potato', qty: 4 },
        { defId: 'grape', qty: 2 },
      ],
      weekly: [{ defId: 'sturgeon', qty: 1 }],
    },
    unlock: { t: 'statAtLeast', stat: 'village.level', value: 14 },
  },
  {
    id: 'villager_ignat',
    name: 'Игнат',
    profession: 'Рудокоп',
    needs: {
      daily: [
        { defId: 'copper_ore', qty: 5 },
        { defId: 'tin_ore', qty: 4 },
        { defId: 'silver_ore', qty: 1 },
      ],
      weekly: [{ defId: 'iron_ingot', qty: 3 }],
    },
    unlock: { t: 'statAtLeast', stat: 'village.level', value: 17 },
  },
  {
    id: 'villager_lusha',
    name: 'Луша',
    profession: 'Мельничиха',
    needs: {
      daily: [
        { defId: 'wheat_grain', qty: 8 },
        { defId: 'turnip', qty: 5 },
      ],
      weekly: [{ defId: 'bread', qty: 3 }],
    },
    unlock: { t: 'statAtLeast', stat: 'village.level', value: 20 },
  },
  {
    id: 'villager_savely',
    name: 'Савелий',
    profession: 'Оружейник',
    needs: {
      daily: [
        { defId: 'iron_plate', qty: 1 },
        { defId: 'iron_ore', qty: 4 },
      ],
      weekly: [{ defId: 'whetstone_of_luck', qty: 1 }],
    },
    unlock: { t: 'statAtLeast', stat: 'village.level', value: 22 },
  },
  {
    id: 'villager_agafya',
    name: 'Агафья',
    profession: 'Меховщица',
    needs: {
      daily: [
        { defId: 'leather', qty: 3 },
        { defId: 'rope', qty: 2 },
      ],
      weekly: [{ defId: 'warm_scarf', qty: 1 }],
    },
    unlock: { t: 'statAtLeast', stat: 'village.level', value: 24 },
  },
];
