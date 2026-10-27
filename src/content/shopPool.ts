/**
 * ПУЛ МАГАЗИНА (карточка M04 §2: «стартовый пул ~60 позиций с весами и
 * гейтами»). Кандидаты дневной ротации: каждый ролл 30% тянет отсюда
 * взвешенно и без повторов. Базовый ассортимент (всегда в стоке) —
 * content/balance/shop.ts baseGoods и сюда НЕ входит (без дублей id).
 *
 * kind 'currency' — кошельковые товары (03-DATA §1: stone/logs/planks/nails/
 * coal): цена покупки — currencyGoods в balance/shop.ts, выдача транзакцией.
 * Полки baits/potions/building/rarities закрыты до ветки «Категории» (§3);
 * гейты §4 — unlock на строке (Requirement-оценщик, «гейты показываем» П6).
 */
import type { ID } from '@/shared/types/ids';
import type { Condition } from '@/shared/types/requirement';

/** полки магазина; baits/potions/building/rarities открывает ветка «Категории» */
export type ShopCategoryId = 'seeds' | 'food' | 'potions' | 'tools' | 'gear' | 'materials' | 'baits' | 'building' | 'rarities';

export interface ShopPoolEntry {
  /** defId предмета (kind item) или id валюты кошелька (kind currency) */
  id: ID;
  kind: 'item' | 'currency';
  /** вес в ротации (взвешенный выбор без повторов) */
  weight: number;
  category: ShopCategoryId;
  /** гейт строки §4: виден в каталоге с замком до выполнения */
  unlock?: Condition;
}

