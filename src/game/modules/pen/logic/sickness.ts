/**
 * Болезни загона (M06.2, бриф F1; карточка §3) — чистые функции.
 *
 * Шанс заболевания за день на животное:
 *   chance = (base + hungryDays×perHungryDay + dirtyDays×perDirtyDay) × sickFactor
 * («Тёплый загон»: sickFactor 0.5 к ИТОГОВОМУ шансу — [DECISION] мод-фактор
 * данных улучшения применяется к базе И уход-штрафам). Ролл — именованный
 * стрим `pen:sick:<species>` (roll01-контракт П6 — логируется; один стрим
 * на вид: два животного одного вида = два продвижения стрима, детерминизм
 * по saveId). Заболевшее: health → sickHealth (40 — сразу ниже needs-гейта
 * 50, больная НЕ производит — механизм M06.1 жив, таймер стоит).
 *
 * Выздоровление (ленивая переоценка + часовой/дневной проходы — канон 02 §8
 * абсолютных дат): sickAt + healHours ≤ now → health 100, окно иммунитета
 * immuneUntil = now + immunityHours (от ФАКТИЧЕСКОГО момента выздоровления —
 * [DECISION]; лечение лекарством pen.heal — тот же исход, F2). Смерти НЕТ.
 */
import type { PenTable } from '@/content/balance/pen';
import type { AnimalInstance, PenState } from '../state';
import { canonicalAnimal, localDayIndex } from '../state';

export interface SickCase {
  animalIdx: number;
  speciesId: string;
  dayIndex: number;
}

export interface SickPassResult {
  state: PenState;
  /** заболевшие в этом проходе (порядок: загон 1, затем загон 2) */
  sickened: SickCase[];
}

/** итоговый шанс заболевания (доля 0..1) для животного */
export function sickChanceOf(
  animal: AnimalInstance,
  table: PenTable,
  sickFactor: number,
): number {
  const s = table.sickness;
  const care =
    (animal.hungryDays ?? 0) * s.perHungryDay + (animal.dirtyDays ?? 0) * s.perDirtyDay;
  return Math.min(1, Math.max(0, (s.base + care) * sickFactor));
}

/** больна ли сейчас (sickAt выставлен и ещё не выздоровела к now) */
export function isSick(animal: AnimalInstance, now: number, table: PenTable): boolean {
  return animal.sickAt !== undefined && now < animal.sickAt + table.sickness.healHours * 3_600_000;
}

/** один sick-проход по обоим загонам: ролл за каждое здоровое животное без
 *  иммунитета; now — точка прохода (dayTick) */
export function sickPass(
  state: PenState,
  now: number,
  table: PenTable,
  sickFactor: number,
  roll01: (streamId: string) => number,
): SickPassResult {
  const sickened: SickCase[] = [];
  const dayIndex = localDayIndex(now);
  const pass = (animals: AnimalInstance[]): AnimalInstance[] =>
    animals.map((animal, idx) => {
      if (animal.sickAt !== undefined) return animal; // уже больна
      if (animal.immuneUntil !== undefined && now < animal.immuneUntil) return animal;
      const chance = sickChanceOf(animal, table, sickFactor);
      const roll = roll01(`pen:sick:${animal.speciesId}`);
      if (roll >= chance) return animal;
      sickened.push({ animalIdx: idx, speciesId: animal.speciesId, dayIndex });
      return canonicalAnimal({ ...animal, health: table.sickness.sickHealth, sickAt: now });
    });
  const animals = pass(state.animals);
  const animals2 = state.animals2 !== undefined ? pass(state.animals2) : undefined;
  if (sickened.length === 0) return { state, sickened };
  return {
    state: { ...state, animals, ...(animals2 !== undefined ? { animals2 } : {}) },
    sickened,
  };
}

export interface RecoverResult {
  state: PenState;
  /** выздоровевшие (pen-локальный индекс; порядок: загон 1, затем 2) */
  recovered: Array<{ pen: 1 | 2; idx: number }>;
}

/** ленивое выздоровление временем (sickAt + healHours ≤ now → health 100,
 *  иммунитет immunityHours от now; идемпотентно — чистая функция состояния) */
export function recoverPass(state: PenState, now: number, table: PenTable): RecoverResult {
  const recovered: Array<{ pen: 1 | 2; idx: number }> = [];
  const healMs = table.sickness.healHours * 3_600_000;
  const immunityMs = table.sickness.immunityHours * 3_600_000;
  const pass = (pen: 1 | 2, animals: AnimalInstance[]): { list: AnimalInstance[]; changed: boolean } => {
    let changed = false;
    const list = animals.map((animal, idx) => {
      if (animal.sickAt === undefined || now < animal.sickAt + healMs) return animal;
      changed = true;
      recovered.push({ pen, idx });
      const next: AnimalInstance = { ...animal, health: 100 };
      delete next.sickAt;
      next.immuneUntil = now + immunityMs;
      return canonicalAnimal(next);
    });
    return { list, changed };
  };
  const one = pass(1, state.animals);
  const two = state.animals2 !== undefined ? pass(2, state.animals2) : { list: [], changed: false };
  if (!one.changed && !two.changed) return { state, recovered };
  return {
    state: {
      ...state,
      animals: one.list,
      ...(state.animals2 !== undefined ? { animals2: two.list } : {}),
    },
    recovered,
  };
}
