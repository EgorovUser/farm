/**
 * Self-checks M02 «Инвентарь», часть 1 — сейв-подгруппа (сеанс M02.1 §3.8):
 * roundtrip среза, миграция v3→v4 (D18), холодные загрузки v2/v3, v99-отказ.
 * Возвращает сырые результаты — группа собирается в inventory-checks.ts.
 */
import { ManualClock } from '@/kernel/di/clock';
import { MemoryStorage } from '@/kernel/save/storage-drivers';
import { migrateSaveData } from '@/kernel/save/migrations';
import { createGame, type Game } from '@/game/bootstrap';
import type { ItemInstance } from '@/game/modules/inventory/state';
import { check, type CheckResult } from './types';

/** 1 января 2024, 12:00 локального времени (общая с inventory-checks) */
export const INV_T0 = new Date(2024, 0, 1, 12, 0, 0, 0).getTime();

export interface InvSaveFixture {
  game: Game;
  api: Record<string, (...args: unknown[]) => unknown>;
  dispose(): void;
}

export function makeInvSaveGame(storage: MemoryStorage): InvSaveFixture {
  const game = createGame(new ManualClock(INV_T0), storage);
  const api = game.modules.get('inventory')?.api ?? {};
  return { game, api, dispose: () => game.dispose() };
}

function list(api: InvSaveFixture['api']): ItemInstance[] {
  return api['inventory.list']() as ItemInstance[];
}

function totalOf(api: InvSaveFixture['api'], defId: string): number {
  return list(api).filter((it) => it.defId === defId).reduce((s, i) => s + i.qty, 0);
}

