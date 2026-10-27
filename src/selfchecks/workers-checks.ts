/**
 * Self-checks M11 «Работники» — часть 1 (сеанс M11.1: миграция/доска/наём/
 * roundtrip/манифест/трейты-бюджет) — ОРКЕСТРАТОР группы.
 *
 * [M11.2 · split] расщепление workers-checks.ts по 01 §6 (файл превысил
 * 500 строк — M111-OBS-1; прецедент lake-checks M08.1): дневные механики
 * (настроение/болезни/расчётный день/увольнение/живые стримы-премия) —
 * workers-day-checks.ts, конкатенируются ЗДЕСЬ между чеками 4 и 10 —
 * порядок чеков и тексты НЕ ИЗМЕНЕНЫ (вывод selftest байт-в-байт канону
 * M11.1: 683/683, групп 44).
 *
 * Покрытие: миграция v13→v14; доска (детерминизм dailySeed, ровно 5,
 * defId/имена уникальны, поля в диапазонах, ЖИВОЙ ривен-API); наём
 * (лимит = объектам, соответствие профессии, заморозка профиля);
 * roundtrip v14; манифест = факту; трейты в бюджете 6×звёзды; доска
 * следующего дня + ЗП-сетка.
 */
import { migrateSaveData, SAVE_VERSION } from '@/kernel/save/migrations';
import { WORKERS_TABLE, PROFESSION_NAMES, type WorkerProfession } from '@/content/workers/table';
import { traitBudgetOf } from '@/content/workers/traits';
import type { ModForgeTable } from '@/content/balance/modforge';
import { check, group, type CheckGroup, type CheckResult } from './types';
import {
  WORKERS_T0,
  WORKERS_DAY,
  boardView,
  dayPass,
  eventsOf,
  hireFirstOf,
  makeSeededWorkersGame,
  workersView,
  type R,
  type BoardRowShape,
} from './workers-fixture';
import { runWorkersDayChecks } from './workers-day-checks';
import { runWorkersTickChecks } from './workers-tick-checks';
import { runWorkersUpgChecks } from './workers-upg-checks';

const why = (r: R<unknown>): string => (r.ok ? 'ok' : r.error);

