/**
 * Self-checks M11 «Работники» — часть 4 (сеанс M11.2: улучшения ×5 +
 * манифест 1.1.0 + сейв v14 без миграций). Расщепление
 * workers-tick-checks по 01 §6 (файл превысил 500 строк); прецедент
 * lake-upg-checks/lake-lab-checks M08. Живые rng-роллы детерминированы
 * стримами (фикс-saveId; ×2 байт-в-байт канону).
 */
import { WORKER_UPGRADES } from '@/content/workers/upgrades';
import { WORKERS_TABLE } from '@/content/workers/table';
import { successChanceOf } from '@/game/modules/workers/logic/tick';
import { dayPass as pureDayPass } from '@/game/modules/workers/logic/day';
import { canonicalWorkersState, type WorkersState } from '@/game/modules/workers/state';
import { check, type CheckResult } from './types';
import {
  WORKERS_T0,
  WORKERS_DAY,
  boardView,
  dayPass,
  energyOf,
  eventsOf,
  hireFirstOf,
  hourPass,
  lastRollOf,
  makeSeededWorkersGame,
  workersView,
  type R,
} from './workers-fixture';
import { mkWorker, scenarioRolls, mkDayDeps } from './workers-day-checks';

const why = (r: R<unknown>): string => (r.ok ? 'ok' : r.error);

const HOUR = 3_600_000;

