/**
 * Движок M15 (карточка §2–§5): цикл «событие каталога → bump счётчика ядра
 * (N3, CountersEngine M01) → переоценка активных условий → quest.progress /
 * quest.completed / achievement.unlocked». НИ ОДНОГО обработчика конкретного
 * квеста: пулы читаются из реестра ЖИВО (content.get) — новый шаблон в данных
 * поднимает прогресс без пересборки (§7 карточки).
 *
 * ПОРЯДОК: подписки M15 монтируются ПОСЛЕ M01 (модуль активируется последним
 * в module-wiring) — счётчики успевают подняться до переоценки; ленивый sync()
 * в list/claim дополнительно страховает витрины. Ре-ентрантность: выдача
 * наград публикует item.acquired → вложенный sync() гасится флагом.
 *
 * Прогресс периода = счётчик − базовая линия ролла (state.ts): daily/weekly
 * честно «внутри дня/недели»; цепочки/ачивки — lifetime (null-ролл).
 * Витрины — views.ts (чистые строитель), dev-методы — dev.ts (фасад deps).
 *
 * [MEL-G · FIX-PHASE-2] распил 483 → агрегатор ≤300: переоценка — engine-sync.ts
 * (чистые функции над SyncDeps), замена/claim — engine-claim.ts (над ClaimDeps);
 * перенос 1:1, публичный API класса не менялся.
 */
import type { EventBus } from '@/kernel/bus/event-bus/event-bus';
import type { StatBus } from '@/kernel/bus/stat-bus/stat-bus';
import type { StatsService } from '@/kernel/services/stats/stats-service';
import type { TransactionService } from '@/kernel/services/transaction/transaction-service';
import type { TimeService } from '@/kernel/time/time-service';
import type { ContentRegistry } from '@/kernel/content/content-registry';
import type { RngBus } from '@/kernel/bus/rng-bus/rng-bus';
import type { ConditionCtx } from '@/shared/types/requirement';
import { err, ok, type Result } from '@/shared/types/result';
import type { QuestDef, AchievementDef } from '@/content/quests/types';
import type { QuestsTable } from '@/content/balance/quests';
import { rollQuestIds, weekKeyOf } from './roll';
import type { GrantReceipt, RewardDeps } from './rewards';
import { type QuestsState, type RollState } from './state';
import { buildAchRows, buildChainRows, buildRollRows, type AchievementRow, type QuestRow } from './views';
import { devComplete, devRoll, devUnlock, type QuestsDevDeps } from './dev';
import { publishCompleted, syncQuests, type SyncDeps } from './engine-sync';
import { claimQuest, rerollDaily, type ClaimDeps } from './engine-claim';

export type { AchievementRow, QuestRow };

export interface EngineDeps {
  bus: EventBus;
  statBus: StatBus;
  stats: StatsService;
  transaction: TransactionService;
  time: TimeService;
  content: ContentRegistry;
  rngBus: RngBus;
  saveId(): string;
  /** app-каналы (П4): уровень/навыки игрока (player.ctxExtras) */
  gateExtras(): Record<string, unknown>;
  /** app-канал (П4): количество defId в инвентаре целиком */
  itemCount(defId: string): number;
  getState(): QuestsState;
  setState(s: QuestsState): void;
  markDirty(): void;
}

export class QuestsEngine {
  private readonly deps: EngineDeps;
  private inSync = false;

  constructor(deps: EngineDeps) {
    this.deps = deps;
  }

  // ------------------------------------------------------------ данные (live)

  private table(): QuestsTable {
    return this.deps.content.get<QuestsTable>('quests');
  }
  pool(kind: 'daily' | 'weekly' | 'chain'): QuestDef[] {
    const key = kind === 'daily' ? 'quests.daily' : kind === 'weekly' ? 'quests.weekly' : 'quests.chains';
    return this.deps.content.get<QuestDef[]>(key);
  }
  achievements(): AchievementDef[] {
    return this.deps.content.get<AchievementDef[]>('quests.achievements');
  }
  rewardDeps(): RewardDeps {
    return {
      bus: this.deps.bus,
      transaction: this.deps.transaction,
      getFlags: () => this.deps.getState().flags,
      addFlags: (flags) => {
        const cur = this.deps.getState();
        const next = [...cur.flags];
        for (const f of flags) if (!next.includes(f)) next.push(f);
        this.deps.setState({ ...cur, flags: next.slice(0, this.table().sanity.maxFlags) });
      },
      markDirty: () => this.deps.markDirty(),
    };
  }

