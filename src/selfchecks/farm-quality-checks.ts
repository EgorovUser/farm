/**
 * Self-checks M05 «Ферма» — качество/миграция/раундтрип (часть 1, сеанс M05.1;
 * расщепление 01 §6: farm-checks.ts превысил 300 строк — FSM-блоки там,
 * качественно-миграционные здесь; оркестратор — runFarmChecks в farm-checks).
 */
import { MemoryStorage } from '@/kernel/save/storage-drivers';
import { migrateSaveData } from '@/kernel/save/migrations';
import { QUALITY_TIERS } from '@/shared/types/ids';
import { FARM_TABLE } from '@/content/balance/farm';
import { adjustedWeights, factorOfScore } from '@/game/modules/farm/logic/quality';
import { check, type CheckResult } from './types';
import { FARM_T0, makeFarmGame, makeSeededFarmGame, type R } from './farm-fixture';

export async function runFarmQualityChecks(): Promise<CheckResult[]> {
  const results: CheckResult[] = [];

  // ------------------------------------- 7. качество: детерминизм ×2, коридор фактора, направление весов
  {
    const resultsOf = async (): Promise<Array<{ defId: string; qty: number; quality: { tier: string; value: number } }>> => {
      const f = await makeSeededFarmGame('farm-quality-seed');
      (f.inv['inventory.acquire'] as unknown as (d: string, q: number, s: string) => R<unknown>)('seed_wheat', 1, 'selfcheck');
      f.farm['farm.plow'](0);
      f.farm['farm.plant']('wheat', 0);
      f.farm['farm.water'](0);
      f.farm['farm.grow'](0);
      const h = f.farm['farm.harvest'](0) as R<{ yields: Array<{ defId: string; qty: number; quality: { tier: string; value: number } }> }>;
      const out = h.ok ? h.value.yields : [];
      f.dispose();
      return out;
    };
    const a = await resultsOf();
    const b = await resultsOf();
    results.push(
      check('качество сбора: детерминизм по сиду — две идентичные фикстуры дают байт-в-байт роллы', () =>
        JSON.stringify(a) === JSON.stringify(b) && a.length === 1, {
        expected: 'идентичны',
        actual: `${JSON.stringify(a)} vs ${JSON.stringify(b)}`,
      }),
    );
    // коридор фактора (F7: ×0.8–1.3): score 0/1 → границы
    const fMin = factorOfScore(FARM_TABLE, 0);
    const fMid = factorOfScore(FARM_TABLE, 0.5);
    const fMax = factorOfScore(FARM_TABLE, 1);
    // направление: фактор повышает веса ВЫСОКИХ тиров (w_i × factor^i):
    // SS растёт с фактором, C растёт, D — константен (factor^0 = 1),
    // т.е. относительная доля D падает — распределение смещается вверх (F7)
    const wLow = adjustedWeights(FARM_TABLE, 0.8);
    const wMid = adjustedWeights(FARM_TABLE, 1);
    const wHigh = adjustedWeights(FARM_TABLE, 1.3);
    const iD = 0;
    const iC = 1;
    const iSS = QUALITY_TIERS.length - 1;
    results.push(
      check('фактор auto-score: коридор [0.8..1.3] линейно; высокие факторы смещают веса к SS (F7)', () =>
        fMin === 0.8 && fMax === 1.3 && Math.abs(fMid - 1.05) < 1e-9 &&
        wHigh[iSS] > wMid[iSS] && wMid[iSS] > wLow[iSS] &&
        wHigh[iC] > wMid[iC] && wMid[iC] > wLow[iC] &&
        wLow[iD] === wMid[iD] && wMid[iD] === wHigh[iD], {
        expected: '0.8 ≤ factor ≤ 1.3; SS↑ C↑, D константен (factor^0)',
        actual: `factor(${fMin}, ${fMid}, ${fMax}); SS(${wLow[iSS].toFixed(1)}, ${wMid[iSS].toFixed(1)}, ${wHigh[iSS].toFixed(1)})`,
      }),
    );
  }

  // ------------------------------------------------ 8. миграция v9→v10 (F1): дефолт / не перезапись / v3 / v99
  {
    const v9 = {
      saveVersion: 9,
      saveId: 'v9-farm',
      savedAt: FARM_T0,
      contentVersion: '0.1.0-phase0',
      modules: { 'kernel.wallet': { balances: [['gold', 5]] } },
      lastSeen: FARM_T0,
    };
    const m = migrateSaveData({ ...v9 });
    const farmSlice = (m.data.modules as Record<string, unknown>)['farm'] as
      | { tabs: Array<{ id: string; kind: string; tiles: Array<{ state: string }> }> }
      | undefined;
    results.push(
      check('migrate9to12: срез farm = дефолт (Поле, 16 тайлов empty), прежние срезы целы [M11 · v14 → M12.1 · v15]', () => // [M06.1 · v11 → M07.1 · v12] донор v9 идёт до текущей (3 шага) — [M11 · v14] +1 шаг workers, [M12.1 · v15] +1 шаг mine
        m.data.saveVersion === 15 && m.steps === 6 &&
        farmSlice !== undefined && farmSlice.tabs.length === 1 && farmSlice.tabs[0]!.id === 'field' &&
        farmSlice.tabs[0]!.kind === 'field' && farmSlice.tabs[0]!.tiles.length === 16 &&
        farmSlice.tabs[0]!.tiles.every((t) => t.state === 'empty') &&
        (m.data.modules as Record<string, unknown>)['kernel.wallet'] !== undefined),
    );
    // v9 С farm-срезом (повторный прогон / экспорт-импорт) — не перезаписывается
    const v9withFarm = {
      ...v9,
      modules: { ...v9.modules, farm: { v: 1, tabs: [{ id: 'field', kind: 'field', tiles: [{ index: 0, state: 'plowed', weeds: 0 }] }] } },
    };
    const m2 = migrateSaveData(v9withFarm);
    const farm2 = (m2.data.modules as Record<string, unknown>)['farm'] as { tabs: Array<{ tiles: Array<{ state: string }> }> };
    results.push(
      check('migrate9to12: существующий farm-срез НЕ перезаписывается (идемпотентность) [M11 · v14]', () =>
        m2.data.saveVersion === 15 && farm2.tabs[0]!.tiles[0]!.state === 'plowed'), // [M12.1 · v15]
    );
    // холодная цепочка v3 → v10 (7 шагов) — кошелёк цел
    const v3 = {
      saveVersion: 3,
      saveId: 'v3-farm',
      savedAt: FARM_T0,
      contentVersion: '0.1.0-phase0',
      modules: { 'kernel.wallet': { balances: [['gold', 7]] } },
      lastSeen: FARM_T0,
    };
    const m3 = migrateSaveData(v3);
    results.push(
      check('цепочка v3→v15: 12 шагов, farm-срез в конце цепочки, kernel.wallet цел [M08 · v13 → M11 · v14 → M12.1 · v15]', () => // [M06.1 · v11 → M07.1 · v12]
        m3.data.saveVersion === 15 && m3.steps === 12 &&
        (m3.data.modules as Record<string, unknown>)['farm'] !== undefined),
    );
    // v99 — отказ (каталог: «версия из будущего → явная ошибка», дублируется для M05-группы)
    let threw99 = false;
    try {
      migrateSaveData({ saveVersion: 99, modules: {} });
    } catch {
      threw99 = true;
    }
    results.push(check('v99 из будущего — явная ошибка миграции (канон ядра)', () => threw99));
  }

  // ------------------------------------- 9. save-раундтрип растущего тайла (абсолютные даты живы)
  {
    const storage = new MemoryStorage();
    const f = makeFarmGame(storage);
    await f.game.init();
    (f.inv['inventory.acquire'] as unknown as (d: string, q: number, s: string) => R<unknown>)('seed_wheat', 1, 'selfcheck');
    f.farm['farm.plow'](7);
    f.farm['farm.plant']('wheat', 7);
    f.farm['farm.water'](7);
    const before = f.farm['farm.state']() as { tabs: Array<{ tiles: Array<{ index: number; state: string; grownAt?: number; wateredUntil?: number; cropId?: string }> }> };
    const t0 = before.tabs[0]!.tiles[7]!;
    await f.game.save.save();
    f.dispose();

    const f2 = makeFarmGame(storage);
    await f2.game.init();
    const after = f2.farm['farm.state']() as { tabs: Array<{ tiles: Array<{ index: number; state: string; grownAt?: number; wateredUntil?: number; cropId?: string }> }> };
    const t1 = after.tabs[0]!.tiles[7]!;
    results.push(
      check('save-раундтрип: растущий тайл жив (grownAt/wateredUntil абсолютные, v12, срез farm) [M11 · v14]', () => // [M06.1 · v11 → M07.1 · v12]
        f2.game.save.info().saveVersion === 15 && f2.game.save.info().slices.includes('farm') && // [M12.1 · v15]
        t1.state === 'growing' && t1.cropId === 'wheat' &&
        t1.grownAt === t0.grownAt && t1.wateredUntil === t0.wateredUntil, {
        expected: 'growing, таймеры идентичны',
        actual: `${t1.state}, grownAt ${t1.grownAt} (было ${t0.grownAt})`,
      }),
    );
    f2.dispose();
  }

  return results;
}
