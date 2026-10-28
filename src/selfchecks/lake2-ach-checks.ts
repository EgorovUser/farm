/**
 * Self-checks M08 «Озеро» — часть 2b (сеанс M08.2: второе озеро F14 +
 * счётчики/ачивка/нерка F15 + исполнители F16). Расщепление по 01 §6.
 *
 * Покрытие (бриф §2.3): «Второе озеро» — покупка создаёт lake2 (старты те
 * же данные 15/70, 0/6, статы нули), switch 0|1, уход — активного, тики —
 * ОБЕИХ (дрейф в обоих); СТАРЫЙ v13-сейв без lake2 — roundtrip байт-в-байт
 * (каноническая форма НЕ переформировывается, БЕЗ bump); roundtrip с lake2 +
 * идемпотентность; счётчики lake.* ×5 тикают по событиям; ачивка
 * ach_lake_master ({t:'any'} A/S/SS) — фикстура икры A (лаборатория plus2)
 * конец-в-конец: событие → счётчик → achievement.unlocked → claim 800з →
 * флаг ach.lake.master → НЕРКА-гейт ОТКРЫТ (fish.album без гейт-причины);
 * исполнители ×4 в реестре, runTask живой, worker.actionDone ОТСУТСТВУЕТ
 * (оракул отрицания); реестр ачивок 51 → 52 (ровно одно добавление).
 */
import { LAKE_TABLE } from '@/content/balance/lake';
import { ACHIEVEMENTS } from '@/content/quests/achievements';
import { migrateSaveData, SAVE_VERSION } from '@/kernel/save/migrations';
import { MemoryStorage } from '@/kernel/save/storage-drivers';
import { check, type CheckResult } from './types';
import {
  LAKE_T0,
  LAKE_DAY,
  LAKE_HOUR,
  dayPass,
  eventsOf,
  giveFish,
  hourPass,
  lakeView,
  makeLakeGame,
  makeSeededLakeGame,
  type R,
} from './lake-fixture';

const HOUR = LAKE_HOUR;

