/**
 * Состояние загона (M06.1): животные и склад (модель брифа §3.2; AnimalInstance
 * — канон 03-DATA §6). Формат v1 — чистые данные (02 §11). ВСЕ таймеры —
 * АБСОЛЮТНЫЕ даты (nextProduceAt, дневные якоря fedDay/pettedDay — инвариант
 * 02 §8): оффлайн-досчёт = ленивая переоценка по текущему now + dayTick-проходы
 * ядра (catchUp публикует те же границы, кап 14).
 *
 * [F6] cleanliness — ДОПОЛНИТЕЛЬНОЕ поле AnimalInstance: в 03-DATA §6 его
 * нет, вводится аддитивно в модульной схеме (прецедент FarmTile.harvestsLeft/
 * fruitingUntil M05.3; канон-файл 03-DATA не правится).
 *
 * [F6 · DECISION-форма якорей дня] дневные лимиты (кормить/гладить 1/день)
 * anchored per-животное полями fedDay/pettedDay = локальный dayIndex (дней от
 * epoch по локальному календарю — та же арифметика, что TimeService.dayIndex);
 * аддитивно-опциональные + ленивые дефолты при чтении (undefined = «не сегодня»).
 *
 * [F7 · DECISION-форма offlineReport] переполнение склада (продукция сверх
 * cap — не копится, теряется) и голодные/грязные дни копятся в срезе:
 * overflow: Record<defId, qty> и счётчики животных hungryDays/dirtyDays —
 * витрина pen.state честно показывает отчёт (канал OfflineReport ядра
 * структурно закрыт для модулей — свой срез = тот же честный смысл).
 */
import type { SaveSlice } from '@/kernel/save/save-director';
import type { ID, QualityTier } from '@/shared/types/ids';

/** экземпляр животного (03-DATA §6 + аддитивные поля M06.1) */
export interface AnimalInstance {
  speciesId: ID;
  /** тир качества экземпляра (03-DATA §6: у животных — только тир) */
  quality: QualityTier;
  happiness: number;
  satiety: number;
  health: number;
  /** абсолютная дата следующей продукции (покупка: now + periodHours) */
  nextProduceAt?: number;
  /** [F6] чистота 0..100 (аддитивно — прецедент harvestsLeft) */
  cleanliness?: number;
  /** [F6] якорь дневного лимита кормления (локальный dayIndex) */
  fedDay?: number;
  /** [F6] якорь дневного лимита «гладить» (локальный dayIndex) */
  pettedDay?: number;
  /** [F7] счётчик голодных дней (satiety = 0 на dayTick-проходе) */
  hungryDays?: number;
  /** [F7] счётчик грязных дней (cleanliness = 0 на dayTick-проходе) */
  dirtyDays?: number;
  /** [M06.2 · F1] дата заболевания (undefined = здорова; absolute ms) */
  sickAt?: number;
  /** [M06.2 · F1] окно иммунитета после выздоровления (до этой даты) */
  immuneUntil?: number;
}

/** [M06.2 · F5] активное разведение (одиночный процесс — [DECISION]: новый
 * pen.breed при активном — отказ; тиры родителей фиксируются на старте —
 * продажа родителя до рождения не меняет исход) */
export interface BreedingInfo {
  pen: 1 | 2;
  speciesId: ID;
  maxParentTier: QualityTier;
  /** абсолютная дата рождения (dueAt ≤ now → рождение при свободном слоте) */
  dueAt: number;
}

