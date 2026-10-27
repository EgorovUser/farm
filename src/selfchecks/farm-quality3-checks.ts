/**
 * Self-checks M05.3 — часть 3в: качество — полные факторы (G4 брифа).
 * Перки навыка (порог → flat-мод, resolve), «Парник-люкс» (+1 тир,
 * монотонный оракул на общем потоке роллов), монте-карло распределения
 * (фикс-сид LCG, серии ≥1000, коридор частот ±4 п.п. от аналитики
 * w_i×factor^i и бленд-оракула слоя перка) + ВАЙРИНГ-чек фактора:
 * живой сбор обязан совпасть с оракулом factorOfScore(autoScore) по
 * журналу роллов (живая находка проб: распил C1 прокидывал сырой score
 * вместо фактора — детерминизм ×2 этого не видит, оба прогона одинаковы).
 */
import { check, type CheckResult } from './types';
import { makeFarmGame, makeSeededFarmGame, type R } from './farm-fixture';
import { QUALITY_TIERS } from '@/shared/types/ids';
import { FARM_TABLE } from '@/content/balance/farm';
import { adjustedWeights, factorOfScore, rollHarvestQuality } from '@/game/modules/farm/logic/quality';
import type { RngBus } from '@/kernel/bus/rng-bus/rng-bus';

