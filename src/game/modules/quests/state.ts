/**
 * Состояние M15 «Квесты» (срез сейва 'quests', версия среза 1).
 *
 * ЧТО НЕ ЗДЕСЬ (единый источник истины — ядро, N3): счётчики — kernel.stats
 * (M01 §6); прогресс квеста ДЕРИВИРУЕТСЯ (счётчик − базовая линия ролла) и
 * не хранится как число прогресса — здесь только последний ОПУБЛИКОВАННЫЙ N
 * (дедупликация quest.progress) и статусы завершения/выдачи.
 *
 * Базовая линия дня/недели — снапшот ВСЕХ счётчиков на момент ролла: прогресс
 * «внутри» периода для любого счётчика без извлечения условий ([DECISION];
 * замена квеста наследует линию дня — «прогресс дня не переносится» честно).
 *
 * Флаги живут здесь ([DECISION] брифа §4.5: в срезе игрока флагов нет — M01
 * их не ведёт; unlockFlags/флаги наград производятся M15). Санация П5 —
 * структурная с капами; неизвестные id шаблонов двигком просто не находятся
 * (итерация по ПУЛАМ, не по срезу) — битое невидимо, не падает.
 */
import type { SaveSlice } from '@/kernel/save/save-director';
import type { QuestsTable } from '@/content/balance/quests';

/** ролл-периода: daily (key = dateISO) / weekly (key = weekKey «2026-W43») */
export interface RollState {
  key: string;
  ids: string[];
  baseline: Record<string, number>;
  rerollUsed: boolean;
  /** завершённые шаги: ключи `${questId}:${stepId}` (событие уже опубликовано) */
  completed: string[];
  /** выданные claim'ом награды: те же ключи шагов */
  claimed: string[];
  /** последний опубликованный progress (dedup ленты quest.progress) */
  progress: Record<string, number>;
  /** текущий шаг квеста (1-based; weekly-цепочки; daily всегда 1) */
  steps: Record<string, number>;
}

export interface QuestsState {
  v: 1;
  daily: RollState;
  weekly: RollState;
  chains: {
    /** chainId → текущий шаг (1-based); steps.length + 1 = завершена */
    step: Record<string, number>;
    /** шаги с уже выданными наградами (авто-выдача цепочек, идемпотентность) */
    granted: string[];
    /** последний опубликованный progress шагов цепочек (дедуп ленты) */
    progress: Record<string, number>;
  };
  achievements: {
    unlocked: string[];
    /** ачивки с забранными наградами (claim) */
    claimed: string[];
  };
  /** флаги: unlockFlags ачивок + Reward{t:'flag'} (читают гейты, M15.2) */
  flags: string[];
}

export function defaultRollState(): RollState {
  return { key: '', ids: [], baseline: {}, rerollUsed: false, completed: [], claimed: [], progress: {}, steps: {} };
}

export function defaultQuestsState(): QuestsState {
  return {
    v: 1,
    daily: defaultRollState(),
    weekly: defaultRollState(),
    chains: { step: {}, granted: [], progress: {} },
    achievements: { unlocked: [], claimed: [] },
    flags: [],
  };
}

// ------------------------------------------------------------- save slice

/** шаг-ключ: `${questId}:${stepId}` (claim/комpletion одного зерна) */
export function stepKey(questId: string, stepId: string): string {
  return `${questId}:${stepId}`;
}

function strArray(v: unknown, cap: number): string[] {
  if (!Array.isArray(v)) return [];
  return [...new Set(v.filter((x): x is string => typeof x === 'string' && x !== ''))].slice(0, cap);
}

function numRecord(v: unknown, cap: number, max: number): Record<string, number> {
  const out: Record<string, number> = {};
  if (v === null || typeof v !== 'object' || Array.isArray(v)) return out;
  for (const [k, val] of Object.entries(v as Record<string, unknown>)) {
    if (!k) continue;
    if (typeof val === 'number' && Number.isFinite(val)) {
      out[k] = Math.max(0, Math.min(max, Math.floor(val)));
    }
    if (Object.keys(out).length >= cap) break;
  }
  return out;
}

function sanitizeRoll(v: unknown, sanity: QuestsTable['sanity']): RollState {
  const r = (v ?? {}) as Partial<RollState>;
  return {
    key: typeof r.key === 'string' ? r.key.slice(0, 32) : '',
    ids: strArray(r.ids, sanity.maxRollIds),
    baseline: numRecord(r.baseline, sanity.maxBaseline, 1e12),
    rerollUsed: r.rerollUsed === true,
    completed: strArray(r.completed, sanity.maxCompleted),
    claimed: strArray(r.claimed, sanity.maxCompleted),
    progress: numRecord(r.progress, sanity.maxProgress, 1e12),
    steps: numRecord(r.steps, sanity.maxProgress, 10_000),
  };
}

export function questsSaveSlice(
  getState: () => QuestsState,
  setState: (s: QuestsState) => void,
  sanity: QuestsTable['sanity'],
): SaveSlice {
  return {
    save: () => {
      const s = getState();
      const roll = (r: RollState): RollState => ({
        key: r.key,
        ids: [...r.ids],
        baseline: { ...r.baseline },
        rerollUsed: r.rerollUsed,
        completed: [...r.completed],
        claimed: [...r.claimed],
        progress: { ...r.progress },
        steps: { ...r.steps },
      });
      return {
        v: 1,
        daily: roll(s.daily),
        weekly: roll(s.weekly),
        chains: { step: { ...s.chains.step }, granted: [...s.chains.granted], progress: { ...s.chains.progress } },
        achievements: { unlocked: [...s.achievements.unlocked], claimed: [...s.achievements.claimed] },
        flags: [...s.flags],
      };
    },
    load: (data) => {
      const parsed = data as Partial<QuestsState> | null;
      if (!parsed || typeof parsed !== 'object') return;
      const chains = (parsed.chains ?? {}) as { step?: unknown; granted?: unknown; progress?: unknown };
      const ach = (parsed.achievements ?? {}) as { unlocked?: unknown; claimed?: unknown };
      setState({
        v: 1,
        daily: sanitizeRoll(parsed.daily, sanity),
        weekly: sanitizeRoll(parsed.weekly, sanity),
        chains: {
          step: numRecord(chains.step, sanity.maxChains, 10_000),
          granted: strArray(chains.granted, sanity.maxGranted),
          progress: numRecord(chains.progress, sanity.maxProgress, 1e12),
        },
        achievements: {
          unlocked: strArray(ach.unlocked, sanity.maxAchievements),
          claimed: strArray(ach.claimed, sanity.maxAchievements),
        },
        flags: strArray(parsed.flags, sanity.maxFlags),
      });
    },
  };
}
