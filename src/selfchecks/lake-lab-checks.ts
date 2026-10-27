/**
 * Self-checks M08 «Озеро» — часть 2a' (сеанс M08.2: Автокормушка F12 +
 * Лаборатория F13 + «Глубоководье»). Расщепление lake-upg-checks по 01 §6.
 *
 * Покрытие (бриф §2.3): Автокормушка (расход ровно ×N, eventId lake.feed;
 * нехватка — не кормит/событий нет; порядок dayTick — кормление ДО
 * разведения: сытая пара образуется тем же тиком); Лаборатория (отказ без
 * покупки; форс/кулдаун; plus2 — гарантированный +2 с потреблением и
 * снятием; plus1 — ремап [0.89, 1], НЕ инфлируется Инкубатором);
 * «Глубоководье» (слоты 6 → 10, адресация 7–10, «полно 10/10»).
 *
 * [M11 · lake:research] P2 MISS-1 (AUDIT-M08): чек 30 — ролл-маркер
 * стрима lake:research в журнале RngBus при КАЖДОМ применении
 * (прецедент lake:autofeed F12 — наблюдаемость Лаборатории).
 */
import { LAKE_TABLE } from '@/content/balance/lake';
import { researchRemap, mutationBonusOf } from '@/game/modules/lake/logic/breeding';
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
  lastRollOf,
  makeSeededLakeGame,
  type R,
} from './lake-fixture';

const HOUR = LAKE_HOUR;

