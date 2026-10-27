/**
 * Покупка M04 §5: priceBus.buyPrice → TransactionService → item.acquired +
 * shop.purchased. Все манипуляции — событиями и шинами (§5: «ни один другой
 * модуль не импортируется»): выдача предметов/роллов — колбэки app-слоя
 * (прецеденты D33/D38), вайрятся в bootstrap через ModuleRegistry (П4).
 *
 * Атомарность (приёмка §7 «нет денег/места — состояние не изменилось»):
 *   гейты → цена → ПРОБА вместимости (inventory.canAcquire, D23-канон) →
 *   ПРЕРОЛЛ ривенов (modforge.rollItem, чистая генерация) → ОПЛАТА
 *   (TransactionService, отказ = ничего не изменилось) → ВЫДАЧА
 *   (inventory.acquire; после пробы гарантирована) → применение роллов
 *   (inventory.setRolls) → декремент стока → shop.purchased.
 *
 * [DECISION · M04.1] преролл ДО оплаты: генерация роллов чиста (побочный
 * эффект — только честное событие modforge.rolled), а применение после
 * оплаты не смогло бы откатиться бесследно (item.acquired уже в ленте).
 * Валютные товары — атомарной транзакцией costs=[gold]+grants=[валюта].
 *
 * [DECISION · M04.1]Emergency-предохранитель: acquire после зелёной пробы
 * теоретически неудачен (расхождение проба/состояние) — возврат золота
 * компенсирующей транзакцией с eventId 'shop.buy.refund' (объявленный
 * путь, в живой игре недостижим).
 */
import type { EventBus } from '@/kernel/bus/event-bus/event-bus';
import type { PriceBus, PriceCtx, PricedItemDef } from '@/kernel/bus/price-bus/price-bus';
import type { StatBus } from '@/kernel/bus/stat-bus/stat-bus';
import type { ResolveCtx } from '@/kernel/bus/stat-bus/modifier';
import type { TransactionService } from '@/kernel/services/transaction/transaction-service';
import type { ShopTable } from '@/content/balance/shop';
import type { ShopPoolEntry } from '@/content/shopPool';
import type { ItemDef } from '@/content/items/items';
import type { Condition, ConditionCtx } from '@/shared/types/requirement';
import { checkCondition } from '@/shared/utils/condition-check';
import type { ID } from '@/shared/types/ids';
import type { RolledModEntry } from '@/shared/types/rolled-mod';
import { err, ok, type Result } from '@/shared/types/result';
import type { ShopState } from './state';

export interface DeliverReceipt {
  iids: ID[];
  entries: number;
  quality: { tier: string; value: number };
}

export interface BuyReceipt {
  id: ID;
  kind: 'item' | 'currency';
  qty: number;
  unitPrice: number;
  total: number;
  /** скидка завоза на слоте, % (если была) */
  discount?: number;
  /** созданные записи (для gear — носители ривен-роллов, C4) */
  iids?: ID[];
}

export interface PurchaseDeps {
  table: ShopTable;
  pool: readonly ShopPoolEntry[];
  tryItem(defId: ID): ItemDef | undefined;
  priceBus: PriceBus;
  transaction: TransactionService;
  bus: EventBus;
  statBus: StatBus;
  /** стандартный ResolveCtx (гейты/резолвы) */
  ctx(): ResolveCtx;
  priceCtx(): PriceCtx;
  /** уровень/навыки игрока — player.ctxExtras() через ModuleRegistry (П4) */
  gateExtras(): Record<string, unknown>;
  itemCount(defId: ID): number;
  getState(): ShopState;
  setState(s: ShopState): void;
  markDirty(): void;
  /** ротация дня (вызывается первым — сток гарантируется) */
  ensureStock(): void;
  /** монотонный счётчик именованных стримов выдачи shop:issue:N (C4) */
  issueSeq(): number;
  /** app-слой: inventory.acquire (D23; после пробы — гарантирован) */
  deliverItem?(defId: ID, qty: number, source: string): Result<DeliverReceipt>;
  /** app-слой: inventory.canAcquire — проба вместимости до оплаты */
  probeCapacity?(defId: ID, qty: number): Result<{ fits: boolean; free: number; newEntries: number }>;
  /** app-слой: modforge.rollItem — стартовые роллы покупки (C4) */
  rollItem?(defId: ID, streamKey: string): Result<{ rolls: RolledModEntry[] }>;
  /** app-слой: inventory.setRolls — применение партии (C4) */
  applyRolls?(iid: ID, rolls: RolledModEntry[]): Result<unknown>;
}

