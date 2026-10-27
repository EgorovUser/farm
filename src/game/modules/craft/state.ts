/**
 * Состояние крафта (M09): станции §2, очереди §5, готовый буфер, эффекты.
 * Формат v1 — чистые данные (02-BUSES §11). Времена — АБСОЛЮТНЫЕ даты
 * (endsAt/completedAt, инвариант 02-BUSES §8): оффлайн-досчёт = sweep по
 * текущему now, отдельного catchUp-кода у модуля нет.
 *
 * Пакет (CraftBatch): enqueuedAt — постановка; startedAt/endsAt — фактический
 * старт (партия стартует, когда предыдущая завершилась И готовый буфер < cap;
 * до старта undefined). Качество входов снапшотится в inputTier при постановке
 * (0..5, дробное) — «качество входных ингредиентов влияет» (карточка §4).
 */
import type { SaveSlice } from '@/kernel/save/save-director';
import type { ID, QualityTier } from '@/shared/types/ids';
import type { StationId } from '@/content/craft/stations';

/** пакет в очереди станции (ожидает ИЛИ работает) */
export interface CraftBatch {
  id: ID;
  recipeId: ID;
  station: StationId;
  enqueuedAt: number;
  startedAt?: number;
  endsAt?: number;
  /** снапшот avgInputTier (шкала 0..5) на момент постановки */
  inputTier: number;
  /** поправка мини-игры постановки (−1..+1; auto-режим — не задаётся) */
  minigameAdj?: number;
}

/** завершённая партия: качество готово, ждёт сбора (cap, карточка §5) */
export interface CraftReadyBatch {
  id: ID;
  recipeId: ID;
  station: StationId;
  completedAt: number;
  quality: { tier: QualityTier; value: number };
}

/** выданный постоянный эффект рецепта (рюкзак +4 слота; id уникален на партию) */
export interface CraftGrantedEffect {
  id: string;
  source: { kind: string; refId: string };
  stat: string;
  op: 'flat' | 'inc' | 'more' | 'override' | 'cap';
  value: number;
  label?: string;
}

export interface CraftStationState {
  upgrades: ID[];
}

export interface CraftState {
  v: 1;
  /** построенные станции: присутствие ключа = built (workbench всегда) */
  stations: Partial<Record<StationId, CraftStationState>>;
  /** очереди станций: пакеты в порядке постановки (хронологические) */
  queues: Partial<Record<StationId, CraftBatch[]>>;
  /** готовый буфер (все станции, порядок завершения) */
  ready: CraftReadyBatch[];
  /** постоянные эффекты рецептов (provider отдаёт их шине) */
  grantedEffects: CraftGrantedEffect[];
  /** монотонный счётчик id пакетов craft:N */
  seq: number;
}

export function defaultCraftState(): CraftState {
  return {
    v: 1,
    stations: { workbench: { upgrades: [] } },
    queues: {},
    ready: [],
    grantedEffects: [],
    seq: 0,
  };
}

// ------------------------------------------------------------- save slice

/**
 * Срез сейва 'craft' (02-BUSES §11). Санация П5: битые значения — к дефолту
 * поля; пакеты без рецепта/станции выбрасываются (контент мог исчезнуть),
 * готовый буфер режется до санитарного предела readyCap × 7 (глобальный на
 * все станции; per-station инвариант ready ≤ cap всегда держит sweep —
 * предел здесь только защита от раздутого сейва). [M10.1 · P2 OBS-6 AUDIT-M09]
 */
