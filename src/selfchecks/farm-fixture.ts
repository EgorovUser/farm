/**
 * Fixture и хелперы self-checks M05 «Ферма» — общий модуль группы
 * (детерминизм: фиксированный saveId + ManualClock на T0 = 2024-01-01 12:00,
 * паттерн craft/quests-фикстур; роллы качества сбора сидируются стримами
 * farm:harvest:* поверх dailySeed(saveId, дата) — для ×2-идентичности
 * фикстура создаётся с ФИКСИРОВАННЫМ saveId).
 */
import { ManualClock } from '@/kernel/di/clock';
import { MemoryStorage } from '@/kernel/save/storage-drivers';
import { createGame, type Game } from '@/game/bootstrap';

export type R<T> = { ok: true; value: T } | { ok: false; error: string };

export const FARM_T0 = new Date(2024, 0, 1, 12, 0, 0, 0).getTime();

export interface FarmFixture {
  game: Game;
  farm: Record<string, (...args: unknown[]) => unknown>;
  inv: Record<string, (...args: unknown[]) => unknown>;
  player: Record<string, (...args: unknown[]) => unknown>;
  /** [M05.2] управляемые часы фикстуры (сухость/часовые — фикс-даты DI now()) */
  clock: ManualClock;
  /** лента событий фермы/инвентаря/энергии (для байт-строгих оракулов) */
  events: Array<{ name: string; payload: Record<string, unknown> }>;
  dispose(): void;
}

const CAPTURED = [
  'farm.tileChanged',
  'farm.cropHarvested',
  'farm.weedsAppeared',
  'item.acquired',
  'item.consumed',
  'player.energySpent',
  'player.xpGained',
  'wallet.transaction',
] as const;

export function makeFarmGame(storage: MemoryStorage = new MemoryStorage()): FarmFixture {
  const clock = new ManualClock(FARM_T0);
  const game = createGame(clock, storage);
  const events: Array<{ name: string; payload: Record<string, unknown> }> = [];
  const subs = CAPTURED.map((name) =>
    game.bus.subscribe(name, (p) => events.push({ name, payload: p as Record<string, unknown> })),
  );
  return {
    game,
    clock,
    farm: game.modules.get('farm')?.api ?? {},
    inv: game.modules.get('inventory')?.api ?? {},
    player: game.modules.get('player')?.api ?? {},
    events,
    dispose: () => {
      for (const off of subs) off();
      game.dispose();
    },
  };
}

/** Фикстура с ФИКСИРОВАННЫМ saveId (детерминизм роллов качества сбора):
 *  подкладывает минимальный v10-сейв с данным saveId до init. */
export async function makeSeededFarmGame(saveId: string): Promise<FarmFixture> {
  const storage = new MemoryStorage();
  await storage.set(
    'main',
    JSON.stringify({
      saveVersion: 10,
      savedAt: FARM_T0,
      saveId,
      contentVersion: '0.1.0-phase0',
      modules: {},
      lastSeen: FARM_T0,
    }),
  );
  const f = makeFarmGame(storage);
  await f.game.init();
  return f;
}

// ---------------------------------------------------------------- [M05.2] хелперы часовых чеков

export const FARM_HOUR = 3_600_000;

export interface TileView {
  index: number;
  state: string;
  cropId?: string;
  plantedAt?: number;
  grownAt?: number;
  wateredUntil?: number;
  weeds: number;
  fertilized?: boolean;
  /** [M05.3 · G5] replantable-поля */
  harvestsLeft?: number;
  fruitingUntil?: number;
  watered: boolean;
  wet: boolean;
  remainingMs: number | null;
}

/** тайл витрины farm.state (sweep уже выполнен витриной) */
export function tileOf(f: FarmFixture, idx: number): TileView {
  const v = f.farm['farm.state']() as { tabs: Array<{ tiles: TileView[] }> };
  return v.tabs[0]!.tiles.find((t) => t.index === idx)!;
}

/** часовой проход публикацией события (как ядро: payload.now — точка прохода) */
export function hourPass(f: FarmFixture, now: number): void {
  f.game.bus.publish('time.hourTick', {
    hourIndex: Math.floor(now / FARM_HOUR),
    now,
    catchUp: false,
    crossed: 1,
  });
}

