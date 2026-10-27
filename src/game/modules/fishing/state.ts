/**
 * Состояние рыбалки (M07.1, бриф §3.2): локация, альбом пойманных видов,
 * статы забросов. Формат v1 — чистые данные (02 §11). ТАЙМЕРОВ НЕТ (F2:
 * клёв — рил-тайм окно активной сессии; альбом/статы — счётчики) —
 * оффлайн-досчёт модулю не нужен, sweep не требуется.
 *
 * F8: альбом album: Record<fishId, count> тикает с fish.caught с первого
 * заброса; статы { casts, caught } — витрина fish.state. Витрина альбома
 * («гейты показываем») и гейт-рыбы — M07.2; локация «река» — M07.2
 * ('pond' — единственная живая локация M07.1).
 *
 * Канонический порядок полей — ОДИН для записи/загрузки/санации: raw-сейв
 * после load+re-save сериализуется байт-в-байт (инвариант roundtrip F5/MEL-B;
 * прецедент canonicalPenState). Ленивые дефолты при чтении (F1: album ?? {},
 * статы нули; прецедент pen).
 */
import type { SaveSlice } from '@/kernel/save/save-director';
import type { ID } from '@/shared/types/ids';

/** локации ловли: пруд (старт) / река — [M07.2 · F12] навык Рыболовство 10
 *  (канон M01 §5); 'river' валиден в zod-схемах модуля (НЕ kernel) */
export type FishingLocation = 'pond' | 'river';

export interface FishingStats {
  casts: number;
  caught: number;
}

export interface FishState {
  v: 1;
  /** локация ловли ('river' — M07.2: навык рыболовства 10) */
  location: FishingLocation;
  /** альбом: fishId → сколько поймано (тикает с fish.caught) */
  album: Record<string, number>;
  /** статы забросов (витрина) */
  stats: FishingStats;
}

export function defaultFishState(): FishState {
  return { v: 1, location: 'pond', album: {}, stats: { casts: 0, caught: 0 } };
}

/** канонический порядок полей среза — roundtrip байт-в-байт
 *  ([M07.2 · F12] локации 'pond' | 'river'; старые сейвы 'pond' валидны —
 *  sanitize приводит неизвестные значения к 'pond') */
export function canonicalFishState(s: FishState): FishState {
  return {
    v: 1,
    location: s.location === 'river' ? 'river' : 'pond',
    album: s.album,
    stats: { casts: s.stats.casts, caught: s.stats.caught },
  };
}

/** лёгкая санация формы при загрузке (битая форма = дефолт; прецедент П5) */
function sanitize(raw: unknown): FishState {
  const s = raw as FishState | undefined;
  if (!s || typeof s !== 'object' || typeof s.location !== 'string') {
    return defaultFishState();
  }
  const album: Record<string, number> = {};
  if (s.album && typeof s.album === 'object') {
    for (const [k, v] of Object.entries(s.album as Record<string, unknown>)) {
      if (typeof v === 'number' && Number.isFinite(v) && v > 0) album[k] = Math.floor(v);
    }
  }
  const num = (v: unknown): number =>
    typeof v === 'number' && Number.isFinite(v) && v > 0 ? Math.floor(v) : 0;
  return canonicalFishState({
    v: 1,
    location: s.location === 'river' ? 'river' : 'pond',
    album,
    stats: {
      casts: num(s.stats?.casts),
      caught: num(s.stats?.caught),
    },
  });
}

/** Срез сейва: чистые данные; КАНОНИЧЕСКИЙ порядок полей при записи и
 *  загрузке — roundtrip байт-в-байт (инвариант F5/MEL-B) */
export function fishingSaveSlice(
  getState: () => FishState,
  setState: (s: FishState) => void,
): SaveSlice {
  return {
    save: () => canonicalFishState(getState()),
    load: (data: unknown) => setState(sanitize(data)),
  };
}

/** отметить улов в альбоме/статах (чистая функция; fish.caught — рыба) */
export function noteCast(state: FishState, fishId: ID | null): FishState {
  return canonicalFishState({
    ...state,
    album:
      fishId !== null
        ? { ...state.album, [fishId]: (state.album[fishId] ?? 0) + 1 }
        : state.album,
    stats: {
      casts: state.stats.casts + 1,
      caught: state.stats.caught + (fishId !== null ? 1 : 0),
    },
  });
}
