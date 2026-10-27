/**
 * [MEL-G · FIX-PHASE-2] Переоценка M15 — чистые функции над SyncDeps
 * (распил engine.ts 483 → части ≤300 по протоколу M15.2; перенос 1:1,
 * поведение не меняется — оракул: selftest байт-в-байт + живые пробы).
 *
 * Цикл «событие каталога → bump счётчика (N3, CountersEngine M01) →
 * переоценка активных условий → quest.progress / quest.completed /
 * achievement.unlocked». Ре-ентрантностью управляет агрегатор (engine.ts):
 * выдача наград публикует item.acquired → вложенный sync гасится флагом.
 */
import type { EventBus } from '@/kernel/bus/event-bus/event-bus';
import type { ContentRegistry } from '@/kernel/content/content-registry';
import { checkCondition } from '@/shared/utils/condition-check';
import type { ConditionCtx } from '@/shared/types/requirement';
import type { QuestDef, AchievementDef, QuestStepDef } from '@/content/quests/types';
import type { QuestsTable } from '@/content/balance/quests';
import { stepProgressOf } from './evaluate';
import { grantMaterialRewards, materialRewardsOf, xpSumOf, type RewardDeps } from './rewards';
import { stepKey, type QuestsState, type RollState } from './state';

export interface SyncDeps {
  bus: EventBus;
  content: ContentRegistry;
  table(): QuestsTable;
  pool(kind: 'daily' | 'weekly' | 'chain'): QuestDef[];
  achievements(): AchievementDef[];
  ctxFor(roll: RollState | null): ConditionCtx;
  rewardDeps(): RewardDeps;
  getState(): QuestsState;
  setState(s: QuestsState): void;
  markDirty(): void;
}

export function publishProgress(
  bus: EventBus,
  def: QuestDef,
  kind: 'daily' | 'weekly' | 'chain',
  step: number,
  progress: number,
  goal: number,
): void {
  bus.publish('quest.progress', {
    id: def.id,
    kind,
    name: def.name,
    step,
    stepsTotal: def.steps.length,
    progress,
    goal,
  });
}

export function publishCompleted(
  bus: EventBus,
  def: QuestDef,
  kind: 'daily' | 'weekly' | 'chain',
  step: number,
  stepDef: QuestStepDef,
): void {
  const finished = step >= def.steps.length;
  bus.publish('quest.completed', {
    id: def.id,
    kind,
    name: def.name,
    step,
    stepsTotal: def.steps.length,
    progress: stepDef.condition.t === 'counterAtLeast' ? stepDef.condition.value : 1,
    goal: stepDef.condition.t === 'counterAtLeast' ? stepDef.condition.value : 1,
    xp: xpSumOf(stepDef.rewards),
    rewards: stepDef.rewards,
    finished,
    // церемониальное завершение цепочки — данные UI-экрана (карточка §4)
    ...(kind === 'chain' && finished && def.ceremony ? { ceremony: def.ceremony } : {}),
  });
}

export function syncRoll(d: SyncDeps, kind: 'daily' | 'weekly'): void {
  const s = d.getState();
  const roll = kind === 'daily' ? s.daily : s.weekly;
  const ctx = d.ctxFor(roll);
  const pool = d.pool(kind);
  let changed = false;
  for (const id of roll.ids) {
    const def = pool.find((q) => q.id === id);
    if (!def || def.kind !== kind || def.steps.length === 0) continue; // битый id — П5, невидим
    if (def.unlock && !checkCondition(def.unlock, ctx)) continue; // гейт выдачи
    let cur = roll.steps[id] ?? 1;
    while (cur <= def.steps.length) {
      const stepDef = def.steps[cur - 1];
      if (stepDef === undefined) break;
      const key = stepKey(id, stepDef.id);
      if (roll.completed.includes(key)) {
        cur++;
        continue;
      }
      const { progress, goal } = stepProgressOf(stepDef, ctx);
      const seen = roll.progress[key] ?? 0;
      if (progress > seen) {
        roll.progress[key] = progress;
        publishProgress(d.bus, def, kind, cur, progress, goal);
        changed = true;
      }
      if (progress >= goal) {
        roll.completed.push(key);
        roll.steps[id] = cur + 1;
        publishCompleted(d.bus, def, kind, cur, stepDef);
        changed = true;
        cur++;
        continue;
      }
      break;
    }
  }
  if (changed) {
    d.setState(kind === 'daily' ? { ...s, daily: roll } : { ...s, weekly: roll });
    d.markDirty();
  }
}

