/**
 * Self-checks M02.2 — сейв-подгруппа: F5-раундтрип с экипировкой (слоты,
 * качество, прочность, роллы), провайдер после загрузки, идемпотентность.
 * Возвращает сырые результаты — группа собирается в inventory-equip-checks.ts
 * (паттерн M02.1: inventory-checks + inventory-save-checks).
 */
import { ManualClock } from '@/kernel/di/clock';
import { MemoryStorage } from '@/kernel/save/storage-drivers';
import { createGame, type Game } from '@/game/bootstrap';
import type { ItemInstance } from '@/game/modules/inventory/state';
import { check, type CheckResult } from './types';

/** 1 января 2024, 12:00 локального времени (общая с inventory-checks) */
const T0 = new Date(2024, 0, 1, 12, 0, 0, 0).getTime();

interface SaveFixture {
  game: Game;
  api: Record<string, (...args: unknown[]) => unknown>;
  dispose(): void;
}

function makeGame(storage: MemoryStorage): SaveFixture {
  const game = createGame(new ManualClock(T0), storage);
  const api = game.modules.get('inventory')?.api ?? {};
  return { game, api, dispose: () => game.dispose() };
}

type R<T> = { ok: true; value: T } | { ok: false; error: string };

function list(api: SaveFixture['api']): ItemInstance[] {
  return api['inventory.list']() as ItemInstance[];
}

function equippedView(api: SaveFixture['api']): Array<{ slot: string; slotName: string; entry: ItemInstance }> {
  return api['inventory.equipped']() as Array<{ slot: string; slotName: string; entry: ItemInstance }>;
}

export async function runInventoryEquipSaveChecks(): Promise<CheckResult[]> {
  const results: CheckResult[] = [];
  // --- 8. сейв: F5-раундтрип с экипировкой + идемпотентность загрузки (§2.7)
  const storageRt = new MemoryStorage();
  const fSrc = makeGame(storageRt);
  // уровень 5 — гейт меча (115+132+152+175 = 574 XP суммарно)
  fSrc.game.modules.call('player', 'player.addXp', 600, 'selfcheck');
  fSrc.api['inventory.add']('iron_sword', 'B', 61.5, 1, 'selfcheck');
  const rtIid = list(fSrc.api)[0].iid;
  fSrc.api['inventory.mod'](rtIid, 'atk_power', 25);
  fSrc.api['inventory.equip'](rtIid, 'weapon');
  fSrc.dispose(); // dispose сохраняет (bootstrap.dispose → save.save())
  const fRt = makeGame(storageRt);
  await fRt.game.init();
  const rtView = equippedView(fRt.api);
  results.push(
    check('сейв-раундтрип: слот → iid, качество, прочность, роллы восстановлены', () => {
      if (rtView.length !== 1 || rtView[0].slot !== 'weapon' || rtView[0].entry.iid !== rtIid) return false;
      const e = rtView[0].entry;
      return (
        e.quality.tier === 'B' &&
        e.quality.value === 61.5 &&
        e.durability?.current === 80 &&
        e.durability?.max === 80 &&
        e.rolledMods.length === 1 &&
        e.rolledMods[0].type === 'atk_power' &&
        e.rolledMods[0].value === 25
      );
    }),
  );
  results.push(
    check('сейв-раундтрип: провайдер жив после загрузки — resolve = 21 (17 × 1.25)', () => {
      const loaded = fRt.game.statBus.resolve({ stat: 'combat.attack', ctx: fRt.game.time.ctx('player') });
      return loaded === 21;
    }),
  );
  const snapshot1 = JSON.stringify({ list: list(fRt.api), eq: equippedView(fRt.api) });
  fRt.dispose();
  const fRt2 = makeGame(storageRt);
  await fRt2.game.init();
  const snapshot2 = JSON.stringify({ list: list(fRt2.api), eq: equippedView(fRt2.api) });
  results.push(
    check('идемпотентность загрузки: повторный load — состояние байт-в-байт', () => snapshot1 === snapshot2),
  );
  fRt2.dispose();

  return results;
}
