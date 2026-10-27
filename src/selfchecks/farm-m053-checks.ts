/**
 * Self-checks M05.3 — часть 3г: replantable (G5) + квест-интеграция (G6).
 * Клубника — 3 сбора подряд (тайл снова READY, семя не тратится); виноград —
 * окно плодоношения 7 дней (первый сбор открывает, регроу 24ч в окне, после
 * закрытия — EMPTY); счётчики farm.* живым каналом; квест «Жатва» (донор с
 * дневным набором — детерминизм, прогресс только живыми сборами); ачивка
 * «Агроном» (100 сборов событиями → флаг → гейт солнечника); roundtrip
 * новых полей байт-в-байт + ленивые дефолты доноров.
 */
import { check, type CheckResult } from './types';
import { MemoryStorage } from '@/kernel/save/storage-drivers';
import { FARM_T0, makeFarmGame, acquireFor, buyUpgrade, levelPlayerTo, tileInTab, type R } from './farm-fixture';
import { DAILY_QUESTS } from '@/content/quests/daily';
import { ACHIEVEMENTS } from '@/content/quests/achievements';

const HOUR = 3_600_000;
const DAY = 86_400_000;

const seedCount = (f: ReturnType<typeof makeFarmGame>, defId: string): number =>
  ((f.inv['inventory.list'] as unknown as () => Array<{ defId: string; qty: number }>)())
    .filter((i) => i.defId === defId).reduce((s, i) => s + i.qty, 0);

