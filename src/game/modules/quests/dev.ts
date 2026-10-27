/**
 * Dev-методы M15 (бриф §4.6: консоль — интерфейс фаз 0–5): quests roll /
 * quests complete / ach unlock. Отдельная ответственность от ядра движка;
 * функции получают фасад deps (модуль собирает его из engine).
 */
import { err, ok, type Result } from '@/shared/types/result';
import type { QuestDef, AchievementDef, QuestStepDef, Reward } from '@/content/quests/types';
import { grantMaterialRewards, materialRewardsOf, xpSumOf, type GrantReceipt, type RewardDeps } from './rewards';
import { stepKey, type QuestsState } from './state';

export interface QuestsDevDeps {
  pool(kind: 'daily' | 'weekly' | 'chain'): QuestDef[];
  achievements(): AchievementDef[];
  publishCompleted(def: QuestDef, kind: 'daily' | 'weekly' | 'chain', step: number, stepDef: QuestStepDef): void;
  rewardDeps(): RewardDeps;
  getState(): QuestsState;
  setState(s: QuestsState): void;
  markDirty(): void;
  /** переброс дня (freshRoll) + sync */
  rerollDay(): void;
  sync(): void;
}

/** dev: переброс дня — fresh-ролл по канону dailySeed (тот же день/пул — тот же
 *  набор; после смены контента — подхват нового пула), базовая линия = сейчас */
export function devRoll(d: QuestsDevDeps): string {
  d.rerollDay();
  return `день переброшен: квесты: ${d.getState().daily.ids.join(', ')}`;
}

/** dev: завершить текущий шаг квеста/цепочки без проверки условия
 *  (события публикуются — XP-канал M01 честно срабатывает) */
export function devComplete(d: QuestsDevDeps, id: string): Result<string> {
  const s = d.getState();
  for (const kind of ['daily', 'weekly'] as const) {
    const roll = kind === 'daily' ? s.daily : s.weekly;
    if (!roll.ids.includes(id)) continue;
    const def = d.pool(kind).find((q) => q.id === id);
    if (!def) return err(`шаблон "${id}" исчез из контента (П5)`);
    const cur = roll.steps[id] ?? 1;
    const stepDef = def.steps[cur - 1];
    if (!stepDef) return err(`квест "${id}" уже завершён`);
    const next = { ...roll, completed: [...roll.completed, stepKey(id, stepDef.id)], steps: { ...roll.steps, [id]: cur + 1 } };
    const s2 = d.getState();
    d.setState(kind === 'daily' ? { ...s2, daily: next } : { ...s2, weekly: next });
    d.markDirty();
    d.publishCompleted(def, kind, cur, stepDef);
    return ok(`dev: шаг ${cur} квеста «${def.name}» завершён (события опубликованы)`);
  }
  const chain = d.pool('chain').find((q) => q.id === id);
  if (chain) {
    const s3 = d.getState();
    const cur = s3.chains.step[id] ?? 1;
    const stepDef = chain.steps[cur - 1];
    if (!stepDef) return err(`цепочка "${id}" уже завершена`);
    const grant = grantMaterialRewards(d.rewardDeps(), materialRewardsOf(stepDef.rewards), 'quest.chain', `цепочка «${chain.name}», шаг ${cur} (dev)`);
    if (!grant.ok) return err(grant.error);
    const s4 = d.getState();
    d.setState({
      ...s4,
      chains: {
        step: { ...s4.chains.step, [id]: cur + 1 },
        granted: [...s4.chains.granted, stepKey(id, stepDef.id)],
        progress: s4.chains.progress,
      },
    });
    d.markDirty();
    d.publishCompleted(chain, 'chain', cur, stepDef);
    return ok(`dev: шаг ${cur} цепочки «${chain.name}» завершён (награды выданы)`);
  }
  return err(`неизвестный id: "${id}"`);
}

/** dev: открыть ачивку (unlockFlags + событие achievement.unlocked с наградами) */
export function devUnlock(d: QuestsDevDeps, id: string): Result<string> {
  const def = d.achievements().find((a) => a.id === id);
  if (!def) return err(`ачивка "${id}" не найдена (quests list ach)`);
  const s = d.getState();
  if (s.achievements.unlocked.includes(id)) return err(`ачивка "${id}" уже открыта`);
  const flags = [...s.flags];
  for (const f of def.unlockFlags ?? []) if (!flags.includes(f)) flags.push(f);
  d.setState({
    ...s,
    achievements: { ...s.achievements, unlocked: [...s.achievements.unlocked, id] },
    flags,
  });
  d.markDirty();
  d.rewardDeps().bus.publish('achievement.unlocked', {
    id,
    name: def.name,
    hidden: def.hidden === true,
    xp: xpSumOf(def.rewards),
    rewards: (def.rewards ?? []) as Reward[],
    flags: def.unlockFlags ?? [],
  });
  return ok(`dev: ачивка «${def.name}» открыта (событие опубликовано)`);
}

export type { GrantReceipt };
