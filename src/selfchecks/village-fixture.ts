/**
 * Fixture и хелперы self-checks M16 «Деревня» — общий модуль группы
 * (детерминизм: фиксированный saveId + ManualClock на T0 = 2026-10-28
 * 12:00 локальных, паттерн lake/fish-фикстур; роллы потребностей —
 * dailySeed-канон hash(saveId, 'village-needs', dateISO) — сид на дату,
 * weekly — на якорь iso-недели; подарки/помощь — стримы RngBus поверх
 * сидов дня). Гейт открывается ЧЕСТНЫМ путём: XP → уровень 30 + dev-unlock
 * ачивки «Мастер хутора» (канал M15 quests.unlockAch — флаг гейта).
 */
import { ManualClock } from '@/kernel/di/clock';
import { MemoryStorage } from '@/kernel/save/storage-drivers';
import { createGame, type Game } from '@/game/bootstrap';

export type R<T> = { ok: true; value: T } | { ok: false; error: string };

export const VILLAGE_T0 = new Date(2026, 9, 28, 12, 0, 0, 0).getTime();
export const VILLAGE_DAY = 86_400_000;

export interface VillageFixture {
  game: Game;
  clock: ManualClock;
  village: Record<string, (...args: unknown[]) => unknown>;
  quests: Record<string, (...args: unknown[]) => unknown>;
  player: Record<string, (...args: unknown[]) => unknown>;
  inv: Record<string, (...args: unknown[]) => unknown>;
  farm: Record<string, (...args: unknown[]) => unknown>;
  lake: Record<string, (...args: unknown[]) => unknown>;
  events: Array<{ name: string; payload: Record<string, unknown> }>;
  storage: MemoryStorage;
  dispose(): void;
}

const CAPTURED = [
  'village.taxCollected',
  'wallet.transaction',
  'item.consumed',
  'item.acquired',
  'player.levelUp',
  'achievement.unlocked',
] as const;

export async function makeVillageGame(storage?: MemoryStorage): Promise<VillageFixture> {
  const st = storage ?? new MemoryStorage();
  if (storage === undefined) {
    await st.set(
      'main',
      JSON.stringify({
        saveVersion: 15, // v15 жив (M14 ленивые срезы — без bump)
        savedAt: VILLAGE_T0,
        saveId: 'village-fixture-seeded',
        contentVersion: '0.1.0-phase0',
        modules: {},
        lastSeen: VILLAGE_T0,
      }),
    );
  }
  const clock = new ManualClock(VILLAGE_T0);
  const game = createGame(clock, st);
  const events: Array<{ name: string; payload: Record<string, unknown> }> = [];
  const subs = CAPTURED.map((name) =>
    game.bus.subscribe(name, (p) => events.push({ name, payload: p as Record<string, unknown> })),
  );
  await game.init();
  return {
    game,
    clock,
    storage: st,
    village: game.modules.get('village')?.api ?? {},
    quests: game.modules.get('quests')?.api ?? {},
    player: game.modules.get('player')?.api ?? {},
    inv: game.modules.get('inventory')?.api ?? {},
    farm: game.modules.get('farm')?.api ?? {},
    lake: game.modules.get('lake')?.api ?? {},
    events,
    dispose: () => {
      for (const off of subs) off();
      game.dispose();
    },
  };
}

/** фиксированный saveId (детерминизм роллов потребностей/стримов) */
export async function makeSeededVillageGame(saveId: string): Promise<VillageFixture> {
  const storage = new MemoryStorage();
  await storage.set(
    'main',
    JSON.stringify({
      saveVersion: 15,
      savedAt: VILLAGE_T0,
      saveId,
      contentVersion: '0.1.0-phase0',
      modules: {},
      lastSeen: VILLAGE_T0,
    }),
  );
  return makeVillageGame(storage);
}

// ---------------------------------------------------------------- хелперы

export function localDateISO(ms: number): string {
  const d = new Date(ms);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/** дневной тик на границе суток после T0+N дней (публикация как catchUp) */
export function dayTickAt(f: VillageFixture, plusDays: number): void {
  const ms = VILLAGE_T0 + plusDays * VILLAGE_DAY + VILLAGE_DAY / 2; // полдень границы
  f.clock.set(ms);
  f.game.bus.publish('time.dayTick', {
    dayIndex: Math.floor(ms / VILLAGE_DAY),
    now: ms,
    catchUp: true,
    dateISO: localDateISO(ms),
  });
}

/** открыть гейт ЧЕСТНЫМ путём: XP до 30+ и dev-unlock «Мастера хутора» */
export function openVillageGate(f: VillageFixture): void {
  f.player['player.addXp'](60000, 'fixture.gate');
  const r = f.quests['quests.unlockAch']('ach_homestead_master') as R<string>;
  if (!r.ok) throw new Error(`unlockAch: ${r.error}`);
  f.village['village.state'](); // материализация
}

export function goldOf(f: VillageFixture): number {
  return f.game.wallet.get('gold');
}

export function taxEventsOf(f: VillageFixture): Array<Record<string, unknown>> {
  return f.events.filter((e) => e.name === 'village.taxCollected').map((e) => e.payload);
}

export interface NeedRowF {
  id: string;
  name: string;
  profession: string;
  line: string;
}

export function needsOf(f: VillageFixture): NeedRowF[] {
  return f.village['village.need']('all') as NeedRowF[];
}

/** выдать предметы в инвентарь (канал acquire — ролл качества, D23) */
export function giveItems(f: VillageFixture, defId: string, qty: number): R<unknown> {
  return f.inv['inventory.acquire'](defId, qty, 'fixture.give') as R<unknown>;
}
