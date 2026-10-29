/**
 * Логика M14 — чистые функции дерева (F3 аллокация по рёбрам / F4 респек):
 * смежность, достижимость (BFS), связность выделения со стартом, ретро-очки.
 *
 * Каноны (бриф §1):
 *  - F3: alloc разрешён ТОЛЬКО для узла, соседнего (по рёбрам) к уже
 *    выделенному; старт-узлы достижимы всегда (якоря смежности);
 *  - F4: поузельный респек узла, разрывающего связность выделения со
 *    стартом, — честный отказ; полный refund all снимает выделение целиком —
 *    разрешён всегда; очки возвращаются (spent −= cost), respecTotal растёт;
 *  - [DECISION · canReach] витрина достижимости: BFS по рёбрам от
 *    (старт ∪ выделенные) — расстояние до узла = сколько выделений до него
 *    (0 = уже выделен/старт). В связном валидируемом дереве любой узел
 *    достижим — витрина честно показывает ДАЛЬНОСТЬ планирования.
 */
import type { PassiveNodeDef, PassivesPointsTable } from '@/content/passives/types';
import type { PassivesModuleDeps } from './deps';

export interface TreeIndex {
  nodesById: ReadonlyMap<string, PassiveNodeDef>;
  startNodes: ReadonlySet<string>;
  adjacency: ReadonlyMap<string, ReadonlySet<string>>;
  /** порядок объявления контента (витрины) */
  ordered: readonly PassiveNodeDef[];
}

/** индекс дерева: неориентированная смежность = объединение рёбер концов */
export function buildTreeIndex(nodes: readonly PassiveNodeDef[], startNodes: readonly string[]): TreeIndex {
  const nodesById = new Map<string, PassiveNodeDef>();
  for (const n of nodes) nodesById.set(n.id, n);
  const starts = new Set(startNodes);
  const adjacency = new Map<string, Set<string>>();
  const link = (a: string, b: string): void => {
    const setA = adjacency.get(a) ?? new Set<string>();
    setA.add(b);
    adjacency.set(a, setA);
    const setB = adjacency.get(b) ?? new Set<string>();
    setB.add(a);
    adjacency.set(b, setB);
  };
  for (const n of nodes) {
    if (!adjacency.has(n.id)) adjacency.set(n.id, new Set<string>());
    for (const to of n.links) link(n.id, to);
  }
  return { nodesById, startNodes: starts, adjacency, ordered: nodes };
}

/** BFS от набора семян по ВСЕМ рёбрам: расстояния (null = недостижим) */
export function bfsDistances(index: TreeIndex, seeds: Iterable<string>): Map<string, number> {
  const dist = new Map<string, number>();
  const queue: string[] = [];
  for (const s of seeds) {
    if (index.nodesById.has(s) && !dist.has(s)) {
      dist.set(s, 0);
      queue.push(s);
    }
  }
  while (queue.length > 0) {
    const cur = queue.shift()!;
    const d = dist.get(cur)!;
    for (const next of index.adjacency.get(cur) ?? []) {
      if (!dist.has(next)) {
        dist.set(next, d + 1);
        queue.push(next);
      }
    }
  }
  return dist;
}

/** canReach-витрина: расстояние от (старт ∪ выделенные) до узла (F3) */
export function reachOf(index: TreeIndex, allocated: readonly string[], nodeId: string): {
  reachable: boolean;
  distance: number | null;
  allocated: boolean;
} {
  if (allocated.includes(nodeId)) return { reachable: true, distance: 0, allocated: true };
  const dist = bfsDistances(index, [...index.startNodes, ...allocated]);
  const d = dist.get(nodeId);
  return { reachable: d !== undefined, distance: d ?? null, allocated: false };
}

/**
 * Разрешена ли аллокация: узел существует, НЕ старт, НЕ выделен, соседний к
 * (выделенные ∪ старты). Проверка очков — отдельно (честная причина отказа).
 */
export function allocBlockReason(
  index: TreeIndex,
  allocated: readonly string[],
  nodeId: string,
): string | null {
  const node = index.nodesById.get(nodeId);
  if (node === undefined) return `неизвестный узел: ${nodeId} (passives tree — реестр узлов)`;
  if (index.startNodes.has(nodeId)) return 'старт-узел выделения не требует (он активен всегда)';
  if (allocated.includes(nodeId)) return 'узел уже выделен (повторная аллокация не нужна)';
  const frontier = new Set<string>([...index.startNodes, ...allocated]);
  const neighbors = index.adjacency.get(nodeId) ?? new Set<string>();
  const adjacent = [...neighbors].some((n) => frontier.has(n));
  if (!adjacent) {
    return 'узел не соседний к выделенным — идите по рёбрам от старта (passives canreach <id> — дистанция)';
  }
  return null;
}

/**
 * Разрыв ли связности: после удаления node из allocated останется ли КАЖДЫЙ
 * выделенный достижимым из стартов ПО ВЫДЕЛЕННЫМ узлам (F4 — узел-мост).
 */
export function breaksConnectivity(
  index: TreeIndex,
  allocated: readonly string[],
  nodeId: string,
): boolean {
  const remaining = allocated.filter((id) => id !== nodeId);
  // BFS только по выделенным ∪ стартам: замкнутая компонента выделения
  const dist = new Map<string, number>();
  const queue: string[] = [];
  for (const s of index.startNodes) {
    dist.set(s, 0);
    queue.push(s);
  }
  const allowed = new Set<string>([...index.startNodes, ...remaining]);
  while (queue.length > 0) {
    const cur = queue.shift()!;
    for (const next of index.adjacency.get(cur) ?? []) {
      if (allowed.has(next) && !dist.has(next)) {
        dist.set(next, dist.get(cur)! + 1);
        queue.push(next);
      }
    }
  }
  return remaining.some((id) => !dist.has(id));
}

/**
 * Ретро-подсчёт по ФАКТАМ сейва (бриф §0/§5): уровень (ровно N — «за каждый
 * обладаемый уровень», включая стартовое очко уровня 1) + perBoss за каждый
 * открытый флаг боссовой ачивки + Σ points открытых «крупных».
 */
export function retroPointsOf(
  deps: PassivesModuleDeps,
  table: PassivesPointsTable,
): { points: number; level: number; bosses: number; achievements: number } {
  const level = Math.max(0, Math.floor(deps.playerLevel()));
  const bosses = table.bossAchievements.filter((id) => deps.hasAchievement(id)).length;
  const achievements = table.largeAchievements
    .filter((a) => deps.hasAchievement(a.id))
    .reduce((s, a) => s + a.points, 0);
  return {
    points: level * table.perLevel + bosses * table.perBoss + achievements,
    level,
    bosses,
    achievements,
  };
}
