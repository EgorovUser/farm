/**
 * Группа «M12 Шахта» (сеанс M12.1 — ЧАСТЬ 1: боевой движок + мобы/элиты +
 * витрины; срез v15; бриф F9). ОРКЕСТРАТОР: миграция/golden (1–2) +
 * боевые чеки mine-battle-checks (3–7) + элитные mine-elite-checks (8–11) +
 * сейв/манифест/события/смерть
 * (12–15). Распил 01 §6 (572 > 500) — прецедент workers-checks M11.2:
 * порядок чеков и тексты НЕ меняются, вывод selftest байт-в-байт.
 */
import { check, group, type CheckGroup, type CheckResult } from './types';
import { migrateSaveData, SAVE_VERSION } from '@/kernel/save/migrations';
import { MINE_TABLE } from '@/content/mine/table';
import { RollLog } from '@/kernel/bus/rng-bus/roll-log';
import { resolveFight } from '@/game/modules/mine/logic/fight';
import { buildEnemies } from '@/game/modules/mine/logic/enemies';
import { makeSeededRoll } from '@/game/modules/mine/logic/seed';
import {
  makeMineGame,
  makeSeededMineGame,
  fightOf,
  mineStateOf,
  hpOf,
  walletOf,
  eventsOf,
  lastRollOf,
  mobOf,
  MINE_T0,
} from './mine-fixture';
import { runMineBattleChecks } from './mine-battle-checks';
import { runMineEliteChecks } from './mine-elite-checks';
// [M12.2] часть 2: боссы/гейты/экономика/ачивки (бриф G8; группа НЕ плодится —
// 46 групп целы, «M12 Шахта» 15 → 15+Δ)
import { runMineBossChecks } from './mine-boss-checks';
import { runMineGateChecks } from './mine-gate-checks';

