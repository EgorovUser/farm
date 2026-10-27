/**
 * Fixture и хелперы self-checks M06 «Загон» — общий модуль группы
 * (детерминизм: фиксированный saveId + ManualClock на T0 = 2024-01-01 12:00,
 * паттерн farm/quests-фикстур; роллы качества покупки/сбора сидируются
 * стримами pen:buy:<species> и pen:collect:<defId> поверх
 * dailySeed(saveId, дата) — для ×2-идентичности фикстура создаётся
 * с ФИКСИРОВАННЫМ saveId).
 */
import { ManualClock } from '@/kernel/di/clock';
import { MemoryStorage } from '@/kernel/save/storage-drivers';
import { createGame, type Game } from '@/game/bootstrap';

export type R<T> = { ok: true; value: T } | { ok: false; error: string };

export const PEN_T0 = new Date(2024, 0, 1, 12, 0, 0, 0).getTime();

export interface PenFixture {
  game: Game;
  pen: Record<string, (...args: unknown[]) => unknown>;
  inv: Record<string, (...args: unknown[]) => unknown>;
  player: Record<string, (...args: unknown[]) => unknown>;
  /** управляемые часы фикстуры (decay/часовые — фикс-даты DI now()) */
  clock: ManualClock;
  /** лента событий загона/инвентаря/энергии/транзакций (байт-строгие оракулы) */
  events: Array<{ name: string; payload: Record<string, unknown> }>;
  dispose(): void;
}

const CAPTURED = [
  'pen.produceCollected',
  'pen.animalSick',
  'item.acquired',
  'item.consumed',
  'player.energySpent',
  'wallet.transaction',
] as const;

export function makePenGame(storage: MemoryStorage = new MemoryStorage()): PenFixture {
  const clock = new ManualClock(PEN_T0);
  const game = createGame(clock, storage);
  const events: Array<{ name: string; payload: Record<string, unknown> }> = [];
  const subs = CAPTURED.map((name) =>
    game.bus.subscribe(name, (p) => events.push({ name, payload: p as Record<string, unknown> })),
  );
  return {
    game,
    clock,
    pen: game.modules.get('pen')?.api ?? {},
    inv: game.modules.get('inventory')?.api ?? {},
    player: game.modules.get('player')?.api ?? {},
    events,
    dispose: () => {
      for (const off of subs) off();
      game.dispose();
    },
  };
}

/** Фикстура с ФИКСИРОВАННЫМ saveId (детерминизм роллов качества):
 *  подкладывает минимальный v11-сейв с данным saveId до init. */
export async function makeSeededPenGame(saveId: string): Promise<PenFixture> {
  const storage = new MemoryStorage();
  await storage.set(
    'main',
    JSON.stringify({
      saveVersion: 11,
      savedAt: PEN_T0,
      saveId,
      contentVersion: '0.1.0-phase0',
      modules: {},
      lastSeen: PEN_T0,
    }),
  );
  const f = makePenGame(storage);
  await f.game.init();
  return f;
}

// ---------------------------------------------------------------- хелперы чеков

export const PEN_HOUR = 3_600_000;
export const PEN_DAY = 86_400_000;

export interface AnimalRowView {
  idx: number;
  speciesId: string;
  name: string;
  quality: string;
  happiness: number;
  satiety: number;
  health: number;
  cleanliness: number;
  fedToday: boolean;
  pettedToday: boolean;
  hungryDays: number;
  dirtyDays: number;
  nextProduceAt: number | null;
  remainingMs: number | null;
  producing: boolean;
  /** [M06.2] болезнь/иммунитет (витрина) */
  sick: boolean;
  healRemainingMs: number | null;
  immuneRemainingMs: number | null;
}

export interface PenStateView2 {
  now: number;
  slots: { used: number; base: number };
  animals: AnimalRowView[];
  stock: Array<{ defId: string; qty: number; cap: number }>;
  overflow: Record<string, number>;
  reputationReady: boolean;
  /** [M06.2] новые блоки витрины (опционально для старых чеков) */
  manure?: { manure: number; cap: number };
  breeding?: { pen: number; speciesId: string; maxParentTier: string; remainingMs: number; waitingSlot: boolean } | null;
  pen2?: { slots: { used: number; base: number }; animals: AnimalRowView[] } | null;
  upgrades?: Record<string, number>;
}

/** витрина pen.state (sweep уже выполнен витриной) */
export function penView(f: PenFixture): PenStateView2 {
  return f.pen['pen.state']() as PenStateView2;
}

/** животное витрины по индексу */
export function animalAt(f: PenFixture, idx: number): AnimalRowView {
  return penView(f).animals.find((a) => a.idx === idx)!;
}

/** часовой проход публикацией события (как ядро: payload.now — точка прохода) */
export function hourPass(f: PenFixture, now: number): void {
  f.game.bus.publish('time.hourTick', {
    hourIndex: Math.floor(now / PEN_HOUR),
    now,
    catchUp: false,
    crossed: 1,
  });
}

/** дневной проход публикацией события (как ядро: локальная полночь) */
export function dayPass(f: PenFixture, now: number): void {
  f.game.bus.publish('time.dayTick', {
    dayIndex: Math.floor(now / PEN_DAY),
    now,
    catchUp: false,
    crossed: 1,
    dateISO: '2024-01-02',
  });
}

/** ролл из журнала по источнику (маппинг-оракул качества — П6: роллы
 *  логируются; прецедент farm-quality3 ВАЙРИНГ-чек) */
export function rollOf(f: PenFixture, source: string): number | null {
  const entry = f.game.rngBus.rollLog().list().find((e) => e.source === source);
  if (!entry) return null;
  return Number(entry.output);
}

/** поднять уровень игрока (player.addXp по порогам; кривая M01 — оракул) */
export function levelPlayerTo(f: PenFixture, target: number): void {
  for (let guard = 0; guard < 300; guard++) {
    const p = (f.player['player.snapshot']() as { progress: { level: number; xp: number; xpNeed: number } }).progress;
    if (p.level >= target) return;
    (f.player['player.addXp'] as unknown as (n: number, s: string) => unknown)(p.xpNeed - p.xp, 'selfcheck');
  }
}
