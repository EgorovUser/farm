/**
 * Энергия игрока (M01 §2): темпоритм, не замок. Единственная точка списания.
 *
 * Списание: statBus.resolve('action.<system>.<verb>.energyCost') → здесь.
 * Двухфазность в модулях ядра не нужна: JS однопотен, поэтому порядок
 * «проверил → выполнил действие → списал» даёт строгую атомарность —
 * энергия списывается РОВНО ОДИН раз за действие и не списывается вовсе,
 * если действие (транзакция) отказало (карточка §8: сильнее отката).
 *
 * События: player.energySpent (расход действия) и player.energyChanged
 * (любое изменение отображаемого значения — расход, грант, реген).
 */
import type { EventBus } from '@/kernel/bus/event-bus/event-bus';
import type { StatBus } from '@/kernel/bus/stat-bus/stat-bus';
import type { ResolveCtx } from '@/kernel/bus/stat-bus/modifier';
import type { StatId } from '@/shared/types/ids';
import type { Result } from '@/shared/types/result';
import { err, ok } from '@/shared/types/result';
import type { PlayerState } from './state';

export interface EnergyDeps {
  bus: EventBus;
  statBus: StatBus;
  ctx: () => ResolveCtx;
  getState: () => PlayerState;
  markDirty(): void;
}

export interface EnergySnapshot {
  current: number;
  max: number;
  regenPerMinute: number;
}

export class PlayerEnergy {
  private readonly deps: EnergyDeps;

  constructor(deps: EnergyDeps) {
    this.deps = deps;
  }

  snapshot(): EnergySnapshot {
    const { statBus, ctx, getState } = this.deps;
    return {
      current: Math.floor(getState().energy),
      max: statBus.resolve({ stat: 'player.energy.max', ctx: ctx() }),
      regenPerMinute: statBus.resolve({ stat: 'player.energy.regenPerMinute', ctx: ctx() }),
    };
  }

  /** Списать энергию по стату стоимости действия: player.spendEnergy('action.farm.plow.energyCost') */
  spend(stat: StatId, reason?: string): Result<{ cost: number; current: number; max: number }> {
    const cost = this.costOf(stat);
    return this.spendAmount(cost, reason ?? stat, stat);
  }

  /**
   * Списать конкретное количество (debug, еда с отрицательным эффектом и т.п.).
   * [FIX-M01 · §2.6] stat — стат-ид для события energySpent: поле `stat` пейлоада
   * ВСЕГДА стат-ид, reason передаётся отдельным полем (раньше reason-строка
   * попадала в stat при кастомном reason).
   */
  spendAmount(amount: number, reason: string, stat: StatId): Result<{ cost: number; current: number; max: number }> {
    if (!(amount > 0)) return err(`${reason}: количество должно быть положительным`);
    const { getState, statBus, ctx } = this.deps;
    const s = getState();
    const max = statBus.resolve({ stat: 'player.energy.max', ctx: ctx() });
    if (s.energy < amount) {
      return err(`${reason}: не хватает энергии — есть ${Math.floor(s.energy)}, нужно ${amount}`);
    }
    s.energy = Math.max(0, s.energy - amount);
    this.deps.markDirty();
    const current = Math.floor(s.energy);
    this.deps.bus.publish('player.energySpent', { stat, cost: amount, current, max, reason });
    this.deps.bus.publish('player.energyChanged', { delta: -amount, current, max, reason });
    return ok({ cost: amount, current, max });
  }

  /**
   * Выполнить действие с оплатой энергией: списание ТОЛЬКО при успехе action
   * (action — обычно transaction.transact). Отказ действия = энергия не тронута
   * и событий расхода не было (карточка §8, «откатывается» ≡ «не списывается»).
   */
  withEnergy<T>(stat: StatId, action: () => Result<T>, reason?: string): Result<T> {
    const cost = this.costOf(stat);
    const { getState } = this.deps;
    if (getState().energy < cost) {
      const label = reason ?? stat;
      return err(`${label}: не хватает энергии — есть ${Math.floor(getState().energy)}, нужно ${cost}`);
    }
    const result = action();
    if (!result.ok) return result; // энергия не списана, событий нет
    const spent = this.spendAmount(cost, reason ?? stat, stat);
    return spent.ok ? result : err(spent.error); // теоретически недостижимо (проверено выше)
  }

  /** Выдать энергию (еда M02, кровать M05, зелья) — не выше капа */
  grant(amount: number, source: string): number {
    if (!(amount > 0)) return Math.floor(this.deps.getState().energy);
    const { getState, statBus, ctx } = this.deps;
    const s = getState();
    const max = statBus.resolve({ stat: 'player.energy.max', ctx: ctx() });
    const before = Math.floor(s.energy);
    s.energy = Math.min(max, s.energy + amount);
    this.deps.markDirty();
    const current = Math.floor(s.energy);
    if (current !== before) {
      this.deps.bus.publish('player.energyChanged', { delta: current - before, current, max, reason: source });
    }
    return current;
  }

  /** Регенерация на заданную величину (вызывает regen.ts) — не выше капа */
  regenBy(amount: number): void {
    if (!(amount > 0)) return;
    const { getState, statBus, ctx } = this.deps;
    const s = getState();
    const max = statBus.resolve({ stat: 'player.energy.max', ctx: ctx() });
    if (s.energy >= max) return;
    const before = Math.floor(s.energy);
    s.energy = Math.min(max, s.energy + amount);
    this.deps.markDirty();
    const current = Math.floor(s.energy);
    if (current !== before) {
      this.deps.bus.publish('player.energyChanged', { delta: current - before, current, max, reason: 'regen' });
    }
  }

  /** Прямая установка (debug: energy set N) — с клэмпом в [0, max] */
  set(amount: number): void {
    const { getState, statBus, ctx } = this.deps;
    const s = getState();
    const max = statBus.resolve({ stat: 'player.energy.max', ctx: ctx() });
    const before = Math.floor(s.energy);
    s.energy = Math.min(Math.max(amount, 0), max);
    this.deps.markDirty();
    const current = Math.floor(s.energy);
    if (current !== before) {
      this.deps.bus.publish('player.energyChanged', { delta: current - before, current, max, reason: 'debug.set' });
    }
  }

  /** Стоимость действия по стату — всегда через шину (Спартанец M14 опустит) */
  costOf(stat: StatId): number {
    return this.deps.statBus.resolve({ stat, ctx: this.deps.ctx() });
  }
}
