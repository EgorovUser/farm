/**
 * InventoryStore — хранилище предметов M02 (карточка §1: «владеть экземплярами»).
 * Реализует замороженный ядровой контракт ItemPort (D17: подмена SimpleStash
 * монтажом в game-слое) и канонические операции модуля.
 *
 * [DECISION] Семантика порта (ядро не даёт канала отказа для ГРАНТОВ: add→void,
 * событие ядро публикует безусловно): порт НИКОГДА не теряет предметы и не
 * роняет транзакцию — партия размещается даже сверх capacity. Вместимость
 * дозируется канонической точкой acquire (D23: отказ всей партии без потерь).
 * Потребители транзакционных грантов (магазин M04+) обязаны проверять
 * вместимость до покупки через API модуля.
 *
 * [DECISION] События: acquire/add публикуют `item.acquired` с полным payload
 * { defId, quality, qty, source } (D23); портовый путь НЕ публикует своего
 * события — его публикует TransactionService (без quality, контракт ядра).
 * Двойной публикации нет ни на одном пути.
 */
import type { EventBus } from '@/kernel/bus/event-bus/event-bus';
import type { RngBus } from '@/kernel/bus/rng-bus/rng-bus';
import type { StatBus } from '@/kernel/bus/stat-bus/stat-bus';
import type { ItemPort } from '@/kernel/services/item-stash/simple-stash';
import type { ResolveCtx } from '@/kernel/bus/stat-bus/modifier';
import type { ID, QualityTier } from '@/shared/types/ids';
import { QUALITY_TIERS } from '@/shared/types/ids';
import type { Result } from '@/shared/types/result';
import { err, ok } from '@/shared/types/result';
import type { ItemDef } from '@/content/items/items';
import type { InventoryTable } from '@/content/balance/inventory';
// [M04.1 · 01 §6] внутренности размещения — store-internals.ts (файл превысил
// 300 строк при касании); изъятие removeInternal (CRIT-1/FIX-M02) — здесь
import { applyPlacement, qualityOfRemoved, rollQuality } from './store-internals';
import { capacityOf, planRemoval, tabOf } from './logic';
import { equippedIidSet } from './equipment';
import {
  defaultInventoryState,
  maxStackOf,
  type InventoryState,
  type ItemInstance,
  type ItemQuality,
} from './state';

export interface InventoryStoreDeps {
  table: InventoryTable;
  tryItem(defId: ID): ItemDef | undefined;
  rngBus: RngBus;
  statBus: StatBus;
  bus: EventBus;
  ctx(): ResolveCtx;
  markDirty(): void;
}

export interface AcquireReceipt {
  defId: ID;
  quality: ItemQuality;
  qty: number;
  entries: number;
  /** [M04.1 · C4] iid СОЗДАННЫХ записей партии (слияния не входят — ривен-роллы
   *  применимы только к новым носителям; стакаемое modSlots не несёт) */
  iids: ID[];
}

export interface InventoryTabSummary {
  id: string;
  name: string;
  entries: number;
  qty: number;
}

export interface InventoryInfo {
  capacity: number;
  used: number;
  free: number;
  slotsResolved: number;
  seq: number;
  tabs: InventoryTabSummary[];
}

export class InventoryStore implements ItemPort {
  private state: InventoryState = defaultInventoryState();
  private readonly deps: InventoryStoreDeps;

  constructor(deps: InventoryStoreDeps) {
    this.deps = deps;
  }

  // ------------------------------------------------------------ ItemPort (D17)

  count(defId: ID): number {
    return this.state.items.reduce((sum, it) => (it.defId === defId ? sum + it.qty : sum), 0);
  }

  add(defId: ID, qty: number): void {
    if (qty <= 0) return;
    const quality = rollQuality(this.deps.rngBus, this.deps.ctx());
    const placed = applyPlacement(this.deps, this.state, defId, quality, Math.floor(qty), { enforceCapacity: false });
    if (placed.ok) this.state = placed.value.nextState;
  }

  remove(defId: ID, qty: number): Result<void> {
    return this.removeInternal(defId, qty);
  }

  // ------------------------------------------------- канонические операции