/** Читаемый текст гейта §4 («Откроется: уровень 15») — данные для UI/debug */
export function gateText(cond: Condition): string {
  switch (cond.t) {
    case 'playerLevel':
      return `Откроется: уровень ${cond.level}`;
    case 'skill':
      return `Нужен навык ${cond.skill} ${cond.level}`;
    case 'achievement':
      return `Нужна ачивка ${cond.id}`;
    case 'flag':
      return `Не открыто: ${cond.flag}`;
    default:
      return `Условие: ${cond.t}`;
  }
}

export class PurchaseService {
  private readonly deps: PurchaseDeps;

  constructor(deps: PurchaseDeps) {
    this.deps = deps;
  }

  private gateCtx(): ConditionCtx {
    const extra = this.deps.gateExtras();
    const resolveCtx = this.deps.ctx();
    return {
      tags: [],
      stat: (stat) => this.deps.statBus.resolve({ stat, ctx: { ...resolveCtx, extra } }),
      hasFlag: (flag) => Boolean(extra[`flag:${flag}`]),
      skillLevel: (skill) => Number(extra[`skill:${skill}`] ?? 0),
      playerLevel: Number(extra['player:level'] ?? 0),
      itemCount: (defId) => this.deps.itemCount(defId),
      hasAchievement: (id) => Boolean(extra[`achievement:${id}`]),
    };
  }

  /** Гейты покупки §4: unlock строки пула (роллящиеся) + unlock ItemDef
   *  (видимость в каталогах). requirements (гейты ИСПОЛЬЗОВАНИЯ) покупку
   *  не блокируют — меч 5-го уровня можно купить заранее (M02 откажет в
   *  экипировке с причиной). */
  private gateBlock(id: ID): string | null {
    const ctx = this.gateCtx();
    const poolEntry = this.deps.pool.find((e) => e.id === id);
    if (poolEntry?.unlock && !checkCondition(poolEntry.unlock, ctx)) {
      return `${id}: ${gateText(poolEntry.unlock)}`;
    }
    const def = this.deps.tryItem(id);
    if (def?.unlock && !checkCondition(def.unlock, ctx)) {
      return `${id}: ${gateText(def.unlock)}`;
    }
    return null;
  }

  /** Синтетический def для валютного товара: конвейер скидок PriceBus един
   *  для всех товаров (таргет провайдеров — строковый id, 04-DISCOUNTS §3) */
  private pricedOf(id: ID, kind: 'item' | 'currency'): Result<PricedItemDef> {
    if (kind === 'item') {
      const def = this.deps.tryItem(id);
      if (!def) return err(`предмет "${id}" не найден в реестре`);
      return ok(def);
    }
    const price = this.deps.table.currencyGoods[id];
    if (price === undefined) return err(`валютный товар "${id}" без цены (currencyGoods)`);
    return ok({ id, basePrice: price, rarity: 'common' });
  }

