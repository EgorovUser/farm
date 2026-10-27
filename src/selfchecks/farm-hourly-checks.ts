/**
 * Self-checks M05 «Ферма» — часть 2б: СУХОСТЬ + catchUp + прополка +
 * исполнители + манифест + сейв (сеанс M05.2, F2–F6).
 *
 * Оракулы руками (фикс-даты через ManualClock/DI now()): сухость — политый
 * растёт / сухой стоит (grownAt += ровно сухое время, wateredUntil = якорь)
 * / полив возобновляет; catchUp — кап 72 часовых итераций OfflineCatchup
 * ядра + готовность по датам на перовом проходе; прополка — энергия 1
 * (action.farm.weed.energyCost), weeds→0, штраф снят, сжатие остатка,
 * отказ при энергии 0 (откат); исполнители farm.* ×5 через TaskRegistry
 * (вызывающий ферму НЕ импортирует), worker.actionDone НЕ публикуется;
 * манифест 1.1.0 = факту; сейв-раундтрип weeds байт-в-байт + ленивый
 * дефолт 0 у v10-донора без поля.
 */
import { OfflineCatchup } from '@/kernel/time/offline-catchup';
import type { TimeConfig } from '@/kernel/time/time-service';
import { weedsSpeedMult } from '@/game/modules/farm/logic/fsm';
import { check, type CheckResult } from './types';
import {
  FARM_T0,
  FARM_HOUR,
  makeFarmGame,
  tileOf,
  hourPass,
  forceWeedsChance,
  seedWeedyWheat,
  seedPumpkin,
  type R,
} from './farm-fixture';

