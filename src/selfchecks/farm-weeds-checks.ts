/**
 * Self-checks M05 «Ферма» — часть 2а: СОРНЯКИ (сеанс M05.2, F1/F2/F6).
 *
 * Оракулы руками: weedsAppeared payload {tab, tileIdx, stage, cropId} +
 * растяжение grownAt conserving-остатка; кап стадий 3; кумулятивный штраф
 * −25/−50/−75 (resolve-оракул через провайдера с тегом тайла, без тега —
 * база); гербициды 8%→4% (мод-инъекция inc −50); weedRiskMult культур и
 * дефолт 1 (юнит-путь hourWeedsPass с фейк-rng); детерминизм роллов ×2 на
 * фикс-saveId; именованный стрим farm:weeds:* в журнале (П6).
 *
 * Гарантия оракулов: пшеница (weedRiskMult 1.0) БЕЗ полива — never-watered
 * растёт мимо гейта READY бесконечно, форс-шанс ровно 100% (хелперы —
 * farm-fixture.ts). Расщепление 01 §6: файлы чеков ≤300.
 */
import { CROPS } from '@/content/farm/crops';
import { hourWeedsPass, type WeedsRng, type WeedsChance } from '@/game/modules/farm/logic/weeds';
import { weedsSpeedMult } from '@/game/modules/farm/logic/fsm';
import { defaultFarmState } from '@/game/modules/farm/state';
import { check, type CheckResult } from './types';
import { FARM_T0, FARM_HOUR, makeFarmGame, makeSeededFarmGame, tileOf, hourPass, forceWeedsChance, seedWeedyWheat, type FarmFixture } from './farm-fixture';

const PUMPKIN = CROPS.find((c) => c.id === 'pumpkin')!;
const CARROT = CROPS.find((c) => c.id === 'carrot')!;