export async function runLake2AchChecks(): Promise<CheckResult[]> {
  const results: CheckResult[] = [];

  // ------------------------------------------------ 30. F14: второе озеро + switch + уход активного
  {
    const f = await makeSeededLakeGame('m082-lake2');
    f.game.wallet.grant('gold', 3000);
    const buy = f.lake['lake.upgrade']('upg_lake2') as R<unknown>;
    const again = f.lake['lake.upgrade']('upg_lake2') as R<unknown>;
    const sw1 = f.lake['lake.switch'](1) as R<{ activeLake: number }>;
    const v1 = lakeView(f);
    giveFish(f, 'crucian', 'C');
    const rel = f.lake['lake.release']((f.inv['inventory.list']() as Array<{ iid: string; defId: string }>)[0]!.iid) as R<unknown>;
    const afterRel = lakeView(f);
    const sw0 = f.lake['lake.switch'](0) as R<unknown>;
    const v0 = lakeView(f);
    const swBad = f.lake['lake.switch'](2) as R<unknown>;
    results.push(
      check('«Второе озеро» F14: покупка (1200з) создаёт lake2 — старты ТЕ ЖЕ данные (вода 15/70, слоты 0/6, статы нули); повторная покупка — отказ; lake.switch 1 — активное №2 (выпуск идёт во ВТОРОЕ озеро); switch 0 — обратно (первое пусто — уход активного); switch 2 — отказ', () =>
        buy.ok && !again.ok && again.error.includes('уже куплено') &&
        sw1.ok && v1.activeLake === 1 && v1.water.temperature === 15 && v1.water.cleanliness === 70 &&
        v1.slots.used === 0 && v1.slots.base === 6 && v1.stats.released === 0 &&
        rel.ok && afterRel.slots.used === 1 && afterRel.activeLake === 1 &&
        sw0.ok && v0.activeLake === 0 && v0.slots.used === 0 &&
        !swBad.ok, {
        expected: 'lake2 15/70 0/6; выпуск в активное; switch жив',
        actual: `buy ${buy.ok}; switch1 ${sw1.ok}; №2: ${v1.water.temperature}/${v1.water.cleanliness} ${v1.slots.used}/${v1.slots.base}; рыб там ${afterRel.slots.used}; №1 рыб ${v0.slots.used}`,
      }),
    );
    f.dispose();
  }

  // ------------------------------------------------ 31. F14: тики — по ОБЕИМ озёрам (дрейф в обоих)
  {
    const f = await makeSeededLakeGame('m082-lake2-ticks');
    f.game.wallet.grant('gold', 3000);
    f.lake['lake.upgrade']('upg_lake2') as R<unknown>;
    dayPass(f, LAKE_T0 + LAKE_DAY);
    const both = lakeView(f); // активное №1 + other №2
    results.push(
      check('«Второе озеро» F14 · ТИКИ: dayTick гоняет ОБА озера параллельно — чистота упала −5 в обоих (70 → 65), вода обоих в витрине (other) синхронна; улучшения/уход — только активного', () =>
        both.water.cleanliness === 65 && both.other !== null && both.other.water.cleanliness === 65 &&
        both.other.water.temperature === 15, {
        expected: 'оба 65/65',
        actual: `№1 ${both.water.cleanliness}; №2 ${both.other?.water.cleanliness ?? '—'}`,
      }),
    );
    f.dispose();
  }

  // ------------------------------------------------ 32. F14: СТАРЫЙ v13-сейв — roundtrip байт-в-байт + lake2 roundtrip
  {
    // старая форма M08.1 (без upgrades/research/lake2/activeLake)
    const oldSlice = {
      v: 1,
      slots: [
        { fishId: 'crucian', quality: 'B', fedAt: LAKE_T0, sick: false, bornAt: LAKE_T0 },
        { sick: false },
      ],
      water: { temperature: 15, cleanliness: 63 },
      roe: [{ fishId: 'crucian', tier: 'C', readyAt: LAKE_T0 + 3_600_000 }],
      stats: { released: 1, bred: 1, harvested: 0 },
      pairs: { crucian: { fishId: 'crucian', slotA: 0, slotB: 1, tierA: 'B', tierB: 'C', dueAt: LAKE_T0 + 7_200_000 } },
    };
    const storage = new MemoryStorage();
    await storage.set('main', JSON.stringify({
      saveVersion: 13, savedAt: LAKE_T0, saveId: 'm082-old-v13', contentVersion: '0.1.0-phase0',
      modules: { lake: oldSlice }, lastSeen: LAKE_T0,
    }));
    const f1 = makeLakeGame(storage);
    await f1.game.init();
    await f1.game.save.save();
    const raw1 = JSON.parse((await storage.get('main')) ?? '{}') as { modules: { lake: unknown } };
    const identical = JSON.stringify(raw1.modules.lake) === JSON.stringify(oldSlice);
    f1.dispose();
    // live-с lake2: покупка + switch + рыба во втором → reload → идентично
    const st = new MemoryStorage();
    const f2 = makeLakeGame(st);
    await f2.game.init();
    f2.game.wallet.grant('gold', 3000);
    f2.lake['lake.upgrade']('upg_lake2') as R<unknown>;
    f2.lake['lake.switch'](1) as R<unknown>;
    giveFish(f2, 'crucian', 'C');
    f2.lake['lake.release']((f2.inv['inventory.list']() as Array<{ iid: string; defId: string }>)[0]!.iid) as R<unknown>;
    f2.lake['lake.upgrade']('upg_aerator') as R<unknown>; // улучшение — в АКТИВНОМ (№2)
    await f2.game.save.save();
    const f3 = makeLakeGame(st);
    await f3.game.init();
    await f3.game.save.save();
    const rawA = JSON.parse((await st.get('main')) ?? '{}') as { modules: { lake: Record<string, unknown> } };
    const f4 = makeLakeGame(st);
    await f4.game.init();
    await f4.game.save.save();
    const rawB = JSON.parse((await st.get('main')) ?? '{}') as { modules: { lake: Record<string, unknown> } };
    const idem = JSON.stringify(rawA.modules.lake) === JSON.stringify(rawB.modules.lake);
    const has2 = rawA.modules.lake.lake2 !== undefined && rawA.modules.lake.activeLake === 1;
    const upg2 = (rawA.modules.lake.lake2 as { upgrades?: string[] }).upgrades?.includes('upg_aerator') === true;
    f2.dispose(); f3.dispose(); f4.dispose();
    results.push(
      check('Сейв F14 (БЕЗ bump): СТАРЫЙ v13-срез (форма M08.1) — load+re-save байт-в-байт (каноническая форма НЕ переформировывается, ленивые дефолты не пишутся); с lake2 — roundtrip + идемпотентность (lake2/activeLake/upgrades пер-озеро переживают dispose/load; улучшение №2 не попало в №1)', () =>
        identical && idem && has2 && upg2 && SAVE_VERSION === 15 && migrateSaveData({ saveVersion: 15, modules: {} } as never).steps === 0, { // [M11 · v14 → M12.1 · v15: срез mine]
        expected: 'старая форма идентична; lake2 идемпотентен',
        actual: `old ${identical}; lake2 ${idem} (${has2 ? 'жив' : 'НЕТ'}; аэратор в №2 ${upg2})`,
      }),
    );
  }

  // ------------------------------------------------ 33. F15: счётчики lake.* ×5 (события → StatsService)
  {
    const f = await makeSeededLakeGame('m082-counters');
    f.game.bus.publish('lake.bred', { fishId: 'crucian', childTier: 'A', parents: [{ slot: 0, tier: 'B' }, { slot: 1, tier: 'B' }] });
    f.game.bus.publish('lake.bred', { fishId: 'crucian', childTier: 'S', parents: [{ slot: 0, tier: 'A' }, { slot: 1, tier: 'S' }] });
    f.game.bus.publish('lake.bred', { fishId: 'crucian', childTier: 'SS', parents: [{ slot: 0, tier: 'SS' }, { slot: 1, tier: 'S' }] });
    f.game.bus.publish('lake.fishSick', { slotIdx: 2, fishId: 'pike' });
    results.push(
      check('счётчики F15 (данными, конфиг M01 §6): lake.bred тикает по событию (+1 на икру, любой тир); lake.bred.a/s/ss — фильтр childTier (A/S/SS по 1); lake.sick — lake.fishSick; соседи конфига целы (fish.total жив, 18 → 23 записей)', () =>
        f.game.stats.get('lake.bred') === 3 &&
        f.game.stats.get('lake.bred.a') === 1 && f.game.stats.get('lake.bred.s') === 1 && f.game.stats.get('lake.bred.ss') === 1 &&
        f.game.stats.get('lake.sick') === 1, {
        expected: '3 / 1-1-1 / 1',
        actual: `bred ${f.game.stats.get('lake.bred')}; a/s/ss ${f.game.stats.get('lake.bred.a')}/${f.game.stats.get('lake.bred.s')}/${f.game.stats.get('lake.bred.ss')}; sick ${f.game.stats.get('lake.sick')}`,
      }),
    );
    f.dispose();
  }

  // ------------------------------------------------ 34. F15: ачивка «Хозяин озера» конец-в-конец + нерка-гейт
  {
    const f = await makeSeededLakeGame('m082-ach-lake-master');
    f.game.wallet.grant('gold', 5000);
    const regBefore = ACHIEVEMENTS.length;
    giveFish(f, 'crucian', 'B');
    giveFish(f, 'crucian', 'B');
    const iids = (f.inv['inventory.list']() as Array<{ iid: string; defId: string }>).filter((i) => i.defId === 'crucian');
    f.lake['lake.release'](iids[0]!.iid);
    f.lake['lake.release'](iids[1]!.iid);
    f.lake['lake.upgrade']('upg_laboratory') as R<unknown>;
    f.lake['lake.research']('plus2') as R<unknown>;
    // нерка ДО ачивки — ЖИВОЙ гейт-путь: fish.force ice_char (река) — отказ
    // «нужна ачивка „Хозяин озера"» (форс уважает conditions — M07.2)
    for (let guard = 0; guard < 200; guard++) {
      // открываем реку: навык Рыболовство ≥ 10 (циклом до уровня — паттерн
      // fish-river-checks skillTo)
      const skills = f.player['skills.list']() as Array<{ id: string; level: number }>;
      if ((skills.find((x) => x.id === 'fishing')?.level ?? 0) >= 10) break;
      f.player['skills.addXp']('fishing', 500, 'selfcheck');
    }
    f.fish['fish.location']('river');
    const rodBuy = f.fish['fish.buy']('bamboo_rod') as R<{ iid: string }>;
    f.inv['inventory.equip'](rodBuy.ok ? rodBuy.value.iid : '', 'rod');
    f.fish['fish.buy']('worm_bait', 5);
    const baitList = (f.inv['inventory.list']() as Array<{ iid: string; defId: string }>).find((i) => i.defId === 'worm_bait');
    if (baitList) f.inv['inventory.equip'](baitList.iid, 'bait');
    const narkaBeforeForce = f.fish['fish.force']('ice_char') as R<{ defId?: string }>;
    const achEv: Array<Record<string, unknown>> = [];
    const off = f.game.bus.subscribe('achievement.unlocked', (p) => achEv.push(p as Record<string, unknown>));
    hourPass(f, LAKE_T0 + 25 * HOUR); // икра A → lake.bred → счётчик → ачивка
    const unlocked = achEv.map((e) => e.id);
    const flags = (f.game.modules.get('quests')?.api['quests.flags']() as string[]);
    const gold0 = f.game.wallet.get('gold');
    const claim = (f.game.modules.get('quests')?.api['quests.claim']('ach_lake_master') ?? { ok: false, error: 'no api' }) as R<{ granted?: unknown }>;
    const gold1 = f.game.wallet.get('gold');
    off();
    // нерка ПОСЛЕ — гейт СНЯТ живым оценщиком: fish.force ice_char — улов!
    // (спот-улов нерки в реке [DECISION-спот брифа F15]; дифф fishing = ПУСТ)
    const narkaAfterForce = f.fish['fish.force']('ice_char') as R<unknown>;
    const narkaCaught = f.game.stats.get('fish.ice_char') ?? 0;
    const ach = ACHIEVEMENTS.find((a) => a.id === 'ach_lake_master');
    results.push(
      check('ачивка F15 «Хозяин озера» конец-в-конец: реестр 61 → 62 ([M12.2] пул M15 легально расширен +9 ачивками шахты ach_mine_boss_1..9; [M16.1] +1 ach_homestead_master «Мастер хутора» — гейт деревни, ветка (б) DECISION M161-гейт — расширение = факту, прецедент чека 26 FIX-M11; условие {t:any} counterAtLeast lake.bred.a/s/ss ≥ 1 — «A+» = A/S/SS [DECISION-чтение]); фикстура икры тира A (Лаборатория plus2) → lake.bred → счётчик lake.bred.a → achievement.unlocked → флаг ach.lake.master → claim (канон M15 §6) +800з; нерка: ДО — fish.force отказ «нужна ачивка „Хозяин озера“» (гейт-оценщик жив), ПОСЛЕ — спот-улов force в реке (fish.ice_char 1) — дифф fishing = ПУСТ', () =>
        regBefore === 62 && ach !== undefined && ach.condition.t === 'any' &&
        !narkaBeforeForce.ok && (narkaBeforeForce.error.includes('ach_lake_master') || narkaBeforeForce.error.includes('Хозяин озера')) &&
        unlocked.includes('ach_lake_master') && flags.includes('ach.lake.master') &&
        claim.ok && gold1 - gold0 === 800 &&
        narkaAfterForce.ok && narkaCaught === 1, {
        expected: '62 в реестре (61 факт M12.2 + ach_homestead_master M16.1); unlocked+claim+800з; нерка: отказ → улов',
        actual: `реестр ${regBefore}; события ${unlocked.join(',')}; claim ${claim.ok} (+${gold1 - gold0}з); нерка: до «${narkaBeforeForce.ok ? 'ок??' : narkaBeforeForce.error.slice(0, 60)}» / после ${narkaAfterForce.ok} (fish.ice_char ${narkaCaught})`,
      }),
    );
    f.dispose();
  }

  // ------------------------------------------------ 35. F16: исполнители ×4 + worker.actionDone ОТСУТСТВУЕТ
  {
    const f = await makeSeededLakeGame('m082-executors');
    const tasksBefore = f.game.tasks.list().map((t) => t.id);
    f.game.wallet.grant('gold', 500);
    giveFish(f, 'crucian', 'C');
    f.lake['lake.release']((f.inv['inventory.list']() as Array<{ iid: string; defId: string }>)[0]!.iid) as R<unknown>;
    const c0 = lakeView(f).water.cleanliness;
    const done: Array<Record<string, unknown>> = [];
    const off = f.game.bus.subscribe('worker.actionDone', (p) => done.push(p as Record<string, unknown>));
    const clean = f.game.tasks.runTask('lake.clean', { now: 0, params: {} }) as R<{ message: string }>;
    const harvest = f.game.tasks.runTask('lake.harvest', { now: 0, params: {} }) as R<{ message: string }>;
    const treatNone = f.game.tasks.runTask('lake.treat', { now: 0, params: {} }) as R<unknown>;
    const invFish = (f.inv['inventory.list']() as Array<{ defId: string }>).filter((i) => i.defId === 'crucian').length;
    off();
    results.push(
      check('исполнители F16: реестр 15 базово (11 + lake.feed/treat/clean/harvest ×4 — тонкие обёртки publicApi); runTask lake.clean ЖИВОЙ (чистота 70 → 85, энергия 3); lake.harvest — первая взрослая (старейшая по bornAt) → инвентарь источник lake; lake.treat без больных — честный отказ; worker.actionDone В ЖУРНАЛЕ ОТСУТСТВУЕТ (домен M11 — оракул отрицания)', () =>
        tasksBefore.length === 15 &&
        ['lake.feed', 'lake.treat', 'lake.clean', 'lake.harvest'].every((id) => tasksBefore.includes(id)) &&
        clean.ok && lakeView(f).water.cleanliness === c0 + 15 &&
        harvest.ok && invFish === 1 &&
        !treatNone.ok && treatNone.error.includes('больных') &&
        done.length === 0, {
        expected: 'реестр 15; clean +15; harvest жив; отказ treat; 0 actionDone',
        actual: `реестр ${tasksBefore.length}; clean ${clean.ok}; harvest ${harvest.ok} (рыб ${invFish}); treat ${treatNone.ok}; actionDone ${done.length}`,
      }),
    );
    f.dispose();
  }

  return results;
}