  buy(id: ID, qtyReq = 1): Result<BuyReceipt> {
    this.deps.ensureStock();
    const state = this.deps.getState();
    const stock = state.stock;
    if (!stock) return err('сток недоступен (ротация не выполнена)');
    const entry = stock.entries.find((e) => e.id === id);
    if (!entry) return err(`"${id}" нет в сегодняшнем завозе (shop.stock)`);
    if (entry.qty < 1) return err(`"${id}" распродано на сегодня — новый завоз в 00:00`);
    const qty = Math.floor(qtyReq);
    if (qty < 1) return err('количество должно быть целым и положительным');
    if (qty > entry.qty) return err(`"${id}": в стоке ${entry.qty}, запрошено ${qty}`);

    // --- гейты §4 (причина читаема, П6)
    const gate = this.gateBlock(id);
    if (gate) return err(gate);

    // --- цена (PriceBus: уровень магазина + скидка завоза + прочие источники)
    const pricedR = this.pricedOf(id, entry.kind);
    if (!pricedR.ok) return err(pricedR.error);
    const breakdown = this.deps.priceBus.buyPrice(pricedR.value, { ctx: this.deps.priceCtx() });
    const unitPrice = breakdown.final;
    const total = unitPrice * qty;

    // --- преролл ривенов (C4: «купил кирку — у неё роллы», именованный стрим)
    let rolls: RolledModEntry[] | null = null;
    if (entry.kind === 'item') {
      const def = this.deps.tryItem(id);
      if (def?.modSlots) {
        if (!this.deps.rollItem || !this.deps.applyRolls || !this.deps.deliverItem) {
          return err('каналы выдачи/роллов не подключены (app-слой: bootstrap)');
        }
        const rollR = this.deps.rollItem(id, `shop:issue:${this.deps.issueSeq()}`);
        if (!rollR.ok) return err(rollR.error);
        rolls = rollR.value.rolls;
      }
    }

    // --- вместимость (D23-канон; консервативная проба) — только предметы
    if (entry.kind === 'item') {
      if (!this.deps.probeCapacity) return err('канал вместимости не подключён (app-слой)');
      const probe = this.deps.probeCapacity(id, qty);
      if (!probe.ok) return err(probe.error);
      if (!probe.value.fits) {
        return err(`инвентарь полон: нужно записей ${probe.value.newEntries}, свободно ${probe.value.free}`);
      }
    }

    // --- оплата + выдача
    let iids: ID[] | undefined;
    if (entry.kind === 'currency') {
      const pay = this.deps.transaction.transact({
        costs: [{ t: 'currency', id: 'gold', qty: total }],
        grants: [{ t: 'currency', id: id as never, qty }],
        eventId: 'shop.buy',
        reason: `покупка ${id} ×${qty} по ${unitPrice}`,
      });
      if (!pay.ok) return err(pay.error);
    } else {
      const pay = this.deps.transaction.transact({
        costs: [{ t: 'currency', id: 'gold', qty: total }],
        grants: [],
        eventId: 'shop.buy',
        reason: `покупка ${id} ×${qty} по ${unitPrice}`,
      });
      if (!pay.ok) return err(pay.error);
      const deliver = this.deps.deliverItem!(id, qty, 'shop.buy');
      if (!deliver.ok) {
        // [DECISION] emergency-предохранитель: после зелёной пробы недостижимо;
        // золото возвращается компенсирующей транзакцией (объявленный путь)
        this.deps.transaction.transact({
          grants: [{ t: 'currency', id: 'gold', qty: total }],
          eventId: 'shop.buy.refund',
          reason: `аварийный возврат: выдача ${id} не удалась`,
        });
        return err(deliver.error);
      }
      iids = deliver.value.iids;
      if (rolls !== null) {
        for (const iid of deliver.value.iids) {
          const applied = this.deps.applyRolls!(iid, rolls);
          if (!applied.ok) {
            // партия валидна по построению (rollItem); отказ здесь — инфраструктурный
            return err(`роллы не применены к ${iid}: ${applied.error} (предмет выдан)`);
          }
        }
      }
    }

    // --- декремент стока + событие
    const entries = stock.entries.map((e) => (e.id === id ? { ...e, qty: e.qty - qty } : e));
    this.deps.setState({ ...state, stock: { ...stock, entries } });
    this.deps.markDirty();
    const receipt: BuyReceipt = {
      id,
      kind: entry.kind,
      qty,
      unitPrice,
      total,
      ...(entry.discount !== undefined ? { discount: entry.discount } : {}),
      ...(iids !== undefined ? { iids } : {}),
    };
    this.deps.bus.publish('shop.purchased', { ...receipt, source: 'shop.buy' });
    return ok(receipt);
  }
}