/** временный override-100 шанса для ЦЕЛЕВОГО тайла (паттерн farm.weed spawn) */
export function forceWeedsChance(f: FarmFixture, tileIdx: number): () => void {
  const r = f.game.buffs.add(
    {
      id: `selfcheck.weeds.force.${tileIdx}`,
      source: { kind: 'buff', refId: 'selfcheck' },
      stat: 'farm.weeds.chancePercent',
      op: 'override',
      value: 100,
      tags: [`farm:tile:field:${tileIdx}`],
      label: 'selfcheck: гарантированное зарастание',
    },
    f.clock.now(),
  );
  if (!r.ok) throw new Error(r.error);
  return () => f.game.buffs.remove(`selfcheck.weeds.force.${tileIdx}`);
}

/** подготовка: ПШЕНИЦА в тайле 0 БЕЗ полива (never-watered — гейт READY
 *  держит growing вечно, sweep не трогает: сорняки растут все проходы;
 *  weedRiskMult wheat = 1.0 — форс-шанс ровно 100%, гарантия оракулов;
 *  тыква не годится: risk 0.9 делает «100%» = 90% — недетерминизм) */
export function seedWeedyWheat(f: FarmFixture): void {
  (f.inv['inventory.acquire'] as unknown as (d: string, q: number, s: string) => R<unknown>)(
    'seed_wheat',
    1,
    'selfcheck',
  );
  f.farm['farm.plow'](0);
  f.farm['farm.plant']('wheat', 0); // grownAt T0+4ч, not watered
}

/** подготовка: тыква в тайле 0, политая (grownAt T0+12ч > окно T0+8ч — сухость) */
export function seedPumpkin(f: FarmFixture): void {
  (f.inv['inventory.acquire'] as unknown as (d: string, q: number, s: string) => R<unknown>)(
    'seed_pumpkin',
    1,
    'selfcheck',
  );
  f.farm['farm.plow'](0);
  f.farm['farm.plant']('pumpkin', 0);
  f.farm['farm.water'](0);
}

// ---------------------------------------------------------------- [M05.3] хелперы части 3

/** поднять уровень игрока (player.addXp по порогам; кривая M01 — оракул) */
export function levelPlayerTo(f: FarmFixture, target: number): void {
  for (let guard = 0; guard < 300; guard++) {
    const p = (f.player['player.snapshot']() as { progress: { level: number; xp: number; xpNeed: number } }).progress;
    if (p.level >= target) return;
    (f.player['player.addXp'] as unknown as (n: number, s: string) => unknown)(p.xpNeed - p.xp, 'selfcheck');
  }
}

/** выдать предметы фикстуре (inventory.acquire, source selfcheck) */
export function acquireFor(f: FarmFixture, defId: string, qty: number): void {
  (f.inv['inventory.acquire'] as unknown as (d: string, q: number, s: string) => R<unknown>)(defId, qty, 'selfcheck');
}

/** купить улучшение фермы (farm.upgrade) */
export function buyUpgrade(f: FarmFixture, id: string): R<{ id: string; name: string }> {
  return f.farm['farm.upgrade'](id) as R<{ id: string; name: string }>;
}

/** тайл витрины farm.state в ЛЮБОЙ вкладке (sweep уже выполнен витриной) */
export function tileInTab(f: FarmFixture, tabId: string, idx: number): TileView {
  const v = f.farm['farm.state']() as { tabs: Array<{ id: string; tiles: TileView[] }> };
  return v.tabs.find((t) => t.id === tabId)!.tiles.find((t) => t.index === idx)!;
}

/** временный override-100 шанса для тайла ЛЮБОЙ вкладки (паттерн spawn) */
export function forceWeedsInTab(f: FarmFixture, tabId: string, tileIdx: number): () => void {
  const r = f.game.buffs.add(
    {
      id: `selfcheck.weeds.force.${tabId}.${tileIdx}`,
      source: { kind: 'buff', refId: 'selfcheck' },
      stat: 'farm.weeds.chancePercent',
      op: 'override',
      value: 100,
      tags: [`farm:tile:${tabId}:${tileIdx}`],
      label: 'selfcheck: гарантированное зарастание',
    },
    f.clock.now(),
  );
  if (!r.ok) throw new Error(r.error);
  return () => f.game.buffs.remove(`selfcheck.weeds.force.${tabId}.${tileIdx}`);
}
