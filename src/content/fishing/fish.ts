/**
 * ТАБЛИЦЫ ДРОПА РЫБАЛКИ (карточка M07 §3; FishDef — канон 03-DATA §6,
 * расширен аддитивными полями sizeGrams — физический вес улова для payload
 * cast.completed «вес/качество» и будущей кухни M09; прецедент cleanliness
 * M06.1: канон-файл 03-DATA не правится).
 *
 * Первый ролл — КАТЕГОРИЯ (веса + lucky-флаги по 02 §6): мусор 25 / мелкая
 * 40 / средняя 20 / редкая 8 (lucky: fishing.luck.rare) / сокровище 4
 * (lucky: fishing.treasure.weight) / событие 3 (lucky: fishing.luck.event).
 *
 * Стартовый пул пруда [DECISION брифа F3]: мелкая ×3 (Карась, Ротан, Окунь),
 * средняя ×2 (Линь, Щука), редкая ×1 (Зеркальный карп). Гейт-рыбы
 * (Золотой карп / Ледяная нерка / Древний сом) — M07.2; условия M07.1
 * проверяются механизмом eligibleFish (selftest синтетикой).
 *
 * biteSeconds — окно клёва рыбы [сек]; событие/сокровище/мусор используют
 * FISHING_TABLE.bite.defaultSeconds.
 */
import type { ID, Rarity } from '@/shared/types/ids';

/** категория первого ролла (lucky-записи тянут свою удачу — 02 §6) */
export interface DropCategoryDef {
  id: 'trash' | 'small' | 'medium' | 'rare' | 'treasure' | 'event';
  name: string;
  weight: number;
  /** lucky: вес × (1 + luck/100) — какой стат даёт удачу на эту категорию */
  lucky?: boolean;
  luckStat: 'fishing.luck.rare' | 'fishing.treasure.weight' | 'fishing.luck.event' | 'fishing.luck.trash' | 'fishing.luck.small' | 'fishing.luck.medium';
}

/** рыба (03-DATA §6 FishDef + sizeGrams; предмет-деф — content/items) */
export interface FishDef {
  id: ID;
  name: string;
  /** категория дропа */
  category: 'small' | 'medium' | 'rare';
  /** вес внутри категории */
  weight: number;
  /** базовая редкость вида (витрина альбома; редкость УЛОВА роллится) */
  rarity: Rarity;
  /** окно клёва, сек (карточка §2 «3–10 сек») */
  biteSeconds: [number, number];
  /** физический вес улова, граммы (payload cast.completed «вес/качество») */
  sizeGrams: [number, number];
  /** гейт-условия появления в пуле (карточка §4: удочка/наживка/уровень/ачивка) */
  conditions?: {
    /** активная наживка == defId */
    bait?: ID;
    /** тир удочки лестницы ≥ N (RODS.tier; вне лестницы — 0) */
    rodTierAtLeast?: number;
    /** уровень игрока ≥ N */
    playerLevel?: number;
    /** выданная ачивка */
    achievement?: ID;
  };
  /** [M08.1 · F3] требования содержания в озере (канон 03-DATA §6 FishDef;
   *  несоблюдение — рыба не даёт икру и чаще болеет; вид без записи —
   *  нейтрален {0–100, ≥0} — LAKE_TABLE.neutralRequirements) */
  lakeRequirements?: { tempMin: number; tempMax: number; cleanlinessMin: number };
}

/** мусор (предмет-деф — content/items; без редкости/качества улова) */
export interface TrashDef {
  id: ID;
  name: string;
  weight: number;
}

/** сундук-таблица (категория «сокровище»; карты сокровищ — M07.2) */
export interface ChestEntryDef {
  id: ID;
  /** предмет ИЛИ валюта (gold) */
  kind: 'item' | 'currency';
  defId: ID;
  weight: number;
  /** lucky-запись тянет fishing.luck.rare (02 §6; редкая тяга сундука) */
  lucky?: boolean;
  qty: [number, number];
}

/** событие-мини (карточка §4; [M07.2 · F14] опции ×2 с исходами — до
 *  фазы 6 авто-резолв ДЕФОЛТНОЙ (первой) опции; manual — M18) */
export interface FishingEventDef {
  id: ID;
  name: string;
  text: string;
  weight: number;
  options: EventOptionDef[];
}

