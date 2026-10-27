/**
 * Fixture и хелперы self-checks M11 «Работники» — общий модуль группы
 * (детерминизм: фиксированный saveId + ManualClock на T0 = 2024-01-01 12:00,
 * паттерн lake/pen-фикстур; доска детерминирована dailySeed(saveId, дата) —
 * повторное создание той же пары-saveId-день даёт БАЙТ-В-БАЙТ ту же пятёрку).
 */
import { ManualClock } from '@/kernel/di/clock';
import { MemoryStorage } from '@/kernel/save/storage-drivers';
import { createGame, type Game } from '@/game/bootstrap';

export type R<T> = { ok: true; value: T } | { ok: false; error: string };

export const WORKERS_T0 = new Date(2024, 0, 1, 12, 0, 0, 0).getTime();
export const WORKERS_DAY = 86_400_000;

export interface WorkersFixture {
  game: Game;
  workers: Record<string, (...args: unknown[]) => unknown>;
  farm: Record<string, (...args: unknown[]) => unknown>;
  inv: Record<string, (...args: unknown[]) => unknown>;
  player: Record<string, (...args: unknown[]) => unknown>;
  clock: ManualClock;
  /** лента событий работников/транзакций/ривена (байт-строгие оракулы) */
  events: Array<{ name: string; payload: Record<string, unknown> }>;
  dispose(): void;
}

const CAPTURED = [
  'worker.hired',
  'worker.fired',
  'worker.sick',
  'worker.payday',
  'worker.actionDone',
  'wallet.transaction',
  'modforge.rolled',
] as const;

export function makeWorkersGame(storage: MemoryStorage = new MemoryStorage()): WorkersFixture {
  const clock = new ManualClock(WORKERS_T0);
  const game = createGame(clock, storage);
  const events: Array<{ name: string; payload: Record<string, unknown> }> = [];
  const subs = CAPTURED.map((name) =>
    game.bus.subscribe(name, (p) => events.push({ name, payload: p as Record<string, unknown> })),
  );
  return {
    game,
    clock,
    workers: game.modules.get('workers')?.api ?? {},
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

/** Фикстура с ФИКСИРОВАННЫМ saveId (детерминизм доски/роллов):
 *  подкладывает минимальный v14-сейв с данным saveId до init. */
export async function makeSeededWorkersGame(saveId: string): Promise<WorkersFixture> {
  const storage = new MemoryStorage();
  await storage.set(
    'main',
    JSON.stringify({
      saveVersion: 14,
      savedAt: WORKERS_T0,
      saveId,
      contentVersion: '0.1.0-phase0',
      modules: {},
      lastSeen: WORKERS_T0,
    }),
  );
  const f = makeWorkersGame(storage);
  await f.game.init();
  return f;
}

// ---------------------------------------------------------------- хелперы чеков

export interface BoardRowShape {
  idx: number;
  defId: string;
  name: string;
  profession: 'farmer' | 'fishkeeper' | 'herdsman';
  stars: number;
  salaryPerDay: number;
  checkPeriodHours: number;
  care: number;
  traits: Array<{ name: string; text: string }>;
  tool: string | null;
}

export interface ListRowShape {
  idx: number;
  defId: string;
  name: string;
  profession: 'farmer' | 'fishkeeper' | 'herdsman';
  stars: number;
  salaryPerDay: number;
  checkPeriodHours: number;
  object: string;
  objectName: string;
  mood: number;
  sick: boolean;
  sickUntil: number | null;
  bonusCooldownMs: number | null;
  traits: Array<{ name: string; text: string }>;
  lastAction: { at: number; taskId: string; success: boolean } | null;
}

export interface WorkersViewShape {
  board: BoardRowShape[];
  list: ListRowShape[];
  objects: Array<{ id: string; name: string; worker: string | null }>;
  limit: { hired: number; objects: number };
  salaryPerDay: number;
  moodCap: number;
}

/** витрина workers.list (board + list + объекты + лимит) */
export function workersView(f: WorkersFixture): WorkersViewShape {
  return f.workers['workers.list']() as WorkersViewShape;
}

/** витрина доски дня */
export function boardView(f: WorkersFixture): { dateISO: string; rows: BoardRowShape[] } {
  return f.workers['workers.board']() as { dateISO: string; rows: BoardRowShape[] };
}

/** нанять первый профиль профессии (или по индексу) */
export function hireFirstOf(f: WorkersFixture, profession: string): R<ListRowShape> {
  const { rows } = boardView(f);
  const row = rows.find((r) => r.profession === profession);
  if (row === undefined) return { ok: false, error: `на доске нет профессии ${profession}` };
  const r = f.workers['workers.hire'](row.idx) as R<unknown>;
  if (!r.ok) return r;
  const list = workersView(f).list;
  return { ok: true, value: list[list.length - 1] as ListRowShape };
}

/** дневной проход публикацией события (как ядро: локальная полночь;
 *  dateISO — тем же каноном time.localDateISO, что и доска) */
export function dayPass(f: WorkersFixture, now: number): void {
  f.clock.set(now);
  f.game.bus.publish('time.dayTick', {
    dayIndex: Math.floor(now / WORKERS_DAY),
    now,
    catchUp: false,
    crossed: 1,
    dateISO: f.game.time.localDateISO(now),
  });
}

/** часовой проход публикацией события (как ядро: часовые границы;
 *  catchUp=true — оффлайн-режим F13: тики работают, actionDone молчит) */
export function hourPass(f: WorkersFixture, now: number, catchUp = false): void {
  f.clock.set(now);
  f.game.bus.publish('time.hourTick', {
    hourIndex: Math.floor(now / 3_600_000),
    now,
    catchUp,
    crossed: 1,
  });
}

/** энергия игрока (снапшот — контракт энергий F10: тик БЕЗ энергии) */
export function energyOf(f: WorkersFixture): number {
  const snap = f.player['player.snapshot']() as unknown as { energy: { current: number } };
  return snap.energy.current;
}

/** события по имени (для payload-оракулов) */
export function eventsOf(f: WorkersFixture, name: string): Array<Record<string, unknown>> {
  return f.events.filter((e) => e.name === name).map((e) => e.payload);
}

/** ПОСЛЕДНИЙ ролл источника (маппинг-оракул — П6: роллы логируются) */
export function lastRollOf(f: WorkersFixture, source: string): number | null {
  const list = f.game.rngBus.rollLog().list().filter((e) => e.source === source);
  const entry = list[list.length - 1];
  if (!entry) return null;
  return Number(entry.output);
}
