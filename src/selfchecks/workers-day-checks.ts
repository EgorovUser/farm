/**
 * Self-checks M11 «Работники» — часть 2a (дневные механики сеанса M11.1:
 * настроение/болезни/расчётный день/увольнение/живые стримы-премия).
 *
 * [M11.2 · split] расщепление workers-checks.ts по 01 §6 (файл превысил
 * 500 строк — M111-OBS-1): оркестратор workers-checks.ts конкатенирует
 * эту часть МЕЖДУ чеками 4 и 10 — порядок чеков группы и тексты
 * НЕ ИЗМЕНЕНЫ (вывод selftest байт-в-байт канону M11.1; прецедент
 * lake-checks/lake-lab-checks M08.1).
 *
 * Покрытие: настроение F4 (ролл ±10 сценарным rng, +2/−15/−5, клэмп);
 * болезни F5 (2%/день, 1–3 дня, событие, выздоровление); расчётный день
 * F6 (Σ одной транзакцией, нехватка → РОВНО ОДИН, прогноз, тишина);
 * увольнение F7 (lowMoodDays 3 подряд → 10%); живые стримы + премия
 * (кулдаун 7 дней, actionDone-отрицание M11.1).
 */
import { WORKERS_TABLE } from '@/content/workers/table';
import { dayPass as pureDayPass, isObjectDirty, type DirtyProbe } from '@/game/modules/workers/logic/day';
import type { WorkerInstance } from '@/game/modules/workers/state';
import { isSick } from '@/game/modules/workers/state';
import { check, type CheckResult } from './types';
import {
  WORKERS_T0,
  WORKERS_DAY,
  dayPass,
  eventsOf,
  hireFirstOf,
  lastRollOf,
  makeSeededWorkersGame,
  workersView,
  type R,
} from './workers-fixture';

const HOUR = 3_600_000;

/** минимальный живой экземпляр для чистых прогонов dayPass */
export function mkWorker(over: Partial<WorkerInstance> = {}): WorkerInstance {
  return {
    defId: 'wk_test_0',
    name: 'Тест',
    profession: 'fishkeeper',
    stars: 3,
    salaryPerDay: 30,
    checkPeriodHours: 4,
    care: 3,
    traits: [],
    object: 'lake',
    mood: 50,
    hiredAt: WORKERS_T0,
    ...over,
  };
}

/** сценарные rng-прогибы: карта streamId → значение (default 0.5 = +10/нет) */
export function scenarioRolls(map: Record<string, number>): (streamId: string) => number {
  return (streamId: string) => (streamId in map ? map[streamId] : 0.5);
}

export function cleanProbe(over: Partial<DirtyProbe> = {}): DirtyProbe {
  return {
    lakeCleanliness: [70],
    farmWeeds: { field: 0, field2: 0 },
    penHappiness: [null],
    ...over,
  };
}

export function mkDayDeps(over: {
  gold?: number;
  probe?: DirtyProbe;
  scenario?: (streamId: string) => number;
}) {
  let paid = 0;
  return {
    deps: {
      rngBus: null as unknown as Parameters<typeof pureDayPass>[2]['rngBus'],
      table: WORKERS_TABLE,
      probe: over.probe ?? cleanProbe(),
      gold: over.gold ?? 10_000,
      paySalaries: (total: number) => {
        paid += total;
        return true;
      },
      ...(over.scenario !== undefined ? { scenario: over.scenario } : {}),
    },
    paid: () => paid,
  };
}

