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
import { VILLAGE_TABLE, villageLevelOf } from '@/content/village/table';

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

/** дневной тик дня N (полдень дня T0+N — T0 сам полдень, dateISO = ЭТОТ
 * день; публикация как catchUp — паттерн lake-фикстур) */
export function dayTickAt(f: VillageFixture, plusDays: number): void {
  const ms = VILLAGE_T0 + plusDays * VILLAGE_DAY; // полдень дня plusDays
  f.clock.set(ms);
  f.game.bus.publish('time.dayTick', {
    dayIndex: Math.floor(ms / VILLAGE_DAY),
    now: ms,
    catchUp: true,
    dateISO: localDateISO(ms),
  });
}

/** часовой тик в момент ms (граница epoch-часа; catchUp-класс — тот же
 * контракт, что time-service/offline-catchup: {hourIndex, now, catchUp}) */
export function hourTickAt(f: VillageFixture, ms: number): void {
  f.clock.set(ms);
  f.game.bus.publish('time.hourTick', {
    hourIndex: Math.floor(ms / 3_600_000),
    now: ms,
    catchUp: true,
    crossed: [],
  });
}

/** [M16.2] форма среза деревни (ленивые вложенные ключи — опциональны) */
export interface VillageSliceShape {
  unlocked: boolean;
  xp: number;
  villagers: Record<string, {
    happiness: number;
    grumbleDays: number;
    lastSatisfied?: string;
    need?: { item: string; qty: number; kind: string; day: string };
  }>;
  helpLastDay: string | null;
  buildings?: Record<string, { level: number; builtAt?: string }>;
  construction?: Record<string, { finishAt: number }>;
  equipped?: Record<string, { defId: string; tier: string; value: number; sharpening: number }>;
  raid?: { week: string; warned: boolean; lastResult?: { success: boolean; stolen: number; dateISO: string; week: string } };
}

/** [M16.2] срез деревни из файла сейва (undefined — ключа нет: до гейта) */
export async function readVillageSlice(f: VillageFixture): Promise<VillageSliceShape | undefined> {
  await f.game.save.save();
  const raw = JSON.parse((await f.storage.get('main')) as string) as { modules: Record<string, unknown> };
  return raw.modules['village'] as VillageSliceShape | undefined;
}

/** [M16.2] удовлетворить все неудовлетворённые потребности текущего дня
 *  (поставки копят XP деревне; onlyDaily — шаг +8 для контролируемого XP) */
export async function satisfyVillageNeeds(f: VillageFixture, onlyDaily = false, xpBudget = Number.POSITIVE_INFINITY): Promise<void> {
  const slice = await readVillageSlice(f);
  const today = localDateISO(f.clock.now());
  for (const [id, lv] of Object.entries(slice?.villagers ?? {})) {
    if (lv.need === undefined || lv.lastSatisfied === today) continue;
    if (onlyDaily && lv.need.kind !== 'daily') continue;
    if ((slice?.xp ?? 0) + (lv.need.kind === 'weekly' ? 30 : 8) > xpBudget) continue;
    giveItems(f, lv.need.item, lv.need.qty);
    const r = f.village['village.supply'](id, lv.need.item) as R<unknown>;
    if (!r.ok) throw new Error(`supply ${id}: ${r.error}`);
  }
}

/** [M16.2] поднять деревню до уровня ≥ 2 поставками (честный путь XP) */
export async function raiseVillageToLevel2(f: VillageFixture): Promise<void> {
  for (let day = 0; day < 8; day++) {
    const slice = await readVillageSlice(f);
    if (villageLevelOf(slice?.xp ?? 0, VILLAGE_TABLE.level) >= 2) return;
    await satisfyVillageNeeds(f);
    dayTickAt(f, day + 1);
  }
  throw new Error('raiseVillageToLevel2: уровень 2 не достигнут за 8 дней');
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
