/**
 * Self-checks M05.3 — часть 3а: вкладки улучшений (G1 брифа M05.3).
 * Оракулы руками: покупка (TransactionService, eventId farm.upgrade, гейты
 * уровней), посадка в своих вкладках (allowedTabs), теплица — скорость
 * оракулом (+20%) и «без сорняков» при форс-проходах (immuneTabKinds).
 */
import { check, type CheckResult } from './types';
import { FARM_T0, makeFarmGame, acquireFor, buyUpgrade, forceWeedsInTab, hourPass, levelPlayerTo, tileInTab, type R } from './farm-fixture';
import { CROPS } from '@/content/farm/crops';
import { growMsOf } from '@/game/modules/farm/logic/growth';

const HOUR = 3_600_000;

interface TabView {
  id: string;
  kind: string;
  tiles: Array<{ index: number; state: string; cropId?: string; grownAt?: number; wateredUntil?: number; weeds: number }>;
}
interface StateView {
  now: number;
  tabs: TabView[];
  upgrades: string[];
}

function stateOf(f: ReturnType<typeof makeFarmGame>): StateView {
  return f.farm['farm.state']() as StateView;
}

function tabOf(f: ReturnType<typeof makeFarmGame>, tabId: string): TabView | undefined {
  return stateOf(f).tabs.find((t) => t.id === tabId);
}

