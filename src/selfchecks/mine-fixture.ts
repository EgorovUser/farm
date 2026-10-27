/**
 * Fixture и хелперы self-checks M12 «Шахта» — общий модуль группы
 * (детерминизм: фиксированный saveId + ManualClock на T0 = 2024-01-01 12:00,
 * паттерн workers/lake-фикстур; стримы RngBus детерминированы сидом игры —
 * одинаковый вход даёт одинаковый бой).
 */
import { ManualClock } from '@/kernel/di/clock';
import { MemoryStorage } from '@/kernel/save/storage-drivers';
import { createGame, type Game } from '@/game/bootstrap';
import { MINE_MOBS, type MineMobDef } from '@/content/mine/mobs';
import type { EnemyCombat, FightGear } from '@/game/modules/mine/logic/fight';

export type R<T> = { ok: true; value: T } | { ok: false; error: string };

export const MINE_T0 = new Date(2024, 0, 1, 12, 0, 0, 0).getTime();

export interface MineFixture {
  game: Game;
  mine: Record<string, (...args: unknown[]) => unknown>;
  player: Record<string, (...args: unknown[]) => unknown>;
  inv: Record<string, (...args: unknown[]) => unknown>;
  clock: ManualClock;
  /** лента событий шахты/HP/транзакций (байт-строгие оракулы) */
  events: Array<{ name: string; payload: Record<string, unknown> }>;
  dispose(): void;
}

const CAPTURED = [
  'mine.turnResolved',
  'mine.enemyKilled',
  // оракул отрицания: домен забега M13 / боссы M12.2 — НЕ публикуются
  'mine.runStarted',
  'mine.runEnded',
  'mine.bossKilled',
  'player.hpChanged',
  'wallet.transaction',
] as const;

export function makeMineGame(storage: MemoryStorage = new MemoryStorage()): MineFixture {
  const clock = new ManualClock(MINE_T0);
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

/** Фикстура с ФИКСИРОВАННЫМ saveId (детерминизм стримов): подкладывает
 *  минимальный v15-сейв с данным saveId до init. */
export async function makeSeededMineGame(saveId: string): Promise<MineFixture> {
  const storage = new MemoryStorage();
  await storage.set(
    'main',
    JSON.stringify({
      saveVersion: 15,
      savedAt: MINE_T0,
      saveId,
      contentVersion: '0.1.0-phase0',
      modules: {},
      lastSeen: MINE_T0,
    }),
  );
  const f = makeMineGame(storage);
  await f.game.init();
  return f;
}

// ---------------------------------------------------------------- хелперы чеков

export interface FightViewShape {
  header: string;
  rounds: string[];
  outcome: string;
  hp: { player: number; start: number; max: number };
  loot: { gold: number } | null;
}

export function fightOf(f: MineFixture, mobId: string, layer?: unknown, seed?: unknown): R<FightViewShape> {
  return f.mine['mine.fight'](mobId, layer, seed) as R<FightViewShape>;
}

export function eliteOf(
  f: MineFixture,
  mobId: string,
  mod: string,
  layer?: unknown,
  seed?: unknown,
): R<FightViewShape> {
  return f.mine['mine.elite'](mobId, mod, layer, seed) as R<FightViewShape>;
}

export function mineStateOf(f: MineFixture): {
  fights: number;
  kills: number;
  bossKills: number;
  deaths: number;
} {
  return f.mine['mine.state']() as { fights: number; kills: number; bossKills: number; deaths: number };
}

export function hpOf(f: MineFixture): number {
  const c = f.player['player.checkHp']() as { current: number; max: number };
  return c.current;
}

export function walletOf(f: MineFixture): number {
  return f.game.wallet.get('gold');
}

export function eventsOf(f: MineFixture, name: string): Array<Record<string, unknown>> {
  return f.events.filter((e) => e.name === name).map((e) => e.payload);
}

/** ПОСЛЕДНИЙ ролл источника (маппинг-оракул — П6: роллы логируются) */
export function lastRollOf(f: MineFixture, source: string): number | null {
  const list = f.game.rngBus.rollLog().list().filter((e) => e.source === source);
  const entry = list[list.length - 1];
  if (!entry) return null;
  return Number(entry.output);
}

// ------------------------------------------------ общая инфраструктура боевых чеков
// (распил 01 §6: mine-checks 572 > 500 → оркестратор + mine-battle-checks;
// прецедент workers-checks/workers-day-checks M11.2 — вывод НЕ меняется)

export function mobOf(id: string): MineMobDef {
  const m = MINE_MOBS.find((x) => x.id === id);
  if (m === undefined) throw new Error(`моб ${id} не найден в content/mine`);
  return m;
}

export const NO_GEAR: FightGear = { hasShield: false, blockSensePct: 0, fatedPct: 0, critPct: 0, damagePct: 0 };
export const SHIELD_GEAR: FightGear = { hasShield: true, blockSensePct: 0, fatedPct: 0, critPct: 0, damagePct: 0 };

/** сценарный ролл: карта значений по имени стрима (точные оракулы) */
export const scriptRoll = (map: Record<string, number>, fallback = 0.5) => (id: string): number =>
  id in map ? map[id]! : fallback;

/** дамми-враг для длинных серий (тест-двойник, паттерн mkWorker) */
export function dummyEnemy(over: Partial<EnemyCombat> = {}): EnemyCombat {
  return {
    key: 'dummy',
    mobId: 'dummy',
    name: 'Дамми',
    hp: 100_000,
    maxHp: 100_000,
    atk: 1,
    atkBase: 1,
    def: 0,
    speed: 1,
    evade: 0,
    attackDirs: [
      ['top', 'mid'],
      ['mid', 'bottom'],
    ],
    dot: 0,
    ...over,
  };
}
