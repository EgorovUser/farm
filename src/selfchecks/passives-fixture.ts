/**
 * Fixture self-checks M14 «Пассивки» — общий модуль группы (паттерн
 * mine-run-fixture: фиксированный saveId + ManualClock на T0; лента событий
 * очков/аллокаций/транзакций для оракулов).
 */
import { ManualClock } from '@/kernel/di/clock';
import { MemoryStorage } from '@/kernel/save/storage-drivers';
import { createGame, type Game } from '@/game/bootstrap';

export type R<T> = { ok: true; value: T } | { ok: false; error: string };

export const PASSIVES_T0 = new Date(2024, 0, 1, 12, 0, 0, 0).getTime();

export interface PassivesFixture {
  game: Game;
  passives: Record<string, (...args: unknown[]) => unknown>;
  player: Record<string, (...args: unknown[]) => unknown>;
  clock: ManualClock;
  events: Array<{ name: string; payload: Record<string, unknown> }>;
  dispose(): void;
}

const CAPTURED = [
  'passive.allocated',
  'invalidate.stat',
  'wallet.transaction',
  'player.levelUp',
  'achievement.unlocked',
  'mine.bossKilled',
] as const;

export function makePassivesGame(storage: MemoryStorage = new MemoryStorage()): PassivesFixture {
  const clock = new ManualClock(PASSIVES_T0);
  const game = createGame(clock, storage);
  const events: Array<{ name: string; payload: Record<string, unknown> }> = [];
  const subs = CAPTURED.map((name) =>
    game.bus.subscribe(name, (p) => events.push({ name, payload: p as Record<string, unknown> })),
  );
  return {
    game,
    clock,
    passives: game.modules.get('passives')?.api ?? {},
    player: game.modules.get('player')?.api ?? {},
    events,
    dispose: () => {
      for (const off of subs) off();
      game.dispose();
    },
  };
}

export async function makeSeededPassivesGame(
  saveId: string,
  modules: Record<string, unknown>,
): Promise<PassivesFixture> {
  const storage = new MemoryStorage();
  await storage.set(
    'main',
    JSON.stringify({
      saveVersion: 15,
      savedAt: PASSIVES_T0,
      saveId,
      contentVersion: '0.1.0-phase0',
      modules,
      lastSeen: PASSIVES_T0,
    }),
  );
  const f = makePassivesGame(storage);
  await f.game.init();
  return f;
}

// ---------------------------------------------------------------- доноры

/** срез игрока с уровнем level (форма save(): skills — пары id/стейт) */
export function playerDonor(level: number): Record<string, unknown> {
  return { v: 1, energy: 100, hp: 50, xp: 0, level, skills: [] };
}

/** срез квестов с открытыми ачивками (retro-факты уровня/боссов/«крупных») */
export function questsDonor(unlocked: string[]): Record<string, unknown> {
  const empty = {
    key: '',
    ids: [],
    baseline: {},
    rerollUsed: false,
    completed: [],
    claimed: [],
    progress: {},
    steps: {},
  };
  return {
    v: 1,
    daily: empty,
    weekly: empty,
    chains: { step: {}, granted: [], progress: {} },
    achievements: { unlocked, claimed: [] },
    flags: [],
  };
}

// ---------------------------------------------------------------- хелперы

export interface ViewShape {
  header: string;
  lines: string[];
}

export function viewText(r: R<ViewShape> | ViewShape): string {
  if ('ok' in r) return r.ok ? [r.value.header, ...r.value.lines].join('\n') : `ERR: ${r.error}`;
  return [r.header, ...r.lines].join('\n');
}

export function eventsOf(f: PassivesFixture, name: string): Array<Record<string, unknown>> {
  return f.events.filter((e) => e.name === name).map((e) => e.payload);
}

export function grantGold(f: PassivesFixture, qty: number): void {
  f.game.transaction.transact({ grants: [{ t: 'currency', id: 'gold', qty }], eventId: 'selfcheck.setup' });
}

export function goldOf(f: PassivesFixture): number {
  return f.game.wallet.get('gold');
}

/** resolve стата в контексте игрока (витрина шины) */
export function resolveOf(f: PassivesFixture, stat: string): number {
  return f.game.statBus.resolve({ stat, ctx: f.game.time.ctx('player') });
}

/** выделить узел (короткий алиас для последовательностей) */
export function alloc(f: PassivesFixture, id: string): R<ViewShape> {
  return f.passives['passives.alloc'](id) as R<ViewShape>;
}

export function refund(f: PassivesFixture, id: string): R<ViewShape> {
  return f.passives['passives.refund'](id) as R<ViewShape>;
}

/** очки/потрачено/выделено после ensureInit (через витрину state) */
export function pointsLine(f: PassivesFixture): string {
  return viewText(f.passives['passives.state']() as ViewShape);
}

/** срез passives в файле сейва (экспорт → парс; undefined = ключа нет) */
export function passivesSliceOfExport(f: PassivesFixture): unknown {
  const parsed = JSON.parse(f.game.save.exportJson()) as { modules: Record<string, unknown> };
  return parsed.modules['passives'];
}
