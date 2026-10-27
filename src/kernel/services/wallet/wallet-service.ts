/**
 * WalletService — хранилище валют/ресурсов (M01 накинет сверху правила).
 * Молчит сам по себе: события публикует ТОЛЬКО TransactionService (02-BUSES §9).
 */
import type { CurrencyId } from '@/shared/types/ids';

export class WalletService {
  private balances = new Map<CurrencyId, number>();

  get(id: CurrencyId): number {
    return this.balances.get(id) ?? 0;
  }

  has(id: CurrencyId, qty: number): boolean {
    return this.get(id) >= qty;
  }

  /** Только через TransactionService. Возвращает новый баланс. */
  grant(id: CurrencyId, qty: number): number {
    const next = this.get(id) + qty;
    this.balances.set(id, next);
    return next;
  }

  /** Только через TransactionService. Предполагается, что проверка уже была. */
  spend(id: CurrencyId, qty: number): number {
    const next = this.get(id) - qty;
    this.balances.set(id, next);
    return next;
  }

  snapshot(): Array<{ id: CurrencyId; qty: number }> {
    return [...this.balances.entries()]
      .filter(([, qty]) => qty !== 0)
      .map(([id, qty]) => ({ id, qty }))
      .sort((a, b) => a.id.localeCompare(b.id));
  }

  // ------------------------------------------------------------- save slice

  saveState(): unknown {
    return { balances: [...this.balances.entries()] };
  }

  loadState(data: unknown): void {
    this.balances.clear();
    const parsed = data as { balances?: [CurrencyId, number][] } | null;
    if (!parsed?.balances || !Array.isArray(parsed.balances)) return;
    for (const [id, qty] of parsed.balances) {
      if (typeof id === 'string' && typeof qty === 'number' && Number.isFinite(qty)) {
        this.balances.set(id, qty);
      }
    }
  }
}
