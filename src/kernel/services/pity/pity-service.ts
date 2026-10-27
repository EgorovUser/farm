/**
 * PityService — универсальные именованные счётчики жалости (02-BUSES §7).
 * Ядро ТОЛЬКО хранит; правила сброса задаёт потребитель (M10: bump при провале,
 * reset при успехе). Ключ = ownerId + '|' + key.
 */

export interface PityEntry {
  ownerId: string;
  key: string;
  value: number;
}

export class PityService {
  private readonly counters = new Map<string, number>();

  private static k(ownerId: string, key: string): string {
    return `${ownerId}|${key}`;
  }

  get(ownerId: string, key: string): number {
    return this.counters.get(PityService.k(ownerId, key)) ?? 0;
  }

  /** Увеличить на step (по умолчанию 1), вернуть новое значение. Ниже 0 не бывает. */
  bump(ownerId: string, key: string, step = 1): number {
    const k = PityService.k(ownerId, key);
    const next = Math.max(0, (this.counters.get(k) ?? 0) + step);
    this.counters.set(k, next);
    return next;
  }

  reset(ownerId: string, key: string): void {
    this.counters.delete(PityService.k(ownerId, key));
  }

  resetOwner(ownerId: string): number {
    let removed = 0;
    for (const k of [...this.counters.keys()]) {
      if (k.startsWith(`${ownerId}|`)) {
        this.counters.delete(k);
        removed++;
      }
    }
    return removed;
  }

  entries(): PityEntry[] {
    return [...this.counters.entries()].map(([k, value]) => {
      const [ownerId, key] = k.split('|');
      return { ownerId, key, value };
    });
  }

  // ------------------------------------------------------------- save slice

  saveState(): unknown {
    return { counters: [...this.counters.entries()] };
  }

  loadState(data: unknown): void {
    this.counters.clear();
    const parsed = data as { counters?: [string, number][] } | null;
    if (!parsed?.counters || !Array.isArray(parsed.counters)) return;
    for (const [k, v] of parsed.counters) {
      if (typeof k === 'string' && typeof v === 'number' && Number.isFinite(v)) {
        this.counters.set(k, Math.max(0, v));
      }
    }
  }
}
