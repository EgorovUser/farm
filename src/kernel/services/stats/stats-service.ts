/**
 * StatsService — счётчики ядра (манифесты: statsCounters).
 * Ключи — точечные id вида 'farm.harvest.total'. Чистое хранилище,
 * триггеры роста живут на событиях EventBus (02-BUSES §4).
 */

export class StatsService {
  private counters = new Map<string, number>();

  get(id: string): number {
    return this.counters.get(id) ?? 0;
  }

  bump(id: string, by = 1): number {
    const next = this.get(id) + by;
    this.counters.set(id, next);
    return next;
  }

  reset(id: string): void {
    this.counters.delete(id);
  }

  keys(prefix?: string): string[] {
    return [...this.counters.keys()]
      .filter((k) => (prefix ? k.startsWith(prefix) : true))
      .sort();
  }

  snapshot(): Array<{ id: string; value: number }> {
    return [...this.counters.entries()]
      .map(([id, value]) => ({ id, value }))
      .sort((a, b) => a.id.localeCompare(b.id));
  }

  // ------------------------------------------------------------- save slice

  saveState(): unknown {
    return { counters: [...this.counters.entries()] };
  }

  loadState(data: unknown): void {
    this.counters.clear();
    const parsed = data as { counters?: [string, number][] } | null;
    if (!parsed?.counters || !Array.isArray(parsed.counters)) return;
    for (const [id, value] of parsed.counters) {
      if (typeof id === 'string' && typeof value === 'number' && Number.isFinite(value)) {
        this.counters.set(id, value);
      }
    }
  }
}
