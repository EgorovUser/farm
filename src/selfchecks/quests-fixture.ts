/**
 * Fixture и хелперы self-checks M15 «Квесты и ачивки» — общий модуль группы
 * (детерминизм: фиксированный saveId + ManualClock на T0 = 2024-01-01 12:00,
 * как forge/craft-фикстуры; ролл дня — dailySeed(saveId, dateISO)).
 */
import { ManualClock } from '@/kernel/di/clock';
import { MemoryStorage } from '@/kernel/save/storage-drivers';
import { createGame, type Game } from '@/game/bootstrap';
import { achievementsSchema, questsDailySchema } from '@/content/quests/schemas';
import type { AchievementDef, QuestDef } from '@/content/quests/types';

export type R<T> = { ok: true; value: T } | { ok: false; error: string };

export const QUESTS_T0 = new Date(2024, 0, 1, 12, 0, 0, 0).getTime();
export const DAY_MS = 86_400_000;

export interface QuestsFixture {
  game: Game;
  quests: Record<string, (...args: unknown[]) => unknown>;
  forge: Record<string, (...args: unknown[]) => unknown>;
  inv: Record<string, (...args: unknown[]) => unknown>;
  player: Record<string, (...args: unknown[]) => unknown>;
  /** лента событий M15 + квитанции транзакций */
  events: Array<{ name: string; payload: Record<string, unknown> }>;
  dispose(): void;
}

const CAPTURED = [
  'quest.progress',
  'quest.completed',
  'quest.reminder',
  'achievement.unlocked',
  'wallet.transaction',
  'forge.success',
  'player.xpGained',
  'modforge.rolled',
];

export function makeQuestsGame(storage: MemoryStorage = new MemoryStorage()): QuestsFixture {
  const game = createGame(new ManualClock(QUESTS_T0), storage);
  const events: Array<{ name: string; payload: Record<string, unknown> }> = [];
  const subs = CAPTURED.map((name) =>
    game.bus.subscribe(name, (p) => events.push({ name, payload: p as Record<string, unknown> })),
  );
  return {
    game,
    quests: game.modules.get('quests')?.api ?? {},
    forge: game.modules.get('forge')?.api ?? {},
    inv: game.modules.get('inventory')?.api ?? {},
    player: game.modules.get('player')?.api ?? {},
    events,
    dispose: () => {
      for (const off of subs) off();
      game.dispose();
    },
  };
}

/** Фикстура с ФИКСИРОВАННЫМ saveId (детерминизм роллов дня). Кошелёк — 0.
 *  dailyPool/achievementsPool — ПОДМЕНА ДАННЫХ: пулы до init перерегистрируются
 *  в реестре контента (движок не трогается, П1; контролируемый ролл/пул для
 *  чеков — «ноль спец-обработчиков»: новый шаблон в данных живёт без кода). */
export async function makeSeededQuestsGame(
  saveId: string,
  storage = new MemoryStorage(),
  dailyPool?: QuestDef[],
  achievementsPool?: AchievementDef[],
): Promise<QuestsFixture> {
  await storage.set('main', JSON.stringify({
    saveVersion: 9,
    savedAt: QUESTS_T0,
    saveId,
    contentVersion: '0.0.1',
    lastSeen: QUESTS_T0,
    modules: { 'kernel.wallet': { balances: [['gold', 0]] } },
  }));
  const f = makeQuestsGame(storage);
  if (dailyPool) f.game.content.register('quests.daily', questsDailySchema, dailyPool);
  if (achievementsPool) f.game.content.register('quests.achievements', achievementsSchema, achievementsPool);
  await f.game.init();
  return f;
}

export function grantGold(f: QuestsFixture, qty: number): void {
  f.game.transaction.transact({
    grants: [{ t: 'currency', id: 'gold', qty }],
    eventId: 'selfcheck.m15-setup',
  });
}

/** выдать предмет ЯВНЫМ качеством (детерминизм, без роллов) */
export function giveItem(f: QuestsFixture, defId: string, qty = 1): R<unknown> {
  return f.inv['inventory.add'](defId, 'D', 0, qty, 'selfcheck.m15') as R<unknown>;
}

export function addXp(f: QuestsFixture, amount: number): void {
  f.player['player.addXp'](amount, 'selfcheck.m15');
}

/** сдвиг часов + явный catchUp (прецедент craft-fixture: advanceTime — no-op для ManualClock) */
export function advanceWithCatchUp(f: QuestsFixture, ms: number): void {
  const from = f.game.clock.now();
  (f.game.clock as ManualClock).advance(ms);
  f.game.catchUp(from, f.game.clock.now());
}

export interface QuestRowView {
  id: string;
  kind: string;
  name: string;
  description: string;
  step: number;
  stepsTotal: number;
  progress: number;
  goal: number;
  completed: boolean;
  claimed: boolean;
  claimable: boolean;
  rewards: Array<{ t: string; id?: string; defId?: string; qty?: number; flag?: string }>;
  finished: boolean;
  locked?: boolean;
  unlockText?: string;
}

export interface AchRowView {
  id: string;
  name: string;
  unlocked: boolean;
  claimed: boolean;
  hidden: boolean;
  rewards: Array<{ t: string; id?: string; defId?: string; qty?: number; flag?: string }>;
}

export function listQuests(f: QuestsFixture, kind: 'daily' | 'weekly' | 'chain'): QuestRowView[] {
  return f.quests['quests.list'](kind) as QuestRowView[];
}

export function listAch(f: QuestsFixture): AchRowView[] {
  return f.quests['quests.list']('ach') as AchRowView[];
}

export function claim(f: QuestsFixture, id: string): R<unknown> {
  return f.quests['quests.claim'](id) as R<unknown>;
}

export function reroll(f: QuestsFixture, id: string): R<{ removed: string; added: string }> {
  return f.quests['quests.rerollDaily'](id) as R<{ removed: string; added: string }>;
}

export function devComplete(f: QuestsFixture, id: string): R<string> {
  return f.quests['quests.complete'](id) as R<string>;
}

export function devUnlock(f: QuestsFixture, id: string): R<string> {
  return f.quests['quests.unlockAch'](id) as R<string>;
}

export function flagsOf(f: QuestsFixture): string[] {
  return f.quests['quests.flags']() as string[];
}

/** настроить меч под успешные заточки (станок/наковальня/материалы) */
export function setupForgeSuccess(f: QuestsFixture, saveIdTag: string): string {
  addXp(f, 600); // уровень 5 — гейт наковальни
  grantGold(f, 5000);
  giveItem(f, 'iron_sword');
  f.inv['inventory.add']('iron_ingot', 'D', 0, 100, `selfcheck.m15-${saveIdTag}`);
  f.forge['forge.buy']('whetstone');
  f.game.modules.get('craft')?.api['craft.buy']('anvil');
  f.forge['forge.force']('success');
  const iid = (f.inv['inventory.list']() as Array<{ iid: string; defId: string }>).find((i) => i.defId === 'iron_sword')?.iid ?? '';
  return iid;
}
