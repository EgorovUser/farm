/**
 * Продукция загона (M06.1, бриф F7 + канон 02 §8) — чистая функция.
 *
 * Проход (hourTick И ленивая переоценка при обращении — один и тот же код):
 * для каждого животного с выполненными produceNeeds (satiety > порог и
 * health > порог) каскад `now ≥ nextProduceAt`:
 *   - продукт на склад, nextProduceAt += periodHours;
 *   - каскад идёт ДО now: циклы сверх склад-cap НЕ копятся — единицы
 *     теряются, попадая в overflow-отчёт ([DECISION-детализация]: таймер
 *     догоняет now сквозь cap, доставки останавливаются на cap — буква
 *     «каскад до now, но не дальше склада — переполнение НЕ копится,
 *     уходит в offlineReport»);
 *   - produceNeeds не выполнены → животное пропущено целиком (таймер стоит:
 *     «голодная/больная не производит», ленивая переоценка навёрстает
 *     после кормления/лечения).
 *
 * Абсолютные даты делают оффлайн-досчёт тривиальным: канон 02 §8 (1) —
 * таймеры пересчитываются лениво к текущему now (склад-cap ограничивает
 * накопление), (2) часовые ПРАВИЛА с ролями — кап 72 (у продукции роллов
 * нет — она детерминирована датами).
 */
import type { ID } from '@/shared/types/ids';
import type { AnimalDef } from '@/content/pen/animals';
import type { PenTable } from '@/content/balance/pen';
import type { AnimalInstance, PenState } from '../state';

export interface ProducePassResult {
  state: PenState;
  /** доставлено на склад в этом проходе (defId → единиц) */
  delivered: Record<string, number>;
  /** потеряно сверх склад-cap в этом проходе (defId → единиц) */
  lost: Record<string, number>;
  changed: boolean;
}

/** cap склада для продукта: N сборов × максимальный qty коллекции среди
 *  производителей вида («3 сбора per вид»; молоко: коза 1/корова 2 → cap 6) */
export function stockCapOf(table: PenTable, defId: string, animals: readonly AnimalDef[]): number {
  let maxQty = 0;
  for (const def of animals) {
    if (def.produce.defId === defId) maxQty = Math.max(maxQty, def.produce.qty);
  }
  return maxQty * table.produce.stockCapCollections;
}

/** produceNeeds выполнены (канон 03-DATA §6; пороги из данных, дефолт 50/50) */
export function needsMet(animal: AnimalInstance, def: AnimalDef): boolean {
  const needs = def.produceNeeds ?? { satiety: 50, health: 50 };
  return animal.satiety > needs.satiety && animal.health > needs.health;
}

/** один проход продукции по всем животным (чистый; now — точка прохода);
 *  [M06.2 F3] покрывает ОБА загона — КАЖДЫЙ в СВОЙ склад (stock/stock2;
 *  кап один и тот же на продукт) */
export function producePass(
  state: PenState,
  now: number,
  table: PenTable,
  animalDefs: readonly AnimalDef[],
): ProducePassResult {
  const bySpecies = new Map(animalDefs.map((d) => [d.id, d] as const));
  const caps = new Map<string, number>();
  const capOf = (defId: string): number => {
    let cap = caps.get(defId);
    if (cap === undefined) {
      cap = stockCapOf(table, defId, animalDefs);
      caps.set(defId, cap);
    }
    return cap;
  };
  // [M06.2] проход одного загона в ЕГО склад (running stock: до-проходный
  // остаток + уже доставленное этим проходом — общий продукт одного загона
  // не переполняет cap совместным каскадом; delivered/lost — per-загон)
  const pass = (
    animals: AnimalInstance[],
    stockRec: Record<string, number>,
    delivered: Record<string, number>,
    lost: Record<string, number>,
  ): AnimalInstance[] =>
    animals.map((animal): AnimalInstance => {
      const def = bySpecies.get(animal.speciesId);
      if (!def || animal.nextProduceAt === undefined || !needsMet(animal, def)) return animal;
      const { defId, qty, periodHours } = def.produce;
      const periodMs = periodHours * 3_600_000;
      let next = animal.nextProduceAt;
      if (now < next) return animal;
      let out = animal;
      let stock = (stockRec[defId] ?? 0) + (delivered[defId] ?? 0);
      while (next <= now) {
        const cap = capOf(defId);
        if (stock + qty <= cap) {
          stock += qty;
          delivered[defId] = (delivered[defId] ?? 0) + qty;
        } else {
          lost[defId] = (lost[defId] ?? 0) + qty;
        }
        next += periodMs;
        changed = true;
      }
      out = { ...animal, nextProduceAt: next };
      return out;
    });
  const d1: Record<string, number> = {};
  const l1: Record<string, number> = {};
  const d2: Record<string, number> = {};
  const l2: Record<string, number> = {};
  let changed = false;
  const animals = pass(state.animals, state.stock, d1, l1);
  const animals2 =
    state.animals2 !== undefined ? pass(state.animals2, state.stock2 ?? {}, d2, l2) : undefined;
  if (!changed) {
    return { state, delivered: d1, lost: l1, changed };
  }
  const merge = (base: Record<string, number>, extra: Record<string, number>): Record<string, number> => {
    const out: Record<string, number> = { ...base };
    for (const [defId, qty] of Object.entries(extra)) out[defId] = (out[defId] ?? 0) + qty;
    return out;
  };
  const clean = (rec: Record<string, number>): Record<string, number> => {
    const out: Record<string, number> = {};
    for (const [k, v] of Object.entries(rec)) if (v > 0) out[k] = v;
    return out;
  };
  return {
    state: {
      ...state,
      animals,
      ...(animals2 !== undefined ? { animals2 } : {}),
      stock: clean(merge(state.stock, d1)),
      overflow: clean(merge(state.overflow, l1)),
      ...(state.animals2 !== undefined
        ? {
            stock2: clean(merge(state.stock2 ?? {}, d2)),
            overflow2: clean(merge(state.overflow2 ?? {}, l2)),
          }
        : {}),
    },
    delivered: d1,
    lost: l1,
    changed,
  };
}

/** [DECISION-имя брифа §3.8] dev-форс продукции: nextProduceAt = now для всех
 *  животных вида (продукция придёт ближайшим проходом/ленивой переоценкой;
 *  прецедент farm.grow — форсается только время, produceNeeds честен) */
export function forceProduce(state: PenState, now: number, species: ID | 'all'): PenState {
  const mark = (a: AnimalInstance): AnimalInstance =>
    species === 'all' || a.speciesId === species ? { ...a, nextProduceAt: now } : a;
  return {
    ...state,
    animals: state.animals.map(mark),
    ...(state.animals2 !== undefined ? { animals2: state.animals2.map(mark) } : {}),
  };
}
