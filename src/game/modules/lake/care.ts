/**
 * LakeCare (M08.1): уход и экономика озера (бриф F4/F8; карточка §3) —
 * выпуск/кормление/лечение/чистка/сбор + покупка Корма. Dev-форсы — dev.ts.
 *
 * Изоляция (01 §5–§7): модуль не импортирует другие модули; инвентарь —
 * ТОЛЬКО через ModuleRegistry-каналы app-слоя (listInventory → inventory.list
 * D30; removeItem → inventory.remove — канон изъятия M02 worst-first;
 * deliverFish → inventory.add с явным качеством; probeCapacity →
 * inventory.canAcquire D23); Корм/золото/лекарство — ТОЛЬКО TransactionService.
 *
 * Выпуск lake.release <iid>: качество переносится (тир из iid-записи);
 * изъятие — канон M02 (worst-first, M07-OBS-1/D30-шов — владелец M02-сеанс,
 * здесь существующий канал). Икра — НЕ предмет (очередь среза, F8).
 * Кормление — ВСЕХ голодных одним действием [DECISION брифа F4]: Корм ×N
 * атомарно, энергия 2; нехватка → отказ, состояние цело, событий нет.
 * Лечение — animal_remedy ×1 (живой деф M09/M04-контура, НЕ создаётся);
 * здоровая → «лечить нечего» (прецедент pen.heal). Чистка — «Сачок» +15
 * (кап 100, энергия 3; до фазы 6 auto-score одношагово [DECISION]).
 * Сбор — acquire-канон M02 с источником-тегом lake (качество переносится);
 * продажа — штатный sell-канон (PriceBus 40%).
 */
import type { EventBus } from '@/kernel/bus/event-bus/event-bus';
import type { TransactionService } from '@/kernel/services/transaction/transaction-service';
import type { TimeService } from '@/kernel/time/time-service';
import type { SaveDirector } from '@/kernel/save/save-director';
import type { ContentRegistry } from '@/kernel/content/content-registry';
import type { StatId, ID, QualityTier } from '@/shared/types/ids';
import type { Result } from '@/shared/types/result';
import { err, ok } from '@/shared/types/result';
import type { LakeTable } from '@/content/balance/lake';
import type { FishDef } from '@/content/fishing/fish';
import type { LakeGroup, LakeState } from './state';
import { activeLakeOf, canonicalSlot, groupOf, withGroup } from './state';
import { isHungry, cleanWater } from './logic/water';

export interface InventoryEntryLike {
  iid: ID;
  defId: ID;
  qty: number;
  quality: { tier: QualityTier; value: number };
}

export interface LakeCareDeps {
  bus: EventBus;
  transaction: TransactionService;
  time: TimeService;
  save: SaveDirector;
  content: ContentRegistry;
  table: LakeTable;
  getState(): LakeState;
  setState(s: LakeState): void;
  withEnergy(stat: StatId, action: () => Result<unknown>, reason?: string): Result<unknown>;
  listInventory(): InventoryEntryLike[];
  removeItem(defId: ID, qty: number, source: string): Result<unknown>;
  deliverFish(defId: ID, tier: QualityTier, value: number, qty: number, source: string): Result<unknown>;
  probeCapacity(defId: ID, qty: number): Result<{ fits: boolean; free: number; newEntries: number }>;
  /** дефы рыб (пруд+река через ContentRegistry — чтение общих таблиц, П4 п.6) */
  fishOf(fishId: ID): FishDef | undefined;
  /** ленивая переоценка (икра/пары) до/после действий */
  sweep(): void;
}

export class LakeCare {
  private readonly d: LakeCareDeps;

  constructor(deps: LakeCareDeps) {
    this.d = deps;
  }

