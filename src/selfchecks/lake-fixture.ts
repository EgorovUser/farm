/**
 * Fixture и хелперы self-checks M08 «Озеро» — общий модуль группы
 * (детерминизм: фиксированный saveId + ManualClock на T0 = 2024-01-01 12:00,
 * паттерн pen/fish-фикстур; мутационные роллы сидируются стримом
 * lake:breed:<fishId>:mutation поверх dailySeed(saveId, дата)).
 */
import { ManualClock } from '@/kernel/di/clock';
import { MemoryStorage } from '@/kernel/save/storage-drivers';
import { createGame, type Game } from '@/game/bootstrap';

export type R<T> = { ok: true; value: T } | { ok: false; error: string };

export const LAKE_T0 = new Date(2024, 0, 1, 12, 0, 0, 0).getTime();

export interface LakeFixture {
  game: Game;
  lake: Record<string, (...args: unknown[]) => unknown>;
  fish: Record<string, (...args: unknown[]) => unknown>;
  inv: Record<string, (...args: unknown[]) => unknown>;
  player: Record<string, (...args: unknown[]) => unknown>;
  /** управляемые часы фикстуры (дрейф/икра — фикс-даты DI now()) */
  clock: ManualClock;
  /** лента событий озера/инвентаря/энергии/транзакций (байт-строгие оракулы) */
  events: Array<{ name: string; payload: Record<string, unknown> }>;
  dispose(): void;
}

const CAPTURED = [
  'lake.bred',
  'lake.fishSick',
  'item.acquired',
  'item.consumed',
  'player.energySpent',
  'wallet.transaction',
] as const;

export function makeLakeGame(storage: MemoryStorage = new MemoryStorage()): LakeFixture {
  const clock = new ManualClock(LAKE_T0);
  const game = createGame(clock, storage);
  const events: Array<{ name: string; payload: Record<string, unknown> }> = [];
  const subs = CAPTURED.map((name) =>
    game.bus.subscribe(name, (p) => events.push({ name, payload: p as Record<string, unknown> })),
  );
  return {
    game,
    clock,
    lake: game.modules.get('lake')?.api ?? {},
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

/** Фикстура с ФИКСИРОВАННЫМ saveId (детерминизм мутационных роллов):
 *  подкладывает минимальный v13-сейв с данным saveId до init. */
export async function makeSeededLakeGame(saveId: string): Promise<LakeFixture> {
  const storage = new MemoryStorage();
  await storage.set(
    'main',
    JSON.stringify({
      saveVersion: 14, // [M11 · v14] срез workers — миграция уже применена
      savedAt: LAKE_T0,
      saveId,
      contentVersion: '0.1.0-phase0',
      modules: {},
      lastSeen: LAKE_T0,
    }),
  );
  const f = makeLakeGame(storage);
  await f.game.init();
  return f;
}

// ---------------------------------------------------------------- хелперы чеков

export const LAKE_HOUR = 3_600_000;
export const LAKE_DAY = 86_400_000;

export interface LakeViewShape {
  now: number;
  activeLake: number;
  hasLake2: boolean;
  slots: { used: number; base: number };
  water: { temperature: number; cleanliness: number; driftPerDay: number };
  fish: Array<{
    idx: number;
    fishId: string;
    name: string;
    quality: string;
    hungry: boolean;
    sick: boolean;
    requirementsMet: boolean;
    requirementsText: string | null;
    sickChance: number;
  }>;
  pairs: Array<{ fishId: string; name: string; maxParentTier: string; remainingMs: number }>;
  roe: Array<{ fishId: string; name: string; tier: string; remainingMs: number; waitingSlot: boolean }>;
  stats: { released: number; bred: number; harvested: number };
  hungryCount: number;
  sickCount: number;
  feedPrice: number | null;
  upgrades: Array<{ id: string; name: string; price: number; bought: boolean; description: string }>;
  research: { built: boolean; mode: 'plus1' | 'plus2' | null; cooldownMs: number };
  other: { idx: number; water: { temperature: number; cleanliness: number }; slots: { used: number; base: number } } | null;
}

/** витрина lake.state (sweep уже выполнен витриной) */
export function lakeView(f: LakeFixture): LakeViewShape {
  return f.lake['lake.state']() as LakeViewShape;
}

/** рыба витрины по индексу слота */
export function fishAt(f: LakeFixture, idx: number): LakeViewShape['fish'][number] | undefined {
  return lakeView(f).fish.find((x) => x.idx === idx);
}

/** ЛЕГАЛИЗАЦИЯ ВРЕМЕНИ: часовой/дневной проход публикацией события — ЧАСЫ
 *  СИНХРОННЫ с точкой прохода (как живое ядро: payload.now === time.now()). */
export function hourPass(f: LakeFixture, now: number): void {
  f.clock.set(now);
  f.game.bus.publish('time.hourTick', {
    hourIndex: Math.floor(now / LAKE_HOUR),
    now,
    catchUp: false,
    crossed: 1,
  });
}

/** дневной проход публикацией события (как ядро: локальная полночь) */
export function dayPass(f: LakeFixture, now: number): void {
  f.clock.set(now);
  f.game.bus.publish('time.dayTick', {
    dayIndex: Math.floor(now / LAKE_DAY),
    now,
    catchUp: false,
    crossed: 1,
    dateISO: '2024-01-02',
  });
}

/** ПОСЛЕДНИЙ ролл источника (маппинг-оракул — П6: роллы логируются) */
export function lastRollOf(f: LakeFixture, source: string): number | null {
  const list = f.game.rngBus.rollLog().list().filter((e) => e.source === source);
  const entry = list[list.length - 1];
  if (!entry) return null;
  return Number(entry.output);
}

/** события по имени (для payload-оракулов) */
export function eventsOf(f: LakeFixture, name: string): Array<Record<string, unknown>> {
  return f.events.filter((e) => e.name === name).map((e) => e.payload);
}

/** энергия игрока (снапшот) */
export function energyOf(f: LakeFixture): number {
  return (f.player['player.snapshot']() as { energy: { current: number } }).energy.current;
}

/** положить рыбу в рюкзак с явным качеством (dev-канал inventory.add;
 *  для release-проб — то же, что даёт рыбалка acquire). value АВТО-УНИКАЛЕН
 *  (50, 51, …): одинаковые tier+value сливаются в один стак (D23), а пробам
 *  нужны отдельные iid-записи) */
let giveFishSeq = 0;
export function giveFish(f: LakeFixture, defId: string, tier: string, value?: number): R<string> {
  const v = value ?? 50 + (giveFishSeq++ % 40);
  const r = f.inv['inventory.add'](defId, tier, v, 1, 'selfcheck') as R<{ iids: string[] }>;
  if (!r.ok) return r;
  return { ok: true, value: r.value.iids[0] ?? '' };
}
