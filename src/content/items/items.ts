/**
 * Предметы (03-DATA §4). Тип ItemDef — канонический контракт (импортируют
 * M02/M03/ш_costs/чеки); сами строки разложены по каталогам (01-CORE §6:
 * файл = одна ответственность; items.ts при 46+ строках данных превысил бы 300).
 * [M04.1] каталог расширен для пула магазина (карточка M04 §2: «~60 позиций»):
 * seeds/goods/gear — 46 предметов; числа — стартовые (П6), правятся в каталогах.
 */
import type { PricedItemDef } from '@/kernel/bus/price-bus/price-bus';
import type { Rarity, StatId, Tag } from '@/shared/types/ids';
import type { Condition } from '@/shared/types/requirement';
import { SEED_ITEMS } from './catalog-seeds';
import { GOODS_ITEMS } from './catalog-goods';
import { SHELF_ITEMS } from './catalog-shelves';
import { GEAR_ITEMS } from './catalog-gear';
// [M09] предметы крафта: входы/выходы рецептов (плуг, сырьё, еда, зелья-заготовки)
import { CRAFT_ITEMS } from './catalog-craft';
// [M15.2 · N10] фикстуры гейтов ассортимента M04: «городские награды» с
// unlock {achievement}/{flag} (каталог — данные; см. catalog-rewards.ts)
import { REWARD_ITEMS } from './catalog-rewards';
// [M07] рыбы/мусор/наживки/удочки (F7: аддитивно, пул M04 НЕ тронут)
import { FISHING_ITEMS } from './catalog-fishing';
// [M12.2] трофеи шахты ×9 (G5; прецедент M07 F7 — аддитивно, пул M04 НЕ тронут)
import { MINE_ITEMS } from './catalog-mine';
// [M13.1] товары крота: зелья (BUF-1 useAction modifier), факел, свиток
// выхода (прецедент трофеев M12.2 — аддитивно, пул M04 НЕ тронут)
import { MINERUN_ITEMS } from './catalog-minerun';

export type ItemType =
  | 'tool'
  | 'weapon'
  | 'armor'
  | 'shield'
  | 'rod'
  | 'consumable'
  | 'seed'
  | 'bait'
  | 'fish'
  | 'treasure'
  | 'component';

export interface UseEffectDef {
  t: 'grantEnergy' | 'grantHp' | 'modifier';
  value?: number;
  mod?: unknown;
}

export interface ItemDef extends PricedItemDef {
  name: string;
  itemType: ItemType;
  subType?: string;
  /** БАЗА статов экипировки (П2): отдаётся шиной через equipmentProvider (M02.2) */
  baseStats?: Partial<Record<StatId, number>>;
  /** предмет может принять ривен-роллы (M03) */
  modSlots?: { budgetBase: number; tags: Tag[] };
  stackable?: boolean;
  maxStack?: number;
  durabilityMax?: number;
  useAction?: { effects: UseEffectDef[] };
  requirements?: Condition[];
  unlock?: Condition;
}

/** полный каталог: seeds (10) + goods (23) + shelves (11) + gear (14) + craft (14) + rewards (8) + fishing (19) + mine (9) + minerun (4) = 112 */
export const ITEMS: ItemDef[] = [...SEED_ITEMS, ...GOODS_ITEMS, ...SHELF_ITEMS, ...GEAR_ITEMS, ...CRAFT_ITEMS, ...REWARD_ITEMS, ...FISHING_ITEMS, ...MINE_ITEMS, ...MINERUN_ITEMS];

export const RARITY_ORDER: Record<Rarity, number> = {
  common: 0,
  uncommon: 1,
  rare: 2,
  epic: 3,
  legendary: 4,
  mythic: 5,
};
