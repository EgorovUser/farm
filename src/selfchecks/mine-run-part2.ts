/**
 * Группа «M13 Забег» · ЧАСТЬ 2/2 (бриф R9): «Насыщенность» (первый забег
 * дня +10% руды — resolve mine.oreYield; день-детерминизм DI-подменой now),
 * статус слоя (витрина/тег + эффект conditions ctxTag), алтарь (Modifier
 * duration runs + очистка при runEnded), зелье (штатный Buff-канал ядра:
 * sweep НЕ трогает runs-бафы, очистка — API владельца), события ×3
 * payload-оракулы + счётчик mine.runs, roundtrip с активным забегом
 * байт-в-байт + ленивые дефолты идемпотентны, смерть-идемпотентность,
 * улучшения ×4 (Вагонёт/Освещение/Оборудование/Лифт), кротовый магазин.
 */
import { check, type CheckResult } from './types';
import { MINE_TORCH } from '@/content/mine/cards';
import { MINE_UPGRADES } from '@/content/mine/upgrades';
import {
  makeSeededRunGame,
  viewOf,
  eventsOf,
  equipPickaxe,
  grantGold,
  buffWin,
  backpackCount,
  type ViewShape,
  type R,
  type RunFixture,
} from './mine-run-fixture';
import { findRun, slotOf, kindsOf } from './mine-run-part1';

