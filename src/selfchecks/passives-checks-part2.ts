/**
 * Группа «M14 Пассивки» · ЧАСТЬ 2/2 (бриф SESSION-M14 F8): keystones ×3
 * («Гуманист»/«Рудный магнат»/«Человек-оркестр»), респек поузельный/полный,
 * кривая 50/75/113, узел-мост, каналы очков ×3, canReach BFS, roundtrip
 * байт-в-байт.
 */
import { check, type CheckResult } from './types';
import { PASSIVES_RESPEC, respecCostOf } from '@/content/passives/respec';
import {
  alloc,
  goldOf,
  grantGold,
  makeSeededPassivesGame,
  passivesSliceOfExport,
  playerDonor,
  pointsLine,
  refund,
  resolveOf,
  viewText,
  type R,
  type ViewShape,
} from './passives-fixture';

export async function runPassivesPart2(): Promise<CheckResult[]> {
  const results: CheckResult[] = [];

  // 10. [F8] «Гуманист»: resolve quitChance = 0, sickChance = 0, зарплата +30%
  {
    const f = await makeSeededPassivesGame('m14-humanist', { player: playerDonor(15) });
    const before = [
      resolveOf(f, 'worker.quitChance'),
      resolveOf(f, 'worker.sickChance'),
      resolveOf(f, 'worker.salary.mult'),
    ];
    for (const id of ['core_xp_1', 'core_xp_2', 'core_inv_slots', 'core_helper_slot', 'pen_happy_1', 'lake_mut_1', 'ks_humanist']) {
      alloc(f, id);
    }
    const after = [
      resolveOf(f, 'worker.quitChance'),
      resolveOf(f, 'worker.sickChance'),
      resolveOf(f, 'worker.salary.mult'),
    ];
    f.dispose();
    results.push(
      check('keystone «Гуманист» [F8]: override 0 на worker.quitChance (10 → 0 — не увольняются) + override 0 на worker.sickChance (2 → 0 — не болеют) + inc +30% на worker.salary.mult (100 → 130); комбинация модификаторов override/inc — БЕЗ спец-кода (в коде модуля нет имени keystone)', () =>
        before.join('/') === '10/2/100' && after.join('/') === '0/0/130', {
        expected: '10/2/100 → 0/0/130',
        actual: `${before.join('/')} → ${after.join('/')}`,
      }),
    );
  }

  // 11. [F8] «Рудный магнат»: руда +100% / клёв вдвое реже
  {
    const f = await makeSeededPassivesGame('m14-magnate', { player: playerDonor(15) });
    const before = [resolveOf(f, 'mine.oreYield'), resolveOf(f, 'fishing.bite.speed')];
    for (const id of ['core_energy_1', 'core_energy_2', 'core_energy_3', 'core_mine_cost', 'mine_ore_1', 'mine_crit_1', 'ks_magnate']) {
      alloc(f, id);
    }
    const after = [resolveOf(f, 'mine.oreYield'), resolveOf(f, 'fishing.bite.speed')];
    f.dispose();
    results.push(
      check('keystone «Рудный магнат» [F8, DECISION op по пред-базе]: flat +100 на mine.oreYield (нулевая база — inc инертен, канон FIX-RIVEN) компонуется с «Золотой жилой» пути (+25): руда 0 → 125; клёв «вдвое реже» = flat −100 на fishing.bite.speed (ожидание = rolled × (1 − speed/100) → ×2 — частота −50% дословно карточки)', () =>
        before.join('/') === '0/0' && after.join('/') === '125/-100', {
        expected: 'руда 0 → 125 (жила 25 + магнат 100); клёв 0 → −100',
        actual: `${before.join('/')} → ${after.join('/')}`,
      }),
    );
  }

  // 12. [F8] «Человек-оркестр»: +1 работник на объект / личный сбор −25%
  {
    const f = await makeSeededPassivesGame('m14-orchestra', { player: playerDonor(15) });
    const before = [resolveOf(f, 'worker.limitPerObject'), resolveOf(f, 'farm.harvest.mult')];
    for (const id of ['core_xp_1', 'core_xp_2', 'core_inv_slots', 'core_luck', 'econ_luck_1', 'ks_orchestra']) {
      alloc(f, id);
    }
    const after = [resolveOf(f, 'worker.limitPerObject'), resolveOf(f, 'farm.harvest.mult')];
    f.dispose();
    results.push(
      check('keystone «Человек-оркестр» [F8]: flat +1 на worker.limitPerObject (1 → 2 — работник на объект) + inc −25% на farm.harvest.mult (100 → 75 — личный сбор); шинный канал (поведенческая проводка в M11/M05 — будущие сеансы, бриф: «чужой код НЕ участвует»)', () =>
        before.join('/') === '1/100' && after.join('/') === '2/75', {
        expected: '1/100 → 2/75',
        actual: `${before.join('/')} → ${after.join('/')}`,
      }),
    );
  }

  // 13. [F4] респек поузельный: очки возвращаются, resolve возвращается, respecTotal растёт
  {
    const f = await makeSeededPassivesGame('m14-respec-one', { player: playerDonor(5) });
    grantGold(f, 1000);
    const base = resolveOf(f, 'player.energy.max'); // 100 + бонус уровня M01
    alloc(f, 'core_energy_1');
    alloc(f, 'core_energy_2');
    const grown = resolveOf(f, 'player.energy.max');
    const rf = refund(f, 'core_energy_2');
    const back = resolveOf(f, 'player.energy.max');
    const line = pointsLine(f);
    f.dispose();
    results.push(
      check('респек поузельный [F4]: аллокация e1+e2 (+15 к макс), снятие e2 — очки возвращаются (spent 2 → 1, свободно растёт), resolve ДО/ПОСЛЕ равен (возврат к базе + e1), respecTotal 0 → 1; транзакция eventId passives.respec атомарна (золото списано)', () =>
        base > 0 && grown === base + 15 && rf.ok && back === base + 5 &&
        line.includes('потрачено: 1') && line.includes('сброшено респеком: 1') &&
        goldOf(f) < 1000, {
        expected: `+15 → +5 (относительно базы уровня); потрачено 1; сброшено 1; золото списано`,
        actual: `${base} → ${grown} → ${back}; ${line.split('·')[1]?.trim() ?? ''}`,
      }),
    );
  }

  // 14. [F4] респек полный: выделения пусты, очки все, resolve = базовым
  {
    const f = await makeSeededPassivesGame('m14-respec-all', { player: playerDonor(5) });
    grantGold(f, 1000);
    const base = resolveOf(f, 'player.energy.max');
    for (const id of ['core_energy_1', 'core_energy_2', 'core_energy_3']) {
      alloc(f, id);
    }
    const grown = resolveOf(f, 'player.energy.max');
    const rf = refund(f, 'all');
    const back = resolveOf(f, 'player.energy.max');
    const line = pointsLine(f);
    const slice = passivesSliceOfExport(f) as { allocated: unknown[]; respecTotal: number } | undefined;
    f.dispose();
    results.push(
      check('респек полный [F4]: refund all разрешён ВСЕГДА (снимает выделение целиком — связность не проверяется): выделения пусты, очки все свободны (потрачено 0), resolve = базовым уровня (возврат к базе+уровень), respecTotal += 3 (по числу снятых узлов); срез честен (allocated: [])', () =>
        base > 0 && grown === base + 15 && rf.ok && back === base &&
        line.includes('потрачено: 0') && line.includes('сброшено респеком: 3') &&
        slice !== undefined && Array.isArray(slice.allocated) && slice.allocated.length === 0 && slice.respecTotal === 3, {
        expected: `+15 → база; потрачено 0; сброшено 3; allocated []`,
        actual: `${base} → ${grown} → ${back}; ${line.split('·')[1]?.trim() ?? ''}`,
      }),
    );
  }

  // 15. [F4] кривая респека: 3 операции подряд (цены по данным) + отказ без золота
  {
    const noGold = await makeSeededPassivesGame('m14-curve', { player: playerDonor(5) });
    alloc(noGold, 'core_energy_1');
    alloc(noGold, 'core_energy_2');
    alloc(noGold, 'core_energy_3');
    const broke = refund(noGold, 'core_energy_3');
    noGold.dispose();
    const f = await makeSeededPassivesGame('m14-curve-2', { player: playerDonor(5) });
    grantGold(f, 1000);
    alloc(f, 'core_energy_1');
    alloc(f, 'core_energy_2');
    alloc(f, 'core_energy_3');
    const walletStart = goldOf(f);
    const r1 = refund(f, 'core_energy_3');
    const c1 = walletStart - goldOf(f);
    const r2 = refund(f, 'core_energy_2');
    const c2 = walletStart - goldOf(f) - c1;
    const r3 = refund(f, 'core_energy_1');
    const c3 = walletStart - goldOf(f) - c1 - c2;
    const oracle = [respecCostOf(PASSIVES_RESPEC, 0), respecCostOf(PASSIVES_RESPEC, 1), respecCostOf(PASSIVES_RESPEC, 2)];
    f.dispose();
    results.push(
      check('кривая респека — 3 операции подряд [F4]: стоимость = round(50 × 1.5^respecTotal) ПО ДАННЫМ content/passives: 50 → 75 → 113 (кривая растёт от накопленного числа сброшенных); нехватка золота — честный отказ (транзакция не проходит, состояние не тронуто)', () =>
        !broke.ok && broke.error.includes('не оплачен') &&
        r1.ok && r2.ok && r3.ok &&
        [c1, c2, c3].join('/') === oracle.join('/') && oracle.join('/') === '50/75/113', {
        expected: 'цены 50/75/113; без золота — отказ',
        actual: `цены ${c1}/${c2}/${c3} (оракул ${oracle.join('/')}); без золота=${!broke.ok}`,
      }),
    );
  }

  // 16. [F4] связность: узел-мост — честный отказ; лист — ок
  {
    const f = await makeSeededPassivesGame('m14-bridge', { player: playerDonor(5) });
    grantGold(f, 1000);
    alloc(f, 'core_energy_1');
    alloc(f, 'core_energy_2');
    alloc(f, 'core_energy_3');
    const bridge = refund(f, 'core_energy_2');
    const bridge2 = refund(f, 'core_energy_1');
    const leaf = refund(f, 'core_energy_3');
    const thenMiddle = refund(f, 'core_energy_2');
    f.dispose();
    results.push(
      check('инвариант связности респека [F4, DECISION]: снятие узла-моста (e2 держит e3; e1 держит цепь) — честный отказ с причиной; лист (e3) снимается; после снятия листа бывший мост становится листом и снимается; полный refund all — всегда разрешён', () =>
        !bridge.ok && bridge.error.includes('разрывает связность') &&
        !bridge2.ok && bridge2.error.includes('разрывает связность') &&
        leaf.ok && thenMiddle.ok, {
        expected: 'мост ×2 — отказ; лист — ок; затем бывший мост — ок',
        actual: `мост=${!bridge.ok}; мост2=${!bridge2.ok}; лист=${leaf.ok}; затем=${thenMiddle.ok}`,
      }),
    );
  }

  // 17. каналы очков ×3 живьём: bossKilled +5 / achievement +2 / levelUp +1
  {
    const f = await makeSeededPassivesGame('m14-channels', { player: playerDonor(1) });
    f.game.bus.publish('mine.bossKilled', { bossId: 'spider_queen', layer: 1 });
    let line = pointsLine(f);
    const afterBoss = line.includes('всего заработано: 6');
    f.game.bus.publish('achievement.unlocked', { id: 'ach_agronomist', name: 'Агроном', rewards: [] });
    line = pointsLine(f);
    const afterAch = line.includes('всего заработано: 8');
    // босс уже дал +100 XP (канал M01 progression «босс 100 XP»): 100 + 130 = 230
    // → ровно ОДИН подъём уровня (115), остаток 115 < 132.25 — второго нет
    (f.player['player.addXp'] as (n: number, s: string) => unknown)(130, 'selfcheck');
    line = pointsLine(f);
    const afterLevel = line.includes('всего заработано: 9');
    f.dispose();
    results.push(
      check('каналы очков ×3 живьём [бриф §0]: mine.bossKilled → +5 (уровень 1 ретро 1 + 5 = 6; флаг ачивки босса ещё НЕ открыт — ретро не мог посчитать килл, событие НЕ пропускается); achievement.unlocked «крупной» по маркеру данных → +2 (Агроном); player.levelUp → +1 (босс дал +100 XP каналом M01, добавка 130 → ровно один подъём); подписки манифеста ×3', () =>
        afterBoss && afterAch && afterLevel, {
        expected: '6 → 8 → 9',
        actual: `босс=${afterBoss ? 6 : '?'}; ачивка=${afterAch ? 8 : '?'}; уровень=${afterLevel ? 9 : '?'}`,
      }),
    );
  }

  // 18. [F3] canReach: BFS-дистанция от (старт ∪ выделенные)
  {
    const f = await makeSeededPassivesGame('m14-reach', { player: playerDonor(5) });
    const far = viewText(f.passives['passives.canReach']('ks_magnate') as R<ViewShape>);
    alloc(f, 'core_energy_1');
    const near = viewText(f.passives['passives.canReach']('core_energy_2') as R<ViewShape>);
    const mine = viewText(f.passives['passives.canReach']('core_energy_1') as R<ViewShape>);
    const start = viewText(f.passives['passives.canReach']('core_start') as R<ViewShape>);
    f.dispose();
    results.push(
      check('canReach — витрина достижимости [F3]: BFS по рёбрам от (старт ∪ выделенные): keystone глубины 7 выделений ДО аллокаций; после выделения e1 соседний e2 — 1 выделение; выделенный узел — «уже выделен»; старт-узел — «не требует выделения»', () =>
        far.includes('7 выделений') &&
        near.includes('1 выделений') && near.includes('можно выделить') &&
        mine.includes('уже выделен') &&
        start.includes('не требует'), {
        expected: '7 → (после e1) 1; выделен; старт-якорь',
        actual: `далёкий=${far.includes('7') ? '7' : '?'}; ближний=${near.includes('1 выделений') ? '1' : '?'}`,
      }),
    );
  }

  // 19. [F1] roundtrip с allocated байт-в-байт (оба режима: load → export)
  {
    const donorSlice = {
      v: 1,
      points: 20,
      spent: 3,
      allocated: ['core_energy_1', 'core_energy_2', 'core_energy_3'],
      respecTotal: 2,
    };
    // уровень 3 < 5: ensureDay не открывает уровневых ачивок живьём (канал
    // achievement.unlocked не добавляет очков — донор стабилен)
    const f = await makeSeededPassivesGame('m14-roundtrip', {
      player: playerDonor(3),
      passives: donorSlice,
    });
    const slice = passivesSliceOfExport(f);
    const byteByte = JSON.stringify(slice) === JSON.stringify(donorSlice);
    const line = pointsLine(f);
    const base = resolveOf(f, 'player.energy.max');
    const providerAlive = resolveOf(f, 'player.energy.max') === base && base === 100 + 4 + 15;
    f.dispose();
    results.push(
      check('roundtrip с allocated байт-в-байт [F1]: донор с выделениями (points 20 / spent 3 / allocated ×3 / respecTotal 2; игрок уровня 3 — ниже порога живых уровневых ачивок) → load (sanitize: неизвестные отсеяны, spent пересчитан инвариантом Σ стоимостей) → export — канонический порядок полей сохранён байт-в-байт; провайдер действует после загрузки (макс = база+уровень+15 флэтов = 119 — модификаторы выделенных узлов в резолвах)', () =>
        byteByte && providerAlive && line.includes('потрачено: 3'), {
        expected: 'срез байт-в-байт; потрачено 3; макс 119',
        actual: `байт-в-байт=${byteByte}; провайдер=${providerAlive ? base : 'НЕ действует'}; ${line.split('·')[1]?.trim() ?? ''}`,
      }),
    );
  }


  return results;
}