export async function runInventorySaveChecks(): Promise<CheckResult[]> {
  const results: CheckResult[] = [];

  // --- roundtrip среза: save → load в новую игру
  // (состояние: руда 2500 тремя стаками + хлеб + меч)
  const storageRt = new MemoryStorage();
  const fSrc = makeInvSaveGame(storageRt);
  fSrc.api['inventory.add']('iron_ore', 'D', 50, 2500, 'selfcheck');
  fSrc.api['inventory.add']('bread', 'C', 30, 2, 'selfcheck');
  fSrc.api['inventory.add']('iron_sword', 'D', 50, 1, 'selfcheck');
  const fileJson = JSON.stringify(fSrc.game.save.buildFile());
  fSrc.dispose();
  const f6 = makeInvSaveGame(storageRt);
  await f6.game.init();
  const srcItems = (JSON.parse(fileJson) as { modules: { inventory: { items: ItemInstance[] } } }).modules.inventory.items;
  const loaded = list(f6.api);
  results.push(
    check('roundtrip среза: записи восстановлены (iid/qty/quality)', () =>
      loaded.length === srcItems.length &&
      loaded.every(
        (it, i) => it.iid === srcItems[i].iid && it.qty === srcItems[i].qty && it.quality.tier === srcItems[i].quality.tier,
      )),
  );
  f6.dispose();

  // --- миграция v3→v4 (D18): форма, без роллов, стэш поглощён
  const v3 = {
    saveVersion: 3,
    saveId: 'v3-stash',
    savedAt: INV_T0,
    contentVersion: '0.1.0-phase0',
    modules: {
      'kernel.wallet': { balances: [['gold', 5]] },
      'kernel.stash': { items: [['turnip', 5], ['iron_pickaxe', 1], ['iron_ore', 1200]] },
    },
    lastSeen: INV_T0,
  };
  const m34 = migrateSaveData(JSON.parse(JSON.stringify(v3)) as Record<string, unknown>);
  const invSlice = (m34.data.modules as Record<string, unknown>)['inventory'] as {
    items: Array<{
      defId: string;
      qty: number;
      quality: { tier: string; value: number };
      sharpeningLevel: number;
      rolledMods: unknown[];
      iid: string;
    }>;
  };
  results.push(
    // [M10.1 · v8] цепочка идёт до текущей версии: 3→4→5→6→7→8→9→10→11→12→13→14→15, 12 шагов (срезы modforge/shop/craft/forge/farm/pen/fishing/workers/mine) [M15 · v9][M05.1 · v10][M06.1 · v11][M07.1 · v12][M12.1 · v15]
    check('миграция 3→15: срез inventory создан, kernel.stash поглощён [M08 · v13 → M11 · v14 → M12.1 · v15]', () =>
      m34.data.saveVersion === 15 &&
      m34.steps === 12 &&
      invSlice !== undefined &&
      (m34.data.modules as Record<string, unknown>)['kernel.stash'] === undefined),
  );
  results.push(
    check('миграция 3→4: без роллов — качество D/50, sharpening 0, rolledMods []', () =>
      invSlice.items.every(
        (i) => i.quality.tier === 'D' && i.quality.value === 50 && i.sharpeningLevel === 0 && i.rolledMods.length === 0,
      )),
  );

  // --- холодная загрузка v3: конвертация + нормализация по контенту
  const storageV3 = new MemoryStorage();
  await storageV3.set('main', JSON.stringify(v3));
  const f7 = makeInvSaveGame(storageV3);
  await f7.game.init();
  results.push(
    check('холодная загрузка v3: стэш конвертирован, тоталы сохранены (5+1+1200)', () =>
      totalOf(f7.api, 'turnip') === 5 && totalOf(f7.api, 'iron_pickaxe') === 1 && totalOf(f7.api, 'iron_ore') === 1200),
  );
  results.push(
    check('нормализация загрузки: 1200 руды нарезана по maxStack 999 → 999+201', () => {
      const ores3 = list(f7.api).filter((i) => i.defId === 'iron_ore');
      return ores3.length === 2 && ores3.every((i) => i.qty <= 999);
    }),
  );
  results.push(
    check('нормализация загрузки: носителям — полная прочность (кирка 100/100)', () => {
      const pick = list(f7.api).find((i) => i.defId === 'iron_pickaxe');
      return pick?.durability?.current === 100 && pick?.durability?.max === 100;
    }),
  );
  results.push(
    // [M09 · v7] холодная загрузка v3 мигрирует до текущей версии 12 (срезы craft/quests/farm/pen/fishing в списке) [M15 · v9][M05.1 · v10][M06.1 · v11][M07.1 · v12]
    check('холодная загрузка v3: версия сейва 15, срезы inventory/modforge/shop/craft/forge/quests/farm/pen/fishing/lake/workers/mine в списке [M12.1 · v15]', () =>
      f7.game.save.info().saveVersion === 15 && f7.game.save.info().slices.includes('inventory') && f7.game.save.info().slices.includes('modforge') && f7.game.save.info().slices.includes('shop') && f7.game.save.info().slices.includes('craft') && f7.game.save.info().slices.includes('forge') && f7.game.save.info().slices.includes('quests') && f7.game.save.info().slices.includes('pen') && f7.game.save.info().slices.includes('fishing') && f7.game.save.info().slices.includes('mine')),
  );
  f7.dispose();

  // --- v2 → v4 по цепочке (gold 77 + стэш)
  const v2 = {
    saveVersion: 2,
    saveId: 'v2-gold',
    savedAt: INV_T0,
    contentVersion: '0.1.0-phase0',
    modules: {
      'kernel.wallet': { balances: [['gold', 77]] },
      'kernel.stash': { items: [['turnip', 2]] },
    },
    lastSeen: INV_T0,
  };
  const storageV2 = new MemoryStorage();
  await storageV2.set('main', JSON.stringify(v2));
  const f8 = makeInvSaveGame(storageV2);
  await f8.game.init();
  results.push(
    check('холодная загрузка v2: цепочка до v4, кошелёк 77 + предметы в инвентаре', () =>
      f8.game.wallet.get('gold') === 77 && totalOf(f8.api, 'turnip') === 2),
  );
  f8.dispose();

  // --- v99 — отказ по-прежнему жив
  let threw99 = false;
  try {
    migrateSaveData({ saveVersion: 99, modules: {} });
  } catch {
    threw99 = true;
  }
  results.push(check('версия из будущего (v99) — явный отказ миграции', () => threw99));

  return results;
}
