/**
 * Здания деревни M16.2 (карточка §3 — 9 штук; [DECISION M162-здания]).
 * Уровни 1–3: «улучшение = та же механика» — та же транзакция village.build,
 * тот же таймер часов реального времени (finishAt — абсолют, hourTick-класс;
 * оффлайн — catchUp, прецеденты M11 workers / need.day).
 *
 * Эффекты = ТОЛЬКО модификаторы villageProvider (новые стат-иды) и данные:
 *  - house      [DECISION M162-дом]: «+1 житель» = уровневая скидка unlock
 *               следующего жителя (следующий из 12 доступен уровнем ниже);
 *  - warehouse  защита % склада от кражи рейда (кража × (1 − N/100));
 *  - forge      «Кузница деревни» — скидка к цене починки (полцены на L3);
 *               строка-источник 04-DISCOUNTS §2.2 [касса Task 86];
 *  - market     «−10% у деревенских купцов» — резолв-уровень БЕЗ потребителя
 *               (куплены в M16.3; прецедент bases M14.2 «резолв-без-проводки»);
 *  - fence/wall защита рейда (суммируется с силами снаряжения жителей);
 *  - well/temple/bath счастье-аура → к среднему счастью налога (±swing).
 *
 * Цены: золото + материалы (валюты 03-DATA §1: planks/logs/nails/stone) +
 * крафт-изделия (предметы M09: iron_ingot/iron_plate/cloth/warm_scarf/
 * woven_banner). XP деревне — за ЗАВЕРШЕНИЕ уровня (карточка §3:
 * «XP деревни = Σ потребностей И ПОСТРОЕК»).
 */
import type { VillageBuildingDef } from './types';

const atLevel = (level: number): { t: 'statAtLeast'; stat: 'village.level'; value: number } => ({
  t: 'statAtLeast',
  stat: 'village.level',
  value: level,
});

