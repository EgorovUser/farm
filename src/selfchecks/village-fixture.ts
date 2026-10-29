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
// [M16.3 · фикс хелпера] канонический инвариант weekly M16.1: удовлетворение
// ЛЮБОГО дня iso-недели закрывает weekly — guard «lastSatisfied === today»
// пропускал этот случай и supply честно отказывал (поймано чеком 35)
import { needSatisfied } from '@/game/modules/village/logic';
// [M16.3 · фикс хелпера №2] потребности бывают ВАЛЮТНЫМИ (мастер-пул M16.1:
// planks/nails/…) — рюкзак их не держит, кошелёк грантится напрямую
import { ITEMS } from '@/content/items/items';

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
  // [M16.3] события биржи (ровно ×1-оракулы чеков 30/32)
  'trade.fulfilled',
  'village.reputationChanged',
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
  /** [M16.3] день биржи (ленивый — материализуется при обращении) */
  trade?: {
    day: string;
    contracts: Record<string, { item: string; qty: number; premiumPercent: number }>;
    trends: Record<string, string>;
    fulfilled: Record<string, string>;
    history: Array<{ day: string; defId: string; kind: string; unit: number; qty: number }>;
    rerolls: number;
  };
  /** [M16.3] очки репутации (ленивый — при первом ИЗМЕНЕНИИ) */
  reputation?: Record<string, { points: number }>;
}

/** [M16.2] срез деревни из файла сейва (undefined — ключа нет: до гейта) */
export async function readVillageSlice(f: VillageFixture): Promise<VillageSliceShape | undefined> {
  await f.game.save.save();
  const raw = JSON.parse((await f.storage.get('main')) as string) as { modules: Record<string, unknown> };
  return raw.modules['village'] as VillageSliceShape | undefined;
}

/** [M16.2] удовлетворить все неудовлетворённые потребности текущего дня
 *  (поставки копят XP деревне; onlyDaily — шаг +8 для контролируемого XP;
 *  skip-правило — КАНОНИЧЕСКИЙ needSatisfied: weekly закрыта удовлетворением
 *  любого дня iso-недели — такая потребность пропускается молча) */
export async function satisfyVillageNeeds(f: VillageFixture, onlyDaily = false, xpBudget = Number.POSITIVE_INFINITY): Promise<void> {
  const slice = await readVillageSlice(f);
  const today = localDateISO(f.clock.now());
  for (const [id, lv] of Object.entries(slice?.villagers ?? {})) {
    if (lv.need === undefined || lv.lastSatisfied === today) continue;
    if (needSatisfied(lv.need as { item: string; qty: number; kind: 'daily' | 'weekly'; day: string }, lv.lastSatisfied ?? undefined)) continue;
    if (onlyDaily && lv.need.kind !== 'daily') continue;
    if ((slice?.xp ?? 0) + (lv.need.kind === 'weekly' ? 30 : 8) > xpBudget) continue;
    if (ITEMS.some((d) => d.id === lv.need!.item)) {
      giveItems(f, lv.need.item, lv.need.qty);
    } else {
      f.game.wallet.grant(lv.need.item as 'gold', lv.need.qty + 5); // валюта кошелька + запас
    }
    const r = f.village['village.supply'](id, lv.need.item) as R<unknown>;
    if (!r.ok) throw new Error(`supply ${id}: ${r.error}`);
  }
}

/** [M16.2] поднять деревню до уровня ≥ 2 поставками (честный путь XP) */
export async function raiseVillageToLevel2(f: VillageFixture): Promise<void> {
  await raiseVillageToLevel(f, 2, 8);
}

/** [M16.3] поднять деревню до уровня ≥ target поставками (честный путь XP:
 *  каждый день — удовлетворить все потребности, затем dayTick; цикл до
 *  уровня — паттерн raiseVillageToLevel2, обобщён для Рынка (уровень 6) */
export async function raiseVillageToLevel(f: VillageFixture, target: number, maxDays = 30): Promise<void> {
  for (let day = 0; day < maxDays; day++) {
    const slice = await readVillageSlice(f);
    if (villageLevelOf(slice?.xp ?? 0, VILLAGE_TABLE.level) >= target) return;
    await satisfyVillageNeeds(f);
    dayTickAt(f, day + 1);
  }
  throw new Error(`raiseVillageToLevel: уровень ${target} не достигнут за ${maxDays} дней`);
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

// ---------------------------------------------------------------- [M16.3] биржа

/** форма витрины биржи (чеки 27–36, общий модуль группы) */
export interface TradeViewF {
  day: string;
  contracts: Array<{ partnerId: string; item: string; qty: number; premiumPercent: number; estimateUnit: number | null; estimateTotal: number | null; fulfilledToday: boolean; gateLine: string | null }>;
  trends: Array<{ defId: string; kind: 'abundance' | 'deficit'; line: string }>;
  goods: Array<{ partnerId: string; defId: string; requiredLevelName: string; price: number; applied: string[]; gateLine: string | null }>;
  reputation: Array<{ partnerId: string; points: number; levelName: string; toNext: number | null }>;
  history: Array<{ defId: string; kind: string; unit: number; day: string; qty: number; arrow: string }>;
  marketDiscount: number;
}

export function tradeOf(f: VillageFixture): TradeViewF {
  return f.village['village.trade']() as TradeViewF;
}

export function tradeEventsOf(f: VillageFixture): Array<Record<string, unknown>> {
  return f.events.filter((e) => e.name === 'trade.fulfilled').map((e) => e.payload);
}

export function repEventsOf(f: VillageFixture): Array<Record<string, unknown>> {
  return f.events.filter((e) => e.name === 'village.reputationChanged').map((e) => e.payload);
}

/** исполнить сегодняшний контракт партнёра (дать предметы → fulfill) */
export function fulfillToday(f: VillageFixture, partnerId: string): R<unknown> {
  const view = tradeOf(f);
  const c = view.contracts.find((r) => r.partnerId === partnerId)!;
  giveItems(f, c.item, c.qty);
  return f.village['village.trade.fulfill'](partnerId) as R<unknown>;
}
