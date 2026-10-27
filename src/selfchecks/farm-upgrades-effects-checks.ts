/**
 * Self-checks M05.3 — часть 3б: эффектные улучшения (G2/G3 брифа M05.3).
 * Оракулы руками: моды Плодородия/Чернозёма (resolve по категориям +
 * посадочные оракулы), гербициды 8%→4% (улучшение, НЕ товар M04),
 * спринклеры (исполнитель TaskRegistry регистрируется покупкой; каденс 8ч
 * из данных — часовая ветка), компостер (транзакция обмена при прополке),
 * второе поле (вкладка 4×4), витрина farm.upgrades (данные на стол, П6).
 */
import { check, type CheckResult } from './types';
import { FARM_T0, makeFarmGame, acquireFor, buyUpgrade, forceWeedsInTab, hourPass, levelPlayerTo, tileInTab, type R } from './farm-fixture';
import { CROPS } from '@/content/farm/crops';
import { growMsOf } from '@/game/modules/farm/logic/growth';
import { FARM_UPGRADES } from '@/content/farm/upgrades';

const HOUR = 3_600_000;

export async function runFarmUpgradesEffectsChecks(): Promise<CheckResult[]> {
  const results: CheckResult[] = [];

  // ---------------------------------------- 19. моды улучшений поимённо (resolve-оракулы)
  {
    const f = makeFarmGame();
    await f.game.init();
    levelPlayerTo(f, 25);
    f.game.wallet.grant('gold', 5000);
    buyUpgrade(f, 'upg_fertility');
    const resolve = (tags: string[]): number =>
      f.game.statBus.resolve({ stat: 'farm.growthSpeed', ctx: { ...f.game.time.ctx('player'), tags } });
    const fruitF = resolve(['farm:crop:fruit']);
    const rootF = resolve(['farm:crop:root']);
    buyUpgrade(f, 'upg_chernozem');
    const mushroom = resolve(['farm:crop:mushroom']);
    const fruitBoth = resolve(['farm:crop:fruit']); // стак: +25 −15
    const grain = resolve(['farm:crop:grain']);
    // посадочные оракулы (оба улучшения куплены): тыква (fruit) 12ч → ×100/110; морковь (root) 6ч → ×100/90
    acquireFor(f, 'seed_pumpkin', 1);
    acquireFor(f, 'seed_carrot', 1);
    f.farm['farm.plow'](2);
    f.farm['farm.plant']('pumpkin', 2);
    f.farm['farm.plow'](3);
    f.farm['farm.plant']('carrot', 3);
    const pump = tileInTab(f, 'field', 2);
    const car = tileInTab(f, 'field', 3);
    results.push(
      check('моды улучшений поимённо: Плодородие fruit +25 / root −10; +Чернозём: mushroom +30, стак fruit = +10; посадки тыквы ×100/110, моркови ×100/90', () =>
        fruitF === 125 && rootF === 90 && mushroom === 130 && grain === 100 && fruitBoth === 110 &&
        (pump.grownAt ?? 0) - FARM_T0 === growMsOf(CROPS.find((c) => c.id === 'pumpkin')!, 110) &&
        (car.grownAt ?? 0) - FARM_T0 === growMsOf(CROPS.find((c) => c.id === 'carrot')!, 90), {
        expected: 'fruit 125→110 (стак) / root 90 / mushroom 130 / grain 100; посадки по оракулам',
        actual: `fruit ${fruitF}→${fruitBoth} / root ${rootF} / mushroom ${mushroom} / grain ${grain}`,
      }),
    );
    f.dispose();
  }

  // ---------------------------------------- 20. гербициды: 8% → 4% (улучшение, не товар)
  {
    const f = makeFarmGame();
    await f.game.init();
    const ctx = { ...f.game.time.ctx('player'), tags: ['farm:tile:field:0', 'farm'] as string[] };
    const base = f.game.statBus.resolve({ stat: 'farm.weeds.chancePercent', ctx });
    levelPlayerTo(f, 25);
    f.game.wallet.grant('gold', 500);
    buyUpgrade(f, 'upg_herbicides');
    const withHerb = f.game.statBus.resolve({ stat: 'farm.weeds.chancePercent', ctx });
    results.push(
      check('гербициды (улучшение): шанс зарастания 8% → 4% (inc −50 [tag=farm] — мод-путь M05.2 жив; пул магазина M04 не тронут)', () =>
        base === 8 && withHerb === 4, {
        expected: '8 → 4',
        actual: `${base} → ${withHerb}`,
      }),
    );
    f.dispose();
  }

  // ---------------------------------------- 21. спринклеры: TaskRegistry + каденс 8ч
  {
    const f = makeFarmGame();
    await f.game.init();
    levelPlayerTo(f, 25);
    f.game.wallet.grant('gold', 2000);
    acquireFor(f, 'seed_wheat', 1);
    f.farm['farm.plow'](0);
    f.farm['farm.plant']('wheat', 0); // НЕ поливаем — спринклеры должны сами
    const before = f.game.tasks.list().map((t) => t.id);
    buyUpgrade(f, 'upg_sprinklers');
    const afterBuy = f.game.tasks.list().map((t) => t.id);
    const t0 = tileInTab(f, 'field', 0);
    hourPass(f, FARM_T0 + 4 * HOUR); // рано: каденс 8ч
    const early = tileInTab(f, 'field', 0);
    hourPass(f, FARM_T0 + 8 * HOUR); // срок: автополив
    const late = tileInTab(f, 'field', 0);
    results.push(
      check('спринклеры: исполнитель farm.sprinkler регистрируется ПОКУПКОЙ (до — нет); каденс 8ч: +4ч — сухо, +8ч — автополив всех растущих (wateredUntil = +8ч от прохода)', () =>
        !before.includes('farm.sprinkler') && afterBuy.includes('farm.sprinkler') &&
        early?.wateredUntil === t0?.wateredUntil && // не тронут на +4ч
        late?.wateredUntil === FARM_T0 + 8 * HOUR + 8 * HOUR, {
        expected: `+4ч: нет; +8ч: wateredUntil ${FARM_T0 + 16 * HOUR}`,
        actual: `+4ч ${String(early?.wateredUntil)}; +8ч ${String(late?.wateredUntil)}`,
      }),
    );
    f.dispose();
  }

  // ---------------------------------------- 22. компостер: прополка с навозом → Удобрение
  {
    const f = makeFarmGame();
    await f.game.init();
    levelPlayerTo(f, 25);
    f.game.wallet.grant('gold', 1000);
    buyUpgrade(f, 'upg_composter');
    acquireFor(f, 'seed_wheat', 2);
    acquireFor(f, 'manure', 1);
    f.farm['farm.plow'](0);
    f.farm['farm.plant']('wheat', 0);
    const stop = forceWeedsInTab(f, 'field', 0);
    hourPass(f, FARM_T0 + HOUR);
    stop();
    const w1 = f.farm['farm.weed'](0) as R<{ composted: boolean; prevWeeds: number }>;
    const tx = f.events.find((e) => e.name === 'wallet.transaction' && e.payload.eventId === 'farm.compost');
    // второй заросший тайл БЕЗ навоза — прополка честная, обмена нет
    f.farm['farm.plow'](1);
    f.farm['farm.plant']('wheat', 1);
    const stop2 = forceWeedsInTab(f, 'field', 1);
    hourPass(f, FARM_T0 + 2 * HOUR);
    stop2();
    const w2 = f.farm['farm.weed'](1) as R<{ composted: boolean }>;
    results.push(
      check('компостер: прополка с навозом → транзакция farm.compost (manure −1, fertilizer +1); без навоза — прополка без обмена (штатно)', () =>
        w1.ok && w1.value.composted === true && w1.value.prevWeeds === 1 &&
        tx !== undefined && JSON.stringify(tx.payload.costs) === JSON.stringify([{ t: 'item', id: 'manure', qty: 1 }]) &&
        JSON.stringify(tx.payload.grants) === JSON.stringify([{ t: 'currency', id: 'fertilizer', qty: 1 }]) &&
        f.game.wallet.get('fertilizer') === 1 &&
        w2.ok && w2.value.composted === false, {
        expected: 'с навозом: composted + tx; без: composted=false',
        actual: `w1 ${JSON.stringify(w1.ok ? w1.value : w1.error)}; fertilizer ${f.game.wallet.get('fertilizer')}; w2 ${w2.ok ? String(w2.value.composted) : w2.error}`,
      }),
    );
    f.dispose();
  }

  // ---------------------------------------- 23. второе поле: вкладка 4×4 kind field
  {
    const f = makeFarmGame();
    await f.game.init();
    levelPlayerTo(f, 25);
    f.game.wallet.grant('gold', 2000);
    buyUpgrade(f, 'upg_field2');
    acquireFor(f, 'seed_wheat', 1);
    const v = f.farm['farm.state']() as { tabs: Array<{ id: string; kind: string; tiles: Array<{ index: number }> }> };
    const tab = v.tabs.find((t) => t.id === 'field2');
    f.farm['farm.plow'](0, 'field2');
    const plant = f.farm['farm.plant']('wheat', 0, 'field2') as R<unknown>;
    const tile = tileInTab(f, 'field2', 0);
    results.push(
      check('второе поле: вкладка field2 (kind field, 16 тайлов 4×4); посадка жива (работник — M11, не этот сеанс)', () =>
        tab?.kind === 'field' && tab?.tiles.length === 16 && plant.ok && tile?.state === 'growing', {
        expected: 'field2: field, 16 тайлов, growing',
        actual: `${tab?.kind}, ${tab?.tiles.length} тайлов, ${tile?.state}`,
      }),
    );
    f.dispose();
  }

  // ---------------------------------------- 24. витрина farm.upgrades (данные на стол)
  {
    const f = makeFarmGame();
    await f.game.init();
    const v = f.farm['farm.upgrades']() as { rows: Array<{ id: string; purchased: boolean; gateText: string | null; cost: { currency: string; qty: number }; effectText: string }>; purchased: number; total: number };
    const byId = new Map(v.rows.map((r) => [r.id, r] as const));
    results.push(
      check('витрина farm.upgrades: 10 улучшений (3 вкладки + 7 эффектов карточки §6), цены/замки/эффекты; FARM_UPGRADES = контенту', () =>
        v.total === 10 && v.purchased === 0 && v.rows.length === FARM_UPGRADES.length &&
        byId.get('tab_mushroom')?.cost.qty === 400 && byId.get('tab_greenhouse')?.cost.qty === 2000 &&
        byId.get('upg_herbicides')?.gateText === 'уровень 6' &&
        byId.get('upg_sprinklers')?.effectText.includes('farm.sprinkler') === true &&
        byId.get('upg_greenhouse_lux')?.effectText.includes('greenhouse') === true, {
        expected: '10 строк, замки и эффекты читаемы',
        actual: `${v.total} строк; herbicides gate «${String(byId.get('upg_herbicides')?.gateText)}»`,
      }),
    );
    f.dispose();
  }

  return results;
}
