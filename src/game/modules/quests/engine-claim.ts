/**
 * [MEL-G · FIX-PHASE-2] Замена дня + claim — чистые функции над ClaimDeps
 * (распил engine.ts 483 → части ≤300 по протоколу M15.2; перенос 1:1,
 * поведение не меняется — оракул: selftest байт-в-байт + живые пробы).
 *
 * Замена наследует базовую линию дня — «прогресс дня» честно считается и для
 * нового квеста. Claim: все завершённые незабранные шаги — ОДНОЙ транзакцией
 * (идемпотентность повторов — точный no-op-текст, §4.7-5 карточки M15).
 */
import type { RngBus } from '@/kernel/bus/rng-bus/rng-bus';
import { err, ok, type Result } from '@/shared/types/result';
import type { QuestDef, AchievementDef } from '@/content/quests/types';
import { grantMaterialRewards, materialRewardsOf, type GrantReceipt, type RewardDeps } from './rewards';
import { stepKey, type QuestsState, type RollState } from './state';

export interface ClaimDeps {
  rngBus: RngBus;
  pool(kind: 'daily' | 'weekly' | 'chain'): QuestDef[];
  achievements(): AchievementDef[];
  rewardDeps(): RewardDeps;
  getState(): QuestsState;
  setState(s: QuestsState): void;
  markDirty(): void;
  sync(): void;
}

/** 1 бесплатная замена квеста дня (карточка §3): наследует базовую линию
 *  дня — «прогресс дня» честно считается и для нового квеста */
export function rerollDaily(d: ClaimDeps, id: string): Result<{ removed: string; added: string }> {
  const s = d.getState();
  if (!s.daily.ids.includes(id)) return err(`квест "${id}" не в ролле дня (quests list)`);
  if (s.daily.rerollUsed) return err('бесплатная замена на сегодня израсходована (1 в день) — новая завтра');
  const candidates = d.pool('daily').map((q) => q.id).filter((qid) => !s.daily.ids.includes(qid));
  if (candidates.length === 0) return err('в пуле дня нет других шаблонов для замены');
  const idx = Math.floor(d.rngBus.nextFloat('quests:reroll') * candidates.length);
  const added = candidates[idx] as string;
  const daily: RollState = {
    ...s.daily,
    ids: s.daily.ids.map((x) => (x === id ? added : x)),
    rerollUsed: true,
    completed: s.daily.completed.filter((k) => !k.startsWith(`${id}:`)),
    claimed: s.daily.claimed.filter((k) => !k.startsWith(`${id}:`)),
    progress: Object.fromEntries(Object.entries(s.daily.progress).filter(([k]) => !k.startsWith(`${id}:`))),
  };
  d.setState({ ...s, daily });
  d.markDirty();
  d.sync();
  return ok({ removed: id, added });
}

export function claimQuest(d: ClaimDeps, id: string): Result<GrantReceipt & { id: string }> {
  d.sync();
  const s = d.getState();
  // (1) ачивка
  const ach = d.achievements().find((a) => a.id === id);
  if (ach) {
    if (!s.achievements.unlocked.includes(id)) return err(`ачивка "${id}" ещё не открыта (quests list ach)`);
    if (s.achievements.claimed.includes(id)) return err(`награда ачивки "${id}" уже получена (no-op)`);
    const r = grantMaterialRewards(d.rewardDeps(), materialRewardsOf(ach.rewards), 'achievement.claim', `ачивка «${ach.name}»`);
    if (!r.ok) return err(r.error);
    const s2 = d.getState();
    d.setState({ ...s2, achievements: { ...s2.achievements, claimed: [...s2.achievements.claimed, id] } });
    d.markDirty();
    return ok({ id, ...r.value });
  }
  // (2) квест дня/недели: все завершённые незабранные шаги — ОДНОЙ транзакцией
  for (const kind of ['daily', 'weekly'] as const) {
    const roll = kind === 'daily' ? s.daily : s.weekly;
    if (!roll.ids.includes(id)) continue;
    const def = d.pool(kind).find((q) => q.id === id);
    if (!def) return err(`шаблон "${id}" исчез из контента (П5)`);
    const completedSteps = def.steps.filter((st) => roll.completed.includes(stepKey(id, st.id)));
    const grantable = completedSteps.filter((st) => !roll.claimed.includes(stepKey(id, st.id)));
    if (grantable.length === 0) {
      // повторный claim — no-op с точным текстом (идемпотентность, §4.7-5)
      if (completedSteps.length > 0) return err(`награда квеста "${def.name}" уже получена (no-op)`);
      return err(`у квеста "${def.name}" нет завершённых незабранных шагов (quests list)`);
    }
    const rewards = grantable.flatMap((st) => materialRewardsOf(st.rewards));
    const r = grantMaterialRewards(d.rewardDeps(), rewards, 'quest.claim', `квест «${def.name}» (${kind})`);
    if (!r.ok) return err(r.error);
    const keys = grantable.map((st) => stepKey(id, st.id));
    const s3 = d.getState();
    const roll3 = kind === 'daily' ? s3.daily : s3.weekly;
    const next = { ...roll3, claimed: [...roll3.claimed, ...keys] };
    d.setState(kind === 'daily' ? { ...s3, daily: next } : { ...s3, weekly: next });
    d.markDirty();
    return ok({ id, ...r.value });
  }
  return err(`неизвестный id: "${id}" (quests list / quests list ach)`);
}
