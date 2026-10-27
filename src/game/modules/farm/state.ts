/**
 * Состояние фермы (M05.1): вкладки и тайлы (канон 03-DATA §6).
 * Формат v1 — чистые данные (02-BUSES §11). ВСЕ таймеры — АБСОЛОТНЫЕ даты
 * (plantedAt/grownAt/wateredUntil, инвариант 02-BUSES §8): оффлайн-досчёт =
 * ленивая переоценка по текущему now, отдельного catchUp-кода нет.
 *
 * weeds 0..3 — поле схемы (03-DATA §6), в M05.1 всегда 0: часовые правила
 * зарастания — M05.2 (данные уже в balance/farm.ts). Прочие вкладки
 * («Грибница»/«Виноградник»/«Теплица») открываются улучшениями M05.3 —
 * их kind-типы в схеме с первого дня (П5: неизвестность — рядовой случай).
 *
 * [M05.3 · G1/G7] upgrades — купленные улучшения (id дефов content/farm/
 * upgrades.ts): АДДИТИВНО-ОПЦИОНАЛЬНОЕ поле + ленивый дефолт [] при
 * чтении (прецедент weeds — M05.2), БЕЗ bump версии и миграций (v10).
 *
 * [M05.3 · G2/G7] sprinklerAt — якорь каденса спринклеров (дата последнего
 * автополива; undefined = «давно/никогда» — следующий часовой проход
 * сработает): опциональное поле без bump, той же природой.
 */
import type { SaveSlice } from '@/kernel/save/save-director';
import type { ID } from '@/shared/types/ids';

export type FarmTileState = 'empty' | 'plowed' | 'growing' | 'ready';
export type FarmTabKind = 'field' | 'mushroom' | 'vineyard' | 'greenhouse';

export interface FarmTile {
  index: number;
  state: FarmTileState;
  cropId?: ID;
  plantedAt?: number;
  /** абсолютная дата готовности (посадка + growMs / скорость) */
  grownAt?: number;
  /** абсолютная дата высыхания (полив; пауза сухости — M05.2) */
  wateredUntil?: number;
  /** стадии сорняков 0..3 (движок — M05.2) */
  weeds: number;
  fertilized?: boolean;
  /** [M05.3 · G5] осталось сборов (клубника: 3 с посадки; тайл снова READY);
   *  аддитивно-опционально + ленивый дефолт при чтении (прецедент weeds) */
  harvestsLeft?: number;
  /** [M05.3 · G5] окно плодоношения винограда (абсолютная дата; ставится
   *  первым сбором); аддитивно-опционально, без bump (v10) */
  fruitingUntil?: number;
}

export interface FarmTab {
  id: ID;
  kind: FarmTabKind;
  tiles: FarmTile[];
}

export interface FarmState {
  v: 1;
  tabs: FarmTab[];
  /** [M05.3] купленные улучшения (id из content/farm/upgrades.ts) */
  upgrades: string[];
  /** [M05.3] дата последнего автополива спринклерами (якорь каденса 8ч) */
  sprinklerAt?: number;
}

/** «Поле» — стартовая вкладка карточки §2: 16 тайлов (4×4) */
export const FIELD_TILE_COUNT = 16;

export function makeTile(index: number): FarmTile {
  return { index, state: 'empty', weeds: 0 };
}

/** вкладка улучшения (G1): свои тайлы, kind — из данных улучшения */
export function makeTab(id: ID, kind: FarmTabKind, tiles: number): FarmTab {
  return { id, kind, tiles: Array.from({ length: tiles }, (_, i) => makeTile(i)) };
}

export function defaultFarmState(): FarmState {
  return {
    v: 1,
    tabs: [makeTab('field', 'field', FIELD_TILE_COUNT)],
    upgrades: [],
  };
}

/** лёгкая санация формы при загрузке (битая форма = дефолт; прецедент П5).
 *  [M05.2 · F6] weeds нормализуется к 0 при отсутствии — поле писалось с
 *  v10 (makeTile/миграция), но ручные v10-доноры без него — рядовой случай
 *  П5: ленивый дефолт БЕЗ bump версии и миграции (аддитивно-опционально).
 *  [M05.3 · G7] upgrades — тот же прецедент: ленивый дефолт [] без bump. */
function sanitize(raw: unknown): FarmState {
  const s = raw as FarmState | undefined;
  if (!s || typeof s !== 'object' || !Array.isArray(s.tabs) || s.tabs.length === 0) {
    return defaultFarmState();
  }
  return {
    ...s,
    tabs: s.tabs.map((tab) => ({ ...tab, tiles: tab.tiles.map((t) => ({ ...t, weeds: t.weeds ?? 0 })) })),
    upgrades: Array.isArray(s.upgrades) ? s.upgrades.filter((u) => typeof u === 'string') : [],
  };
}

/** Срез сейва: чистые данные, состояние модуля сериализуется как есть */
export function farmSaveSlice(
  getState: () => FarmState,
  setState: (s: FarmState) => void,
): SaveSlice {
  return {
    save: () => getState(),
    load: (data: unknown) => setState(sanitize(data)),
  };
}
