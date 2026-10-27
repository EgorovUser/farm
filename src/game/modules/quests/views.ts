/**
 * Витрины M15 (§4.6, П6 — числа на стол): ЧИСТЫЕ строитель строк списков
 * (движок подаёт состояние/пулы/контекст — файл без зависимостей от движка).
 * Гейты не прячутся: заблокированная цепочка видна с условием открытия.
 */
import { checkCondition } from '@/shared/utils/condition-check';
import type { Condition, ConditionCtx } from '@/shared/types/requirement';
import type { QuestDef, AchievementDef, Reward } from '@/content/quests/types';
import { stepProgressOf } from './evaluate';
import { stepKey, type QuestsState, type RollState } from './state';

export interface QuestRow {
  id: string;
  kind: 'daily' | 'weekly' | 'chain';
  name: string;
  description: string;
  step: number;
  stepsTotal: number;
  progress: number;
  goal: number;
  completed: boolean;
  claimed: boolean;
  claimable: boolean;
  rewards: Reward[];
  finished: boolean;
  /** цепочка под гейтом выдачи (П6: видна с условием открытия, не прогрессирует) */
  locked: boolean;
  /** текст условия открытия (для витрины заблокированного) */
  unlockText: string;
}

export interface AchievementRow {
  id: string;
  name: string;
  unlocked: boolean;
  claimed: boolean;
  hidden: boolean;
  rewards: Reward[];
}

/** человекочитаемое условие открытия (П6: гейты не прячутся; прецедент gateText M04) */
export function conditionText(cond: Condition | undefined): string {
  if (!cond) return '';
  switch (cond.t) {
    case 'counterAtLeast':
      return `откроется после: счётчик «${cond.counter}» ≥ ${cond.value}`;
    case 'playerLevel':
      return `откроется с уровнем игрока ${cond.level}`;
    case 'flag':
      return `откроется с флагом «${cond.flag}»`;
    case 'achievement':
      return `откроется с ачивкой «${cond.id}»`;
    case 'hasItem':
      return `откроется при наличии ${cond.defId} ×${cond.qty ?? 1}`;
    case 'skill':
      return `откроется с навыком «${cond.skill}» ${cond.level}`;
    case 'all':
      return cond.cs.map((c) => conditionText(c).replace('откроется ', '')).join(' + ');
    case 'any':
      return cond.cs.map((c) => conditionText(c).replace('откроется ', '')).join(' или ');
    case 'not':
      return `пока НЕ: ${conditionText(cond.c).replace('откроется ', '')}`;
    default:
      return `условие открытия: ${cond.t}`;
  }
}

/** строки daily/weekly: прогресс текущего шага N/K, claim-статусы */
export function buildRollRows(kind: 'daily' | 'weekly', roll: RollState, pool: readonly QuestDef[], ctx: ConditionCtx): QuestRow[] {
  const rows: QuestRow[] = [];
  for (const id of roll.ids) {
    const def: QuestDef | undefined = pool.find((q) => q.id === id);
    if (!def || def.kind !== kind) continue; // битый id — П5, невидим
    const stepNo = roll.steps[id] ?? 1;
    const finished = stepNo > def.steps.length;
    const cur = Math.min(stepNo, def.steps.length);
    const stepDef = def.steps[cur - 1];
    if (!stepDef) continue;
    const key = stepKey(id, stepDef.id);
    const p = stepProgressOf(stepDef, ctx);
    const claimed = roll.claimed.includes(key);
    rows.push({
      id,
      kind,
      name: def.name,
      description: stepDef.description,
      step: cur,
      stepsTotal: def.steps.length,
      progress: Math.min(p.progress, p.goal),
      goal: p.goal,
      completed: finished,
      claimed,
      claimable: roll.completed.includes(key) && !claimed,
      rewards: stepDef.rewards,
      finished,
      locked: false,
      unlockText: '',
    });
  }
  return rows;
}

/** строки цепочек: гейт выдачи виден (П6), завершённые — с церемонией */
export function buildChainRows(chainPool: readonly QuestDef[], ctx: ConditionCtx, chains: QuestsState['chains']): QuestRow[] {
  const rows: QuestRow[] = [];
  for (const def of chainPool) {
    const locked = def.unlock ? !checkCondition(def.unlock, ctx) : false;
    const stepNo = chains.step[def.id] ?? 1;
    const finished = !locked && stepNo > def.steps.length;
    const cur = Math.min(stepNo, def.steps.length);
    const stepDef = def.steps[cur - 1];
    const p = stepDef ? stepProgressOf(stepDef, ctx) : { progress: 1, goal: 1 };
    rows.push({
      id: def.id,
      kind: 'chain',
      name: def.name,
      description: locked ? conditionText(def.unlock) : (stepDef?.description ?? def.ceremony ?? ''),
      step: cur,
      stepsTotal: def.steps.length,
      progress: locked ? 0 : Math.min(p.progress, p.goal),
      goal: p.goal,
      completed: finished,
      claimed: finished,
      claimable: false,
      rewards: locked ? [] : (stepDef?.rewards ?? []),
      finished,
      locked,
      unlockText: locked ? conditionText(def.unlock) : '',
    });
  }
  return rows;
}

/** строки ачивок: hidden до unlock не видны (§5 карточки) */
export function buildAchRows(defs: readonly AchievementDef[], unlocked: readonly string[], claimed: readonly string[]): AchievementRow[] {
  return defs
    .filter((a) => unlocked.includes(a.id) || a.hidden !== true)
    .map((a) => ({
      id: a.id,
      name: a.name,
      unlocked: unlocked.includes(a.id),
      claimed: claimed.includes(a.id),
      hidden: a.hidden === true,
      rewards: a.rewards ?? [],
    }));
}
