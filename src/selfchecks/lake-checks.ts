/**
 * Self-checks M08 «Озеро» — часть 1 (сеанс M08.1: каркас + срез v13 +
 * вода/условия + уход + экономика). Оракулы руками (без ожиданий).
 *
 * Покрытие (бриф §3.8): контент (сетка lakeRequirements поимённо + нейтраль)
 * и манифест = факту; монтаж v13 (вода 15/70, слоты 0/6, икра пуста, статы
 * нули); выпуск (качество переносится; посторонний предмет/полное озеро/
 * неизвестный iid — отказы с причинами); кормление (Корм ×N атомарно,
 * энергия 2, отказ без Корма — состояние цело/событий нет); чистка (+15,
 * кап 100, энергия 3); дрейф −5/день (кап 0); болезни (шанс 5%/2% по
 * требованиям; сценарный sickPass + dev-форс + лечение animal_remedy ×1 +
 * «лечить нечего»).
 *
 * Экономика/покупка/pen-выравнивание — lake-care-checks; разведение —
 * lake-breed-checks; миграция — lake-migration-checks (расщепление 01 §6).
 */
import { LAKE_TABLE } from '@/content/balance/lake';
import { POND_FISH, RIVER_FISH } from '@/content/fishing/fish';
import { SAVE_VERSION } from '@/kernel/save/migrations';
import { ITEMS } from '@/content/items/items';
import { sickPass, sickChanceOf } from '@/game/modules/lake/logic/sickness';
import { requirementsMet } from '@/game/modules/lake/logic/water';
import type { LakeSlot } from '@/game/modules/lake/state';
import type { QualityTier } from '@/shared/types/ids';
import { check, group, type CheckGroup, type CheckResult } from './types';
import {
  LAKE_T0,
  LAKE_DAY,
  dayPass,
  energyOf,
  eventsOf,
  giveFish,
  lakeView,
  makeLakeGame,
  makeSeededLakeGame,
  type R,
} from './lake-fixture';
import { runLakeCareChecks } from './lake-care-checks';
import { runLakeBreedChecks } from './lake-breed-checks';
import { runLakeMigrationChecks } from './lake-migration-checks';
import { runLakeUpgChecks } from './lake-upg-checks';
import { runLakeLabChecks } from './lake-lab-checks';
import { runLake2AchChecks } from './lake2-ach-checks';