export async function runFarmHourlyChecks(): Promise<CheckResult[]> {
  const results: CheckResult[] = [];
  // ---------------------------------------- 8. сухость: политый растёт / сухой стоит / полив возобновляет
  {
    const f = makeFarmGame();
    await f.game.init();
    seedPumpkin(f); // grownAt T0+12ч, wateredUntil T0+8ч
    f.clock.set(FARM_T0 + FARM_HOUR);
    const wet = tileOf(f, 0); // sweep внутри витрины: влажный, растёт
    f.clock.set(FARM_T0 + 9 * FARM_HOUR); // окно истекло час назад
    const dry = tileOf(f, 0); // sweep: сухость учтена (якорь = now)
    const pushed = (dry.grownAt ?? 0) - (wet.grownAt ?? 0);
    f.farm['farm.water'](0); // повторный полив (2 энергии) — рост возобновлён
    f.clock.set(FARM_T0 + 10 * FARM_HOUR);
    const resumed = tileOf(f, 0);
    results.push(
      check('сухость: политый растётся; сухой стоит (grownAt += ровно сухое время 1ч, wateredUntil=якорь now); полив возобновляет', () =>
        wet.wet && !dry.wet && dry.watered &&
        pushed === FARM_HOUR && dry.wateredUntil === FARM_T0 + 9 * FARM_HOUR &&
        resumed.wet && (resumed.grownAt ?? 0) === (dry.grownAt ?? 0) &&
        Math.round((resumed.remainingMs ?? 0) / FARM_HOUR) === 3, {
        expected: 'wet→растёт; dry: push 1ч, якорь T0+9ч; после полива remaining 3ч, grownAt неизменен',
        actual: `wet=${wet.wet}→${!dry.wet}, push ${pushed / FARM_HOUR}ч, якорь ${dry.wateredUntil}, resumed wet=${resumed.wet}, remaining ${Math.round((resumed.remainingMs ?? 0) / FARM_HOUR)}ч`,
      }),
    );
    f.dispose();
  }

  // ---------------------------------------- 9. catchUp: кап 72 + готовность по датам на проходе
  {
    const f = makeFarmGame();
    await f.game.init();
    (f.inv['inventory.acquire'] as unknown as (d: string, q: number, s: string) => R<unknown>)('seed_wheat', 1, 'selfcheck');
    f.farm['farm.plow'](0);
    f.farm['farm.plant']('wheat', 0); // grownAt T0+4ч
    f.farm['farm.water'](0); // окно T0+8ч
    f.clock.set(FARM_T0 + 80 * FARM_HOUR);
    const config: TimeConfig = { tickMs: 1000, autosaveMs: 30_000, catchupHourCap: 72, catchupDayCap: 14 };
    const report = new OfflineCatchup(f.game.bus, config).run(FARM_T0, f.clock.now());
    const t = tileOf(f, 0);
    const ready = f.events.find((e) => e.name === 'farm.tileChanged' && (e.payload as { to?: string }).to === 'ready');
    results.push(
      check('catchUp: часовой цикл кап 72 (80ч → 72 прохода); пшеница политая ГОТОВА по датам на перовом проходе (+4ч в окне)', () =>
        report.hoursFired === 72 && report.hoursNeeded === 80 && report.hoursCapped &&
        t.state === 'ready' && ready !== undefined, {
        expected: '72/80/кап, ready',
        actual: `${report.hoursFired}/${report.hoursNeeded}/${report.hoursCapped ? 'кап' : 'нет'}, ${t.state}`,
      }),
    );
    f.dispose();
  }

  // ---------------------------------------- 10. прополка: энергия 1, weeds→0, штраф снят, сжатие, отказ
  {
    const f = makeFarmGame();
    await f.game.init();
    seedWeedyWheat(f);
    const stop = forceWeedsChance(f, 0);
    hourPass(f, FARM_T0 + FARM_HOUR);
    hourPass(f, FARM_T0 + 2 * FARM_HOUR);
    stop();
    const weedy = tileOf(f, 0); // weeds 2
    f.clock.set(FARM_T0 + 2 * FARM_HOUR); // момент прополки = момент второго прохода
    const r = f.farm['farm.weed'](0) as R<{ prevWeeds: number }>;
    const clean = tileOf(f, 0);
    const spent = f.events.filter((e) => e.name === 'player.energySpent' && e.payload.stat === 'action.farm.weed.energyCost');
    const speedAfter = f.game.statBus.resolve({
      stat: 'farm.growthSpeed',
      ctx: { player: 'player', now: f.clock.now(), tags: ['farm:tile:field:0'] },
    });
    // сжатие: остаток × mult(2)/1 = 0.5 (оракул от фактического растянутого остатка)
    const expectedGrown = FARM_T0 + 2 * FARM_HOUR + Math.max(1, Math.round(((weedy.grownAt ?? 0) - (FARM_T0 + 2 * FARM_HOUR)) * weedsSpeedMult(2, 25)));
    // отказ при энергии 0: weeds целы
    (f.player['player.setEnergy'] as unknown as (n: number) => unknown)(0);
    hourPass(f, FARM_T0 + 3 * FARM_HOUR); // снова заросло? нет: weeds 0 → правило пропускает
    const stop2 = forceWeedsChance(f, 0);
    hourPass(f, FARM_T0 + 4 * FARM_HOUR);
    stop2();
    const reweeded = tileOf(f, 0);
    const fail = f.farm['farm.weed'](0) as R<unknown>;
    const after = tileOf(f, 0);
    results.push(
      check('прополка: энергия −1 (stat action.farm.weed.energyCost), weeds→0, штраф снят (resolve 100), остаток сжат mult(2)/1', () =>
        r.ok && r.value.prevWeeds === 2 && clean.weeds === 0 && spent.length === 1 && spent[0]!.payload.cost === 1 &&
        speedAfter === 100 && clean.grownAt === expectedGrown, {
        expected: `weeds 0, −1, 100, grownAt ${expectedGrown}`,
        actual: `weeds ${clean.weeds}, spent ${spent.length}, ${speedAfter}, grownAt ${clean.grownAt}`,
      }),
    );
    results.push(
      check('прополка: энергия 0 → отказ с причиной, weeds/даты целы (откат)', () =>
        !fail.ok && String(fail.error).includes('не хватает энергии') && after.weeds === reweeded.weeds && after.grownAt === reweeded.grownAt, {
        expected: 'отказ, состояние цело',
        actual: `${fail.ok ? 'ok?!' : 'отказ'}, weeds ${after.weeds}, grownAt ${after.grownAt}`,
      }),
    );
    f.dispose();
  }

  // ---------------------------------------- 11. исполнители TaskRegistry (без импорта фермы)
  {
    const f = makeFarmGame();
    await f.game.init();
    seedPumpkin(f);
    const list = f.game.tasks.list().filter((t) => t.id.startsWith('farm.'));
    const before = tileOf(f, 0);
    f.clock.set(FARM_T0 + 30 * 60_000); // +30м: свежее окно строго больше исходного
    const r = f.game.tasks.runTask('farm.water', { now: f.clock.now(), params: { tileIdx: 0 } });
    const after = tileOf(f, 0);
    const energy = f.events.some((e) => e.name === 'player.energySpent');
    const actionDone = f.events.some((e) => e.name === 'worker.actionDone');
    results.push(
      check('исполнители: farm.* ×5 в реестре; runTask(farm.water) поливает (окно освежено, энергия списана) — вызывающий ферму НЕ импортирует', () =>
        list.length === 5 &&
        ['farm.plow', 'farm.plant', 'farm.water', 'farm.weed', 'farm.harvest'].every((id) => list.some((t) => t.id === id)) &&
        r.ok && (after.wateredUntil ?? 0) > (before.wateredUntil ?? 0) && energy, {
        expected: '5 исполнителей, полив ок, энергия',
        actual: `${list.length} исполнителей, ${r.ok ? 'ок' : r.error}, энергия ${energy}`,
      }),
    );
    results.push(
      check('исполнители: worker.actionDone НЕ публикуется (событие каталога 02 §4 за M11 — не вводим молча)', () =>
        !actionDone, {
        expected: 'нет',
        actual: String(actionDone),
      }),
    );
    f.dispose();
  }

  // ---------------------------------------- 12. манифест = факту (1.2.0 · M05.3)
  {
    const f = makeFarmGame();
    await f.game.init();
    const m = f.game.modules.get('farm')?.manifest;
    results.push(
      check('манифест: 1.2.0 (publicApi += farm.upgrade/upgrades — G3); eventsPublished 3; eventsSubscribed [time.hourTick]; taskExecutors ×6 (+farm.sprinkler — условная точка G2); провайдеры ×2 (weeds + upgrades)', () =>
        m?.version === '1.2.0' &&
        JSON.stringify(m?.eventsPublished) === JSON.stringify(['farm.tileChanged', 'farm.cropHarvested', 'farm.weedsAppeared']) &&
        JSON.stringify(m?.eventsSubscribed) === JSON.stringify([{ event: 'time.hourTick', handler: 'onHourTick' }]) &&
        JSON.stringify(m?.taskExecutors) === JSON.stringify(['farm.plow', 'farm.plant', 'farm.water', 'farm.weed', 'farm.harvest', 'farm.sprinkler']) &&
        JSON.stringify(m?.modifierProviders) === JSON.stringify(['farmWeedsProvider', 'farmUpgradesProvider']), {
        expected: '1.2.0 / 3 / hourTick / 6 / weeds+upgrades',
        actual: `${m?.version} / ${m?.eventsPublished?.length} / ${JSON.stringify(m?.eventsSubscribed)} / ${m?.taskExecutors?.length} / ${JSON.stringify(m?.modifierProviders)}`,
      }),
    );
    f.dispose();
  }

  // ---------------------------------------- 13. сейв: weeds roundtrip + ленивый дефолт 0
  {
    const f = makeFarmGame();
    await f.game.init();
    seedWeedyWheat(f);
    const stop = forceWeedsChance(f, 0);
    hourPass(f, FARM_T0 + FARM_HOUR);
    hourPass(f, FARM_T0 + 2 * FARM_HOUR);
    stop();
    const t = tileOf(f, 0);
    const json = f.game.save.exportJson();
    const f2 = makeFarmGame();
    await f2.game.save.importJson(json);
    const t2 = tileOf(f2, 0);
    // v10-донор без weeds-поля → ленивый дефолт 0
    const donor = JSON.parse(json) as { modules: { farm: unknown } };
    const farm = donor.modules.farm as { tabs: Array<{ tiles: Array<Record<string, unknown>> }> };
    delete farm.tabs[0]!.tiles[0]!.weeds;
    const f3 = makeFarmGame();
    await f3.game.save.importJson(JSON.stringify(donor));
    const t3 = tileOf(f3, 0);
    results.push(
      check('сейв: weeds 2 + grownAt байт-в-байт в roundtrip; v10-донор без weeds-поля → ленивый дефолт 0 (без bump)', () =>
        t2.weeds === 2 && t2.grownAt === t.grownAt && t2.wateredUntil === t.wateredUntil && t3.weeds === 0, {
        expected: `weeds 2, grownAt ${t.grownAt}; донор → 0`,
        actual: `weeds ${t2.weeds}, grownAt ${t2.grownAt}; донор → ${t3.weeds}`,
      }),
    );
    f.dispose();
    f2.dispose();
    f3.dispose();
  }

  return results;
}
