/**
 * Каталог M13.1: товары кротовой торговли + зелья забега (BUF-1, РЕШЕНИЕ):
 * зелья — useAction {t:'modifier'} (03-DATA §4; активация — потребление
 * в забеге командой M13, НЕ через inv use — канал M02 заморожен D36);
 * факел — расходник run.torches (в инвентарь НЕ попадает; деф живёт для
 * цены PriceBus и витрины стока); свиток выхода — предмет с run-эффектом
 * из данных (тег mine:exitScroll): использование в забеге = добровольный
 * выход 100% (бриф R3).
 *
 * Прецедент добавления — [M12.2] MINE_ITEMS: модуль расширяет каталог своим
 * файлом, пул магазина M04 НЕ тронут (N=60 цел, potions ЗАКРЫТА — зелья
 * приходят из шахты, крот ≠ M04-полка).
 */
import type { ItemDef } from './items';

export const MINERUN_ITEMS: ItemDef[] = [
  {
    id: 'potion_might',
    name: 'Зелье ярости',
    itemType: 'consumable',
    subType: 'potion',
    rarity: 'uncommon',
    basePrice: 40,
    stackable: true,
    maxStack: 10,
    useAction: {
      effects: [
        {
          t: 'modifier',
          mod: {
            id: 'mine.potion.might',
            source: { kind: 'buff', refId: 'potion_might' },
            stat: 'mine.damage',
            op: 'flat',
            value: 25,
            duration: { kind: 'runs', value: 1 },
          },
        },
      ],
    },
  },
  {
    id: 'potion_keen',
    name: 'Зелье меткости',
    itemType: 'consumable',
    subType: 'potion',
    rarity: 'uncommon',
    basePrice: 45,
    stackable: true,
    maxStack: 10,
    useAction: {
      effects: [
        {
          t: 'modifier',
          mod: {
            id: 'mine.potion.keen',
            source: { kind: 'buff', refId: 'potion_keen' },
            stat: 'mine.crit',
            op: 'flat',
            value: 10,
            duration: { kind: 'runs', value: 1 },
          },
        },
      ],
    },
  },
  {
    id: 'mine_torch',
    name: 'Факел',
    itemType: 'component',
    subType: 'torch',
    rarity: 'common',
    basePrice: 15,
    stackable: true,
    maxStack: 20,
  },
  {
    id: 'scroll_exit',
    name: 'Свиток выхода',
    itemType: 'consumable',
    subType: 'scroll',
    rarity: 'rare',
    basePrice: 60,
    stackable: true,
    maxStack: 5,
    // run-эффект — ИЗ ДАННЫХ: карта MINE_RUN_EFFECTS в content/mine/cards.ts
    // (defId → эффект 'exit'); использование в забеге = mine pick 0 —
    // добровольный выход 100% (бриф R3); inv use честно откажет «не расходник
    // с useAction» — активация только каналом M13 (BUF-1)
  },
];
