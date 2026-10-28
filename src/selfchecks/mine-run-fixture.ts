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
  // --- [M13.2] события помощников (каталог 02 §4, строки Task 70)
  'helper.hired',
  'helper.quit',
  'helper.levelReputation',
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

// ---------------------------------------------------------------- [M13.2] доноры

/** карта моба для сеемого забега (payload не читается — mobId решает) */
export function mobCard(id: string, mobId: string, elite: string | null = null) {
  return { id, kind: 'mob', hidden: false, payload: null, mobId, elite };
}

/** простая карта для сеемого забега */
export function plainCard(id: string, kind: string, payload: unknown = null) {
  return { id, kind, hidden: false, payload };
}

/** забег-донор для чеков M13.2: срез mine с активным забегом + наёмниками
 *  (прецедент v14-донор FIX-M12; карта-босс — индекс 12, payload = bossId) */
export function seededMineSlice(args: {
  helpers: Array<{ instanceId: string; defId: string; hp: number; reputation: number }>;
  runHelpers: string[];
  layer: number;
  status?: string | null;
  cards: unknown[];
  column?: number;
  contrib?: Record<string, number>;
  mobGold?: number;
  upgrades?: Record<string, boolean | number>;
}): Record<string, unknown> {
  const cards = [...args.cards];
  while (cards.length < 12) cards.push(plainCard(`card_filler_${cards.length}`, 'empty', { xp: 5 }));
  cards.push(plainCard('card_boss', 'boss', 'spider_queen'));
  return {
    v: 1,
    stats: { fights: 0, kills: 0, bossKills: 0, deaths: 0 },
    ...(args.upgrades !== undefined ? { upgrades: args.upgrades } : {}),
    helpers: args.helpers.map((h) => ({
      instanceId: h.instanceId,
      defId: h.defId,
      hp: h.hp,
      reputation: h.reputation,
      hiredDay: '2024-01-01',
    })),
    run: {
      runId: `seed-L${args.layer}-R1`,
      layer: args.layer,
      column: args.column ?? 1,
      cards,
      runBag: [],
      torches: 0,
      hp: 50,
      helpers: args.runHelpers.map((id) => ({ instanceId: id, status: [] })),
      runNumber: 1,
      seed: 12345,
      status: args.status ?? null,
      firstOfDay: true,
      campfire: false,
      cardsResolved: 0,
      altarMods: [],
      pendingCollapse: false,
      traderOpen: false,
      contrib: args.contrib ?? {},
      mobGold: args.mobGold ?? 0,
      turns: {},
      notes: [],
    },
    lastRunDay: '2024-01-01',
  };
}

/** игра с сеемым срезом mine (донор забега/наёмников — канон load-пути) */
export async function makeSeededSliceGame(saveId: string, mineSlice: unknown): Promise<RunFixture> {
  const storage = new MemoryStorage();
  await storage.set(
    'main',
    JSON.stringify({
      saveVersion: 15,
      savedAt: RUN_T0,
      saveId,
      contentVersion: '0.1.0-phase0',
      modules: { mine: mineSlice },
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