  /** D23: единая точка приобретения — ролл качества + событие с полным payload */
  acquire(defId: ID, qty: number, source: string): Result<AcquireReceipt> {
    if (!this.deps.tryItem(defId)) {
      return err(`предмет "${defId}" не найден в content/items`);
    }
    const n = Math.floor(qty);
    if (n < 1) return err('количество должно быть целым и положительным');
    const quality = rollQuality(this.deps.rngBus, this.deps.ctx());
    const placed = applyPlacement(this.deps, this.state, defId, quality, n, { enforceCapacity: true });
    if (!placed.ok) return err(placed.error);
    this.state = placed.value.nextState;
    this.deps.bus.publish('item.acquired', { defId, quality, qty: n, source });
    this.deps.markDirty();
    return ok({ defId, quality, qty: n, entries: placed.value.entries, iids: placed.value.iids });
  }

  /** Явное качество (без ролла): для систем, знающих качество (крафт M09+,
   *  миграции данных, debug). Тот же пайплайн размещения и то же событие. */
  addWithQuality(defId: ID, tier: QualityTier, value: number, qty: number, source: string): Result<AcquireReceipt> {
    if (!this.deps.tryItem(defId)) {
      return err(`предмет "${defId}" не найден в content/items`);
    }
    if (!QUALITY_TIERS.includes(tier)) return err(`неизвестный тир качества: ${String(tier)}`);
    const n = Math.floor(qty);
    if (n < 1) return err('количество должно быть целым и положительным');
    const quality: ItemQuality = { tier, value: Math.min(100, Math.max(0, value)) };
    const placed = applyPlacement(this.deps, this.state, defId, quality, n, { enforceCapacity: true });
    if (!placed.ok) return err(placed.error);
    this.state = placed.value.nextState;
    this.deps.bus.publish('item.acquired', { defId, quality, qty: n, source });
    this.deps.markDirty();
    return ok({ defId, quality, qty: n, entries: placed.value.entries, iids: placed.value.iids });
  }

  /** [M04.1] Проба вместимости ДО покупки (канон D23-решения: «потребители
   *  транзакционных грантов (магазин M04+) обязаны проверять вместимость
   *  до покупки через API модуля»). Консервативно: план БЕЗ слияний —
   *  верхняя оценка новых записей для любого будущего качества (качество
   *  роллится в acquire и влияет на слияния): проба зелёная — acquire
   *  гарантированно пройдёт; граничный случай «0 свободных слотов, но есть
   *  место в стаке» — отказ (честный консерватизм, без переполнения). */
  probe(defId: ID, qty: number): Result<{ newEntries: number; free: number; fits: boolean }> {
    const def = this.deps.tryItem(defId);
    if (!def) return err(`предмет "${defId}" не найден в content/items`);
    const n = Math.floor(qty);
    if (n < 1) return err('количество должно быть целым и положительным');
    const maxStack = maxStackOf(def, this.deps.table);
    const newEntries = Math.ceil(n / maxStack);
    const eq = equippedIidSet(this.state);
    const backpack = this.state.items.filter((it) => !eq.has(it.iid)).length;
    const free = Math.max(0, this.capacity() - backpack);
    return ok({ newEntries, free, fits: newEntries <= free });
  }

  /** Изъятие с событием (потребители: use/sell M02.3, debug) */
  removeWithEvent(defId: ID, qty: number, source: string): Result<AcquireReceipt> {
    const r = this.removeInternal(defId, qty);
    if (!r.ok) return err(r.error);
    const quality = qualityOfRemoved(this.state, defId);
    this.deps.bus.publish('item.consumed', { defId, qty: Math.floor(qty), source });
    this.deps.markDirty();
    return ok({ defId, quality, qty: Math.floor(qty), entries: 0, iids: [] });
  }

  has(defId: ID, qty: number): boolean {
    return this.count(defId) >= qty;
  }