export const DROP_CATEGORIES: DropCategoryDef[] = [
  { id: 'trash', name: 'Мусор', weight: 25, luckStat: 'fishing.luck.trash' },
  { id: 'small', name: 'Мелкая рыба', weight: 40, luckStat: 'fishing.luck.small' },
  { id: 'medium', name: 'Средняя рыба', weight: 20, luckStat: 'fishing.luck.medium' },
  { id: 'rare', name: 'Редкая рыба', weight: 8, lucky: true, luckStat: 'fishing.luck.rare' },
  { id: 'treasure', name: 'Сокровище', weight: 4, lucky: true, luckStat: 'fishing.treasure.weight' },
  { id: 'event', name: 'Событие', weight: 3, lucky: true, luckStat: 'fishing.luck.event' },
];

export const POND_FISH: FishDef[] = [
  {
    // [M08.1 · F3] сетка требований — бриф: Карась/Ротан/Окунь {5–30, ≥10}
    id: 'crucian',
    name: 'Карась',
    category: 'small',
    weight: 40,
    rarity: 'common',
    biteSeconds: [4, 8],
    sizeGrams: [200, 800],
    lakeRequirements: { tempMin: 5, tempMax: 30, cleanlinessMin: 10 },
  },
  {
    id: 'rotan',
    name: 'Ротан',
    category: 'small',
    weight: 35,
    rarity: 'common',
    biteSeconds: [3, 7],
    sizeGrams: [100, 400],
    lakeRequirements: { tempMin: 5, tempMax: 30, cleanlinessMin: 10 },
  },
  {
    id: 'perch',
    name: 'Окунь',
    category: 'small',
    weight: 25,
    rarity: 'common',
    biteSeconds: [4, 9],
    sizeGrams: [150, 600],
    lakeRequirements: { tempMin: 5, tempMax: 30, cleanlinessMin: 10 },
  },
  {
    // [M08.1 · F3] Линь/Щука {10–35, ≥20}
    id: 'tench',
    name: 'Линь',
    category: 'medium',
    weight: 55,
    rarity: 'uncommon',
    biteSeconds: [5, 10],
    sizeGrams: [400, 1500],
    lakeRequirements: { tempMin: 10, tempMax: 35, cleanlinessMin: 20 },
  },
  {
    id: 'pike',
    name: 'Щука',
    category: 'medium',
    weight: 45,
    rarity: 'uncommon',
    biteSeconds: [6, 10],
    sizeGrams: [800, 3000],
    lakeRequirements: { tempMin: 10, tempMax: 35, cleanlinessMin: 20 },
  },
  {
    // [M08.1 · F3] Зеркальный карп {10–35, ≥30}
    id: 'mirror_carp',
    name: 'Зеркальный карп',
    category: 'rare',
    weight: 100,
    rarity: 'rare',
    biteSeconds: [6, 10],
    sizeGrams: [1000, 4000],
    lakeRequirements: { tempMin: 10, tempMax: 35, cleanlinessMin: 30 },
  },
  {
    // [M07.2 · F11] гейт-рыба: ДОСТИЖИМА живьём (Мифриловая тир 5 + Икра +
    // ур. 20); 7-й вид пруда — условие «Хозяина пруда» (F15)
    id: 'golden_carp',
    name: 'Золотой карп',
    category: 'rare',
    weight: 30,
    rarity: 'rare',
    biteSeconds: [7, 10],
    sizeGrams: [1500, 5000],
    conditions: { bait: 'caviar_bait', rodTierAtLeast: 5, playerLevel: 20 },
    // [M08.1 · F3] Золотой карп {10–35, ≥50}
    lakeRequirements: { tempMin: 10, tempMax: 35, cleanlinessMin: 50 },
  },
];

/**
 * РЕКА (M07.2 · F12; карточка §5; канон M01 §5 «навык 10 рыболовства
 * открывает Реку»). Стартовый пул [DECISION-предложение спеки]:
 * мелкая ×3 (Вьюн/Елец/Пескарь), средняя ×2 (Голавль/Судак), редкая ×2
 * (Форель/Осётр) + гейт-рыбы F11 (нерка — средняя 8-й вид, сом — редкая
 * 9-й). Мусор и события-мини — ОБЩИЕ дефы пруда (переиспользование, НЕ
 * копия). Веса категорий — те же 25/40/20/8/4/3 (базы не дублируются, П2).
 */
