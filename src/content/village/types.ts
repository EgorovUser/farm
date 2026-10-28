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
 *  override фактическим уровнем). */
export interface VillageBasesTable {
  bases: {
    'village.tax.gold': number;
    'village.level': number;
  };
  meta: {
    'village.tax.gold': { min?: number; round?: 'round' | 'floor' | 'ceil' | 'none' };
    'village.level': { min?: number; round?: 'round' | 'floor' | 'ceil' | 'none' };
  };
}