/** цепочки: шаги строго последовательно, материальные награды — авто-выдача
 *  (идемпотентность по granted), xp/passivePoint — событием завершения.
 *  Гейт выдачи (unlock) — семантика «сюжет — по желанию» (см. chains.ts) */
export function syncChains(d: SyncDeps): void {
  const s = d.getState();
  const chains = {
    step: { ...s.chains.step },
    granted: [...s.chains.granted],
    progress: { ...s.chains.progress },
  };
  const ctx = d.ctxFor(null);
  let changed = false;
  for (const def of d.pool('chain')) {
    if (def.unlock && !checkCondition(def.unlock, ctx)) continue; // гейт выдачи
    let cur = chains.step[def.id] ?? 1;
    while (cur <= def.steps.length) {
      const stepDef = def.steps[cur - 1];
      if (stepDef === undefined) break;
      const key = stepKey(def.id, stepDef.id);
      if (chains.granted.includes(key)) {
        cur++;
        continue;
      }
      const { progress, goal } = stepProgressOf(stepDef, ctx);
      const seen = chains.progress[key] ?? 0;
      if (progress > seen) {
        chains.progress[key] = progress;
        publishProgress(d.bus, def, 'chain', cur, progress, goal);
        changed = true;
      }
      if (progress >= goal) {
        const grant = grantMaterialRewards(
          d.rewardDeps(),
          materialRewardsOf(stepDef.rewards),
          'quest.chain',
          `цепочка «${def.name}», шаг ${cur}`,
        );
        if (!grant.ok) break; // инфраструктурный отказ — шаг подождёт (без потери)
        chains.granted.push(key);
        chains.step[def.id] = cur + 1;
        publishCompleted(d.bus, def, 'chain', cur, stepDef);
        changed = true;
        cur++;
        continue;
      }
      break;
    }
  }
  if (changed) {
    const s2 = d.getState();
    d.setState({ ...s2, chains });
    d.markDirty();
  }
}

export function syncAchievements(d: SyncDeps): void {
  const s = d.getState();
  const ctx = d.ctxFor(null);
  const unlocked = [...s.achievements.unlocked];
  const flags = [...s.flags];
  let changed = false;
  for (const def of d.achievements()) {
    if (unlocked.includes(def.id)) continue;
    if (!checkCondition(def.condition, ctx)) continue;
    unlocked.push(def.id);
    for (const f of def.unlockFlags ?? []) if (!flags.includes(f)) flags.push(f);
    d.bus.publish('achievement.unlocked', {
      id: def.id,
      name: def.name,
      hidden: def.hidden === true,
      xp: xpSumOf(def.rewards),
      rewards: def.rewards ?? [],
      flags: def.unlockFlags ?? [],
    });
    changed = true;
  }
  if (changed) {
    const cap = d.table().sanity;
    const cur = d.getState();
    d.setState({
      ...cur,
      achievements: { unlocked: unlocked.slice(0, cap.maxAchievements), claimed: cur.achievements.claimed },
      flags: flags.slice(0, cap.maxFlags),
    });
    d.markDirty();
  }
}

/** полный цикл переоценки (ре-ентрантность — в агрегаторе engine.ts) */
export function syncQuests(d: SyncDeps): void {
  syncRoll(d, 'daily');
  syncRoll(d, 'weekly');
  syncChains(d);
  syncAchievements(d);
}
