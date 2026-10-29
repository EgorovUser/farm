/**
 * Fixture и хелперы self-checks M17 «Соц-заглушки» — общий модуль группы
 * (детерминизм: фиксированный saveId + ManualClock на T0 = 2026-10-30
 * 12:00 локальных, паттерн village-fixture; выбор заметок/писем —
 * dailySeed-потоки social-board/social-letters — сиды на дату).
 * Гейт деревни открывается ЧЕСТНЫМ путём (XP → уровень 30 + dev-unlock
 * ачивки «Мастер хутора» — канал M15 quests.unlockAch, прецедент
 * openVillageGate M16.1).
 */
import { ManualClock } from '@/kernel/di/clock';
import { MemoryStorage } from '@/kernel/save/storage-drivers';
import { createGame, type Game } from '@/game/bootstrap';

export type R<T> = { ok: true; value: T } | { ok: false; error: string };

export const SOCIAL_T0 = new Date(2026, 9, 30, 12, 0, 0, 0).getTime();
export const SOCIAL_DAY = 86_400_000;

export interface SocialFixture {
  game: Game;
  clock: ManualClock;
  social: Record<string, (...args: unknown[]) => unknown>;
  village: Record<string, (...args: unknown[]) => unknown>;
  quests: Record<string, (...args: unknown[]) => unknown>;
  player: Record<string, (...args: unknown[]) => unknown>;
  inv: Record<string, (...args: unknown[]) => unknown>;
  events: Array<{ name: string; payload: Record<string, unknown> }>;
  storage: MemoryStorage;
  dispose(): void;
}

/** все события, которые МОГЛИ бы возникнуть от соц-чтений (оракул: ×0) */
const CAPTURED = [
  'wallet.transaction',
  'item.acquired',
  'item.consumed',
  'achievement.unlocked',
  'player.levelUp',
  'village.taxCollected',
  'trade.fulfilled',
  'invalidate.stat',
  'invalidate.price',
] as const;

export async function makeSocialGame(storage?: MemoryStorage): Promise<SocialFixture> {
  const st = storage ?? new MemoryStorage();
  if (storage === undefined) {
    await st.set(
      'main',
      JSON.stringify({
        saveVersion: 15, // v15 жив (срез social ленивый — без bump)
        savedAt: SOCIAL_T0,
        saveId: 'social-fixture',
        contentVersion: '0.1.0-phase0',
        modules: {},
        lastSeen: SOCIAL_T0,
      }),
    );
  }
  const clock = new ManualClock(SOCIAL_T0);
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
    social: game.modules.get('social')?.api ?? {},
    village: game.modules.get('village')?.api ?? {},
    quests: game.modules.get('quests')?.api ?? {},
    player: game.modules.get('player')?.api ?? {},
    inv: game.modules.get('inventory')?.api ?? {},
    events,
    dispose: () => {
      for (const off of subs) off();
      game.dispose();
    },
  };
}

/** фиксированный saveId (детерминизм соц-витрин дня) */
export async function makeSeededSocialGame(saveId: string): Promise<SocialFixture> {
  const storage = new MemoryStorage();
  await storage.set(
    'main',
    JSON.stringify({
      saveVersion: 15,
      savedAt: SOCIAL_T0,
      saveId,
      contentVersion: '0.1.0-phase0',
      modules: {},
      lastSeen: SOCIAL_T0,
    }),
  );
  return makeSocialGame(storage);
}

// ---------------------------------------------------------------- хелперы

