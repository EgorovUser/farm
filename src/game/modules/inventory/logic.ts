/**
 * Чистая логика инвентаря (M02, паттерн M01): планы размещения и изъятия
 * над массивом записей — без побочных эффектов, шин и сейва.
 * Применение планов — store.ts (единая точка мутации состояния).
 */
import type { ID } from '@/shared/types/ids';
import { QUALITY_TIERS, type QualityTier } from '@/shared/types/ids';
import type { InventoryTable, InventoryTabDef } from '@/content/balance/inventory';
import type { ItemDef } from '@/content/items/items';
import type { ItemInstance, ItemQuality } from './state';
import { maxStackOf, sameQuality } from './state';

/** Вместимость (D19): min(кап, резолв) — в СТАКАХ (записях), не единицах */
export function capacityOf(slotsCap: number, resolvedSlots: number): number {
  return Math.max(1, Math.min(slotsCap, Math.floor(resolvedSlots)));
}

/** Порядок качества: D < C < B < A < S < SS */
export function tierRank(tier: QualityTier): number {
  return QUALITY_TIERS.indexOf(tier);
}

export interface PlacementPlan {
  /** слияния в существующие записи: индекс → сколько добавить */
  merges: Array<{ index: number; add: number }>;
  /** сколько новых записей потребуется (по maxStack на запись) */
  newEntries: number;
  /** остаток после слияний, уходящий в новые записи */
  remainder: number;
  maxStack: number;
}

/**
 * План размещения партии одного качества: сначала слияние в существующие
 * записи того же defId+quality (до maxStack), остаток — новыми записями.
 * Слоты здесь НЕ проверяются — свободные слоты считает вызывающий.
 *
 * [MEL-2 · AUDIT-M02] кверк для владельцев M03/M09: план сканирует ВСЕ items[]
 * без фильтра equipped — грант с ТОЧНЫМ совпадением defId+quality (tier И
 * value) вольётся в экипированную запись (единицы «в слоте», слот рюкзака
 * не занимают). В живой игре через роллы НП (value — float); конструктивно
 * достижимо через addWithQuality (миграции/крафт M09+, фикстуры selftest).
 * Потери данных и рассинхрона count/has нет (экипированное — владение);
 * кверк видимости/вместимости. Фильтр equipped в слияниях — отдельное
 * спека-решение (не молчаливая правка).
 */
export function planPlacement(
  items: readonly ItemInstance[],
  defId: ID,
  quality: ItemQuality,
  qty: number,
  maxStack: number,
): PlacementPlan {
  const merges: Array<{ index: number; add: number }> = [];
  let rest = qty;
  for (let i = 0; i < items.length && rest > 0; i++) {
    const it = items[i];
    if (it.defId !== defId || !sameQuality(it.quality, quality)) continue;
    const room = maxStack - it.qty;
    if (room <= 0) continue;
    const add = Math.min(room, rest);
    merges.push({ index: i, add });
    rest -= add;
  }
  const newEntries = rest > 0 ? Math.ceil(rest / maxStack) : 0;
  return { merges, newEntries, remainder: rest, maxStack };
}

export type RemovalPlan =
  | { ok: true; takes: Array<{ index: number; take: number }>; total: number }
  | { ok: false; error: string };

/**
 * План изъятия qty предметов defId: по возрастанию качества
 * ([DECISION] худшие вперёд — при продаже/расходе лучшие остаются у игрока).
 * D30: экипированные записи (iid в equipped) в выборе НЕ участвуют; если из-за
 * них не хватило — отказ называет их («сначала снимите»), транзакционно без потерь.
 */
export function planRemoval(
  items: readonly ItemInstance[],
  defId: ID,
  qty: number,
  equipped?: ReadonlySet<ID>,
): RemovalPlan {
  const all = items.map((it, i) => ({ it, i })).filter((x) => x.it.defId === defId);
  const available = equipped ? all.filter((x) => !equipped.has(x.it.iid)) : all;
  const equippedEntries = all.length - available.length;
  const have = available.reduce((sum, x) => sum + x.it.qty, 0);
  if (have < qty) {
    // форма сообщения без экипированных — байт-в-байт как в M02.1 (проба отчёта)
    const eqNote = equippedEntries > 0 ? ` — ещё ${equippedEntries} экипировано, сначала снимите` : '';
    return { ok: false, error: `не хватает предметов ${defId}: есть ${have}${eqNote}, нужно ${qty}` };
  }
  const takes: Array<{ index: number; take: number }> = [];
  let rest = qty;
  for (const { it, i } of available.sort((a, b) => {
    const d = tierRank(a.it.quality.tier) - tierRank(b.it.quality.tier);
    return d !== 0 ? d : a.it.quality.value - b.it.quality.value;
  })) {
    if (rest <= 0) break;
    const take = Math.min(it.qty, rest);
    takes.push({ index: i, take });
    rest -= take;
  }
  return { ok: true, takes, total: qty };
}

/** Вкладка предмета по itemType; неизвестный тип — последняя вкладка (П5) */
export function tabOf(
  def: ItemDef | undefined,
  tabs: readonly InventoryTabDef[],
): InventoryTabDef {
  const type = def?.itemType as InventoryTabDef['types'][number] | undefined;
  if (type) {
    const found = tabs.find((t) => t.types.includes(type));
    if (found) return found;
  }
  return tabs[tabs.length - 1];
}

/** Свободные слоты при данном плане размещения */
export function slotsNeeded(plan: PlacementPlan): number {
  return plan.newEntries;
}

/** Утилита для отладки/чеков: maxStack с таблицей и def-lookup */
export function maxStackFor(defId: ID, table: InventoryTable, tryItem: (id: ID) => ItemDef | undefined): number {
  return maxStackOf(tryItem(defId), table);
}