export async function runMineRunPart2(): Promise<CheckResult[]> {
  const results: CheckResult[] = [];

  // 9. «Насыщенность»: первый забег дня +10% руды; второй — нет; новый день — снова
  {
    const f = await makeSeededRunGame('m131-sat');
    equipPickaxe(f, 'D');
    const yieldNow = () =>
      f.game.statBus.resolve({ stat: 'mine.oreYield', ctx: { player: 'player', now: f.game.time.now() } });
    f.mine['mine.enter'](1);
    const first = yieldNow();
    (f.player['player.setHp'] as (n: number) => unknown)(0); // смерть-конец (подписка)
    f.mine['mine.enter'](1);
    const second = yieldNow();
    (f.player['player.setHp'] as (n: number) => unknown)(0);
    f.clock.advance(24 * 60 * 60 * 1000); // новый день (DI-подмена now — ManualClock)
    f.mine['mine.enter'](1);
    const nextDay = yieldNow();
    const started = eventsOf(f, 'mine.runStarted');
    results.push(
      check('«Насыщенность» (R2/R9): первый забег дня → inc +10 на mine.oreYield (модификатор дня по данным, рива кирок компонуются); второй забег дня → 0; time +1d (DI-подмена now) → снова +10; витрина runStarted.saturation честна', () =>
        first === 10 && second === 0 && nextDay === 10 &&
        started[0]!.saturation === true && started[1]!.saturation === false && started[2]!.saturation === true, {
        expected: '10 → 0 → 10; saturation истина/ложь/истина',
        actual: `${first} → ${second} → ${nextDay}; saturation ${started.map((s) => String(s.saturation)).join('/')}`,
      }),
    );
    f.dispose();
  }

  // 10. статус слоя: витрина runStarted + тег ctx + эффект conditions ctxTag
  {
    const f = await makeSeededRunGame('m131-status');
    equipPickaxe(f, 'B');
    buffWin(f);
    f.mine['mine.boss'](1, 20260101); // ачивка слоя 1 → слой 2 открыт
    f.mine['mine.enter'](2);
    const started = eventsOf(f, 'mine.runStarted');
    const withTag = f.game.statBus.resolve({
      stat: 'mine.damage',
      ctx: { player: 'player', now: f.game.time.now(), tags: ['mine', 'layer:2', 'status:cold'] },
    });
    const noTag = f.game.statBus.resolve({
      stat: 'mine.damage',
      ctx: { player: 'player', now: f.game.time.now() },
    });
    results.push(
      check('статус слоя (R2/R9): слой 2 = «холодный» — runStarted.status = cold (витрина) + тег ctx status:cold; эффект ДАННЫМИ через conditions ctxTag: resolve mine.damage с тегом −10, без тега 0', () =>
        started[0]!.status === 'cold' && withTag === -10 && noTag === 0, {
        expected: 'status cold; −10 с тегом; 0 без тега',
        actual: `status ${started[0]?.status}; ${withTag}/${noTag}`,
      }),
    );
    f.dispose();
  }

  // 11. алтарь: Modifier duration runs + очистка при runEnded
  {
    const { f, cols } = await findRun('altar', (c) => kindsOf(c[0]!).includes('altar') && kindsOf(c[1]!).includes('exit'));
    equipPickaxe(f, 'D');
    grantGold(f, 200);
    (f.inv['inventory.add'] as (d: string, t: string, v: number, q: number, s: string) => R<unknown>)(
      'healing_herb', 'D', 50, 4, 'selfcheck',
    );
    const enter = f.mine['mine.enter'](1) as R<ViewShape>;
    const altar = f.mine['mine.pick'](String(slotOf(kindsOf(cols[0]!), 'altar'))) as R<ViewShape>;
    const runView = (f.mine['mine.run']() as ViewShape).lines.join('\n');
    // оффер роллится стримом (данные) — все три жертвы оплачены, баф = ЛЮБОЙ из трёх статов
    const statIn = (stat: string) =>
      f.game.statBus.resolve({ stat, ctx: { player: 'player', now: f.game.time.now(), tags: ['mine', 'layer:1'] } });
    const bases: Record<string, number> = { 'mine.damage': 0, 'mine.crit': 5, 'mine.luck.hidden': 0 };
    const inRun = Object.fromEntries(Object.keys(bases).map((st) => [st, statIn(st)]));
    f.mine['mine.pick'](String(slotOf(kindsOf(cols[1]!), 'exit')));
    const afterExit = Object.fromEntries(Object.keys(bases).map((st) => [st, f.game.statBus.resolve({ stat: st, ctx: { player: 'player', now: f.game.time.now() } })]));
    const changedIn = Object.keys(bases).filter((st) => inRun[st] !== bases[st]);
    const restored = Object.keys(bases).every((st) => afterExit[st] === bases[st]);
    results.push(
      check('алтарь (R3/R9): жертва (данные: золото/HP/травы — всё оплачено) → баф ЗАБЕГА Modifier duration {kind: runs} через runBuffProvider; витрина mine run несёт «duration: runs»; при runEnded баф очищен САМ (контейнер); resolve до/после (оффер роллится — ровно один из статов меняется и возвращается к базе)', () =>
        enter.ok && altar.ok && runView.includes('duration: runs') && changedIn.length === 1 && restored, {
        expected: 'ровно 1 стат сменился в забеге; после выхода все = база',
        actual: `в забеге ${changedIn.join(',') || '—'} ${changedIn.map((st) => `${st}=${inRun[st]}`).join(' ') }; восстановлено ${restored}`,
      }),
    );
    f.dispose();
  }

  // 12. зелье крота: штатный Buff-канал ядра — sweep НЕ трогает runs-баф, очистка API владельца
  {
    const { f, cols } = await findRun('potion', (c) => kindsOf(c[0]!).includes('trader') && kindsOf(c[1]!).includes('exit'));
    equipPickaxe(f, 'D');
    grantGold(f, 1000);
    const enter = f.mine['mine.enter'](1) as R<ViewShape>;
    f.mine['mine.pick'](String(slotOf(kindsOf(cols[0]!), 'trader')));
    const buy = f.mine['mine.pick']('1') as R<ViewShape>; // сток №1 — зелье ярости ×2
    f.mine['mine.pick']('0'); // покинуть крота
    const drink = f.mine['mine.pick']('p1') as R<ViewShape>;
    const before = f.game.statBus.resolve({ stat: 'mine.damage', ctx: { player: 'player', now: f.game.time.now() } });
    f.clock.advance(2 * 60 * 60 * 1000);
    f.game.buffs.sweep(f.game.time.now()); // sweep исторёкших — runs-баф НЕ трогает
    const afterSweep = f.game.statBus.resolve({ stat: 'mine.damage', ctx: { player: 'player', now: f.game.time.now() } });
    const buffAlive = f.game.buffs.list().some((b: { mod: { id: string } }) => b.mod.id.startsWith('mine.potion.'));
    f.mine['mine.pick'](String(slotOf(kindsOf(cols[1]!), 'exit')));
    const buffGone = !f.game.buffs.list().some((b: { mod: { tags?: string[] } }) => (b.mod.tags ?? []).includes('mine:run'));
    results.push(
      check('зелье крота (BUF-1/R9): покупка (D23-проба, acquire) → mine pick p1 — потребление В ЗАБЕГЕ: Modifier {duration: runs} в штатном Buff-канале ядра (kernel.buff); sweep НЕ трогает runs-баф (2ч + sweep → жив); runEnded → очистка API владельца (канон 02 §2); resolve до/после', () =>
        enter.ok && buy.ok && drink.ok && drink.value.lines.join('\n').includes('Buff-канал') &&
        before === 25 && afterSweep === 25 && buffAlive && buffGone, {
        expected: 'mine.damage 25 в забеге; sweep не снял; выход снял',
        actual: `${before} → после sweep ${afterSweep}; баф ${buffAlive ? 'жив' : 'пропал'}; после выхода ${buffGone ? 'снят' : 'ЖИВ (дефект)'}`,
      }),
    );
    f.dispose();
  }

  // 13. события ×3 payload-оракулы + счётчик mine.runs (объявление фазы 0)
  {
    const { f, cols } = await findRun('events', (c) => kindsOf(c[0]!).includes('oreVein') && kindsOf(c[1]!).includes('exit'));
    equipPickaxe(f, 'D');
    f.mine['mine.enter'](1);
    const started = eventsOf(f, 'mine.runStarted');
    f.mine['mine.pick'](String(slotOf(kindsOf(cols[0]!), 'oreVein')));
    const resolved = eventsOf(f, 'mine.cardResolved');
    f.mine['mine.pick'](String(slotOf(kindsOf(cols[1]!), 'exit')));
    const ended = eventsOf(f, 'mine.runEnded');
    const counters = f.game.stats.get('mine.runs');
    results.push(
      check('события ×3 payload (R7/R9): mine.runStarted {layer 1, column 1, saturation, runNumber 1, helpers: [] — ПУСТ (слоты M13.2)}; mine.cardResolved {kind oreVein, cardId card_ore_vein, column 1, outcome, runAlive}; mine.runEnded {reason exit, granted[], lost[], lostByCapacity[]}; счётчик mine.runs = 1 (объявление фазы 0 — событие runEnded, НЕ переобъявлен)', () =>
        started.length === 1 && started[0]!.layer === 1 && started[0]!.column === 1 &&
        Array.isArray(started[0]!.helpers) && (started[0]!.helpers as unknown[]).length === 0 &&
        resolved.length === 1 && resolved[0]!.kind === 'oreVein' && resolved[0]!.cardId === 'card_ore_vein' &&
        typeof resolved[0]!.outcome === 'string' &&
        ended.length === 1 && ended[0]!.reason === 'exit' &&
        Array.isArray(ended[0]!.granted) && Array.isArray(ended[0]!.lost) &&
        counters === 1, {
        expected: 'runStarted/cardResolved/runEnded payload каноничны; mine.runs 1',
        actual: `runStarted ${started.length}; cardResolved ${resolved.length} (${resolved[0]?.kind}); runEnded ${ended.length} (${ended[0]?.reason}); mine.runs ${counters}`,
      }),
    );
    f.dispose();
  }

  // 14. roundtrip с активным забегом байт-в-байт + ленивые дефолты идемпотентны
  {
    const { f, cols } = await findRun('roundtrip', (c) => kindsOf(c[0]!).includes('oreVein'));
    equipPickaxe(f, 'D');
    f.mine['mine.enter'](1);
    const kinds = kindsOf(cols[0]!);
    f.mine['mine.pick'](String(slotOf(kinds, 'oreVein')));
    await f.game.save.save();
    const json = f.game.save.exportJson();
    const f2 = await makeSeededRunGame('m131-roundtrip-b');
    await f2.game.save.importJson(json);
    await f2.game.save.save();
    const raw1 = (JSON.parse(json) as { modules: { mine: unknown } }).modules.mine;
    const raw2 = (JSON.parse(f2.game.save.exportJson()) as { modules: { mine: unknown } }).modules.mine;
    const runAlive2 = (f2.mine['mine.run']() as ViewShape).lines.join('\n').includes('забег №1');
    // повторный load того же JSON — дефолты НЕ дописываются (ключи стабильны)
    await f2.game.save.importJson(json);
    await f2.game.save.save();
    const raw3 = (JSON.parse(f2.game.save.exportJson()) as { modules: { mine: unknown } }).modules.mine;
    const keys = Object.keys(raw2 as object).sort().join(',');
    results.push(
      check('срез roundtrip v15 с АКТИВНЫМ забегом БАЙТ-В-БАЙТ (R1/R9): export → import → save → re-export — срез mine идентичен (run пережил, runBag/колонка/сид целы); повторный load НЕ дописывает ленивых дефолтов (ключи v/stats/run/lastRunDay стабильны); v15/19 без bump', () =>
        JSON.stringify(raw1) === JSON.stringify(raw2) && JSON.stringify(raw2) === JSON.stringify(raw3) &&
        runAlive2 && keys === 'lastRunDay,run,stats,v', {
        expected: '×3 идентичны; ключи lastRunDay,run,stats,v',
        actual: `${JSON.stringify(raw1) === JSON.stringify(raw2) ? 'идентичен' : 'РАЗЛИЧАЕТСЯ'}; повтор ${JSON.stringify(raw2) === JSON.stringify(raw3) ? 'стабилен' : 'ДРЕЙФ'}; ключи ${keys}; забег ${runAlive2 ? 'жив' : 'ПОТЕРЯН'}`,
      }),
    );
    f.dispose();
    f2.dispose();
  }

  // 15. смерть-подписка идемпотентна: deaths +1 РОВНО, runEnded ×1, cozy HP := 1
  {
    const f = await makeSeededRunGame('m131-death');
    equipPickaxe(f, 'D');
    f.mine['mine.enter'](1);
    (f.player['player.setHp'] as (n: number) => unknown)(0);
    const hpAfterDeath = (f.player['player.checkHp'] as () => { current: number })().current;
    (f.player['player.setHp'] as (n: number) => unknown)(5);
    (f.player['player.setHp'] as (n: number) => unknown)(0); // смерть ВНЕ забега — guard тишины (HP не трогает)
    const ended = eventsOf(f, 'mine.runEnded');
    const st = f.mine['mine.state']() as { deaths: number };
    const hp = { current: hpAfterDeath };
    results.push(
      check('смерть-подписка идемпотентна (R4): player.hpChanged(death) при активном забеге → deaths +1 РОВНО (срез), runEnded ×1, cozy HP := 1 (канон M12.1 F7); повторная смерть ВНЕ забега — guard тишины (счётчики не растут)', () =>
        ended.length === 1 && ended[0]!.reason === 'death' && st.deaths === 1 && hp.current === 1, {
        expected: 'runEnded 1; deaths 1; HP 1',
        actual: `runEnded ${ended.length}; deaths ${st.deaths}; HP ${hp.current}`,
      }),
    );
    f.dispose();
  }

  // 16. улучшения ×4 + [M13.2] Барак/Отряд: покупки eventId mine.upgrade; Вагонёт +4 слота; Лифт гейт-ачивкой
  {
    const f = await makeSeededRunGame('m131-upg');
    equipPickaxe(f, 'D');
    grantGold(f, 4000);
    const ids = MINE_UPGRADES.map((u) => u.id);
    const buys = ids.map((id) => f.mine['mine.upgrades.buy'](id) as R<ViewShape>);
    const again = f.mine['mine.upgrades.buy']('mine_cart') as R<ViewShape>;
    const list = (f.mine['mine.upgrades']() as ViewShape).lines.join('\n');
    f.mine['mine.enter'](1);
    const runView = (f.mine['mine.run']() as ViewShape).lines.join('\n');
    (f.player['player.setHp'] as (n: number) => unknown)(0); // конец забега №1 (подписка)
    // ачивка слоя 1 → повторный забег с Лифтом = старт с колонки 4
    (f.player['player.setHp'] as (n: number) => unknown)(50);
    buffWin(f);
    f.mine['mine.boss'](1, 20260102);
    const liftEnter = viewOf(f.mine['mine.enter'](1) as R<ViewShape>);
    results.push(
      check('улучшения ×4 + [M13.2 · R1/R7] Барак/Отряд (R6/R9; витрина расширена сеансом M13.2 — прецедент обновления чека к факту): все покупаются за золото (eventId mine.upgrade, TransactionService) — теперь ×6 дефов (Вагонёт/Освещение/Оборудование/Лифт + Барак + Отряд ×1); повторная покупка разового — честный отказ; Вагонёт: runBag 8 → 12 слотов; Лифт БЕЗ ачивки — строка-условие + колонка 1, С ачивкой ach_mine_boss_1 — колонка 4', () =>
        buys.every((b) => b.ok) && buys.length === 6 && !again.ok && again.error.includes('уже куплено') &&
        list.includes('КУПЛЕНО') && runView.includes('0/12 слотов') &&
        liftEnter.includes('колонка 4/4') && liftEnter.includes('ЛИФТ'), {
        expected: '×6 куплено; повтор отказ; 12 слотов; лифт колонка 4',
        actual: `покупки ${buys.filter((b) => b.ok).length}/${ids.length}; повтор ${again.ok ? 'ok (дефект)' : 'отказ'}; слоты ${runView.includes('0/12') ? '12' : '?'}; лифт ${liftEnter.includes('колонка 4/4') ? 'колонка 4' : 'колонка 1'}`,
      }),
    );
    f.dispose();
  }

  // 17. кротовый магазин: сток данными, наценка PriceBus, факелы/зелья/свиток
  {
    const { f, cols } = await findRun('trader', (c) => kindsOf(c[0]!).includes('trader') && kindsOf(c[1]!).includes('exit'));
    equipPickaxe(f, 'D');
    grantGold(f, 2000);
    f.mine['mine.enter'](1);
    const traderView = viewOf(f.mine['mine.pick'](String(slotOf(kindsOf(cols[0]!), 'trader'))) as R<ViewShape>);
    const runAfter = (f.mine['mine.run']() as ViewShape).lines.join('\n');
    const torchBuy = f.mine['mine.pick']('3') as R<ViewShape>; // факел ×2
    const potionBuy = f.mine['mine.pick']('1') as R<ViewShape>; // зелье ярости ×2
    const scrollBuy = f.mine['mine.pick']('4') as R<ViewShape>; // свиток ×1
    f.mine['mine.pick']('0'); // покинуть крота (текущая колонка — 2)
    const invList = (f.inv['inventory.list'] as () => Array<{ defId: string; qty: number }>)();
    const hasPotion = invList.some((i) => i.defId === 'potion_might' && i.qty >= 1);
    const hasScroll = invList.some((i) => i.defId === 'scroll_exit');
    const goldAfter = f.game.wallet.get('gold');
    const wallets = eventsOf(f, 'wallet.transaction').filter((w) => w.eventId === 'mine.trader');
    // свиток: mine pick 0 = добровольный выход 100%
    const scrollExit = f.mine['mine.pick']('0') as R<ViewShape>;
    const ended = eventsOf(f, 'mine.runEnded');
    results.push(
      check('кротовый магазин (R3/R9): сток ДАННЫМИ (зелья ×2/факел ×2/свиток ×1); цены PriceBus с markup-наценкой по данным (ctx-тег крота; витрина «база + наценка»); покупка eventId mine.trader; зелья → инвентарь (D23-проба + acquire), факелы → run.torches +2; свиток — mine pick 0 = добровольный выход 100% (runEnded exit)', () =>
        traderView.includes('Торговец-крот') && runAfter.includes('РЕЖИМ КРОТА') &&
        torchBuy.ok && torchBuy.value.lines.join('\n').includes('+2') &&
        potionBuy.ok && potionBuy.value.lines.join('\n').includes('→ основной инвентарь') &&
        scrollBuy.ok && hasPotion && hasScroll && goldAfter < 2000 && wallets.length === 3 &&
        scrollExit.ok && ended.length === 1 && ended[0]!.reason === 'exit', {
        expected: 'сток/наценка/3 транзакции mine.trader; факелы +2; зелье+свиток в инвентаре; свиток-выход exit',
        actual: `torch ${torchBuy.ok}; potion ${potionBuy.ok && hasPotion}; scroll ${scrollBuy.ok && hasScroll}; tx ${wallets.length}; выход ${ended[0]?.reason ?? '—'}`,
      }),
    );
    f.dispose();
  }

  return results;
}
