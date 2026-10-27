/**
 * TimeService — время, тики, границы (02-BUSES §8).
 * - тик ядра: 1 игровая минута = 1 реальная секунда (настройка в данных);
 * - hourTick — каждый РЕАЛЬНЫЙ час (граница по epoch-часу);
 * - dayTick — в 00:00 локального календаря игрока (дата в локальной зоне);
 * - все таймеры в игре — абсолютные даты (grownAt, endsAt), не остатки тиков;
 * - ctx() — стандартный ResolveCtx для шин.
 *
 * Тик должен быть дёшев: провайдеров опрашивают кэшированные резолвы.
 */
import type { Clock } from '@/kernel/di/clock';
import type { EventBus } from '@/kernel/bus/event-bus/event-bus';
import type { ResolveCtx } from '@/kernel/bus/stat-bus/modifier';
import { MS_DAY, MS_HOUR } from '@/shared/utils/math';

export interface TimeConfig {
  /** длительность одного тика ядра, ms (1 игровая минута = 1000ms реального) */
  tickMs: number;
  /** автосейв, ms */
  autosaveMs: number;
  /** кап часовых итераций оффлайн-досчёта */
  catchupHourCap: number;
  /** кап дневных итераций оффлайн-досчёта */
  catchupDayCap: number;
}

export class TimeService {
  private readonly clock: Clock;
  private readonly bus: EventBus;
  private readonly config: TimeConfig;

  private timer: ReturnType<typeof setInterval> | null = null;
  private tickCount = 0;
  private lastHourIndex = -1;
  private lastDayIndex = -1;
  private readonly tickListeners = new Set<() => void>();

  constructor(clock: Clock, bus: EventBus, config: TimeConfig) {
    this.clock = clock;
    this.bus = bus;
    this.config = config;
    this.resetBoundaries(clock.now());
  }

  now(): number {
    return this.clock.now();
  }

  get ticks(): number {
    return this.tickCount;
  }

  /** Стандартный контекст резолва для шин */
  ctx(player: string, tags: string[] = [], extra?: Record<string, unknown>): ResolveCtx {
    return { player, now: this.clock.now(), tags, extra };
  }

  /** Запуск тиков (при открытом табе). Повторный вызов безопасен. */
  start(): void {
    if (this.timer !== null) return;
    // пропущенные границы обрабатывает оффлайн-досчёт (catchUp), не старт тиков
    this.syncBoundaries(this.clock.now());
    this.timer = setInterval(() => this.tick(), this.config.tickMs);
  }

  /** Синхронизировать границы под момент времени (после catchUp/перелёта часов) */
  syncBoundaries(now: number): void {
    this.lastHourIndex = Math.floor(now / MS_HOUR);
    this.lastDayIndex = this.dayIndex(now);
  }

  stop(): void {
    if (this.timer !== null) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  /** Подписка на каждый тик (для buff sweep, автосейва и т.п.) */
  onTick(listener: () => void): () => void {
    this.tickListeners.add(listener);
    return () => this.tickListeners.delete(listener);
  }

  /** Один тик ядра (можно вызывать вручную в debug) */
  tick(): void {
    this.tickCount++;
    const now = this.clock.now();
    this.bus.publish('time.minuteTick', { tick: this.tickCount, now });
    this.checkBoundaries(now, false);
    for (const listener of this.tickListeners) {
      try {
        listener();
      } catch (e) {
         
        console.error('[TimeService] tick-listener упал:', e);
      }
    }
  }

  /** локальная дата ISO (YYYY-MM-DD) в часовом поясе игрока */
  localDateISO(ms: number): string {
    const d = new Date(ms);
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
  }

  // ---------------------------------------------------------------- internals

  private resetBoundaries(now: number): void {
    this.lastHourIndex = Math.floor(now / MS_HOUR);
    this.lastDayIndex = this.dayIndex(now);
  }

  private dayIndex(ms: number): number {
    // дней от epoch по локальному календарю
    const d = new Date(ms);
    const midnight = Date.UTC(d.getFullYear(), d.getMonth(), d.getDate());
    return Math.floor(midnight / MS_DAY);
  }

  private checkBoundaries(now: number, catchUp: boolean): void {
    const hourIndex = Math.floor(now / MS_HOUR);
    if (hourIndex > this.lastHourIndex) {
      const crossed = hourIndex - this.lastHourIndex;
      this.lastHourIndex = hourIndex;
      this.bus.publish('time.hourTick', { hourIndex, now, catchUp, crossed });
    }
    const dayIndex = this.dayIndex(now);
    if (dayIndex > this.lastDayIndex) {
      const crossed = dayIndex - this.lastDayIndex;
      this.lastDayIndex = dayIndex;
      this.bus.publish('time.dayTick', {
        dayIndex,
        now,
        catchUp,
        crossed,
        dateISO: this.localDateISO(now),
      });
    }
  }
}
