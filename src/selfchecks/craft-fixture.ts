/**
 * Fixture и хелперы self-checks M09 «Крафт» — общий модуль групп
 * (валидации/формула + очередь/экономика; расщепление 01 §6).
 * 1 января 2024, 12:00 локального времени (общая константа с M02/M04).
 *
 * [КРИТИЧНО для байт-в-байт ×2] ривен-роллы сбора сидируются стримом
 * craft:batch:N поверх dailySeed(saveId, дата): все фикстуры создаются с
 * ФИКСИРОВАННЫМ saveId (паттерн makeSeededShopGame). Качество крафта
 * детерминировано формулой (без RNG); предметы выдаются явным качеством
 * (inventory.add — без роллов), валюты — транзакциями.
 */
import { ManualClock } from '@/kernel/di/clock';
import { MemoryStorage } from '@/kernel/save/storage-drivers';
import { createGame, type Game } from '@/game/bootstrap';
import type { ItemDef } from '@/content/items/items';
import type { RecipeDef } from '@/content/craft/recipes';
import { MS_HOUR } from '@/shared/utils/math';

export type R<T> = { ok: true; value: T } | { ok: false; error: string };

export const CRAFT_T0 = new Date(2024, 0, 1, 12, 0, 0, 0).getTime();

export interface CraftFixture {
  game: Game;
  craft: Record<string, (...args: unknown[]) => unknown>;
  inv: Record<string, (...args: unknown[]) => unknown>;
  player: Record<string, (...args: unknown[]) => unknown>;
  itemById: Map<string, ItemDef>;
  recipes: RecipeDef[];
  /** захват событий крафта (started/completed) */
  events: Array<{ name: string; payload: Record<string, unknown> }>;
  dispose(): void;
}

export function makeCraftGame(storage: MemoryStorage = new MemoryStorage()): CraftFixture {
  const game = createGame(new ManualClock(CRAFT_T0), storage);
  const events: Array<{ name: string; payload: Record<string, unknown> }> = [];
  const off1 = game.bus.subscribe('craft.started', (p) => events.push({ name: 'craft.started', payload: p as Record<string, unknown> }));
  const off2 = game.bus.subscribe('craft.completed', (p) => events.push({ name: 'craft.completed', payload: p as Record<string, unknown> }));
  return {
    game,
    craft: game.modules.get('craft')?.api ?? {},
    inv: game.modules.get('inventory')?.api ?? {},
    player: game.modules.get('player')?.api ?? {},
    itemById: new Map(game.content.get<ItemDef[]>('items').map((d) => [d.id, d] as const)),
    recipes: game.content.get<RecipeDef[]>('craft.recipes'),
    events,
    dispose: () => {
      off1();
      off2();
      game.dispose();
    },
  };
}

/** Фикстура с ФИКСИРОВАННЫМ saveId (детерминизм ривен-стримов). Кошелёк — 0. */
export async function makeSeededCraftGame(saveId: string, storage = new MemoryStorage()): Promise<CraftFixture> {
  await storage.set('main', JSON.stringify({
    saveVersion: 8,
    savedAt: CRAFT_T0,
    saveId,
    contentVersion: '0.0.1',
    lastSeen: CRAFT_T0,
    modules: { 'kernel.wallet': { balances: [['gold', 0]] } },
  }));
  const f = makeCraftGame(storage);
  await f.game.init();
  return f;
}

/** выдать золото/валюту (транзакцией — событие в ленте, без RNG) */
export function grantCurrency(f: CraftFixture, id: string, qty: number): void {
  f.game.transaction.transact({
    grants: [{ t: 'currency', id: id as never, qty }],
    eventId: 'selfcheck.m09-setup',
  });
}

/** выдать предмет ЯВНЫМ качеством (без роллов — детерминизм) */
export function giveItem(f: CraftFixture, defId: string, tier: 'D' | 'C' | 'B' | 'A' | 'S' | 'SS', value: number, qty = 1): R<unknown> {
  return f.inv['inventory.add'](defId, tier, value, qty, 'selfcheck.m09') as R<unknown>;
}

/** поднять уровень игрока (детерминированно, публичным API) */
export function addXp(f: CraftFixture, amount: number): void {
  f.player['player.addXp'](amount, 'selfcheck.m09');
}

export function make(f: CraftFixture, recipeId: string, adj?: number): R<{
  batchId: string;
  recipeId: string;
  station: string;
  endsAt: number | null;
  energyCost: number;
}> {
  return f.craft['craft.make'](recipeId, adj) as R<{
    batchId: string;
    recipeId: string;
    station: string;
    endsAt: number | null;
    energyCost: number;
  }>;
}

export function collect(f: CraftFixture, batchId?: string): R<{
  collected: Array<{ batchId: string; recipeId: string; defId: string; qty: number; quality: { tier: string; value: number }; iids?: string[] }>;
  skipped: Array<{ batchId: string; reason: string }>;
}> {
  return f.craft['craft.collect'](batchId) as R<{
    collected: Array<{ batchId: string; recipeId: string; defId: string; qty: number; quality: { tier: string; value: number }; iids?: string[] }>;
    skipped: Array<{ batchId: string; reason: string }>;
  }>;
}

/** список рюкзака (экипированные исключены, D30) */
export function backpack(f: CraftFixture): Array<{
  iid: string;
  defId: string;
  qty: number;
  quality: { tier: string; value: number };
  rolledMods: Array<{ type: string; value: number }>;
  durability?: { current: number; max: number };
}> {
  return f.inv['inventory.list']() as never;
}

export function countItem(f: CraftFixture, defId: string): number {
  return backpack(f).filter((i) => i.defId === defId).reduce((s, i) => s + i.qty, 0);
}

/** сдвиг часов БЕЗ catchUp (ленивый sweep по доступу — как nextDay M04) */
export function advance(f: CraftFixture, ms: number): void {
  (f.game.clock as ManualClock).advance(ms);
}

/** сдвиг часов + явный catchUp (артефакт среды: advanceTime — no-op для
 * ManualClock, guard instanceof DebugClock; паттерн — прямой catchUp игры) */
export function advanceWithCatchUp(f: CraftFixture, ms: number): void {
  const from = f.game.clock.now();
  (f.game.clock as ManualClock).advance(ms);
  f.game.catchUp(from, f.game.clock.now());
}

export const HOUR = MS_HOUR;
