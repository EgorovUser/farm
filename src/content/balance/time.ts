/**
 * Время (02-BUSES §8): тик ядра, автосейв, капы оффлайн-досчёта.
 */
import type { TimeConfig } from '@/kernel/time/time-service';

export const TIME_TABLE: TimeConfig = {
  /** 1 игровая минута = 1 реальная секунда */
  tickMs: 1000,
  /** автосейв раз в 30 с */
  autosaveMs: 30_000,
  /** оффлайн: максимум 72 часовых правила */
  catchupHourCap: 72,
  /** оффлайн: максимум 14 дневных правил */
  catchupDayCap: 14,
};
