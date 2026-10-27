/**
 * Гейты фермы (M05.3): общий ConditionCtx для культур и улучшений + читаемый
 * текст замка (П6 «замки видны с условием»; прецедент shop gateText — свой
 * экземпляр, импорт чужого модуля запрещён П4).
 *
 * gateTextOf сохраняет исторический формат простых условий («Откроется:
 * уровень 25» — оракул selftest M05.1/M05.2) и раскладывает {t:'all'}
 * в сумму частей — составной гейт солнечника (уровень + ачивка «Агроном»,
 * G6) читаем в отказе посадки.
 */
import type { StatBus } from '@/kernel/bus/stat-bus/stat-bus';
import type { TimeService } from '@/kernel/time/time-service';
import type { Condition, ConditionCtx } from '@/shared/types/requirement';

export interface FarmGatesDeps {
  statBus: StatBus;
  time: TimeService;
  gateExtras(): Record<string, unknown>;
}

export function farmGateCtx(deps: FarmGatesDeps): ConditionCtx {
  const extra = deps.gateExtras();
  return {
    tags: [],
    stat: (stat) => deps.statBus.resolve({ stat, ctx: { ...deps.time.ctx('player'), extra } }),
    hasFlag: (flag) => Boolean(extra[`flag:${flag}`]),
    skillLevel: (skill) => Number(extra[`skill:${skill}`] ?? 0),
    playerLevel: Number(extra['player:level'] ?? 0),
    itemCount: () => 0,
    hasAchievement: (id) => Boolean(extra[`achievement:${id}`]),
  };
}

/** читаемый текст замка (П6): «уровень 25 + ачивка ach_agronomist» */
export function gateTextOf(cond: { t: string; level?: number; id?: string; skill?: string; cs?: unknown[] }): string {
  switch (cond.t) {
    case 'playerLevel':
      return `уровень ${cond.level}`;
    case 'achievement':
      return `ачивка ${cond.id}`;
    case 'skill':
      return `навык ${cond.skill ?? ''} ${cond.level ?? ''}`.trim();
    case 'all':
      return (cond.cs ?? []).map((c) => gateTextOf(c as { t: string })).join(' + ');
    case 'any':
      return (cond.cs ?? []).map((c) => gateTextOf(c as { t: string })).join(' или ');
    default:
      return cond.t;
  }
}
