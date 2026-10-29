/**
 * Группа «M14 Пассивки» · ЧАСТЬ 3/4 (бриф SESSION-M14.2 G8, Δ = 10 ≥ 8;
 * распил по wc-гигиене 01 §6 — прецедент part1/part2): полное дерево 150 —
 * валидация графа/квот, zod достижимости, витрина 6 кластеров, бюджет G4
 * (Σ цен ≥ 300, лейтгейм 120–150). Экспортирует FULL_TREE/QUOTAS для части 4.
 *
 * [QUESTION M142-Q1 · off-by-one брифа]: «Σ = 34 + 116 НОВЫХ = 150» считает
 * старт-якорь в существующих (34 = 33 allocatable + якорь), но правило того же
 * пункта «Счёт = все allocatable узлы; старт-якорь — вне счёта» исключает его
 * из Σ: 150 − 33 = 117 новых. Квоты карточки §4 (30/25/30/25/20/20) + правило
 * якоря — ратифицированный канон → новых 117, Σ allocatable = 150 машинно
 * (чек 20); «116» невыполнимо одновременно с квотами — задокументировано
 * открыто, молчаливых отклонений нет (протокол несогласия, STOP по пункту).
 */
import { check, type CheckResult } from './types';
import { PASSIVES_TREE } from '@/content/passives/nodes';
import { FARM_NODES } from '@/content/passives/nodes-farm';
import { FISH_NODES } from '@/content/passives/nodes-fish';
import { MINE_NODES } from '@/content/passives/nodes-mine';
import { ECONOMY_NODES } from '@/content/passives/nodes-economy';
import { ANIMALS_NODES } from '@/content/passives/nodes-animals';
import { PASSIVES_POINTS } from '@/content/passives/points';
import { passivesTreeSchema } from '@/content/passives/schemas';
import type { PassivesTree } from '@/content/passives/types';
import { buildTreeIndex, bfsDistances } from '@/game/modules/passives/logic';
import { makePassivesGame, viewText, type ViewShape } from './passives-fixture';

/** полное дерево M14.2 = слияние кластеров (та же форма, что в реестре) */
export const FULL_TREE: PassivesTree = {
  startNodes: PASSIVES_TREE.startNodes,
  nodes: [...PASSIVES_TREE.nodes, ...FARM_NODES, ...FISH_NODES, ...MINE_NODES, ...ECONOMY_NODES, ...ANIMALS_NODES],
};

/** квоты карточки §4 (счёт allocatable; старт-якорь вне счёта) */
export const QUOTAS: Record<string, number> = { core: 20, farm: 30, fish: 25, mine: 30, economy: 25, animals: 20 };

/** цена узла по id в слитом дереве */
export function costOf2(tree: PassivesTree, id: string): number | undefined {
  return tree.nodes.find((n) => n.id === id)?.cost;
}

