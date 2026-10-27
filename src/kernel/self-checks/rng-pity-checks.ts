/**
 * Self-checks Pity + RNG (02-BUSES §13.3, §13.4).
 * Монте-карло с допуском: воспроизводимость по сиду, luck смещает веса.
 */
import { PityService } from '@/kernel/services/pity/pity-service';
import { RngBus } from '@/kernel/bus/rng-bus/rng-bus';
import { RollLog } from '@/kernel/bus/rng-bus/roll-log';
import { StatBus, type BaseSource } from '@/kernel/bus/stat-bus/stat-bus';
import type { ModifierProvider, ResolveCtx } from '@/kernel/bus/stat-bus/modifier';
import { check, group, near, type CheckGroup, type CheckResult } from './types';

export function runPityChecks(): CheckGroup {
  const results: CheckResult[] = [];
  const pity = new PityService();

  results.push(check('новый счётчик = 0', () => pity.get('player', 'forge.fail') === 0));

  pity.bump('player', 'forge.fail');
  pity.bump('player', 'forge.fail');
  const v = pity.bump('player', 'forge.fail');
  results.push(check('bump ×3 = 3', () => v === 3 && pity.get('player', 'forge.fail') === 3));

  pity.bump('player', 'forge.fail', 5);
  results.push(check('bump с шагом 5 = 8', () => pity.get('player', 'forge.fail') === 8));

  pity.bump('player', 'forge.fail', -100);
  results.push(check('граница: ниже 0 не бывает', () => pity.get('player', 'forge.fail') === 0));

  pity.bump('player', 'forge.fail', 2);
  pity.reset('player', 'forge.fail');
  results.push(check('reset обнуляет', () => pity.get('player', 'forge.fail') === 0));

  pity.bump('mob:boss1', 'drop.pity');
  pity.bump('mob:boss2', 'drop.pity');
  pity.resetOwner('mob:boss1');
  results.push(check('resetOwner чистит только владельца', () => pity.get('mob:boss1', 'drop.pity') === 0 && pity.get('mob:boss2', 'drop.pity') === 1));

  // roundtrip через save
  pity.bump('player', 'forge.fail', 4);
  const snapshot = pity.saveState();
  const pity2 = new PityService();
  pity2.loadState(snapshot);
  results.push(check('save/load roundtrip', () => pity2.get('player', 'forge.fail') === 4));

  return group('PityService (§13.3)', results);
}

function makeRng(luck: number): { rng: RngBus; statBus: StatBus } {
  // база player.luck = 0; удача приходит ТОЛЬКО модификатором (П2/П3)
  const bases: Record<string, number> = { 'player.luck': 0 };
  const source: BaseSource = {
    base: (stat) => {
      if (!(stat in bases)) throw new Error(`неизвестный стат ${stat}`);
      return bases[stat];
    },
    meta: () => ({}),
    listStats: () => Object.keys(bases),
  };
  const statBus = new StatBus(source);
  const provider: ModifierProvider = {
    id: 'selfcheck.luck',
    provide: () =>
      luck === 0
        ? []
        : [
            {
              id: 'luck.mod',
              source: { kind: 'buff', refId: 'selfcheck' },
              stat: 'player.luck',
              op: 'flat',
              value: luck,
            },
          ],
  };
  statBus.registerProvider(provider);
  const tables = new Map([
    {
      id: 'selfcheck.coin',
      luckStat: 'player.luck',
      entries: [
        { id: 'heads', weight: 50, lucky: true },
        { id: 'tails', weight: 50 },
      ],
    },
  ].map((t) => [t.id, t]));
  const rng = new RngBus({ seed: 12345, statBus, tables, log: new RollLog(50) });
  return { rng, statBus };
}

const ctx: ResolveCtx = { player: 'selfcheck', now: 1_700_000_000_000 };