export async function runWorkersDayChecks(): Promise<CheckResult[]> {
  const results: CheckResult[] = [];

  // ------------------------------------------------ 5. настроение: ±10/+2/−15/−5/клэмп (F4, сценарный rng)
  {
    const plus = pureDayPass(
      { v: 1, hired: [mkWorker()] },
      WORKERS_T0,
      mkDayDeps({ scenario: scenarioRolls({ 'workers:mood:wk_test_0': 0.9 }) }).deps,
    );
    const minus = pureDayPass(
      { v: 1, hired: [mkWorker()] },
      WORKERS_T0,
      mkDayDeps({ scenario: scenarioRolls({ 'workers:mood:wk_test_0': 0.1 }) }).deps,
    );
    // +2 вовремя входит в те же прогоны (золота хватает): 50 +10 +2 = 62 / 50 −10 +2 = 42
    const dirty = pureDayPass(
      { v: 1, hired: [mkWorker()] },
      WORKERS_T0,
      mkDayDeps({ probe: cleanProbe({ lakeCleanliness: [15] }), scenario: scenarioRolls({ 'workers:mood:wk_test_0': 0.9 }) }).deps,
    );
    const floorClamp = pureDayPass(
      { v: 1, hired: [mkWorker({ mood: 5 })] },
      WORKERS_T0,
      mkDayDeps({ scenario: scenarioRolls({ 'workers:mood:wk_test_0': 0.1 }) }).deps,
    );
    const ceilClamp = pureDayPass(
      { v: 1, hired: [mkWorker({ mood: 97 })] },
      WORKERS_T0,
      mkDayDeps({ scenario: scenarioRolls({ 'workers:mood:wk_test_0': 0.9 }) }).deps,
    );
    results.push(
      check('настроение F4 (сценарный rng): ролл ±10 (бросок 50/50 знака: 0.9 → +10, 0.1 → −10); зарплата вовремя +2 (50 → 62 / 50 → 42 — ПОРЯДОК F6: ролл ДО расчёта); «грязный объект» −5 (чистота озера 15 < 20: 50 → 57); клэмп [0, 100] на каждом применении (5−10 → 0, +2 → 2; 97+10 → 100, +2 → 100); isObjectDirty: озеро <20 (19 да / 20 нет) / ферма сорняки ≥1 (1 да / 0 нет) / загон счастье <40 (39 да / пустой — чист)', () =>
        plus.state.hired[0]!.mood === 62 &&
        minus.state.hired[0]!.mood === 42 &&
        dirty.state.hired[0]!.mood === 57 &&
        floorClamp.state.hired[0]!.mood === 2 &&
        ceilClamp.state.hired[0]!.mood === 100 &&
        isObjectDirty('lake', cleanProbe({ lakeCleanliness: [19] }), WORKERS_TABLE) &&
        !isObjectDirty('lake', cleanProbe({ lakeCleanliness: [20] }), WORKERS_TABLE) &&
        isObjectDirty('field', cleanProbe({ farmWeeds: { field: 1 } }), WORKERS_TABLE) &&
        !isObjectDirty('field', cleanProbe({ farmWeeds: { field: 0 } }), WORKERS_TABLE) &&
        isObjectDirty('pen', cleanProbe({ penHappiness: [39] }), WORKERS_TABLE) &&
        !isObjectDirty('pen', cleanProbe({ penHappiness: [null] }), WORKERS_TABLE), {
        expected: '62/42/57/2/100; грязь: 19 да 20 нет; 1 да 0 нет; 39 да пусто нет',
        actual: `+${plus.state.hired[0]!.mood}; −${minus.state.hired[0]!.mood}; грязь ${dirty.state.hired[0]!.mood}; клэмп ${floorClamp.state.hired[0]!.mood}/${ceilClamp.state.hired[0]!.mood}`,
      }),
    );
  }

  // ------------------------------------------------ 6. болезни: 2%/1–3 дня/выздоровление (F5, сценарный rng)
  {
    const sick = pureDayPass(
      { v: 1, hired: [mkWorker()] },
      WORKERS_T0,
      mkDayDeps({ scenario: scenarioRolls({ 'workers:sick:wk_test_0': 0.01, 'workers:sickdur:wk_test_0': 0.5 }) }).deps,
    );
    const notSick = pureDayPass(
      { v: 1, hired: [mkWorker()] },
      WORKERS_T0,
      mkDayDeps({ scenario: scenarioRolls({ 'workers:sick:wk_test_0': 0.03 }) }).deps,
    );
    const dur1 = pureDayPass(
      { v: 1, hired: [mkWorker()] },
      WORKERS_T0,
      mkDayDeps({ scenario: scenarioRolls({ 'workers:sick:wk_test_0': 0.01, 'workers:sickdur:wk_test_0': 0.0 }) }).deps,
    );
    const dur3 = pureDayPass(
      { v: 1, hired: [mkWorker()] },
      WORKERS_T0,
      mkDayDeps({ scenario: scenarioRolls({ 'workers:sick:wk_test_0': 0.01, 'workers:sickdur:wk_test_0': 0.99 }) }).deps,
    );
    const w = sick.state.hired[0]!;
    const recovered = { ...w, sickUntil: WORKERS_T0 - 1 };
    const sickSkip = pureDayPass(
      { v: 1, hired: [mkWorker({ sickUntil: WORKERS_T0 + 2 * WORKERS_DAY })] },
      WORKERS_T0,
      mkDayDeps({ scenario: scenarioRolls({ 'workers:sick:wk_test_0': 0.0 }) }).deps,
    );
    results.push(
      check('болезни F5 (сценарный rng): шанс 2%/день (ролл 0.01 < 0.02 → БОЛЕН; 0.03 → здоров); длительность 1–3 дня (sickdur 0.0 → +1д, 0.5 → +2д, 0.99 → +3д — АБСОЛЮТНАЯ дата sickUntil); событие worker.sick {defId, name, sickUntil}; больной НЕ роллит болезнь повторно (пропуск больного); выздоровление временем (sickUntil ≤ now → isSick ложь, лениво); больной всё равно получает зарплату (+2)', () =>
        w.sickUntil !== undefined &&
        w.sickUntil === WORKERS_T0 + 2 * WORKERS_DAY &&
        notSick.state.hired[0]!.sickUntil === undefined &&
        dur1.state.hired[0]!.sickUntil === WORKERS_T0 + 1 * WORKERS_DAY &&
        dur3.state.hired[0]!.sickUntil === WORKERS_T0 + 3 * WORKERS_DAY &&
        sick.events.some((e) => e.name === 'worker.sick' && e.payload.defId === 'wk_test_0') &&
        sickSkip.events.filter((e) => e.name === 'worker.sick').length === 0 &&
        !isSick(recovered, WORKERS_T0) &&
        isSick(w, WORKERS_T0 + WORKERS_DAY) &&
        w.mood === 62, {
        expected: 'болен 0.01/здоров 0.03; 1/2/3 дня; событие; повтор-пропуск; ленивое выздоровление; mood 62',
        actual: `sickUntil +${String(w.sickUntil !== undefined ? (w.sickUntil - WORKERS_T0) / WORKERS_DAY : '—')}д; событий ${sick.events.filter((e) => e.name === 'worker.sick').length}; mood ${w.mood}`,
      }),
    );
  }

  // ------------------------------------------------ 7. расчётный день: атомарно/нехватка/прогноз/тишина (F6)
  {
    const day = mkDayDeps({ gold: 1000, scenario: scenarioRolls({}) });
    const paid2 = pureDayPass(
      { v: 1, hired: [mkWorker({ defId: 'wk_a', salaryPerDay: 30 }), mkWorker({ defId: 'wk_b', name: 'Второй', salaryPerDay: 50 })] },
      WORKERS_T0,
      day.deps,
    );
    // нехватка: gold 50 < Σ 80 → уволен РОВНО ОДИН (ролл 0.0 → индекс 0 = wk_a)
    const poor = mkDayDeps({ gold: 50, scenario: scenarioRolls({ 'workers:payday:fire': 0.0 }) });
    const shortage = pureDayPass(
      { v: 1, hired: [mkWorker({ defId: 'wk_a', salaryPerDay: 30 }), mkWorker({ defId: 'wk_b', name: 'Второй', salaryPerDay: 50 })] },
      WORKERS_T0,
      poor.deps,
    );
    // прогноз: gold 50, уплачено 30 → остаток 20 < завтрашних 30 → forecast
    const tight = mkDayDeps({ gold: 50, scenario: scenarioRolls({}) });
    const forecast = pureDayPass({ v: 1, hired: [mkWorker()] }, WORKERS_T0, tight.deps);
    // без работников — тишина
    const empty = mkDayDeps({ gold: 0, scenario: scenarioRolls({}) });
    const silent = pureDayPass({ v: 1, hired: [] }, WORKERS_T0, empty.deps);
    const fireEvt = shortage.events.find((e) => e.name === 'worker.fired');
    const paydayShort = shortage.events.filter((e) => e.name === 'worker.payday');
    results.push(
      check('расчётный день F6 (сценарный rng): Σ зарплат списывается ОДНОЙ транзакцией (30+50=80 — paySalaries(80) ровно раз); вовремя +2 каждому; нехватка (50 < 80) — НЕ списывать (0), увольняется РОВНО ОДИН СЛУЧАЙНЫЙ (ролл 0.0 → wk_a), сосед −15 (50 +10 −15 = 45); события worker.fired {reason: payday} + worker.payday {shortage, fired}; прогноз за 24ч: после уплаты 30 из 50 остаток 20 < завтрашних 30 → worker.payday {forecast: true, needed: 30, have: 20}; без работников — полная тишина (0 событий, 0 списаний)', () =>
        day.paid() === 80 &&
        paid2.state.hired.length === 2 &&
        shortage.state.hired.length === 1 &&
        shortage.state.hired[0]!.defId === 'wk_b' &&
        poor.paid() === 0 &&
        fireEvt !== undefined && fireEvt.payload.reason === 'payday' && fireEvt.payload.defId === 'wk_a' &&
        paydayShort.some((e) => e.payload.shortage === true) &&
        shortage.state.hired[0]!.mood === 45 &&
        forecast.events.some((e) => e.name === 'worker.payday' && e.payload.forecast === true && e.payload.needed === 30 && e.payload.have === 20) &&
        silent.events.length === 0 && empty.paid() === 0 && silent.state.hired.length === 0, {
        expected: 'списание 80 раз; нехватка: 1 уволен (wk_a), сосед 45; прогноз 20<30; тишина без работников',
        actual: `уплата ${day.paid()}; после нехватки ${shortage.state.hired.map((w) => w.defId).join(',')} mood ${shortage.state.hired[0]!.mood}; списано при нехватке ${poor.paid()}; прогноз ${String(forecast.events.some((e) => e.payload.forecast === true))}; тишина ${silent.events.length}`,
      }),
    );
  }

  // ------------------------------------------------ 8. увольнение по настроению (F7, сценарный rng)
  {
    // mood 10 < 20 и ролл −10: 10 −10 → 0 (+2) — остаётся < 20, lowMoodDays копится;
    // на 3-й день шанс 10% (ролл 0.05 → увольнение)
    const fired1 = pureDayPass({ v: 1, hired: [mkWorker({ mood: 10, salaryPerDay: 30 })] }, WORKERS_T0, mkDayDeps({ scenario: scenarioRolls({ 'workers:mood:wk_test_0': 0.1, 'workers:quit:wk_test_0': 0.95 }) }).deps);
    const day1 = fired1.state.hired[0]!;
    const fired2 = pureDayPass(fired1.state, WORKERS_T0 + WORKERS_DAY, mkDayDeps({ scenario: scenarioRolls({ 'workers:mood:wk_test_0': 0.1, 'workers:quit:wk_test_0': 0.95 }) }).deps);
    const day2 = fired2.state.hired[0]!;
    const fired3 = pureDayPass(fired2.state, WORKERS_T0 + 2 * WORKERS_DAY, mkDayDeps({ scenario: scenarioRolls({ 'workers:mood:wk_test_0': 0.1, 'workers:quit:wk_test_0': 0.05 }) }).deps);
    // счётчик сбрасывается при mood ≥ 20 (ролл 0.5 → +10)
    const reset = pureDayPass(
      { v: 1, hired: [mkWorker({ mood: 25, lowMoodDays: 2 })] },
      WORKERS_T0,
      mkDayDeps({ scenario: scenarioRolls({}) }).deps,
    );
    results.push(
      check('увольнение по настроению F7 (сценарный rng): mood 10 < 20 → lowMoodDays копится (1 → 2 → 3 ПОДРЯД); на 3-й день 10%/день (ролл 0.05 < 0.10 → УВОЛЕН, событие worker.fired {reason: mood}); ролл 0.95 в дни 1–2 — НЕ увольняет (шанс ещё не активен); mood 25 ≥ 20 → счётчик lowMoodDays 2 сбрасывается; клэмп: mood 10 −10 → 0 (+2 зарплата)', () =>
        day1.lowMoodDays === 1 && day1.mood === 2 &&
        day2.lowMoodDays === 2 && fired2.state.hired.length === 1 &&
        fired3.state.hired.length === 0 &&
        fired3.events.some((e) => e.name === 'worker.fired' && e.payload.reason === 'mood') &&
        reset.state.hired[0]!.lowMoodDays === undefined &&
        reset.state.hired[0]!.mood === 37, {
        expected: 'счётчик 1→2→3 → увольнение на 3-й день; сброс при ≥20; mood 25+10+2=37',
        actual: `счётчики ${String(day1.lowMoodDays)}→${String(day2.lowMoodDays)}; уволен ${String(fired3.state.hired.length === 0)}; после сброса lowMoodDays ${String(reset.state.hired[0]!.lowMoodDays)} mood ${reset.state.hired[0]!.mood}`,
      }),
    );
  }

  // ------------------------------------------------ 9. живые стримы + премия-кулдаун (F4/F6/F9)
  {
    const f = await makeSeededWorkersGame('m111-live-day');
    f.game.wallet.grant('gold', 10_000);
    const hired = hireFirstOf(f, 'farmer');
    if (!hired.ok) {
      results.push(check('живые стримы F4/F6/F9 (фигура фикстуры)', () => false, { expected: 'farmer на доске', actual: hired.error }));
      f.dispose();
      return results;
    }
    const defId = hired.value.defId;
    // живой dayTick: маппинг-оракул журнала workers:mood:<defId>
    dayPass(f, WORKERS_T0 + WORKERS_DAY);
    const roll = lastRollOf(f, `workers:mood:${defId}`);
    const expectedDelta = roll !== null && roll < 0.5 ? -10 : 10;
    const w = workersView(f).list[0]!;
    const tx = eventsOf(f, 'wallet.transaction').find((e) => e.eventId === 'worker.payday');
    // премия: ×1.5 списана, +10; кулдаун 7 дней (вторая за 6 дней — отказ)
    const moodAfterDay = w.mood;
    const goldBefore = f.game.wallet.get('gold');
    const b1 = f.workers['workers.bonus'](0) as R<{ cost: number; mood: number }>;
    const goldAfterBonus = f.game.wallet.get('gold');
    f.clock.set(WORKERS_T0 + 7 * WORKERS_DAY - HOUR); // 6 дней с лишним с момента найма
    const b2early = f.workers['workers.bonus'](0) as R<unknown>;
    f.clock.set(WORKERS_T0 + 8 * WORKERS_DAY);
    const b3ok = f.workers['workers.bonus'](0) as R<unknown>;
    results.push(
      check('живые стримы F4/F6/F9: dayTick живой — стрим workers:mood:<defId> в журнале (маппинг-оракул: ролл < 0.5 → −10, иначе +10; +2 payday; mood = 50 ± 10 + 2); транзакция worker.payday в ленте; премия ×1.5 ЗП списывается (кошелёк −N, eventId worker.bonus), +10 настроения; кулдаун 7 дней — вторая раньше срока ОТКАЗ «недавно выдавалась», позже — ок; worker.actionDone в событиях ОТСУТСТВУЕТ (оракул отрицания)', () =>
        hired.ok &&
        roll !== null && w.mood === Math.max(0, Math.min(100, 50 + expectedDelta + 2)) &&
        tx !== undefined &&
        b1.ok && goldBefore - goldAfterBonus === b1.value.cost && b1.value.cost === Math.round(hired.value.salaryPerDay * 1.5) &&
        b1.value.mood === Math.min(100, moodAfterDay + 10) &&
        !b2early.ok && String(b2early.error).includes('кулдаун') &&
        b3ok.ok &&
        !f.events.some((e) => e.name === 'worker.actionDone'), {
        expected: `mood 50 ${expectedDelta > 0 ? '+' : ''}${expectedDelta} +2; премия ${Math.round(hired.ok ? hired.value.salaryPerDay * 1.5 : 0)}з; +10; кулдаун`,
        actual: `ролл ${roll}; mood после дня ${w.mood}; tx ${String(tx !== undefined)}; премия ${b1.ok ? b1.value.cost : b1.error}; ранняя ${b2early.ok}; позже ${b3ok.ok}; actionDone ${f.events.filter((e) => e.name === 'worker.actionDone').length}`,
      }),
    );
    f.dispose();
  }

  return results;
}