  // ------------------------------------------------------------ контексты

  private ctxFor(roll: RollState | null): ConditionCtx {
    const extra = this.deps.gateExtras();
    const state = this.deps.getState();
    return {
      tags: [],
      stat: (stat) => this.deps.statBus.resolve({ stat, ctx: { ...this.deps.time.ctx('player'), extra } }),
      hasFlag: (flag) => state.flags.includes(flag),
      skillLevel: (skill) => Number(extra[`skill:${skill}`] ?? 0),
      playerLevel: Number(extra['player:level'] ?? 0),
      itemCount: (defId) => this.deps.itemCount(defId),
      hasAchievement: (id) => state.achievements.unlocked.includes(id),
      counter: (id) =>
        roll === null ? this.deps.stats.get(id) : Math.max(0, this.deps.stats.get(id) - (roll.baseline[id] ?? 0)),
    };
  }

  // ------------------------------------------------------------ роллы периода

  private snapshotBaseline(): Record<string, number> {
    const out: Record<string, number> = {};
    for (const { id, value } of this.deps.stats.snapshot()) out[id] = value;
    return out;
  }

  private freshRoll(key: string, kind: 'daily' | 'weekly'): RollState {
    const t = this.table();
    return {
      key,
      ids: rollQuestIds(
        this.deps.saveId(),
        key,
        this.pool(kind),
        kind === 'daily' ? t.daily.count : t.weekly.count,
        `quests:${kind}`,
      ),
      baseline: this.snapshotBaseline(),
      rerollUsed: false,
      completed: [],
      claimed: [],
      progress: {},
      steps: {},
    };
  }

  /** ленивый ensure (прецедент shop.ensureStock): холодная загрузка/пропущенный день */
  ensureDay(): void {
    const today = this.deps.time.localDateISO(this.deps.time.now());
    this.rollPeriod(today, 'daily');
    this.rollPeriod(weekKeyOf(today), 'weekly');
    this.sync();
  }

  onDayTick(payload: { dateISO?: string }): void {
    const dateISO = payload.dateISO ?? this.deps.time.localDateISO(this.deps.time.now());
    this.rollPeriod(dateISO, 'daily');
    this.rollPeriod(weekKeyOf(dateISO), 'weekly');
    this.sync();
  }

  private rollPeriod(key: string, kind: 'daily' | 'weekly'): void {
    const s = this.deps.getState();
    const roll = kind === 'daily' ? s.daily : s.weekly;
    if (roll.key === key) return;
    const fresh = this.freshRoll(key, kind);
    this.deps.setState(kind === 'daily' ? { ...s, daily: fresh } : { ...s, weekly: fresh });
    this.deps.markDirty();
  }

  /** напоминание о невзятых наградах (карточка §3): живой hourTick часа N;
   *  оффлайн-часы (catchUp) молчат — UI не должен проигрывать стопку подряд */
  onHourTick(payload: { now?: number; catchUp?: boolean }): void {
    if (payload.catchUp === true || typeof payload.now !== 'number') return;
    if (new Date(payload.now).getHours() !== this.table().reminderHour) return;
    this.sync();
    const unclaimed = [...this.listQuests('daily'), ...this.listQuests('weekly')].filter((q) => q.claimable);
    if (unclaimed.length === 0) return;
    this.deps.bus.publish('quest.reminder', {
      dateISO: this.deps.time.localDateISO(payload.now),
      reminderHour: this.table().reminderHour,
      unclaimed: unclaimed.map((q) => ({ id: q.id, name: q.name, kind: q.kind })),
    });
  }

  // ------------------------------------------------------------ переоценка (engine-sync.ts)

