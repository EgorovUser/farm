/**
 * Fixture и хелперы self-checks M04 «Магазин» — общий модуль частей
 * (ротация/покупки/сейв; расщепление 01 §6: shop-checks превысил 500 строк).
 * 1 января 2024, 12:00 локального времени (общая константа с M02-фикстурами).
 *
 * [КРИТИЧНО для байт-в-байт ×2] ротация сидируется dailySeed(saveId, дата):
 * фикстуры чеков магазина создаются с ФИКСИРОВАННЫМ saveId (makeSeededShopGame)
 * — случайный saveId делал бы вывод чеков недетерминированным между прогонами.
 * Смена дат — clock.advance(+1д) + ленивый ensureStock (тот же rotate(),
 * что и у dayTick-пути).
 */
import { ManualClock } from '@/kernel/di/clock';
import { MemoryStorage } from '@/kernel/save/storage-drivers';
import { createGame, type Game } from '@/game/bootstrap';
import type { ItemDef } from '@/content/items/items';
import { MS_DAY } from '@/shared/utils/math';

export type R<T> = { ok: true; value: T } | { ok: false; error: string };

export interface StockEntry {
  id: string;
  kind: 'item' | 'currency';
  qty: number;
  discount?: number;
  base: boolean;
  pinned?: boolean;
}
export interface Stock {
  dateISO: string;
  entries: StockEntry[];
}

export const T0 = new Date(2024, 0, 1, 12, 0, 0, 0).getTime();

export interface ShopFixture {
  game: Game;
  shop: Record<string, (...args: unknown[]) => unknown>;
  inv: Record<string, (...args: unknown[]) => unknown>;
  itemById: Map<string, ItemDef>;
  dispose(): void;
}

export function makeShopGame(storage: MemoryStorage = new MemoryStorage()): ShopFixture {
  const game = createGame(new ManualClock(T0), storage);
  return {
    game,
    shop: game.modules.get('shop')?.api ?? {},
    inv: game.modules.get('inventory')?.api ?? {},
    itemById: new Map(game.content.get<ItemDef[]>('items').map((d) => [d.id, d] as const)),
    dispose: () => game.dispose(),
  };
}

/** Фикстура с ФИКСИРОВАННЫМ saveId (детерминизм вывода чеков). Кошелёк — 0. */
export async function makeSeededShopGame(saveId: string): Promise<ShopFixture> {
  const storage = new MemoryStorage();
  await storage.set('main', JSON.stringify({
    saveVersion: 6,
    savedAt: T0,
    saveId,
    contentVersion: '0.0.1',
    lastSeen: T0,
    modules: { 'kernel.wallet': { balances: [['gold', 0]] } },
  }));
  const f = makeShopGame(storage);
  await f.game.init();
  return f;
}

export function stockOf(f: ShopFixture): Stock {
  f.shop['shop.ensureStock']();
  return f.shop['shop.stock']() as Stock;
}

/** смена даты без тика (тот же rotate(), что и у dayTick-пути — ленивый ensure) */
export function nextDay(f: ShopFixture): void {
  (f.game.clock as ManualClock).advance(MS_DAY);
}

export function grantGold(f: ShopFixture, qty: number): void {
  f.game.transaction.transact({
    grants: [{ t: 'currency', id: 'gold', qty }],
    eventId: 'selfcheck.m041-setup',
  });
}

export function drainGold(f: ShopFixture): void {
  const have = f.game.wallet.get('gold');
  if (have > 0) {
    f.game.transaction.transact({ costs: [{ t: 'currency', id: 'gold', qty: have }], eventId: 'selfcheck.m041-drain' });
  }
}

export function buy(f: ShopFixture, id: string, qty = 1): R<{
  id: string;
  kind: 'item' | 'currency';
  qty: number;
  unitPrice: number;
  total: number;
  discount?: number;
  iids?: string[];
}> {
  return f.shop['shop.buy'](id, qty) as R<{
    id: string;
    kind: 'item' | 'currency';
    qty: number;
    unitPrice: number;
    total: number;
    discount?: number;
    iids?: string[];
  }>;
}

export function invCount(f: ShopFixture, defId: string): number {
  return (f.inv['inventory.list']() as Array<{ defId: string; qty: number }>)
    .filter((i) => i.defId === defId)
    .reduce((s, i) => s + i.qty, 0);
}

/** первый gear с modSlots в стоке (сканирует до 30 дат; null — не встретился) */
export function findRolledGear(f: ShopFixture): { id: string; date: number } | null {
  for (let d = 0; d < 30; d++) {
    const stock = stockOf(f);
    const hit = stock.entries.find(
      (e) => !e.base && !e.pinned && e.kind === 'item' && Boolean(f.itemById.get(e.id)?.modSlots),
    );
    if (hit) return { id: hit.id, date: d };
    nextDay(f);
  }
  return null;
}