export async function runFarmWeedsChecks(): Promise<CheckResult[]> {
  const results: CheckResult[] = [];
  // ---------------------------------------- 1. weedsAppeared: payload + растяжение grownAt
  {
    const f = makeFarmGame();
    await f.game.init();
    seedWeedyWheat(f);
    const before = tileOf(f, 0);
    const stop = forceWeedsChance(f, 0);
    hourPass(f, FARM_T0 + FARM_HOUR); // +1 игровой час от T0
    stop();
    const t = tileOf(f, 0);
    const ev = f.events.find((e) => e.name === 'farm.weedsAppeared');
    // растяжение: остаток × mult(0)/mult(1) = ×(1/0.75)
    const remainBefore = before.grownAt! - (FARM_T0 + FARM_HOUR);
    const expectedGrown = FARM_T0 + FARM_HOUR + Math.max(1, Math.round(remainBefore * (1 / weedsSpeedMult(1, 25))));
    results.push(
      check('сорняки: hourTick → weedsAppeared {tab, tileIdx, stage, cropId} + grownAt растянут conserving-остатка', () =>
        t.weeds === 1 &&
        ev !== undefined &&
        JSON.stringify(ev.payload) === JSON.stringify({ tab: 'field', tileIdx: 0, stage: 1, cropId: 'wheat' }) &&
        t.grownAt === expectedGrown, {
        expected: `weeds 1, payload {field,0,1,wheat}, grownAt ${expectedGrown}`,
        actual: `weeds ${t.weeds}, payload ${ev ? JSON.stringify(ev.payload) : 'нет'}, grownAt ${t.grownAt}`,
      }),
    );
    f.dispose();
  }

  // ---------------------------------------- 2. кап стадий 3 (5 проходов при шансе 100)
  {
    const f = makeFarmGame();
    await f.game.init();
    seedWeedyWheat(f);
    const stop = forceWeedsChance(f, 0);
    for (let i = 1; i <= 5; i++) hourPass(f, FARM_T0 + i * FARM_HOUR);
    stop();
    const t = tileOf(f, 0);
    const appeared = f.events.filter((e) => e.name === 'farm.weedsAppeared');
    results.push(
      check('сорняки: стадии кап 3 (5 проходов при шансе 100% → weeds 3, событий ровно 3)', () =>
        t.weeds === 3 && appeared.length === 3, {
        expected: 'weeds 3 / событий 3',
        actual: `weeds ${t.weeds} / событий ${appeared.length}`,
      }),
    );
    f.dispose();
  }

  // ---------------------------------------- 3. штраф −25/−50/−75 (resolve-оракул)
  {
    const f = makeFarmGame();
    await f.game.init();
    seedWeedyWheat(f);
    const speeds: number[] = [];
    for (let stage = 1; stage <= 3; stage++) {
      const stop = forceWeedsChance(f, 0);
      hourPass(f, FARM_T0 + stage * FARM_HOUR);
      stop();
      speeds.push(
        f.game.statBus.resolve({
          stat: 'farm.growthSpeed',
          ctx: { player: 'player', now: f.clock.now(), tags: ['farm:tile:field:0'] },
        }),
      );
    }
    const noTag = f.game.statBus.resolve({ stat: 'farm.growthSpeed', ctx: { player: 'player', now: f.clock.now() } });
    results.push(
      check('штраф сорняков: один мод inc −25×стадия → resolve 75/50/25; без тега тайла — база 100 (F2)', () =>
        speeds[0] === 75 && speeds[1] === 50 && speeds[2] === 25 && noTag === 100, {
        expected: '75 / 50 / 25 / без тега 100',
        actual: `${speeds.join(' / ')} / без тега ${noTag}`,
      }),
    );
    f.dispose();
  }

  // ---------------------------------------- 4. гербициды: мод-инъекция inc −50 → 8→4
  {
    const f = makeFarmGame();
    await f.game.init();
    const base = f.game.statBus.resolve({
      stat: 'farm.weeds.chancePercent',
      ctx: { player: 'player', now: f.clock.now(), tags: ['farm:tile:field:0'] },
    });
    f.game.buffs.add(
      {
        id: 'selfcheck.herbicide',
        source: { kind: 'buff', refId: 'selfcheck' },
        stat: 'farm.weeds.chancePercent',
        op: 'inc',
        value: -50, // herbicideReductionPercent (данные balance/farm)
        tags: ['farm'],
        label: 'selfcheck: гербициды',
      },
      f.clock.now(),
    );
    const withHerb = f.game.statBus.resolve({
      stat: 'farm.weeds.chancePercent',
      ctx: { player: 'player', now: f.clock.now(), tags: ['farm', 'farm:tile:field:0'] },
    });
    f.game.buffs.remove('selfcheck.herbicide');
    results.push(
      check('гербициды: inc −50 к шансу мультипликативно → 8% → 4% (мод-путь, источник — M04/M05.3)', () =>
        base === 8 && withHerb === 4, {
        expected: '8 → 4',
        actual: `${base} → ${withHerb}`,
      }),
    );
    f.dispose();
  }

  // ---------------------------------------- 5. weedRiskMult + дефолт 1 (юнит-путь, фейк-rng)
  {
    const rng: WeedsRng = { roll01: () => 0.55 };
    const chance: WeedsChance = { of: () => 50 };
    const crops = new Map(CROPS.map((c) => [c.id, c] as const));
    const table = { weeds: { maxStages: 3, growthPenaltyPercent: 25, herbicideReductionPercent: 50 } } as never;
    const mkState = (cropId: string) => ({
      ...defaultFarmState(),
      tabs: [
        {
          id: 'field',
          kind: 'field' as const,
          tiles: [
            { index: 0, state: 'growing' as const, cropId, plantedAt: FARM_T0, grownAt: FARM_T0 + 12 * FARM_HOUR, wateredUntil: FARM_T0 + 8 * FARM_HOUR, weeds: 0 },
          ],
        },
      ],
    });
    // carrot 1.2: порог 50×1.2=60% → 0.55 зарастает; wheat 1.0: порог 50% → нет
    const carrot = hourWeedsPass(mkState('carrot'), FARM_T0 + FARM_HOUR, { rng, chance, crops, table });
    const wheat = hourWeedsPass(mkState('wheat'), FARM_T0 + FARM_HOUR, { rng, chance, crops, table });
    // дефолт 1: строка без weedRiskMult (П5) — порог 50% → нет
    const noMultCrop = { ...CARROT, id: 'custom_no_risk', weedRiskMult: undefined };
    const noMult = hourWeedsPass(mkState('custom_no_risk'), FARM_T0 + FARM_HOUR, {
      rng,
      chance,
      crops: new Map([[noMultCrop.id, noMultCrop]]),
      table,
    });
    results.push(
      check('weedRiskMult: carrot ×1.2 зарастает при 55<60%, wheat ×1.0 — нет при 55>50%; отсутствие поля = дефолт 1', () =>
        carrot.appeared.length === 1 && wheat.appeared.length === 0 && noMult.appeared.length === 0, {
        expected: 'carrot 1 / wheat 0 / без поля 0',
        actual: `${carrot.appeared.length} / ${wheat.appeared.length} / ${noMult.appeared.length}`,
      }),
    );
  }

  // ---------------------------------------- 6. детерминизм роллов ×2 (фикс-saveId)
  {
    const run = async (): Promise<{ weeds: number; grownAt: number }> => {
      const f = await makeSeededFarmGame('m052-weeds-det');
      seedWeedyWheat(f);
      const stop = forceWeedsChance(f, 0);
      hourPass(f, FARM_T0 + FARM_HOUR);
      stop();
      const t = tileOf(f, 0);
      f.dispose();
      return { weeds: t.weeds, grownAt: t.grownAt ?? 0 };
    };
    const a = await run();
    const b = await run();
    results.push(
      check('сорняки: роллы детерминированы по сиду (×2 идентичны на фикс-saveId, именованный стрим)', () =>
        JSON.stringify(a) === JSON.stringify(b) && a.weeds === b.weeds, {
        expected: 'идентичны',
        actual: `${JSON.stringify(a)} vs ${JSON.stringify(b)}`,
      }),
    );
  }

  // ---------------------------------------- 7. именованный стрим farm:weeds:* в журнале
  {
    const f = makeFarmGame();
    await f.game.init();
    seedWeedyWheat(f);
    const stop = forceWeedsChance(f, 0);
    hourPass(f, FARM_T0 + FARM_HOUR);
    stop();
    const entry = f.game.rngBus
      .rollLog()
      .list()
      .find((e) => e.source === 'farm:weeds:field:0');
    results.push(
      check('сорняки: бросок именованным стримом farm:weeds:field:0 (журнал роллов, П6)', () =>
        entry !== undefined && entry.kind === 'range', {
        expected: 'range farm:weeds:field:0 (0..1 uniform)',
        actual: entry ? `${entry.kind} ${entry.source} ${entry.input}` : 'нет записи',
      }),
    );
    f.dispose();
  }
  return results;
}