export const SHOP_POOL: ShopPoolEntry[] = [
  // --- семена (базовая полка; turnip — базовый ассортимент, тут остальных)
  { id: 'seed_carrot', kind: 'item', weight: 18, category: 'seeds' },
  { id: 'seed_potato', kind: 'item', weight: 16, category: 'seeds' },
  { id: 'seed_wheat', kind: 'item', weight: 14, category: 'seeds' },
  { id: 'seed_tomato', kind: 'item', weight: 11, category: 'seeds' },
  { id: 'seed_strawberry', kind: 'item', weight: 8, category: 'seeds' },
  { id: 'seed_pumpkin', kind: 'item', weight: 7, category: 'seeds' },
  { id: 'seed_corn', kind: 'item', weight: 6, category: 'seeds' },
  { id: 'seed_sunflower', kind: 'item', weight: 4, category: 'seeds' },
  { id: 'seed_lavender', kind: 'item', weight: 3, category: 'seeds' },
  // --- еда (базовая полка)
  { id: 'bread', kind: 'item', weight: 12, category: 'food' },
  { id: 'apple_pie', kind: 'item', weight: 10, category: 'food' },
  { id: 'honey', kind: 'item', weight: 8, category: 'food' },
  { id: 'hearty_stew', kind: 'item', weight: 7, category: 'food' },
  // --- материалы (базовая полка; сырьё M09+)
  { id: 'iron_ore', kind: 'item', weight: 12, category: 'materials' },
  { id: 'copper_ore', kind: 'item', weight: 11, category: 'materials' },
  { id: 'tin_ore', kind: 'item', weight: 10, category: 'materials' },
  { id: 'iron_ingot', kind: 'item', weight: 8, category: 'materials' },
  { id: 'rope', kind: 'item', weight: 9, category: 'materials' },
  { id: 'cloth', kind: 'item', weight: 8, category: 'materials' },
  { id: 'carrot', kind: 'item', weight: 9, category: 'materials' },
  { id: 'potato', kind: 'item', weight: 8, category: 'materials' },
  { id: 'wheat_grain', kind: 'item', weight: 8, category: 'materials' },
  { id: 'tomato', kind: 'item', weight: 7, category: 'materials' },
  { id: 'healing_herb', kind: 'item', weight: 10, category: 'materials' },
  { id: 'amber_resin', kind: 'item', weight: 9, category: 'materials' },
  // [FIX-PHASE-2 · 4.1] пул 53 → 60 (карточка M04 §2 «стартовый пул ~60»;
  // OBS-1 M04.2 закрыт) — строка №54: пластины наковальни (выход av_plate)
  { id: 'iron_plate', kind: 'item', weight: 5, category: 'materials', unlock: { t: 'playerLevel', level: 3 } },
  // --- еда: яйцо (кухонная цепочка SOFT-рецептов)
  { id: 'egg', kind: 'item', weight: 6, category: 'food' },
  // --- инструменты (базовая полка; shovel/watering_can — базовый ассортимент)
  { id: 'iron_pickaxe', kind: 'item', weight: 6, category: 'tools' },
  { id: 'steel_pickaxe', kind: 'item', weight: 3, category: 'tools' },
  // [FIX-PHASE-2 · 4.1] пул 53 → 60: топоры наковальни (§4.2) + плуг
  // (рецепт wb_plow уже жив — симметрия «кирки продаются, плуг тоже»)
  { id: 'iron_axe', kind: 'item', weight: 5, category: 'tools', unlock: { t: 'playerLevel', level: 5 } },
  { id: 'steel_axe', kind: 'item', weight: 2, category: 'tools', unlock: { t: 'playerLevel', level: 10 } },
  { id: 'plow', kind: 'item', weight: 3, category: 'tools', unlock: { t: 'playerLevel', level: 4 } },
  // --- снаряжение (базовая полка)
  { id: 'iron_sword', kind: 'item', weight: 6, category: 'gear' },
  { id: 'leather_armor', kind: 'item', weight: 5, category: 'gear' },
  { id: 'buckler', kind: 'item', weight: 5, category: 'gear' },
  { id: 'willow_rod', kind: 'item', weight: 5, category: 'gear' },
  { id: 'hunting_bow', kind: 'item', weight: 3, category: 'gear' },
  { id: 'knight_armor', kind: 'item', weight: 2, category: 'gear' },
  // [FIX-PHASE-2 · 4.1] пул 53 → 60: удочка наковальни (§4.2) + шарф ткацкого
  // станка (выход SOFT-рецепта; weekly-награда остаётся уникальным предметом —
  // покупной вариант для коллекции без ривен-слотов не дублируется)
  { id: 'oak_rod', kind: 'item', weight: 4, category: 'gear', unlock: { t: 'playerLevel', level: 6 } },
  { id: 'warm_scarf', kind: 'item', weight: 3, category: 'gear', unlock: { t: 'playerLevel', level: 8 } },
  // --- наживки (полка «Наживки» — ветка Категории)
  { id: 'worm_bait', kind: 'item', weight: 10, category: 'baits' },
  { id: 'maggot_bait', kind: 'item', weight: 9, category: 'baits' },
  { id: 'sweet_dough', kind: 'item', weight: 8, category: 'baits' },
  { id: 'cricket_bait', kind: 'item', weight: 7, category: 'baits' },
  { id: 'glowing_lure', kind: 'item', weight: 6, category: 'baits' },
  { id: 'spike_lure', kind: 'item', weight: 5, category: 'baits' },
  // --- зелья (полка «Зелья» — ветка Категории)
  { id: 'healing_salve', kind: 'item', weight: 9, category: 'potions' },
  { id: 'herbal_tea', kind: 'item', weight: 8, category: 'potions' },
  { id: 'energy_tonic', kind: 'item', weight: 7, category: 'potions' },
  { id: 'hp_potion', kind: 'item', weight: 6, category: 'potions' },
  { id: 'night_broth', kind: 'item', weight: 3, category: 'potions' },
  // --- стройматериалы (полка «Стройматериалы» — валюты кошелька, ветка Категории)
  { id: 'stone', kind: 'currency', weight: 8, category: 'building' },
  { id: 'logs', kind: 'currency', weight: 8, category: 'building' },
  { id: 'planks', kind: 'currency', weight: 7, category: 'building' },
  { id: 'nails', kind: 'currency', weight: 7, category: 'building' },
  { id: 'coal', kind: 'currency', weight: 7, category: 'building' },
  // --- редкости (полка «Редкости» — legendary+, ветка Категории)
  { id: 'ancient_idol', kind: 'item', weight: 2, category: 'rarities' },
  { id: 'phoenix_charm', kind: 'item', weight: 2, category: 'rarities' },
  { id: 'dragon_fang', kind: 'item', weight: 1, category: 'rarities' },
  { id: 'star_gem', kind: 'item', weight: 1, category: 'rarities' },
];
