/**
 * SimpleStash — минимальное хранилище предметов для ядра (фаза 0).
 * Реализует ItemPort для TransactionService. В фазе 1 M02 «Инвентарь» подменит
 * порт полноценной реализацией (слоты/стаки/качество) — ядро не изменится.
 * [РАСШИРЕНИЕ] Сам ItemPort/Stash не описан в ТЗ как отдельная сущность ядра —
 * следует из 02-BUSES §9 («валюты и предметы» в транзакциях).
 */
import type { ID } from '@/shared/types/ids';
import type { Result } from '@/shared/types/result';
import { err, ok } from '@/shared/types/result';

export interface ItemPort {
  count(defId: ID): number;
  add(defId: ID, qty: number): void;
  remove(defId: ID, qty: number): Result<void>;
}

export class SimpleStash implements ItemPort {
  private items = new Map<ID, number>();

  count(defId: ID): number {
    return this.items.get(defId) ?? 0;
  }

  add(defId: ID, qty: number): void {
    if (qty <= 0) return;
    this.items.set(defId, this.count(defId) + qty);
  }

  remove(defId: ID, qty: number): Result<void> {
    const have = this.count(defId);
    if (have < qty) return err(`предметов ${defId} нет: есть ${have}, нужно ${qty}`);
    this.items.set(defId, have - qty);
    return ok(undefined);
  }

  snapshot(): Array<{ defId: ID; qty: number }> {
    return [...this.items.entries()]
      .filter(([, qty]) => qty > 0)
      .map(([defId, qty]) => ({ defId, qty }))
      .sort((a, b) => a.defId.localeCompare(b.defId));
  }

  // ------------------------------------------------------------- save slice

  saveState(): unknown {
    return { items: [...this.items.entries()] };
  }

  loadState(data: unknown): void {
    this.items.clear();
    const parsed = data as { items?: [ID, number][] } | null;
    if (!parsed?.items || !Array.isArray(parsed.items)) return;
    for (const [defId, qty] of parsed.items) {
      if (typeof defId === 'string' && typeof qty === 'number' && Number.isFinite(qty)) {
        this.items.set(defId, Math.max(0, qty));
      }
    }
  }
}