export async function runLakeLabChecks(): Promise<CheckResult[]> {
  const results: CheckResult[] = [];

  // ------------------------------------------------ 25. F12: Автокормушка — кормление/нехватка/порядок
  {
    const f = await makeSeededLakeGame('m082-autofeeder');
    f.game.wallet.grant('gold', 1000);
    f.game.wallet.grant('feed', 10);
    giveFish(f, 'crucian', 'C');
    giveFish(f, 'crucian', 'C');
    const iids = (f.inv['inventory.list']() as Array<{ iid: string; defId: string }>).filter((i) => i.defId === 'crucian');
    f.lake['lake.release'](iids[0]!.iid);
    f.lake['lake.release'](iids[1]!.iid);
    hourPass(f, LAKE_T0 + 25 * HOUR); // обе голодные (+25ч); авто-пара НЕ образуется (голод)
    const hungryBefore = lakeView(f).hungryCount;
    f.lake['lake.upgrade']('upg_autofeeder') as R<unknown>;
    const feedBefore = f.game.wallet.get('feed');
    dayPass(f, LAKE_T0 + LAKE_T0 * 0 + 26 * HOUR); // dayTick: автокорм → болезни → sweep
    const after = lakeView(f);
    const tx = eventsOf(f, 'wallet.transaction').filter((e) => e.eventId === 'lake.feed');
    // порядок: сытые этим же тиком размножаются — пара уже идёт
    const paired = after.pairs.length === 1;
    // нехватка: вторая фикстура без Корма вообще
    const noFeed = await makeSeededLakeGame('m082-autofeeder-nofeed');
    noFeed.game.wallet.grant('gold', 500);
    giveFish(noFeed, 'crucian', 'C');
    giveFish(noFeed, 'crucian', 'C');
    const iids2 = (noFeed.inv['inventory.list']() as Array<{ iid: string; defId: string }>).filter((i) => i.defId === 'crucian');
    noFeed.lake['lake.release'](iids2[0]!.iid);
    noFeed.lake['lake.release'](iids2[1]!.iid);
    noFeed.lake['lake.upgrade']('upg_autofeeder') as R<unknown>;
    dayPass(noFeed, LAKE_T0 + 25 * HOUR); // Корма 0 → не кормит
    const stillHungry = lakeView(noFeed).hungryCount;
    const txNone = eventsOf(noFeed, 'wallet.transaction').filter((e) => e.eventId === 'lake.feed').length;
    noFeed.dispose();
    results.push(
      check('Автокормушка F12: dayTick кормит голодных сама (Корм ×2, eventId lake.feed — тот же канон F4; витрина: голодных 0, Корм 10 → 8); ПОРЯДОК dayTick — кормление ДО разведения (сытые этим же тиком размножаются: пара уже идёт); нехватка Корма на ВСЕХ → не кормит (голодают, tx lake.feed 0 — состояние цело, событий нет)', () =>
        hungryBefore === 2 && feedBefore === 10 &&
        after.hungryCount === 0 && f.game.wallet.get('feed') === 8 && tx.length === 1 && paired &&
        stillHungry === 2 && txNone === 0, {
        expected: 'сыты −2 Корма + пара; без Корма — голодают/0 tx',
        actual: `голодных ${hungryBefore} → ${after.hungryCount}; Корм ${feedBefore} → ${f.game.wallet.get('feed')}; tx ${tx.length}; пара ${paired}; noFeed: голодных ${stillHungry}, tx ${txNone}`,
      }),
    );
    f.dispose();
  }

  // ------------------------------------------------ 26. F13: Лаборатория — отказы/кулдаун/сброс
  {
    const f = await makeSeededLakeGame('m082-lab-gates');
    f.game.wallet.grant('gold', 2000);
    const noLab = f.lake['lake.research']('plus1') as R<unknown>;
    f.lake['lake.upgrade']('upg_laboratory') as R<unknown>;
    const first = f.lake['lake.research']('plus1') as R<{ mode: string }>;
    // форс plus1 ещё заряжен → повторная зарядка ДО потребления — «заряжен»
    // (guard форса стоит раньше кулдауна — честный порядок причин)
    const charged = f.lake['lake.research']('plus2') as R<unknown>;
    const bogus = f.lake['lake.research']('plus9') as R<unknown>;
    const cdBeforeReset = (f.lake['lake.state']() as { research: { cooldownMs: number } }).research.cooldownMs;
    f.lake['lake.force']('research', 0) as R<unknown>;
    const cdAfterReset = (f.lake['lake.state']() as { research: { cooldownMs: number } }).research.cooldownMs;
    // форс plus1 ещё заряжен (сброс — ТОЛЬКО кулдаун) → повторная зарядка до
    // потребления откажет «форс уже заряжен»; после сброса кулдауна — 0
    const afterReset = f.lake['lake.research']('plus2') as R<unknown>;
    const view = (f.lake['lake.state']() as { research: { built: boolean; mode: string | null; cooldownMs: number } }).research;
    results.push(
      check('Лаборатория F13: без покупки — отказ «не построена»; покупка → lake.research plus1 ок (форс заряжен, витрина кулдаун 24ч); повторная зарядка до потребления — отказ «форс уже заряжен»; неизвестный режим — отказ (plus1|plus2); dev lake.force research 0 — сброс ТОЛЬКО кулдауна (24ч → 0), форс plus1 остаётся заряжен → повторная зарядка — снова «заряжен»; витрина: built + mode', () =>
        !noLab.ok && noLab.error.includes('не построена') &&
        first.ok && first.value.mode === 'plus1' &&
        !charged.ok && charged.error.includes('форс уже заряжен') &&
        !bogus.ok &&
        cdBeforeReset > 0 && cdAfterReset === 0 &&
        !afterReset.ok && afterReset.error.includes('форс уже заряжен') &&
        view.built && view.mode === 'plus1', {
        expected: 'отказ/ок/заряжен/сброс-только-кулдауна/заряжен',
        actual: `noLab ${noLab.ok}; first ${first.ok}; заряжен ${charged.ok}; сброс ${cdBeforeReset}→${cdAfterReset}; повтор ${afterReset.ok}; витрина ${view.built}/${view.mode}`,
      }),
    );
    f.dispose();
  }

  // ------------------------------------------------ 27. F13: plus2 — гарантированный +2, потребление, снятие форса
  {
    const f = await makeSeededLakeGame('m082-lab-plus2');
    f.game.wallet.grant('gold', 2000);
    giveFish(f, 'crucian', 'B');
    giveFish(f, 'crucian', 'B');
    const iids = (f.inv['inventory.list']() as Array<{ iid: string; defId: string }>).filter((i) => i.defId === 'crucian');
    f.lake['lake.release'](iids[0]!.iid);
    f.lake['lake.release'](iids[1]!.iid);
    f.lake['lake.upgrade']('upg_laboratory') as R<unknown>;
    const res = f.lake['lake.research']('plus2') as R<unknown>;
    const roe0 = lakeView(f).roe.length; // 0
    hourPass(f, LAKE_T0 + 25 * HOUR); // авто-пара завершилась → икра с форсом
    const after = lakeView(f);
    const roll = lastRollOf(f, 'lake:breed:crucian:mutation');
    const bred = eventsOf(f, 'lake.bred');
    // витрина после: форс потреблён (mode null); 25ч > 24ч кулдауна →
    // перезарядка доступна снова (доказательство: research plus1 ок)
    const rv = after.research;
    const recharge = f.lake['lake.research']('plus1') as R<unknown>;
    results.push(
      check('Лаборатория F13 · plus2: родители B → форс plus2 → следующая икра РЕДКАЯ +2 гарантирована (базовый ролл стрима ремапится в [0.99, 1] — журнал пишет базовый; эффективный = 0.99 + roll×0.01 → тир A = B−1+2, ВЫШЕ родителя); lake.bred {childTier: A} опубликован; форс ПОТРЕБЛЁН этой икрой (витрина mode null); кулдаун 24ч от применения истёк (25ч икры) → перезарядка снова доступна; Инкубатор на форс НЕ действует (базовые окна)', () =>
        res.ok && roe0 === 0 && after.roe.length === 1 && after.roe[0]!.tier === 'A' &&
        roll !== null && researchRemap(roll, LAKE_TABLE, 'plus2') >= 0.99 &&
        bred.length === 1 && bred[0]!.childTier === 'A' &&
        rv.mode === null && recharge.ok, {
        expected: 'икра A (эффективный ролл ≥ 0.99); форс снят; перезарядка ок',
        actual: `икра ${after.roe.map((r) => r.tier).join(',')}; базовый ролл ${roll} → ${(roll !== null ? researchRemap(roll, LAKE_TABLE, 'plus2') : 0).toFixed(4)}; bred ${bred.map((b) => b.childTier).join(',')}; mode ${rv.mode}; перезарядка ${recharge.ok}`,
      }),
    );
    f.dispose();
  }

  // ------------------------------------------------ 28. F13: plus1 — ремап [0.89, 1] + НЕ инфлируется Инкубатором
  {
    const f = await makeSeededLakeGame('m082-lab-plus1');
    f.game.wallet.grant('gold', 3000);
    giveFish(f, 'crucian', 'C');
    giveFish(f, 'crucian', 'C');
    const iids = (f.inv['inventory.list']() as Array<{ iid: string; defId: string }>).filter((i) => i.defId === 'crucian');
    f.lake['lake.release'](iids[0]!.iid);
    f.lake['lake.release'](iids[1]!.iid);
    f.lake['lake.upgrade']('upg_laboratory') as R<unknown>;
    f.lake['lake.upgrade']('upg_incubator') as R<unknown>; // X=10 — на форс НЕ действует
    const res = f.lake['lake.research']('plus1') as R<unknown>;
    hourPass(f, LAKE_T0 + 25 * HOUR);
    const after = lakeView(f);
    const roll = lastRollOf(f, 'lake:breed:crucian:mutation');
    // plus1: ЭФФЕКТИВНЫЙ ролл = ремап базового в [0.89, 1] → бонус ≥ 1
    // (журнал пишет базовый); форс-роллы читаются по БАЗОВЫМ окнам —
    // Инкубатор X=10 НЕ инфлирует форс (ремап 0.5 → 0.945 → +1)
    const remap = researchRemap(0.5, LAKE_TABLE, 'plus1');
    const eff = roll !== null ? researchRemap(roll, LAKE_TABLE, 'plus1') : 0;
    results.push(
      check('Лаборатория F13 · plus1: базовый ролл стрима ремапится в [0.89, 1] (эффективный ≥ 0.89 → бонус ≥ 1 — 10/11 → +1, 1/11 → +2); форс-роллы читаются по БАЗОВЫМ окнам — Инкубатор X=10 НЕ инфлирует форс (ремап 0.5 → 0.945 → +1); икра C-родителей: тир ≥ C (не ниже родительской −1)', () =>
        res.ok && after.roe.length === 1 && eff >= 0.89 &&
        ['C', 'B'].includes(after.roe[0]!.tier) &&
        Math.abs(remap - (0.89 + 0.5 * 0.11)) < 1e-9 && mutationBonusOf(remap, LAKE_TABLE.breeding.mutation) === 1, {
        expected: 'эффективный ≥ 0.89; тир C/B; ремап 0.945 → +1',
        actual: `икра ${after.roe.map((r) => r.tier).join(',')}; базовый ${roll} → ${eff.toFixed(4)}; ремап(0.5) ${remap.toFixed(4)}`,
      }),
    );
    f.dispose();
  }

  // ------------------------------------------------ 29. F10: «Глубоководье» — слоты 6 → 10
  {
    const f = await makeSeededLakeGame('m082-deepwater');
    f.game.wallet.grant('gold', 3000);
    const base0 = lakeView(f).slots.base;
    f.lake['lake.upgrade']('upg_deep_water') as R<unknown>;
    const base1 = lakeView(f).slots.base;
    // заполняем 10 слотов (7 новых рыб + пусто после пары автоикор не будет —
    // пара не образуется: выпускаем 10 подряд с интервалом? пара образуется
    // при sweep если 2 сытых одного вида — выпустим РАЗНЫЕ виды)
    for (const [fid, tier] of [['crucian', 'C'], ['rotan', 'C'], ['perch', 'C'], ['tench', 'C'], ['pike', 'C'], ['mirror_carp', 'C'], ['trout', 'C'], ['sturgeon', 'C'], ['chub', 'C'], ['zander', 'C']] as const) {
      giveFish(f, fid, tier);
    }
    const list = (f.inv['inventory.list']() as Array<{ iid: string; defId: string }>);
    const fishIds = new Set(['crucian', 'rotan', 'perch', 'tench', 'pike', 'mirror_carp', 'trout', 'sturgeon', 'chub', 'zander']);
    for (const e of list.filter((i) => fishIds.has(i.defId)).slice(0, 10)) {
      f.lake['lake.release'](e.iid);
    }
    const full = lakeView(f);
    const last = giveFish(f, 'crucian', 'C');
    const overflow = f.lake['lake.release'](last.ok ? last.value : '') as R<unknown>;
    results.push(
      check('«Глубоководье» F10: слоты 6 → 10 (адресация слотов 7–10 жива — 10 рыб разных видов размещаются); 11-й выпуск — «озеро полно 10/10»', () =>
        base0 === 6 && base1 === 10 && full.slots.used === 10 && full.slots.base === 10 &&
        !overflow.ok && overflow.error.includes('полно'), {
        expected: '6 → 10; полно 10/10',
        actual: `${base0} → ${base1}; занято ${full.slots.used}/${full.slots.base}; 11-й ${overflow.ok}`,
      }),
    );
    f.dispose();
  }

  // ------------------------------------------------ 30. [M11 · lake:research] P2 MISS-1: ролл-маркер применения Лаборатории
  {
    const f = await makeSeededLakeGame('m111-research-stream');
    f.game.wallet.grant('gold', 2000);
    const before = lastRollOf(f, 'lake:research');
    const refused = f.lake['lake.research']('plus1') as R<unknown>;
    const refusedMark = lastRollOf(f, 'lake:research');
    f.lake['lake.upgrade']('upg_laboratory') as R<unknown>;
    const res = f.lake['lake.research']('plus2') as R<unknown>;
    const marker = lastRollOf(f, 'lake:research');
    results.push(
      check('[M11 · lake:research] P2 MISS-1 (AUDIT-M08): КАЖДОЕ применение lake.research пишет ролл-маркер стрима lake:research в журнал RngBus (прецедент lake:autofeed F12) — наблюдаемость Лаборатории: у research нет ни транзакции, ни шинного события; отказ «не построена» маркера НЕ пишет', () =>
        before === null && !refused.ok && refusedMark === null && res.ok && marker !== null, {
        expected: 'до — null; отказ — null; применение — ролл в журнале',
        actual: `до ${before}; отказ ${refusedMark}; после применения ${marker}`,
      }),
    );
    f.dispose();
  }

  return results;
}
