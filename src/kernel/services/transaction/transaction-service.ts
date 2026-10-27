/**
 * TransactionService — атомарные операции (02-BUSES §9).
 * Единственный способ тратить/получать валюты и предметы:
 *   transact({ costs, grants, eventId }) → Result<Receipt>
 * Сначала проверяет ВСЁ (наличие), затем списывает и выдаёт ЦЕЛИКОМ или отказывает.
 * Публикует wallet.transaction и события гранта (item.acquired / item.consumed).
 * Модули не пишут в кошелёк напрямую.
 */
import type { EventBus } from '@/kernel/bus/event-bus/event-bus';
import type { ItemPort } from '@/kernel/services/item-stash/simple-stash';
import type { WalletService } from '@/kernel/services/wallet/wallet-service';
import type { CurrencyId, ID } from '@/shared/types/ids';
import type { Result } from '@/shared/types/result';
import { err, ok } from '@/shared/types/result';

export type Cost = { t: 'currency'; id: CurrencyId; qty: number } | { t: 'item'; defId: ID; qty: number };
export type Grant = Cost;

export interface TransactionRequest {
  costs?: Cost[];
  grants?: Grant[];
  /** id события/повода: 'shop.buy', 'debug.give'... */
  eventId: string;
  reason?: string;
}

export interface TransactionReceipt {
  eventId: string;
  costs: { t: 'currency' | 'item'; id: string; qty: number }[];
  grants: { t: 'currency' | 'item'; id: string; qty: number }[];
  at: number;
}

export interface TransactionDeps {
  wallet: WalletService;
  items: ItemPort;
  bus: EventBus;
  now(): number;
}

export class TransactionService {
  private readonly wallet: WalletService;
  private items: ItemPort;
  private readonly bus: EventBus;
  private readonly now: () => number;

  constructor(deps: TransactionDeps) {
    this.wallet = deps.wallet;
    this.items = deps.items;
    this.bus = deps.bus;
    this.now = deps.now;
  }

  /** Сменить порт предметов (M02 зарегистрирует полноценный инвентарь) */
  setItemPort(items: ItemPort): void {
    this.items = items;
  }

  transact(req: TransactionRequest): Result<TransactionReceipt> {
    const costs = req.costs ?? [];
    const grants = req.grants ?? [];

    // --- 1. Проверка: всё или ничего
    const currencyCosts = new Map<CurrencyId, number>();
    const itemCosts = new Map<ID, number>();
    for (const c of costs) {
      if (c.qty <= 0) continue;
      if (c.t === 'currency') {
        currencyCosts.set(c.id, (currencyCosts.get(c.id) ?? 0) + c.qty);
      } else {
        itemCosts.set(c.defId, (itemCosts.get(c.defId) ?? 0) + c.qty);
      }
    }
    for (const [id, qty] of currencyCosts) {
      if (!this.wallet.has(id, qty)) {
        return this.reject(req, `не хватает ${id}: есть ${this.wallet.get(id)}, нужно ${qty}`);
      }
    }
    for (const [defId, qty] of itemCosts) {
      const have = this.items.count(defId);
      if (have < qty) {
        return this.reject(req, `не хватает предметов ${defId}: есть ${have}, нужно ${qty}`);
      }
    }

    // --- 2. Применение: сначала предметы, затем валюты. [FIX-0.1 I] отказ любой
    //        позиции ОТКАТЫВАЕТ уже применённое — контракт «байт-в-байт» (02-BUSES §9).
    //        События (item.consumed/grants/wallet.transaction) стреляют только ПОСЛЕ
    //        успешного применения всех позиций — при откате не публикуются вовсе.
    const appliedItemCosts: Array<{ defId: ID; qty: number }> = [];
    for (const [defId, qty] of itemCosts) {
      const r = this.items.remove(defId, qty);
      if (!r.ok) {
        for (const done of appliedItemCosts) this.items.add(done.defId, done.qty);
        return this.reject(req, r.error); // защита от кривых портов (M02)
      }
      appliedItemCosts.push({ defId, qty });
    }
    for (const [id, qty] of currencyCosts) this.wallet.spend(id, qty);
    for (const [defId, qty] of itemCosts) {
      this.bus.publish('item.consumed', { defId, qty, source: req.eventId });
    }
    const grantLog: TransactionReceipt['grants'] = [];
    for (const g of grants) {
      if (g.qty <= 0) continue;
      if (g.t === 'currency') {
        this.wallet.grant(g.id, g.qty);
        grantLog.push({ t: 'currency', id: g.id, qty: g.qty });
      } else {
        this.items.add(g.defId, g.qty);
        grantLog.push({ t: 'item', id: g.defId, qty: g.qty });
        this.bus.publish('item.acquired', { defId: g.defId, qty: g.qty, source: req.eventId });
      }
    }

    const costLog: TransactionReceipt['costs'] = [
      ...[...currencyCosts.entries()].map(([id, qty]) => ({ t: 'currency' as const, id, qty })),
      ...[...itemCosts.entries()].map(([defId, qty]) => ({ t: 'item' as const, id: defId, qty })),
    ];

    const receipt: TransactionReceipt = {
      eventId: req.eventId,
      costs: costLog,
      grants: grantLog,
      at: this.now(),
    };
    this.bus.publish('wallet.transaction', {
      eventId: req.eventId,
      ok: true,
      costs: receipt.costs,
      grants: receipt.grants,
      reason: req.reason,
    });
    return ok(receipt);
  }

  private reject(req: TransactionRequest, message: string): Result<TransactionReceipt> {
    // отказ штатный: ничего не списано, событие не публикуем (02-BUSES §9)
    return err(`${req.eventId}: транзакция отклонена — ${message}`);
  }
}
