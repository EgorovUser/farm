/**
 * OfflineCatchup — оффлайн-досчёт (02-BUSES §8).
 *
 * catchUp(lastSeen → now):
 *   (1) защита от отмотки: lastSeen > now → lastSeen = now;
 *   (2) часовые правила циклом, кап 72 итерации;
 *   (3) дневные правила циклом, кап 14 итераций;
 *   (4) absolute-таймеры пересчитываются самими модулями (grownAt в прошлом = READY);
 *   (5) собрать offlineReport + опубликовать time.catchUpDone.
 *
 * Минутные тики НЕ проигрываются (72ч = 259k событий) — абсолютные даты
 * делают их ненужными.
 */
import type { EventBus } from '@/kernel/bus/event-bus/event-bus';
import type { TimeConfig } from './time-service';
import { MS_DAY, MS_HOUR } from '@/shared/utils/math';

export interface OfflineReport {
  from: number;
  to: number;
  awayMs: number;
  hoursFired: number;
  hoursNeeded: number;
  hoursCapped: boolean;
  daysFired: number;
  daysNeeded: number;
  daysCapped: boolean;
  minuteTicksSkipped: number;
}

export class OfflineCatchup {
  private readonly bus: EventBus;
  private readonly config: TimeConfig;

  constructor(bus: EventBus, config: TimeConfig) {
    this.bus = bus;
    this.config = config;
  }

  run(from: number, to: number): OfflineReport {
    if (from > to) from = to; // защита от отмотки часов
    const awayMs = to - from;

    // --- часовые границы: первая полная граница после from
    const hoursNeeded = this.countHourBoundaries(from, to);
    const hoursFired = Math.min(hoursNeeded, this.config.catchupHourCap);
    let hourCursor = from;
    for (let i = 0; i < hoursFired; i++) {
      hourCursor = this.nextHourBoundary(hourCursor);
      this.bus.publish('time.hourTick', {
        hourIndex: Math.floor(hourCursor / MS_HOUR),
        now: hourCursor,
        catchUp: true,
      });
    }

    // --- дневные границы: первый локальный полдень... нет, полночь после from
    const daysNeeded = this.countDayBoundaries(from, to);
    const daysFired = Math.min(daysNeeded, this.config.catchupDayCap);
    let dayCursor = from;
    for (let i = 0; i < daysFired; i++) {
      dayCursor = this.nextLocalMidnight(dayCursor);
      this.bus.publish('time.dayTick', {
        dayIndex: Math.floor(dayCursor / MS_DAY),
        now: dayCursor,
        catchUp: true,
        dateISO: this.localDateISO(dayCursor),
      });
    }

    const report: OfflineReport = {
      from,
      to,
      awayMs,
      hoursFired,
      hoursNeeded,
      hoursCapped: hoursNeeded > hoursFired,
      daysFired,
      daysNeeded,
      daysCapped: daysNeeded > daysFired,
      minuteTicksSkipped: Math.floor(awayMs / this.config.tickMs),
    };

    this.bus.publish('time.catchUpDone', {
      from,
      to,
      hours: hoursFired,
      days: daysFired,
      hoursCapped: report.hoursCapped,
      daysCapped: report.daysCapped,
    });
    return report;
  }

  // ---------------------------------------------------------------- internals

  private nextHourBoundary(ms: number): number {
    return (Math.floor(ms / MS_HOUR) + 1) * MS_HOUR;
  }

  private countHourBoundaries(from: number, to: number): number {
    if (to <= from) return 0;
    return Math.max(0, Math.floor(to / MS_HOUR) - Math.floor(from / MS_HOUR));
  }

  private nextLocalMidnight(ms: number): number {
    const d = new Date(ms);
    return new Date(d.getFullYear(), d.getMonth(), d.getDate() + 1, 0, 0, 0, 0).getTime();
  }

  private countDayBoundaries(from: number, to: number): number {
    if (to <= from) return 0;
    let count = 0;
    let cursor = from;
    // безопасный цикл: максимум ~кол-во дней в интервале, но с аварийным тормозом
    let guard = 0;
    while (cursor < to && guard < 4000) {
      const next = this.nextLocalMidnight(cursor);
      if (next > to) break;
      cursor = next;
      count++;
      guard++;
    }
    return count;
  }

  private localDateISO(ms: number): string {
    const d = new Date(ms);
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
  }
}