export async function runLakeChecks(): Promise<CheckGroup> {
  const results: CheckResult[] = [];

  // ------------------------------------------------ 1. контент: сетка требований + манифест = факту
  {
    const f = makeLakeGame();
    await f.game.init();
    const byId = new Map([...POND_FISH, ...RIVER_FISH].map((x) => [x.id, x]));
    const grid: Array<[string, number, number, number]> = [
      ['crucian', 5, 30, 10], ['rotan', 5, 30, 10], ['perch', 5, 30, 10],
      ['tench', 10, 35, 20], ['pike', 10, 35, 20], ['mirror_carp', 10, 35, 30],
      ['loach', 0, 25, 10], ['dace', 0, 25, 10], ['gudgeon', 0, 25, 10],
      ['chub', 5, 30, 20], ['zander', 5, 30, 20], ['trout', 0, 20, 30],
      ['sturgeon', 5, 25, 40], ['golden_carp', 10, 35, 50],
      ['ice_char', 0, 15, 50], ['ancient_som', 5, 25, 60],
    ];
    const gridOk = grid.every(([id, tmin, tmax, cmin]) => {
      const r = byId.get(id)?.lakeRequirements;
      return r !== undefined && r.tempMin === tmin && r.tempMax === tmax && r.cleanlinessMin === cmin;
    });
    const remedy = ITEMS.find((i) => i.id === 'animal_remedy');
    const energyFeed = f.game.statBus.resolve({ stat: 'action.lake.feed.energyCost', ctx: f.game.time.ctx('player') });
    const energyClean = f.game.statBus.resolve({ stat: 'action.lake.clean.energyCost', ctx: f.game.time.ctx('player') });
    const manifest = f.game.modules.get('lake')?.manifest;
    // [M08.2 · F16] манифест ОДИН bump 1.0.0 → 1.1.0: publicApi ×12 (+
    // upgrade/switch/research), modifierProviders ['lake.upgrades'],
    // taskExecutors ×4 (тонкие обёртки; worker.actionDone — домен M11)
    const apiOk =
      manifest !== undefined && manifest.version === '1.1.0' && manifest.stateKey === 'lake' &&
      JSON.stringify(manifest.eventsPublished) === JSON.stringify(['lake.bred', 'lake.fishSick']) &&
      (manifest.eventsSubscribed?.length ?? 0) === 2 &&
      JSON.stringify(manifest.modifierProviders ?? []) === JSON.stringify(['lake.upgrades']) &&
      JSON.stringify(manifest.taskExecutors ?? []) === JSON.stringify(['lake.feed', 'lake.treat', 'lake.clean', 'lake.harvest']) &&
      ['lake.state', 'lake.release', 'lake.feed', 'lake.treat', 'lake.clean', 'lake.harvest', 'lake.buy', 'lake.upgrade', 'lake.switch', 'lake.research', 'lake.pair', 'lake.force']
        .every((k) => typeof f.lake[k] === 'function');
    // нейтраль: вид без записи — {0–100, ≥0} (LAKE_TABLE.neutralRequirements)
    const neutralOk =
      requirementsMet(LAKE_TABLE.neutralRequirements, { temperature: 0, cleanliness: 0 }) &&
      requirementsMet(LAKE_TABLE.neutralRequirements, { temperature: 100, cleanliness: 100 }) &&
      !requirementsMet({ tempMin: 5, tempMax: 30, cleanlinessMin: 10 }, { temperature: 35, cleanliness: 70 }) &&
      !requirementsMet({ tempMin: 5, tempMax: 30, cleanlinessMin: 10 }, { temperature: 15, cleanliness: 9 }) &&
      requirementsMet({ tempMin: 5, tempMax: 30, cleanlinessMin: 10 }, { temperature: 15, cleanliness: 10 });
    results.push(
      check('контент M08: сетка lakeRequirements ×16 поимённо по брифу F3; нейтраль {0–100, ≥0} через Condition-оценщик (границы включительно, нарушения — темп/чистота); animal_remedy жив (16з, НЕ пересоздан); энергии lake.feed/clean = 2/3 (bases, не в balance — П2); манифест 1.0.0 = факту (publicApi ×9, events ×2 = каталогу 02 §4, тики ×2, providers/executors ПУСТЫ — M08.2)', () =>
        gridOk && neutralOk &&
        LAKE_TABLE.water.temperatureStart === 15 && LAKE_TABLE.water.cleanlinessStart === 70 &&
        LAKE_TABLE.water.cleanlinessDriftPerDay === -5 && LAKE_TABLE.slots.base === 6 &&
        LAKE_TABLE.breeding.mutation.plus1From === 0.89 && LAKE_TABLE.breeding.mutation.plus2From === 0.99 &&
        LAKE_TABLE.sickness.badConditionsChance === 0.05 && LAKE_TABLE.sickness.goodConditionsChance === 0.02 &&
        LAKE_TABLE.roe.matureHours === 24 &&
        JSON.stringify(LAKE_TABLE.breeding.periodHoursByRarity) === JSON.stringify({ common: 24, uncommon: 36, rare: 48, epic: 60, legendary: 72 }) &&
        remedy?.basePrice === 16 && energyFeed === 2 && energyClean === 3 && apiOk, {
        expected: '×16 сетка / нейтраль жива / 15/70/−5/6 / 0.89-0.99 / 5%-2% / 24ч / лестница 24-72 / энергии 2-3 / манифест 1.1.0',
        actual: `сетка ${String(gridOk)} / нейтраль ${String(neutralOk)} / энергии ${energyFeed}-${energyClean} / манифест ${String(apiOk)}`,
      }),
    );
    f.dispose();
  }

  // ------------------------------------------------ 2. монтаж: дефолт v13 (миграция v0→13 живой игры)
  {
    const f = makeLakeGame();
    await f.game.init();
    const v = lakeView(f);
    const info = (f.game.save as unknown as { info: () => { saveVersion: number; slices: string[] } }).info();
    results.push(
      check('монтаж: честная новая игра → v15, срез lake в списке (20 срезов — +workers [M11 · v14] +mine [M12.1 · v15] +passives [M14 · ленивый срез]); витрина: вода 15°/70, слоты 0/6 пустые, икра пуста, статы нули', () =>
        info.saveVersion === SAVE_VERSION && info.saveVersion === 15 && info.slices.length === 20 && info.slices.includes('lake') && info.slices.includes('passives') &&
        v.water.temperature === 15 && v.water.cleanliness === 70 &&
        v.slots.used === 0 && v.slots.base === 6 && v.fish.length === 0 && v.roe.length === 0 &&
        v.stats.released === 0 && v.stats.bred === 0 && v.stats.harvested === 0 && v.hungryCount === 0, {
        expected: 'v15/20 срезов; 15/70; 0/6; икра пуста; статы нули',
        actual: `v${info.saveVersion}/${info.slices.length}; ${v.water.temperature}/${v.water.cleanliness}; ${v.slots.used}/${v.slots.base}; икра ${v.roe.length}; статы ${v.stats.released}/${v.stats.bred}/${v.stats.harvested}`,
      }),
    );
    f.dispose();
  }

  // ------------------------------------------------ 3. выпуск: живой путь + качество + отказы
  {
    const f = await makeSeededLakeGame('m081-release-live');
    f.game.wallet.grant('gold', 100);
    const fish = giveFish(f, 'crucian', 'B');
    const bogus = giveFish(f, 'worm_bait', 'D');
    const rel = f.lake['lake.release'](fish.ok ? fish.value : '') as R<{ slotIdx: number; fishId: string; quality: string }>;
    const consumed = eventsOf(f, 'item.consumed').filter((e) => e.source === 'lake.release');
    const notFish = f.lake['lake.release'](bogus.ok ? bogus.value : '') as R<unknown>;
    const noIid = f.lake['lake.release']('no-such-iid') as R<unknown>;
    // полное озеро: ещё 5 выпусков → 6/6, 7-й отказ. Порядок выдачи —
    // ПО ВОЗРАСТАНИЮ качества (D, C, C, A, S): канон M02 remove — worst-first
    // (D30), при возрастании списком каждый съедает СВОЮ запись
    for (const t of ['D', 'C', 'C', 'A', 'S'] as const) giveFish(f, 'crucian', t);
    const list = (f.inv['inventory.list']() as Array<{ iid: string; defId: string }>).filter((i) => i.defId === 'crucian');
    for (const entry of list.slice(0, 5)) f.lake['lake.release'](entry.iid);
    const full = lakeView(f);
    const last = giveFish(f, 'crucian', 'C');
    const seventh = f.lake['lake.release'](last.ok ? last.value : '') as R<unknown>;
    results.push(
      check('выпуск: рыба из рюкзака → слот (тир B переносится, iid-запись израсходована item.consumed source lake.release, статы released ≥ 1); посторонний предмет (Червь) — отказ «не рыба»; неизвестный iid — отказ; полное озеро 6/6 — 7-й выпуск отказ с причиной', () =>
        rel.ok && rel.value.fishId === 'crucian' && rel.value.quality === 'B' &&
        consumed.length === 1 && lakeView(f).stats.released >= 1 &&
        !notFish.ok && notFish.error.includes('не рыба') &&
        !noIid.ok && noIid.error.includes('не найден') &&
        full.slots.used === 6 && !seventh.ok && seventh.error.includes('полно'), {
        expected: 'выпуск B → слот 0 / 3 отказа (не рыба, нет iid, полно) / consumed 1',
        actual: `${rel.ok ? `${rel.value.fishId}:${rel.value.quality}` : rel.error} / не рыба ${notFish.ok} / нет iid ${noIid.ok} / полно ${seventh.ok} (${full.slots.used}/${full.slots.base})`,
      }),
    );
    f.dispose();
  }

  // ------------------------------------------------ 4. кормление: Корм ×N, энергия 2, атомарность
  {
    const f = await makeSeededLakeGame('m081-feed');
    f.game.wallet.grant('gold', 100);
    f.game.wallet.grant('feed', 1); // на одну рыбу — а голодных будет 2
    giveFish(f, 'crucian', 'C');
    giveFish(f, 'crucian', 'C');
    const iids = (f.inv['inventory.list']() as Array<{ iid: string; defId: string }>).filter((i) => i.defId === 'crucian');
    for (const e of iids) f.lake['lake.release'](e.iid);
    dayPass(f, LAKE_T0 + LAKE_DAY + 3_600_000); // +25ч: обе голодные (дрейф тоже прошёл)
    const hungry = lakeView(f);
    const e0 = energyOf(f);
    const short = f.lake['lake.feed']() as R<unknown>; // Корма 1 < 2 — отказ
    const txShort = eventsOf(f, 'wallet.transaction').filter((e) => e.eventId === 'lake.feed').length;
    const spentShort = eventsOf(f, 'player.energySpent').length;
    const stateIntact = lakeView(f);
    f.game.wallet.grant('feed', 5);
    const ok = f.lake['lake.feed']() as R<{ fed: number; consumed: number }>;
    const tx = eventsOf(f, 'wallet.transaction').filter((e) => e.eventId === 'lake.feed');
    const spent = eventsOf(f, 'player.energySpent');
    const after = lakeView(f);
    const again = f.lake['lake.feed']() as R<unknown>;
    results.push(
      check('кормление: 2 голодные (+25ч) → Корм ×2 транзакцией lake.feed + энергия −2 (action.lake.feed.energyCost); нехватка Корма (1 < 2) — отказ: состояние цело, событий нет, энергия НЕ тронута; повтор при сытых — «голодных рыб нет»', () =>
        hungry.hungryCount === 2 &&
        !short.ok && txShort === 0 && spentShort === 0 &&
        stateIntact.hungryCount === 2 &&
        ok.ok && ok.value.fed === 2 && tx.length === 1 && f.game.wallet.get('feed') === 4 &&
        after.hungryCount === 0 &&
        spent.some((s) => s.stat === 'action.lake.feed.energyCost' && s.cost === 2) &&
        Math.round(e0 - energyOf(f)) === 2 &&
        !again.ok && again.error.includes('голодных'), {
        expected: 'отказ без Корма цел (0 tx/0 энергии) / tx 1 (−2 Корма) / −2 энергии / сытость 2→0',
        actual: `голодных ${hungry.hungryCount} → ${after.hungryCount}; отказ ${short.ok}; tx ${tx.length}; энергия ${e0}→${energyOf(f)}; Корм остался ${f.game.wallet.get('feed')}`,
      }),
    );
    f.dispose();
  }

  // ------------------------------------------------ 5. чистка + дрейф −5/день (кап 0)
  {
    const f = await makeSeededLakeGame('m081-clean-drift');
    const e0 = energyOf(f);
    const clean1 = f.lake['lake.clean']() as R<{ cleanliness: number }>;
    const eAfterClean = energyOf(f);
    dayPass(f, LAKE_T0 + LAKE_DAY); // 85 − 5 = 80
    const d1 = lakeView(f).water.cleanliness;
    for (let d = 2; d <= 4; d++) dayPass(f, LAKE_T0 + d * LAKE_DAY); // 75 / 70 / 65
    const d4 = lakeView(f).water.cleanliness;
    for (let d = 5; d <= 20; d++) dayPass(f, LAKE_T0 + d * LAKE_DAY); // до пола 0
    const floor = lakeView(f).water.cleanliness;
    const atFloor = f.lake['lake.clean']() as R<{ cleanliness: number }>;
    results.push(
      check('чистка «Сачок»: 70 → 85 (+15, энергия −3 за чистку); дрейф −5/день на dayTick (85→80→75→70→65 за 4 дня); 20 дней → пол 0 (кап); чистка с пола жива (+15 → 15)', () =>
        clean1.ok && clean1.value.cleanliness === 85 && Math.round(e0 - eAfterClean) === 3 &&
        d1 === 80 && d4 === 65 && floor === 0 && atFloor.ok && atFloor.value.cleanliness === 15, {
        expected: '70→85 (−3э) → 80 → 65 → 0 (пол) → чистка 15',
        actual: `${clean1.ok ? clean1.value.cleanliness : clean1.error} → ${d1} → ${d4} → ${floor} → ${atFloor.ok ? atFloor.value.cleanliness : atFloor.error}; энергия −${Math.round(e0 - eAfterClean)}`,
      }),
    );
    f.dispose();
  }

  // ------------------------------------------------ 6. болезни: 5%/2% + сценарный sickPass + dev-форс + лечение
  {
    const f = await makeSeededLakeGame('m081-sick');
    f.game.wallet.grant('gold', 100);
    const fish = giveFish(f, 'crucian', 'C');
    f.lake['lake.release'](fish.ok ? fish.value : '');
    const goodChance = sickChanceOf({ tempMin: 5, tempMax: 30, cleanlinessMin: 10 }, { temperature: 15, cleanliness: 70 }, LAKE_TABLE);
    const badChance = sickChanceOf({ tempMin: 5, tempMax: 30, cleanlinessMin: 10 }, { temperature: 15, cleanliness: 5 }, LAKE_TABLE);
    // сценарный sickPass: вода нарушает требования Карася (чистота 5 < 10) → 5%;
    // ролл 0.04 < 0.05 → заболеет (стрим lake:sick:crucian)
    const badWater = {
      v: 1 as const,
      slots: [{ fishId: 'crucian', quality: 'C' as QualityTier, fedAt: LAKE_T0, sick: false, bornAt: LAKE_T0 } satisfies LakeSlot],
      water: { temperature: 15, cleanliness: 5 },
      roe: [],
      stats: { released: 1, bred: 0, harvested: 0 },
    };
    let rolled = -1;
    const scripted = (src: string): number => {
      rolled = src === 'lake:sick:crucian' ? 0.04 : 0.5;
      return rolled;
    };
    const pass = sickPass(badWater, LAKE_T0, LAKE_TABLE, (id) => (id === 'crucian' ? POND_FISH[0] : undefined), scripted);
    // живой путь: dev-форс → lake.fishSick {slotIdx, fishId} → лечение без
    // лекарства — отказ; с animal_remedy ×1 (tx lake.treat) → здорова;
    // повтор — «лечить нечего» (прецедент pen.heal)
    const forced = f.lake['lake.force']('sick', 0) as R<{ slotIdx: number; fishId: string }>;
    const sickEv = eventsOf(f, 'lake.fishSick');
    const noRemedy = f.lake['lake.treat'](0) as R<unknown>;
    giveFish(f, 'animal_remedy', 'D');
    const treated = f.lake['lake.treat'](0) as R<{ slotIdx: number; fishId: string }>;
    const treatTx = eventsOf(f, 'wallet.transaction').filter((e) => e.eventId === 'lake.treat');
    const afterTreat = lakeView(f);
    const healthyErr = f.lake['lake.treat'](0) as R<unknown>;
    results.push(
      check('болезни: шанс 5% при нарушенных требованиях / 2% при хороших (sickChanceOf по Condition-оценщику); сценарный sickPass — ролл 0.04 < 0.05 → больна (стрим lake:sick:crucian, pure-функция); dev-форс lake.force sick → lake.fishSick {slotIdx: 0, fishId: crucian} = каталогу; лечение БЕЗ лекарства — отказ; с animal_remedy ×1 (tx lake.treat) → здорова; здоровая — «лечить нечего»', () =>
        goodChance === 0.02 && badChance === 0.05 &&
        pass.sickened.length === 1 && pass.sickened[0]!.slotIdx === 0 && pass.state.slots[0]!.sick === true && rolled === 0.04 &&
        forced.ok && sickEv.length === 1 && sickEv[0]!.slotIdx === 0 && sickEv[0]!.fishId === 'crucian' &&
        !noRemedy.ok && noRemedy.error.includes('animal_remedy') &&
        treated.ok && treatTx.length === 1 && afterTreat.fish[0] !== undefined && !afterTreat.fish[0]!.sick &&
        !healthyErr.ok && healthyErr.error.includes('лечить нечего'), {
        expected: '5%/2%; pass 1 больна; форс + событие; отказ без лекарства; лечение живо; «лечить нечего»',
        actual: `шансы ${badChance}/${goodChance}; pass ${pass.sickened.length} (ролл ${rolled}); форс ${forced.ok}; событие ${sickEv.length}; без лекарства ${noRemedy.ok}; после лечения ${afterTreat.fish[0]?.sick === true ? 'больна' : 'здорова'}`,
      }),
    );
    f.dispose();
  }
  return group('M08 · Озеро', [...results, ...(await runLakeCareChecks()), ...(await runLakeBreedChecks()), ...(await runLakeMigrationChecks()), ...(await runLakeUpgChecks()), ...(await runLakeLabChecks()), ...(await runLake2AchChecks())]);
}
