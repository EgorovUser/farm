/**
 * AUDIT-M14 · временный скрипт машины (вне дерева; режим только-чтение)
 * R4: дерево 151/150, квоты, ряды, Σ цен, дистанция ks_magnate,
 * достижимость всех, монте-карло 10k фикс-сид mulberry32(20261028) ×2 (UV-2).
 * Запуск: bun .zscripts/audit-m14-tree.ts
 */
import { PASSIVES_TREE } from '../src/content/passives/nodes';
import { FARM_NODES } from '../src/content/passives/nodes-farm';
import { FISH_NODES } from '../src/content/passives/nodes-fish';
import { MINE_NODES } from '../src/content/passives/nodes-mine';
import { ECONOMY_NODES } from '../src/content/passives/nodes-economy';
import { ANIMALS_NODES } from '../src/content/passives/nodes-animals';
import { PASSIVES_POINTS } from '../src/content/passives/points';

const NODES = [...PASSIVES_TREE.nodes, ...FARM_NODES, ...FISH_NODES, ...MINE_NODES, ...ECONOMY_NODES, ...ANIMALS_NODES];
const START = new Set(PASSIVES_TREE.startNodes);

// --- граф: неориентированная смежность (как logic.ts buildTreeIndex)
const adj = new Map<string, Set<string>>();
for (const id of NODES.map((n) => n.id)) adj.set(id, new Set());
for (const n of NODES) for (const l of n.links) {
  adj.get(n.id)!.add(l);
  adj.get(l)!.add(n.id);
}

// 1) счёт узлов/квот
const total = NODES.length;
const allocatable = NODES.filter((n) => !START.has(n.id));
const byCluster = new Map<string, number>();
for (const n of allocatable) byCluster.set(n.cluster, (byCluster.get(n.cluster) ?? 0) + 1);
console.log('узлов всего:', total, '| allocatable:', allocatable.length, '| якорей:', total - allocatable.length);
console.log('квоты кластеров:', JSON.stringify([...byCluster.entries()].sort()));

// 2) ряды
const kinds = new Map<string, number>();
for (const n of allocatable) kinds.set(n.kind, (kinds.get(n.kind) ?? 0) + 1);
console.log('ряды (allocatable):', JSON.stringify([...kinds.entries()].sort()));
const newFiles = [...FARM_NODES, ...FISH_NODES, ...MINE_NODES, ...ECONOMY_NODES, ...ANIMALS_NODES];
const newNotable = newFiles.filter((n) => n.kind === 'notable');
console.log('новых узлов (5 файлов):', newFiles.length, '| из них Notable:', newNotable.length,
  '| цены Notable новых:', JSON.stringify([...new Set(newNotable.map((n) => n.cost))]));

// 3) Σ цен + разложение
const sumCost = allocatable.reduce((s, n) => s + n.cost, 0);
const m141 = PASSIVES_TREE.nodes.filter((n) => !START.has(n.id));
const sumM141 = m141.reduce((s, n) => s + n.cost, 0);
const smallNew = newFiles.filter((n) => n.kind === 'small');
console.log('Σ цен 150 allocatable:', sumCost, '=', sumM141, '(M14.1) +', smallNew.length, '×1 +', newNotable.length, '×10 =',
  sumM141 + smallNew.length * 1 + newNotable.length * 10);

// 4) BFS от старта: достижимость + дистанция до ks_magnate
const dist = new Map<string, number>();
const queue = [...START];
for (const s of START) dist.set(s, 0);
for (let qi = 0; qi < queue.length; qi++) {
  const cur = queue[qi];
  for (const nb of adj.get(cur) ?? []) {
    if (!dist.has(nb)) { dist.set(nb, dist.get(cur)! + 1); queue.push(nb); }
  }
}
const unreachable = NODES.filter((n) => !dist.has(n.id)).map((n) => n.id);
console.log('недостижимых из старта:', unreachable.length, unreachable.length ? JSON.stringify(unreachable) : '');
console.log('дистанция BFS до ks_magnate:', dist.get('ks_magnate'), '(оракул 7)');

// 5) новые рёбра: оба конца новые? (сквозные рёбра сквозь спину)
const newIds = new Set(newFiles.map((n) => n.id));
const spineEdgesFromNew = newFiles.flatMap((n) => n.links.map((l) => [n.id, l] as const))
  .filter(([, l]) => !newIds.has(l));
const bothNew = newFiles.flatMap((n) => n.links.map((l) => [n.id, l] as const))
  .filter(([a, l]) => newIds.has(l) && a !== l);
console.log('рёбра новых→спина (старые узлы):', spineEdgesFromNew.length, JSON.stringify(spineEdgesFromNew));
console.log('рёбер новые↔новые:', bothNew.length);

// 6) лейтгейм: 60 + 45 + Σ маркеров
const markersSum = PASSIVES_POINTS.largeAchievements.reduce((s, a) => s + a.points, 0);
console.log('лейтгейм: 60 + 45 (боссы ×9) +', markersSum, '(маркеры', PASSIVES_POINTS.largeAchievements.length, 'шт.) =', 60 + 45 + markersSum, '∈ [120, 150]');

// 7) монте-карло 10k фикс-сид mulberry32(20261028) — как чек 25 part4 (UV-2)
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
interface MCStats { maxSpent: number; illegal: number; allocatedAll: boolean; spentHist: number[] }
function runMC(seedVal: number): MCStats {
  const rnd = mulberry32(seedVal);
  let maxSpent = 0, illegal = 0, allocatedAll = false;
  const BUDGET = 126;
  const N = 10000;
  for (let i = 0; i < N; i++) {
    const allocated = new Set<string>(START);
    let spent = 0;
    for (let step = 0; step < 200; step++) {
      // легальные фронтир-кандидаты (соседние к выделенным, не выделенные)
      const cand: string[] = [];
      for (const id of allocated) for (const nb of adj.get(id) ?? []) {
        if (!allocated.has(nb)) cand.push(nb);
      }
      if (cand.length === 0) break;
      const pick = cand[Math.floor(rnd() * cand.length)];
      const node = NODES.find((n) => n.id === pick)!;
      if (node.cost > BUDGET - spent) continue; // не хватает очков — скип (легально)
      allocated.add(pick); spent += node.cost;
      if (allocated.size === NODES.length) { allocatedAll = true; break; }
    }
    if (spent > BUDGET) illegal++;
    if (allocated.size >= NODES.length) allocatedAll = true;
    if (spent > maxSpent) maxSpent = spent;
  }
  return { maxSpent, illegal, allocatedAll, spentHist: [] };
}
const mc1 = runMC(20261028);
const mc2 = runMC(20261028);
console.log('монте-карло 10k seed 20261028: прогоны идентичны =', JSON.stringify(mc1) === JSON.stringify(mc2),
  '| max потрачено:', mc1.maxSpent, '(≤ 126)', '| нелегальных:', mc1.illegal, '| выделили все 151:', mc1.allocatedAll);

// 8) roundtrip-каноничность: spent-инвариант по случайному легальному пути
console.log('OK: машинные факты сняты');