export function localDateISO(ms: number): string {
  const d = new Date(ms);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/** дневной тик дня N (полдень дня T0+N — паттерн village-fixture) */
export function dayTickAt(f: SocialFixture, plusDays: number): void {
  const ms = SOCIAL_T0 + plusDays * SOCIAL_DAY;
  f.clock.set(ms);
  f.game.bus.publish('time.dayTick', {
    dayIndex: Math.floor(ms / SOCIAL_DAY),
    now: ms,
    catchUp: true,
    dateISO: localDateISO(ms),
  });
}

/** открыть гейт деревни ЧЕСТНЫМ путём (XP + ачивка M15 — прецедент M16.1) */
export function openSocialVillage(f: SocialFixture): void {
  f.player['player.addXp'](60000, 'fixture.gate');
  const r = f.quests['quests.unlockAch']('ach_homestead_master') as R<string>;
  if (!r.ok) throw new Error(`unlockAch: ${r.error}`);
  f.village['village.state'](); // материализация деревни
}

/** выдать предметы в инвентарь (канал acquire — паттерн village-fixture) */
export function giveItems(f: SocialFixture, defId: string, qty: number): R<unknown> {
  return f.inv['inventory.acquire'](defId, qty, 'fixture.give') as R<unknown>;
}

/** срез social из файла сейва (undefined — ключа нет: до mail read) */
export async function readSocialSlice(f: SocialFixture): Promise<{ v: number; mailReadDay?: string } | undefined> {
  await f.game.save.save();
  const raw = JSON.parse((await f.storage.get('main')) as string) as { modules: Record<string, unknown> };
  return raw.modules['social'] as { v: number; mailReadDay?: string } | undefined;
}

// ---------------------------------------------------------------- формы витрин

export interface BoardViewF {
  day: string;
  locked: boolean;
  gateLines: string[];
  notes: Array<{ id: string; kind: string; text: string }>;
  rerolls: number;
}

export interface MailViewF {
  day: string;
  locked: boolean;
  gateLines: string[];
  letters: Array<{ id: string; kind: string; author: string; subject: string; body: string }>;
  unread: number;
  mailReadDay: string | null;
}

export interface ProfileViewF {
  day: string;
  title: string;
  player: { level: number; xp: number; xpNeed: number };
  gold: number;
  achievements: { unlocked: number; pool: number };
  counters: Array<{ id: string; label: string; value: number }>;
  skills: Array<{ id: string; name: string; level: number }>;
  village: { unlocked: boolean; gateLines: string[] };
  reputation: Array<{ partnerId: string; partnerName: string; levelName: string; points: number }>;
}

export interface SocialStateViewF {
  day: string;
  mailReadDay: string | null;
  readToday: boolean;
  village: { unlocked: boolean; gateLines: string[] };
  title: string;
  rerolls: number;
}

export function boardOf(f: SocialFixture): BoardViewF {
  return f.social['social.board']() as BoardViewF;
}

export function mailOf(f: SocialFixture, action?: string): MailViewF {
  return f.social['social.mail'](action) as MailViewF;
}

export function profileOf(f: SocialFixture): ProfileViewF {
  return f.social['social.profile']() as ProfileViewF;
}

export function socialStateOf(f: SocialFixture): SocialStateViewF {
  return f.social['social.state']() as SocialStateViewF;
}

// ---------------------------------------------------------------- хелперы конвейера

/** витрины деревни из publicApi (тот же канал, что у модуля через deps) */
export function vitrinesOf(f: SocialFixture): import('@/game/modules/social/deps').SocialVitrines {
  return {
    state: f.village['village.state']() as import('@/game/modules/social/deps').SocialVillageStateVitrine,
    trade: f.village['village.trade']() as import('@/game/modules/social/deps').SocialTradeVitrine,
    raid: f.village['village.raid']() as import('@/game/modules/social/deps').SocialRaidVitrine,
    buildings: f.village['village.build']() as import('@/game/modules/social/deps').SocialBuildingsVitrine,
  };
}

/** тот же itemName, что у модуля (общий каталог items) */
export function itemNameOf(f: SocialFixture): (defId: string) => string {
  const items = f.game.content.get<Array<{ id: string; name: string }>>('items');
  return (defId: string) => items.find((d) => d.id === defId)?.name ?? defId;
}

/** сырой словарь modules файла сейва (честная истина ключей) */
export async function rawModules(f: SocialFixture): Promise<Record<string, unknown>> {
  await f.game.save.save();
  const raw = JSON.parse((await f.storage.get('main')) as string) as { modules: Record<string, unknown> };
  return raw.modules;
}
