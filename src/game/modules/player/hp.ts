/**
 * HP игрока (M01 §3): хранит и репортит. Реген вне шахты — regen.ts
 * (в шахте НЕ регенится — M13 заглушит через условный модификатор на
 * player.hp.regenPerMinute, модуль не будет знать). Лечение мгновенное
 * (useAction → heal). Смерть: HP = 0 → player.hpChanged с тегом death —
 * M01 только репортит, что делать решает M13 (карточка §3).
 */
import type { EventBus } from '@/kernel/bus/event-bus/event-bus';
import type { StatBus } from '@/kernel/bus/stat-bus/stat-bus';
import type { ResolveCtx } from '@/kernel/bus/stat-bus/modifier';
import type { PlayerState } from './state';

export interface HpDeps {
  bus: EventBus;
  statBus: StatBus;
  ctx: () => ResolveCtx;
  getState: () => PlayerState;
  markDirty(): void;
}

export interface HpCheck {
  current: number;
  max: number;
  alive: boolean;
}

export class PlayerHp {
  private readonly deps: HpDeps;

  constructor(deps: HpDeps) {
    this.deps = deps;
  }

  /** player.checkHp(): и текущее, и жив ли (M12 решает по этому) */
  check(): HpCheck {
    const { statBus, ctx, getState } = this.deps;
    const max = statBus.resolve({ stat: 'player.hp.max', ctx: ctx() });
    const current = Math.floor(getState().hp);
    return { current, max, alive: current > 0 };
  }

  /** Урон (M12). Доводит до 0 и репортит смерть тегом death (M13 решает сам) */
  damage(amount: number, source: string): HpCheck {
    return this.applyDelta(-Math.abs(amount), source);
  }

  /** Лечение (useAction M02, родники/зелья M13) — не выше капа */
  heal(amount: number, source: string): HpCheck {
    return this.applyDelta(Math.abs(amount), source);
  }

  /** Прямая установка (debug) — клэмп [0, max]; 0 репортит смерть */
  set(amount: number): void {
    const { statBus, ctx, getState } = this.deps;
    const max = statBus.resolve({ stat: 'player.hp.max', ctx: ctx() });
    const before = getState().hp;
    getState().hp = Math.min(Math.max(amount, 0), max);
    if (getState().hp !== before) {
      this.report(getState().hp - before, 'debug.set');
    }
    this.deps.markDirty();
  }

  /** Регенерация на заданную величину (вызывает regen.ts; тегов смерти нет) */
  regenBy(amount: number): void {
    if (!(amount > 0)) return;
    const { getState, statBus, ctx } = this.deps;
    const max = statBus.resolve({ stat: 'player.hp.max', ctx: ctx() });
    const s = getState();
    if (s.hp >= max) return;
    const before = Math.floor(s.hp);
    s.hp = Math.min(max, s.hp + amount);
    this.deps.markDirty();
    if (Math.floor(s.hp) !== before) {
      this.report(s.hp - before, 'regen');
    }
  }

  private applyDelta(delta: number, reason: string): HpCheck {
    const { getState, statBus, ctx } = this.deps;
    const max = statBus.resolve({ stat: 'player.hp.max', ctx: ctx() });
    const s = getState();
    const before = s.hp;
    s.hp = Math.min(Math.max(s.hp + delta, 0), max);
    this.deps.markDirty();
    if (s.hp !== before) {
      this.report(s.hp - before, reason);
    }
    const current = Math.floor(s.hp);
    return { current, max, alive: current > 0 };
  }

  private report(delta: number, reason: string): void {
    const { getState, statBus, ctx } = this.deps;
    const s = getState();
    const max = statBus.resolve({ stat: 'player.hp.max', ctx: ctx() });
    const current = Math.floor(s.hp);
    const died = current <= 0;
    // Смерть — тег death в событии (карточка §3): M13 сам решает, что делать
    this.deps.bus.publish('player.hpChanged', {
      delta,
      current,
      max,
      died,
      tags: died ? ['death'] : [],
      reason,
    });
  }
}