  /** F4: выпуск пойманной рыбы из инвентаря в свободный слот (качество
   *  переносится; посторонний предмет/полное озеро — отказ с причиной) */
  release(iid: string): Result<{ slotIdx: number; fishId: ID; quality: QualityTier }> {
    this.d.sweep();
    const entry = this.d.listInventory().find((i) => i.iid === iid);
    if (!entry) return err(`предмет с iid ${iid} не найден в рюкзаке (inv list)`);
    const def = this.d.fishOf(entry.defId);
    if (!def) {
      return err(`${entry.defId} — не рыба: выпускать можно только пойманных рыб (пруд/река)`);
    }
    const state = this.d.getState();
    const lidx = activeLakeOf(state);
    const group = groupOf(state, lidx);
    const slotIdx = group.slots.findIndex((s) => s.fishId === undefined);
    if (slotIdx === -1) {
      return err(`озеро №${lidx + 1} полно: ${group.slots.length}/${group.slots.length} слотов занято (lake.harvest освободит)`);
    }
    // iid-запись расходуется каноном M02 (worst-first — D30-шов, владелец M02)
    const spent = this.d.removeItem(entry.defId, 1, 'lake.release');
    if (!spent.ok) return err(spent.error);
    const slots = [...group.slots];
    slots[slotIdx] = canonicalSlot({
      fishId: entry.defId,
      quality: entry.quality.tier,
      fedAt: this.d.time.now(),
      sick: false,
      bornAt: this.d.time.now(),
    });
    this.d.setState(withGroup(state, lidx, {
      ...group,
      slots,
      stats: { ...group.stats, released: group.stats.released + 1 },
    }));
    this.d.save.markDirty();
    return ok({ slotIdx, fishId: entry.defId, quality: entry.quality.tier });
  }

  /** F4: кормление ВСЕХ голодных одним действием [DECISION]: Корм ×N
   *  атомарно + энергия 2; нехватка Корма → отказ, состояние цело */
  feed(): Result<{ fed: number; consumed: number }> {
    this.d.sweep();
    const now = this.d.time.now();
    const state = this.d.getState();
    const lidx = activeLakeOf(state);
    const group = groupOf(state, lidx);
    const hungryIdx = group.slots
      .map((s, i) => ({ s, i }))
      .filter(({ s }) => s.fishId !== undefined && isHungry(s.fedAt, now, this.d.table))
      .map(({ i }) => i);
    if (hungryIdx.length === 0) {
      return err('голодных рыб нет (lake.state — витрина)');
    }
    const n = hungryIdx.length;
    const r = this.d.withEnergy('action.lake.feed.energyCost', () =>
      this.d.transaction.transact({
        costs: [{ t: 'currency', id: this.d.table.buy.feedCurrency, qty: n }],
        eventId: 'lake.feed',
        reason: `кормление озера №${lidx + 1}: ${n} голодных`,
      }), 'кормление озера');
    if (!r.ok) return err(r.error);
    const slots = [...group.slots];
    for (const idx of hungryIdx) {
      slots[idx] = canonicalSlot({ ...slots[idx]!, fedAt: now });
    }
    this.d.setState(withGroup(state, lidx, { ...group, slots }));
    this.d.save.markDirty();
    return ok({ fed: n, consumed: n });
  }

  /** F4: лечение больной рыбы — animal_remedy ×1 (существующий деф M09) */
  treat(slotIdx: number): Result<{ slotIdx: number; fishId: ID }> {
    this.d.sweep();
    const state = this.d.getState();
    const lidx = activeLakeOf(state);
    const group = groupOf(state, lidx);
    const slot = group.slots[slotIdx];
    if (!slot || slot.fishId === undefined) {
      return err(`слот ${slotIdx} пуст (lake.state — витрина)`);
    }
    if (!slot.sick) {
      return err(`рыба в слоте ${slotIdx} здорова — лечить нечего (прецедент pen.heal)`);
    }
    const pay = this.d.transaction.transact({
      costs: [{ t: 'item', defId: 'animal_remedy', qty: 1 }],
      eventId: 'lake.treat',
      reason: `лечение рыбы в слоте ${slotIdx} (озеро №${lidx + 1})`,
    });
    if (!pay.ok) {
      return err(`${pay.error} — сварите «Лекарство для животных» (Алхимический котёл: al_animal_remedy)`);
    }
    const slots = [...group.slots];
    slots[slotIdx] = canonicalSlot({ ...slot, sick: false });
    this.d.setState(withGroup(state, lidx, { ...group, slots }));
    this.d.save.markDirty();
    return ok({ slotIdx, fishId: slot.fishId });
  }