export const VILLAGE_BUILDINGS: VillageBuildingDef[] = [
  {
    id: 'house',
    name: 'Дом',
    desc: '+1 житель: следующий из 12 доступен уровнем ниже (за каждый уровень Дома)',
    kind: 'house',
    unlock: atLevel(2),
    levels: [
      { costGold: 150, items: [{ t: 'currency', id: 'planks', qty: 6 }, { t: 'currency', id: 'nails', qty: 4 }], hours: 6, effect: 1, xp: 25 },
      { costGold: 300, items: [{ t: 'currency', id: 'planks', qty: 8 }, { t: 'currency', id: 'nails', qty: 6 }, { t: 'item', id: 'iron_ingot', qty: 2 }], hours: 10, effect: 2, xp: 40 },
      { costGold: 550, items: [{ t: 'currency', id: 'planks', qty: 10 }, { t: 'currency', id: 'nails', qty: 8 }, { t: 'item', id: 'iron_plate', qty: 1 }], hours: 14, effect: 3, xp: 60 },
    ],
  },
  {
    id: 'warehouse',
    name: 'Склад',
    desc: 'защита % ресурсов от рейдов (кража режется на N%)',
    kind: 'warehouse',
    unlock: atLevel(3),
    levels: [
      { costGold: 200, items: [{ t: 'currency', id: 'planks', qty: 8 }, { t: 'currency', id: 'logs', qty: 6 }], hours: 8, effect: 15, xp: 30 },
      { costGold: 380, items: [{ t: 'currency', id: 'planks', qty: 10 }, { t: 'currency', id: 'nails', qty: 8 }], hours: 12, effect: 30, xp: 45 },
      { costGold: 650, items: [{ t: 'item', id: 'iron_plate', qty: 2 }, { t: 'item', id: 'cloth', qty: 4 }], hours: 16, effect: 45, xp: 70 },
    ],
  },
  {
    id: 'forge_village',
    name: 'Кузница деревни',
    desc: 'цена починки −N% (полцены на уровне 3; источник 04-DISCOUNTS §2.2)',
    kind: 'forge',
    unlock: atLevel(4),
    levels: [
      { costGold: 250, items: [{ t: 'item', id: 'iron_ingot', qty: 4 }, { t: 'currency', id: 'planks', qty: 6 }], hours: 8, effect: 30, xp: 30 },
      { costGold: 450, items: [{ t: 'item', id: 'iron_ingot', qty: 6 }, { t: 'item', id: 'iron_plate', qty: 1 }], hours: 12, effect: 40, xp: 50 },
      { costGold: 750, items: [{ t: 'item', id: 'iron_plate', qty: 3 }, { t: 'currency', id: 'nails', qty: 10 }], hours: 16, effect: 50, xp: 75 },
    ],
  },
  {
    id: 'market',
    name: 'Рынок',
    desc: '−N% у деревенских купцов (куплены биржей M16.3)',
    kind: 'market',
    unlock: atLevel(6),
    levels: [
      { costGold: 300, items: [{ t: 'currency', id: 'planks', qty: 10 }, { t: 'item', id: 'cloth', qty: 2 }], hours: 10, effect: 5, xp: 35 },
      { costGold: 520, items: [{ t: 'currency', id: 'planks', qty: 12 }, { t: 'item', id: 'warm_scarf', qty: 1 }], hours: 14, effect: 8, xp: 55 },
      { costGold: 850, items: [{ t: 'item', id: 'woven_banner', qty: 1 }, { t: 'item', id: 'cloth', qty: 6 }], hours: 18, effect: 10, xp: 80 },
    ],
  },
  {
    id: 'fence',
    name: 'Частокол',
    desc: 'защита деревни от рейда (+N к суммарной защите)',
    kind: 'defense',
    unlock: atLevel(2),
    levels: [
      { costGold: 100, items: [{ t: 'currency', id: 'logs', qty: 8 }, { t: 'currency', id: 'planks', qty: 4 }], hours: 4, effect: 4, xp: 20 },
      { costGold: 220, items: [{ t: 'currency', id: 'logs', qty: 10 }, { t: 'currency', id: 'nails', qty: 6 }], hours: 7, effect: 7, xp: 35 },
      { costGold: 400, items: [{ t: 'currency', id: 'logs', qty: 12 }, { t: 'item', id: 'iron_ingot', qty: 3 }], hours: 10, effect: 10, xp: 55 },
    ],
  },
  {
    id: 'wall',
    name: 'Стена',
    desc: 'крепкая защита деревни от рейда (+N к суммарной защите)',
    kind: 'defense',
    unlock: atLevel(8),
    levels: [
      { costGold: 400, items: [{ t: 'currency', id: 'stone', qty: 12 }, { t: 'item', id: 'iron_ingot', qty: 4 }], hours: 12, effect: 8, xp: 45 },
      { costGold: 700, items: [{ t: 'currency', id: 'stone', qty: 16 }, { t: 'item', id: 'iron_plate', qty: 2 }], hours: 16, effect: 12, xp: 65 },
      { costGold: 1100, items: [{ t: 'currency', id: 'stone', qty: 20 }, { t: 'currency', id: 'nails', qty: 12 }], hours: 20, effect: 16, xp: 95 },
    ],
  },
  {
    id: 'well',
    name: 'Колодец',
    desc: 'счастье-аура: +N к среднему счастью налога',
    kind: 'happiness',
    unlock: atLevel(3),
    levels: [
      { costGold: 120, items: [{ t: 'currency', id: 'planks', qty: 4 }, { t: 'item', id: 'iron_ingot', qty: 1 }], hours: 4, effect: 2, xp: 20 },
      { costGold: 260, items: [{ t: 'currency', id: 'planks', qty: 6 }, { t: 'currency', id: 'nails', qty: 4 }], hours: 7, effect: 3, xp: 35 },
      { costGold: 450, items: [{ t: 'item', id: 'iron_plate', qty: 1 }, { t: 'item', id: 'cloth', qty: 2 }], hours: 10, effect: 4, xp: 55 },
    ],
  },
  {
    id: 'temple',
    name: 'Храм',
    desc: 'счастье-аура: +N к среднему счастью налога',
    kind: 'happiness',
    unlock: atLevel(10),
    levels: [
      { costGold: 350, items: [{ t: 'currency', id: 'planks', qty: 8 }, { t: 'item', id: 'cloth', qty: 3 }], hours: 10, effect: 3, xp: 40 },
      { costGold: 600, items: [{ t: 'item', id: 'woven_banner', qty: 1 }, { t: 'currency', id: 'planks', qty: 10 }], hours: 14, effect: 4, xp: 60 },
      { costGold: 950, items: [{ t: 'item', id: 'woven_banner', qty: 2 }, { t: 'item', id: 'cloth', qty: 5 }], hours: 18, effect: 5, xp: 85 },
    ],
  },
  {
    id: 'bath',
    name: 'Баня',
    desc: 'счастье-аура: +N к среднему счастью налога',
    kind: 'happiness',
    unlock: atLevel(5),
    levels: [
      { costGold: 180, items: [{ t: 'currency', id: 'planks', qty: 6 }, { t: 'currency', id: 'logs', qty: 4 }], hours: 5, effect: 2, xp: 25 },
      { costGold: 340, items: [{ t: 'currency', id: 'planks', qty: 8 }, { t: 'currency', id: 'nails', qty: 6 }], hours: 8, effect: 3, xp: 40 },
      { costGold: 580, items: [{ t: 'item', id: 'iron_ingot', qty: 3 }, { t: 'item', id: 'cloth', qty: 3 }], hours: 12, effect: 4, xp: 60 },
    ],
  },
];

/** эффект построенного уровня (0 — не построено) */
export function buildingEffectOf(
  buildings: Record<string, { level: number }> | undefined,
  id: string,
  defs: VillageBuildingDef[],
): number {
  const level = buildings?.[id]?.level ?? 0;
  if (level <= 0) return 0;
  const def = defs.find((d) => d.id === id);
  return def === undefined ? 0 : def.levels[Math.min(3, level) - 1]!.effect;
}
