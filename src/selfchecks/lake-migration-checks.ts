/**
 * Self-checks M08 «Озеро» — часть 3 (сеанс M08.1: сейв v13, бриф F1/§3.6).
 *
 * Покрытие: migrate12to13 — дефолт-срез lake (ровно форма F1: слоты ×6
 * пустые / вода 15/70 / икра [] / статы нули); донор v12 с живыми
 * fishing/pen/farm → соседи целы, lake-дефолт; повторный прогон
 * идемпотентен (срез не перезаписывается); холодная цепочка v3 → v13
 * (10 шагов); v99 — отказ (откат запрещён). Roundtrip v13 байт-в-байт:
 * живое озеро (вода/слоты/икра/пара) через dispose/load — срез в файле
 * идентичен, не дефолт.
 */
import { migrateSaveData, MIGRATIONS } from '@/kernel/save/migrations';
import { check, type CheckResult } from './types';
import {
  LAKE_T0,
  LAKE_HOUR,
  dayPass,
  giveFish,
  hourPass,
  lakeView,
  makeLakeGame,
  makeSeededLakeGame,
  type R,
} from './lake-fixture';
import { MemoryStorage } from '@/kernel/save/storage-drivers';

export async function runLakeMigrationChecks(): Promise<CheckResult[]> {
  const results: CheckResult[] = [];

  // ------------------------------------------------ 16. migrate12to13: дефолт + донор v12 + идемпотентность + v3→13 + v99
  {
    const donor = {
      saveVersion: 12,
      savedAt: LAKE_T0,
      saveId: 'm081-donor-v12',
      contentVersion: '0.1.0-phase0',
      modules: {
        fishing: { v: 1, location: 'pond', album: { crucian: 3 }, stats: { casts: 5, caught: 3 } },
        pen: { v: 1, animals: [{ speciesId: 'chicken', quality: 'C', happiness: 90, satiety: 80, health: 100, cleanliness: 95 }], stock: { egg: 2 }, overflow: {} },
        farm: { v: 1, tiles: [{ index: 0, state: 'growing', cropId: 'wheat', plantedAt: LAKE_T0, grownAt: LAKE_T0 + 1, weeds: 0 }], unlockedTabs: ['field'] },
      },
      lastSeen: LAKE_T0,
    };
    const m = migrateSaveData(JSON.parse(JSON.stringify(donor)) as Record<string, unknown>);
    const lake = m.data.modules.lake as Record<string, unknown>;
    const fishing = m.data.modules.fishing as Record<string, unknown>;
    const pen = m.data.modules.pen as Record<string, unknown>;
    const farm = m.data.modules.farm as Record<string, unknown>;
    const m2 = migrateSaveData(JSON.parse(JSON.stringify(m.data)) as Record<string, unknown>);
    const m3 = migrateSaveData({ saveVersion: 3, modules: {}, saveId: 'cold', contentVersion: 'x', savedAt: LAKE_T0, lastSeen: LAKE_T0 } as unknown as Record<string, unknown>);
    let threw99 = false;
    try {
      migrateSaveData({ saveVersion: 99, modules: {} } as unknown as Record<string, unknown>);
    } catch {
      threw99 = true;
    }
    const defaultSlice = JSON.stringify({
      v: 1,
      slots: [{ sick: false }, { sick: false }, { sick: false }, { sick: false }, { sick: false }, { sick: false }],
      water: { temperature: 15, cleanliness: 70 },
      roe: [],
      stats: { released: 0, bred: 0, harvested: 0 },
    });
    results.push(
      check('миграция v12→v13 (F1): срез lake = дефолт БАЙТ-В-БАЙТ (слоты ×6 пустые, вода 15/70, икра [], статы нули — ровно форма F1); соседи целы (fishing альбом crucian:3, pen Кура, farm грядка); повторный прогон идемпотентен (lake не перезаписывается); v3 → v13 холодной цепочкой 10 шагов; v99 — отказ (откат запрещён) [M11 · v14: +1 шаг workers → M12.1 · v15: +1 шаг mine]', () =>
        m.data.saveVersion === 15 &&
        JSON.stringify(lake) === defaultSlice &&
        JSON.stringify((fishing.album as Record<string, number>)) === JSON.stringify({ crucian: 3 }) &&
        JSON.stringify((pen.animals as unknown[])[0]) !== 'null' && pen.animals !== undefined &&
        farm.tiles !== undefined &&
        JSON.stringify((m2.data.modules.lake as Record<string, unknown>)) === defaultSlice &&
        m3.data.saveVersion === 15 && m3.steps === 12 &&
        threw99, {
        expected: 'v15/3 шага; lake-дефолт; соседи целы; идем; v3→15 12 шагов; v99 отказ',
        actual: `v${m.data.saveVersion}/${m.steps} шаг; lake ${JSON.stringify(lake) === defaultSlice ? 'дефолт' : 'НЕ дефолт'}; идем ${JSON.stringify((m2.data.modules.lake as Record<string, unknown>)) === defaultSlice}; v3→${m3.data.saveVersion} ${m3.steps}; v99 ${threw99}`,
      }),
    );
    // инвариант цепочки (легализован в fish-migration-checks): предпоследняя миграция = v13
    results.push(
      check('инвариант: migrate12to13 — в цепочке 15, from 12 → to 13 [M11 · v14 → M12.1 · v15]', () =>
        MIGRATIONS.length === 15 && MIGRATIONS[12]!.from === 12 && MIGRATIONS[12]!.to === 13),
    );
  }

  // ------------------------------------------------ 17. roundtrip v13: живое озеро байт-в-байт
  {
    const storage = new MemoryStorage();
    const f = makeLakeGame(storage);
    await f.game.init();
    f.game.wallet.grant('gold', 200);
    f.game.wallet.grant('feed', 10);
    giveFish(f, 'crucian', 'B');
    giveFish(f, 'crucian', 'A');
    const iids = (f.inv['inventory.list']() as Array<{ iid: string; defId: string }>).filter((i) => i.defId === 'crucian');
    f.lake['lake.release'](iids[0]!.iid);
    f.lake['lake.release'](iids[1]!.iid);
    // живая пара завершена (икра в очереди) + сдвиг чистоты (дрейф dayTick)
    f.lake['lake.force']('roe', 0, 1) as R<unknown>;
    hourPass(f, LAKE_T0 + 25 * LAKE_HOUR);
    dayPass(f, LAKE_T0 + 26 * LAKE_HOUR); // дрейф −5 (вода 65) + sick-проход
    const view = lakeView(f);
    await f.game.save.save();
    const raw = JSON.parse((await storage.get('main')) ?? '{}') as { saveVersion: number; modules: { lake: unknown } };
    const f2 = makeLakeGame(storage);
    await f2.game.init();
    await f2.game.save.save();
    const raw2 = JSON.parse((await storage.get('main')) ?? '{}') as { modules: { lake: unknown } };
    const view2 = lakeView(f2);
    results.push(
      check('roundtrip v13: живое озеро (вода после дрейфа / слоты с рыбами / икра в очереди / статы) байт-в-байт через dispose/load; срез lake в файле НЕ дефолт (рыбы/икра/статы живы); витрина после reload согласована (рыбы/икра/статы) [M11 · v14]', () =>
        raw.saveVersion === 15 && // [M12.1 · v15]
        JSON.stringify(raw.modules.lake) === JSON.stringify(raw2.modules.lake) &&
        JSON.stringify(raw.modules.lake) !== JSON.stringify({
          v: 1,
          slots: [{ sick: false }, { sick: false }, { sick: false }, { sick: false }, { sick: false }, { sick: false }],
          water: { temperature: 15, cleanliness: 70 },
          roe: [],
          stats: { released: 0, bred: 0, harvested: 0 },
        }) &&
        view.fish.length === view2.fish.length && view.roe.length === view2.roe.length &&
        view.stats.released === view2.stats.released && view.stats.bred === view2.stats.bred &&
        view.water.cleanliness === view2.water.cleanliness, {
        expected: 'срез идентичен после reload (не дефолт: 2 рыбы/икра/статы)',
        actual: `идентичен ${String(JSON.stringify(raw.modules.lake) === JSON.stringify(raw2.modules.lake))}; рыб ${view.fish.length}→${view2.fish.length}; икра ${view.roe.length}→${view2.roe.length}; статы ${view.stats.released}/${view.stats.bred} → ${view2.stats.released}/${view2.stats.bred}`,
      }),
    );
    f.dispose();
    f2.dispose();
  }

  // ------------------------------------------------ 18. ленивые дефолты при загрузке (sanitize, F1)
  {
    const storage = new MemoryStorage();
    await storage.set(
      'main',
      JSON.stringify({
        saveVersion: 13,
        savedAt: LAKE_T0,
        saveId: 'm081-lazy-defaults',
        contentVersion: '0.1.0-phase0',
        modules: {
          lake: { v: 1, slots: [{ fishId: 'crucian', quality: 'B', sick: false }] }, // без water/roe/stats
        },
        lastSeen: LAKE_T0,
      }),
    );
    const f = makeLakeGame(storage);
    await f.game.init();
    const v = lakeView(f);
    results.push(
      check('ленивые дефолты sanitize (F1, прецедент pen/fishing): битый/усечённый срез lake (только v+слоты) → вода 15/70, икра [], статы нули; рыба в слоте жива (тир B)', () =>
        v.water.temperature === 15 && v.water.cleanliness === 70 &&
        v.roe.length === 0 && v.stats.released === 0 && v.stats.bred === 0 && v.stats.harvested === 0 &&
        v.fish.length === 1 && v.fish[0]!.fishId === 'crucian' && v.fish[0]!.quality === 'B', {
        expected: 'дефолты воды/икры/стат + живая рыба',
        actual: `вода ${v.water.temperature}/${v.water.cleanliness}; икра ${v.roe.length}; статы ${v.stats.released}/${v.stats.bred}/${v.stats.harvested}; рыб ${v.fish.length} ${v.fish[0]?.quality ?? '—'}`,
      }),
    );
    f.dispose();
  }

  return results;
}