  /** D30: inv list — только рюкзак (экипированные НЕ видны);
   *  полный список записей — getState()/equipped-карта */
  list(filter?: { tab?: string }): ItemInstance[] {
    const eq = equippedIidSet(this.state);
    const items = this.state.items.filter((it) => !eq.has(it.iid)).map((it) => ({ ...it }));
    if (!filter?.tab) return items;
    return items.filter((it) => tabOf(this.deps.tryItem(it.defId), this.deps.table.tabs).id === filter.tab);
  }

  capacity(): number {
    const resolved = this.deps.statBus.resolve({ stat: 'player.inventory.slots', ctx: this.deps.ctx() });
    return capacityOf(this.deps.table.slotsCap, resolved);
  }

  /** D30: вместимость — только незэкипированные записи */
  usedSlots(): number {
    const eq = equippedIidSet(this.state);
    return this.state.items.filter((it) => !eq.has(it.iid)).length;
  }

  info(): InventoryInfo {
    const capacity = this.capacity();
    const eq = equippedIidSet(this.state);
    const backpack = this.state.items.filter((it) => !eq.has(it.iid));
    const tabs: InventoryTabSummary[] = this.deps.table.tabs.map((t) => {
      const own = backpack.filter(
        (it) => tabOf(this.deps.tryItem(it.defId), this.deps.table.tabs).id === t.id,
      );
      return { id: t.id, name: t.name, entries: own.length, qty: own.reduce((s, i) => s + i.qty, 0) };
    });
    return {
      capacity,
      used: backpack.length,
      free: Math.max(0, capacity - backpack.length),
      slotsResolved: this.deps.statBus.resolve({ stat: 'player.inventory.slots', ctx: this.deps.ctx() }),
      seq: this.state.seq,
      tabs,
    };
  }

  /** debug: полный сброс (inv clear) — состояние по умолчанию. item.*-событий НЕТ;
   *  публикуется сервисный invalidate.stat (DEBT-25, ратифицировано Q9 приёмкой
   *  M02.2): кэши шин сбрасываются сразу, а не ближайшим minuteTick. Сервисное
   *  событие каталога ядра (02 §4) — в eventsPublished модуля не числится
   *  (прецеденты: levelUp M01, unequip M02.2). */
  clear(): void {
    this.state = defaultInventoryState();
    this.deps.bus.publish('invalidate.stat', {});
    this.deps.markDirty();
  }

  // ------------------------------------------------------------- внутреннее
  // Размещение/ролл качества/qualityOfRemoved — store-internals.ts (01 §6);
  // здесь — только изъятие (CRIT-1/FIX-M02, не тронуто при расщеплении)

  private removeInternal(defId: ID, qty: number): Result<void> {
    const n = Math.floor(qty);
    if (n < 1) return err('количество должно быть целым и положительным');
    // D30: экипированные записи в выборе изъятия НЕ участвуют (защита ссылки);
    // при нехватке отказ называет экипированную часть («сначала снимите»)
    const plan = planRemoval(this.state.items, defId, n, equippedIidSet(this.state));
    if (!plan.ok) return err(plan.error);
    const items = this.state.items.map((it) => ({ ...it }));
    const drop: number[] = [];
    for (const t of plan.takes) {
      items[t.index].qty -= t.take;
      if (items[t.index].qty <= 0) drop.push(t.index);
    }
    // [FIX-M02 · CRIT-1] drop собирается в порядке КАЧЕСТВА (D25 худшие-вперёд),
    // а не индексов; прежний reverse() предполагал индексный порядок и ломался,
    // когда худшая из изымаемых записей стояла в items[] ПОЗЖЕ лучшей: первый
    // splice сдвигал массив, второй вырезал ПОСТОРОННЮЮ запись, а цель оставалась
    // зомби с qty=0 (аудит AUDIT-M02 §4, репро A/B). Удаление с хвоста —
    // сортировка по убыванию индекса: сдвиги выше удалённого не затрагивают
    // нижние индексы, удаляются ровно опустошённые планом записи и только они.
    drop.sort((a, b) => b - a);
    for (const i of drop) items.splice(i, 1);
    this.state = { ...this.state, items };
    return ok(undefined);
  }

  // ------------------------------------------------------------- save slice

  getState(): InventoryState {
    return this.state;
  }

  setState(s: InventoryState): void {
    this.state = s;
  }
}