export interface PenState {
  v: 1;
  /** животные загона (слоты; база слотов — данные PEN_TABLE.slots, не сейв) */
  animals: AnimalInstance[];
  /** [M06.2 · F3] животные второго загона («Второй загон»; свои слоты) */
  animals2?: AnimalInstance[];
  /** склад продукции ЗАГОНА 1: defId → накоплено единиц ([M06.2] у каждого
   *  загона свой склад — полная «копия» по [DECISION-форме F3: адресация
   *  care/collect параметром загона]; в инвентарь продукция сливается сбором) */
  stock: Record<string, number>;
  /** [F7] потеряно сверх склад-cap ЗАГОНА 1 (offlineReport-часть витрины) */
  overflow: Record<string, number>;
  /** [M06.2 · F3] склад и потери ЗАГОНА 2 (ленивые дефолты) */
  stock2?: Record<string, number>;
  overflow2?: Record<string, number>;
  /** [M06.2 · F4] буфер навоза (кап — данные PEN_TABLE.manure.cap) */
  manure?: number;
  /** [M06.2 · F3] купленные улучшения: id → уровень (Амбар 1..3) */
  upgrades?: Record<string, number>;
  /** [M06.2 · F5] активное разведение (undefined = нет процесса) */
  breeding?: BreedingInfo;
  /** [M06.2 · F3] последний день работы автокормушки (локальный dayIndex) */
  autofeedDay?: number;
}

export function defaultPenState(): PenState {
  return { v: 1, animals: [], stock: {}, overflow: {} };
}

/** локальный dayIndex (дней от epoch по локальному календарю; та же
 *  арифметика, что TimeService.dayIndex — якоря дневных лимитов) */
export function localDayIndex(ms: number): number {
  const d = new Date(ms);
  const midnight = Date.UTC(d.getFullYear(), d.getMonth(), d.getDate());
  return Math.floor(midnight / 86_400_000);
}

/** канонический порядок полей экземпляра — ОДИН порядок для покупки/патчей/
 *  санации: raw-сейв после load+re-save сериализуется байт-в-байт
 *  (инвариант roundtrip F5/MEL-B; аддитивные поля — опционально) */
export function canonicalAnimal(a: AnimalInstance): AnimalInstance {
  return {
    speciesId: a.speciesId,
    quality: a.quality,
    happiness: a.happiness,
    satiety: a.satiety,
    health: a.health,
    ...(a.nextProduceAt !== undefined ? { nextProduceAt: a.nextProduceAt } : {}),
    cleanliness: a.cleanliness ?? 100,
    ...(a.fedDay !== undefined ? { fedDay: a.fedDay } : {}),
    ...(a.pettedDay !== undefined ? { pettedDay: a.pettedDay } : {}),
    hungryDays: a.hungryDays ?? 0,
    dirtyDays: a.dirtyDays ?? 0,
    ...(a.sickAt !== undefined ? { sickAt: a.sickAt } : {}),
    ...(a.immuneUntil !== undefined ? { immuneUntil: a.immuneUntil } : {}),
  };
}

/** канонический порядок полей СОСТОЯНИЯ — один порядок для сейва и санации
 * (roundtrip байт-в-байт независимо от истории мутаций; для срезов без
 * новых полей совпадает с формой M06.1 {v, animals, stock, overflow}) */
export function canonicalPenState(s: PenState): PenState {
  return {
    v: 1,
    animals: s.animals,
    ...(s.animals2 !== undefined ? { animals2: s.animals2 } : {}),
    stock: s.stock,
    ...(s.stock2 !== undefined ? { stock2: s.stock2 } : {}),
    overflow: s.overflow,
    ...(s.overflow2 !== undefined ? { overflow2: s.overflow2 } : {}),
    ...(s.manure !== undefined && s.manure > 0 ? { manure: s.manure } : {}),
    ...(s.upgrades !== undefined && Object.keys(s.upgrades).length > 0 ? { upgrades: s.upgrades } : {}),
    ...(s.breeding !== undefined ? { breeding: s.breeding } : {}),
    ...(s.autofeedDay !== undefined ? { autofeedDay: s.autofeedDay } : {}),
  };
}

/** лёгкая санация формы при загрузке (битая форма = дефолт; прецедент П5):
 *  аддитивные поля — ленивые дефолты (cleanliness/fedDay/pettedDay/
 *  hungryDays/dirtyDays; прецедент weeds/upgrades M05.2/M05.3) */
