/**
 * Типы контента M16 «Деревня» (03-DATA §8 «Экономика и деревня» — канон
 * VillagerDef; бриф SESSION-M16.1 §0/G2). Поля канона не переименовываются,
 * расширение — только аддитивно (03-DATA §12).
 *
 * VillagerDef.needs — КАНДИДАТЫ потребностей жителя (срезовая активная
 * потребность — ровно одна, ролл dailySeed выбирает из кандидатов):
 *   daily  — перекатываются каждый день;
 *   weekly — ролл на iso-неделе (сид по якорю-понедельнику), держится
 *            всю неделю до удовлетворения.
 * Пул весов кандидатов — content/village/needs.ts (мастер-таблица);
 * неизвестный деф-id в мастер-таблице — вес 1 (П5).
 */
import type { Condition } from '@/shared/types/requirement';

export interface VillagerNeedDef {
  defId: string;
  qty: number;
}

/** канон 03-DATA §8 (id/name/profession/needs/unlock) */
export interface VillagerDef {
  id: string;
  name: string;
  profession: string;
  needs: {
    daily?: VillagerNeedDef[];
    weekly?: VillagerNeedDef[];
  };
  /** гейт жителя (обычно {t:'statAtLeast', stat:'village.level', value:N}) */
  unlock?: Condition;
}

/** запись мастер-пула потребностей (needs.ts): вес ролла + категория */
export interface VillageNeedPoolEntry {
  defId: string;
  weight: number;
  cat: 'food' | 'materials' | 'goods' | 'fish';
}

export interface VillageNeedsTable {
  daily: VillageNeedPoolEntry[];
  weekly: VillageNeedPoolEntry[];
}

/** формула налога (tax.ts): всё через шину — база + inc-моды провайдера */
export interface VillageTaxTable {
  /** база стат 'village.tax.gold' (зеркало в bases — П2) */
  baseGold: number;
  /** +N% за уровень деревни свыше 1 */
  perLevelPercent: number;
  /** счастье: ±swing на полном размахе (100 против 0, стык pivot) */
  happinessSwingPercent: number;
  happinessPivot: number;
  /** −N% за каждого ворчуна (grumbleDays ≥ порога) */
  grumblerPenaltyPercent: number;
}

/** подарки (gifts.ts): шанс при удовлетворении + таблица */
export interface VillageGiftEntry {
  t: 'currency' | 'item';
  id: string;
  qtyMin: number;
  qtyMax: number;
  weight: number;
  /** для item-подарков: тир выдачи (рыба A — канал inventory.add) */
  tier?: 'D' | 'C' | 'B' | 'A' | 'S' | 'SS';
  /** дробная часть качества (value 0..100) */
  value?: number;
}

export interface VillageGiftsTable {
  chanceBasePercent: number;
  /** +до N% при счастье 100 (линейно от pivot) */
  chanceHappinessBonusPercent: number;
  /** −до N% при счастье 0 (линейно от pivot) */
  chanceHappinessMalusPercent: number;
  happinessPivot: number;
  table: VillageGiftEntry[];
}

/** помощь (help.ts): задачи СУЩЕСТВУЮЩИХ типов TaskRegistry (02 §10) */
export interface VillageHelpTaskDef {
  type: string;
  label: string;
  /** сколько повторов вызова исполнителя (батч: «вспашет 4 грядки») */
  repeats: number;
  /** контракт M16.2 (карточка §3 «помочь в бою»): тип не зарегистрирован —
   *  селектор пропускает незарегистрированные (tasks.has, П5) */
  contractOnly?: boolean;
}

export interface VillageHelpTable {
  /** сколько задач в день (карточка §3 «раз в день» = 1) */
  perDay: number;
  tasks: VillageHelpTaskDef[];
}

/** [M16.2] цена уровня постройки: золото + материалы/изделия — TransactionService
 *  (t: 'currency' — валюты кошелька 03-DATA §1: planks/logs/nails/stone…;
 *   t: 'item' — предметы M09: iron_ingot/iron_plate/cloth/warm_scarf…) */
export interface VillageCostEntry {
  t: 'currency' | 'item';
  id: string;
  qty: number;
}

/** уровень постройки 1–3 (карточка §3: «улучшение = та же механика») */
export interface VillageBuildingLevelDef {
  costGold: number;
  items: VillageCostEntry[];
  /** ЧАСЫ РЕАЛЬНОГО ВРЕМЕНИ до завершения (таймер hourTick-класса, §0) */
  hours: number;
  /** сила эффекта уровня (смысл — по kind здания) */
  effect: number;
  /** XP деревне за ЗАВЕРШЕНИЕ уровня (карточка §3: XP = Σ потребностей И ПОСТРОЕК) */
  xp: number;
}

/** здание деревни (карточка §3 — 9 штук; [DECISION M162-здания]) */
export interface VillageBuildingDef {
  id: string;
  name: string;
  desc: string;
  /** house +1 житель (unlock-скидка) / warehouse защита % / forge −% ремонта /
   *  market −% купцов / defense защита рейда / happiness аура счастья */
  kind: 'house' | 'warehouse' | 'forge' | 'market' | 'defense' | 'happiness';
  /** гейт открытия — уровень ДЕРЕВНИ (statAtLeast 'village.level' — override провайдера) */
  unlock: Condition;
  levels: [VillageBuildingLevelDef, VillageBuildingLevelDef, VillageBuildingLevelDef];
}