export async function runWorkersUpgChecks(): Promise<CheckResult[]> {
  const results: CheckResult[] = [];

  // ------------------------------------------------ 19. улучшения ×5: покупка/повтор/витрина/без энергии
  {
    const f = await makeSeededWorkersGame('m112-upgrades');
    f.game.wallet.grant('gold', 5000);
    const energyBefore = energyOf(f);
    const ids = WORKER_UPGRADES.map((u) => u.id);
    const prices = WORKER_UPGRADES.map((u) => u.cost.qty);
    const bought: R<{ name: string; price: number }>[] = [];
    for (const id of ids) {
      bought.push(f.workers['workers.upgrades'](id) as R<{ name: string; price: number }>);
    }
    const repeat = f.workers['workers.upgrades'](ids[0] as string) as R<unknown>;
    const bogus = f.workers['workers.upgrades']('upg_worker_bogus') as R<unknown>;
    const rows = (f.workers['workers.upgrades']() as { rows: Array<{ bought: boolean; price: number }> }).rows;
    const tx = eventsOf(f, 'wallet.transaction').filter((e) => e.eventId === 'worker.upgrade');
    results.push(
      check('улучшения F15 ×5: покупка поимённо (Домик 300 / Столовая 400 / Баня 500 / Праздник 600 / Шкаф 900 — Σ 2700з [DECISION-сетка]) — транзакции eventId worker.upgrade ×5 БЕЗ энергии (энергия игрока не изменилась); повтор — отказ «уже куплено»; неизвестный id — отказ; витрина 5/5 bought с ценами; кошелёк −2700', () =>
        bought.every((r) => r.ok) &&
        bought.every((r, i) => r.ok && r.value.price === prices[i]) &&
        !repeat.ok && String(repeat.error).includes('уже куплено') &&
        !bogus.ok &&
        rows.length === 5 && rows.every((r) => r.bought) &&
        tx.length === 5 &&
        f.game.wallet.get('gold') === 5000 - 2700 &&
        energyBefore === energyOf(f), {
        expected: '×5 куплено (2700з); повтор-отказ; витрина 5/5; энергия та же',
        actual: `${bought.filter((r) => r.ok).length}/5; повтор ${why(repeat).slice(0, 30)}; витрина ${rows.filter((r) => r.bought).length}/5; tx ${tx.length}; кошелёк ${f.game.wallet.get('gold')}`,
      }),
    );
    f.dispose();
  }

  // ------------------------------------------------ 20. Домик: кап 105 (чистый + живой)
  {
    const withHouse = mkDayDeps({ scenario: scenarioRolls({ 'workers:mood:wk_test_0': 0.9 }) });
    const dayHouse = pureDayPass(
      { v: 1, hired: [mkWorker({ mood: 100 })] },
      WORKERS_T0,
      { ...withHouse.deps, moodCap: 105 },
    );
    const dayBase = pureDayPass(
      { v: 1, hired: [mkWorker({ mood: 100 })] },
      WORKERS_T0,
      withHouse.deps,
    );
    const f = await makeSeededWorkersGame('m112-house');
    f.game.wallet.grant('gold', 1000);
    (f.workers['workers.upgrades']('upg_worker_house') as R<unknown>);
    const houseRow = (f.workers['workers.upgrades']() as { rows: Array<{ id: string; bought: boolean }> }).rows
      .find((r) => r.id === 'upg_worker_house');
    f.dispose();
    results.push(
      check('Домик F15 [DECISION-интерпретация: «кап» = верхняя граница шкалы]: mood 100 + ролл +10 + зарплата +2 → 105 С Домиком (клэмп 105); БЕЗ Домика → 100 (клэмп таблицы); покупка жива (−300з, витрина bought); витрина знаменатель = капу', () =>
        dayHouse.state.hired[0]!.mood === 105 &&
        dayBase.state.hired[0]!.mood === 100 &&
        houseRow?.bought === true, {
        expected: '105 с Домиком; 100 без; куплено живьём',
        actual: `с Домиком ${dayHouse.state.hired[0]!.mood}; без ${dayBase.state.hired[0]!.mood}; куплено ${String(houseRow?.bought)}`,
      }),
    );
  }

  // ------------------------------------------------ 21. Столовая: еда item-costs + нехватка (чистый + живой)
  {
    const withCanteen = mkDayDeps({ scenario: scenarioRolls({ 'workers:mood:wk_test_0': 0.9 }) });
    const dayFed = pureDayPass(
      { v: 1, hired: [mkWorker()] },
      WORKERS_T0,
      { ...withCanteen.deps, extraMood: 3 },
    );
    // живая: нанять работника, дать РОВНО 1 egg → день съедает → второй день без еды
    const f = await makeSeededWorkersGame('m112-canteen');
    f.game.wallet.grant('gold', 5000);
    (f.workers['workers.upgrades']('upg_worker_canteen') as R<unknown>);
    const anyRow = boardView(f).rows[0]!;
    const hired = hireFirstOf(f, anyRow.profession);
    (f.inv['inventory.acquire'] as unknown as (d: string, q: number, s: string) => R<unknown>)('egg', 1, 'selfcheck');
    const eggsBefore = ((f.inv['inventory.list']() as Array<{ defId: string; qty: number }>).find((i) => i.defId === 'egg')?.qty ?? 0);
    dayPass(f, WORKERS_T0 + WORKERS_DAY);
    const canteenTx = eventsOf(f, 'wallet.transaction').filter((e) => e.eventId === 'worker.canteen');
    const eggsAfter = ((f.inv['inventory.list']() as Array<{ defId: string; qty: number }>).find((i) => i.defId === 'egg')?.qty ?? 0);
    const w = workersView(f).list[0]!;
    const roll = lastRollOf(f, `workers:mood:${w.defId}`);
    const expectedMood = 50 + (roll !== null && roll < 0.5 ? -10 : 10) + 2 + 3;
    // день без еды: всё съедено → следующая столовая не кормит (мягко)
    dayPass(f, WORKERS_T0 + 2 * WORKERS_DAY);
    const tx2 = eventsOf(f, 'wallet.transaction').filter((e) => e.eventId === 'worker.canteen').length;
    f.dispose();
    results.push(
      check('Столовая F15: чистый день с extraMood 3 → 50 +10 +2 +3 = 65; ЖИВАЯ: куплена + работник + egg в инвентаре → dayPass → транзакция worker.canteen с item-costs egg ×1 (живой инвентарный канал ядра — прецедент lake.treat → animal_remedy), egg списан (1 → 0), mood = 50 ± 10 + 2 + 3 (маппинг-оракул); еда кончилась → следующий день БЕЗ новой транзакции (нехватка — не кормит, мягкий отказ; бонус не начисляется)', () =>
        dayFed.state.hired[0]!.mood === 65 &&
        hired.ok &&
        canteenTx.length === 1 &&
        JSON.stringify(canteenTx[0]?.costs).includes('"item"') &&
        eggsBefore - eggsAfter === 1 &&
        w.mood === Math.max(0, Math.min(100, expectedMood)) &&
        tx2 === 1, {
        expected: '65; item-egg ×1 (1→0); mood +3 в оракуле; второй день — 0 новых tx',
        actual: `чистый ${dayFed.state.hired[0]!.mood}; tx ${canteenTx.length} ${JSON.stringify(canteenTx[0]?.costs)}; egg ${eggsBefore}→${eggsAfter}; mood ${w.mood} (оракул ${expectedMood}); tx2 ${tx2}`,
      }),
    );
  }

  // ------------------------------------------------ 22. Баня: sickFactor 0.5 (чистый + живой)
  {
    const withBath = mkDayDeps({ scenario: scenarioRolls({ 'workers:sick:wk_test_0': 0.015 }) });
    const dayBath = pureDayPass(
      { v: 1, hired: [mkWorker()] },
      WORKERS_T0,
      { ...withBath.deps, sickFactor: 0.5 },
    );
    const dayNoBath = pureDayPass(
      { v: 1, hired: [mkWorker()] },
      WORKERS_T0,
      withBath.deps,
    );
    const f = await makeSeededWorkersGame('m112-bath');
    f.game.wallet.grant('gold', 1000);
    (f.workers['workers.upgrades']('upg_worker_bath') as R<unknown>);
    const rows = (f.workers['workers.upgrades']() as { rows: Array<{ id: string; bought: boolean }> }).rows;
    const bathBought = rows.find((r) => r.id === 'upg_worker_bath')?.bought === true;
    f.dispose();
    results.push(
      check('Баня F15 (задел F5 M11.1): sickFactor 0.5 — ролл 0.015: БЕЗ Бани 0.015 < 0.02 → БОЛЕН; С Баней 0.015 ≥ 0.01 (0.02 × 0.5) → ЗДОРОВ (болезни реже вдвое, фикс-сид маппинг — χ²-серий не требуется); покупка жива (чек 19)', () =>
        dayNoBath.state.hired[0]!.sickUntil !== undefined &&
        dayBath.state.hired[0]!.sickUntil === undefined &&
        bathBought, {
        expected: 'без Бани болен; с Баней здоров; куплено',
        actual: `без ${String(dayNoBath.state.hired[0]!.sickUntil !== undefined)}; с ${String(dayBath.state.hired[0]!.sickUntil !== undefined)}; куплено ${String(bathBought)}`,
      }),
    );
  }

  // ------------------------------------------------ 23. Праздник: 7-й день +15, тики молчат
  {
    const f = await makeSeededWorkersGame('m112-holiday');
    f.game.wallet.grant('gold', 5000);
    (f.workers['workers.upgrades']('upg_worker_holiday') as R<unknown>);
    const hired = hireFirstOf(f, boardView(f).rows.some((r) => r.profession === 'farmer') ? 'farmer' : 'fishkeeper');
    if (!hired.ok) {
      results.push(check('праздник F15 (фигура фикстуры)', () => false, { expected: 'работник', actual: hired.error }));
      f.dispose();
      return results;
    }
    const defId = hired.value.defId;
    // праздничный день: T0+3д (2024-01-04, calendarDay 19726 % 7 = 0)
    const holidayNow = WORKERS_T0 + 3 * WORKERS_DAY;
    (f.workers['workers.dev']('mood', 0, 50) as R<unknown>);
    dayPass(f, holidayNow); // день: ролл ±10 + 2 + 15 праздник
    const w = workersView(f).list[0]!;
    const roll = lastRollOf(f, `workers:mood:${defId}`);
    const expectedMood = 50 + (roll !== null && roll < 0.5 ? -10 : 10) + 2 + 15;
    // тик в праздничный день молчит: граница тика работника (период из витрины)
    const period = w.checkPeriodHours;
    const h0 = Math.floor(holidayNow / HOUR);
    const before = w.lastAction?.at ?? 0;
    hourPass(f, (h0 + period) * HOUR); // ближайшая граница тика после праздничного дня
    const afterList = workersView(f).list[0]!;
    const actionDoneOnHoliday = eventsOf(f, 'worker.actionDone').length;
    f.dispose();
    results.push(
      check('Праздничный день F15 [DECISION-привязка к календарю, НЕ к hiredAt]: куплено + день T0+3д (2024-01-04, calendarDay 19726 % 7 === 0 — каждый 7-й от абсолютного календаря) → dayPass: mood = 50 ± 10 + 2 + 15 (маппинг-оракул); часовая граница тика в праздничный день → тик МОЛЧИТ (actionDone-тишина, lastAction не обновляется)', () =>
        w.mood === Math.max(0, Math.min(100, expectedMood)) &&
        actionDoneOnHoliday === 0 &&
        (afterList.lastAction?.at ?? 0) === before, {
        expected: `mood оракул ${expectedMood}; actionDone 0; lastAction не тронут`,
        actual: `mood ${w.mood} (оракул ${expectedMood}); actionDone ${actionDoneOnHoliday}; lastAction ${String(before)}→${String(afterList.lastAction?.at ?? 0)}`,
      }),
    );
  }

  // ------------------------------------------------ 24. Шкаф: toolRequirement закрыт (штраф снят)
  {
    const toolChance = successChanceOf(mkWorker(), WORKERS_TABLE, { sick: false, toolMissing: true });
    const noToolChance = successChanceOf(mkWorker(), WORKERS_TABLE, { sick: false, toolMissing: false });
    const f = await makeSeededWorkersGame('m112-toolcase');
    f.game.wallet.grant('gold', 2000);
    (f.workers['workers.upgrades']('upg_worker_tool_case') as R<unknown>);
    const rows = (f.workers['workers.upgrades']() as { rows: Array<{ id: string; bought: boolean }> }).rows;
    const caseBought = rows.find((r) => r.id === 'upg_worker_tool_case')?.bought === true;
    f.dispose();
    results.push(
      check('Инструментальный шкаф F15: [DECISION Task 54] без Шкафа требование инструмента → ШТРАФ к шансу × toolPenaltyFactor 0.6 (0.4375 → 0.2625 — работает, НЕ отказывается); Шкаф закрывает toolRequirement профилей автоматически — штраф НЕ применяется (0.4375); покупка жива (чек 19, −900з)', () =>
        Math.abs(toolChance - 0.2625) < 1e-9 &&
        Math.abs(noToolChance - 0.4375) < 1e-9 &&
        caseBought, {
        expected: '0.2625 со штрафом; 0.4375 без; Шкаф куплен',
        actual: `штраф ${toolChance.toFixed(4)}; без ${noToolChance.toFixed(4)}; куплено ${String(caseBought)}`,
      }),
    );
  }

  // ------------------------------------------------ 25. манифест 1.1.0 = факту (F16)
  {
    const f = await makeSeededWorkersGame('m112-manifest');
    const manifest = f.game.modules.get('workers')?.manifest;
    const api = Object.keys(f.workers).sort();
    const info = f.game.save.info();
    results.push(
      check('манифест M11 = факту (F16 — ОДИН bump 1.0.0 → 1.1.0): publicApi РОВНО ×8 (board/list/hire/fire/bonus + upgrades/last + dev); eventsPublished РОВНО ×5 = [worker.hired, worker.fired, worker.sick, worker.payday, worker.actionDone] (каталог 02 §4 — строка с фазы 0, каталог НЕ редактировался); eventsSubscribed [time.dayTick, time.hourTick]; modifierProviders [worker.traits]; taskExecutors ПУСТЫ (работник ВЫЗЫВАЕТ чужих исполнителей — сам НЕ регистрирует); tasks реестра 15 НЕ меняется; save info: версия 15 (bump M12.1 — срез mine), срезов 20 (+passives [M14 · ленивый срез])', () =>
        manifest !== undefined &&
        manifest.version === '1.1.0' &&
        JSON.stringify([...(manifest.publicApi ?? [])].sort()) === JSON.stringify(['workers.board', 'workers.bonus', 'workers.dev', 'workers.fire', 'workers.hire', 'workers.last', 'workers.list', 'workers.upgrades']) &&
        JSON.stringify([...(manifest.eventsPublished ?? [])].sort()) === JSON.stringify(['worker.actionDone', 'worker.fired', 'worker.hired', 'worker.payday', 'worker.sick']) &&
        JSON.stringify(manifest.eventsSubscribed) === JSON.stringify([
          { event: 'time.dayTick', handler: 'onDayTick' },
          { event: 'time.hourTick', handler: 'onHourTick' },
        ]) &&
        JSON.stringify(manifest.modifierProviders) === JSON.stringify(['worker.traits']) &&
        (manifest.taskExecutors ?? []).length === 0 &&
        api.length === 8 &&
        info.saveVersion === 15 && info.slices.length === 20 && info.slices.includes('passives') &&
        f.game.tasks.list().length === 15, {
        expected: '1.1.0; api ×8; события ×5; подписки ×2; провайдер [worker.traits]; tasks 15; v15/19',
        actual: `v${manifest?.version}; api ${api.length}; события ${(manifest?.eventsPublished ?? []).length}; tasks ${f.game.tasks.list().length}; v${info.saveVersion}/${info.slices.length}`,
      }),
    );
    f.dispose();
  }

  // ------------------------------------------------ 26. сейв: v14 без миграций + upgrades roundtrip
  {
    const f = await makeSeededWorkersGame('m112-save');
    f.game.wallet.grant('gold', 5000);
    (f.workers['workers.upgrades']('upg_worker_house') as R<unknown>);
    (f.workers['workers.upgrades']('upg_worker_bath') as R<unknown>);
    await f.game.save.save();
    const json = f.game.save.exportJson();
    const parsed = JSON.parse(json) as { saveVersion: number; modules: { workers: unknown } };
    const f2 = await makeSeededWorkersGame('m112-save');
    await f2.game.save.importJson(json);
    const rows2 = (f2.workers['workers.upgrades']() as { rows: Array<{ bought: boolean }> }).rows;
    // донор v14 M11.1-формы (БЕЗ upgrades) — байт-в-байт roundtrip
    const f3 = await makeSeededWorkersGame('m112-donor-v14');
    await f3.game.save.importJson(
      JSON.stringify({
        saveVersion: 14,
        savedAt: WORKERS_T0,
        saveId: 'm112-donor-v14',
        contentVersion: '0.1.0-phase0',
        modules: { workers: { v: 1, hired: [] } },
        lastSeen: WORKERS_T0,
      }),
    );
    await f3.game.save.save();
    const raw3 = JSON.parse(f3.game.save.exportJson()) as { modules: { workers: unknown } };
    // [FIX-M11 · FX3] roundtrip капа Домика в load-пути (MISS-1): донор с
    // mood 105 + Домик → import → save → re-export — 105 сохранён
    // байт-в-байт против канонической формы (до правки sanitize срезал
    // легальное живое 101–105 до 100); оракул отрицания: донор БЕЗ Домика
    // (mood 100 и 104, upgrades нет) → клэмп базового капа 100 жив
    const donor105: WorkersState = { v: 1, hired: [mkWorker({ mood: 105 })], upgrades: ['upg_worker_house'] };
    const f4 = await makeSeededWorkersGame('fixm11-donor-105');
    await f4.game.save.importJson(
      JSON.stringify({
        saveVersion: 14,
        savedAt: WORKERS_T0,
        saveId: 'fixm11-donor-105',
        contentVersion: '0.1.0-phase0',
        modules: { workers: donor105 },
        lastSeen: WORKERS_T0,
      }),
    );
    await f4.game.save.save();
    const raw4 = JSON.parse(f4.game.save.exportJson()) as { modules: { workers: unknown } };
    const donorBase: WorkersState = {
      v: 1,
      hired: [mkWorker({ mood: 100 }), mkWorker({ defId: 'wk_fixm11_base', mood: 104 })],
    };
    const f5 = await makeSeededWorkersGame('fixm11-donor-base');
    await f5.game.save.importJson(
      JSON.stringify({
        saveVersion: 14,
        savedAt: WORKERS_T0,
        saveId: 'fixm11-donor-base',
        contentVersion: '0.1.0-phase0',
        modules: { workers: donorBase },
        lastSeen: WORKERS_T0,
      }),
    );
    await f5.game.save.save();
    const raw5 = JSON.parse(f5.game.save.exportJson()) as { modules: { workers: unknown } };
    f.dispose();
    f2.dispose();
    f3.dispose();
    f4.dispose();
    f5.dispose();
    results.push(
      check('сейв F13/F15: v15 (bump M12.1 — срез mine; поле upgrades? АДДИТИВНО-ОПЦИОНАЛЬНО: с покупками — в файле, roundtrip переживает (витрина 2/5 после import); донор v14 M11.1-формы { v: 1, hired: [] } — миграция 14→15 + save/load байт-в-байт workers-срез (ленивый дефолт [] НЕ пишется — каноническая форма сохранена)', () =>
        parsed.saveVersion === 15 &&
        JSON.stringify(parsed.modules.workers).includes('upg_worker_house') &&
        rows2.filter((r) => r.bought).length === 2 &&
        JSON.stringify(raw3.modules.workers) === JSON.stringify({ v: 1, hired: [] }) &&
        JSON.stringify(raw4.modules.workers) === JSON.stringify(canonicalWorkersState(donor105)) &&
        JSON.stringify(raw5.modules.workers) ===
          JSON.stringify(
            canonicalWorkersState({ ...donorBase, hired: donorBase.hired.map((w) => ({ ...w, mood: 100 })) }),
          ), {
        expected: 'v15; upgrades в файле; roundtrip 2/5; донор байт-в-байт; 105 сохранён; клэмп 100 жив',
        actual: `v${parsed.saveVersion}; bought ${rows2.filter((r) => r.bought).length}/5; донор ${JSON.stringify(raw3.modules.workers)}; 105-донор ${JSON.stringify(raw4.modules.workers)}; база ${JSON.stringify(raw5.modules.workers)}`,
      }),
    );
  }

  return results;
}
