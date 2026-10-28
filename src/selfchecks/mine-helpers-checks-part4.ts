/**
 * Группа «M13 Помощники» — часть 4: босс +10 репутации + пересечение уровня
 * (helper.levelReputation) + скидка уровня, перк 50+ медика (воскрешение
 * идемпотентно), roundtrip среза с helpers байт-в-байт, энергия игрока Δ0
 * (энергоконтракт R8).
 */
import { check, type CheckResult } from './types';
import {
  makeSeededRunGame,
  makeSeededSliceGame,
  seededMineSlice,
  mobCard,
  plainCard,
  eventsOf,
  grantGold,
  goldOf,
  buffWin,
  equipPickaxe,
  type ViewShape,
} from './mine-run-fixture';

type R<T> = { ok: true; value: T } | { ok: false; error: string };

const textOf = (r: R<ViewShape>): string => (r.ok ? [r.value.header, ...r.value.lines].join('\n') : `ERR: ${r.error}`);
/** mine.helpers / mine.run — ГЛАДКИЕ витрины (НЕ Result) */
const boardText = (v: unknown): string => ((v as ViewShape).header + '\n' + (v as ViewShape).lines.join('\n'));

export async function runMineHelpersPart4(): Promise<CheckResult[]> {
  const results: CheckResult[] = [];

  // 13. босс +10 репутации + пересечение уровня (helper.levelReputation) + скидка уровня
  {
    const f = await makeSeededSliceGame(
      'm132-gold-0',
      seededMineSlice({
        helpers: [{ instanceId: 'ku', defId: 'hpr_20240101_0', hp: 40, reputation: 8 }],
        runHelpers: ['ku'],
        layer: 1,
        column: 5,
        cards: [],
        upgrades: { mine_barracks: true },
      }),
    );
    equipPickaxe(f, 'D'); // гейт слоя босс-боя (канон M12.2)
    buffWin(f);
    grantGold(f, 1000);
    f.mine['mine.pick'](1); // финальная карта-босс → победа (buffWin) → конец 'boss'
    const levels = eventsOf(f, 'helper.levelReputation');
    const ended = eventsOf(f, 'mine.runEnded');
    const rows = (ended[0]?.helpers ?? []) as Array<{ repDelta: number; reputation: number; level: number; levelUp: boolean }>;
    const bossOk = rows.length === 1 && rows[0]!.repDelta >= 13 && rows[0]!.repDelta <= 15;
    // скидка уровня: Кувалда rep 28 (ур. 3) → зарплата round(24 × (1 − 0.05×2)) = 22
    const f2 = await makeSeededSliceGame(
      'm132-gold-0',
      seededMineSlice({
        helpers: [{ instanceId: 'ku', defId: 'hpr_20240101_0', hp: 40, reputation: 28 }],
        runHelpers: ['ku'],
        layer: 1,
        cards: [plainCard('c1', 'exit', { label: 'лестница вверх' }), plainCard('c2', 'empty', { xp: 5 }), plainCard('c3', 'empty', { xp: 5 })],
        contrib: { player: 100 },
        mobGold: 0,
        upgrades: { mine_barracks: true },
      }),
    );
    grantGold(f2, 1000);
    const w0 = goldOf(f2);
    f2.mine['mine.pick'](1);
    const ended2 = eventsOf(f2, 'mine.runEnded');
    const rows2 = (ended2[0]?.helpers ?? []) as Array<{ salary: number; share: number }>;
    results.push(
      check('репутация за босса + уровни (R6/R9): босс-победа = забег +[3..5] + босс +10 → repDelta ∈ [13..15]; rep 8 → 21..23 → ур. 3, пересечение порога → helper.levelReputation {instanceId, level: 3, reputation}; эффекты уровня: rep 28 (ур. 3) → зарплата round(24×0.9) = 22 (−5%/ур), доля при нулевом вкладе 0 (нижний предел ≥ 0)', () =>
        bossOk && rows[0]!.levelUp === true && rows[0]!.level === 3 &&
        levels.length === 1 && levels[0]!.level === 3 && typeof levels[0]!.instanceId === 'string' &&
        rows2.length === 1 && rows2[0]!.salary === 22 && rows2[0]!.share === 0 &&
        goldOf(f2) === w0 - 22, {
        expected: 'repDelta 13..15; level 3 событие; зп ур.3 = 22; доля 0',
        actual: `repDelta ${rows[0]?.repDelta}; уровень ${rows[0]?.level}; события ${levels.length}; зп22=${rows2[0]?.salary === 22}`,
      }),
    );
    f.dispose();
    f2.dispose();
  }

  // 14. перк 50+ медика: воскресить 1 раз за забег с 30% HP (идемпотентно)
  {
    const f = await makeSeededSliceGame(
      'm132-gold-1',
      seededMineSlice({
        helpers: [{ instanceId: 'dy', defId: 'hpr_20240101_2', hp: 39, reputation: 50 }],
        runHelpers: ['dy'],
        layer: 1,
        cards: [plainCard('c1', 'empty', { xp: 5 }), plainCard('c2', 'empty', { xp: 5 }), plainCard('c3', 'empty', { xp: 5 })],
        upgrades: { mine_barracks: true },
      }),
    );
    grantGold(f, 1000);
    const hp = f.player['player.checkHp'] as () => { current: number; max: number };
    (f.player['player.setHp'] as (n: number) => unknown)(0); // смерть №1
    const revived = hp().current;
    const runView = boardText(f.mine['mine.run']());
    const runAlive1 = runView.includes('забег №1');
    const state1 = f.mine['mine.state']() as { deaths: number };
    (f.player['player.setHp'] as (n: number) => unknown)(0); // смерть №2 — финал
    const state2 = f.mine['mine.state']() as { deaths: number };
    const ended = eventsOf(f, 'mine.runEnded');
    results.push(
      check('перк 50+ медика — воскрешение ИДЕМПОТЕНТНО (R6/R9): репутация 50 ≥ порога данных; смерть №1 → игрок ВОСКРЕШЕН с ceil(50 × 30%) = 15 HP, забег ПРОДОЛЖАЕТСЯ, deaths НЕ тикает, флаг per-run в витрине забега («перк воскрешения ИСПОЛЬЗОВАН»); смерть №2 → финал death: deaths 0 → 1 РОВНО, runEnded {reason: death} ×1 — ровно один раз за забег; cozy-канал смерти не дублируется (подписка владеет финалом)', () =>
        revived === 15 && runAlive1 && state1.deaths === 0 &&
        runView.includes('перк воскрешения ИСПОЛЬЗОВАН') &&
        state2.deaths === 1 && ended.length === 1 && ended[0]!.reason === 'death', {
        expected: 'HP 15; забег жив; флаг в витрине; deaths 0→1; runEnded death ×1',
        actual: `HP ${revived}; жив=${runAlive1}; флаг=${runView.includes('перк воскрешения ИСПОЛЬЗОВАН')}; deaths ${state1.deaths}→${state2.deaths}; ended ${ended.length} (${String(ended[0]?.reason ?? '?')})`,
      }),
    );
    f.dispose();
  }

  // 15. roundtrip среза с helpers байт-в-байт + ленивые дефолты идемпотентны
  {
    const f = await makeSeededSliceGame(
      'm132-rt',
      seededMineSlice({
        helpers: [{ instanceId: 'ku', defId: 'hpr_20240101_0', hp: 33, reputation: 12 }],
        runHelpers: ['ku'],
        layer: 2,
        status: 'cold',
        cards: [mobCard('c1', 'spider'), plainCard('c2', 'empty', { xp: 5 }), plainCard('c3', 'empty', { xp: 5 })],
        contrib: { player: 10, ku: 5 },
        mobGold: 17,
        upgrades: { mine_barracks: true, mine_squad: 2 },
      }),
    );
    await f.game.save.save();
    const json = f.game.save.exportJson();
    const f2 = await makeSeededSliceGame('m132-rt-b', { v: 1, stats: { fights: 0, kills: 0, bossKills: 0, deaths: 0 } });
    await f2.game.save.importJson(json);
    await f2.game.save.save();
    const raw1 = (JSON.parse(json) as { modules: { mine: unknown } }).modules.mine;
    const raw2 = (JSON.parse(f2.game.save.exportJson()) as { modules: { mine: unknown } }).modules.mine;
    await f2.game.save.importJson(json);
    await f2.game.save.save();
    const raw3 = (JSON.parse(f2.game.save.exportJson()) as { modules: { mine: unknown } }).modules.mine;
    const keys = Object.keys(raw2 as object).sort().join(',');
    // пост-wipe тишина: пустой срез — helpers НЕ дописываются
    const f3 = await makeSeededSliceGame('m132-rt-c', { v: 1, stats: { fights: 1, kills: 0, bossKills: 0, deaths: 0 } });
    await f3.game.save.save();
    const raw4 = (JSON.parse(f3.game.save.exportJson()) as { modules: { mine: unknown } }).modules.mine;
    const keys4 = Object.keys(raw4 as object).sort().join(',');
    results.push(
      check('roundtrip v15 с helpers в срезе БАЙТ-В-БАЙТ (R2/R9): export → import → save → re-export — срез mine идентичен (наёмники/репутация/hp/upgrades-числа Отряда/run-поля contrib/mobGold/turns пережили); повторный load НЕ дописывает ленивых дефолтов; ПОСТ-WIPE ТИШИНА: пустой срез БЕЗ helpers/upgrades (лениво-опционально, БЕЗ bump v15)', () =>
        JSON.stringify(raw1) === JSON.stringify(raw2) && JSON.stringify(raw2) === JSON.stringify(raw3) &&
        keys === 'helpers,lastRunDay,run,stats,upgrades,v' &&
        keys4 === 'stats,v' && JSON.stringify(raw4) === JSON.stringify({ v: 1, stats: { fights: 1, kills: 0, bossKills: 0, deaths: 0 } }), {
        expected: '×3 идентичны; ключи helpers,lastRunDay,run,stats,upgrades,v; пустой = stats,v',
        actual: `${JSON.stringify(raw1) === JSON.stringify(raw2) ? 'идентичен' : 'РАЗЛИЧАЕТСЯ'}; повтор ${JSON.stringify(raw2) === JSON.stringify(raw3) ? 'стабилен' : 'ДРЕЙФ'}; ключи ${keys}; пустой ${keys4}`,
      }),
    );
    f.dispose();
    f2.dispose();
    f3.dispose();
  }

  // 16. энергия игрока Δ0 при действиях помощников (R8) + enter −20 РОВНО раз
  {
    const f = await makeSeededSliceGame(
      'm132-gold-1',
      seededMineSlice({
        helpers: [{ instanceId: 'sa', defId: 'hpr_20240101_0', hp: 38, reputation: 0 }],
        runHelpers: ['sa'],
        layer: 1,
        cards: [mobCard('c1', 'spider'), mobCard('c2', 'bat'), plainCard('c3', 'empty', { xp: 5 })],
      }),
    );
    buffWin(f);
    f.game.buffs.add(
      { id: 'selfcheck.m132.speed', source: { kind: 'buff', refId: 'selfcheck' }, stat: 'mine.speed', op: 'flat', value: 100 },
      f.game.time.now(),
    );
    const energy = () => (f.player['player.snapshot'] as () => { energy: { current: number } })().energy.current;
    const e0 = energy();
    f.mine['mine.pick'](1); // бой с пауком: волей Сажи + бой движка + лут
    f.mine['mine.pick'](1); // вторая битва (мышь) — серия helper-действий
    const e1 = energy();
    // enter: −20 РОВНО один раз за забег (канон M12.2/M13.1) — живой прогон
    const g = await makeSeededSliceGame('m132-energy-enter', { v: 1, stats: { fights: 0, kills: 0, bossKills: 0, deaths: 0 } });
    (g.inv['inventory.add'] as unknown as (d: string, t: string, v: number, q: number, s: string) => R<unknown>)('iron_pickaxe', 'D', 50, 1, 'selfcheck');
    const list = (g.inv['inventory.list'] as () => Array<{ iid: string; defId: string }>)();
    const pick = list.findLast((i) => i.defId === 'iron_pickaxe')!;
    (g.inv['inventory.equip'] as (iid: string, slot: string) => R<unknown>)(pick.iid, 'pickaxe');
    const gEnergy = () => (g.player['player.snapshot'] as () => { energy: { current: number } })().energy.current;
    const ge0 = gEnergy();
    g.mine['mine.enter'](1);
    const ge1 = gEnergy();
    results.push(
      check('энергоконтракт R8 (прецедент withWorkerEnergy M11.2 / pen.autofeeder M06.2): СЕРИЯ helper-действий (волей-удары ×2 боя, лут, лечение каналом) — player.energy Δ0 (бой на раунды энергии НЕ тратит — канон §0 брифа M13.1); вход в забег: −20 РОВНО один раз (гейт M12.2; повторный enter при живом забеге — отказ ДО энергии)', () =>
        e1 === e0 && ge0 - ge1 === 20, {
        expected: 'бои Δ0; enter −20 ровно',
        actual: `бои ${e1 - e0}; enter ${ge0 - ge1}`,
      }),
    );
    f.dispose();
    g.dispose();
  }

  // 17. [FIX-M13 · P3] витринные правки аудита: OBS-7 (суффикс «отряд полон (кап)»
  //     по ЗАНЯТОСТИ слотов, а не по покупкам «Отряда»), OBS-6 (HP при найме =
  //     max с первого дня — max вычисляется ПОСЛЕ попадания экземпляра в срез,
  //     пер-instance трейт-провайдер видит найм), OBS-8 (ведомость расчёта при
  //     завершении СМЕРТЬЮ доступна витриной «последний расчёт» в mine helpers)
  {
    const f = await makeSeededRunGame('m132-gold-0');
    grantGold(f, 5000);
    f.mine['mine.upgrades.buy']('mine_barracks');
    f.mine['mine.upgrades.buy']('mine_squad');
    f.mine['mine.upgrades.buy']('mine_squad'); // слоты 3/3 — КАП покупок «Отряда»
    const board0 = boardText(f.mine['mine.helpers']());
    // OBS-6: Кувалда (hpr_20240101_0) — трейт «Крепкий» +N к HP: наём даёт
    // HP = max СРАЗУ (ранее «40/50» до первого settle — AUDIT-M13-OBS-6)
    const hire = f.mine['mine.helpers.hire'](1) as R<ViewShape>;
    const roster1 = boardText(f.mine['mine.helpers']());
    const hpMatch = /HP (\d+)\/(\d+)/.exec(roster1);
    const hpOk = hpMatch !== null && hpMatch[1] === hpMatch[2];
    // OBS-7: 1/3 при капе покупок — БЕЗ суффикса «полон» (слоты свободны)
    const line1 = roster1.split('\n').find((l) => l.startsWith('отряд:'));
    f.mine['mine.helpers.fire'](1);
    const roster0 = boardText(f.mine['mine.helpers']());
    const line0 = roster0.split('\n').find((l) => l.startsWith('отряд:'));
    // тройной найм → 3/3 — «отряд полон (кап)» по ЗАНЯТОСТИ
    f.mine['mine.helpers.hire'](1);
    f.mine['mine.helpers.hire'](2);
    f.mine['mine.helpers.hire'](3);
    const roster3 = boardText(f.mine['mine.helpers']());
    const line3 = roster3.split('\n').find((l) => l.startsWith('отряд:'));
    // OBS-8: смерть с помощниками → ведомость доступна витриной
    equipPickaxe(f, 'D');
    f.mine['mine.enter'](1);
    (f.player['player.setHp'] as (n: number) => unknown)(0); // смерть → расчёт
    const ended = eventsOf(f, 'mine.runEnded');
    const boardAfterDeath = boardText(f.mine['mine.helpers']());
    results.push(
      check('витринные правки [FIX-M13 · P3 / DECISION FIX13-3]: OBS-7 — суффикс «— отряд полон (кап)» по ЗАНЯТОСТИ слотов (N/M), а не по факту покупок «Отряда»: кап покупок (2/2) при свободных слотах — честная строка «кап покупок „Отряда“: слоты свободны N/M», «1/3 слотов» БЕЗ «полон», «3/3 слотов — отряд полон (кап)»; OBS-6 — наём с позитивным hp-трейтом («Крепкий» +N) даёт HP = max С ПЕРВОГО ДНЯ (max вычисляется ПОСЛЕ попадания экземпляра в срез — пер-instance провайдер видит найм; hp ≤ max — инвариант); OBS-8 — ведомость расчёта при завершении СМЕРТЬЮ доступна витриной «последний расчёт» в mine helpers (канал вывода у подписки player.hpChanged отсутствует; транзакции/события живут — runEnded death)', () =>
        board0.includes('отряд: 0/3 слотов — кап покупок «Отряда»: слоты свободны 3/3') &&
        hire.ok && hpOk && Number(hpMatch?.[1] ?? 0) > 40 &&
        line1 !== undefined && line1.startsWith('отряд: 1/3 слотов') && !line1.includes('полон') &&
        line0 !== undefined && line0.startsWith('отряд: 0/3 слотов') && !line0.includes('полон') &&
        line3 !== undefined && line3.includes('отряд: 3/3 слотов — отряд полон (кап)') &&
        ended.length === 1 && ended[0]!.reason === 'death' &&
        boardAfterDeath.includes('последний расчёт (забег завершён смертью') &&
        boardAfterDeath.includes('зарплата') &&
        boardAfterDeath.includes('без роста (забег завершён смертью)'), {
        expected: '0/3 без «полон»; 1/3 без «полон»; 3/3 «полон (кап)»; наём HP=max (>40); смерть → ведомость витриной',
        actual: `0/3=${board0.includes('кап покупок') && !board0.includes('полон') ? 'ок' : '?'}; HP=${hpMatch ? `${hpMatch[1]}/${hpMatch[2]}` : '?'}; 1/3=${line1 !== undefined && !line1.includes('полон') ? 'без полон' : 'ДЕФЕКТ'}; 3/3=${line3?.includes('полон (кап)') ? 'полон (кап)' : '?'}; смерть=${String(ended[0]?.reason ?? '—')}; ведомость=${boardAfterDeath.includes('последний расчёт') ? 'доступна' : 'НЕТ'}`,
      }),
    );
    f.dispose();
  }

  return results;
}
