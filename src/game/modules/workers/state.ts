/**
 * Состояние работников (M11.1, бриф SESSION-M11 F1): срез `workers` = форма
 * v14 (migrate13to14 добавляет дефолт { v: 1, hired: [] }). WorkerInstance —
 * канон 03-DATA §10 (расширенный брифом F1: профиль ЗАМОРАЖИВАЕТСЯ при
 * найме — доска перероллится день-следующий, нанятый не меняется
 * [DECISION]; mood старт 50).
 *
 * Аддитивно-опциональные поля экземпляра (ленивые дефолты, прецедент
 * lake pairs F1): lowMoodDays? — счётчик дней подряд mood < 20 (F7);
 * lastBonusAt? — якорь кулдауна премии 7 дней (F4). ВСЕ таймеры —
 * АБСОЛЮТНЫЕ даты (sickUntil/hiredAt/lastBonusAt — инвариант 02 §8).
 *
 * Доска профилей НЕ хранится в сейве: она детерминирована
 * dailySeed(saveId, dateISO) и переролливается на лету (03-DATA §12).
 */
import type { SaveSlice } from '@/kernel/save/save-director';
import type { ID, QualityTier, Tag } from '@/shared/types/ids';
import type { RolledModEntry } from '@/shared/types/rolled-mod';
import type { WorkerObjectId, WorkerProfession, WorkersTable } from '@/content/workers/table';
import { WORKERS_TABLE } from '@/content/workers/table';
import type { WorkerUpgradeDef } from '@/content/workers/upgrades';
import { WORKER_UPGRADES } from '@/content/workers/upgrades';

/** [FIX-M11 · FX1] ЕДИНАЯ точка капа настроения (MISS-1 аудита AUDIT-M11):
 *  кап вычисляется ИЗ ДАННЫХ — владение улучшением «Домик» (деф с эффектом
 *  house, upg_worker_house) в срезе `upgrades?` → базовый кап таблицы
 *  (mood.max) + прирост из content/workers upgrades-дефов (Домик +5 → 105).
 *  Числа НЕ хардкодятся в логике (канон «числа в content»). Читают ОДНУ
 *  точку: sanitize load-пути (срез сам содержит upgrades? — доступно в
 *  sanitize(data), аудит §9 п.1), премия bonus (hire) и moodSet (dev);
 *  dayPass уже клэмпит к moodCap — FX1 её НЕ меняет, переиспользует. */
export function moodCapOf(
  state: Pick<WorkersState, 'upgrades'>,
  table: WorkersTable = WORKERS_TABLE,
  defs: readonly WorkerUpgradeDef[] = WORKER_UPGRADES,
): number {
  const owned = state.upgrades ?? [];
  const house = defs.find((u) => u.effect.t === 'house' && owned.includes(u.id));
  return table.mood.max + (house && house.effect.t === 'house' ? house.effect.moodCapBonus : 0);
}

/** [M11.2 · F10] последнее действие тика (витрина workers.last; аддитивно-
 *  опционально БЕЗ bump — ленивый дефолт «не действовал») */
export interface WorkerActionRecord {
  at: number;
  taskId: string;
  success: boolean;
}

export interface ToolRequirement {
  slot: Tag;
  minTier: QualityTier;
}

/** нанятый работник (03-DATA §10 + бриф F1) */
export interface WorkerInstance {
  defId: ID;
  name: string;
  profession: WorkerProfession;
  stars: 1 | 2 | 3 | 4 | 5;
  salaryPerDay: number;
  checkPeriodHours: 2 | 4 | 6;
  care: 1 | 2 | 3 | 4 | 5;
  traits: RolledModEntry[];
  toolRequirement?: ToolRequirement;
  /** назначенный объект (профессия ↔ тип; 1 объект = 1 работник) */
  object: WorkerObjectId;
  /** 0..100, старт 50 (карточка §4) */
  mood: number;
  /** абсолютная дата выздоровления (болен, пока > now; карточка §4) */
  sickUntil?: number;
  /** абсолютная дата найма */
  hiredAt: number;
  /** F7: дней подряд mood < 20 (ленивый дефолт 0) */
  lowMoodDays?: number;
  /** F4: абсолютная дата последней премии (кулдаун 7 дней) */
  lastBonusAt?: number;
  /** [M11.2 · F10] последнее действие тика (аддитивно-опционально) */
  lastAction?: WorkerActionRecord;
}