export async function runFarmM053Checks(): Promise<CheckResult[]> {
  const results: CheckResult[] = [];

  // ---------------------------------------- 29. клубника: 3 сбора подряд
  {
    const f = makeFarmGame();
    await f.game.init();
    acquireFor(f, 'seed_strawberry', 1);
    f.farm['farm.plow'](0);
    f.farm['farm.plant']('strawberry', 0);
    f.farm['farm.water'](0);
    f.farm['farm.grow'](0);
    const seedsBefore = seedCount(f, 'seed_strawberry'); // 0 — семя изъято посадкой
    const h1 = f.farm['farm.harvest'](0) as R<{ aftermath: string; harvestsLeft?: number }>;
    const t1 = tileInTab(f, 'field', 0);
    const h2 = f.farm['farm.harvest'](0) as R<{ aftermath: string; harvestsLeft?: number }>;
    const h3 = f.farm['farm.harvest'](0) as R<{ aftermath: string }>;
    const t3 = tileInTab(f, 'field', 0);
    results.push(
      check('клубника replantable: 3 сбора ПОДРЯД — тайл снова READY (harvestsLeft 2 → 1), семя НЕ тратится, после 3-го — EMPTY', () =>
        h1.ok && h1.value.aftermath === 'again' && h1.value.harvestsLeft === 2 && t1.state === 'ready' && t1.cropId === 'strawberry' &&
        h2.ok && h2.value.aftermath === 'again' && h2.value.harvestsLeft === 1 &&
        h3.ok && h3.value.aftermath === 'empty' && t3.state === 'empty' && t3.cropId === undefined &&
        seedCount(f, 'seed_strawberry') === seedsBefore, {
        expected: 'again(2) → again(1) → empty; семя цело',
        actual: `${h1.ok ? h1.value.aftermath : 'err'} → ${h2.ok ? String(h2.value.aftermath) : 'err'} → ${h3.ok ? h3.value.aftermath : 'err'}; тайл ${t3.state}`,
      }),
    );
    f.dispose();
  }

  // ---------------------------------------- 30. виноград: окно 7 дней + регроу 24ч
  {
    const f = makeFarmGame();
    await f.game.init();
    levelPlayerTo(f, 25);
    f.game.wallet.grant('gold', 1000);
    buyUpgrade(f, 'tab_vineyard');
    acquireFor(f, 'seed_grape', 1);
    f.farm['farm.plow'](0, 'vineyard');
    f.farm['farm.plant']('grape', 0, 'vineyard');
    f.farm['farm.water'](0, 'vineyard');
    f.farm['farm.grow'](0, 'vineyard');
    const h1 = f.farm['farm.harvest'](0, 'vineyard') as R<{ aftermath: string; fruitingUntil?: number }>;
    const t1 = tileInTab(f, 'vineyard', 0);
    (f.clock as unknown as { advance(ms: number): void }).advance(24 * HOUR); // регроу 24ч
    f.farm['farm.water'](0, 'vineyard');
    const h2 = f.farm['farm.harvest'](0, 'vineyard') as R<{ aftermath: string; fruitingUntil?: number }>;
    // окно почти закрыто: суммарно 6д23ч от первого сбора — регроу уже не влезет
    (f.clock as unknown as { advance(ms: number): void }).advance(6 * DAY + 23 * HOUR - 24 * HOUR);
    f.farm['farm.water'](0, 'vineyard');
    f.farm['farm.grow'](0, 'vineyard');
    const h3 = f.farm['farm.harvest'](0, 'vineyard') as R<{ aftermath: string }>;
    const t3 = tileInTab(f, 'vineyard', 0);
    results.push(
      check('виноград replantable: первый сбор открывает окно 7д (fruitingUntil = now + 7д); регроу 24ч в окне (2-й сбор жив); после закрытия окна — EMPTY', () =>
        h1.ok && h1.value.aftermath === 'regrow' && h1.value.fruitingUntil === FARM_T0 + 7 * DAY &&
        t1.state === 'growing' && t1.grownAt === FARM_T0 + 24 * HOUR && t1.plantedAt === FARM_T0 &&
        h2.ok && h2.value.aftermath === 'regrow' && h2.value.fruitingUntil === FARM_T0 + 7 * DAY &&
        h3.ok && h3.value.aftermath === 'empty' && t3.state === 'empty', {
        expected: `regrow(окно ${FARM_T0 + 7 * DAY}) → regrow → empty`,
        actual: `${h1.ok ? h1.value.aftermath : 'err'} → ${h2.ok ? h2.value.aftermath : 'err'} → ${h3.ok ? h3.value.aftermath : 'err'}; тайл ${t3.state}`,
      }),
    );
    f.dispose();
  }

  // ---------------------------------------- 31. счётчики farm.* (живой канал событий)
  {
    const f = makeFarmGame();
    await f.game.init();
    acquireFor(f, 'seed_wheat', 2);
    f.farm['farm.plow'](0);
    f.farm['farm.plant']('wheat', 0);
    f.farm['farm.water'](0);
    f.farm['farm.grow'](0);
    const h1 = f.farm['farm.harvest'](0) as R<{ yields: Array<{ qty: number }> }>;
    f.farm['farm.plow'](1);
    f.farm['farm.plant']('wheat', 1);
    f.farm['farm.water'](1);
    f.farm['farm.grow'](1);
    const h2 = f.farm['farm.harvest'](1) as R<{ yields: Array<{ qty: number }> }>;
    const units = f.game.stats.get('farm.harvest.units');
    const batches = f.game.stats.get('farm.harvest.batches');
    const expectUnits = (h1.ok ? h1.value.yields[0]!.qty : 0) + (h2.ok ? h2.value.yields[0]!.qty : 0);
    results.push(
      check('счётчики farm.*: 2 живых сбора → units = Σqty, batches = 2 (конфиг данными, код не писался)', () =>
        units === expectUnits && batches === 2 && expectUnits >= 4, {
        expected: `units ${expectUnits}, batches 2`,
        actual: `units ${units}, batches ${batches}`,
      }),
    );
    f.dispose();
  }

  // ---------------------------------------- 32. квест-шаблон: пул 32 + прогресс до выполнения
  {
    // детерминированный ролл: донор с quests-срезом, где qd_harvest_day уже
    // в дневном наборе (прецедент крафта срезов — quests-live-checks §13;
    // прогресс — ТОЛЬКО живыми сборами, подмена не используется)
    const storage = new MemoryStorage();
    await storage.set(
      'main',
      JSON.stringify({
        saveVersion: 10,
        savedAt: FARM_T0,
        saveId: 'm053-qd-harvest',
        contentVersion: '0.1.0-phase0',
        lastSeen: FARM_T0,
        modules: {
          quests: {
            v: 1,
            daily: { key: '2024-01-01', ids: ['qd_harvest_day'], baseline: {}, rerollUsed: false, completed: [], claimed: [], progress: {}, steps: {} },
            weekly: { key: '', ids: [], baseline: {}, rerollUsed: false, completed: [], claimed: [], progress: {}, steps: {} },
            chains: { step: {}, granted: [], progress: {} },
            achievements: { unlocked: [], claimed: [] },
            flags: [],
          },
        },
      }),
    );
    const f = makeFarmGame(storage);
    await f.game.init();
    acquireFor(f, 'seed_wheat', 16);
    let harvested = 0;
    for (let i = 0; i < 15 && f.game.stats.get('farm.harvest.units') < 20; i++) {
      f.farm['farm.plow'](i);
      f.farm['farm.plant']('wheat', i);
      f.farm['farm.water'](i);
      f.farm['farm.grow'](i);
      const h = f.farm['farm.harvest'](i) as R<{ yields: Array<{ qty: number }> }>;
      if (h.ok) harvested += h.value.yields[0]!.qty;
    }
    const daily = (f.game.modules.get('quests')?.api['quests.list'] as unknown as (t: string) => Array<{ id: string; completed: boolean }>)('daily');
    const rows = daily ?? [];
    results.push(
      check('квест «Жатва»: пул daily 32 (31→32, qd_harvest_day данными); живые сборы до ≥20 единиц → квест выполнен (счётчик → доступность)', () =>
        DAILY_QUESTS.length === 32 && DAILY_QUESTS.some((q) => q.id === 'qd_harvest_day') &&
        f.game.stats.get('farm.harvest.units') >= 20 && harvested >= 20 &&
        rows.some((q) => q.id === 'qd_harvest_day' && q.completed === true), {
        expected: `пул 32, units ≥ 20, qd_harvest_day completed`,
        actual: `пул ${DAILY_QUESTS.length}, units ${f.game.stats.get('farm.harvest.units')}, completed ${String(rows.find((q) => q.id === 'qd_harvest_day')?.completed)}`,
      }),
    );
    f.dispose();
  }

  // ---------------------------------------- 33. ачивка «Агроном» → флаг → гейт солнечника
  {
    const f = makeFarmGame();
    await f.game.init();
    levelPlayerTo(f, 25);
    acquireFor(f, 'seed_sunflower', 1);
    f.farm['farm.plow'](0);
    const noAch = f.farm['farm.plant']('sunflower', 0) as R<unknown>;
    // 100 сборов по событийному каналу (payload F4 — как живой сбор) → ачивка
    for (let i = 0; i < 100; i++) {
      f.game.bus.publish('farm.cropHarvested', { defId: 'wheat_grain', qty: 2, quality: { tier: 'D', value: 1 }, tab: 'field' });
    }
    const achs = (f.game.modules.get('quests')?.api['quests.list'] as unknown as (t: string) => Array<{ id: string; unlocked: boolean }>)('ach');
    const flags = (f.game.modules.get('quests')?.api['quests.flags'] as unknown as () => string[])();
    const withAch = f.farm['farm.plant']('sunflower', 0) as R<unknown>;
    const sunTile = tileInTab(f, 'field', 0);
    results.push(
      check('ачивка «Агроном»: 100 сборов (события) → unlocked + флаг ach.farm.agronomist; гейт солнечника = уровень 25 И ачивка (без — отказ «+ ачивка», с — посадка жива)', () =>
        !noAch.ok && noAch.error.includes('Откроется: уровень 25 + ачивка ach_agronomist') &&
        (achs ?? []).some((a) => a.id === 'ach_agronomist' && a.unlocked === true) &&
        flags.includes('ach.farm.agronomist') &&
        ACHIEVEMENTS.some((a) => a.id === 'ach_agronomist' && (a.unlockFlags ?? []).includes('ach.farm.agronomist')) &&
        withAch.ok && sunTile.state === 'growing' && sunTile.cropId === 'sunflower', {
        expected: 'отказ → 100 событий → unlocked/флаг → посадка ок',
        actual: `без ачивки: ${noAch.ok ? 'ok!' : 'отказ'}; с ачивкой: ${withAch.ok ? 'ok' : 'отказ'}`,
      }),
    );
    f.dispose();
  }

  // ---------------------------------------- 34. roundtrip новых полей + ленивые дефолты
  {
    const storage = new MemoryStorage();
    const f = makeFarmGame(storage);
    await f.game.init();
    levelPlayerTo(f, 25);
    f.game.wallet.grant('gold', 8000);
    buyUpgrade(f, 'tab_greenhouse');
    buyUpgrade(f, 'tab_vineyard');
    buyUpgrade(f, 'upg_sprinklers');
    buyUpgrade(f, 'upg_greenhouse_lux');
    acquireFor(f, 'seed_strawberry', 1);
    f.farm['farm.plow'](0, 'greenhouse');
    f.farm['farm.plant']('strawberry', 0, 'greenhouse');
    f.farm['farm.water'](0, 'greenhouse');
    f.farm['farm.grow'](0, 'greenhouse');
    f.farm['farm.harvest'](0, 'greenhouse'); // harvestsLeft 2 (клубника — fruitingUntil нет)
    acquireFor(f, 'seed_grape', 1);
    f.farm['farm.plow'](0, 'vineyard'); // виноград — только своя вкладка
    f.farm['farm.plant']('grape', 0, 'vineyard');
    f.farm['farm.water'](0, 'vineyard');
    f.farm['farm.grow'](0, 'vineyard');
    f.farm['farm.harvest'](0, 'vineyard'); // fruitingUntil поставлен
    const before = f.game.save.exportJson();
    const f2 = makeFarmGame();
    await f2.game.save.importJson(before);
    const gh2 = tileInTab(f2, 'greenhouse', 0);
    const gp2 = tileInTab(f2, 'vineyard', 0);
    const v2 = f2.farm['farm.state']() as { upgrades: string[]; tabs: Array<{ id: string }> };
    const donor = JSON.parse(before) as { modules: { farm: Record<string, unknown> } };
    delete donor.modules.farm.upgrades; // v10-донор без новых полей → ленивые дефолты
    delete donor.modules.farm.sprinklerAt;
    const f3 = makeFarmGame();
    await f3.game.save.importJson(JSON.stringify(donor));
    const v3 = f3.farm['farm.state']() as { upgrades: string[]; tabs: Array<{ id: string }> };
    results.push(
      check('roundtrip новых полей: upgrades/sprinklerAt/harvestsLeft/fruitingUntil байт-в-байт (v10-донор → v12); донор без полей → ленивые дефолты upgrades=[]', () => // [M06.1 · v11 → M07.1 · v12] поля фермы по-прежнему БЕЗ bump
        f2.game.save.info().saveVersion === 15 && // [M11 · v14 → M12.1 · v15]
        JSON.stringify(v2.upgrades) === JSON.stringify(['tab_greenhouse', 'tab_vineyard', 'upg_sprinklers', 'upg_greenhouse_lux']) &&
        JSON.stringify((JSON.parse(before).modules.farm as { upgrades: string[] }).upgrades) === JSON.stringify(v2.upgrades) &&
        gh2.harvestsLeft === 2 && gh2.state === 'ready' &&
        gp2.fruitingUntil !== undefined && gp2.state === 'growing' &&
        JSON.stringify(v3.upgrades) === JSON.stringify([]) && v3.tabs.length === 3, {
        expected: 'поля живы байт-в-байт; донор → []',
        actual: `upgrades ${JSON.stringify(v2.upgrades)}; gh ${gh2.harvestsLeft}; gp ${String(gp2.fruitingUntil !== undefined)}; донор ${JSON.stringify(v3.upgrades)}`,
      }),
    );
    f.dispose();
    f2.dispose();
    f3.dispose();
  }

  return results;
}