export async function runPassivesPart3(): Promise<CheckResult[]> {
  const results: CheckResult[] = [];
  const startSet = new Set(FULL_TREE.startNodes);
  const allocatable = FULL_TREE.nodes.filter((n) => !startSet.has(n.id));
  const byCluster = new Map<string, typeof allocatable>();
  for (const n of allocatable) {
    const list = byCluster.get(n.cluster) ?? [];
    list.push(n);
    byCluster.set(n.cluster, list);
  }

  // 20. [G2] полный граф: Σ allocatable = 150, квоты кластеров, M14.1 не тронут
  {
    const quotasOk = Object.entries(QUOTAS).every(([c, q]) => (byCluster.get(c) ?? []).length === q);
    const m141Intact = FULL_TREE.nodes.slice(0, PASSIVES_TREE.nodes.length).every((n, i) => n === PASSIVES_TREE.nodes[i]);
    const keystones = new Map(
      FULL_TREE.nodes.filter((n) => n.kind === 'keystone').map((n) => [n.id, n.cluster]),
    );
    results.push(
      check('полное дерево 150 [G2, DECISION M142-счёт + QUESTION M142-Q1]: 151 узлов всего = 150 allocatable + старт-якорь (якорь вне счёта); квоты карточки §4 ТОЧНО: ядро 20 (19 M14.1 + «Спартанец») / фермерство 30 / рыбалка 25 / бой-шахта 30 / экономика 25 / животные 20; 34 узла M14.1 не тронуты (первые 34 слитого дерева = nodes.ts тождественно); keystone ×4 на своих кластерных метках (core/mine/animals/economy — НЕ переносились); «116 новых» брифа невыполнимо с квотами (33 существующих allocatable + 117 = 150; 34 включает якорь) — off-by-one задокументирован, Σ = 150 держится', () =>
        FULL_TREE.nodes.length === 151 &&
        allocatable.length === 150 &&
        quotasOk &&
        m141Intact &&
        keystones.get('ks_spartan') === 'core' &&
        keystones.get('ks_magnate') === 'mine' &&
        keystones.get('ks_humanist') === 'animals' &&
        keystones.get('ks_orchestra') === 'economy' && keystones.size === 4, {
        expected: '151 = 150 + якорь; квоты 20/30/25/30/25/20; M14.1 intact; keystone на местах',
        actual: `узлов=${FULL_TREE.nodes.length}; allocatable=${allocatable.length}; квоты=${Object.entries(QUOTAS).map(([c, q]) => `${c}:${byCluster.get(c)?.length ?? 0}/${q}`).join(' ')}; M14.1=${m141Intact ? 'intact' : 'ИЗМЕНЁН'}`,
      }),
    );
  }

  // 21. [G2/F6] zod полного дерева + достижимость BFS + уникальность id
  {
    const parsed = passivesTreeSchema.safeParse(FULL_TREE);
    const ids = new Set(FULL_TREE.nodes.map((n) => n.id));
    const m141Ids = new Set(PASSIVES_TREE.nodes.map((n) => n.id));
    const noCollision = [...ids].filter((id) => m141Ids.has(id)).length === m141Ids.size && ids.size === FULL_TREE.nodes.length;
    results.push(
      check('валидация полного дерева [G2/F6]: слитое дерево 151 узлов проходит zod (BFS достижимость от старта — висячих нет; рёбра к существующим; старт cost 0 без модов; не-старт ≥ 1 мод; keystone ≥ 2); id уникальны (151) и НЕ коллидируют с nodes.ts M14.1 (34 старых id сохранены, 117 новых уникальны)', () =>
        parsed.success && noCollision, {
        expected: 'zod OK; 151 уникальных id; 34 старых целы',
        actual: `zod=${parsed.success ? 'OK' : 'FAIL'}; id=${ids.size}/${FULL_TREE.nodes.length}; коллизий=${ids.size !== FULL_TREE.nodes.length ? 'ЕСТЬ' : 'нет'}`,
      }),
    );
  }

  // 22. [G7] витрина tree несёт все 6 кластеров; дистанции кластеров от ядра
  {
    const f = makePassivesGame();
    await f.game.init();
    const registered = f.game.content.get<PassivesTree>('passives');
    const sameAsStatic =
      registered.nodes.length === FULL_TREE.nodes.length &&
      registered.nodes.every((n, i) => n.id === FULL_TREE.nodes[i]!.id);
    const tree = viewText(f.passives['passives.tree']() as ViewShape);
    const index = buildTreeIndex(FULL_TREE.nodes, FULL_TREE.startNodes);
    const dist = bfsDistances(index, FULL_TREE.startNodes);
    const minOf = (c: string): number =>
      Math.min(...FULL_TREE.nodes.filter((n) => n.cluster === c && !startSet.has(n.id)).map((n) => dist.get(n.id) ?? 999));
    f.dispose();
    results.push(
      check('витрина tree — все 6 кластеров полностью [G7]: реестр = слиянию (те же 151 id по порядку); текстовая витрина: «узлов: 151» + заголовки «Стартовое ядро (21)» / «Фермерство (30)» / «Рыбалка и озеро (25)» / «Бой и шахта (30)» / «Экономика (25)» / «Животные (20)»; достижимость всех 5 кластеров от ядра BFS: минимальные дистанции farm 1 / fish 4 / mine 5 / economy 5 / animals 5 (≥ 1 — витрина планирования canreach жива); дистанция до ks_magnate = 7 — новые рёбра цепь НЕ укоротили (оракул чека 18 части 2 переподтверждён)', () =>
        sameAsStatic &&
        tree.includes('узлов: 151') &&
        tree.includes('Стартовое ядро (21)') &&
        tree.includes('Фермерство (30)') &&
        tree.includes('Рыбалка и озеро (25)') &&
        tree.includes('Бой и шахта (30)') &&
        tree.includes('Экономика (25)') &&
        tree.includes('Животные (20)') &&
        minOf('farm') === 1 && minOf('fish') === 4 && minOf('mine') === 5 &&
        minOf('economy') === 5 && minOf('animals') === 5 &&
        dist.get('ks_magnate') === 7, {
        expected: 'реестр = слиянию; 6 кластеров с квотами; дистанции 1/4/5/5/5; ks_magnate 7',
        actual: `реестр=${sameAsStatic ? 'та же' : 'ДРУГАЯ'}; farm=${minOf('farm')} fish=${minOf('fish')} mine=${minOf('mine')} econ=${minOf('economy')} animals=${minOf('animals')}; magnate=${dist.get('ks_magnate')}`,
      }),
    );
  }

  // 23. [G4a] бюджет цен: Σ стоимостей 150 allocatable = 315 ≥ 300
  {
    const sum = allocatable.reduce((s, n) => s + n.cost, 0);
    const sumM141 = PASSIVES_TREE.nodes.filter((n) => !startSet.has(n.id)).reduce((s, n) => s + n.cost, 0);
    const newNodes = allocatable.filter((n) => !PASSIVES_TREE.nodes.includes(n));
    const smallsOk = newNodes.filter((n) => n.kind === 'small').every((n) => n.cost === 1);
    const notablesOk = newNodes.filter((n) => n.kind === 'notable').every((n) => n.cost === 10);
    const noNewKeystones = newNodes.every((n) => n.kind !== 'keystone');
    results.push(
      check('бюджет цен [G4a, DECISION M142-цена]: Σ стоимостей 150 allocatable = 315 ≥ 300 — выбор вынужден (315 = 2.5 × лейтгейм-бюджета 126); 36 M14.1 + 279 новых (99 Small × 1 + 18 Notable × 10); Notable новой волны = 10 — ЕДИНСТВЕННОЕ решение под zod-капой schemas.ts cost ≤ 10 при ≤ 4 Notable на кластер (Σ ≥ 300 ⇔ цена 10 и notables ≥ 17); Small/Keystone = 1 — канон M14.1 НЕ тронут; новых keystone НЕТ (замок карточки §3)', () =>
        sum === 315 && sum >= 300 && sumM141 === 36 && smallsOk && notablesOk && noNewKeystones &&
        newNodes.filter((n) => n.kind === 'notable').length === 18, {
        expected: 'Σ = 315 (36 + 99 + 180); Small 1 / Notable 10; keystone ×4 только M14.1',
        actual: `Σ=${sum}; M14.1=${sumM141}; новых=${newNodes.length}; notable=${newNodes.filter((n) => n.kind === 'notable').length}×10; small×1=${smallsOk}; keystone новых=${newNodes.filter((n) => n.kind === 'keystone').length}`,
      }),
    );
  }

  // 24. [G4b] лейтгейм-оракул: 60 + 45 + Σ маркеров ∈ [120, 150] (по данным)
  {
    const markers = PASSIVES_POINTS.largeAchievements.reduce((s, a) => s + a.points, 0);
    const late = 60 * PASSIVES_POINTS.perLevel + 9 * PASSIVES_POINTS.perBoss + markers;
    results.push(
      check('лейтгейм-бюджет очков [G4b]: уровень 60 → 60 + боссы ×9 × 5 = 45 + Σ маркеров «крупных» points.ts (НЕ менять) = 126 ∈ [120, 150] — очков меньше половины стоимости дерева (126/315 = 40%), выбор вынужден в обе стороны; канон начислений M14.1 жив без правок (points.ts не тронут)', () =>
        late === 126 && late >= 120 && late <= 150 && markers === 21, {
        expected: '60 + 45 + 21 = 126 ∈ [120, 150]',
        actual: `перУровень=${PASSIVES_POINTS.perLevel}; перБосс=${PASSIVES_POINTS.perBoss}; маркеры=${markers}; итог=${late}`,
      }),
    );
  }

  return results;
}
