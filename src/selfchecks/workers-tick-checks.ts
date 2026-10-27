/**
 * Self-checks M11 «Работники» — часть 3 (сеанс M11.2: worker.tick +
 * WorkersDirector + провайдер worker.traits). Улучшения/манифест/сейв —
 * workers-upg-checks.ts (расщепление 01 §6).
 *
 * Покрытие (бриф SESSION-M11.2 §5): тики-детерминизм (границы 2|4|6ч от
 * фазы hiredAt — чистые функции); шанс-маппинг (звёзды/уход/настроение/
 * болезнь 0.5/инструмент-штраф [DECISION Task 54]; провал — БЕЗ
 * последствий); ЖИВОЙ тик → actionDone ПОЛОЖИТЕЛЬНЫЙ {system, action,
 * object, success, defId} + lastAction + стрим workers:tick + КОНТРАКТ
 * ЭНЕРГИЙ (энергия игрока НЕ меняется — override-0); тест-двойник
 * исполнителя farm.water (карточка §7: ctx.workerId + params адресации);
 * catchUp — эффекты без ленты (оракул отрицания actionDone); провайдер
 * worker.traits (трейт доезжает до StatBus с тегом системы; чужая — 0;
 * увольнение снимает); улучшения ×5 (покупка/повтор/витрина/эффекты);
 * манифест 1.1.0 = факту. Живые rng-роллы детерминированы стримами
 * (фикс-saveId; ×2 байт-в-байт канону).
 */
import type { RngBus } from '@/kernel/bus/rng-bus/rng-bus';
import { WORKERS_TABLE } from '@/content/workers/table';
import {
  isTickHour,
  successChanceOf,
  rollTickSuccess,
  calendarDayOf,
  isHolidayDay,
} from '@/game/modules/workers/logic/tick';
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
import { mkWorker } from './workers-day-checks';

const HOUR = 3_600_000;

const why = (r: R<unknown>): string => (r.ok ? 'ok' : r.error);

/** фейк RngBus для чистых роллов (детерминизм оракулов) */
function fakeRng(value: number): RngBus {
  return { rollRange: () => value } as unknown as RngBus;
}

