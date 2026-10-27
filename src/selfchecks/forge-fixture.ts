/**
 * Fixture и хелперы self-checks M10 «Заточка» — общий модуль группы
 * (детерминизм: фиксированный saveId + ManualClock на T0 — как craft-fixture;
 * попытки роллятся именованным стримом forge:attempt:<seq> поверх сида дня).
 */
import { ManualClock } from '@/kernel/di/clock';
import { MemoryStorage } from '@/kernel/save/storage-drivers';
import { createGame, type Game } from '@/game/bootstrap';

export type R<T> = { ok: true; value: T } | { ok: false; error: string };

export const FORGE_T0 = new Date(2024, 0, 1, 12, 0, 0, 0).getTime();

export interface ForgeFixture {
  game: Game;
  forge: Record<string, (...args: unknown[]) => unknown>;
  inv: Record<string, (...args: unknown[]) => unknown>;
  player: Record<string, (...args: unknown[]) => unknown>;
  /** захват событий заточки (attempt/success/rollback) */
  events: Array<{ name: string; payload: Record<string, unknown> }>;
  dispose(): void;
}

export function makeForgeGame(storage: MemoryStorage = new MemoryStorage()): ForgeFixture {
  const game = createGame(new ManualClock(FORGE_T0), storage);
  const events: Array<{ name: string; payload: Record<string, unknown> }> = [];
  // [M10.2] лента расширена: levelUp/cardChosen + карточные modforge.rolled
  const names = ['forge.attempt', 'forge.success', 'forge.rollback', 'forge.levelUp', 'forge.cardChosen', 'modforge.rolled'];
  const subs = names.map((name) =>
    game.bus.subscribe(name, (p) => events.push({ name, payload: p as Record<string, unknown> })),
  );
  return {
    game,
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

/** Фикстура с ФИКСИРОВАННЫМ saveId (детерминизм стримов попыток). Кошелёк — 0. */
export async function makeSeededForgeGame(saveId: string, storage = new MemoryStorage()): Promise<ForgeFixture> {
  await storage.set('main', JSON.stringify({
    saveVersion: 8,
    savedAt: FORGE_T0,
    saveId,
    contentVersion: '0.0.1',
    lastSeen: FORGE_T0,
    modules: { 'kernel.wallet': { balances: [['gold', 0]] } },
  }));
  const f = makeForgeGame(storage);
  await f.game.init();
  return f;
}

export function grantGold(f: ForgeFixture, qty: number): void {
  f.game.transaction.transact({
    grants: [{ t: 'currency', id: 'gold', qty }],
    eventId: 'selfcheck.m10-setup',
  });
}

/** выдать предмет ЯВНЫМ качеством (детерминизм, без роллов) */
export function giveItem(
  f: ForgeFixture,
  defId: string,
  tier: 'D' | 'C' | 'B' | 'A' | 'S' | 'SS',
  value: number,
  qty = 1,
): R<unknown> {
  return f.inv['inventory.add'](defId, tier, value, qty, 'selfcheck.m10') as R<unknown>;
}

/** поднять уровень игрока (гейты станка/круга/наковальни) */
export function addXp(f: ForgeFixture, amount: number): void {
  f.player['player.addXp'](amount, 'selfcheck.m10');
}

export function attempt(f: ForgeFixture, iid: string): R<{
  iid: string;
  defId: string;
  level: number;
  outcome: 'success' | 'fail' | 'rollback';
  toLevel: number;
  breakdown: { base: number; pity: number; circle: number; decline: number; chance: number; capped: boolean };
  rollbackChance: number;
  cost: { ingots: number; gold: number };
  pityFails: number;
  cards: { iid: string; level: number; restored: boolean; offered: boolean; chosen: Array<{ type: string; value: number }> | null; reason?: string } | null;
  frozen: boolean | null;
}> {
  return f.forge['forge.attempt'](iid) as never;
}

export function force(f: ForgeFixture, mode: 'success' | 'fail' | 'rollback' | 'off'): void {
  f.forge['forge.force'](mode);
}

/** [M10.2] режим карточек: auto (default) / ручной (успех оставляет предложение) */
export function autoCards(f: ForgeFixture, mode: 'on' | 'off'): void {
  f.forge['forge.auto'](mode);
}

/** [M10.2] ручной выбор/отказ карточки при активном предложении */
export function forgeCard(
  f: ForgeFixture,
  pick: number | 'decline',
  iid?: string,
): R<{ iid: string; level: number; restored: boolean; offered: boolean; chosen: Array<{ type: string; value: number }> | null; declined?: boolean; bonus?: number; reason?: string }> {
  return f.forge['forge.card'](pick, iid) as never;
}

/** купить станок + наковальню (гейты попытки); gold — грант заранее */
export function buyForgeSetup(f: ForgeFixture): void {
  f.forge['forge.buy']('whetstone');
  f.forge['forge.buy']('whetstone_circle');
}

export function backpack(f: ForgeFixture): Array<{
  iid: string;
  defId: string;
  qty: number;
  quality: { tier: string; value: number };
  rolledMods?: Array<{ type: string; value: number; from?: string; forgeLevel?: number }>;
  durability?: { current: number; max: number };
}> {
  return f.inv['inventory.list']() as never;
}

/** настроить меч под попытки (предмет/уровень/золото/слитки/станции) */
export async function setupSharpenable(saveId: string): Promise<{ f: ForgeFixture; iid: string }> {
  const f = await makeSeededForgeGame(saveId);
  giveItem(f, 'iron_sword', 'D', 0);
  const iid = firstIid(f, 'iron_sword');
  addXp(f, 600);
  grantGold(f, 5000);
  f.inv['inventory.add']('iron_ingot', 'D', 0, 200, 'selfcheck.m10');
  buyForgeSetup(f);
  f.game.modules.get('craft')?.api['craft.buy']('anvil');
  return { f, iid };
}

export function firstIid(f: ForgeFixture, defId: string): string {
  return backpack(f).find((i) => i.defId === defId)?.iid ?? '';
}
