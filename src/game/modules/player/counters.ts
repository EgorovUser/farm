/**
 * Счётчики ядра (M01 §6): { id, event, filter?, valueKey? } — данные.
 * Хранилище — StatsService (срез kernel.stats), код не пишется на новую
 * статистику (карточка: «Счётчик = данные»). Фильтр — точное совпадение
 * плоских полей пейлоада; valueKey — числовое поле для суммирования
 * (объёмы торгов), отсутствие поля или не-число → +1 (П5, рядовой случай).
 */
import type { EventBus } from '@/kernel/bus/event-bus/event-bus';
import type { StatsService } from '@/kernel/services/stats/stats-service';
import type { CounterDef } from '@/content/player/counters';

export interface CountersDeps {
  bus: EventBus;
  stats: StatsService;
  table: readonly CounterDef[];
}

export class CountersEngine {
  private readonly deps: CountersDeps;

  constructor(deps: CountersDeps) {
    this.deps = deps;
  }

  wire(): () => void {
    // одна подписка на каждое УНИКАЛЬНОЕ событие конфига
    const events = [...new Set(this.deps.table.map((d) => d.event))];
    const offs = events.map((event) =>
      this.deps.bus.subscribe(event, (payload) => this.onEvent(event, payload)),
    );
    return () => offs.forEach((off) => off());
  }

  private onEvent(event: string, payload: unknown): void {
    const record = (payload ?? {}) as Record<string, unknown>;
    for (const def of this.deps.table) {
      if (def.event !== event) continue;
      if (def.filter && !matchesFilter(def.filter, record)) continue;
      this.deps.stats.bump(def.id, readValue(def, record));
    }
  }
}

function matchesFilter(
  filter: Record<string, string | number | boolean>,
  record: Record<string, unknown>,
): boolean {
  for (const [key, expected] of Object.entries(filter)) {
    if (record[key] !== expected) return false;
  }
  return true;
}

/** [РАСШИРЕНИЕ] valueKey: нет поля в пейлоаде или не число → +1 (П5, рядовой случай) */
function readValue(def: CounterDef, record: Record<string, unknown>): number {
  if (def.valueKey === undefined) return 1;
  const raw = record[def.valueKey];
  return typeof raw === 'number' && Number.isFinite(raw) ? raw : 1;
}
