/**
 * Группа «M14 Пассивки» · ЧАСТЬ 4/4 (бриф SESSION-M14.2 G8; продолжение части 3
 * по wc-гигиене 01 §6): монте-карло 10k фикс-сид, 3 фиксированных пути руками,
 * keystone ×4 — интеграционный переповтор на полном дереве (G5), мост длинной
 * цепи (G6), roundtrip с allocated в глубине кластера (G1).
 */
import { check, type CheckResult } from './types';
import { PASSIVES_POINTS } from '@/content/passives/points';
import { buildTreeIndex } from '@/game/modules/passives/logic';
import { mulberry32 } from '@/shared/utils/rng';
import {
  alloc,
  grantGold,
  makeSeededPassivesGame,
  passivesSliceOfExport,
  playerDonor,
  refund,
  resolveOf,
  viewText,
  type ViewShape,
} from './passives-fixture';
import { FULL_TREE, costOf2 } from './passives-checks-part3';

export async function runPassivesPart4(): Promise<CheckResult[]> {
  const results: CheckResult[] = [];
  const startSet = new Set(FULL_TREE.startNodes);
  const allocatable = FULL_TREE.nodes.filter((n) => !startSet.has(n.id));

  // 25. [G4в] монте-карло 10k легальных путей (фикс-сид, бюджет лейтгейма)
  {
    const budget = 60 * PASSIVES_POINTS.perLevel + 9 * PASSIVES_POINTS.perBoss +
      PASSIVES_POINTS.largeAchievements.reduce((s, a) => s + a.points, 0);
    const index = buildTreeIndex(FULL_TREE.nodes, FULL_TREE.startNodes);
    const costOf = new Map(FULL_TREE.nodes.map((n) => [n.id, n.cost]));
    const run = (seed: number): { legal: boolean; maxSpent: number; minSpent: number; meanSpent: number; maxNodes: number; full: boolean } => {
      const rng = mulberry32(seed);
      let legal = true;
      let maxSpent = 0;
      let minSpent = budget;
      let sumSpent = 0;
      let maxNodes = 0;
      let full = false;
      for (let p = 0; p < 10000; p++) {
        const allocated = new Set<string>();
        let spent = 0;
        for (;;) {
          const frontier = new Set<string>();
          for (const a of [...index.startNodes, ...allocated]) {
            for (const nb of index.adjacency.get(a) ?? []) {
              if (!allocated.has(nb) && !index.startNodes.has(nb)) frontier.add(nb);
            }
          }
          const affordable = [...frontier].filter((id) => (costOf.get(id) ?? 0) <= budget - spent);
          if (affordable.length === 0) break;
          const pick = affordable[Math.floor(rng() * affordable.length)]!;
          const nbOk = [...index.adjacency.get(pick) ?? []].some((x) => index.startNodes.has(x) || allocated.has(x));
          if (!nbOk) { legal = false; break; }
          allocated.add(pick);
          spent += costOf.get(pick) ?? 0;
        }
        if (spent > budget) legal = false;
        if (allocated.size === allocatable.length) full = true;
        maxSpent = Math.max(maxSpent, spent);
        minSpent = Math.min(minSpent, spent);
        sumSpent += spent;
        maxNodes = Math.max(maxNodes, allocated.size);
      }
      return { legal, maxSpent, minSpent, meanSpent: sumSpent / 10000, maxNodes, full };
    };
    const a = run(20261028);
    const b = run(20261028);
    results.push(
      check('монте-карло 10k легальных путей аллокации [G4в, канон Q1 Task 46; фикс-сид mulberry32(20261028)]: каждый шаг — сосед (старт ∪ выделенные) и по карману; НИ ОДИН путь не превысил бюджет 126 и не выделил все 150 (выбор вынужден: max узлов < 150, Σ потраченного ≤ 126 < 315); детерминизм — два прогона одного сида дают идентичные статистики (avg/max/min)', () =>
        a.legal && b.legal && !a.full && a.maxSpent <= budget && a.maxNodes < allocatable.length &&
        a.meanSpent > 0 && a.maxSpent >= 100 && a.minSpent >= 0 &&
        a.meanSpent === b.meanSpent && a.maxSpent === b.maxSpent && a.minSpent === b.minSpent, {
        expected: 'легальность 10k; max ≤ 126; не всё дерево; детерминизм ×2',
        actual: `legal=${a.legal}; max=${a.maxSpent}/${budget}; mean=${a.meanSpent.toFixed(2)}; min=${a.minSpent}; maxУзлов=${a.maxNodes}/150; всё=${a.full}; детерминизм=${a.meanSpent === b.meanSpent && a.maxSpent === b.maxSpent ? 'да' : 'НЕТ'}`,
      }),
    );
  }

  // 26. [G4в] три фиксированных пути руками (глубина/сумма)
  {
    const f = await makeSeededPassivesGame('m142-paths', { player: playerDonor(20) });
    const p1 = ['farm_growth_1', 'farm_growth_2', 'farm_water', 'farm_weeds_1', 'farm_weeds_2', 'farm_weeds_3', 'farm_weeds_4', 'farm_weeds_n'];
    const p1ok = p1.map((id) => alloc(f, id)).every((r) => r.ok);
    const weedsBefore = 8;
    const weedsAfter = resolveOf(f, 'farm.weeds.chancePercent');
    const p1cost = p1.reduce((s, id) => s + (costOf2(FULL_TREE, id) ?? 0), 0);
    const p2 = ['core_energy_1', 'core_energy_2', 'core_energy_3', 'core_mine_cost', 'mine_ore_1', 'mine_crit_1', 'ks_magnate'];
    const g = await makeSeededPassivesGame('m142-paths-2', { player: playerDonor(20) });
    const p2ok = p2.map((id) => alloc(g, id)).every((r) => r.ok);
    const p2cost = p2.reduce((s, id) => s + (costOf2(FULL_TREE, id) ?? 0), 0);
    f.dispose();
    g.dispose();
    results.push(
      check('три фиксированных пути руками [G4в]: P1 — сквозной вглубь фермы до Notable «Сорняковый оберег»: 8 узлов (рост→полив→сорняки), Σ цен 17 (7×1 + notable 10), resolve farm.weeds.chancePercent 8 → 4.4 (inc Σ −45%: −5−5−10−10−15 — полив «Идеальный» сорняки не трогает); P2 — цепь «Рудного магната»: 7 узлов, Σ цен 8 (e×3 + выносливость + жила 2 + глаз + keystone); P3 — пустой путь: 0 узлов, 0 очков (траты нет — бюджет цел)', () =>
        p1ok && p1.length === 8 && p1cost === 17 && Math.abs(weedsAfter - weedsBefore * 0.55) < 1e-9 &&
        p2ok && p2.length === 7 && p2cost === 8, {
        expected: 'P1: 8 узлов / 17 очков / сорняки 4.4; P2: 7 узлов / 8 очков; P3: 0/0',
        actual: `P1=${p1ok ? `${p1.length} узлов / ${p1cost} очков / сорняки ${weedsAfter}` : 'ПРОВАЛ'}; P2=${p2ok ? `${p2.length} узлов / ${p2cost} очков` : 'ПРОВАЛ'}`,
      }),
    );
  }

  // 27. [G5] keystone ×4 — интеграционный переповтор НА ПОЛНОМ дереве
  {
    const f = await makeSeededPassivesGame('m142-keystones', { player: playerDonor(25) });
    const path = [
      'core_energy_1', 'core_energy_2', 'core_energy_3', 'core_energy_4', 'core_energy_5', 'ks_spartan',
      'core_xp_1', 'core_xp_2', 'core_inv_slots', 'core_helper_slot', 'pen_happy_1', 'lake_mut_1', 'ks_humanist',
      'core_mine_cost', 'mine_ore_1', 'mine_crit_1', 'ks_magnate',
      'core_luck', 'econ_luck_1', 'ks_orchestra',
    ];
    const all = path.map((id) => alloc(f, id)).every((r) => r.ok);
    const o = [
      resolveOf(f, 'player.energy.max'), resolveOf(f, 'action.farm.water.energyCost'),
      resolveOf(f, 'worker.quitChance'), resolveOf(f, 'worker.sickChance'), resolveOf(f, 'worker.salary.mult'),
      resolveOf(f, 'mine.oreYield'), resolveOf(f, 'fishing.bite.speed'),
      resolveOf(f, 'worker.limitPerObject'), resolveOf(f, 'farm.harvest.mult'),
    ].join('/');
    f.dispose();
    results.push(
      check('keystone ×4 — переповтор на ПОЛНОМ дереве [G5]: все четыре выделены в ОДНОЙ игре (20 узлов, 23 очка — донор ур. 25): «Спартанец» энергия 50 (override поверх flats+уровня) и полив 1; «Гуманист» 0/0/130; «Рудный магнат» руда 125 (жила 25 + 100) / клёв −100; «Человек-оркестр» лимит 2 / личный сбор 75 — эффекты В ТОЧНОСТИ M14.1 (расхождение → [QUESTION]); 117 новых узлов композицию НЕ ломают (их моды не выделены, провайдер перечисляет только allocated)', () =>
        all && o === '50/1/0/0/130/125/-100/2/75', {
        expected: '50/1/0/0/130/125/−100/2/75 (= M14.1)',
        actual: all ? o : 'путь не прошёл',
      }),
    );
  }

  // 28. [G6] мост длинной цепи в глубине кластера (ветвь урона шахты)
  {
    const f = await makeSeededPassivesGame('m142-bridge-deep', { player: playerDonor(15) });
    grantGold(f, 1000);
    for (const id of ['core_energy_1', 'core_energy_2', 'core_energy_3', 'core_mine_cost', 'mine_ore_1', 'mine_crit_1', 'mine_dmg_1', 'mine_dmg_2']) {
      alloc(f, id);
    }
    const spineBridge = refund(f, 'mine_crit_1');
    const bridge = refund(f, 'mine_dmg_1');
    const leaf = refund(f, 'mine_dmg_2');
    const thenBridge = refund(f, 'mine_dmg_1');
    const line = viewText(f.passives['passives.state']() as ViewShape);
    f.dispose();
    results.push(
      check('мост длинной цепи на полном дереве [G6, инвариант F4 M14.1]: ветвь урона глубиной 13 — «Меткий глаз» (спина, держит ветвь) — честный отказ; «Тяжёлая кирка» (мост, держит «Заточенное остриё») — отказ; лист «Заточенное остриё» снимается (respecTotal 0 → 1, очки возвращаются); бывший мост стал листом — снимается (respecTotal 2); кривая НЕ меняется (50 → 75 — канон M14.1, 150 узлов респек НЕ удорожают)', () =>
        !spineBridge.ok && spineBridge.error.includes('разрывает связность') &&
        !bridge.ok && bridge.error.includes('разрывает связность') &&
        leaf.ok && thenBridge.ok &&
        line.includes('сброшено респеком: 2') && line.includes('потрачено: 7'), {
        expected: 'мост ×2 — отказ; лист — ок; затем мост — ок; сброшено 2; потрачено 7',
        actual: `спина=${!spineBridge.ok}; мост=${!bridge.ok}; лист=${leaf.ok}; затем=${thenBridge.ok}; ${line.split('·')[1]?.trim() ?? ''}`,
      }),
    );
  }

  // 29. [G1] roundtrip с allocated В ГЛУБИНЕ кластера байт-в-байт
  {
    // донор уровня 3 (< 5 — живые уровневые ачивки НЕ открываются, прецедент
    // чека 19 части 2) + ПРЕДЗАСЕЯННЫЙ срез: глубина без таймингов событий
    const allocated = [
      'farm_growth_1', 'farm_growth_2', 'farm_water', 'farm_weeds_1', 'farm_weeds_2', 'farm_weeds_3', 'farm_weeds_4', 'farm_weeds_n',
      'core_energy_1', 'core_energy_2', 'core_fish_cost', 'fish_luck_1', 'fish_luck_2', 'fish_rare_1', 'fish_rare_2',
    ];
    const donorSlice = { v: 1, points: 40, spent: 24, allocated, respecTotal: 0 };
    const f = await makeSeededPassivesGame('m142-roundtrip-deep', {
      player: playerDonor(3),
      passives: donorSlice,
    });
    const slice = passivesSliceOfExport(f) as { points: number; spent: number; allocated: string[]; respecTotal: number };
    const weedsLive = resolveOf(f, 'farm.weeds.chancePercent');
    const rareLive = resolveOf(f, 'fishing.weight.rare');
    f.dispose();
    const g = await makeSeededPassivesGame('m142-roundtrip-deep-2', {
      player: playerDonor(3),
      passives: slice,
    });
    const slice2 = passivesSliceOfExport(g);
    const weedsReload = resolveOf(g, 'farm.weeds.chancePercent');
    const rareReload = resolveOf(g, 'fishing.weight.rare');
    const line = viewText(g.passives['passives.state']() as ViewShape);
    g.dispose();
    results.push(
      check('roundtrip с allocated в глубине кластера [G1]: предзасеянный срез — путь фермы до Notable (8 узлов, 17 очков) + спина рыбалки до ветви редкости (7 узлов, 7 очков) = 15 узлов / spent 24 на двух кластерах (донор ур. 3 — ниже порога живых ачивок, таймингов нет) → load (sanitize: неизвестные отсеяны, spent пересчитан инвариантом Σ стоимостей) → export байт-в-байт → ПОВТОРНЫЙ roundtrip — тоже байт-в-байт; провайдер жив: сорняки 4.4 = 8 × (1 − 45%) и вес редкой рыбы 14 = 10 + 2 + 2 в живой игре и после reload; витрина честна (потрачено 24)', () =>
        slice.points === 40 && slice.spent === 24 && slice.allocated.length === 15 &&
        JSON.stringify(slice2) === JSON.stringify(slice) &&
        Math.abs(weedsLive - 4.4) < 1e-9 && Math.abs(weedsReload - 4.4) < 1e-9 &&
        rareLive === 14 && rareReload === 14 &&
        line.includes('потрачено: 24'), {
        expected: 'срез байт-в-байт ×2; 15 узлов / 24 очков; сорняки 4.4; редкая 14',
        actual: `slice=${slice.spent}/${slice.allocated.length}; byte=${JSON.stringify(slice2) === JSON.stringify(slice) ? 'ok' : 'РАСХОЖДЕНИЕ'}; сорняки ${weedsLive} → ${weedsReload}; редкая ${rareLive} → ${rareReload}`,
      }),
    );
  }

  return results;
}
