/**
 * Self-checks M07 «Рыбалка» — часть 3: миграция v12 + roundtrip.
 *
 * Оракулы: migrate11to12 (дефолт-срез fishing / донор v11 с живыми pen+farm →
 * v12: pen/farm целы + fishing-дефолт / идемпотентность / цепочка v3→v12 /
 * v99-отказ); roundtrip v12 байт-в-байт (живой улов/альбом/статы/локация).
 */
import { migrateSaveData, MIGRATIONS, SAVE_VERSION } from '@/kernel/save/migrations';
import { MemoryStorage } from '@/kernel/save/storage-drivers';
import { check, type CheckResult } from './types';
import { FISH_T0, buyAndEquip, makeFishGame, type R } from './fish-fixture';

export async function runFishMigrationChecks(): Promise<CheckResult[]> {
  const results: CheckResult[] = [];

  // ------------------------------------------------ 1. migrate11to12 + доноры
  {
    const v11 = {
      saveVersion: 11,
      saveId: 'm071-donor-v11',
      savedAt: FISH_T0,
      contentVersion: '0.1.0-phase0',
      modules: {
        pen: { v: 1, animals: [{ speciesId: 'chicken', quality: 'B', happiness: 80, satiety: 60, health: 100, cleanliness: 90 }], stock: { egg: 2 }, overflow: {} },
        farm: { v: 1, tabs: [{ id: 'field', kind: 'field', tiles: [{ index: 0, state: 'plowed', weeds: 0 }] }] },
        'kernel.wallet': { balances: [['gold', 777]] },
      },
      lastSeen: FISH_T0,
    };
    const m = migrateSaveData(JSON.parse(JSON.stringify(v11)) as unknown as Record<string, unknown>);
    const fishSlice = (m.data.modules as Record<string, unknown>)['fishing'];
    const withFish = {
      ...v11,
      modules: { ...v11.modules, fishing: { v: 1, location: 'pond', album: { crucian: 3 }, stats: { casts: 5, caught: 3 } } },
    };
    const m2 = migrateSaveData(JSON.parse(JSON.stringify(withFish)) as unknown as Record<string, unknown>);
    const fish2 = (m2.data.modules as Record<string, unknown>)['fishing'];
    const v3 = { saveVersion: 3, saveId: 'v3-fish', savedAt: FISH_T0, contentVersion: '0', modules: { 'kernel.wallet': { balances: [['gold', 7]] } }, lastSeen: FISH_T0 };
    const m3 = migrateSaveData(v3);
    let threw99 = false;
    try {
      migrateSaveData({ saveVersion: 99, saveId: 'x', savedAt: 0, contentVersion: '0', modules: {}, lastSeen: 0 });
    } catch {
      threw99 = true;
    }
    results.push(
      check('migrate11to12: v11-донор (живые pen/farm) → v13 + fishing-дефолт { location: pond, album: {}, статы нули }, pen/farm целы; идемпотентность (живой fishing НЕ перезаписан); v3→v13 10 шагов; v99 — отказ [M08 · v13] [M11 · v14 → M12.1 · v15: +1 шаг mine]', () =>
        m.data.saveVersion === 15 && m.steps === 4 &&
        JSON.stringify(fishSlice) === JSON.stringify({ v: 1, location: 'pond', album: {}, stats: { casts: 0, caught: 0 } }) &&
        (m.data.modules as Record<string, unknown>)['pen'] !== undefined &&
        (m.data.modules as Record<string, unknown>)['farm'] !== undefined &&
        m2.data.saveVersion === 15 && JSON.stringify(fish2) === JSON.stringify({ v: 1, location: 'pond', album: { crucian: 3 }, stats: { casts: 5, caught: 3 } }) &&
        m3.data.saveVersion === 15 && m3.steps === 12 &&
        (m3.data.modules as Record<string, unknown>)['fishing'] !== undefined &&
        threw99, {
        expected: 'v15/4 шага/дефолт; pen+farm целы; идемпотентно; v3→15 12 шагов; v99 отказ',
        actual: `v${m.data.saveVersion} ${m.steps} шаг; fishing ${JSON.stringify(fishSlice)}; идем ${JSON.stringify(fish2)}; v3→${m3.data.saveVersion} ${m3.steps}; v99 ${threw99}`,
      }),
    );
    results.push(
      // [M08 · v13] легализация: цепочка выросла на migrate12to13 (срез lake) — [M11 · v14] + migrate13to14 (срез workers)
      check('инвариант цепочки: SAVE_VERSION 15 = цели последней миграции; в цепочке 15 миграций [M11 · v14 → M12.1 · v15]', () =>
        SAVE_VERSION === 15 && MIGRATIONS.length === 15 && MIGRATIONS[MIGRATIONS.length - 1]!.to === 15),
    );
  }

  // ------------------------------------------------ 2. roundtrip v12: живой улов/альбом
  {
    const storage = new MemoryStorage();
    const f = makeFishGame(storage);
    await f.game.init();
    f.game.wallet.grant('gold', 500);
    await buyAndEquip(f, 'bamboo_rod', 'rod');
    await buyAndEquip(f, 'worm_bait', 'bait');
    f.fish['fish.buy']('worm_bait', 10);
    // серия забросов до живого улова (fish.force — полный каст с расходами;
    // для roundtrip важна ФОРМА среза с живыми альбомом/статами)
    let caught = 0;
    for (let i = 0; i < 10 && caught < 2; i++) {
      const c = f.fish['fish.force']('crucian') as R<unknown>;
      if (!c.ok) break;
      caught += 1;
    }
    await f.game.save.save();
    const raw = JSON.parse((await storage.get('main')) ?? '{}') as { saveVersion: number; modules: { fishing: unknown } };
    const f2 = makeFishGame(storage);
    await f2.game.init();
    await f2.game.save.save();
    const raw2 = JSON.parse((await storage.get('main')) ?? '{}') as { modules: { fishing: unknown } };
    results.push(
      check('roundtrip v12: живой улов/альбом/статы байт-в-байт через dispose/load (срез fishing в файле, v12) [M11 · v14]', () =>
        raw.saveVersion === 15 && // [M12.1 · v15]
        JSON.stringify(raw.modules.fishing) === JSON.stringify(raw2.modules.fishing) &&
        JSON.stringify(raw.modules.fishing) !== JSON.stringify({ v: 1, location: 'pond', album: {}, stats: { casts: 0, caught: 0 } }), {
        expected: 'fishing-срез идентичен после reload (не дефолт: альбом/статы живы)',
        actual: `${String(JSON.stringify(raw.modules.fishing) === JSON.stringify(raw2.modules.fishing))}; ${JSON.stringify(raw.modules.fishing)}`,
      }),
    );
    f.dispose();
    f2.dispose();
  }

  return results;
}
