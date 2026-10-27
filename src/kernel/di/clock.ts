/**
 * Clock — единственный источник времени в ядре (02-BUSES §8, §13.6:
 * «фиксированные даты через DI-подмену now()»).
 * SystemClock — реальные часы; ManualClock — управляемое время (debug/offline/tests).
 */

export interface Clock {
  now(): number;
}

export class SystemClock implements Clock {
  now(): number {
    return Date.now();
  }
}

export class ManualClock implements Clock {
  private current: number;

  constructor(startMs: number = Date.now()) {
    this.current = startMs;
  }

  now(): number {
    return this.current;
  }

  set(ms: number): void {
    this.current = ms;
  }

  /** Сдвинуть время вперёд (или назад — защита от отмотки в catchUp) */
  advance(ms: number): void {
    this.current += ms;
  }
}

/**
 * DebugClock — реальные часы + наращиваемое смещение.
 * Живая игра ходит по реальному времени, но debug-команда `time +3h`
 * может сдвинуть его для проверки оффлайн-досчёта и дневных ротаций.
 * [FIX-0.1 H] смещение сохраняется в сейве (срез kernel.clock, saveVersion 2):
 * иначе баф, выданный в сдвинутом времени, после F5 «жил» 605ч.
 */
export class DebugClock implements Clock {
  private offsetMs = 0;

  now(): number {
    return Date.now() + this.offsetMs;
  }

  get offset(): number {
    return this.offsetMs;
  }

  advance(ms: number): void {
    this.offsetMs += ms;
  }

  /** Абсолютная установка смещения (загрузка сейва) — идемпотентна, в отличие от advance */
  setOffset(ms: number): void {
    this.offsetMs = ms;
  }
}
