/**
 * Состояние озера (M08.1 + M08.2): слоты, вода, очередь икры, статы-витрина
 * (модель брифа SESSION-M08 §3.2; LakeSlot — канон 03-DATA §6). Формат v1 —
 * чистые данные (02 §11). ВСЕ таймеры — АБСОЛЮТНЫЕ даты (fedAt/bornAt/
 * readyAt/dueAt/usedAt — инвариант 02 §8).
 *
 * [M08.2 · F14 · ВТОРОЕ ОЗЕРО — каноническая форма v13 НЕ переформировывается]
 * Срез = ОЗЕРО №1 (поля верхнего уровня, байт-в-байт форма M08.1:
 * {v, slots, water, roe, stats, pairs?}) + АДДИТИВНО-ОПЦИОНАЛЬНЫЕ поля:
 *   upgrades?: string[]  — [F10] владение улучшениями ПЕР-ОЗЕРО;
 *   research?: {mode?, usedAt} — [F13] форс Лаборатории + якорь кулдауна;
 *   lake2?: LakeGroup     — [F14] второе озеро (создаётся покупкой);
 *   activeLake?: number   — [F14] активное озеро витрины/ухода (1 = второе;
 *     отсутствие/0 = первое; хранится только 1 — форма минимальна).
 * Ленивые дефолты при чтении (отсутствие = одно озеро, без улучшений, без
 * форса) — БЕЗ bump сейва (прецеденты pairs-поля F1 / location M07.2).
 * ТИКИ идут по ОБЕИМ озёрам; уход/витрина/покупки/исполнители — по активному.
 */
import type { SaveSlice } from '@/kernel/save/save-director';
import type { ID, QualityTier } from '@/shared/types/ids';

/** слот озера (03-DATA §6): пустой = { sick: false } */
export interface LakeSlot {
  fishId?: ID;
  quality?: QualityTier;
  /** абсолютная дата последнего кормления (голод = старше hungryHours) */
  fedAt?: number;
  sick: boolean;
  /** абсолютная дата появления в озере (выпуск/рождение) */
  bornAt?: number;
}

/** запись очереди икры (созревание → взрослая рыба в свободный слот) */
export interface RoeRecord {
  fishId: ID;
  tier: QualityTier;
  /** абсолютная дата созревания */
  readyAt: number;
}

/** активная авто-пара вида (тиры фиксированы на старте — прецедент pen) */
export interface PairInfo {
  fishId: ID;
  slotA: number;
  slotB: number;
  tierA: QualityTier;
  tierB: QualityTier;
  /** абсолютная дата появления икры */
  dueAt: number;
}

/** [M08.2 · F13] Лаборатория: направленный форс мутации + якорь кулдауна.
 *  mode отсутствует = форс потреблён (следующая икра уже родилась);
 *  usedAt — момент применения lake.research (кулдаун 24ч от него) */
export interface LakeResearch {
  mode?: 'plus1' | 'plus2';
  usedAt: number;
}

/** [M08.2 · F14] группа ОЗЕРА — форма полей идентична озеру №1 */
export interface LakeGroup {
  slots: LakeSlot[];
  water: { temperature: number; cleanliness: number };
  roe: RoeRecord[];
  stats: { released: number; bred: number; harvested: number };
  pairs?: Record<string, PairInfo>;
  /** [F10] купленные улучшения (пер-озеро) */
  upgrades?: string[];
  /** [F13] форс Лаборатории + кулдаун */
  research?: LakeResearch;
}

export interface LakeState extends LakeGroup {
  v: 1;
  /** [F14] второе озеро (создаётся покупкой «Второго озера») */
  lake2?: LakeGroup;
  /** [F14] активное озеро (1 = второе; отсутствие = первое) */
  activeLake?: number;
}

export function defaultLakeGroup(): LakeGroup {
  return {
    slots: [{ sick: false }, { sick: false }, { sick: false }, { sick: false }, { sick: false }, { sick: false }],
    water: { temperature: 15, cleanliness: 70 },
    roe: [],
    stats: { released: 0, bred: 0, harvested: 0 },
  };
}

export function defaultLakeState(): LakeState {
  return { v: 1, ...defaultLakeGroup() };
}