function sanitizeAnimal(raw: unknown): AnimalInstance | null {
  const a = raw as AnimalInstance | undefined;
  if (!a || typeof a !== 'object' || typeof a.speciesId !== 'string' || !a.speciesId) return null;
  const num = (v: unknown, def: number): number =>
    typeof v === 'number' && Number.isFinite(v) ? v : def;
  return canonicalAnimal({
    speciesId: a.speciesId,
    quality: a.quality ?? 'D',
    happiness: num(a.happiness, 100),
    satiety: num(a.satiety, 100),
    health: num(a.health, 100),
    ...(a.nextProduceAt !== undefined ? { nextProduceAt: Number(a.nextProduceAt) } : {}),
    cleanliness: num(a.cleanliness, 100),
    ...(a.fedDay !== undefined ? { fedDay: Number(a.fedDay) } : {}),
    ...(a.pettedDay !== undefined ? { pettedDay: Number(a.pettedDay) } : {}),
    hungryDays: num(a.hungryDays, 0),
    dirtyDays: num(a.dirtyDays, 0),
    ...(a.sickAt !== undefined ? { sickAt: Number(a.sickAt) } : {}),
    ...(a.immuneUntil !== undefined ? { immuneUntil: Number(a.immuneUntil) } : {}),
  });
}

function sanitize(raw: unknown): PenState {
  const s = raw as PenState | undefined;
  if (!s || typeof s !== 'object' || !Array.isArray(s.animals)) {
    return defaultPenState();
  }
  const cleanNums = (rec: unknown): Record<string, number> => {
    const out: Record<string, number> = {};
    if (rec && typeof rec === 'object') {
      for (const [k, v] of Object.entries(rec as Record<string, unknown>)) {
        if (typeof v === 'number' && Number.isFinite(v) && v > 0) out[k] = v;
      }
    }
    return out;
  };
  // [M06.2] улучшения: id → уровень ≥ 1 (ленивый дефолт — отсутствие поля)
  const cleanUpgrades = (rec: unknown): Record<string, number> | undefined => {
    if (!rec || typeof rec !== 'object') return undefined;
    const out: Record<string, number> = {};
    for (const [k, v] of Object.entries(rec as Record<string, unknown>)) {
      if (typeof v === 'number' && Number.isFinite(v) && v >= 1) out[k] = Math.floor(v);
    }
    return Object.keys(out).length > 0 ? out : undefined;
  };
  const b = s.breeding as BreedingInfo | undefined;
  const breeding: BreedingInfo | undefined =
    b && typeof b === 'object' && typeof b.speciesId === 'string' &&
    (b.pen === 1 || b.pen === 2) && typeof b.dueAt === 'number' && Number.isFinite(b.dueAt)
      ? { pen: b.pen, speciesId: b.speciesId, maxParentTier: b.maxParentTier ?? 'D', dueAt: b.dueAt }
      : undefined;
  return canonicalPenState({
    v: 1,
    animals: s.animals.map(sanitizeAnimal).filter((a): a is AnimalInstance => a !== null),
    ...(Array.isArray(s.animals2)
      ? { animals2: (s.animals2 as unknown[]).map(sanitizeAnimal).filter((a): a is AnimalInstance => a !== null) }
      : {}),
    stock: cleanNums(s.stock),
    overflow: cleanNums(s.overflow),
    ...(s.stock2 !== undefined ? { stock2: cleanNums(s.stock2) } : {}),
    ...(s.overflow2 !== undefined ? { overflow2: cleanNums(s.overflow2) } : {}),
    ...(typeof s.manure === 'number' && Number.isFinite(s.manure) && s.manure > 0
      ? { manure: Math.floor(s.manure) }
      : {}),
    ...(cleanUpgrades(s.upgrades) !== undefined ? { upgrades: cleanUpgrades(s.upgrades) } : {}),
    ...(breeding !== undefined ? { breeding } : {}),
    ...(typeof s.autofeedDay === 'number' && Number.isFinite(s.autofeedDay)
      ? { autofeedDay: Math.floor(s.autofeedDay) }
      : {}),
  });
}

/** Срез сейва: чистые данные; КАНОНИЧЕСКИЙ порядок полей при записи и
 *  загрузке — roundtrip байт-в-байт (инвариант F5/MEL-B) */
export function penSaveSlice(
  getState: () => PenState,
  setState: (s: PenState) => void,
): SaveSlice {
  return {
    save: () => canonicalPenState(getState()),
    load: (data: unknown) => setState(sanitize(data)),
  };
}
