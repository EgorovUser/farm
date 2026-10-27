/**
 * SellService M02.3 (D34): продажа `inv sell <defId> [qty=1]`.
 *
 *  - валидность: defId есть в контенте, qty — целое ≥ 1;
 *  - состояние: незэкипированных единиц ≥ qty (экипированные защищены D30 —
 *    отказ «сначала снимите»; пустой инвентарь/qty > наличного — отказ
 *    с числами, состояние не тронуто);
 *  - цена — ТОЛЬКО PriceBus (§5 02-BUSES): по ФАКТИЧЕСКИ изымаемым единицам
 *    (план D25 худшие-вперёд считает хранилище), множители тира/редкости —
 *    внутри base (П2), потребитель их не знает; партия может быть разнородной
 *    по качеству — цена = Σ по чанкам плана;
 *  - операция одним transact: грант золота + изъятие предмета (ЦЕЛИКОМ или
 *    отказ); ядро публикует wallet.transaction (канон денег) и item.consumed
 *    для cost-позиции (замороженное поведение ядра, как у прежнего debug.sell);
 *  - событие `item.sold { defId, qty, gold }` — ровно одно на операцию;
 *    iid/quality/price НЕ в payload (D34(4): партия разнородна, канон
 *    состояния — API); [FIX-PHASE-2 · 4.6 · N6] аддитивное поле `gold` =
 *    сумма гранта (обогащение payload по маркеру карточки M15 §3 — Task 29,
 *    вариант (а): владелец M02 добавляет поле, счётчик sell.gold — данными);
 *    байт-строгие оракулы M02 обновлены ПОИМЁННО (не молча);
 *  - модуль в кошелёк НЕ пишет (инвариант M01 §8.1 — шпион-тест зелёный):
 *    золото приходит грантом транзакции.
 *
 * [QUESTION · бриф §2.4] оракул «для D-тира сходится с регрессом sell 72»
 * арифметически не сходится: кирка D = 120×1.5×0.7×0.4 = 50.4 → 50; 72 — цена
 * БЕЗ тира (качество-множитель 1: C или не указан) — так считал debug.sell
 * фазы 0 (без качества). Регресс «sell 72» остался зелёным для СТАРОЙ команды
 * (она не тронута); inv sell честно применяет множитель тира из данных.
 */
import type { EventBus } from '@/kernel/bus/event-bus/event-bus';
import type { PriceBus, PriceCtx } from '@/kernel/bus/price-bus/price-bus';
import type { TransactionService } from '@/kernel/services/transaction/transaction-service';
import type { ID, QualityTier } from '@/shared/types/ids';
import { err, ok, type Result } from '@/shared/types/result';
import type { ItemDef } from '@/content/items/items';
import { planRemoval } from './logic';
import { equippedIidSet } from './equipment';
import type { InventoryState } from './state';

export interface SellChunk {
  tier: QualityTier;
  units: number;
  unitPrice: number;
}

export interface SellReceipt {
  defId: ID;
  qty: number;
  gold: number;
  chunks: SellChunk[];
}

export interface SellDeps {
  tryItem(defId: ID): ItemDef | undefined;
  priceBus: PriceBus;
  transaction: TransactionService;
  bus: EventBus;
  priceCtx(): PriceCtx;
  getState(): InventoryState;
  markDirty(): void;
  /** [M10.1 · шов §4.5] эффективный тир (R2: тир + floor(L/10)) — точка
   *  входа заточки в цену (качество входит в base множителем — через шину,
   *  не самосчитывание); дефолт — тир записи (инвариант прежнего поведения) */
  effectiveTierOf?(iid: ID, tier: QualityTier): QualityTier;
}

export class SellService {
  private readonly deps: SellDeps;

  constructor(deps: SellDeps) {
    this.deps = deps;
  }

  sell(defId: ID, qtyRaw: number): Result<SellReceipt> {
    // --- валидность
    const def = this.deps.tryItem(defId);
    if (!def) return err(`предмет "${defId}" не найден в content/items`);
    const qty = Math.floor(qtyRaw);
    if (!(qty >= 1)) return err('количество должно быть целым и положительным');

    // --- состояние: план изъятия (D25 худшие-вперёд, экипированные защищены);
    // отказ называет причину с числами, транзакция не начинается
    const state = this.deps.getState();
    const plan = planRemoval(state.items, defId, qty, equippedIidSet(state));
    if (!plan.ok) return err(plan.error);

    // --- цена по фактическим изъятиям (тот же детерминированный план, что
    // выберет порт при transact: состояние между расчётом и транзакцией не меняется)
    const chunks: SellChunk[] = [];
    let gold = 0;
    for (const take of plan.takes) {
      const rec = state.items[take.index];
      // [M10.1 · шов §4.5] эффективный тир заточки — в base цены (множителем PriceBus)
      const tier = this.deps.effectiveTierOf ? this.deps.effectiveTierOf(rec.iid, rec.quality.tier) : rec.quality.tier;
      const unit = this.deps.priceBus.sellPrice(def, {
        qualityTier: tier,
        ctx: this.deps.priceCtx(),
      }).final;
      gold += unit * take.take;
      const prev = chunks[chunks.length - 1];
      if (prev && prev.tier === tier && prev.unitPrice === unit) {
        prev.units += take.take;
      } else {
        chunks.push({ tier, units: take.take, unitPrice: unit });
      }
    }

    // --- операция одним transact: грант золота + изъятие (ЦЕЛИКОМ или отказ)
    const r = this.deps.transaction.transact({
      costs: [{ t: 'item', defId, qty }],
      grants: [{ t: 'currency', id: 'gold', qty: gold }],
      eventId: 'inventory.sell',
      reason: `продажа ×${qty} за ${gold}`,
    });
    if (!r.ok) return err(r.error);

    // --- событие ровно одно (iid/quality/price НЕ в payload, D34(4));
    // [FIX-PHASE-2 · 4.6 · N6] gold — сумма гранта (аддитивно, маркер M15 §3)
    this.deps.bus.publish('item.sold', { defId, qty, gold });
    this.deps.markDirty();
    return ok({ defId, qty, gold, chunks });
  }
}