/** канонический порядок полей слота — один для записи/санации (roundtrip) */
export function canonicalSlot(s: LakeSlot): LakeSlot {
  return {
    ...(s.fishId !== undefined ? { fishId: s.fishId } : {}),
    ...(s.quality !== undefined ? { quality: s.quality } : {}),
    ...(s.fedAt !== undefined ? { fedAt: s.fedAt } : {}),
    sick: s.sick === true,
    ...(s.bornAt !== undefined ? { bornAt: s.bornAt } : {}),
  };
}

function canonicalRoe(r: RoeRecord): RoeRecord {
  return { fishId: r.fishId, tier: r.tier, readyAt: r.readyAt };
}

function canonicalPair(p: PairInfo): PairInfo {
  return { fishId: p.fishId, slotA: p.slotA, slotB: p.slotB, tierA: p.tierA, tierB: p.tierB, dueAt: p.dueAt };
}

/** канонический порядок полей ГРУППЫ (озеро №1 — префикс формы v13) */
export function canonicalLakeGroup(g: LakeGroup): LakeGroup {
  const pairs = g.pairs ?? {};
  const upgrades = [...(g.upgrades ?? [])];
  return {
    slots: g.slots.map(canonicalSlot),
    water: { temperature: g.water.temperature, cleanliness: g.water.cleanliness },
    roe: g.roe.map(canonicalRoe),
    stats: {
      released: g.stats.released,
      bred: g.stats.bred,
      harvested: g.stats.harvested,
    },
    ...(Object.keys(pairs).length > 0 ? { pairs: Object.fromEntries(Object.entries(pairs).map(([k, p]) => [k, canonicalPair(p)])) } : {}),
    ...(upgrades.length > 0 ? { upgrades } : {}),
    ...(g.research !== undefined ? { research: { ...(g.research.mode !== undefined ? { mode: g.research.mode } : {}), usedAt: g.research.usedAt } } : {}),
  };
}

/** канонический порядок полей СОСТОЯНИЯ — roundtrip байт-в-байт; форма
 *  дефолта v13 = M08.1 (без upgrades/research/lake2/activeLake) */
export function canonicalLakeState(s: LakeState): LakeState {
  const { v: _v, lake2, activeLake, ...group } = s;
  void _v;
  const out: LakeState = { v: 1, ...canonicalLakeGroup(group) };
  if (lake2 !== undefined) out.lake2 = canonicalLakeGroup(lake2);
  if (activeLake === 1) out.activeLake = 1;
  return out;
}

// ------------------------------------------------ группы: доступ/запись [F14]

/** озеро №N как группа (0 = поля верхнего уровня; 1 = lake2) */
export function groupOf(s: LakeState, idx: number): LakeGroup {
  if (idx === 1) return s.lake2 ?? defaultLakeGroup();
  const { v: _v, lake2: _l2, activeLake: _a, ...group } = s;
  void _v; void _l2; void _a;
  return group;
}

/** собрать состояние с обновлённой группой №N (канонический порядок полей) */
export function withGroup(s: LakeState, idx: number, g: LakeGroup): LakeState {
  if (idx === 1) {
    const out = canonicalLakeState(s);
    out.lake2 = canonicalLakeGroup(g);
    return out;
  }
  const { v: _v, lake2, activeLake, ...old } = s;
  void old;
  const out = canonicalLakeState({ v: 1, ...g });
  if (lake2 !== undefined) out.lake2 = canonicalLakeGroup(lake2);
  if (activeLake === 1) out.activeLake = 1;
  return out;
}

/** индексы существующих озёр (lake2 отсутствует — только 0) */
export function lakeIndices(s: LakeState): number[] {
  return s.lake2 !== undefined ? [0, 1] : [0];
}

/** активное озеро (уход/витрина/покупки/исполнители — F14) */
export function activeLakeOf(s: LakeState): number {
  return s.activeLake === 1 && s.lake2 !== undefined ? 1 : 0;
}

/** переключить активное озеро (проверка существования — вызывающим) */
export function setActiveLake(s: LakeState, idx: number): LakeState {
  const out = canonicalLakeState(s);
  if (idx === 1) out.activeLake = 1;
  else delete out.activeLake;
  return out;
}

const num = (v: unknown, def: number): number =>
  typeof v === 'number' && Number.isFinite(v) ? v : def;