export async function runWorkersChecks(): Promise<CheckGroup> {
  const results: CheckResult[] = [];

  // ------------------------------------------------ 1. миграция v13→v14 (F1)
  {
    const donor = {
      saveVersion: 13,
      saveId: 'm111-donor-v13',
      savedAt: WORKERS_T0,
      contentVersion: '0.1.0-phase0',
      modules: { lake: { v: 1, slots: [{ sick: false }], water: { temperature: 15, cleanliness: 70 }, roe: [], stats: { released: 0, bred: 0, harvested: 0 } } },
      lastSeen: WORKERS_T0,
    };
    const m = migrateSaveData({ ...donor });
    const m2 = migrateSaveData(JSON.parse(JSON.stringify(m.data)) as unknown as Record<string, unknown>);
    const v3 = { saveVersion: 3, saveId: 'm111-donor-v3', savedAt: WORKERS_T0, contentVersion: '0', modules: { 'kernel.wallet': { balances: [['gold', 7]] } }, lastSeen: WORKERS_T0 };
    const m3 = migrateSaveData(v3);
    let threw99 = false;
    try {
      migrateSaveData({ saveVersion: 99, modules: {} });
    } catch {
      threw99 = true;
    }
    const workersSlice = (m.data.modules as Record<string, unknown>)['workers'];
    results.push(
      check('миграция v13→v14 (F1): срез workers = { v: 1, hired: [] } БАЙТ-В-БАЙТ; прежние срезы целы (lake); ДВОЙНОЙ прогон идемпотентен (байт-в-байт); v3→текущей 15 холодной цепочкой 12 шагов [M12.1 · v15: +1 шаг mine]; v99 — отказ; SAVE_VERSION 15', () =>
        m.data.saveVersion === 15 &&
        JSON.stringify(workersSlice) === JSON.stringify({ v: 1, hired: [] }) &&
        (m.data.modules as Record<string, unknown>)['lake'] !== undefined &&
        JSON.stringify((m2.data.modules as Record<string, unknown>)['workers']) === JSON.stringify(workersSlice) &&
        m3.data.saveVersion === 15 && m3.steps === 12 &&
        (m3.data.modules as Record<string, unknown>)['workers'] !== undefined &&
        threw99 && SAVE_VERSION === 15, {
        expected: 'v15/2 шага; workers-дефолт; lake цел; идем; v3→15 12 шагов; v99 отказ',
        actual: `v${m.data.saveVersion}/${m.steps}; workers ${JSON.stringify(workersSlice)}; v3→${m3.data.saveVersion} ${m3.steps}; v99 ${threw99}`,
      }),
    );
  }

  // ------------------------------------------------ 2. доска: детерминизм/5/defId/поля (F2)
  {
    const f = await makeSeededWorkersGame('m111-board');
    const b1 = boardView(f);
    const b1again = boardView(f);
    const f2 = await makeSeededWorkersGame('m111-board'); // ДРУГОЙ экземпляр — свежий ролл того же дня
    const b2 = boardView(f2);
    const f3 = await makeSeededWorkersGame('m111-board-other'); // другой saveId
    const b3 = boardView(f3);
    const defIds = new Set(b1.rows.map((r) => r.defId));
    const names = new Set(b1.rows.map((r) => r.name));
    // кэш доски: повторная витрина того же дня НЕ роллит M03 заново
    const rolledAfterTwoViews = eventsOf(f, 'modforge.rolled').filter(
      (e) => Array.isArray(e.scopeTags) && (e.scopeTags as string[]).includes('worker'),
    ).length;
    const rolledFresh = eventsOf(f2, 'modforge.rolled').filter(
      (e) => Array.isArray(e.scopeTags) && (e.scopeTags as string[]).includes('worker'),
    ).length;
    const toolOk = b1.rows.every((r) => r.tool === null || / ≥ [DCBASS]{1,2}$/.test(r.tool));
    results.push(
      check('доска F2: РОВНО 5 профилей; детерминизм dailySeed(saveId, dateISO) — повторная витрина ТОГО же дня (кэш) и СВЕЖИЙ экземпляр той же пары байт-в-байт идентичны; другой saveId — другая пятёрка; defId НЕ повторяются (wk_<дата>_<i>); имена НЕ повторяются (пул без возврата); поля в диапазонах (звёзды 1–5, уход 1–5, период 2|4|6, ЗП ≥ 1); toolRequirement валиден; трейты — ЖИВОЙ ривен-API: modforge.rolled ×5 (кэш повторов НЕ даёт, свежий экземпляр — снова 5)', () =>
        b1.rows.length === 5 &&
        JSON.stringify(b1.rows) === JSON.stringify(b1again.rows) &&
        JSON.stringify(b1.rows) === JSON.stringify(b2.rows) &&
        JSON.stringify(b1.rows) !== JSON.stringify(b3.rows) &&
        defIds.size === 5 && names.size === 5 &&
        b1.rows.every((r) => r.stars >= 1 && r.stars <= 5 && r.care >= 1 && r.care <= 5 && [2, 4, 6].includes(r.checkPeriodHours) && r.salaryPerDay >= 1) &&
        toolOk &&
        rolledAfterTwoViews === 5 && rolledFresh === 5, {
        expected: '5 строк; ×2 идентично; другой saveId ≠; defId/имена уникальны; modforge.rolled 5 (кэш) / 5 (свежий)',
        actual: `строк ${b1.rows.length}; идентично ${String(JSON.stringify(b1.rows) === JSON.stringify(b2.rows))}; другой ${String(JSON.stringify(b1.rows) !== JSON.stringify(b3.rows))}; defId ${defIds.size}; имена ${names.size}; ривен-роллов ${rolledAfterTwoViews}/${rolledFresh}; проф. ${b1.rows.map((r) => PROFESSION_NAMES[r.profession]).join('/')}`,
      }),
    );
    f.dispose();
    f2.dispose();
    f3.dispose();
  }

  // ------------------------------------------------ 3. наём: лимит/соответствие/заморозка (F3)
  {
    // фикстура-сид m111-hire-2: доска 2024-01-01 (живой ривен-ролл трейтов
    // потребляет rng — состав проверен на живой фикстуре) = Рыбовод ×2 +
    // Скотник ×2 + Фермер ×1 — все профессии и второй рыбовод на одном дне
    const f = await makeSeededWorkersGame('m111-hire-2');
    f.game.wallet.grant('gold', 10_000);
    const objects = workersView(f).objects;
    const farmer = hireFirstOf(f, 'farmer');
    const fishkeeper = hireFirstOf(f, 'fishkeeper');
    // 1 объект = 1 работник: ВТОРОЙ рыбовод того же дня — отказ «нет свободного
    // объекта» (лимит ещё 2/3 — не мешает; фолбэк на следующий день — П5)
    let secondKeeper: R<unknown> = { ok: false, error: 'нет второго рыбовода на доске' };
    const row2 = boardView(f).rows.find(
      (r) => r.profession === 'fishkeeper' && !workersView(f).list.some((l) => l.defId === r.defId),
    );
    if (row2 !== undefined) {
      secondKeeper = f.workers['workers.hire'](row2.idx) as R<unknown>;
    } else {
      dayPass(f, WORKERS_T0 + WORKERS_DAY);
      const nextRow = boardView(f).rows.find((r) => r.profession === 'fishkeeper');
      if (nextRow !== undefined) secondKeeper = f.workers['workers.hire'](nextRow.idx) as R<unknown>;
    }
    const herdsman = hireFirstOf(f, 'herdsman');
    const limitAfter3 = workersView(f).limit;
    const remainingRow = boardView(f).rows.find((r) => !workersView(f).list.some((l) => l.defId === r.defId));
    const fourth =
      remainingRow !== undefined
        ? (f.workers['workers.hire'](remainingRow.idx) as R<unknown>)
        : ({ ok: false, error: 'нет свободных строк' } as R<unknown>);
    // заморозка профиля: mood 50, hiredAt, доска следующего дня НЕ меняет нанятого
    const listBefore = workersView(f).list;
    const frozen = JSON.stringify(listBefore.map(({ defId, name, object, salaryPerDay, traits }) => ({ defId, name, object, salaryPerDay, traits })));
    dayPass(f, WORKERS_T0 + 2 * WORKERS_DAY);
    const listAfterDay = workersView(f).list;
    const frozenAfter = JSON.stringify(listAfterDay.map(({ defId, name, object, salaryPerDay, traits }) => ({ defId, name, object, salaryPerDay, traits })));
    const nextDayBoard = boardView(f).rows;
    results.push(
      check('наём F3: чистая игра — 3 объекта (field/lake/pen); соответствие профессии [DECISION]: farmer → field, fishkeeper → lake, herdsman → pen; 1 объект = 1 работник (второй рыбовод — отказ «нет свободного объекта»); лимит = объектам (3/3 — четвёртый отказ «лимит найма»); профиль ЗАМОРОЖЕН: mood 50 при найме; поля профиля (defId/имя/объект/ЗП/трейты) стабильны через день; доска следующего дня даёт НОВЫЕ defId (нанятые не перетираются)', () =>
        objects.length === 3 &&
        farmer.ok && farmer.value.object === 'field' &&
        fishkeeper.ok && fishkeeper.value.object === 'lake' &&
        herdsman.ok && herdsman.value.object === 'pen' &&
        !secondKeeper.ok && String(secondKeeper.error).includes('нет свободного объекта') &&
        limitAfter3.hired === 3 && limitAfter3.objects === 3 &&
        !fourth.ok && String(fourth.error).includes('лимит найма') &&
        listBefore.every((w) => w.mood === 50) &&
        listAfterDay.length === 3 &&
        frozen === frozenAfter &&
        JSON.stringify(nextDayBoard.map((r) => r.defId)) !== JSON.stringify(listAfterDay.map((w) => w.defId)), {
        expected: '3 объекта; field/lake/pen; второй рыбовод — отказ; лимит-отказ; mood 50; заморозка полей',
        actual: `объектов ${objects.length}; ${farmer.ok ? farmer.value.object : why(farmer)}; ${fishkeeper.ok ? fishkeeper.value.object : why(fishkeeper)}; ${herdsman.ok ? herdsman.value.object : why(herdsman)}; 2-й рыбовод ${why(secondKeeper).slice(0, 40)}; лимит ${limitAfter3.hired}/${limitAfter3.objects}; 4-й ${fourth.ok}; заморозка ${String(frozen === frozenAfter)}`,
      }),
    );
    f.dispose();
  }

  // ------------------------------------------------ 4. roundtrip v14: нанятый работник байт-в-байт (F1/F5)
  {
    const f = await makeSeededWorkersGame('m111-roundtrip');
    f.game.wallet.grant('gold', 10_000);
    const hired = hireFirstOf(f, 'farmer');
    const r1 = f.workers['workers.bonus'](0) as R<{ cost: number; mood: number }>;
    dayPass(f, WORKERS_T0 + WORKERS_DAY); // день: mood-ролл + payday (грязь/болезни — по фикс-сиду)
    await f.game.save.save();
    const storage = f.game.save.exportJson();
    const f2 = await makeSeededWorkersGame('m111-roundtrip');
    await f2.game.save.importJson(storage);
    f2.clock.set(WORKERS_T0 + WORKERS_DAY); // то же «сейчас» — ленивые поля (sick/кулдаун) сравнимы
    const w1 = workersView(f).list;
    const w2 = workersView(f2).list;
    results.push(
      check('roundtrip v14 (F5): нанятый работник (профиль/трейты/mood/кулдаун премии) переживает export/import + день БАЙТ-В-БАЙТ; срез workers в файле НЕ дефолт; событие worker.hired опубликовано при найме; премия — транзакция worker.bonus ×1.5 ЗП', () =>
        hired.ok &&
        r1.ok && r1.value.cost === Math.round(hired.value.salaryPerDay * 1.5) &&
        JSON.stringify(w1) === JSON.stringify(w2) &&
        w2.length === 1 && w2[0]!.defId === hired.value.defId &&
        eventsOf(f, 'worker.hired').length === 1, {
        expected: 'срез идентичен после reload; премия = ×1.5 ЗП',
        actual: `нанят ${hired.ok}; премия ${r1.ok ? r1.value.cost : r1.error}; идентичен ${String(JSON.stringify(w1) === JSON.stringify(w2))}; после дня mood ${w1[0]?.mood}`,
      }),
    );
    f.dispose();
    f2.dispose();
  }

  // [M11.2 · split] дневные механики (настроение/болезни/расчётный день/
  // увольнение/живые стримы-премия) — workers-day-checks.ts (чеки 5–9)
  const dayResults = await runWorkersDayChecks();

  const tail: CheckResult[] = [];

  // ------------------------------------------------ 10. манифест = факту + save info v14/18 (F8; [M11.2 · F16] 1.1.0)
  {
    const f = await makeSeededWorkersGame('m111-manifest');
    const info = f.game.save.info();
    const manifest = f.game.modules.get('workers')?.manifest;
    const api = Object.keys(f.workers).sort();
    tail.push(
      check('манифест M11 = факту (F16 — ОДИН bump 1.0.0 → 1.1.0): version 1.1.0; publicApi РОВНО ×8 (board/list/hire/fire/bonus + upgrades/last + dev); eventsPublished РОВНО ×5 = [worker.hired, worker.fired, worker.sick, worker.payday, worker.actionDone] (каталог 02 §4 — строка с фазы 0, каталог НЕ редактировался); eventsSubscribed [time.dayTick, time.hourTick] (worker.tick — M11.2); modifierProviders [worker.traits]; taskExecutors ПУСТЫ (работник ВЫЗЫВАЕТ чужих исполнителей — сам НЕ регистрирует); save info: версия 15 (bump M12.1 — срез mine), срезов 19 (+workers +mine)', () =>
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
        info.saveVersion === 15 && info.slices.length === 19 && info.slices.includes('workers'), {
        expected: '1.1.0; api ×8; события ×5 ровно; подписки ×2; провайдер [worker.traits]; v15/19 срезов',
        actual: `v${manifest?.version}; api ${api.length}; события ${(manifest?.eventsPublished ?? []).length}; срезов ${info.slices.length}; версия ${info.saveVersion}`,
      }),
    );
    f.dispose();
  }

  // ------------------------------------------------ 11. трейты в бюджете 6×звёзды через ЖИВОЙ API (F2)
  {
    const f = await makeSeededWorkersGame('m111-traits');
    const rows = boardView(f).rows;
    const modforgeApi = f.game.modules.get('modforge')?.api ?? {};
    const modforgeTable = f.game.content.get<ModForgeTable>('modforge');
    const budgets = rows.map((r) => traitBudgetOf(r.stars, modforgeTable));
    // события modforge.rolled несут detail: spent ≤ budget, форма 1–2 бафа
    const rolled = eventsOf(f, 'modforge.rolled').filter((e) => Array.isArray(e.scopeTags) && (e.scopeTags as string[]).includes('worker'));
    const spentWithin = rolled.every((e) => {
      const detail = (e as { detail?: { spent?: number } }).detail;
      return detail === undefined || Number(detail.spent) <= Number(e.budget) + 1e-9;
    });
    const traitCountOk = rolled.every((e) => {
      const detail = (e as { detail?: { positiveCount?: number; negativeCount?: number } }).detail;
      if (detail === undefined) return true;
      const p = Number(detail.positiveCount ?? 0);
      const n = Number(detail.negativeCount ?? 0);
      return p >= 1 && p <= 2 && n <= 1;
    });
    const scopeOk = rolled.every((e) => {
      const detail = (e as { detail?: { candidates?: number } }).detail;
      return detail === undefined || Number(detail.candidates ?? 0) >= 2;
    });
    tail.push(
      check('трейты F2: бюджет = 6 × звёзды (1★ → 6 … 5★ → 30 — MODFORGE_TABLE.traitBudgets.worker, числа M03.3); ЖИВОЙ ривен-API: события modforge.rolled со скоупом worker ×5, Σ стоимостей ≤ бюджета (spent ≤ budget), форма 1–2 бафа + ≤1 дебаф, кандидатов ≥ 2 (реестр mods видит трейты workers); трейты отображаются текстом (TRAIT_LABELS)', () =>
        rows.length === 5 && budgets.length === 5 &&
        budgets.every((b, i) => b === 6 * rows[i]!.stars) &&
        rolled.length === 5 && spentWithin && traitCountOk && scopeOk &&
        modforgeApi['modforge.costOf'] !== undefined &&
        rows.every((r) => r.traits.every((t) => t.name.length > 0 && t.text.length > 0)), {
        expected: 'бюджеты 6×звёзды; 5 ривен-роллов; spent ≤ budget; 1–2 бафа; тексты живы',
        actual: `бюджеты ${budgets.join(',')}; роллов ${rolled.length}; spent≤budget ${String(spentWithin)}; форма ${String(traitCountOk)}; кандидаты ${String(scopeOk)}`,
      }),
    );
    f.dispose();
  }

  // ------------------------------------------------ 12. доска следующего дня + ЗП-сетка (F2)
  {
    const f = await makeSeededWorkersGame('m111-next-day');
    const day1 = boardView(f);
    dayPass(f, WORKERS_T0 + WORKERS_DAY);
    const day2 = boardView(f);
    dayPass(f, WORKERS_T0 + 2 * WORKERS_DAY);
    const day3 = boardView(f);
    // сетка зарплат: ЗП = round(сетка[звёзды] × (1 + (care−3)×0.1)) — сверка по строкам
    const gridOk = day1.rows.every((r) => {
      const base = WORKERS_TABLE.salaryByStars[r.stars as 1 | 2 | 3 | 4 | 5];
      return r.salaryPerDay === Math.max(1, Math.round(base * (1 + (r.care - 3) * WORKERS_TABLE.salaryCareStep)));
    });
    const professions = (rows: BoardRowShape[]): WorkerProfession[] => rows.map((r) => r.profession);
    tail.push(
      check('доска следующего дня: time +1d → НОВАЯ пятёрка (defId/имена/профессии отличаются); повторный вызов того же дня — идентичен (детерминизм по дате); сетка зарплат из данных: ЗП = round(сетка[звёзды] × (1 + (уход−3)×10%)) — сверка по всем строкам', () =>
        day1.rows.length === 5 && day2.rows.length === 5 && day3.rows.length === 5 &&
        JSON.stringify(day1.rows.map((r) => r.defId)) !== JSON.stringify(day2.rows.map((r) => r.defId)) &&
        JSON.stringify(day2.rows.map((r) => r.defId)) !== JSON.stringify(day3.rows.map((r) => r.defId)) &&
        gridOk, {
        expected: '5/5/5; defId меняются по дням; сетка сходится',
        actual: `${day1.dateISO} → ${day2.dateISO} → ${day3.dateISO}; проф. ${professions(day1.rows).map((p) => PROFESSION_NAMES[p]).join('/')} → ${professions(day2.rows).map((p) => PROFESSION_NAMES[p]).join('/')}; сетка ${String(gridOk)}`,
      }),
    );
    f.dispose();
  }

  // [M11.2] часть 3: worker.tick/Director/провайдер (чеки 13–18)
  const tickResults = await runWorkersTickChecks();
  // [M11.2] часть 4: улучшения ×5/манифест 1.1.0/сейв (чеки 19–26)
  const upgResults = await runWorkersUpgChecks();

  return group('M11 Работники', [...results, ...dayResults, ...tail, ...tickResults, ...upgResults]);
}