export const RIVER_FISH: FishDef[] = [
  {
    // [M08.1 · F3] Вьюн/Елец/Пескарь {0–25, ≥10}
    id: 'loach',
    name: 'Вьюн',
    category: 'small',
    weight: 38,
    rarity: 'common',
    biteSeconds: [3, 7],
    sizeGrams: [100, 350],
    lakeRequirements: { tempMin: 0, tempMax: 25, cleanlinessMin: 10 },
  },
  {
    id: 'dace',
    name: 'Елец',
    category: 'small',
    weight: 34,
    rarity: 'common',
    biteSeconds: [3, 8],
    sizeGrams: [100, 400],
    lakeRequirements: { tempMin: 0, tempMax: 25, cleanlinessMin: 10 },
  },
  {
    id: 'gudgeon',
    name: 'Пескарь',
    category: 'small',
    weight: 28,
    rarity: 'common',
    biteSeconds: [3, 6],
    sizeGrams: [50, 150],
    lakeRequirements: { tempMin: 0, tempMax: 25, cleanlinessMin: 10 },
  },
  {
    // [M08.1 · F3] Голавль/Судак {5–30, ≥20}
    id: 'chub',
    name: 'Голавль',
    category: 'medium',
    weight: 50,
    rarity: 'uncommon',
    biteSeconds: [5, 10],
    sizeGrams: [400, 2000],
    lakeRequirements: { tempMin: 5, tempMax: 30, cleanlinessMin: 20 },
  },
  {
    id: 'zander',
    name: 'Судак',
    category: 'medium',
    weight: 50,
    rarity: 'uncommon',
    biteSeconds: [5, 10],
    sizeGrams: [800, 3500],
    lakeRequirements: { tempMin: 5, tempMax: 30, cleanlinessMin: 20 },
  },
  {
    // [M08.1 · F3] Форель {0–20, ≥30}
    id: 'trout',
    name: 'Форель',
    category: 'rare',
    weight: 60,
    rarity: 'rare',
    biteSeconds: [5, 9],
    sizeGrams: [500, 2500],
    lakeRequirements: { tempMin: 0, tempMax: 20, cleanlinessMin: 30 },
  },
  {
    // [M08.1 · F3] Осётр {5–25, ≥40}
    id: 'sturgeon',
    name: 'Осётр',
    category: 'rare',
    weight: 40,
    rarity: 'rare',
    biteSeconds: [6, 10],
    sizeGrams: [2000, 8000],
    lakeRequirements: { tempMin: 5, tempMax: 25, cleanlinessMin: 40 },
  },
  {
    // [M07.2 · F11] гейт-рыба-заглушка: ачивка «Хозяин озера» — домен M08
    // (не построен): гейт-оценщик читает unlockFlags ачивки, флага нет →
    // всегда закрыто до M08 (прецедент альпаки F3(а) M06.1); 8-й вид реки
    id: 'ice_char',
    name: 'Ледяная нерка',
    category: 'medium',
    weight: 35,
    rarity: 'rare',
    biteSeconds: [4, 8],
    sizeGrams: [600, 2500],
    conditions: { achievement: 'ach_lake_master' },
    // [M08.1 · F3] нерка {0–15, ≥50}
    lakeRequirements: { tempMin: 0, tempMax: 15, cleanlinessMin: 50 },
  },
  {
    // [M07.2 · F11] гейт-рыба-заглушка: ачивка «Глубины» — домен M12 (босс
    // слоя 3, не построен) + Легендарная приманка; 9-й вид реки
    id: 'ancient_som',
    name: 'Древний сом',
    category: 'rare',
    weight: 25,
    rarity: 'epic',
    biteSeconds: [8, 10],
    sizeGrams: [5000, 20000],
    conditions: { achievement: 'ach_depths', bait: 'legendary_bait' },
    // [M08.1 · F3] сом {5–25, ≥60}
    lakeRequirements: { tempMin: 5, tempMax: 25, cleanlinessMin: 60 },
  },
];

export const TRASH_ITEMS: TrashDef[] = [
  { id: 'old_boot', name: 'Старый ботинок', weight: 40 },
  { id: 'seaweed', name: 'Пучок водорослей', weight: 35 },
  { id: 'rusty_can', name: 'Ржавая банка', weight: 25 },
];

export const CHEST_TABLE: ChestEntryDef[] = [
  { id: 'chest_iron', kind: 'item', defId: 'iron_ore', weight: 30, qty: [3, 6] },
  // coal/nails — ВАЛЮТЫ кошелька (03-DATA §1 CurrencyId), не предметы
  { id: 'chest_gold', kind: 'currency', defId: 'gold', weight: 25, qty: [15, 40] },
  { id: 'chest_coal', kind: 'currency', defId: 'coal', weight: 20, qty: [2, 5] },
  { id: 'chest_nails', kind: 'currency', defId: 'nails', weight: 15, qty: [2, 4] },
  { id: 'charm_lucky', kind: 'item', defId: 'lucky_charm', weight: 10, lucky: true, qty: [1, 1] },
  // [M07.2 · F13] золото-пакеты [DECISION: 60/150/300з, веса 15/8/4] —
  // прямые награды в кошелёк (TransactionService, eventId fish.cast)
  { id: 'gold_pack_small', kind: 'currency', defId: 'gold', weight: 15, qty: [60, 60] },
  { id: 'gold_pack_medium', kind: 'currency', defId: 'gold', weight: 8, qty: [150, 150] },
  { id: 'gold_pack_big', kind: 'currency', defId: 'gold', weight: 4, qty: [300, 300] },
  // [M07.2 · F13] Карта сокровищ [DECISION: вес 10] — при вылове
  // запускает событие-мини «Клад» с выбором (см. TREASURE_MAP_TABLE)
  { id: 'treasure_map', kind: 'item', defId: 'treasure_map', weight: 10, qty: [1, 1] },
];