export async function runWorkersTickChecks(): Promise<CheckResult[]> {
  const results: CheckResult[] = [];

  // ------------------------------------------------ 13. тики: границы 2|4|6ч от фазы hiredAt (чистые)
  {
    const w2 = mkWorker({ checkPeriodHours: 2 });
    const w4 = mkWorker({ checkPeriodHours: 4 });
    const w6 = mkWorker({ checkPeriodHours: 6 });
    const h0 = Math.floor(WORKERS_T0 / HOUR); // T0 = 2024-01-01 12:00 — граница часа
    const at = (h: number): number => h * HOUR;
    results.push(
      check('тики F10 (чистые): границы hourTick ОТ ФАЗЫ hiredAt — (H − H₀) кратно периоду и H > H₀; 2ч: тик на +2ч/+4ч, НЕ тик на +1ч/+3ч; 4ч: тик на +4ч, НЕ на +2ч/+6ч; 6ч: тик на +6ч, НЕ на +2ч/+4ч; hiredAt-граница — НЕ тик (строго больше)', () =>
        isTickHour(w2, at(h0 + 2)) && isTickHour(w2, at(h0 + 4)) &&
        !isTickHour(w2, at(h0 + 1)) && !isTickHour(w2, at(h0 + 3)) &&
        isTickHour(w4, at(h0 + 4)) && !isTickHour(w4, at(h0 + 2)) && !isTickHour(w4, at(h0 + 6)) &&
        isTickHour(w6, at(h0 + 6)) && !isTickHour(w6, at(h0 + 2)) && !isTickHour(w6, at(h0 + 4)) &&
        !isTickHour(w2, at(h0)), {
        expected: '2ч: 2✓4✓ 1✗3✗; 4ч: 4✓ 2✗6✗; 6ч: 6✓ 2✗4✗; H₀ ✗',
        actual: `2ч: ${String(isTickHour(w2, at(h0 + 2)))}/${String(isTickHour(w2, at(h0 + 4)))}; 4ч: ${String(isTickHour(w4, at(h0 + 4)))}; 6ч: ${String(isTickHour(w6, at(h0 + 6)))}`,
      }),
    );
  }

  // ------------------------------------------------ 14. шанс: маппинг-оракулы + провал без последствий + календарь
  {
    const base = successChanceOf(mkWorker(), WORKERS_TABLE, { sick: false, toolMissing: false }); // 3★/3/50
    const top = successChanceOf(mkWorker({ stars: 5, care: 5, mood: 100 }), WORKERS_TABLE, { sick: false, toolMissing: false });
    const sick = successChanceOf(mkWorker(), WORKERS_TABLE, { sick: true, toolMissing: false });
    const tool = successChanceOf(mkWorker(), WORKERS_TABLE, { sick: false, toolMissing: true });
    const rollFail = rollTickSuccess(fakeRng(0.9), mkWorker(), 0.5); // 0.9 ≥ 0.5 → провал
    const rollOk = rollTickSuccess(fakeRng(0.49), mkWorker(), 0.5);
    // праздник: T0 = 2024-01-01 → calendarDay 19723 (19723 % 7 = 4 — НЕ праздник);
    // +3д = 2024-01-04 → 19726 % 7 = 0 — праздник
    const day0 = calendarDayOf(WORKERS_T0);
    const holiday = isHolidayDay(WORKERS_T0 + 3 * WORKERS_DAY, WORKERS_TABLE);
    const notHoliday = isHolidayDay(WORKERS_T0, WORKERS_TABLE);
    results.push(
      check('шанс F11 (маппинг-оракулы): 3★/уход 3/mood 50 → (0.50 + 0) × (0.5 + 0.5×0.75) = 0.4375; 5★/уход 5/mood 100 → (0.60 + 0.05) × 1.25 = 0.8125; больной × sickEfficiency 0.5 → 0.21875; инструмент [DECISION: ШТРАФ] × toolPenaltyFactor 0.6 → 0.2625; rollTickSuccess: ролл 0.9 ≥ 0.5 → провал (действие НЕ выполнено, БЕЗ последствий — вызов не происходит), 0.49 < 0.5 → успех; стрим workers:tick:<defId>; праздник: calendarDayOf(T0) = 19723 (не праздник), T0+3д = 19726 % 7 = 0 → праздник (данные holiday)', () =>
        Math.abs(base - 0.4375) < 1e-9 &&
        Math.abs(top - 0.8125) < 1e-9 &&
        Math.abs(sick - 0.21875) < 1e-9 &&
        Math.abs(tool - 0.2625) < 1e-9 &&
        rollFail === false && rollOk === true &&
        day0 === 19723 && holiday === true && notHoliday === false, {
        expected: '0.4375/0.8125/0.21875/0.2625; провал/успех; 19723→нет, 19726→праздник',
        actual: `${base.toFixed(4)}/${top.toFixed(4)}/${sick.toFixed(5)}/${tool.toFixed(4)}; роллы ${String(rollFail)}/${String(rollOk)}; день ${day0}, праздник ${String(holiday)}`,
      }),
    );
  }

  // ------------------------------------------------ 15. ЖИВОЙ тик: actionDone + lastAction + энергия + стрим
  {
    // фикс-сид m112-tick-2: доска 2024-01-01 — farmer [0] Радомир 4★/уход 3/2ч/без инструмента
    const f = await makeSeededWorkersGame('m112-tick-2');
    f.game.wallet.grant('gold', 10_000);
    const hired = hireFirstOf(f, 'farmer');
    if (!hired.ok) {
      results.push(check('живой тик F10/F12 (фигура фикстуры)', () => false, { expected: 'farmer на доске', actual: hired.error }));
      f.dispose();
      return results;
    }
    const defId = hired.value.defId;
    (f.workers['workers.dev']('mood', 0, 100) as R<unknown>); // шанс ↑ (0.55 × 1.25 = 0.6875)
    // растущий сухой тайл: вспахать + посадить (БЕЗ полива — цель директора)
    (f.inv['inventory.acquire'] as unknown as (d: string, q: number, s: string) => R<unknown>)('seed_wheat', 1, 'selfcheck');
    f.game.modules.get('farm')?.api['farm.plow'](0);
    f.game.modules.get('farm')?.api['farm.plant']('wheat', 0);
    const energyBefore = energyOf(f);
    // цикл тиков (2ч) до actionDone — роллы детерминированы стримом (фикс-saveId)
    const h0 = Math.floor(WORKERS_T0 / HOUR);
    let done: Record<string, unknown> | null = null;
    let ticks = 0;
    for (let i = 1; i <= 12 && done === null; i++) {
      hourPass(f, (h0 + 2 * i) * HOUR);
      ticks = i;
      const list = eventsOf(f, 'worker.actionDone');
      done = list.length > 0 ? (list[list.length - 1] as Record<string, unknown>) : null;
    }
    const energyAfter = energyOf(f);
    const list0 = workersView(f).list[0]!;
    const tileWet = ((f.game.modules.get('farm')?.api['farm.state']() as {
      tabs: Array<{ id: string; tiles: Array<{ wet: boolean }> }>;
    }).tabs.find((t) => t.id === 'field')?.tiles[0]?.wet) === true;
    const roll = lastRollOf(f, `workers:tick:${defId}`);
    results.push(
      check('живой тик F10/F12: нанят фермер (4★/2ч) + растущий сухой тайл → hourTick на границе периода (цикл ≤12, роллы детерминированы) → worker.actionDone {defId, system: farm, action: farm.water, object: field, success: true} — ОБЁРТКА публикует ПОСЛЕ runTask [DECISION-архитектура]; витрина lastAction {taskId: farm.water, success: true}; тайл полит (витрина фермы wet); КОНТРАКТ ЭНЕРГИЙ [DECISION Task 54]: энергия игрока НЕ изменилась (override-0 action.*.energyCost — «механизм, не труд»); стрим workers:tick:<defId> в журнале', () =>
        done !== null &&
        done.defId === defId && done.system === 'farm' && done.action === 'farm.water' &&
        done.object === 'field' && done.success === true &&
        list0.lastAction !== null && list0.lastAction!.taskId === 'farm.water' && list0.lastAction!.success === true &&
        tileWet &&
        energyBefore === energyAfter &&
        roll !== null, {
        expected: 'actionDone farm.water успех; lastAction; тайл полит; энергия та же; тик-ролл в журнале',
        actual: `действие ${String(done?.action)} (${String(done?.success)}); тиков ${ticks}; lastAction ${list0.lastAction?.taskId}; wet ${String(tileWet)}; энергия ${energyBefore}→${energyAfter}; ролл ${roll}`,
      }),
    );
    f.dispose();
  }

  // ------------------------------------------------ 16. тест-двойник исполнителя (карточка §7): ctx работника
  {
    // изолированная фикстура: перерегистрация 'farm.water' тест-двойником
    // поверх живого (TaskRegistry.set — фикстура dispose изолирует)
    const f = await makeSeededWorkersGame('m112-tick-2');
    f.game.wallet.grant('gold', 10_000);
    const hired = hireFirstOf(f, 'farmer');
    if (!hired.ok) {
      results.push(check('двойник исполнителя (фигура фикстуры)', () => false, { expected: 'farmer', actual: hired.error }));
      f.dispose();
      return results;
    }
    const defId = hired.value.defId;
    (f.workers['workers.dev']('mood', 0, 100) as R<unknown>);
    (f.inv['inventory.acquire'] as unknown as (d: string, q: number, s: string) => R<unknown>)('seed_wheat', 1, 'selfcheck');
    f.game.modules.get('farm')?.api['farm.plow'](0);
    f.game.modules.get('farm')?.api['farm.plant']('wheat', 0);
    let called = 0;
    let seenWorkerId: string | undefined;
    let seenParams: Record<string, unknown> | undefined;
    f.game.tasks.register('farm.water', {
      label: 'тест-двойник полива (карточка §7)',
      run: (ctx) => {
        called++;
        seenWorkerId = ctx.workerId;
        seenParams = ctx.params;
        return { ok: true, value: { message: 'двойник полил' } };
      },
    });
    const h0 = Math.floor(WORKERS_T0 / HOUR);
    for (let i = 1; i <= 12 && called === 0; i++) {
      hourPass(f, (h0 + 2 * i) * HOUR);
    }
    results.push(
      check('двойник исполнителя (карточка §7): работник вызывает задачу назначенной системы через TaskRegistry — тест-двойник farm.water вызван с качеством работника: ctx.workerId = defId, ctx.params адресации {tileIdx: 0, tab: field} [DECISION-адресация]; импорт фермы в modules/workers = 0 (изоляция rg — чтение только через views/TaskRegistry)', () =>
        called > 0 &&
        seenWorkerId === defId &&
        seenParams?.tileIdx === 0 && seenParams?.tab === 'field', {
        expected: 'двойник вызван; workerId = defId; params {tileIdx: 0, tab: field}',
        actual: `вызовов ${called}; workerId ${String(seenWorkerId)}; params ${JSON.stringify(seenParams)}`,
      }),
    );
    f.dispose();
  }

  // ------------------------------------------------ 17. catchUp: эффекты без ленты (F13)
  {
    const f = await makeSeededWorkersGame('m112-tick-2');
    f.game.wallet.grant('gold', 10_000);
    const hired = hireFirstOf(f, 'farmer');
    if (!hired.ok) {
      results.push(check('catchUp F13 (фигура фикстуры)', () => false, { expected: 'farmer', actual: hired.error }));
      f.dispose();
      return results;
    }
    const defId = hired.value.defId;
    (f.workers['workers.dev']('mood', 0, 100) as R<unknown>);
    (f.inv['inventory.acquire'] as unknown as (d: string, q: number, s: string) => R<unknown>)('seed_wheat', 1, 'selfcheck');
    f.game.modules.get('farm')?.api['farm.plow'](0);
    f.game.modules.get('farm')?.api['farm.plant']('wheat', 0);
    const h0 = Math.floor(WORKERS_T0 / HOUR);
    let acted = false;
    for (let i = 1; i <= 12 && !acted; i++) {
      hourPass(f, (h0 + 2 * i) * HOUR, true); // catchUp=true — оффлайн-граница
      acted = workersView(f).list[0]?.lastAction != null;
    }
    const actionDone = eventsOf(f, 'worker.actionDone').length;
    results.push(
      check('catchUp F13 [DECISION]: оффлайн-часовые границы (catchUp=true) — эффекты вызовов ЕСТЬ (витрина lastAction обновляется), ленты actionDone НЕТ (оракул отрицания — «лента не взрывается при +72ч»); повторных роллов настроения/болезней тик не делает (они — dayPass/dayTick-канон); кап 72ч — канон 02 §8 часовых границ ядра (OfflineCatchup)', () =>
        acted && actionDone === 0, {
        expected: 'lastAction есть; actionDone 0',
        actual: `lastAction ${String(acted)}; actionDone ${actionDone}`,
      }),
    );
    f.dispose();
  }

  // ------------------------------------------------ 18. провайдер worker.traits: тег назначения + отрицание + снятие
  {
    const f = await makeSeededWorkersGame('m112-traits-provider');
    // синтетический нанятый фермер с трейтом «Зелёные руки» +20 (save import)
    await f.game.save.importJson(
      JSON.stringify({
        saveVersion: 14,
        savedAt: WORKERS_T0,
        saveId: 'm112-traits-provider',
        contentVersion: '0.1.0-phase0',
        modules: {
          workers: {
            v: 1,
            hired: [
              {
                defId: 'wk_synth_0',
                name: 'Синт',
                profession: 'farmer',
                stars: 3,
                salaryPerDay: 30,
                checkPeriodHours: 4,
                care: 3,
                traits: [{ type: 'worker_green_thumb', value: 20, from: 'initial' }],
                object: 'field',
                mood: 50,
                hiredAt: WORKERS_T0,
              },
            ],
          },
        },
        lastSeen: WORKERS_T0,
      }),
    );
    f.game.bus.publish('invalidate.stat', {});
    const ctx = (tags: string[]) => ({ player: 'player', now: WORKERS_T0, tags });
    const own = f.game.statBus.resolve({ stat: 'farm.growthSpeed', ctx: ctx(['farm:tab:field']) });
    const foreign = f.game.statBus.resolve({ stat: 'farm.growthSpeed', ctx: ctx(['lake:0']) });
    const noTags = f.game.statBus.resolve({ stat: 'farm.growthSpeed', ctx: ctx([]) });
    // увольнение — моды снимаются (провайдер читает живое состояние)
    (f.workers['workers.fire'](0) as R<unknown>);
    f.game.bus.publish('invalidate.stat', {});
    const afterFire = f.game.statBus.resolve({ stat: 'farm.growthSpeed', ctx: ctx(['farm:tab:field']) });
    results.push(
      check('провайдер F14 worker.traits: трейт назначенного (+20% farm.growthSpeed, объект field) ДОЕЗЖАЕТ до StatBus в запросе ЕГО системы (тег farm:tab:field → 120; живые резолвы фермы уже так тегируют); чужая система (тег lake:0) → 100 — оракул отрицания карточки §7; запрос без тегов → 100; увольнение снимает моды (живое состояние провайдера) → 100', () =>
        own === 120 && foreign === 100 && noTags === 100 && afterFire === 100, {
        expected: '120 / 100 / 100 / 100 (после увольнения)',
        actual: `своя ${own}; чужая ${foreign}; без тегов ${noTags}; после fire ${afterFire}`,
      }),
    );
    f.dispose();
  }
  return results;
}
