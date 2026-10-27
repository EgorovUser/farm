/**
 * Dev-форсы M11 (F9, живые пробы; прецедент lake.force в dev-слоте):
 *  - mood set: workers dev mood <idx> <0..100> — прямая установка настроения
 *    (для серий увольнения по настроению);
 *  - payday force: workers dev payday — расчётный день НЕМЕДЛЕННО (минуя
 *    полночь; тот же проход dayPass — роллы настроения/болезней тоже идут).
 */
import type { TimeService } from '@/kernel/time/time-service';
import type { SaveDirector } from '@/kernel/save/save-director';
import type { Result } from '@/shared/types/result';
import { err, ok } from '@/shared/types/result';
import type { WorkersTable } from '@/content/workers/table';
import type { WorkersState } from './state';
import { moodCapOf } from './state';
import { withMood } from './logic/day';

export interface WorkersDevDeps {
  time: TimeService;
  save: SaveDirector;
  table: WorkersTable;
  getState(): WorkersState;
  setState(s: WorkersState): void;
  /** прогнать расчётный день немедленно (тот же dayPass модуля) */
  forcePayday(): Result<{ fired: number }>;
}

export class WorkersDev {
  private readonly d: WorkersDevDeps;

  constructor(deps: WorkersDevDeps) {
    this.d = deps;
  }

  /** dev: установка настроения (кулдауны/болезни не трогаются).
   *  [FIX-M11 · FX2] валидация ≤ капу из ДАННЫХ (единая точка moodCapOf):
   *  при живом Домике 101–105 легальны (кап 105); 106 — отказ; без
   *  Домика кап 100 → 101 — отказ; withMood — с тем же капом (иначе
   *  принятые 103 срезались бы при записи) */
  moodSet(idx: number, value: number): Result<{ idx: number; mood: number }> {
    const state = this.d.getState();
    const w = state.hired[idx];
    if (!w) return err(`работник №${idx} не найден (workers list — витрина)`);
    const moodCap = moodCapOf(state, this.d.table);
    if (!Number.isFinite(value) || value < this.d.table.mood.min || value > moodCap) {
      return err(`настроение: целое ${this.d.table.mood.min}..${moodCap}`);
    }
    const next = withMood(w, Math.round(value) - w.mood, this.d.table, moodCap);
    this.d.setState({ ...state, v: 1, hired: state.hired.map((x, i) => (i === idx ? next : x)) });
    this.d.save.markDirty();
    return ok({ idx, mood: next.mood });
  }

  /** dev: расчётный день немедленно */
  paydayForce(): Result<{ fired: number }> {
    return this.d.forcePayday();
  }
}