/** фикс-сид LCG (mulberry32-подобный) — детерминированные серии монте-карло */
function lcg(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** фейк-RngBus на фикс-сид (контракт quality.ts: rollRange/nextFloat) */
function fakeRng(seed: number): RngBus {
  const next = lcg(seed);
  const roll = (): number => next();
  const float = (): number => next();
  return { rollRange: roll, nextFloat: float } as unknown as RngBus;
}

export async function runFarmQuality3Checks(): Promise<CheckResult[]> {
  const results: CheckResult[] = [];

  // ---------------------------------------- 25. перки навыка: порог → мод (resolve)
  {
    const f = makeFarmGame();
    await f.game.init();
    const levelOfFarming = (): number =>
      (f.player['skills.get'] as unknown as (id: string) => { level: number } | null)('farming')?.level ?? 0;
    const at = (lvl: number): number => {
      for (let guard = 0; guard < 100 && levelOfFarming() < lvl; guard++) {
        (f.player['skills.addXp'] as unknown as (id: string, n: number, s: string) => unknown)('farming', 250, 'selfcheck');
      }
      f.game.statBus.clearCache(); // кэш резолвов: час не тикал — сбрасываем (прецедент invalidate.stat)
      return f.game.statBus.resolve({ stat: 'farm.harvest.tierUpChance', ctx: f.game.time.ctx('player') });
    };
    const c5 = at(5);
    const c10 = at(10);
    const c20 = at(20);
    results.push(
      check('перки навыка farming: пороги 5/10/15/20 → flat +0.05 к farm.harvest.tierUpChance (resolve: 0.05 → 0.10 → 0.20; inc на нулевой базе = no-op)', () =>
        c5 === 0.05 && c10 === 0.1 && c20 === 0.2, {
        expected: '0.05 / 0.10 / 0.20',
        actual: `${c5} / ${c10} / ${c20}`,
      }),
    );
    f.dispose();
  }

  // ---------------------------------------- 26. «Парник-люкс»: +1 тир (монотонный оракул)
  {
    const rngA = fakeRng(20261024);
    const rngB = fakeRng(20261024);
    let mono = true;
    let pairs = 0;
    for (let i = 0; i < 200; i++) {
      const base = rollHarvestQuality(rngA, FARM_TABLE, 1.15, false, 0, 0);
      const lux = rollHarvestQuality(rngB, FARM_TABLE, 1.15, false, 0, 1);
      const bi = QUALITY_TIERS.indexOf(base.tier);
      const li = QUALITY_TIERS.indexOf(lux.tier);
      if (li !== Math.min(bi + 1, QUALITY_TIERS.length - 1)) mono = false;
      pairs++;
    }
    results.push(
      check('«Парник-люкс» +1 тир: тот же поток роллов с tierBonus=1 даёт ровно bump(тир) (кап SS) на каждой из 200 итераций', () =>
        mono && pairs === 200, {
        expected: 'tierLux = bump(tierBase) ×200',
        actual: `mono=${String(mono)}, пар ${pairs}`,
      }),
    );
  }

  // ---------------------------------------- 27. монте-карло: распределение по фактору
  {
    const N = 2000;
    const factor = 1.15; // autoScore 0.7 → 0.8 + 0.5×0.7
    const weights = adjustedWeights(FARM_TABLE, factor);
    const total = weights.reduce((a, b) => a + b, 0);
    const analytic = weights.map((w) => w / total);
    const rng = fakeRng(424242);
    const counts = new Array(QUALITY_TIERS.length).fill(0);
    for (let i = 0; i < N; i++) {
      const q = rollHarvestQuality(rng, FARM_TABLE, factor, false, 0, 0);
      counts[QUALITY_TIERS.indexOf(q.tier)]++;
    }
    const okAll = analytic.every((p, i) => Math.abs(counts[i]! / N - p) <= 0.04);
    results.push(
      check('монте-карло качества: фикс-сид, 2000 роллов, частоты тиров в ±4 п.п. от аналитики w_i×factor^i (фактор 1.15)', () =>
        okAll && counts.reduce((a, b) => a + b, 0) === N, {
        expected: `D ${(analytic[0]! * 100).toFixed(1)}% C ${(analytic[1]! * 100).toFixed(1)}% B ${(analytic[2]! * 100).toFixed(1)}%`,
        actual: `D ${((counts[0]! / N) * 100).toFixed(1)}% C ${((counts[1]! / N) * 100).toFixed(1)}% B ${((counts[2]! / N) * 100).toFixed(1)}% A ${((counts[3]! / N) * 100).toFixed(1)}%`,
      }),
    );
  }

  // ---------------------------------------- 28. монте-карло: слой перка (бленд-оракул)
  {
    const N = 2000;
    const factor = 1.0;
    const skill = 0.5;
    const weights = adjustedWeights(FARM_TABLE, factor);
    const total = weights.reduce((a, b) => a + b, 0);
    const base = weights.map((w) => w / total);
    const analytic = weights.map((_w, i) => (i === 0 ? base[0]! * (1 - skill) : base[i]! * (1 - skill) + base[i - 1]! * skill));
    const rng = fakeRng(777);
    const counts = new Array(QUALITY_TIERS.length).fill(0);
    for (let i = 0; i < N; i++) {
      const q = rollHarvestQuality(rng, FARM_TABLE, factor, false, skill, 0);
      counts[QUALITY_TIERS.indexOf(q.tier)]++;
    }
    const okAll = analytic.every((p, i) => Math.abs(counts[i]! / N - p) <= 0.04);
    results.push(
      check('монте-карло перка: шанс 0.5 — частоты в ±4 п.п. от бленд-оракула P(i)=b(i)(1−p)+b(i−1)p', () =>
        okAll && counts.reduce((a, b) => a + b, 0) === N, {
        expected: `C ${(analytic[1]! * 100).toFixed(1)}% B ${(analytic[2]! * 100).toFixed(1)}%`,
        actual: `C ${((counts[1]! / N) * 100).toFixed(1)}% B ${((counts[2]! / N) * 100).toFixed(1)}%`,
      }),
    );
  }

  // ---------------------------------------- 28b. ВАЙРИНГ фактора: живой сбор = оракулу
  {
    // [живая находка проб] factorOf прокидывал сырой autoScore (0.7) вместо
    // factorOfScore(1.15): детерминизм ×2 слеп (оба прогона одинаково неверны)
    // — оракул через журнал роллов пинит именно ВАЙРИНГ живого сбора
    const f = await makeSeededFarmGame('m053-factor-wiring');
    (f.inv['inventory.acquire'] as unknown as (d: string, q: number, s: string) => R<unknown>)('seed_wheat', 1, 'selfcheck');
    f.farm['farm.plow'](0);
    f.farm['farm.plant']('wheat', 0);
    f.farm['farm.water'](0);
    f.farm['farm.grow'](0);
    const h = f.farm['farm.harvest'](0) as R<{ yields: Array<{ quality: { tier: string } }> }>;
    const tierRoll = f.game.rngBus
      .rollLog()
      .list()
      .filter((e) => e.source === 'farm:harvest:tier')
      .pop();
    const raw = tierRoll ? Number(tierRoll.output) : NaN;
    const factor = factorOfScore(FARM_TABLE, 0.7); // autoScore базы 0.7, модов нет
    const weights = adjustedWeights(FARM_TABLE, factor);
    const total = weights.reduce((a, b) => a + b, 0);
    const x = raw * total;
    let acc = 0;
    let expected = 'D';
    for (let i = 0; i < QUALITY_TIERS.length; i++) {
      acc += weights[i]!;
      if (x < acc) {
        expected = QUALITY_TIERS[i]!;
        break;
      }
    }
    const liveTier = h.ok ? h.value.yields[0]!.quality.tier : 'err';
    results.push(
      check('вайринг фактора качества: живой сбор совпадает с оракулом factorOfScore(autoScore)=1.15 по журналу роллов (тир-ролл × веса×фактор^i)', () =>
        h.ok && Number.isFinite(raw) && liveTier === expected && Math.abs(factor - 1.15) < 1e-9, {
        expected: `фактор ${factor.toFixed(2)}, ролл ${raw.toFixed(3)} → тир ${expected}`,
        actual: `живой тир ${liveTier}`,
      }),
    );
    f.dispose();
  }

  return results;
}
