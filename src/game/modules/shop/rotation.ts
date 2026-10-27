/**
 * Ротация стока M04 §2 (чистая функция от: контент + состояние магазина +
 * saveId + дата). Детерминизм: СВЕЖИЙ PRNG от dailySeed(saveId, dateISO)
 * (карточка §2: «закрыть/открыть игру ради переролла бесполезно»);
 * повторная ротация той же даты даёт тот же сток байт-в-байт.
 *
 * Порядок потребления rng застрахован контрактно: выбор позиций (по одной),
 * затем на каждую — [количество, шанс скидки, размер скидки при попадании];
 * люкс-позиция — после основных. Порядок = часть детерминизма (не менять).
 *
 * [DECISION · M04.1] гейты unlock НЕ фильтруют ротацию: залоченный предмет
 * МОЖЕТ прийти в сток — виден с замком и текстом условия («гейты показываем»,
 * 01-CORE П6; приёмка §7 «гейт-предмет не покупается» предполагает его
 * наличие в стоке). Полки (категории) фильтруют: закрытая полка не завозится.
 */
import type { StatBus } from '@/kernel/bus/stat-bus/stat-bus';
import type { ResolveCtx } from '@/kernel/bus/stat-bus/modifier';
import type { ShopTable } from '@/content/balance/shop';
import type { ShopPoolEntry } from '@/content/shopPool';
import type { ItemDef } from '@/content/items/items';
import type { ID } from '@/shared/types/ids';
import { RARITY_ORDER } from '@/content/items/items';
import { dailySeed, hashString, mulberry32, weightedPick } from '@/shared/utils/rng';
import type { ShopState, ShopStock, ShopStockEntry } from './state';

export interface RotationDeps {
  table: ShopTable;
  pool: readonly ShopPoolEntry[];
  tryItem(defId: ID): ItemDef | undefined;
  statBus: StatBus;
  /** стандартный ResolveCtx (time.ctx('player')) */
  ctx(): ResolveCtx;
  saveId(): string;
  getState(): ShopState;
}

/** доступный пул дня: открытые полки + выборы ветки «Ассортимент» */
export function availablePool(deps: RotationDeps): ShopPoolEntry[] {
  const { table, pool } = deps;
  const branches = deps.getState().branches;
  // закрытая полка = есть в unlockOrder, но ЕЩЁ не открыта уровнем ветки;
  // базовые полки (seeds/food/tools/gear/materials) в unlockOrder не входят
  const locked = (category: ShopPoolEntry['category']): boolean => {
    const idx = table.categories.unlockOrder.indexOf(category);
    return idx >= 0 && idx >= branches.categories;
  };
  const picked = new Set(branches.assortmentPicks);
  const catalogById = new Map(table.assortmentCatalog.map((c) => [c.id, c] as const));
  const base = pool.filter((e) => !locked(e.category));
  // выборы игрока: предмет мог исчезнуть из каталога контента — строка
  // игнорируется штатно (П5: неизвестное — не ошибка)
  const extras: ShopPoolEntry[] = [];
  for (const id of picked) {
    if (base.some((e) => e.id === id)) continue;
    const row = catalogById.get(id);
    const def = deps.tryItem(id);
    if (def && row) {
      extras.push({ id, kind: 'item', weight: row.weight, category: 'materials' });
    }
  }
  return [...base, ...extras];
}

/** Ролл стока на дату dateISO (детерминирован; состояние только читается) */
export function rotateStock(deps: RotationDeps, dateISO: string): ShopStock {
  const { table } = deps;
  const state = deps.getState();
  const branches = state.branches;
  const rng = mulberry32(hashString(`${dailySeed(deps.saveId(), dateISO)}:shop:rotation`));
  const resolve = (stat: string): number =>
    deps.statBus.resolve({ stat, ctx: deps.ctx() });

  const entries: ShopStockEntry[] = [];

  // --- (а) базовый ассортимент §2(а): всегда, фиксированное количество
  for (const g of table.baseGoods) {
    entries.push({ id: g.id, kind: g.kind, qty: g.qty, base: true });
  }

  // --- (б) ролл 30% пула §2(б): ceil(rotationSizeMult × poolSize), взвешенно
  const pool = availablePool(deps);
  const sizeMult = resolve('shop.roll.sizeMultPercent') / 100;
  const n = Math.ceil(sizeMult * pool.length);
  const candidates = pool.map((e) => ({ ...e }));
  const rolled: ShopPoolEntry[] = [];
  for (let i = 0; i < n && candidates.length > 0; i++) {
    const pick = weightedPick(candidates.map((c) => ({ id: c.id, weight: c.weight })), rng);
    if (!pick) break;
    const idx = candidates.findIndex((c) => c.id === pick.id);
    rolled.push(candidates[idx]);
    candidates.splice(idx, 1);
  }

  const qtyMin = resolve('shop.roll.qtyMin');
  const qtyMax = resolve('shop.roll.qtyMax');
  const discountChance = resolve('shop.roll.discountChance');
  const rollQty = (): number => Math.max(1, Math.round(qtyMin + Math.floor(rng() * (qtyMax - qtyMin + 1))));
  const rollDiscount = (): number | undefined => {
    if (rng() * 100 >= discountChance) return undefined;
    const span = table.discount.maxPercent - table.discount.minPercent + 1;
    return table.discount.minPercent + Math.floor(rng() * span);
  };

  for (const entry of rolled) {
    const qty = rollQty();
    const discount = rollDiscount(); // ОДИН вызов: расход rng застрахован контрактом порядка
    entries.push({
      id: entry.id,
      kind: entry.kind,
      qty,
      base: false,
      ...(discount !== undefined ? { discount } : {}),
    });
  }

  // --- люкс-витрина §3: +1 гарантированный rare+ (сверх 30%)
  const luxuryCount = Math.round(resolve('shop.roll.luxuryCount'));
  for (let i = 0; i < luxuryCount && candidates.length > 0; i++) {
    const rarePlus = candidates.filter((c) => {
      if (c.kind !== 'item') return false;
      const def = deps.tryItem(c.id);
      return def !== undefined && RARITY_ORDER[def.rarity] >= RARITY_ORDER.rare;
    });
    if (rarePlus.length === 0) break;
    const pick = weightedPick(rarePlus.map((c) => ({ id: c.id, weight: c.weight })), rng);
    if (!pick) break;
    const idx = candidates.findIndex((c) => c.id === pick.id);
    const entry = candidates[idx];
    candidates.splice(idx, 1);
    const qty = rollQty();
    const discount = rollDiscount();
    entries.push({
      id: entry.id,
      kind: entry.kind,
      qty,
      base: false,
      ...(discount !== undefined ? { discount } : {}),
    });
  }

  // --- постоянный заказ §3: закреплённые предметы, дневной запас
  for (const id of branches.pinned) {
    if (entries.some((e) => e.id === id)) continue; // уже в стоке — без дубля
    const def = deps.tryItem(id);
    if (!def) continue; // предмет исчез из контента — П5, штатно
    entries.push({ id, kind: 'item', qty: table.pinnedQty, base: false, pinned: true });
  }

  return { dateISO, entries };
}
