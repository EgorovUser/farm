/**
 * Fixture и хелперы self-checks M07 «Рыбалка» — общий модуль группы
 * (детерминизм: фиксированный saveId + ManualClock на T0 = 2024-01-01 12:00,
 * паттерн pen/farm-фикстур; роллы заброса сидируются стримами
 * fish:cast:<loc>:category/:pick поверх dailySeed(saveId, дата)).
 */
import { ManualClock } from '@/kernel/di/clock';
import { MemoryStorage } from '@/kernel/save/storage-drivers';
import { createGame, type Game } from '@/game/bootstrap';

export type R<T> = { ok: true; value: T } | { ok: false; error: string };

export const FISH_T0 = new Date(2024, 0, 1, 12, 0, 0, 0).getTime();

export interface FishFixture {
  game: Game;
  fish: Record<string, (...args: unknown[]) => unknown>;
  inv: Record<string, (...args: unknown[]) => unknown>;
  player: Record<string, (...args: unknown[]) => unknown>;
  /** управляемые часы фикстуры */
  clock: ManualClock;
  /** лента событий рыбалки/инвентаря/энергии/транзакций (байт-строгие оракулы) */
  events: Array<{ name: string; payload: Record<string, unknown> }>;
  dispose(): void;
}

const CAPTURED = [
  'cast.completed',
  'fish.caught',
  'item.acquired',
  'item.consumed',
  'item.equipped',
  'player.energySpent',
  'wallet.transaction',
  'modforge.rolled',
] as const;

export function makeFishGame(storage: MemoryStorage = new MemoryStorage()): FishFixture {
  const clock = new ManualClock(FISH_T0);
  const game = createGame(clock, storage);
  const events: Array<{ name: string; payload: Record<string, unknown> }> = [];
  const subs = CAPTURED.map((name) =>
    game.bus.subscribe(name, (p) => events.push({ name, payload: p as Record<string, unknown> })),
  );
  return {
    game,
    clock,
    fish: game.modules.get('fishing')?.api ?? {},
    inv: game.modules.get('inventory')?.api ?? {},
    player: game.modules.get('player')?.api ?? {},
    events,
    dispose: () => {
      for (const off of subs) off();
      game.dispose();
    },
  };
}

/** Фикстура с ФИКСИРОВАННЫМ saveId (детерминизм роллов заброса):
 *  подкладывает минимальный v12-сейв с данным saveId до init. */
export async function makeSeededFishGame(saveId: string): Promise<FishFixture> {
  const storage = new MemoryStorage();
  await storage.set(
    'main',
    JSON.stringify({
      saveVersion: 12,
      savedAt: FISH_T0,
      saveId,
      contentVersion: '0.1.0-phase0',
      modules: {},
      lastSeen: FISH_T0,
    }),
  );
  const f = makeFishGame(storage);
  await f.game.init();
  return f;
}

// ---------------------------------------------------------------- хелперы чеков

export interface InvEntry {
  iid: string;
  defId: string;
  qty: number;
  rolledMods?: Array<{ type: string; value: number }>;
  durability?: { current: number; max: number };
}

/** список рюкзака (D30: без экипированных) */
export function invList(f: FishFixture): InvEntry[] {
  return f.inv['inventory.list']() as InvEntry[];
}

/** всего defId у игрока (рюкзак; экипированное — отдельно) */
export function countOf(f: FishFixture, defId: string): number {
  return invList(f).filter((i) => i.defId === defId).reduce((s, i) => s + i.qty, 0);
}

/** купить удочку/наживку и надеть в слот (полный живой путь приёмки §3.3) */
export function buyAndEquip(f: FishFixture, id: string, slot: 'rod' | 'bait'): R<string> {
  const buy = f.fish['fish.buy'](id) as R<{ iid: string }>;
  if (!buy.ok) return buy;
  const eq = f.inv['inventory.equip'](buy.value.iid, slot) as R<{ slot: string }>;
  if (!eq.ok) return eq;
  return { ok: true, value: buy.value.iid };
}

/** экипированный вид слота (D30) */
export function equippedOf(f: FishFixture, slot: string): { iid: string; defId: string; qty: number } | null {
  const view = f.inv['inventory.equipped']() as Array<{ slot: string; entry: { iid: string; defId: string; qty: number } }>;
  return view.find((e) => e.slot === slot)?.entry ?? null;
}

/** энергия игрока (снапшот) */
export function energyOf(f: FishFixture): number {
  return (f.player['player.snapshot']() as { energy: { current: number } }).energy.current;
}

/** XP/уровень игрока */
export function progressOf(f: FishFixture): { level: number; xp: number } {
  return (f.player['player.snapshot']() as { progress: { level: number; xp: number } }).progress;
}

/** навык (для XP-проверки рыболовства) */
export function skillOf(f: FishFixture, id: string): { level: number; xp: number } {
  const skills = f.player['skills.list']() as Array<{ id: string; level: number; xp: number }>;
  return skills.find((s) => s.id === id) ?? { level: 0, xp: 0 };
}

/** ролл из журнала по источнику (маппинг-оракул — П6: роллы логируются) */
export function rollOf(f: FishFixture, source: string): number | null {
  const entry = f.game.rngBus.rollLog().list().find((e) => e.source === source);
  if (!entry) return null;
  return Number(entry.output);
}

/** ПОСЛЕДНИЙ ролл источника (несколько забросов пишут в одни стримы) */
export function lastRollOf(f: FishFixture, source: string): number | null {
  const list = f.game.rngBus.rollLog().list().filter((e) => e.source === source);
  const entry = list[list.length - 1];
  if (!entry) return null;
  return Number(entry.output);
}

/** события по имени (для payload-оракулов) */
export function eventsOf(f: FishFixture, name: string): Array<Record<string, unknown>> {
  return f.events.filter((e) => e.name === name).map((e) => e.payload);
}

/** сценарный РНГ для чистых прогонов buildCastPlan (структурная типизация):
 *  rollRange возвращает значения очереди по порядку вызовов */
export function makeScriptRng(script: number[]): {
  rollRange: (min: number, max: number) => number;
  nextFloat: () => number;
  calls: string[];
} {
  let i = 0;
  const calls: string[] = [];
  return {
    rollRange(min: number, max: number) {
      const v = script[Math.min(i, script.length - 1)] ?? 0.5;
      i += 1;
      return v;
    },
    nextFloat() {
      const v = script[Math.min(i, script.length - 1)] ?? 0.5;
      i += 1;
      return v;
    },
    calls,
  };
}
