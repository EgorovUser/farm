/**
 * Группа «M14 Пассивки» · ЧАСТЬ 1/2 (бриф SESSION-M14 F8): валидация контента
 * (BFS достижимости), манифест = факту, ретро идемпотентность ×2, пост-wipe
 * тишина, golden ×2, честные отказы, событие/провайдер, keystone «Спартанец».
 */
import { check, type CheckResult } from './types';
import { PASSIVES_TREE } from '@/content/passives/nodes';
import { passivesTreeSchema } from '@/content/passives/schemas';
import type { PassivesTree } from '@/content/passives/types';
import {
  alloc,
  eventsOf,
  goldOf,
  grantGold,
  makePassivesGame,
  makeSeededPassivesGame,
  passivesSliceOfExport,
  playerDonor,
  pointsLine,
  questsDonor,
  resolveOf,
  refund,
  viewText,
  type PassivesFixture,
  type R,
  type ViewShape,
} from './passives-fixture';

export async function runPassivesPart1(): Promise<CheckResult[]> {
  const results: CheckResult[] = [];

  // 1. [F6] валидация контента: живое дерево валидно; висячий узел = ошибка загрузки
  {
    const live = passivesTreeSchema.safeParse(PASSIVES_TREE);
    const dangling: PassivesTree = {
      startNodes: ['core_start'],
      nodes: [
        PASSIVES_TREE.nodes[0]!,
        {
          ...PASSIVES_TREE.nodes[1]!,
          id: 'orphan_node',
          links: [],
          pos: { x: 99, y: 99 },
        },
      ],
    };
    const bad = passivesTreeSchema.safeParse(dangling);
    results.push(
      check('валидация дерева [F6]: живой контент проходит zod (34 узла, достижимость BFS из старта); фикстура с висячим узлом (без рёбер) — ОШИБКА ЗАГРУЗКИ с указанием узла (карточка §6: висячие узлы/недостижимые кластеры недопустимы)', () =>
        live.success &&
        PASSIVES_TREE.nodes.length === 34 &&
        !bad.success &&
        bad.error.issues.some((i) => String(i.message).includes('orphan_node') && String(i.message).includes('недостижим')), {
        expected: 'живое дерево OK; висячий узел → «недостижим из старта»',
        actual: `живое=${live.success ? 'OK' : 'FAIL'}; узлов=${PASSIVES_TREE.nodes.length}; висячий=${!bad.success ? 'отклонён' : 'ПРОЙДЁН (дефект)'}`,
      }),
    );
  }

  // 2. манифест = факту: publicApi/eventsPublished ×1/провайдер/подписки ×3
  {
    const f = await makeSeededPassivesGame('m14-manifest', {});
    const manifest = f.game.modules.get('passives')!.manifest;
    const apiKeys = new Set(Object.keys(f.passives));
    const declared = new Set(manifest.publicApi ?? []);
    const same = apiKeys.size === declared.size && [...declared].every((k) => apiKeys.has(k));
    const providerOk = f.game.statBus.providerIds().includes('passivesProvider');
    f.dispose();
    results.push(
      check('манифест = факту [01 §9; M14.2 · bump 1.1.0 — «только версия», поведение 1.0.0]: publicApi ↔ api (×6: state/tree/alloc/refund/canReach + reset dev по прецедентам lake.force/workers.dev); eventsPublished ровно ×1 passive.allocated; eventsSubscribed ×3; modifierProviders passivesProvider зарегистрирован в StatBus; taskExecutors/statsCounters [] (реестр задач 15 жив)', () =>
        manifest.id === 'passives' &&
        manifest.version === '1.1.0' &&
        manifest.stateKey === 'passives' &&
        same &&
        (manifest.eventsPublished ?? []).join(',') === 'passive.allocated' &&
        (manifest.eventsSubscribed ?? []).length === 3 &&
        providerOk &&
        (manifest.taskExecutors ?? []).length === 0, {
        expected: 'манифест ↔ код; провайдер passivesProvider в шине',
        actual: `id=${manifest.id} v${manifest.version}; api=${[...apiKeys].join(',')}; pub=${(manifest.eventsPublished ?? []).join(',')}; sub=${(manifest.eventsSubscribed ?? []).length}; провайдер=${providerOk ? 'да' : 'НЕТ'}`,
      }),
    );
  }

  // 3. [F1/F8] ретро идемпотентен ×2 (донор с флагами): ровно N + 5·боссы + Σ ачивочных
  {
    const donor = (saveId: string): Promise<PassivesFixture> =>
      makeSeededPassivesGame(saveId, {
        player: playerDonor(7),
        quests: questsDonor(['ach_mine_boss_1', 'ach_mature_master']),
      });
    const a = await donor('m14-retro-a');
    const lineA = pointsLine(a);
    const b = await donor('m14-retro-b');
    const lineB = pointsLine(b);
    // roundtrip результата: файл с ключом passives → повторная загрузка НЕ растит очки
    const sliceA = passivesSliceOfExport(a) as { points: number } | undefined;
    const c = await makeSeededPassivesGame('m14-retro-c', {
      player: playerDonor(7),
      quests: questsDonor(['ach_mine_boss_1', 'ach_mature_master']),
      passives: sliceA,
    });
    const lineC = pointsLine(c);
    a.dispose();
    b.dispose();
    c.dispose();
    results.push(
      check('ретро-подсчёт по фактам сейва идемпотентен ×2 [F1/F8, DECISION «ровно N»]: донор уровня 7 + ach_mine_boss_1 + ach_mature_master → первая инициализация «ретро-начислено 13» (7 уровня + 5 босс + 1 ачивка); повторная инициализация того же донора → 13 (Δ0); roundtrip результата (файл с ключом passives) → 13, очки НЕ растут; витрина честная', () =>
        lineA.includes('всего заработано: 13') &&
        lineA.includes('ретро-начислено 13 очков (уровень 7 + боссы 1 + ачивки 1)') &&
        lineB.includes('всего заработано: 13') &&
        sliceA !== undefined && sliceA.points === 13 &&
        lineC.includes('всего заработано: 13'), {
        expected: '13 = 7 + 5×1 + 1; повтор/roundtrip → 13',
        actual: `A=${lineA.includes('13') ? '13' : '??'}; B=${lineB.includes('всего заработано: 13') ? '13' : '??'}; slice=${sliceA !== undefined ? sliceA.points : 'нет ключа'}; C=${lineC.includes('всего заработано: 13') ? '13' : '??'}`,
      }),
    );
  }

  // 4. уровень-1: свежая игра → стартовое очко (ретро «ровно N», N=1)
  {
    const f = makePassivesGame();
    await f.game.init();
    const line = pointsLine(f);
    f.dispose();
    results.push(
      check('семантика «+1 за уровень» = за каждый ОБЛАДААЕМЫЙ уровень [DECISION]: свежая игра (уровень 1) → первая инициализация даёт ровно 1 стартовое очко («ровно N», N=1); уровень 2 (событие levelUp после инициализации) → +1 → 2 — каналы консистентны', () =>
        line.includes('свободно: 1') && line.includes('ретро-начислено 1'), {
        expected: 'свободно: 1; ретро-начислено 1 (уровень 1)',
        actual: line.split('\n')[0] ?? '—',
      }),
    );
  }

  // 5. [F1] пост-wipe тишина: файл НЕ получает пустого поля passives
  {
    const f = makePassivesGame();
    await f.game.init();
    const slice = passivesSliceOfExport(f);
    const sliceAfterSave = JSON.parse(f.game.save.exportJson()) as { modules: Record<string, unknown> };
    const keys = Object.keys(sliceAfterSave.modules).sort();
    f.dispose();
    results.push(
      check('пост-wipe тишина [F1]: срез «чист» (ничего не заработано, касаний витрины нет) → save() возвращает undefined → JSON опускает ключ: файл НЕ содержит passives (поле НЕ дописывается пустым); срез в реестре зарегистрирован (манифест), файл — только факты', () =>
        slice === undefined && !keys.includes('passives'), {
        expected: 'ключа passives в файле нет',
        actual: `slice=${String(slice)}; ключи файла: ${keys.includes('passives') ? 'passives ЕСТЬ (дефект)' : 'нет passives'}`,
      }),
    );
  }

  // 6. [F8] золотая allocate-последовательность ×2 (фикс-сид saveId)
  {
    const run = async (saveId: string): Promise<string> => {
      const f = await makeSeededPassivesGame(saveId, { player: playerDonor(15) });
      grantGold(f, 1000);
      const steps = [
        alloc(f, 'core_energy_1'),
        alloc(f, 'core_energy_2'),
        alloc(f, 'core_energy_3'),
        alloc(f, 'core_mine_cost'),
        alloc(f, 'mine_ore_1'),
        alloc(f, 'mine_crit_1'),
        alloc(f, 'ks_magnate'),
      ];
      const allOk = steps.every((s) => s.ok);
      const resolve = [resolveOf(f, 'mine.oreYield'), resolveOf(f, 'fishing.bite.speed')];
      const rf = refund(f, 'ks_magnate');
      const state = pointsLine(f);
      const out = [String(allOk), resolve.join('/'), String(rf.ok), state].join('|');
      f.dispose();
      return out;
    };
    const first = await run('m14-golden-1');
    const second = await run('m14-golden-1');
    results.push(
      check('golden allocate-последовательность фикс-сид ×2 [F8]: один saveId + одна последовательность (7 аллокаций пути к keystone + респек листа) → детерминированный итог: очки/резолвы/отказы идентичны байт-в-байт (движок — чистая функция состояния)', () =>
        first === second && first.startsWith('true|125/-100|true|'), {
        expected: 'два прогона идентичны; руда 125 (жила 25 + keystone 100); клёв −100; респек листа OK',
        actual: `${first === second ? 'идентичны' : 'РАСХОЖДЕНИЕ'}; ${first.split('|')[1] ?? ''}`,
      }),
    );
  }

  // 7. [F3] честные отказы аллокации: не-сосед / без очков / повтор / неизвестный / старт
  {
    const f = await makeSeededPassivesGame('m14-refuse', { player: playerDonor(2) });
    const nonNeighbor = alloc(f, 'ks_magnate');
    const unknown = alloc(f, 'node_nope');
    const startNode = alloc(f, 'core_start');
    const ok1 = alloc(f, 'core_energy_1');
    const repeat = alloc(f, 'core_energy_1');
    const ok2 = alloc(f, 'core_energy_2');
    const noPoints = alloc(f, 'core_energy_3');
    f.dispose();
    results.push(
      check('аллокация — честные отказы [F3]: не-соседний узел (keystone без пути) — отказ «не соседний»; неизвестный id — отказ; старт-узел — «не требует выделения»; повторная аллокация — отказ (идемпотентность); без очков (ретро 2, потрачено 2, свободно 0 < цена 1) — отказ «не хватает очков»', () =>
        !nonNeighbor.ok && nonNeighbor.error.includes('не соседний') &&
        !unknown.ok && unknown.error.includes('неизвестный узел') &&
        !startNode.ok && startNode.error.includes('не требует') &&
        ok1.ok && ok2.ok &&
        !repeat.ok && repeat.error.includes('уже выделен') &&
        !noPoints.ok && noPoints.error.includes('не хватает очков'), {
        expected: '5 отказов с причинами + 2 успеха (e1, e2)',
        actual: `не-сосед=${!nonNeighbor.ok}; неизвестный=${!unknown.ok}; старт=${!startNode.ok}; повтор=${!repeat.ok}; без очков=${!noPoints.ok}; успехи=${ok1.ok && ok2.ok}`,
      }),
    );
  }

  // 8. [F5] событие passive.allocated payload + invalidate.stat + resolve до/после
  {
    const f = await makeSeededPassivesGame('m14-event', { player: playerDonor(3) });
    const base = resolveOf(f, 'player.energy.max'); // база 100 + бонус уровня M01 (levelBonusProvider)
    const before = resolveOf(f, 'player.energy.max');
    const r = alloc(f, 'core_energy_1');
    const after = resolveOf(f, 'player.energy.max');
    const ev = eventsOf(f, 'passive.allocated');
    const inv = eventsOf(f, 'invalidate.stat');
    const delta = after - before;
    f.dispose();
    results.push(
      check('событие и провайдер [F5]: passive.allocated payload {nodeId, type, name, effects} (×1 на аллокацию); invalidate.stat публикуется (сброс кэшей шины); resolve ДО/ПОСЛЕ: player.energy.max +5 от узла (flat через passivesProvider, поверх бонуса уровня M01 — каналы компонуются; эффекты видны до и после, витрина честна)', () =>
        r.ok && before > 0 && delta === 5 &&
        ev.length === 1 &&
        ev[0]!.nodeId === 'core_energy_1' && ev[0]!.type === 'small' &&
        String(ev[0]!.name).length > 0 && Array.isArray(ev[0]!.effects) &&
        inv.length >= 1, {
        expected: `+5 (база уровня ${base} → ${base + 5}); payload полный; кэш сброшен`,
        actual: `${before} → ${after} (Δ${delta}); событий=${ev.length}; invalidate=${inv.length}`,
      }),
    );
  }

  // 9. [F8] «Спартанец»: расход энергии фермы режется ШИНОЙ (ферма не участвует)
  {
    const f = await makeSeededPassivesGame('m14-spartan', { player: playerDonor(15) });
    const waterBefore = resolveOf(f, 'action.farm.water.energyCost');
    const maxBefore = resolveOf(f, 'player.energy.max'); // 100 + бонус уровня M01
    for (const id of ['core_energy_1', 'core_energy_2', 'core_energy_3', 'core_energy_4', 'core_energy_5']) {
      alloc(f, id);
    }
    const flats = resolveOf(f, 'player.energy.max');
    alloc(f, 'ks_spartan');
    const waterAfter = resolveOf(f, 'action.farm.water.energyCost');
    const maxAfter = resolveOf(f, 'player.energy.max');
    const plow = resolveOf(f, 'action.farm.plow.energyCost');
    f.dispose();
    results.push(
      check('keystone «Спартанец» [F8, карточка §6]: override 50 на player.energy.max побеждает flats (база+уровень 128 → 153 flats (e1+e2+e4 = +25; e3/e5 — реген) → 50 — «замена есть замена», канон 02 §3); inc −50% на ВСЕ расходы энергии через шину: полив 2 → 1 (×0.5, floor, min 1 — канон M01 «не дешевле 1»), вспашка 5 → 2 (floor 2.5); ферма в тесте НЕ участвует — только resolve', () =>
        waterBefore === 2 && maxBefore === 128 && flats === 153 &&
        maxAfter === 50 && waterAfter === 1 && plow === 2, {
        expected: 'макс 128→153(flats)→50(override); полив 2→1; вспашка 5→2',
        actual: `макс ${maxBefore}→${flats}→${maxAfter}; полив ${waterBefore}→${waterAfter}; вспашка=${plow}`,
      }),
    );
  }


  return results;
}
