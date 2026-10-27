/**
 * Гейты загона (M06.1): общий ConditionCtx для животных + читаемый текст
 * замка (П6 «замки видны с условием»; прецедент farm/logic/gates — свой
 * экземпляр, импорт чужого модуля запрещён П4).
 *
 * [F3] флаг-заглушка Альпаки 'pen.reputationReady' — читается из данных
 * PEN_TABLE.reputation.ready (false до M16): гейт честно закрыт, витрина
 * показывает «репутация деревни (скоро)». Прочие флаги — из extras (M15).
 */
import type { StatBus } from '@/kernel/bus/stat-bus/stat-bus';
import type { TimeService } from '@/kernel/time/time-service';
import type { Condition, ConditionCtx } from '@/shared/types/requirement';
import type { PenTable } from '@/content/balance/pen';

export interface PenGatesDeps {
  statBus: StatBus;
  time: TimeService;
  gateExtras(): Record<string, unknown>;
  table: PenTable;
}

export const PEN_REPUTATION_FLAG = 'pen.reputationReady';

export function penGateCtx(deps: PenGatesDeps): ConditionCtx {
  const extra = deps.gateExtras();
  return {
    tags: [],
    stat: (stat) => deps.statBus.resolve({ stat, ctx: { ...deps.time.ctx('player'), extra } }),
    hasFlag: (flag) =>
      flag === PEN_REPUTATION_FLAG
        ? deps.table.reputation.ready // данные pen (заглушка до M16)
        : Boolean(extra[`flag:${flag}`]),
    skillLevel: (skill) => Number(extra[`skill:${skill}`] ?? 0),
    playerLevel: Number(extra['player:level'] ?? 0),
    itemCount: () => 0,
    hasAchievement: (id) => Boolean(extra[`achievement:${id}`]),
  };
}

/** читаемый текст замка (П6): «уровень 20 + репутация деревни (скоро)» */
export function gateTextOf(
  cond: { t: string; level?: number; id?: string; flag?: string; skill?: string; cs?: unknown[] },
): string {
  switch (cond.t) {
    case 'playerLevel':
      return `уровень ${cond.level}`;
    case 'achievement':
      return `ачивка ${cond.id}`;
    case 'flag':
      // единственный флаг загона — заглушка репутации (данные, не M15)
      return cond.flag === PEN_REPUTATION_FLAG ? 'репутация деревни (скоро)' : `флаг ${cond.flag}`;
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
