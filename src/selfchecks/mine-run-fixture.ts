/**
 * Fixture и хелперы self-checks M13.1 «Забег» — общий модуль группы
 * (паттерн mine-fixture: фиксированный saveId + ManualClock на T0 =
 * 2024-01-01 12:00; лента событий забега/HP/транзакций для оракулов).
 */
import { ManualClock } from '@/kernel/di/clock';
import { MemoryStorage } from '@/kernel/save/storage-drivers';
import { createGame, type Game } from '@/game/bootstrap';

export type R<T> = { ok: true; value: T } | { ok: false; error: string };

export const RUN_T0 = new Date(2024, 0, 1, 12, 0, 0, 0).getTime();

export interface RunFixture {
  game: Game;
  mine: Record<string, (...args: unknown[]) => unknown>;
  player: Record<string, (...args: unknown[]) => unknown>;
  inv: Record<string, (...args: unknown[]) => unknown>;
  clock: ManualClock;
  events: Array<{ name: string; payload: Record<string, unknown> }>;
  dispose(): void;
}

const CAPTURED = [
  'mine.runStarted',
  'mine.runEnded',
  'mine.cardResolved',
  'mine.turnResolved',
  'mine.enemyKilled',
  'mine.bossKilled',
  'player.hpChanged',
  'wallet.transaction',
  'item.acquired',
  'achievement.unlocked',
] as const;

export function makeRunGame(storage: MemoryStorage = new MemoryStorage()): RunFixture {
  const clock = new ManualClock(RUN_T0);
  const game = createGame(clock, storage);
  const events: Array<{ name: string; payload: Record<string, unknown> }> = [];
  const subs = CAPTURED.map((name) =>
    game.bus.subscribe(name, (p) => events.push({ name, payload: p as Record<string, unknown> })),
  );
  return {
    game,
    clock,
    mine: game.modules.get('mine')?.api ?? {},
    player: game.modules.get('player')?.api ?? {},
    inv: game.modules.get('inventory')?.api ?? {},
    events,
    dispose: () => {
      for (const off of subs) off();
      game.dispose();
    },
  };
}

export async function makeSeededRunGame(saveId: string): Promise<RunFixture> {
  const storage = new MemoryStorage();
  await storage.set(
    'main',
    JSON.stringify({
      saveVersion: 15,
      savedAt: RUN_T0,
      saveId,
      contentVersion: '0.1.0-phase0',
      modules: {},
      lastSeen: RUN_T0,
    }),
  );
  const f = makeRunGame(storage);
  await f.game.init();
  return f;
}

// ---------------------------------------------------------------- хелперы

export interface ViewShape {
  header: string;
  lines: string[];
}

export function viewOf(r: R<ViewShape>): string {
  return r.ok ? [r.value.header, ...r.value.lines].join('\n') : `ERR: ${r.error}`;
}

export function eventsOf(f: RunFixture, name: string): Array<Record<string, unknown>> {
  return f.events.filter((e) => e.name === name).map((e) => e.payload);
}

export function equipPickaxe(f: RunFixture, tier: 'D' | 'B' | 'A' | 'S'): void {
  const eq = (f.inv['inventory.equipped'] as () => Array<{ slot: string }>)();
  if (eq.some((e) => e.slot === 'pickaxe')) {
    (f.inv['inventory.unequip'] as (slot: string) => R<unknown>)('pickaxe');
  }
  (f.inv['inventory.add'] as (d: string, t: string, v: number, q: number, s: string) => R<unknown>)(
    'iron_pickaxe',
    tier,
    50,
    1,
    'selfcheck',
  );
  const list = (f.inv['inventory.list'] as () => Array<{ iid: string; defId: string }>)();
  const pick = list.findLast((i) => i.defId === 'iron_pickaxe')!;
  (f.inv['inventory.equip'] as (iid: string, slot: string) => R<unknown>)(pick.iid, 'pickaxe');
}

export function goldOf(f: RunFixture): number {
  return f.game.wallet.get('gold');
}

export function grantGold(f: RunFixture, qty: number): void {
  f.game.transaction.transact({ grants: [{ t: 'currency', id: 'gold', qty }], eventId: 'selfcheck.setup' });
}

/** заполнить рюкзак до границы (уникальные значения качества — без слияний) */
export function fillInventory(f: RunFixture, slots: number, tag: string): void {
  for (let i = 0; i < slots; i++) {
    const value = 10 + i * 0.37;
    (f.inv['inventory.add'] as (d: string, t: string, v: number, q: number, s: string) => R<unknown>)(
      'copper_ore',
      'D',
      value,
      1,
      `selfcheck.fill.${tag}`,
    );
  }
}

export function backpackCount(f: RunFixture): number {
  const eq = new Set(
    (f.inv['inventory.equipped'] as () => Array<{ entry: { iid: string } }>)().map((e) => e.entry.iid),
  );
  const list = (f.inv['inventory.list'] as () => Array<{ iid: string }>)();
  return list.filter((i) => !eq.has(i.iid)).length;
}

/** сильный игрок для побед (канал ядра BuffService — прецедент buffWin) */
export function buffWin(f: RunFixture): void {
  const now = f.game.time.now();
  f.game.buffs.add(
    { id: 'selfcheck.run.atk', source: { kind: 'buff', refId: 'selfcheck' }, stat: 'combat.attack', op: 'flat', value: 500 },
    now,
  );
  f.game.buffs.add(
    { id: 'selfcheck.run.def', source: { kind: 'buff', refId: 'selfcheck' }, stat: 'combat.defense', op: 'flat', value: 500 },
    now,
  );
}
