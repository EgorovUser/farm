/**
 * Self-checks M02.3 — сейв-подгруппа: F5-раундтрип ПОСЛЕ действий над
 * предметом (use/sell/wear, бриф §2.7) + идемпотентность повторной загрузки.
 * Возвращает сырые результаты — группа собирается в inventory-action-checks.ts
 * (паттерн M02.2: equip-checks + equip-save-checks).
 */
import { ManualClock } from '@/kernel/di/clock';
import { MemoryStorage } from '@/kernel/save/storage-drivers';
import { createGame, type Game } from '@/game/bootstrap';
import type { ItemInstance } from '@/game/modules/inventory/state';
import { check, type CheckResult } from './types';

/** 1 января 2024, 12:00 локального времени (общая с inventory-action-checks) */
const T0 = new Date(2024, 0, 1, 12, 0, 0, 0).getTime();

interface ActionSaveFixture {
  game: Game;
  api: Record<string, (...args: unknown[]) => unknown>;
  dispose(): void;
}

function makeGame(storage: MemoryStorage): ActionSaveFixture {
  const game = createGame(new ManualClock(T0), storage);
  const api = game.modules.get('inventory')?.api ?? {};
  return { game, api, dispose: () => game.dispose() };
}

type R<T> = { ok: true; value: T } | { ok: false; error: string };

function list(api: ActionSaveFixture['api']): ItemInstance[] {
  return api['inventory.list']() as ItemInstance[];
}

function equippedView(api: ActionSaveFixture['api']): Array<{ slot: string; entry: ItemInstance }> {
  return api['inventory.equipped']() as Array<{ slot: string; entry: ItemInstance }>;
}

export async function runInventoryActionSaveChecks(): Promise<CheckResult[]> {
  const results: CheckResult[] = [];

  // --- источник: use (энергия/HP-гранты D33) + sell (кошелёк) + wear (прочность)
  const storage = new MemoryStorage();
  const fSrc = makeGame(storage);
  fSrc.game.modules.call('player', 'player.addXp', 600, 'selfcheck'); // уровень 5
  fSrc.game.modules.call('player', 'player.setEnergy', 10);
  fSrc.game.modules.call('player', 'player.setHp', 20);
  fSrc.api['inventory.add']('apple_pie', 'D', 10, 5, 'selfcheck');
  fSrc.api['inventory.add']('bread', 'D', 30, 5, 'selfcheck');
  fSrc.api['inventory.add']('healing_salve', 'D', 20, 2, 'selfcheck');
  fSrc.api['inventory.add']('iron_sword', 'D', 50, 1, 'selfcheck');
  const pieIid = list(fSrc.api).find((it) => it.defId === 'apple_pie')?.iid ?? '';
  const salveIid = list(fSrc.api).find((it) => it.defId === 'healing_salve')?.iid ?? '';
  const swordIid = list(fSrc.api).find((it) => it.defId === 'iron_sword')?.iid ?? '';
  const use1 = fSrc.api['inventory.use'](pieIid) as R<unknown>; // энергия 10 + 20 = 30
  const use2 = fSrc.api['inventory.use'](pieIid) as R<unknown>; // 30 + 20 = 50
  const use3 = fSrc.api['inventory.use'](salveIid) as R<unknown>; // HP 20 + 15 = 35
  const sellR = fSrc.api['inventory.sell']('bread', 2) as R<{ gold: number }>; // +2 (1/шт)
  fSrc.api['inventory.equip'](swordIid, 'weapon');
  const wearR = fSrc.api['inventory.wear'](swordIid, 10) as R<{ current: number }>; // 80 − 10 = 70
  const goldBefore = fSrc.game.wallet.get('gold');
  fSrc.dispose(); // dispose сохраняет (bootstrap.dispose → save.save())

  // --- раундтрип: предметы/кошелёк/прочность/экипировка/гранты D33 восстановлены
  const fRt = makeGame(storage);
  await fRt.game.init();
  const snap = (f: ActionSaveFixture) =>
    JSON.stringify({ list: list(f.api), eq: equippedView(f.api), gold: f.game.wallet.get('gold') });
  const rtList = list(fRt.api);
  const rtEnergy = (fRt.game.modules.call('player', 'player.snapshot') as { energy: { current: number } }).energy.current;
  const rtHp = (fRt.game.modules.call('player', 'player.snapshot') as { hp: { current: number } }).hp.current;
  results.push(
    check('сейв-раундтрип после действий: use (стак 5→3, энергия 50, HP 35), sell (хлеб 3, кошелёк), wear (70/80 в слоте)', () => {
      if (!use1.ok || !use2.ok || !use3.ok || !sellR.ok || !wearR.ok) return false;
      const pie = rtList.find((it) => it.defId === 'apple_pie');
      const bread = rtList.find((it) => it.defId === 'bread');
      const salve = rtList.find((it) => it.defId === 'healing_salve');
      const eq = equippedView(fRt.api);
      return (
        pie?.qty === 3 &&
        bread?.qty === 3 &&
        salve?.qty === 1 &&
        rtEnergy === 50 &&
        rtHp === 35 &&
        fRt.game.wallet.get('gold') === goldBefore &&
        eq.length === 1 &&
        eq[0].slot === 'weapon' &&
        eq[0].entry.iid === swordIid &&
        eq[0].entry.durability?.current === 70
      );
    }),
  );

  // --- идемпотентность: повторная загрузка — байт-в-байт
  const snapshot1 = snap(fRt);
  fRt.dispose();
  const fRt2 = makeGame(storage);
  await fRt2.game.init();
  const snapshot2 = snap(fRt2);
  results.push(
    check('идемпотентность загрузки: повторный load после действий — байт-в-байт', () => snapshot1 === snapshot2),
  );
  fRt2.dispose();

  return results;
}