export function runRngChecks(): CheckGroup {
  const results: CheckResult[] = [];

  // воспроизводимость: одинаковый сид → одинаковая последовательность
  const a = makeRng(0).rng;
  const b = makeRng(0).rng;
  const seqA = Array.from({ length: 20 }, () => a.nextFloat('selfcheck.seq'));
  const seqB = Array.from({ length: 20 }, () => b.nextFloat('selfcheck.seq'));
  results.push(check('воспроизводимость по сиду (20 роллов)', () => seqA.every((v, i) => v === seqB[i])));

  // другой сид → другая последовательность
  const c = makeRng(0).rng;
  c.setSeed(999);
  const seqC = Array.from({ length: 20 }, () => c.nextFloat('selfcheck.seq'));
  results.push(check('другой сид → другая последовательность', () => seqA.some((v, i) => v !== seqC[i])));

  // rollTable детерминизм
  const t1 = makeRng(0).rng;
  const t2 = makeRng(0).rng;
  const picks1 = Array.from({ length: 10 }, () => t1.rollTable('selfcheck.coin', ctx));
  const picks2 = Array.from({ length: 10 }, () => t2.rollTable('selfcheck.coin', ctx));
  results.push(check('rollTable детерминирован одним сидом', () => picks1.every((v, i) => v === picks2[i])));

  // монете-карло без удачи: ~50/50
  const neutral = makeRng(0).rng;
  const N = 3000;
  let heads = 0;
  for (let i = 0; i < N; i++) {
    if (neutral.rollTable('selfcheck.coin', ctx) === 'heads') heads++;
  }
  results.push(
    check(
      `монте-карло без удачи: heads ≈ 50% (${((heads / N) * 100).toFixed(1)}%)`,
      () => near((heads / N) * 100, 50, 4),
      { expected: '50% ± 4%', actual: `${((heads / N) * 100).toFixed(1)}%` },
    ),
  );

  // с удачей +100: heads весит 100 против 50 → 66.7%
  const lucky = makeRng(100).rng;
  let luckyHeads = 0;
  for (let i = 0; i < N; i++) {
    if (lucky.rollTable('selfcheck.coin', ctx) === 'heads') luckyHeads++;
  }
  results.push(
    check(
      `удача +100% смещает выборку к 66.7% (${((luckyHeads / N) * 100).toFixed(1)}%)`,
      () => near((luckyHeads / N) * 100, 66.67, 4),
      { expected: '66.7% ± 4%', actual: `${((luckyHeads / N) * 100).toFixed(1)}%` },
    ),
  );

  // честная таблица шансов (П6)
  const chances = lucky.chances('selfcheck.coin', ctx);
  const headsChance = chances.find((c) => c.id === 'heads')?.chancePercent ?? 0;
  results.push(
    check('chances() отдаёт расчётную таблицу шансов', () => near(headsChance, 66.67, 0.01), {
      expected: '66.67%',
      actual: `${headsChance.toFixed(2)}%`,
    }),
  );

  // rollRange: границы и кривые
  const range = makeRng(0).rng;
  let inBounds = true;
  let powerSkew = true;
  const mids: number[] = [];
  for (let i = 0; i < 200; i++) {
    const u = range.rollRange(10, 20, 'uniform', 'selfcheck.range');
    if (u < 10 || u > 20) inBounds = false;
    const p = range.rollRange(0, 100, 'power', 'selfcheck.power');
    mids.push(p);
  }
  const powerMean = mids.reduce((s, v) => s + v, 0) / mids.length;
  if (powerMean >= 50) powerSkew = false; // степенная кривая смещает к минимуму
  results.push(check('rollRange uniform в границах', () => inBounds));
  results.push(
    check(`rollRange power смещён к min (mean ${powerMean.toFixed(1)} < 50)`, () => powerSkew, {
      expected: '< 50',
      actual: powerMean.toFixed(1),
    }),
  );

  // роллы логируются
  results.push(check('роллы попадают в журнал', () => lucky.rollLog().list().length > 0));

  // dailySeed стабилен
  const d1 = lucky.dailySeed('save-1', '2025-01-15');
  const d2 = lucky.dailySeed('save-1', '2025-01-15');
  const d3 = lucky.dailySeed('save-1', '2025-01-16');
  results.push(check('dailySeed: одинаковый день → одинаковый сид', () => d1 === d2 && d1 !== d3));

  // несуществующая таблица — штатный null (П5)
  results.push(check('неизвестная таблица → null, не крэш', () => lucky.rollTable('no.such.table', ctx) === null));

  return group('RngBus (§13.4)', results);
}
