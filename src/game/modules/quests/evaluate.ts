/**
 * Переоценка прогресса шага (карточка §2: событие → счётчик → условие).
 * ЧИСТАЯ функция от (QuestStepDef, ConditionCtx) → { progress, goal }:
 * числовые условия (counterAtLeast/playerLevel/skill/hasItem/statAtLeast)
 * дают честное N/K для quest.progress и витрин; логические — 0/1; all —
 * «сколько из». Оценка «выполнено» — общим оценщиком checkCondition
 * (03-DATA §2): N ≥ K и checkCondition — одно и то же для всех веток.
 */
import { checkCondition } from '@/shared/utils/condition-check';
import type { Condition, ConditionCtx } from '@/shared/types/requirement';
import type { QuestStepDef } from '@/content/quests/types';

export interface StepProgress {
  progress: number;
  goal: number;
}

/** прогресс условия: числовые — N/K, логические — 0/1, all — «сколько из» */
function progressOfCondition(cond: Condition, ctx: ConditionCtx): StepProgress {
  switch (cond.t) {
    case 'counterAtLeast':
      return { progress: ctx.counter?.(cond.counter) ?? 0, goal: cond.value };
    case 'playerLevel':
      return { progress: ctx.playerLevel, goal: cond.level };
    case 'skill':
      return { progress: ctx.skillLevel(cond.skill), goal: cond.level };
    case 'hasItem':
      return { progress: ctx.itemCount(cond.defId), goal: cond.qty ?? 1 };
    case 'statAtLeast':
      return { progress: ctx.stat(cond.stat), goal: cond.value };
    case 'all':
      return { progress: cond.cs.filter((c) => checkCondition(c, ctx)).length, goal: cond.cs.length };
    default:
      return { progress: checkCondition(cond, ctx) ? 1 : 0, goal: 1 };
  }
}

/** прогресс шага: floor(N) ≥ 0; завершён ⇔ N ≥ K ⇔ checkCondition(condition) */
export function stepProgressOf(step: QuestStepDef, ctx: ConditionCtx): StepProgress {
  const { progress, goal } = progressOfCondition(step.condition, ctx);
  return { progress: Math.max(0, Math.floor(progress)), goal };
}