export interface WorkersState {
  v: 1;
  hired: WorkerInstance[];
  /** [M11.2 · F15] купленные улучшения качества жизни (ленивый дефолт []) */
  upgrades?: string[];
}

export function defaultWorkersState(): WorkersState {
  return { v: 1, hired: [] };
}

const num = (v: unknown, def: number): number =>
  typeof v === 'number' && Number.isFinite(v) ? v : def;

/** канонический порядок полей СОСТОЯНИЯ — roundtrip байт-в-байт
 *  (upgrades? — после hired; ленивый дефолт [] НЕ пишется — форма v14
 *  M11.1 сохраняется) */
export function canonicalWorkersState(s: WorkersState): WorkersState {
  const out: WorkersState = { v: 1, hired: s.hired.map(canonicalWorker) };
  const upgrades = [...(s.upgrades ?? [])];
  if (upgrades.length > 0) out.upgrades = upgrades;
  return out;
}

/** канонический порядок полей экземпляра — roundtrip байт-в-байт */
export function canonicalWorker(w: WorkerInstance): WorkerInstance {
  return {
    defId: w.defId,
    name: w.name,
    profession: w.profession,
    stars: w.stars,
    salaryPerDay: w.salaryPerDay,
    checkPeriodHours: w.checkPeriodHours,
    care: w.care,
    traits: w.traits.map((t) => ({
      type: t.type,
      value: t.value,
      from: t.from,
      ...(t.forgeLevel !== undefined ? { forgeLevel: t.forgeLevel } : {}),
    })),
    ...(w.toolRequirement !== undefined
      ? { toolRequirement: { slot: w.toolRequirement.slot, minTier: w.toolRequirement.minTier } }
      : {}),
    object: w.object,
    mood: w.mood,
    ...(w.sickUntil !== undefined ? { sickUntil: w.sickUntil } : {}),
    hiredAt: w.hiredAt,
    ...(w.lowMoodDays !== undefined && w.lowMoodDays !== 0 ? { lowMoodDays: w.lowMoodDays } : {}),
    ...(w.lastBonusAt !== undefined ? { lastBonusAt: w.lastBonusAt } : {}),
    ...(w.lastAction !== undefined
      ? { lastAction: { at: w.lastAction.at, taskId: w.lastAction.taskId, success: w.lastAction.success } }
      : {}),
  };
}

const PROFESSIONS: WorkerProfession[] = ['farmer', 'fishkeeper', 'herdsman'];
const OBJECTS: WorkerObjectId[] = ['field', 'field2', 'lake', 'lake2', 'pen', 'animals2'];

