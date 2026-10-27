/**
 * Единый оценщик условий (03-DATA §2): data-only, без знания о конкретных системах.
 * Все системы (гейты магазина, блокировки рыб, требования работников, страхи)
 * вызывают только его — «неизвестность» в действии.
 */
import type { Condition, ConditionCtx } from '@/shared/types/requirement';

export function checkCondition(cond: Condition | undefined, ctx: ConditionCtx): boolean {
  if (cond === undefined) return true;
  switch (cond.t) {
    case 'ctxTag':
      return ctx.tags.includes(cond.tag);
    case 'statAtLeast':
      return ctx.stat(cond.stat) >= cond.value;
    case 'statAtMost':
      return ctx.stat(cond.stat) <= cond.value;
    case 'flag':
      return ctx.hasFlag(cond.flag);
    case 'skill':
      return ctx.skillLevel(cond.skill) >= cond.level;
    case 'playerLevel':
      return ctx.playerLevel >= cond.level;
    case 'achievement':
      return ctx.hasAchievement(cond.id);
    case 'hasItem':
      return ctx.itemCount(cond.defId) >= (cond.qty ?? 1);
    // [M15] счётчик ядра: ctx.counter опционален (чужие контексты без него
    // получают false — П5: неизвестное/непоставленное — не ошибка)
    case 'counterAtLeast':
      return (ctx.counter?.(cond.counter) ?? 0) >= cond.value;
    case 'not':
      return !checkCondition(cond.c, ctx);
    case 'all':
      return cond.cs.every((c) => checkCondition(c, ctx));
    case 'any':
      return cond.cs.some((c) => checkCondition(c, ctx));
    default: {
      // П5 «максимум неизвестности»: неизвестный тип условия — не крэш, а false
      const unknown = cond as { t?: string };
      if (unknown && typeof unknown.t === 'string') return false;
      return false;
    }
  }
}

export function checkAll(conds: readonly Condition[] | undefined, ctx: ConditionCtx): boolean {
  if (!conds || conds.length === 0) return true;
  return conds.every((c) => checkCondition(c, ctx));
}