export function craftSaveSlice(
  getState: () => CraftState,
  setState: (s: CraftState) => void,
  deps: { readyCap: number; stationIds: readonly StationId[] },
): SaveSlice {
  return {
    save: () => {
      const s = getState();
      const stations: Record<string, { upgrades: ID[] }> = {};
      for (const [id, st] of Object.entries(s.stations)) {
        if (st) stations[id] = { upgrades: [...st.upgrades] };
      }
      const queues: Record<string, CraftBatch[]> = {};
      for (const [id, list] of Object.entries(s.queues)) {
        if (list) queues[id] = list.map((b) => ({ ...b }));
      }
      return {
        v: 1,
        stations,
        queues,
        ready: s.ready.map((r) => ({ ...r, quality: { ...r.quality } })),
        grantedEffects: s.grantedEffects.map((e) => ({ ...e })),
        seq: s.seq,
      };
    },
    load: (data) => {
      const parsed = data as Partial<CraftState> | null;
      if (!parsed || typeof parsed !== 'object') return;
      const num = (v: unknown, fallback: number, min: number): number =>
        typeof v === 'number' && Number.isFinite(v) ? Math.max(min, Math.floor(v)) : fallback;
      const idList = (v: unknown): ID[] =>
        Array.isArray(v) ? v.filter((x): x is ID => typeof x === 'string' && x !== '') : [];
      const ts = (v: unknown): number | undefined =>
        typeof v === 'number' && Number.isFinite(v) && v > 0 ? v : undefined;

      const stations: Partial<Record<StationId, CraftStationState>> = { workbench: { upgrades: [] } };
      if (parsed.stations && typeof parsed.stations === 'object') {
        for (const id of deps.stationIds) {
          const raw = (parsed.stations as Record<string, unknown>)[id];
          if (raw && typeof raw === 'object') {
            stations[id] = { upgrades: idList((raw as { upgrades?: unknown }).upgrades) };
          }
        }
      }

      const queues: Partial<Record<StationId, CraftBatch[]>> = {};
      if (parsed.queues && typeof parsed.queues === 'object') {
        for (const id of deps.stationIds) {
          const raw = (parsed.queues as Record<string, unknown>)[id];
          if (!Array.isArray(raw)) continue;
          const list: CraftBatch[] = [];
          for (const b of raw) {
            if (!b || typeof b !== 'object') continue;
            const r = b as Record<string, unknown>;
            if (typeof r.recipeId !== 'string' || !r.recipeId) continue;
            const enqueuedAt = typeof r.enqueuedAt === 'number' ? r.enqueuedAt : 0;
            const inputTier = typeof r.inputTier === 'number' && Number.isFinite(r.inputTier) ? r.inputTier : 0;
            list.push({
              id: typeof r.id === 'string' && r.id ? r.id : `craft:${num(r.seq, 0, 0)}`,
              recipeId: r.recipeId,
              station: id,
              enqueuedAt,
              ...(ts(r.startedAt) !== undefined ? { startedAt: ts(r.startedAt) } : {}),
              ...(ts(r.endsAt) !== undefined ? { endsAt: ts(r.endsAt) } : {}),
              inputTier,
              ...(typeof r.minigameAdj === 'number' && Number.isFinite(r.minigameAdj) && r.minigameAdj !== 0
                ? { minigameAdj: r.minigameAdj }
                : {}),
            });
          }
          if (list.length > 0) queues[id] = list;
        }
      }

      const ready: CraftReadyBatch[] = [];
      if (Array.isArray(parsed.ready)) {
        for (const r of parsed.ready) {
          if (!r || typeof r !== 'object') continue;
          const e = r as unknown as Record<string, unknown>;
          if (typeof e.recipeId !== 'string' || !e.recipeId) continue;
          const q = e.quality as { tier?: unknown; value?: unknown } | undefined;
          const tier = q && typeof q === 'object' && typeof q.tier === 'string' ? q.tier : 'D';
          ready.push({
            id: typeof e.id === 'string' && e.id ? e.id : 'craft:?',
            recipeId: e.recipeId,
            station: (typeof e.station === 'string' ? e.station : 'workbench') as StationId,
            completedAt: typeof e.completedAt === 'number' ? e.completedAt : 0,
            quality: {
              tier: (['D', 'C', 'B', 'A', 'S', 'SS'].includes(tier) ? tier : 'D') as QualityTier,
              value: q && typeof q.value === 'number' && Number.isFinite(q.value) ? Math.min(100, Math.max(0, q.value)) : 0,
            },
          });
          if (ready.length >= deps.readyCap * 7) break; // санитарный предел
        }
      }

      const grantedEffects: CraftGrantedEffect[] = [];
      if (Array.isArray(parsed.grantedEffects)) {
        for (const g of parsed.grantedEffects) {
          if (!g || typeof g !== 'object') continue;
          const e = g as unknown as Record<string, unknown>;
          if (typeof e.stat !== 'string' || !e.stat) continue;
          if (typeof e.value !== 'number' || !Number.isFinite(e.value)) continue;
          const src = (e.source ?? {}) as Record<string, unknown>;
          grantedEffects.push({
            id: typeof e.id === 'string' && e.id ? e.id : `craft.effect:?`,
            source: {
              kind: typeof src.kind === 'string' ? src.kind : 'item',
              refId: typeof src.refId === 'string' ? src.refId : 'craft',
            },
            stat: e.stat,
            op: (['flat', 'inc', 'more', 'override', 'cap'].includes(String(e.op)) ? e.op : 'flat') as CraftGrantedEffect['op'],
            value: e.value,
            ...(typeof e.label === 'string' ? { label: e.label } : {}),
          });
        }
      }

      setState({
        v: 1,
        stations,
        queues,
        ready,
        grantedEffects,
        seq: num(parsed.seq, 0, 0),
      });
    },
  };
}