  /** F4: «Сачок» +15 чистоты (кап 100; энергия 3; при капе — честный отказ
   *  [DECISION]: энергия не тратится зря) */
  clean(): Result<{ cleanliness: number }> {
    this.d.sweep();
    const pre = this.d.getState();
    const preGroup = groupOf(pre, activeLakeOf(pre));
    if (preGroup.water.cleanliness >= this.d.table.water.max) {
      return err(`вода уже чистая (кап ${this.d.table.water.max}) — «Сачок» не нужен`);
    }
    const state0 = this.d.getState();
    const lidx = activeLakeOf(state0);
    const group0 = groupOf(state0, lidx);
    const r = this.d.withEnergy('action.lake.clean.energyCost', () => {
      const water = cleanWater(group0.water, this.d.table);
      this.d.setState(withGroup(this.d.getState(), lidx, { ...group0, water }));
      this.d.save.markDirty();
      return ok(water.cleanliness);
    }, 'чистка озера «Сачком»');
    if (!r.ok) return err(r.error);
    return ok({ cleanliness: groupOf(this.d.getState(), lidx).water.cleanliness });
  }

  /** F8: сбор взрослой рыбы → инвентарь (acquire-канон, источник lake;
   *  качество переносится; после сбора — ленивое рождение в свободный слот) */
  harvest(slotIdx: number): Result<{ slotIdx: number; fishId: ID; quality: QualityTier }> {
    this.d.sweep();
    const state = this.d.getState();
    const lidx = activeLakeOf(state);
    const group = groupOf(state, lidx);
    const slot = group.slots[slotIdx];
    if (!slot || slot.fishId === undefined) {
      return err(`слот ${slotIdx} пуст (lake.state — витрина)`);
    }
    const def = this.d.fishOf(slot.fishId);
    if (!def) return err(`вид ${slot.fishId} не найден (рыбы пруда/реки — каталог)`);
    const probe = this.d.probeCapacity(slot.fishId, 1);
    if (!probe.ok) return err(probe.error);
    if (!probe.value.fits) {
      return err('инвентарь полон — освобождите слоты (инвентарь D23: партия отклонена целиком)');
    }
    const tier = slot.quality ?? 'D';
    const delivered = this.d.deliverFish(
      slot.fishId, tier, this.d.table.care.harvestQualityValue, 1, 'lake',
    );
    if (!delivered.ok) return err(delivered.error);
    const slots = [...group.slots];
    slots[slotIdx] = canonicalSlot({ sick: false });
    this.d.setState(withGroup(state, lidx, {
      ...group,
      slots,
      stats: { ...group.stats, harvested: group.stats.harvested + 1 },
    }));
    this.d.save.markDirty();
    // ленивое рождение: освободившийся слот может принять готовую икру
    this.d.sweep();
    return ok({ slotIdx, fishId: slot.fishId, quality: tier });
  }

  /** F8: покупка Корма — прямой канал из контент-дефа (цена — ДАННЫЕ M04
   *  shop.currencyGoods, прецедент чтения «Симбиозом»; БЕЗ энергии) */
  buyFeed(qty = 1): Result<{ qty: number; pricePerUnit: number }> {
    const n = Math.floor(qty);
    if (n < 1) return err('количество должно быть целым и положительным');
    const shopTable = this.d.content.get<{ currencyGoods: Record<string, number> }>('shop');
    const price = shopTable?.currencyGoods?.[this.d.table.buy.feedCurrency];
    if (price === undefined) {
      return err(`валюта «${this.d.table.buy.feedCurrency}» без цены (shop.currencyGoods)`);
    }
    const r = this.d.transaction.transact({
      costs: [{ t: 'currency', id: 'gold', qty: price * n }],
      grants: [{ t: 'currency', id: this.d.table.buy.feedCurrency, qty: n }],
      eventId: 'lake.buy',
      reason: `покупка Корма ×${n} (прямой канал озера, ${price}з/шт)`,
    });
    if (!r.ok) return err(r.error);
    return ok({ qty: n, pricePerUnit: price });
  }
}