export async function runMineChecks(): Promise<CheckGroup> {
  const results: CheckResult[] = [];

  // ------------------------------------------------ 1. миграция v14→v15 (F1)
  {
    const donor = {
      saveVersion: 14,
      saveId: 'm121-donor-14',
      savedAt: MINE_T0,
      contentVersion: '0',
      lastSeen: MINE_T0,
      modules: {
        workers: { v: 1, hired: [] },
        lake: { v: 1, slots: [], water: { temperature: 15, cleanliness: 70 }, roe: [], stats: { released: 0, bred: 0, harvested: 0 } },
      },
    };
    const m = migrateSaveData(JSON.parse(JSON.stringify(donor)) as unknown as Record<string, unknown>);
    const m2 = migrateSaveData(JSON.parse(JSON.stringify(m.data)) as unknown as Record<string, unknown>);
    const v3 = { saveVersion: 3, saveId: 'm121-donor-v3', savedAt: MINE_T0, contentVersion: '0', modules: { 'kernel.wallet': { balances: [['gold', 7]] } }, lastSeen: MINE_T0 };
    const m3 = migrateSaveData(v3);
    let threw99 = false;
    try {
      migrateSaveData({ saveVersion: 99, modules: {} });
    } catch {
      threw99 = true;
    }
    const mineSlice = (m.data.modules as Record<string, unknown>)['mine'];
    results.push(
      check('миграция v14→v15 (F1): срез mine = { v: 1, stats: { fights: 0, kills: 0, bossKills: 0, deaths: 0 } } БАЙТ-В-БАЙТ ([DECISION] §0 брифа); прежние срезы целы (workers/lake); ДВОЙНОЙ прогон идемпотентен; v3→v15 холодной цепочкой 12 шагов; v99 — отказ; SAVE_VERSION 15', () =>
        m.data.saveVersion === 15 &&
        m.steps === 1 &&
        JSON.stringify(mineSlice) === JSON.stringify({ v: 1, stats: { fights: 0, kills: 0, bossKills: 0, deaths: 0 } }) &&
        (m.data.modules as Record<string, unknown>)['workers'] !== undefined &&
        (m.data.modules as Record<string, unknown>)['lake'] !== undefined &&
        JSON.stringify((m2.data.modules as Record<string, unknown>)['mine']) === JSON.stringify(mineSlice) &&
        m3.data.saveVersion === 15 && m3.steps === 12 &&
        (m3.data.modules as Record<string, unknown>)['mine'] !== undefined &&
        threw99 && SAVE_VERSION === 15, {
        expected: 'v15/1 шаг; mine-дефолт; workers+lake целы; идем; v3→15 12 шагов; v99 отказ',
        actual: `v${m.data.saveVersion}/${m.steps}; mine ${JSON.stringify(mineSlice)}; v3→${m3.data.saveVersion} ${m3.steps}; v99 ${threw99}`,
      }),
    );
  }

  // ------------------------------------------------ 2. golden фикс-сид ×2 (карточка §7)
  {
    const mkFight = () =>
      resolveFight({
        player: { hp: 50, maxHp: 50, atk: 17, def: 6, speed: 10 },
        enemies: buildEnemies(mobOf('spider'), 1, null, MINE_TABLE),
        gear: { hasShield: true, blockSensePct: 4, fatedPct: 20, critPct: 5, damagePct: 0 },
        table: MINE_TABLE,
        roll: makeSeededRoll(12345, new RollLog(), () => 0),
      });
    const a = mkFight();
    const b = mkFight();
    const f = await makeSeededMineGame('m121-golden');
    // витрины сравниваются на ИДЕНТИЧНОМ состоянии игрока: полное HP
    // перед каждым боем (иначе второй бой стартует с повреждённым HP —
    // исход закономерно иной; движковая часть ×2 уже идентична выше)
    const heal = () =>
      (f.player['player.healHp'] as (n: number, r: string) => unknown)(100, 'selfcheck');
    heal();
    const r1 = fightOf(f, 'spider', undefined, 12345);
    heal();
    const r2 = fightOf(f, 'spider', undefined, 12345);
    const v1 = r1.ok ? r1.value : null;
    const v2 = r2.ok ? r2.value : null;
    results.push(
      check('golden-лог фикс-сид ×2 (карточка §7): движок resolveFight(seed 12345) ×2 — rounds БАЙТ-В-БАЙТ (JSON); API mine.fight --seed 12345 ×2 — витрины идентичны построчно; сид-роллы зеркалятся в roll.log (стрим mine:attack:spider жив); бой завершился исходом (win|loss), раундов ≥ 3', () =>
        JSON.stringify(a.rounds) === JSON.stringify(b.rounds) &&
        a.rounds.length >= 3 && (a.result === 'win' || a.result === 'loss') &&
        v1 !== null && v2 !== null &&
        JSON.stringify(v1.rounds) === JSON.stringify(v2.rounds) &&
        v1.outcome === v2.outcome &&
        lastRollOf(f, 'mine:attack:spider') !== null, {
        expected: 'движок ×2 идентичен; витрина ×2 идентична; roll.log жив',
        actual: `движок ${a.rounds.length} раундов (${a.result}); витрина ${v1 !== null && v2 !== null ? (JSON.stringify(v1.rounds) === JSON.stringify(v2.rounds) ? '×2 идентична' : 'РАЗЛИЧАЕТСЯ') : 'ошибка api'}; roll.log ${lastRollOf(f, 'mine:attack:spider')}`,
      }),
    );
    f.dispose();
  }

  // ------------------------------------------------ 3–7. боевые чеки (распил 01 §6)
  results.push(...(await runMineBattleChecks()));

  // ------------------------------------------------ 8–11. элиты/масштаб (распил 01 §6)
  results.push(...(await runMineEliteChecks()));

  // ------------------------------------------------ 12. roundtrip v15 байт-в-байт
  {
    const f = await makeSeededMineGame('m121-roundtrip');
    fightOf(f, 'spider'); // победа кулаками детерминирована (6 ударов по 5 vs 5×6 урона < 50)
    fightOf(f, 'golem'); // смерть детерминирована (4 удара по 14 ≥ 50 HP)
    const before = mineStateOf(f);
    await f.game.save.save();
    const json = f.game.save.exportJson();
    const f2 = await makeSeededMineGame('m121-roundtrip-b');
    await f2.game.save.importJson(json);
    await f2.game.save.save();
    const raw1 = (JSON.parse(json) as { modules: { mine: unknown }; saveVersion: number }).modules.mine;
    const raw2 = (JSON.parse(f2.game.save.exportJson()) as { modules: { mine: unknown } }).modules.mine;
    const after = mineStateOf(f2);
    results.push(
      check('roundtrip v15 БАЙТ-В-БАЙТ: срез mine со статами (fights 2 · kills 1 · deaths 1 — паук-победа + голем-смерть) export → import → save → re-export — JSON среза идентичен; статы живы после загрузки', () =>
        before.fights === 2 && before.kills === 1 && before.deaths === 1 &&
        JSON.stringify(raw1) === JSON.stringify(raw2) &&
        JSON.stringify(after) === JSON.stringify(before), {
        expected: 'fights 2/kills 1/deaths 1; срез ×2 идентичен',
        actual: `${before.fights}/${before.kills}/${before.deaths}; ${JSON.stringify(raw1) === JSON.stringify(raw2) ? 'идентичен' : 'РАЗЛИЧАЕТСЯ'}; после ${after.fights}/${after.kills}/${after.deaths}`,
      }),
    );
    f.dispose();
    f2.dispose();
  }

  // ------------------------------------------------ 13. манифест = факту + save info + tasks 15
  {
    const f = makeMineGame();
    await f.game.init();
    const mounted = f.game.modules.get('mine');
    const manifest = mounted?.manifest;
    const apiKeys = Object.keys(mounted?.api ?? {}).sort();
    const info = f.game.save.info();
    results.push(
      check('манифест M12/M13 = факту (F2 + [M12.2 · G6] 1.0.0 → 1.1.0 + [M13.1 · R7] 1.1.0 → 1.2.0 + [M13.2 · R10] ЗАКРЫВАЮЩИЙ 1.2.0 → 1.3.0, паттерн M12.2; прецеденты F16 M11.2/чека 26 FIX-M11): version 1.3.0; publicApi РОВНО ×16 = [mine.state, mine.mob, mine.fight, mine.elite, mine.enter, mine.boss + ×7 забега M13.1: mine.run, mine.pick, mine.gen, mine.reveal, mine.torch, mine.upgrades, mine.upgrades.buy + РОВНО ×3 помощников M13.2: mine.helpers, mine.helpers.hire, mine.helpers.fire]; eventsPublished РОВНО ×9 = [mine.turnResolved, mine.enemyKilled, mine.bossKilled + mine.runStarted, mine.runEnded, mine.cardResolved + helper.hired, helper.quit, helper.levelReputation — строки Task 70 каталога 02 §4]; eventsSubscribed РОВНО ×1 = [player.hpChanged] (идемпотентный death-обработчик R4; перк медика — обёрткой, НЕ подпиской); modifierProviders РОВНО ×1 = [runBuffProvider]; priceModifierProviders += mineTraderProvider [DECISION M13.1 — кротовая наценка, 04 §1]; taskExecutors [] (helpers ≠ работники M11); statsCounters []; save info: v15, срезов 19 (+mine)', () =>
        manifest !== undefined &&
        manifest.version === '1.3.0' &&
        JSON.stringify(apiKeys) === JSON.stringify(['mine.boss', 'mine.elite', 'mine.enter', 'mine.fight', 'mine.gen', 'mine.helpers', 'mine.helpers.fire', 'mine.helpers.hire', 'mine.mob', 'mine.pick', 'mine.reveal', 'mine.run', 'mine.state', 'mine.torch', 'mine.upgrades', 'mine.upgrades.buy']) &&
        JSON.stringify([...(manifest.eventsPublished ?? [])].sort()) === JSON.stringify(['helper.hired', 'helper.levelReputation', 'helper.quit', 'mine.bossKilled', 'mine.cardResolved', 'mine.enemyKilled', 'mine.runEnded', 'mine.runStarted', 'mine.turnResolved']) &&
        JSON.stringify(manifest.eventsSubscribed) === JSON.stringify([{ event: 'player.hpChanged', handler: 'onHpChanged' }]) &&
        JSON.stringify(manifest.modifierProviders) === JSON.stringify(['runBuffProvider']) &&
        JSON.stringify(manifest.priceModifierProviders) === JSON.stringify(['mineTraderProvider']) &&
        JSON.stringify(manifest.taskExecutors) === JSON.stringify([]) &&
        JSON.stringify(manifest.statsCounters) === JSON.stringify([]) &&
        info.saveVersion === 15 && info.slices.length === 19 && info.slices.includes('mine') &&
        f.game.tasks.list().length === 15, {
        expected: '1.3.0; api ×16; события ×9; подписка hpChanged; runBuff + mineTrader; tasks 15; v15/19',
        actual: `${manifest?.version}; api ${apiKeys.length}; события ${(manifest?.eventsPublished ?? []).length}; подписки ${(manifest?.eventsSubscribed ?? []).length}; провайдеры ${(manifest?.modifierProviders ?? []).length}+${(manifest?.priceModifierProviders ?? []).length}; tasks ${f.game.tasks.list().length}; v${info.saveVersion}/${info.slices.length}`,
      }),
    );
    f.dispose();
  }

  // ------------------------------------------------ 14. события ×2 ровно + оракул отрицания
  {
    const f = await makeSeededMineGame('m121-events');
    const r = fightOf(f, 'spider');
    const v = r.ok ? r.value : null;
    const turns = eventsOf(f, 'mine.turnResolved');
    const killed = eventsOf(f, 'mine.enemyKilled');
    const names = new Set(f.events.map((e) => e.name));
    const loot = v !== null && v.loot !== null ? v.loot.gold : -1;
    results.push(
      check('события ×2 РОВНО (F2/F6): mine.turnResolved публикуется ПО РАУНДАМ (счёт = раундам витрины); mine.enemyKilled — по экземпляру {mobId: spider, layer: 1, elite: null, loot.gold ∈ [2, 5] — расклад M12.1}; ОРАКУЛ ОТРИЦАНИЯ: mine.runStarted / mine.runEnded (домен забега M13) и mine.bossKilled (M12.2) НЕ публикуются', () =>
        v !== null && v.rounds.length > 0 &&
        turns.length === v.rounds.length &&
        killed.length === 1 &&
        killed[0]!.mobId === 'spider' && killed[0]!.layer === 1 && killed[0]!.elite === null &&
        typeof killed[0]!.loot === 'object' && loot >= 2 && loot <= 5 &&
        !names.has('mine.runStarted') && !names.has('mine.runEnded') && !names.has('mine.bossKilled'), {
        expected: `turns = раундам; enemyKilled 1; gold ∈ [2, 5]; run*/boss — тишина`,
        actual: `turns ${turns.length}/${v?.rounds.length ?? 0}; killed ${killed.length}; gold ${loot}; запуск ${names.has('mine.runStarted')}/${names.has('mine.runEnded')}/${names.has('mine.bossKilled')}`,
      }),
    );
    f.dispose();
  }

  // ------------------------------------------------ 15. смерть (cozy) + экономика победы
  {
    const f = await makeSeededMineGame('m121-death');
    (f.player['player.setHp'] as (n: number) => unknown)(5);
    const r1 = fightOf(f, 'golem'); // 14 урона за удар ≥ 5 HP — смерть детерминирована
    const cozyHp = hpOf(f); // сразу после боя: cozy-правило HP := 1
    const deaths = eventsOf(f, 'player.hpChanged').filter(
      (e) => Array.isArray(e.tags) && (e.tags as string[]).includes('death'),
    );
    const s1 = mineStateOf(f);
    (f.player['player.healHp'] as (n: number, r: string) => unknown)(100, 'selfcheck');
    const goldBefore = walletOf(f);
    const r2 = fightOf(f, 'spider'); // победа кулаками детерминирована (5×6 = 30 < 50)
    const s2 = mineStateOf(f);
    const lootTx = eventsOf(f, 'wallet.transaction').filter((e) => e.eventId === 'mine.loot');
    const v2 = r2.ok ? r2.value : null;
    results.push(
      check('смерть F7 [DECISION] + экономика победы: HP 5 → голем (14/удар) → ПРОИГРАН, player.hpChanged с тегом death опубликован КАНАЛОМ M01 (обёртка не дублирует), cozy-правило HP := 1 (витрина честная, «больше никаких штрафов» — карточка §5), deaths +1; победа над пауком: gold зачислен ОДНОЙ транзакцией mine.loot (кошелёк до/после = расклад), kills +1, fights растёт', () =>
        r1.ok && r1.value.outcome.startsWith('ПРОИГРАН') &&
        deaths.length === 1 && cozyHp === 1 &&
        s1.fights === 1 && s1.deaths === 1 && s1.kills === 0 &&
        r2.ok && v2 !== null && v2.outcome.startsWith('ПОБЕДА') && v2.loot !== null &&
        walletOf(f) === goldBefore + (v2.loot?.gold ?? -1) &&
        lootTx.length === 1 && s2.fights === 2 && s2.kills === 1 && s2.deaths === 1, {
        expected: 'death ×1; cozy HP 1; 1/0/1; победа + gold; 2/1/1',
        actual: `death ${deaths.length}; cozy ${cozyHp}; ${s1.fights}/${s1.kills}/${s1.deaths}; tx ${lootTx.length} (+${v2?.loot?.gold ?? '—'}з); ${s2.fights}/${s2.kills}/${s2.deaths}`,
      }),
    );
    f.dispose();
  }

  // ------------------------------------------------ 16–22. боссы: фазы/golden/расклад (M12.2, G8)
  results.push(...(await runMineBossChecks()));

  // ------------------------------------------------ 23–30. гейты/энергия/износ/ачивки/roundtrip/данные (M12.2, G8)
  results.push(...(await runMineGateChecks()));

  return group('M12 Шахта', results);
}
