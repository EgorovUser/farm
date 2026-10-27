/**
 * Self-checks M05 «Ферма» — часть 1 (сеанс M05.1: каркас + FSM + сейв v10).
 *
 * Расщепление 01 §6 (файл >300 строк): FSM-блоки — здесь, качество/миграция/
 * раундтрип — farm-quality-checks.ts; оркестратор собирает ОДНУ группу
 * (прецедент quests-checks). Оракулы руками (без ожиданий): FSM и отказы,
 * энергии списываются один раз / при отказе не тронуты, семя изымается
 * (inventory.remove — F6), урожай выдаётся (inventory.add, источник-тег
 * «выращено»), таймеры абсолютные (DI-подмена now через ManualClock),
 * качество сбора детерминировано по сиду (×2 идентичны) и фактор auto-score
 * в коридоре ×0.8–1.3 (F7), события — полный payload по F4, миграция v9→v10
 * (дефолт-срез / не перезаписывает живой / цепочка v3→v10 / v99-отказ),
 * save-раундтрип растущего тайла (абсолютные даты живы).
 *
 * Часовые правила (сорняки/сухость/catchUp), TaskRegistry-исполнители,
 * полные факторы качества (перки/«Парник-люкс»/монте-карло), счётчики и
 * квест-шаблоны — M05.2/M05.3 (не строятся, границы §4 брифа M05.1).
 */
import { QUALITY_TIERS } from '@/shared/types/ids';
import { FARM_TABLE } from '@/content/balance/farm';
import { CROPS } from '@/content/farm/crops';
import { growMsOf } from '@/game/modules/farm/logic/growth';
import { check, group, type CheckGroup, type CheckResult } from './types';
import { FARM_T0, makeFarmGame, type R } from './farm-fixture';
import { runFarmQualityChecks } from './farm-quality-checks';
import { runFarmWeedsChecks } from './farm-weeds-checks';
import { runFarmHourlyChecks } from './farm-hourly-checks';
import { runFarmUpgradesChecks } from './farm-upgrades-checks';
import { runFarmUpgradesEffectsChecks } from './farm-upgrades-effects-checks';
import { runFarmQuality3Checks } from './farm-quality3-checks';
import { runFarmM053Checks } from './farm-m053-checks';

const HOUR_MS = 3_600_000;
const WHEAT = CROPS.find((c) => c.id === 'wheat')!;

interface EnergyEvent { cost: number; stat: string }

function energySpentOf(events: Array<{ name: string; payload: Record<string, unknown> }>): EnergyEvent[] {
  return events
    .filter((e) => e.name === 'player.energySpent')
    .map((e) => ({ cost: Number(e.payload.cost), stat: String(e.payload.stat) }));
}