/** рейд гоблинов (карточка §4; [DECISION M162-рейд] — порог-данные, БЕЗ rng) */
export interface VillageRaidTable {
  /** iso-день недели рейд-ночи (1=пн..7=вс) */
  weekday: number;
  /** час ночи рейда (локальное время игрока) */
  hour: number;
  /** предвестник РОВНО за N часов (каталог: 24) */
  warningLeadHours: number;
  /** порог защиты: base + perVillageLevel × (уровень деревни − 1) */
  threshold: { base: number; perVillageLevel: number };
  defense: {
    /** базовая сила по типу предмета (weapon/armor/shield; прочее — other) */
    typeBase: Record<string, number>;
    /** +за ранг тира качества (D=0 .. SS=5) */
    tierStep: number;
    /** + value × factor (дробная часть качества 0..100) */
    valueFactor: number;
    /** + за уровень заточки (forgeLevel; канал M10 «заточка → качество») */
    sharpenStep: number;
    /** какие типы предметов можно вручать жителям (карточка §4: оружие/броня) */
    equippableTypes: string[];
  };
  stolen: {
    /** база кражи (% склада) при минимальном дефиците */
    basePercent: number;
    /** +% за каждый пункт дефицита защиты ниже порога */
    perDeficitPoint: number;
    /** КАПА cozy-инварианта: кража ≤ 20% склада дня (zod + чек-оракул) */
    capPercent: number;
    /** что воруется — данные (cozy: только золото; предметы игрока неприкосновенны) */
    currencies: ['gold'];
  };
  /** победа: +N счастья каждому жителю («строка счастья», карточка §4) */
  winHappinessBonus: number;
}

// ---------------------------------------------------------------- [M16.3] биржа

/** уникальный товар партнёра: покупается ТОЛЬКО у него, гейт — уровень
 *  репутации (индекс шкалы 0..3; карточка M16 §5 «уникальные товары») */
export interface VillageTradeGoodDef {
  defId: string;
  /** требуемый индекс уровня репутации (0=Чужак .. 3=Друг деревни) */
  requiredLevel: number;
}

/** деревня-партнёр биржи ([DECISION M163-партнёры]; карточка M16 §5) */
export interface VillageTradePartnerDef {
  id: string;
  name: string;
  desc: string;
  /** пул запросов контрактов дня (defId существующих предметов) */
  requests: string[];
  /** уникальные товары — продаёт ТОЛЬКО этот партнёр */
  goods: VillageTradeGoodDef[];
  /** стартовые очки репутации (данные; соседи начинают «Знакомыми») */
  startPoints: number;
  /** минимальный уровень репутации для контрактов (0 — торгует со всеми) */
  contractMinLevel: number;
}

/** таблица биржи (trade.ts; [DECISION M163-репутация/контракты/тренды]) */
export interface VillageTradeTable {
  reputation: {
    /** шкала уровней по возрастанию minPoints (4 ступени) */
    levels: Array<{ id: string; name: string; minPoints: number }>;
    /** очки за исполнение контракта */
    pointsPerContract: number;
    /** скидка уровня «Друг деревни» (04-DISCOUNTS §2.1: −5%) */
    friendDiscountPercent: number;
  };
  contracts: {
    qtyMin: number;
    qtyMax: number;
    /** тировые премии к ставке скупки (данные; взвешенный ролл по сиду) */
    premiums: number[];
  };
  trends: {
    /** сколько товаров биржи трендируется в день */
    perDay: number;
    /** «изобилие» — скидка на покупку (04-DISCOUNTS §2.1: −15%) */
    abundancePercent: number;
    /** «дефицит» — наценка на покупку (04-DISCOUNTS §4.3: markup) */
    deficitMarkupPercent: number;
    /** ± к премии контракта (изобилие −, дефицит +) */
    contractSwingPercent: number;
    /** кольцевой буфер истории цен (записей) */
    historyCap: number;
  };
  partners: VillageTradePartnerDef[];
}

/** общий баланс деревни (table.ts): счастье/ворчание/XP-кривая/гейт */
export interface VillageTable {
  gate: Condition;
  happiness: {
    start: number;
    max: number;
    gainOnSatisfy: number;
    dropPerGrumbleDay: number;
    /** сколько дней игнора до «воргуна» */
    grumbleThreshold: number;
  };
  level: {
    min: number;
    max: number;
    baseXp: number;
    growth: number;
  };
  xp: {
    perDailyNeed: number;
    perWeeklyNeed: number;
  };
}

/** БАЗЫ домена (П2; форма — паттерн BasesTable): 'village.tax.gold' =
 *  VILLAGE_TAX.baseGold (зеркало), 'village.level' = 1 (провайдер даёт
 *  override фактическим уровнем). [M16.2] Кузница/Рынок — базы 0
 *  (провайдер даёт override эффектом построенного уровня). */
export interface VillageBasesTable {
  bases: {
    'village.tax.gold': number;
    'village.level': number;
    'village.repair.discountPercent': number;
    'village.market.discountPercent': number;
  };
  meta: {
    'village.tax.gold': { min?: number; round?: 'round' | 'floor' | 'ceil' | 'none' };
    'village.level': { min?: number; round?: 'round' | 'floor' | 'ceil' | 'none' };
    'village.repair.discountPercent': { min?: number; round?: 'round' | 'floor' | 'ceil' | 'none' };
    'village.market.discountPercent': { min?: number; round?: 'round' | 'floor' | 'ceil' | 'none' };
  };
}