/** санация группы (битая форма = дефолт; П5; ленивые дефолты полей) */
function sanitizeGroup(raw: unknown): LakeGroup {
  const s = raw as LakeGroup | undefined;
  if (!s || typeof s !== 'object' || !Array.isArray(s.slots)) {
    return defaultLakeGroup();
  }
  const roe: RoeRecord[] = Array.isArray(s.roe)
    ? s.roe.filter(
        (r): r is RoeRecord =>
          r !== null && typeof r === 'object' && typeof r.fishId === 'string' &&
          typeof r.tier === 'string' && typeof r.readyAt === 'number' && Number.isFinite(r.readyAt),
      )
    : [];
  const pairs: Record<string, PairInfo> = {};
  if (s.pairs && typeof s.pairs === 'object') {
    for (const [k, v] of Object.entries(s.pairs as Record<string, unknown>)) {
      const p = v as PairInfo | undefined;
      if (
        p && typeof p === 'object' && typeof p.fishId === 'string' &&
        typeof p.slotA === 'number' && typeof p.slotB === 'number' &&
        typeof p.tierA === 'string' && typeof p.tierB === 'string' &&
        typeof p.dueAt === 'number' && Number.isFinite(p.dueAt)
      ) {
        pairs[k] = canonicalPair(p);
      }
    }
  }
  const upgrades = Array.isArray(s.upgrades)
    ? s.upgrades.filter((u): u is string => typeof u === 'string' && u.length > 0)
    : [];
  const r = s.research as LakeResearch | undefined;
  const research =
    r && typeof r === 'object' && typeof r.usedAt === 'number' && Number.isFinite(r.usedAt)
      ? { ...(r.mode === 'plus1' || r.mode === 'plus2' ? { mode: r.mode } : {}), usedAt: r.usedAt }
      : undefined;
  const water = (s.water && typeof s.water === 'object' ? s.water : {}) as { temperature?: unknown; cleanliness?: unknown };
  const stats = (s.stats && typeof s.stats === 'object' ? s.stats : {}) as { released?: unknown; bred?: unknown; harvested?: unknown };
  return canonicalLakeGroup({
    slots: s.slots.map(sanitizeSlot).filter((x): x is LakeSlot => x !== null),
    water: {
      temperature: Math.min(100, Math.max(0, num(water.temperature, 15))),
      cleanliness: Math.min(100, Math.max(0, num(water.cleanliness, 70))),
    },
    roe,
    stats: {
      released: Math.max(0, Math.floor(num(stats.released, 0))),
      bred: Math.max(0, Math.floor(num(stats.bred, 0))),
      harvested: Math.max(0, Math.floor(num(stats.harvested, 0))),
    },
    ...(Object.keys(pairs).length > 0 ? { pairs } : {}),
    ...(upgrades.length > 0 ? { upgrades } : {}),
    ...(research !== undefined ? { research } : {}),
  });
}

function sanitizeSlot(raw: unknown): LakeSlot | null {
  const s = raw as LakeSlot | undefined;
  if (!s || typeof s !== 'object') return null;
  if (typeof s.fishId !== 'string' || !s.fishId) return canonicalSlot({ sick: false });
  const slot: LakeSlot = {
    fishId: s.fishId,
    ...(typeof s.quality === 'string' ? { quality: s.quality as QualityTier } : {}),
    ...(typeof s.fedAt === 'number' && Number.isFinite(s.fedAt) ? { fedAt: s.fedAt } : {}),
    sick: s.sick === true,
    ...(typeof s.bornAt === 'number' && Number.isFinite(s.bornAt) ? { bornAt: s.bornAt } : {}),
  };
  return canonicalSlot(slot);
}

function sanitize(raw: unknown): LakeState {
  const s = raw as LakeState | undefined;
  if (!s || typeof s !== 'object' || !Array.isArray(s.slots)) {
    return defaultLakeState();
  }
  const out = canonicalLakeState({ v: 1, ...sanitizeGroup(s) });
  if (s.lake2 !== undefined && s.lake2 !== null && typeof s.lake2 === 'object') {
    out.lake2 = sanitizeGroup(s.lake2);
  }
  if (s.activeLake === 1 && out.lake2 !== undefined) out.activeLake = 1;
  return out;
}

/** Срез сейва: чистые данные; канонический порядок — roundtrip байт-в-байт */
export function lakeSaveSlice(
  getState: () => LakeState,
  setState: (s: LakeState) => void,
): SaveSlice {
  return {
    save: () => canonicalLakeState(getState()),
    load: (data: unknown) => setState(sanitize(data)),
  };
}
