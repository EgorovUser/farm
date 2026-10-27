/**
 * Реген энергии/HP (M01 §2–§3): «1 ед / 3 мин» и «1 / 5 мин», оффлайн тоже.
 *
 * Живая игра: подписка на time.minuteTick (тик ядра = 1 игровая минута).
 * Оффлайн-досчёт: минутные тики НЕ проигрываются (02-BUSES §8) — реген
 * досчитывается пачкой по time.catchUpDone: минуты = (to − from) / tickMs.
 * Естественный кап — player.*.max: 100 энергии доберутся за ~5 часов,
 * 50 HP — за ~4.2 часа, поэтому капы досчёта (72ч/14д) реген не ограничивают.
 *
 * Ручной расчёт по фиксированным датам (приёмка §8):
 *   minutes = floor((to − from) / tickMs); энергия = min(e + minutes × 1/3, max).
 */
import type { EventBus } from '@/kernel/bus/event-bus/event-bus';
import type { StatBus } from '@/kernel/bus/stat-bus/stat-bus';
import type { ResolveCtx } from '@/kernel/bus/stat-bus/modifier';
import type { PlayerEnergy } from './energy';
import type { PlayerHp } from './hp';

export interface RegenDeps {
  bus: EventBus;
  statBus: StatBus;
  ctx: () => ResolveCtx;
  energy: PlayerEnergy;
  hp: PlayerHp;
  /** длительность тика ядра, ms (контент time.tickMs = 1000: 1 мин = 1 с) */
  tickMs: number;
}

export class PlayerRegen {
  private readonly deps: RegenDeps;

  constructor(deps: RegenDeps) {
    this.deps = deps;
  }

  /** Подписки (DEBT-8: самоподключение в activate — ратифицированная конвенция) */
  wire(): () => void {
    const offTick = this.deps.bus.subscribe('time.minuteTick', () => this.onMinuteTick());
    const offCatchUp = this.deps.bus.subscribe('time.catchUpDone', (p) => {
      const { from, to } = p as { from: number; to: number };
      this.onCatchUp(from, to);
    });
    return () => {
      offTick();
      offCatchUp();
    };
  }

  onMinuteTick(): void {
    const { statBus, ctx, energy, hp } = this.deps;
    energy.regenBy(statBus.resolve({ stat: 'player.energy.regenPerMinute', ctx: ctx() }));
    hp.regenBy(statBus.resolve({ stat: 'player.hp.regenPerMinute', ctx: ctx() }));
  }

  /** Оффлайн-досчёт: фиксированные даты from → to, минуты по tickMs */
  onCatchUp(from: number, to: number): void {
    if (to <= from) return; // защита от отмотки уже в OfflineCatchup — здесь тихо
    const { statBus, ctx, energy, hp, tickMs } = this.deps;
    const minutes = Math.floor((to - from) / tickMs);
    if (minutes <= 0) return;
    energy.regenBy(minutes * statBus.resolve({ stat: 'player.energy.regenPerMinute', ctx: ctx() }));
    hp.regenBy(minutes * statBus.resolve({ stat: 'player.hp.regenPerMinute', ctx: ctx() }));
  }
}