/**
 * ТАБЛИЦА НАГРАД КАРТЫ СОКРОВИЩ (M07.2 · F13; «Открыть сейчас» —
 * [DECISION]: золото 100–300 / ресурсы / редкий предмет; стрим
 * `fish:treasure:<iid>`). «Спрятать» — карта остаётся предметом
 * (трофей/продажа 40%). До фазы 6 — авто-резолв «Открыть сейчас».
 */
export interface TreasureMapEntryDef {
  id: ID;
  kind: 'currency' | 'item';
  defId: ID;
  weight: number;
  qty: [number, number];
}

export const TREASURE_MAP_TABLE: TreasureMapEntryDef[] = [
  { id: 'map_gold', kind: 'currency', defId: 'gold', weight: 50, qty: [100, 300] },
  { id: 'map_ore', kind: 'item', defId: 'iron_ore', weight: 30, qty: [4, 8] },
  { id: 'map_charm', kind: 'item', defId: 'lucky_charm', weight: 20, qty: [1, 1] },
];

/**
 * СОБЫТИЕ-МИНИ «КЛАД» (M07.2 · F13): запускается ВЫЛОВОМ Карты сокровищ
 * (категория «сокровище»), НЕ роллится в категории «событие». Выбор:
 * «Открыть сейчас» (дефолт — ролл награды из TREASURE_MAP_TABLE, стрим
 * fish:treasure:<iid>, карта расходуется) / «Спрятать» (карта остаётся
 * предметом — трофей/продажа 40%). До фазы 6 — авто-резолв дефолта.
 */
export interface TreasureMapEventDef {
  id: ID;
  name: string;
  text: string;
  options: Array<{ id: ID; label: string; outcome: { t: 'treasureRoll' } | { t: 'none' } }>;
}

export const TREASURE_MAP_EVENT: TreasureMapEventDef = {
  id: 'evt_treasure',
  name: 'Клад',
  text: 'На карте — крестик и корявая надпись: «Копай у старой ивы»',
  options: [
    { id: 'open', label: 'Открыть сейчас', outcome: { t: 'treasureRoll' } },
    { id: 'stash', label: 'Спрятать', outcome: { t: 'none' } },
  ],
};

/**
 * Исход опции события-мини (M07.2 · F14): награды ТОЛЬКО штатными каналами —
 * кошелёк (TransactionService grants) / навык-XP (skills.addXp M01) / ничего;
 * НОВЫХ событий в каталог 02 §4 НЕ добавляется (запрет брифа).
 */
export type EventOutcome =
  | { t: 'skillXp'; skill: ID; amount: number }
  | { t: 'gold'; qty: number }
  | { t: 'none' };

export interface EventOptionDef {
  id: ID;
  label: string;
  outcome: EventOutcome;
}

export const FISHING_EVENTS: FishingEventDef[] = [
  {
    // [M07.2 · F14] «Отпустить» (дефолт — XP Рыболовства) / «Продать» (30з)
    id: 'evt_mermaid',
    name: 'Русалка',
    text: 'Из воды выпрыгнула русалка и помахала хвостом',
    weight: 50,
    options: [
      { id: 'release', label: 'Отпустить', outcome: { t: 'skillXp', skill: 'fishing', amount: 15 } },
      { id: 'sell', label: 'Продать', outcome: { t: 'gold', qty: 30 } },
    ],
  },
  {
    // [M07.2 · F14] «Прочитать» (дефолт — XP) / «Выбросить» (ничего)
    id: 'evt_bottle',
    name: 'Бутылка с запиской',
    text: 'В бутылке записка: «Клюёт у камышей после заката»',
    weight: 50,
    options: [
      { id: 'read', label: 'Прочитать', outcome: { t: 'skillXp', skill: 'fishing', amount: 10 } },
      { id: 'discard', label: 'Выбросить', outcome: { t: 'none' } },
    ],
  },
];