function sanitizeWorker(raw: unknown, moodCap: number): WorkerInstance | null {
  const w = raw as WorkerInstance | undefined;
  if (!w || typeof w !== 'object') return null;
  if (typeof w.defId !== 'string' || !w.defId) return null;
  if (typeof w.name !== 'string' || !w.name) return null;
  if (!PROFESSIONS.includes(w.profession)) return null;
  if (![1, 2, 3, 4, 5].includes(w.stars)) return null;
  if (typeof w.salaryPerDay !== 'number' || !Number.isFinite(w.salaryPerDay)) return null;
  if (![2, 4, 6].includes(w.checkPeriodHours)) return null;
  if (![1, 2, 3, 4, 5].includes(w.care)) return null;
  if (!Array.isArray(w.traits)) return null;
  if (!OBJECTS.includes(w.object)) return null;
  if (typeof w.mood !== 'number' || !Number.isFinite(w.mood)) return null;
  if (typeof w.hiredAt !== 'number' || !Number.isFinite(w.hiredAt)) return null;
  return canonicalWorker({
    defId: w.defId,
    name: w.name,
    profession: w.profession,
    stars: w.stars,
    salaryPerDay: w.salaryPerDay,
    checkPeriodHours: w.checkPeriodHours,
    care: w.care,
    traits: w.traits.filter(
      (t) => t !== null && typeof t === 'object' && typeof t.type === 'string' && typeof t.value === 'number',
    ),
    ...(w.toolRequirement !== undefined &&
    typeof w.toolRequirement === 'object' &&
    typeof w.toolRequirement.slot === 'string' &&
    typeof w.toolRequirement.minTier === 'string'
      ? { toolRequirement: { slot: w.toolRequirement.slot, minTier: w.toolRequirement.minTier as QualityTier } }
      : {}),
    object: w.object,
    // [FIX-M11 · MISS-1] верхняя граница = капу Домика из ДАННЫХ среза
    // (moodCapOf, FX1): load/import перестаёт срезать легальное живое
    // состояние 101–105 (с Домиком); без Домика клэмп к базовому 100 жив
    mood: Math.min(moodCap, Math.max(0, num(w.mood, 50))),
    ...(typeof w.sickUntil === 'number' && Number.isFinite(w.sickUntil) ? { sickUntil: w.sickUntil } : {}),
    hiredAt: w.hiredAt,
    ...(typeof w.lowMoodDays === 'number' && Number.isFinite(w.lowMoodDays) && w.lowMoodDays > 0
      ? { lowMoodDays: Math.floor(w.lowMoodDays) }
      : {}),
    ...(typeof w.lastBonusAt === 'number' && Number.isFinite(w.lastBonusAt) ? { lastBonusAt: w.lastBonusAt } : {}),
    ...(w.lastAction !== undefined &&
      typeof w.lastAction === 'object' && typeof w.lastAction.at === 'number' &&
      typeof w.lastAction.taskId === 'string' && typeof w.lastAction.success === 'boolean'
      ? { lastAction: { at: w.lastAction.at, taskId: w.lastAction.taskId, success: w.lastAction.success } }
      : {}),
  });
}

function sanitize(raw: unknown): WorkersState {
  const s = raw as WorkersState | undefined;
  if (!s || typeof s !== 'object' || !Array.isArray(s.hired)) {
    return defaultWorkersState();
  }
  const upgrades = Array.isArray(s.upgrades)
    ? s.upgrades.filter((u): u is string => typeof u === 'string' && u.length > 0)
    : [];
  // [FIX-M11 · MISS-1] кап load-пути — из владения Домиком в САМОМ срезе
  // (upgrades? уже распарсен выше): 101–105 легальны при Домике (105),
  // без Домика — базовый кап 100 (оракул отрицания)
  const moodCap = moodCapOf({ upgrades });
  const seen = new Set<string>();
  const hired = s.hired
    .map((w) => sanitizeWorker(w, moodCap))
    .filter((w): w is WorkerInstance => w !== null && !seen.has(w.defId) && seen.add(w.defId) !== undefined);
  const out: WorkersState = { v: 1, hired };
  if (upgrades.length > 0) out.upgrades = upgrades;
  return out;
}

/** Срез сейва: чистые данные; канонический порядок — roundtrip байт-в-байт */
export function workersSaveSlice(
  getState: () => WorkersState,
  setState: (s: WorkersState) => void,
): SaveSlice {
  return {
    save: () => canonicalWorkersState(getState()),
    load: (data: unknown) => setState(sanitize(data)),
  };
}

/** болен ли работник сейчас (лениво — абсолютная дата) */
export function isSick(w: WorkerInstance, now: number): boolean {
  return w.sickUntil !== undefined && w.sickUntil > now;
}
