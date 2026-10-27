/**
 * Дневной decay загона (M06.1 бриф F6 + M06.2 F1/F3) — чистая функция.
 *
 * Один dayTick-проход (живой полдень... полночь и catchUp-проходы — один и
 * тот же обработчик; ядро капит дневные границы 14, канон 02 §8):
 *   - satiety −satietyPerDay × appetiteFactor (пол 0) — «Тёплый загон»
 *     appetiteFactor 0.9 (−22.5/день; [DECISION-расшифровка «+10% аппетит»],
 *     фактор из данных улучшения — модуль получает его параметром);
 *   - cleanliness −cleanlinessPerDay (пол 0);
 *   - satiety = 0 ПОСЛЕ decay → «голодная»: счастье −hungryHappinessPerDay,
 *     счётчик hungryDays +1 (offlineReport «голодные дни»);
 *   - cleanliness = 0 ПОСЛЕ decay → счастье −dirtyHappinessPerDay,
 *     счётчик dirtyDays +1 (offlineReport «грязные дни»);
 *   - больная (sickAt выставлен): health −healthDecayPerDay (пол 0;
 *     смерти нет — выздоровление временем/лекарством, recoverPass/pen.heal);
 *   - счастье пол 0 (может упасть обоими штрафами за один день).
 *
 * [DECISION-порядок] «голодная/грязная» оценивается ПОСЛЕ списания decay
 * этого дня: день без корма заканчивается нулём → штраф этого же дня
 * (начисление честно один раз за день — якорь = сама dayTick-граница).
 * Проход покрывает ОБА загона (animals + animals2; M06.2 F3).
 */
import type { PenTable } from '@/content/balance/pen';
import type { AnimalInstance, PenState } from '../state';
import { canonicalAnimal } from '../state';

export interface DecayPassResult {
  state: PenState;
  changed: boolean;
}

const clamp0 = (v: number): number => Math.max(0, v);

export function decayPass(
  state: PenState,
  table: PenTable,
  appetiteFactor = 1,
): DecayPassResult {
  const d = table.decay;
  const sk = table.sickness;
  const satietyPerDay = d.satietyPerDay * appetiteFactor;
  const pass = (animals: AnimalInstance[]): { list: AnimalInstance[]; changed: boolean } => {
    let changed = false;
    const list = animals.map((a): AnimalInstance => {
      const satiety = clamp0(a.satiety - satietyPerDay);
      const cleanliness = clamp0((a.cleanliness ?? 100) - d.cleanlinessPerDay);
      let happiness = a.happiness;
      let health = a.health;
      let hungryDays = a.hungryDays ?? 0;
      let dirtyDays = a.dirtyDays ?? 0;
      if (satiety === 0) {
        happiness -= d.hungryHappinessPerDay;
        hungryDays += 1;
      }
      if (cleanliness === 0) {
        happiness -= d.dirtyHappinessPerDay;
        dirtyDays += 1;
      }
      happiness = clamp0(happiness);
      if (a.sickAt !== undefined) health = clamp0(health - sk.healthDecayPerDay);
      // канонический порядок полей (state.canonicalAnimal — roundtrip байт-в-байт)
      const next: AnimalInstance = canonicalAnimal({ ...a, satiety, cleanliness, happiness, health, hungryDays, dirtyDays });
      if (
        next.satiety !== a.satiety ||
        next.cleanliness !== (a.cleanliness ?? 100) ||
        next.happiness !== a.happiness ||
        next.health !== a.health ||
        next.hungryDays !== (a.hungryDays ?? 0) ||
        next.dirtyDays !== (a.dirtyDays ?? 0)
      ) {
        changed = true;
      }
      return next;
    });
    return { list, changed };
  };
  const one = pass(state.animals);
  const two = state.animals2 !== undefined ? pass(state.animals2) : { list: [], changed: false };
  if (!one.changed && !two.changed) return { state, changed: false };
  return {
    state: {
      ...state,
      animals: one.list,
      ...(state.animals2 !== undefined ? { animals2: two.list } : {}),
    },
    changed: true,
  };
}
