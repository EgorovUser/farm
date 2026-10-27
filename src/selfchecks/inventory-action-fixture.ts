/**
 * Fixture и хелперы self-checks M02.3 «Действия над предметом» — общий модуль
 * для inventory-action-checks.ts (use) и inventory-action-sell-checks.ts
 * (sell/wear): расщепление по 01 §6 (файл превысил 300 строк).
 * 1 января 2024, 12:00 локального времени (общая константа с M02.1/M02.2).
 */
import { ManualClock } from '@/kernel/di/clock';
import { MemoryStorage } from '@/kernel/save/storage-drivers';
import { createGame, type Game } from '@/game/bootstrap';
import type { ItemInstance } from '@/game/modules/inventory/state';

const T0 = new Date(2024, 0, 1, 12, 0, 0, 0).getTime();

export interface ActionFixture {
  game: Game;
  api: Record<string, (...args: unknown[]) => unknown>;
  dispose(): void;
}

export function makeActionGame(storage: MemoryStorage = new MemoryStorage()): ActionFixture {
  const game = createGame(new ManualClock(T0), storage);
  const api = game.modules.get('inventory')?.api ?? {};
  return { game, api, dispose: () => game.dispose() };
}

export type R<T> = { ok: true; value: T } | { ok: false; error: string };

export function addQ(api: ActionFixture['api'], defId: string, tier: string, value: number, qty: number): R<{ entries: number }> {
  return api['inventory.add'](defId, tier, value, qty, 'selfcheck') as R<{ entries: number }>;
}

export function applyUse(api: ActionFixture['api'], iid: string): R<{ defId: string; iid: string; effects: Array<{ t: string; value: number }> }> {
  return api['inventory.use'](iid) as R<{ defId: string; iid: string; effects: Array<{ t: string; value: number }> }>;
}

export function sell(api: ActionFixture['api'], defId: string, qty: number): R<{
  defId: string;
  qty: number;
  gold: number;
  chunks: Array<{ tier: string; units: number; unitPrice: number }>;
}> {
  return api['inventory.sell'](defId, qty) as R<{
    defId: string;
    qty: number;
    gold: number;
    chunks: Array<{ tier: string; units: number; unitPrice: number }>;
  }>;
}

export function wear(api: ActionFixture['api'], iid: string, n: number): R<{ iid: string; before: number; current: number; max: number; broken: boolean }> {
  return api['inventory.wear'](iid, n) as R<{ iid: string; before: number; current: number; max: number; broken: boolean }>;
}

export function list(api: ActionFixture['api']): ItemInstance[] {
  return api['inventory.list']() as ItemInstance[];
}

export function byDef(api: ActionFixture['api'], defId: string): ItemInstance[] {
  return list(api).filter((it) => it.defId === defId);
}

export function goldOf(f: ActionFixture): number {
  return f.game.wallet.get('gold');
}

export function energyOf(f: ActionFixture): number {
  return (f.game.modules.call('player', 'player.snapshot') as { energy: { current: number } }).energy.current;
}

export function hpOf(f: ActionFixture): number {
  return (f.game.modules.call('player', 'player.snapshot') as { hp: { current: number } }).hp.current;
}

export function setEnergy(f: ActionFixture, n: number): void {
  f.game.modules.call('player', 'player.setEnergy', n);
}

export function setHp(f: ActionFixture, n: number): void {
  f.game.modules.call('player', 'player.setHp', n);
}

export function resolveAttack(f: ActionFixture): number {
  return f.game.statBus.resolve({ stat: 'combat.attack', ctx: f.game.time.ctx('player') });
}

/** до уровня 2 (гейт мази): 115 XP; до уровня 5 (гейт меча): 600 XP */
export function addXp(f: ActionFixture, n: number): void {
  f.game.modules.call('player', 'player.addXp', n, 'selfcheck');
}
