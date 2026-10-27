/**
 * БАЛАНС МАГАЗИНА (карточка M04; 03-DATA §11: имена таблиц = имена модулей).
 * Единственное место чисел магазина (П6): ротация/скидки/прокачка/ветки.
 *
 * Роллящиеся параметры (шанс скидки, размер 30%, qty, люкс) — БАЗАМИ статов
 * shop.roll.* + ветки/уровень — модификаторами shopBranchProvider (StatBus,
 * карточка §6 «эффекты веток — в StatBus»): будущие keystones M14 («Торгаш»)
 * подцепятся к тем же статам без правки магазина.
 *
 * [DECISION · M04.1] скидка уровня магазина — провайдер PriceBus
 * (04-DISCOUNTS §2.2: «каждые 5 уровней −1%, до −10%»), НЕ стат: это цена,
 * а не характеристика. Скидочные слоты дня — тоже PriceBus-провайдер
 * (§2: «публикуется в систему скидок как локальный источник на этот день»).
 */
import type { BasesTable } from '@/content/balance/bases';
import type { ID } from '@/shared/types/ids';
import type { ShopCategoryId } from '@/content/shopPool';

/** ветки улучшений §3 (покупка — M04.2; эффекты — модификаторами) */
export interface ShopBranchCosts {
  maxLevel: number;
  costBase: number;
  costGrowth: number;
}

/** строка базового ассортимента §2(а) — всегда в стоке, количество фиксировано */
export interface ShopBaseGood {
  id: ID;
  kind: 'item' | 'currency';
  /** дневной запас (у базовых — фиксирован, карточка §2) */
  qty: number;
}

export interface ShopTable {
  /** скидочный слот §2: размер равномерно [min..max] % */
  discount: { minPercent: number; maxPercent: number };
  /** уровень магазина §3: XP за покупку + кривая */
  level: { xpPerPurchase: number; xpBase: number; xpGrowth: number };
  /** скидка уровня (04-DISCOUNTS §2.2): −percentPerStep за каждые perLevels, кап */
  levelDiscount: { perLevels: number; percentPerStep: number; capPercent: number };
  /** постоянный заказ §3: дневной запас закреплённого предмета */
  pinnedQty: number;
  /** ветка «Категории» §3: порядок открытия закрытых полок */
  categories: { unlockOrder: ShopCategoryId[] };
  /** ветки §3: стоимости уровней (цена уровня n = costBase × growth^(n−1)) */
  branches: Record<'assortment' | 'permanent' | 'supplies' | 'ties' | 'categories' | 'luxury', ShopBranchCosts>;
  /** каталог «что привозить» (ветка Ассортимент §3): кандидаты выбора игрока
   *  с весами в ротации (выбранные игроком входят в пул кандидатов дня) */
  assortmentCatalog: Array<{ id: ID; weight: number }>;
  /** цены покупки валютных товаров (золото за единицу) — единственный источник:
   *  базовые (корм/удобрение) и полка «Стройматериалы» (03-DATA §1 — это
   *  валюты кошелька); предметные цены — PriceBus от basePrice */
  currencyGoods: Record<ID, number>;
  /** базовый ассортимент §2(а) */
  baseGoods: ShopBaseGood[];
}

export const SHOP_TABLE: ShopTable = {
  discount: { minPercent: 5, maxPercent: 50 },
  // [DECISION · M04.1] кривая уровня магазина брифом не задана — стартовые
  // по образцу навыков (50 × 1.2): 25 × 1.25, тюнюемо без миграций (П6)
  level: { xpPerPurchase: 5, xpBase: 25, xpGrowth: 1.25 },
  levelDiscount: { perLevels: 5, percentPerStep: 1, capPercent: 10 },
  pinnedQty: 3,
  categories: { unlockOrder: ['baits', 'potions', 'building', 'rarities'] },
  branches: {
    assortment: { maxLevel: 5, costBase: 150, costGrowth: 1.8 },
    permanent: { maxLevel: 3, costBase: 200, costGrowth: 2 },
    supplies: { maxLevel: 2, costBase: 250, costGrowth: 2 },
    ties: { maxLevel: 5, costBase: 120, costGrowth: 1.6 },
    categories: { maxLevel: 4, costBase: 180, costGrowth: 1.7 },
    luxury: { maxLevel: 1, costBase: 400, costGrowth: 1 },
  },
  // каталог ветки «Ассортимент» (§3): что игрок может добавить в пул.
  // [DECISION · M04.2 — фикс данных M04.1] прежние 5 кандидатов (seed_lavender/
  // hearty_stew/cloth/rope/honey) были ДУБЛЯМИ пула — availablePool добавляет
  // выбор только при отсутствии в пуле, ветка была no-op'ом. Канон: каталог =
  // вне-пулевые предметы (river_perch/lucky_charm существовали вне пула;
  // silver_ore/silk/spices добавлены M04.2 в каталог предметов)
  // [M15.2 · N10] «городские награды» (catalog-rewards.ts): вне пула ротации
  // (пул-оракулы M04 считаются по факту пула), гейт — unlock на ItemDef;
  // поступление — выбор игрока → постоянный заказ (гарантия стока)
  assortmentCatalog: [
    { id: 'river_perch', weight: 6 },
    { id: 'lucky_charm', weight: 3 },
    { id: 'silver_ore', weight: 5 },
    { id: 'silk', weight: 5 },
    { id: 'spices', weight: 6 },
    { id: 'whetstone_of_luck', weight: 4 },
    { id: 'masters_apron', weight: 2 },
    { id: 'apprentice_mug', weight: 4 },
    { id: 'merchants_scale', weight: 2 },
    { id: 'customer_card', weight: 3 },
    { id: 'rerollers_coin', weight: 2 },
    { id: 'sharpening_kit', weight: 3 },
    { id: 'metallurgist_hammer', weight: 2 },
  ],
  currencyGoods: {
    feed: 3,
    fertilizer: 6,
    stone: 2,
    logs: 3,
    planks: 7,
    nails: 6,
    coal: 5,
  },
  // базовый ассортимент §2(а): стартовые семена (≥20 шт), Корм, Удобрение,
  // базовые лопата и лейка, ремонтный набор (корм/удобрение — валюты, 03-DATA §1;
  // цены валют — в currencyGoods, единственный источник)
  baseGoods: [
    { id: 'seed_turnip', kind: 'item', qty: 30 },
    { id: 'feed', kind: 'currency', qty: 12 },
    { id: 'fertilizer', kind: 'currency', qty: 6 },
    { id: 'shovel', kind: 'item', qty: 2 },
    { id: 'watering_can', kind: 'item', qty: 2 },
    { id: 'repair_kit', kind: 'item', qty: 3 },
  ],
};

/** Базы статов ротации (П2: задаются один раз; модификаторы — провайдером) */
export const SHOP_BASES_TABLE: BasesTable = {
  bases: {
    // §2: discountChance = 25% + 2% × уровень магазина (+2% ветка «Связи»)
    'shop.roll.discountChance': 25,
    // §2: rotationSizeMult = 0.30 (в процентах — целые базы, дробь в коде /100)
    'shop.roll.sizeMultPercent': 30,
    // §2: количество роллящихся позиций 1..5 (+ветка «Поставки» к максимуму)
    'shop.roll.qtyMin': 1,
    'shop.roll.qtyMax': 5,
    // §3: люкс-витрина +1 гарантированный rare+ (ветка)
    'shop.roll.luxuryCount': 0,
  },
  meta: {},
};
