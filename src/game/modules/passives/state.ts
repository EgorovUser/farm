/**
 * Состояние M14 «Дерево пассивик» — срез `passives` [DECISION бриф §0]:
 * { points, spent, allocated, respecTotal } — лениво-дефолтный БЕЗ bump
 * (ДВЕНАДЦАТАЯ заморозка ядра; прецеденты M13.x run?/upgrades?/helpers?).
 *
 * Инварианты (бриф §0/F1): points − spent = свободные ≥ 0;
 * spent = Σ стоимостей allocated; respecTotal — накопленное число сброшенных
 * узлов (вход кривой респека). allocated — массив id (Set — рантайм-форма,
 * НЕ срезовая). Канонический порядок полей — roundtrip байт-в-байт.
 *
 * [DECISION · пост-wipe тишина] save() возвращает undefined, пока срез
 * «чист» (points/spent/respecTotal = 0, allocated пуст): JSON.stringify
 * опускает ключ — сейв-файл НЕ получает пустого поля (бриф: «поле НЕ
 * дописывается пустым»). Очки, заработанные честно (ретро/события), делают
 * срез нечистым — ключ появляется со значением. Витрина save info честно
 * показывает ЗАРЕГИСТРИРОВАННЫЙ срез (реестр модуля), файл — только факты.
 *
 * Санитизация load: allocated фильтруется по дереву (неизвестные id —
 * контент ушёл), spent ПЕРЕСЧИТЫВАЕТСЯ инвариантом (Σ стоимостей), points
 * чинится вверх при нарушении (free ≥ 0). Инициализация среза ленивая:
 * ретро-подсчёт — при первом касании (module.ts ensureInit), НЕ при load.
 */
import type { SaveSlice } from '@/kernel/save/save-director';
import type { PassiveNodeDef } from '@/content/passives/types';

export interface PassivesState {
  v: 1;
  /** всего заработано очков (ретро + события; не убывает от аллокаций) */
  points: number;
  /** Σ стоимостей выделенных узлов */
  spent: number;
  /** выделенные узлы в порядке выделения */
  allocated: string[];
  /** накопленное число сброшенных респеком узлов (вход кривой) */
  respecTotal: number;
}

export function defaultPassivesState(): PassivesState {
  return { v: 1, points: 0, spent: 0, allocated: [], respecTotal: 0 };
}

/** «чист» ли срез: ничего честно не заработано и не сделано */
export function isPristinePassives(s: PassivesState): boolean {
  return s.points === 0 && s.spent === 0 && s.allocated.length === 0 && s.respecTotal === 0;
}

const num = (v: unknown, def: number): number =>
  typeof v === 'number' && Number.isFinite(v) ? v : def;

const int = (v: unknown, def: number): number => Math.max(0, Math.floor(num(v, def)));

/** канонический порядок полей — roundtrip байт-в-байт */
export function canonicalPassivesState(
  s: PassivesState,
  nodesById: ReadonlyMap<string, PassiveNodeDef>,
  startNodes: ReadonlySet<string>,
): PassivesState {
  // allocated: только известные не-старт узлы, без дублей, порядок сохранён
  const seen = new Set<string>();
  const allocated: string[] = [];
  for (const id of Array.isArray(s.allocated) ? s.allocated : []) {
    if (typeof id !== 'string') continue;
    const node = nodesById.get(id);
    if (node === undefined || startNodes.has(id) || seen.has(id)) continue;
    seen.add(id);
    allocated.push(id);
  }
  // инвариант: spent = Σ стоимостей (контент мог уйти — пересчёт, не доверие)
  const spent = allocated.reduce((sum, id) => sum + (nodesById.get(id)?.cost ?? 0), 0);
  // инвариант: free = points − spent ≥ 0 — чиним вверх
  const points = Math.max(int(s.points, 0), spent);
  return {
    v: 1,
    points,
    spent,
    allocated,
    respecTotal: int(s.respecTotal, 0),
  };
}

/**
 * Срез сейва: чистые данные; save() → undefined для чистого среза (тишина
 * файла — пост-wipe ничего пустого не дописывается).
 */
export function passivesSaveSlice(
  getState: () => PassivesState,
  setState: (s: PassivesState) => void,
  nodesById: ReadonlyMap<string, PassiveNodeDef>,
  startNodes: ReadonlySet<string>,
): SaveSlice {
  return {
    save: () => {
      const s = getState();
      return isPristinePassives(s) ? undefined : canonicalPassivesState(s, nodesById, startNodes);
    },
    load: (data: unknown) => {
      const s = data as PassivesState | undefined;
      if (!s || typeof s !== 'object') {
        setState(defaultPassivesState());
        return;
      }
      setState(canonicalPassivesState(s, nodesById, startNodes));
    },
  };
}