  private syncDeps(): SyncDeps {
    return {
      bus: this.deps.bus,
      content: this.deps.content,
      table: () => this.table(),
      pool: (kind) => this.pool(kind),
      achievements: () => this.achievements(),
      ctxFor: (roll) => this.ctxFor(roll),
      rewardDeps: () => this.rewardDeps(),
      getState: () => this.deps.getState(),
      setState: (s) => this.deps.setState(s),
      markDirty: () => this.deps.markDirty(),
    };
  }

  sync(): void {
    if (this.inSync) return;
    this.inSync = true;
    try {
      syncQuests(this.syncDeps());
    } finally {
      this.inSync = false;
    }
  }

  publishCompleted(def: Parameters<typeof publishCompleted>[1], kind: 'daily' | 'weekly' | 'chain', step: number, stepDef: Parameters<typeof publishCompleted>[4]): void {
    publishCompleted(this.deps.bus, def, kind, step, stepDef);
  }

  // ------------------------------------------------------------ замена дня + claim (engine-claim.ts)

  private claimDeps(): ClaimDeps {
    return {
      rngBus: this.deps.rngBus,
      pool: (kind) => this.pool(kind),
      achievements: () => this.achievements(),
      rewardDeps: () => this.rewardDeps(),
      getState: () => this.deps.getState(),
      setState: (s) => this.deps.setState(s),
      markDirty: () => this.deps.markDirty(),
      sync: () => this.sync(),
    };
  }

  rerollDaily(id: string): Result<{ removed: string; added: string }> {
    return rerollDaily(this.claimDeps(), id);
  }

  claim(id: string): Result<GrantReceipt & { id: string }> {
    return claimQuest(this.claimDeps(), id);
  }

  // ------------------------------------------------------------ dev-витрины (dev.ts)

  private devDeps(): QuestsDevDeps {
    return {
      pool: (kind) => this.pool(kind),
      achievements: () => this.achievements(),
      publishCompleted: (def, kind, step, stepDef) => this.publishCompleted(def, kind, step, stepDef),
      rewardDeps: () => this.rewardDeps(),
      getState: () => this.deps.getState(),
      setState: (s) => this.deps.setState(s),
      markDirty: () => this.deps.markDirty(),
      rerollDay: () => {
        const today = this.deps.time.localDateISO(this.deps.time.now());
        this.rollPeriod(today, 'daily');
        this.deps.markDirty();
        this.sync();
      },
      sync: () => this.sync(),
    };
  }

  devRoll(): string {
    return devRoll(this.devDeps());
  }
  devComplete(id: string): Result<string> {
    return devComplete(this.devDeps(), id);
  }
  devUnlock(id: string): Result<string> {
    return devUnlock(this.devDeps(), id);
  }

  // ------------------------------------------------------------ витрины (views.ts)

  listQuests(kind: 'daily' | 'weekly' | 'chain'): QuestRow[] {
    this.sync();
    const s = this.deps.getState();
    if (kind === 'chain') return buildChainRows(this.pool('chain'), this.ctxFor(null), s.chains);
    const roll = kind === 'daily' ? s.daily : s.weekly;
    return buildRollRows(kind, roll, this.pool(kind), this.ctxFor(roll));
  }

  listAchievements(includeHidden: boolean): AchievementRow[] {
    const s = this.deps.getState();
    if (includeHidden) {
      // витрина всех (dev): hidden видны помеченными
      return this.achievements().map((a) => ({
        id: a.id,
        name: a.name,
        unlocked: s.achievements.unlocked.includes(a.id),
        claimed: s.achievements.claimed.includes(a.id),
        hidden: a.hidden === true,
        rewards: a.rewards ?? [],
      }));
    }
    return buildAchRows(this.achievements(), s.achievements.unlocked, s.achievements.claimed);
  }

  chainProgress(chainId: string): Result<QuestRow> {
    const row = this.listQuests('chain').find((r) => r.id === chainId);
    return row ? ok(row) : err(`цепочка "${chainId}" не найдена (quests list chains)`);
  }
}