export async function runFarmFsmChecks(): Promise<CheckResult[]> {
  const results: CheckResult[] = [];

  // ---------------------------------------------------------------- 1. FSM: вспашка
  {
    const f = makeFarmGame();
    await f.game.init();
    const r = f.farm['farm.plow'](0) as R<{ tileIdx: number }>;
    const st = f.farm['farm.state']() as { tabs: Array<{ tiles: Array<{ index: number; state: string }> }> };
    const tile = st.tabs[0]!.tiles[0]!;
    const spent = energySpentOf(f.events);
    const changed = f.events.filter((e) => e.name === 'farm.tileChanged');
    results.push(
      check('FSM: вспашка empty→plowed, энергия −5 один раз, tileChanged {tab, tileIdx, from, to}', () =>
        r.ok && tile.state === 'plowed' &&
        spent.length === 1 && spent[0]!.cost === 5 && spent[0]!.stat === 'action.farm.plow.energyCost' &&
        changed.length === 1 &&
        JSON.stringify(changed[0]!.payload) === JSON.stringify({ tab: 'field', tileIdx: 0, from: 'empty', to: 'plowed' }), {
        expected: 'plowed / −5 / tileChanged ровно один',
        actual: `${tile.state} / ${JSON.stringify(spent)} / ${changed.length}`,
      }),
    );
    // невозможные переходы: повторная вспашка — отказ, энергия не тронута
    const before = f.events.length;
    const again = f.farm['farm.plow'](0) as R<unknown>;
    results.push(
      check('FSM: повторная вспашка — отказ с причиной, энергия/состояние целы', () =>
        !again.ok && again.error.includes('уже обработан') && f.events.length === before),
    );
    f.dispose();
  }

  // ------------------------------------------- 2. посадка: семя изымается, таймеры абсолютные
  {
    const f = makeFarmGame();
    await f.game.init();
    (f.inv['inventory.acquire'] as unknown as (d: string, q: number, s: string) => R<unknown>)('seed_wheat', 3, 'selfcheck');
    f.farm['farm.plow'](1);
    const r = f.farm['farm.plant']('wheat', 1) as R<{ grownAt: number }>;
    const consumed = f.events.filter((e) => e.name === 'item.consumed');
    const st = f.farm['farm.state']() as { now: number; tabs: Array<{ tiles: Array<{ index: number; state: string; cropId?: string; plantedAt?: number; grownAt?: number }> }> };
    const tile = st.tabs[0]!.tiles[1]!;
    const expectedMs = growMsOf(WHEAT, 100); // база farm.growthSpeed = 100 (нейтраль)
    const spent = energySpentOf(f.events);
    results.push(
      check('посадка: семя изъято (item.consumed source farm.plant), энергия −1, plantedAt/grownAt абсолютные (4ч при базе 100)', () =>
        r.ok && tile.state === 'growing' && tile.cropId === 'wheat' &&
        tile.plantedAt === FARM_T0 && tile.grownAt === FARM_T0 + expectedMs &&
        consumed.some((e) => e.payload.defId === 'seed_wheat' && e.payload.qty === 1 && e.payload.source === 'farm.plant') &&
        spent.some((s) => s.stat === 'action.farm.plant.energyCost' && s.cost === 1), {
        expected: `growing, изъято семя, grownAt−plantedAt = ${expectedMs}`,
        actual: `${tile.state}, consumed=${consumed.length}, Δ=${(tile.grownAt ?? 0) - (tile.plantedAt ?? 0)}`,
      }),
    );
    f.dispose();
  }

  // ------------------------------------------------- 3. полив: окно 8ч; гейт READY «тайл полит»
  {
    const f = makeFarmGame();
    await f.game.init();
    (f.inv['inventory.acquire'] as unknown as (d: string, q: number, s: string) => R<unknown>)('seed_wheat', 1, 'selfcheck');
    f.farm['farm.plow'](2);
    f.farm['farm.plant']('wheat', 2);
    // (a) время истекло, но НЕ полит → остаётся growing (гейт [DECISION] M05.1)
    f.farm['farm.grow'](2);
    const st2 = f.farm['farm.state']() as { tabs: Array<{ tiles: Array<{ index: number; state: string }> }> };
    const dryTile = st2.tabs[0]!.tiles[2]!;
    const harvestDry = f.farm['farm.harvest'](2) as R<unknown>;
    results.push(
      check('гейт READY: время истекло без полива → остаётся growing; сбор — отказ', () =>
        dryTile.state === 'growing' && !harvestDry.ok && harvestDry.error.includes('собрать можно только готовое')),
    );
    // (b) полив: окно 8ч из данных, энергия −2
    const w = f.farm['farm.water'](2) as R<{ wateredUntil: number }>;
    const st1 = f.farm['farm.state']() as { tabs: Array<{ tiles: Array<{ index: number; state: string; wateredUntil?: number }> }> };
    const tile1 = st1.tabs[0]!.tiles[2]!;
    const spent = energySpentOf(f.events);
    results.push(
      check('полив: wateredUntil = now + 8ч (окно из данных), энергия −2', () =>
        w.ok && tile1.wateredUntil === FARM_T0 + FARM_TABLE.water.windowHours * HOUR_MS &&
        spent.some((s) => s.stat === 'action.farm.water.energyCost' && s.cost === 2)),
    );
    // (c) полив закрыл гейт → ленивый sweep переводит в ready + публикует переход
    const st3 = f.farm['farm.state']() as { tabs: Array<{ tiles: Array<{ index: number; state: string }> }> };
    const readyTile = st3.tabs[0]!.tiles[2]!;
    const growingToReady = f.events.filter(
      (e) => e.name === 'farm.tileChanged' && e.payload.from === 'growing' && e.payload.to === 'ready',
    );
    results.push(
      check('гейт READY: полив закрывает гейт → ленивый sweep переводит growing→ready + tileChanged', () =>
        readyTile.state === 'ready' && growingToReady.length === 1 &&
        JSON.stringify(growingToReady[0]!.payload) === JSON.stringify({ tab: 'field', tileIdx: 2, from: 'growing', to: 'ready' })),
    );
    f.dispose();
  }

  // ------------------------------------- 4. удобрение: пересчёт остатка, транзакция, повтор — отказ
  {
    const f = makeFarmGame();
    await f.game.init();
    (f.inv['inventory.acquire'] as unknown as (d: string, q: number, s: string) => R<unknown>)('seed_wheat', 1, 'selfcheck');
    f.game.wallet.grant('fertilizer', 2);
    f.farm['farm.plow'](3);
    f.farm['farm.plant']('wheat', 3);
    const before = f.farm['farm.state']() as { tabs: Array<{ tiles: Array<{ index: number; grownAt?: number }> }> };
    const grownBefore = before.tabs[0]!.tiles[3]!.grownAt!;
    const fert = f.farm['farm.fertilize'](3) as R<{ grownAt: number; prevGrownAt: number }>;
    const after = f.farm['farm.state']() as { tabs: Array<{ tiles: Array<{ index: number; grownAt?: number }> }> };
    const grownAfter = after.tabs[0]!.tiles[3]!.grownAt!;
    const expected = FARM_T0 + Math.round((grownBefore - FARM_T0) / 1.15); // remaining / (1 + 15%)
    const tx = f.events.filter((e) => e.name === 'wallet.transaction' && (e.payload as { eventId?: string }).eventId === 'farm.fertilize');
    const again = f.farm['farm.fertilize'](3) as R<unknown>;
    results.push(
      check('удобрение: остаток /(1+15%), валюта fertilizer — транзакцией farm.fertilize, повтор — отказ', () =>
        fert.ok && grownAfter === expected &&
        tx.length === 1 && JSON.stringify((tx[0]!.payload as { costs: unknown }).costs) === JSON.stringify([{ t: 'currency', id: 'fertilizer', qty: 1 }]) &&
        f.game.wallet.get('fertilizer') === 1 &&
        !again.ok && again.error.includes('уже удобрен'), {
        expected: `grownAt ${expected}, fertilizer 1, повтор отказ`,
        actual: `grownAt ${grownAfter}, fertilizer ${f.game.wallet.get('fertilizer')}`,
      }),
    );
    f.dispose();
  }

  // ------------------- 5. сбор: yields/качество/payload F4/XP; семя-нет/энергия-нет — отказы с откатом
  {
    const f = makeFarmGame();
    await f.game.init();
    (f.inv['inventory.acquire'] as unknown as (d: string, q: number, s: string) => R<unknown>)('seed_wheat', 1, 'selfcheck');
    f.farm['farm.plow'](4);
    f.farm['farm.plant']('wheat', 4);
    f.farm['farm.water'](4);
    f.farm['farm.grow'](4);
    const h = f.farm['farm.harvest'](4) as R<{ cropId: string; yields: Array<{ defId: string; qty: number; quality: { tier: string; value: number } }> }>;
    const acquired = f.events.filter((e) => e.name === 'item.acquired' && e.payload.source === 'farm.grown');
    const harvested = f.events.filter((e) => e.name === 'farm.cropHarvested');
    const xp = f.events.filter((e) => e.name === 'player.xpGained' && e.payload.source === 'farm.cropHarvested');
    const spent = energySpentOf(f.events);
    const st = f.farm['farm.state']() as { tabs: Array<{ tiles: Array<{ index: number; state: string }> }> };
    const y = h.ok ? h.value.yields[0]! : { defId: '', qty: 0, quality: { tier: '', value: -1 } };
    const inRange = y.qty >= WHEAT.yields[0]!.minQty && y.qty <= WHEAT.yields[0]!.maxQty;
    results.push(
      check('сбор: yields в диапазоне, качество {tier,value}, payload F4 байт-строгий, XP событийно, энергия −3, тайл → empty', () =>
        h.ok && inRange && y.defId === 'wheat_grain' && QUALITY_TIERS.includes(y.quality.tier as never) &&
        y.quality.value >= 0 && y.quality.value <= 100 &&
        acquired.length === 1 && acquired[0]!.payload.defId === 'wheat_grain' && Number(acquired[0]!.payload.qty) === y.qty &&
        harvested.length === 1 &&
        JSON.stringify(harvested[0]!.payload) === JSON.stringify({ defId: 'wheat_grain', qty: y.qty, quality: y.quality, tab: 'field' }) &&
        xp.length === 1 && Number(xp[0]!.payload.amount) === 5 &&
        spent.some((s) => s.stat === 'action.farm.harvest.energyCost' && s.cost === 3) &&
        st.tabs[0]!.tiles[4]!.state === 'empty', {
        expected: 'полный сборный цикл (payload/XP/энергия/empty)',
        actual: `yields ${JSON.stringify(y)}, events acquired=${acquired.length} harvested=${harvested.length} xp=${xp.length}`,
      }),
    );
    // посадка без семени: отказ, энергия не тронута, тайл цел
    f.farm['farm.plow'](5);
    const evBefore = f.events.length;
    const noSeed = f.farm['farm.plant']('wheat', 5) as R<unknown>;
    results.push(
      check('отказ: посадка без семени — причина, энергия не списана, тайл plowed цел', () =>
        !noSeed.ok && noSeed.error.includes('seed_wheat') && f.events.length === evBefore),
    );
    // [живая проба приёмки] посадка С семенем в НЕвспаханный (валидация
    // отказывает): семя ОБЯЗАНО остаться в инвентаре (порядок атомарности:
    // чистая валидация ДО изъятия — обратный порядок терял семя при отказе)
    const seeded = makeFarmGame();
    await seeded.game.init();
    (seeded.inv['inventory.acquire'] as unknown as (d: string, q: number, s: string) => R<unknown>)('seed_wheat', 3, 'selfcheck');
    const bad = seeded.farm['farm.plant']('wheat', 9) as R<unknown>;
    const seedsLeft = (seeded.inv['inventory.list'] as unknown as () => Array<{ defId: string; qty: number }>)()
      .filter((i) => i.defId === 'seed_wheat')
      .reduce((s, i) => s + i.qty, 0);
    results.push(
      check('отказ: посадка с семенем в невспаханный тайл — семя НЕ теряется (валидация до изъятия)', () =>
        !bad.ok && bad.error.includes('нужно вспаханное') && seedsLeft === 3, {
        expected: 'отказ + 3 семени целы',
        actual: `отказ=${String(!bad.ok)}, семян ${seedsLeft}`,
      }),
    );
    seeded.dispose();
    // сбор не-ready — отказ
    const notReady = f.farm['farm.harvest'](5) as R<unknown>;
    results.push(
      check('отказ: сбор не готового тайла — причина', () => !notReady.ok && notReady.error.includes('собрать можно только готовое')),
    );
    f.dispose();
  }

  // ------------------------------------------------ 6. гейты: культура закрыта уровнем / вкладкой
  {
    const f = makeFarmGame();
    await f.game.init();
    (f.inv['inventory.acquire'] as unknown as (d: string, q: number, s: string) => R<unknown>)('seed_sunflower', 1, 'selfcheck');
    (f.inv['inventory.acquire'] as unknown as (d: string, q: number, s: string) => R<unknown>)('seed_mushroom', 1, 'selfcheck');
    f.farm['farm.plow'](6);
    const sun = f.farm['farm.plant']('sunflower', 6) as R<unknown>;
    const mush = f.farm['farm.plant']('mushroom', 6) as R<unknown>;
    results.push(
      check('гейты: солнечник — уровень 25 (п5: «Откроется»), грибы — вкладка mushroom (M05.3)', () =>
        !sun.ok && sun.error.includes('Откроется: уровень 25') &&
        !mush.ok && mush.error.includes('не растёт на вкладке')),
    );
    // энергия 0 → вспашка отказ, состояние цело
    (f.player['player.setEnergy'] as unknown as (n: number) => unknown)(0);
    const plow6 = f.farm['farm.plow'](6) as R<unknown>;
    results.push(
      check('отказ: энергия 0 → вспашка не выполняется (Reason с причиной, состояние цело)', () =>
        !plow6.ok && plow6.error.includes('не хватает энергии')),
    );
    f.dispose();
  }

  return results;
}

export async function runFarmChecks(): Promise<CheckGroup> {
  const results: CheckResult[] = [];
  results.push(...(await runFarmFsmChecks()));
  results.push(...(await runFarmQualityChecks()));
  // [M05.2] часть 2 — часовые правила + TaskRegistry (расщепление 01 §6:
  // сорняки — farm-weeds-checks, сухость/catchUp/исполнители/манифест/сейв —
  // farm-hourly-checks)
  results.push(...(await runFarmWeedsChecks()));
  results.push(...(await runFarmHourlyChecks()));
  // [M05.3] часть 3 — вкладки/улучшения/качество/replantable/квесты
  // (расщепление 01 §6: вкладки — farm-upgrades-checks, эффекты —
  // farm-upgrades-effects-checks, качество — farm-quality3-checks,
  // replantable/квесты — farm-m053-checks)
  results.push(...(await runFarmUpgradesChecks()));
  results.push(...(await runFarmUpgradesEffectsChecks()));
  results.push(...(await runFarmQuality3Checks()));
  results.push(...(await runFarmM053Checks()));
  return group('M05 · Ферма (части 1–3)', results);
}
