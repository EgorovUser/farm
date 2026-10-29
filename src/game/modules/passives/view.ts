/**
 * Витрины M14 (П6 — честные, эффекты узлов видны ДО и ПОСЛЕ выделения):
 *  - points: свободно/всего/потрачено + ретро-строка («ретро-начислено N
 *    очков» — честность канала существующего сейва, бриф §0);
 *  - tree: кластер → узлы [тип, имя, эффекты, стоимость, соседи] с метками
 *    выделения/достижимости (текстовая форма; UI-зум — фаза 6 / M18).
 */
import type { PassiveNodeDef, PassivesRespecTable } from '@/content/passives/types';
import { respecCostOf } from '@/content/passives/respec';
import type { TreeIndex } from './logic';
import { reachOf } from './logic';
import type { PassivesState } from './state';

export interface PassivesPointsView {
  header: string;
  lines: string[];
}

export function buildPointsView(
  state: PassivesState,
  retro: { earned: boolean; points: number; level: number; bosses: number; achievements: number } | null,
  respecTable: PassivesRespecTable,
): PassivesPointsView {
  const free = state.points - state.spent;
  const lines: string[] = [
    `свободно: ${free} · всего заработано: ${state.points} · потрачено: ${state.spent}`,
    `выделено узлов: ${state.allocated.length} · сброшено респеком: ${state.respecTotal}`,
    `респек: следующая операция ${respecCostOf(respecTable, state.respecTotal)}з (кривая растёт от числа сброшенных)`,
  ];
  if (retro !== null && retro.earned && retro.points > 0) {
    lines.push(
      `ретро-начислено ${retro.points} очков (уровень ${retro.level} + боссы ${retro.bosses} + ачивки ${retro.achievements}) — сейв без M14 не теряет прогресс`,
    );
  }
  return { header: 'Дерево пассивик — очки (passives.state)', lines };
}

const KIND_LABEL: Record<PassiveNodeDef['kind'], string> = {
  small: 'Small',
  notable: 'Notable',
  keystone: 'KEYSTONE',
};

export interface PassivesTreeView {
  header: string;
  lines: string[];
}

export function buildTreeView(index: TreeIndex, state: PassivesState): PassivesTreeView {
  const allocatedSet = new Set(state.allocated);
  const byCluster = new Map<string, PassiveNodeDef[]>();
  for (const n of index.ordered) {
    const list = byCluster.get(n.cluster) ?? [];
    list.push(n);
    byCluster.set(n.cluster, list);
  }
  const clusterNames: Record<string, string> = {
    core: 'Стартовое ядро',
    farm: 'Фермерство',
    fish: 'Рыбалка и озеро',
    mine: 'Бой и шахта',
    economy: 'Экономика',
    animals: 'Животные',
  };
  const lines: string[] = [
    `узлов: ${index.ordered.length} · выделено: ${state.allocated.length} · свободно очков: ${state.points - state.spent}`,
    '(аллокация — только соседний к выделенным; Effects узлов действуют сразу, видны до и после)',
  ];
  for (const [cluster, nodes] of byCluster) {
    lines.push(`— ${clusterNames[cluster] ?? cluster} (${nodes.length})`);
    for (const n of nodes) {
      const isStart = index.startNodes.has(n.id);
      const isAlloc = allocatedSet.has(n.id);
      const mark = isStart ? '◉ старт' : isAlloc ? '✓ выделен' : '·';
      const effects =
        n.mods.length === 0
          ? '—'
          : n.mods
              .map((m) => `${m.label ?? `${m.op} ${m.value} → ${m.stat}`}`)
              .join('; ');
      const neighbors = [...(index.adjacency.get(n.id) ?? [])].sort().join(', ');
      lines.push(
        `  ${mark} ${KIND_LABEL[n.kind]} «${n.name}» (${n.id}) — ${effects} · цена ${n.cost} · соседи: ${neighbors}`,
      );
      if (n.note !== undefined) lines.push(`      ${n.note}`);
      if (!isStart && !isAlloc) {
        const reach = reachOf(index, state.allocated, n.id);
        lines.push(
          `      достижимость: ${reach.reachable ? `да (${reach.distance} выделений)` : 'нет'}`,
        );
      }
    }
  }
  return { header: 'Дерево пассивик (passives.tree) — текстовая витрина', lines };
}