export async function runFarmUpgradesChecks(): Promise<CheckResult[]> {
  const results: CheckResult[] = [];
  const WHEAT = CROPS.find((c) => c.id === 'wheat')!;

  // ---------------------------------------- 14. вкладки ×3: покупка → тайлы/kind/кошелёк/повтор
  {
    const f = makeFarmGame();
    await f.game.init();
    levelPlayerTo(f, 25);
    f.game.wallet.grant('gold', 4000);
    const r1 = buyUpgrade(f, 'tab_mushroom');
    const r2 = buyUpgrade(f, 'tab_vineyard');
    const r3 = buyUpgrade(f, 'tab_greenhouse');
    const v = stateOf(f);
    const txs = f.events.filter((e) => e.name === 'wallet.transaction' && e.payload.eventId === 'farm.upgrade');
    const again = buyUpgrade(f, 'tab_mushroom');
    results.push(
      check('вкладки ×3: покупка (гейт ур. пройден) → вкладки mushroom/vineyard/greenhouse по 8 тайлов, upgrades-список, золото −3300 транзакциями farm.upgrade; повтор — отказ', () =>
        r1.ok && r2.ok && r3.ok &&
        v.tabs.length === 4 &&
        tabOf(f, 'mushroom')?.kind === 'mushroom' && tabOf(f, 'mushroom')?.tiles.length === 8 &&
        tabOf(f, 'vineyard')?.kind === 'vineyard' && tabOf(f, 'vineyard')?.tiles.length === 8 &&
        tabOf(f, 'greenhouse')?.kind === 'greenhouse' && tabOf(f, 'greenhouse')?.tiles.length === 8 &&
        JSON.stringify(v.upgrades) === JSON.stringify(['tab_mushroom', 'tab_vineyard', 'tab_greenhouse']) &&
        f.game.wallet.get('gold') === 750 && // 50 стартовых + 4000 − 3300
        txs.length === 3 && JSON.stringify(txs[0]!.payload.costs) === JSON.stringify([{ t: 'currency', id: 'gold', qty: 400 }]) &&
        !again.ok && again.error.includes('уже куплено'), {
        expected: '4 вкладки (8/8/8 тайлов), золото 750 (50 стартовых + 4000 − 3300), tx ×3, повтор отказ',
        actual: `вкладок ${v.tabs.length}, золото ${f.game.wallet.get('gold')}, tx ${txs.length}`,
      }),
    );
    f.dispose();
  }

  // ---------------------------------------- 15. гейты уровней покупок (fresh, ур.1)
  {
    const f = makeFarmGame();
    await f.game.init();
    f.game.wallet.grant('gold', 10000);
    const rs = ['tab_mushroom', 'tab_vineyard', 'tab_greenhouse', 'upg_fertility', 'upg_greenhouse_lux'].map((id) => buyUpgrade(f, id));
    results.push(
      check('гейты покупок: ур.1 → отказы поимённо с текстом замка (П6): вкладки 8/15/20, Плодородие 10, Парник-люкс 22', () =>
        rs.every((r) => !r.ok) &&
        rs[0]!.error.includes('Откроется: уровень 8') &&
        rs[1]!.error.includes('Откроется: уровень 15') &&
        rs[2]!.error.includes('Откроется: уровень 20') &&
        rs[3]!.error.includes('Откроется: уровень 10') &&
        rs[4]!.error.includes('Откроется: уровень 22') &&
        f.game.wallet.get('gold') === 10050, { // 50 стартовых + 10000, ничего не списано
        expected: '5 отказов, золото не тронуто',
        actual: rs.map((r) => (r.ok ? 'ok!' : r.error)).join(' | '),
      }),
    );
    f.dispose();
  }

  // ---------------------------------------- 16. посадка в своих вкладках + allowedTabs-гейт
  {
    const f = makeFarmGame();
    await f.game.init();
    levelPlayerTo(f, 25);
    f.game.wallet.grant('gold', 2000);
    buyUpgrade(f, 'tab_mushroom');
    acquireFor(f, 'seed_mushroom', 2);
    f.farm['farm.plow'](0, 'mushroom');
    f.farm['farm.plow'](1); // вспахан и в «Поле» — чтобы отказ был именно по вкладке
    const mush = f.farm['farm.plant']('mushroom', 0, 'mushroom') as R<unknown>;
    const wrongTab = f.farm['farm.plant']('mushroom', 1) as R<unknown>; // в «Поле» нельзя
    const t = tabOf(f, 'mushroom')?.tiles[0];
    results.push(
      check('посадка в своей вкладке: грибы в «Грибнице» растут (grownAt = +3ч при базе 100); в «Поле» — отказ allowedTabs', () =>
        mush.ok && t?.state === 'growing' && t?.cropId === 'mushroom' &&
        (t?.grownAt ?? 0) - FARM_T0 === growMsOf(CROPS.find((c) => c.id === 'mushroom')!, 100) &&
        !wrongTab.ok && wrongTab.error.includes('не растёт на вкладке'), {
        expected: 'growing в mushroom; отказ в field',
        actual: `${t?.state} ${t?.cropId}; field: ${wrongTab.ok ? 'ok!' : 'отказ'}`,
      }),
    );
    f.dispose();
  }

  // ---------------------------------------- 17. теплица: скорость оракулом (+20%)
  {
    const f = makeFarmGame();
    await f.game.init();
    levelPlayerTo(f, 25);
    f.game.wallet.grant('gold', 2000);
    buyUpgrade(f, 'tab_greenhouse');
    acquireFor(f, 'seed_wheat', 2);
    f.farm['farm.plow'](0, 'greenhouse');
    f.farm['farm.plow'](0); // то же в «Поле»
    const g1 = f.farm['farm.plant']('wheat', 0, 'greenhouse') as R<unknown>;
    const g2 = f.farm['farm.plant']('wheat', 0) as R<unknown>;
    const inGh = tabOf(f, 'greenhouse')?.tiles[0];
    const inField = tabOf(f, 'field')?.tiles[0];
    results.push(
      check('теплица: скорость +20% — пшеница 4ч → 3ч20м (growMsOf(wheat, 120)); в «Поле» — 4ч (100)', () =>
        g1.ok && g2.ok &&
        (inGh?.grownAt ?? 0) - FARM_T0 === growMsOf(WHEAT, 120) &&
        (inField?.grownAt ?? 0) - FARM_T0 === growMsOf(WHEAT, 100), {
        expected: `теплица ${growMsOf(WHEAT, 120)}, поле ${growMsOf(WHEAT, 100)}`,
        actual: `теплица ${(inGh?.grownAt ?? 0) - FARM_T0}, поле ${(inField?.grownAt ?? 0) - FARM_T0}`,
      }),
    );
    f.dispose();
  }

  // ---------------------------------------- 18. теплица: сорняков НЕТ при форс-проходах
  {
    const f = makeFarmGame();
    await f.game.init();
    levelPlayerTo(f, 25);
    f.game.wallet.grant('gold', 2000);
    buyUpgrade(f, 'tab_greenhouse');
    acquireFor(f, 'seed_wheat', 2);
    f.farm['farm.plow'](0, 'greenhouse');
    f.farm['farm.plow'](1);
    f.farm['farm.plant']('wheat', 0, 'greenhouse');
    f.farm['farm.plant']('wheat', 1);
    const stopGh = forceWeedsInTab(f, 'greenhouse', 0);
    const stopField = forceWeedsInTab(f, 'field', 1);
    hourPass(f, FARM_T0 + HOUR);
    stopGh();
    stopField();
    const gh = tileInTab(f, 'greenhouse', 0);
    const field = tileInTab(f, 'field', 1);
    results.push(
      check('теплица без сорняков: форс-шанс 100% на оба тайла + часовой проход → «Поле» заросло (weeds 1), тепличный — чист (immuneTabKinds)', () =>
        gh.weeds === 0 && field.weeds === 1, {
        expected: 'теплица 0, поле 1',
        actual: `теплица ${gh.weeds}, поле ${field.weeds}`,
      }),
    );
    f.dispose();
  }

  return results;
}
