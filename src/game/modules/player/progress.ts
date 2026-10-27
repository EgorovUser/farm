/**
 * XP и уровень игрока (M01 §4): кривая из данных, события → XP, levelUp.
 *
 * xpToNext(L) = xpBase × (1 + growth/100)^L (карточка: 100 × 1.15^L).
 * Уровень — главный гейт разблокировок; на player.levelUp подписаны
 * пассивки (+1 очко, M14), гейты, UI. Кап уровня (данные): XP сверх
 * последней кривой не копится сверх потребного — прогресс не «сгорает»,
 * просто останавливается (калибруется баланс-проходом фазы 6).
 *
 * Таблица событий — в контенте: вспашка 2, сбор 5, рыба 8, крафт 10,
 * моб 15, босс 100, квест 50–500 (количество в пейлоаде).
 */
import type { EventBus } from '@/kernel/bus/event-bus/event-bus';
import type { PlayerTable } from '@/content/player/progression';
import type { XpEventRule } from '@/content/player/rules';
import type { PlayerState } from './state';

export interface ProgressDeps {
  bus: EventBus;
  table: PlayerTable;
  getState: () => PlayerState;
  markDirty(): void;
}

export interface ProgressSnapshot {
  level: number;
  xp: number;
  xpNeed: number;
  maxLevel: number;
}

export class PlayerProgress {
  private readonly deps: ProgressDeps;

  constructor(deps: ProgressDeps) {
    this.deps = deps;
  }

  /** xpToNext(L) = 100 × 1.15^L — формула целиком из данных */
  xpToNext(level: number): number {
    const { xpBase, growthPercent } = this.deps.table.level;
    return Math.round(xpBase * (1 + growthPercent / 100) ** level);
  }

  snapshot(): ProgressSnapshot {
    const { level, xp } = this.deps.getState();
    return {
      level,
      xp: Math.floor(xp),
      xpNeed: this.xpToNext(level),
      maxLevel: this.deps.table.level.maxLevel,
    };
  }

  /** player.addXp(n, source) — публичный API (квесты M15, debug `xp add`) */
  addXp(amount: number, source: string): { gained: number; levelsUp: number } {
    if (!(amount > 0)) return { gained: 0, levelsUp: 0 };
    const s = this.deps.getState();
    const maxLevel = this.deps.table.level.maxLevel;
    const beforeLevel = s.level;
    if (s.level < maxLevel) {
      s.xp += amount;
      while (s.level < maxLevel && s.xp >= this.xpToNext(s.level)) {
        s.xp -= this.xpToNext(s.level);
        s.level++;
        this.deps.bus.publish('player.levelUp', { level: s.level, source });
      }
      if (s.level >= maxLevel) s.xp = Math.min(s.xp, this.xpToNext(maxLevel));
    }
    this.deps.markDirty();
    this.deps.bus.publish('player.xpGained', { amount, source, xp: Math.floor(s.xp), level: s.level });
    // уровень меняет значения levelBonusProvider — кэш шин пересчитать сразу
    if (s.level !== beforeLevel) this.deps.bus.publish('invalidate.stat', { stats: ['player.energy.max', 'player.hp.max'] });
    return { gained: amount, levelsUp: s.level - beforeLevel };
  }

  /** Подписки на XP-события из таблицы данных (манифест eventsSubscribed) */
  wire(): () => void {
    return wireXpRules(this.deps.bus, this.deps.table.xpEvents, (amount, source) =>
      this.addXp(amount, source),
    );
  }
}

/** Общий монтаж правил «событие → XP»: фиксированное число или ключ пейлоада */
export function wireXpRules(
  bus: EventBus,
  rules: readonly XpEventRule[],
  addXp: (amount: number, source: string) => void,
): () => void {
  const offs = rules.map((rule) =>
    bus.subscribe(rule.event, (payload) => {
      const amount = readAmount(rule, payload);
      if (amount > 0) addXp(amount, rule.event);
    }),
  );
  return () => offs.forEach((off) => off());
}

/** Сколько XP даёт событие: xp из правила или числовое поле пейлоада (П5) */
function readAmount(rule: XpEventRule, payload: unknown): number {
  if (rule.xp !== undefined) return rule.xp;
  const record = payload as Record<string, unknown> | null;
  const raw = rule.xpKey !== undefined ? record?.[rule.xpKey] : undefined;
  return typeof raw === 'number' && Number.isFinite(raw) ? raw : 0;
}
