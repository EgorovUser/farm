/**
 * БАЛАНС РЫБАЛКИ (карточка M07 §2–§4; 03-DATA §11: имена таблиц = имена модулей).
 * Единственное место чисел рыбалки, НЕ живущих в дефах предметов (П6):
 * окно клёва по умолчанию (категории без рыбы: мусор/сокровище/событие).
 *
 * ВЕСА КАТЕГОРИЙ и ВЕСА РЕДКОСТЕЙ — БАЗЫ СТАТОВ (FISH_BASES_TABLE ниже):
 * fishing.weight.<rarity> — канонические веса редкости (карточка §3:
 * 60/25/10/4/0.9/0.1), читаются ТОЛЬКО через StatBus (П2/П3) — капы
 * maxFishRarity удочек и гарант «Легендарной приманки» реализованы
 * flat-модификаторами на эти базы (НИ ОДНОГО if-а в коде — карточка §3).
 *
 * ВЕСА КАТЕГОРИЙ ДРОПА (мусор 25 / мелкая 40 / средняя 20 / редкая 8 /
 * сокровище 4 / событие 3) — данные content/fishing/fish.ts (это контент
 * сущностей, не статы: lucky-семантика 02 §6 применяется к редкой/сокровищу/
 * событию с их удочами — fishing.luck.rare / fishing.treasure.weight /
 * fishing.luck.event).
 *
 * ЭНЕРГИЯ ЗАБРОСА — НЕ здесь: action.fishing.cast.energyCost = 4 живёт в
 * content/player/bases.ts с фазы M01 (конвенция action.farm и action.pen;
 * бриф F6: НЕ дублировать в balance — П2).
 *
 * КАЧЕСТВО УЛОВА — acquire-канон M02 (inventory.quality, D23): ролл качества
 * происходит в inventory.acquire — рыбалка своего качества НЕ роллит (F6).
 */
import type { BasesTable } from '@/content/balance/bases';

export interface FishingTable {
  /** окно клёва по умолчанию, секунды (карточка §2 «ожидание клёва 3–10 сек»;
   *  рыбы имеют СВОИ biteSeconds — это окно для мусора/сокровища/события) */
  bite: {
    defaultSeconds: [number, number];
  };
  /** модификатор скорости клёва (fishing.bite.speed): ожидание =
   *  rolled × (1 − speed/100), нижний предел — minWaitSeconds (Икра −10% → ×1.1) */
  biteSpeed: {
    minWaitSeconds: number;
  };
  /** витрина: сколько последних забросов помнит срез (ring-буфер для UI/M18) */
  log: {
    lastCasts: number;
  };
  /** [M07.2 · F12] локации: гейт открытия реки — навык Рыболовство
   *  (канон M01 §5 «навык 10 рыболовства открывает Реку»; число — здесь,
   *  НЕ в коде — П6) */
  locations: {
    riverSkillLevel: number;
  };
}

export const FISHING_TABLE: FishingTable = {
  bite: {
    defaultSeconds: [3, 10],
  },
  biteSpeed: {
    minWaitSeconds: 0.5,
  },
  log: {
    lastCasts: 10,
  },
  locations: {
    riverSkillLevel: 10, // [M07.2 · F12] гейт реки (карточка §5 / M01 §5)
  },
};

/**
 * Базы статов рыбалки (П2: задаются один раз; модификаторы — baitProvider
 * M07.1 / equipmentProvider M02 (baseStats удочек) / skillProvider M01).
 *
 * fishing.luck.rare НЕ ЗДЕСЬ — база 0 живёт в content/balance/bases.ts с
 * фазы 0 (демо-таблица demo.treasure; перенос = дубликат = отказ старта).
 *
 * [DECISION · M07.1] редкости улова — ОСЬ ПЕЙЛОАДА/АЛЬБОМА (fish.caught
 * {rarity} — для квестов «редкая рыба» и витрины), НЕ поля экземпляра:
 * ItemInstance в каноне 03-DATA §4 поля rarity не имеет, введение = миграция
 * домена M02 (НЕ этот сеанс). Экономика улова — каноническая: def.rarity ×
 * instance.quality через PriceBus (03-DATA §1: редкость и качество входят в
 * base экземпляра множителями).
 */
export const FISH_BASES_TABLE: BasesTable = {
  bases: {
    // --- веса редкости улова (карточка §3; lucky-семантика 02 §6 — rare+)
    'fishing.weight.common': 60,
    'fishing.weight.uncommon': 25,
    'fishing.weight.rare': 10,
    'fishing.weight.epic': 4,
    'fishing.weight.legendary': 0.9,
    'fishing.weight.mythic': 0.1,
    // --- удачи категорий (0 = база; бафы — flat от наживок/скиллов/пассивок)
    'fishing.luck.trash': 0,
    'fishing.luck.small': 0,
    'fishing.luck.medium': 0,
    'fishing.luck.event': 0,
    // --- «сокровищная» тяга: вес категории «сокровище» × (1 + weight/100)
    //     (карточка M03 §2 «treasureBias ×4» = +300; даёт Мифриловая удочка)
    'fishing.treasure.weight': 0,
    // --- скорость клёва: ожидание × (1 − speed/100) (Икра −10)
    'fishing.bite.speed': 0,
    // --- канон-стат зоны подсечки (порог 5 уровня навыка M01 даёт inc +10;
    //     UI подсечки — M18, до фазы 6 auto-score; удочки дают flat)
    'fish.minigame.zonePercent': 100,
  },
  meta: {
    // веса редкости: дробные (legendary 0.9), пол 0, без округления —
    // округляется только ИТОГОВЫЙ шанс витрины (П6)
    'fishing.weight.common': { min: 0, round: 'none' },
    'fishing.weight.uncommon': { min: 0, round: 'none' },
    'fishing.weight.rare': { min: 0, round: 'none' },
    'fishing.weight.epic': { min: 0, round: 'none' },
    'fishing.weight.legendary': { min: 0, round: 'none' },
    'fishing.weight.mythic': { min: 0, round: 'none' },
    'fishing.luck.trash': { min: 0, round: 'none' },
    'fishing.luck.small': { min: 0, round: 'none' },
    'fishing.luck.medium': { min: 0, round: 'none' },
    'fishing.luck.event': { min: 0, round: 'none' },
    'fishing.treasure.weight': { min: 0, round: 'none' },
    'fishing.bite.speed': { round: 'none' },
    'fish.minigame.zonePercent': { min: 1, round: 'floor' },
  },
};
