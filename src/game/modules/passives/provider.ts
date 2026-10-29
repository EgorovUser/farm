/**
 * passivesProvider (манифест modifierProviders ×1) — перечисляет
 * модификаторы ВЫДЕЛЕННЫХ узлов (карточка M14 §5; канон 02 §2):
 * id = passive.<nodeId>#<i>, source { kind: 'passive', refId: nodeId }.
 * Декларативные NodeMod-ы контента синтезируются в полные Modifier-ы шины;
 * провайдер чист (state → mods), НЕ инициализирует ретро (только allocated).
 */
import type { Modifier, ModifierProvider, ResolveCtx } from '@/kernel/bus/stat-bus/modifier';
import type { StatId } from '@/shared/types/ids';
import type { PassiveNodeDef } from '@/content/passives/types';
import type { PassivesState } from './state';

export const PASSIVES_PROVIDER_ID = 'passivesProvider';

export function makePassivesProvider(
  getState: () => PassivesState,
  nodesById: ReadonlyMap<string, PassiveNodeDef>,
): ModifierProvider {
  return {
    id: PASSIVES_PROVIDER_ID,
    provide(stat: StatId, _ctx: ResolveCtx): Modifier[] {
      void _ctx;
      const mods: Modifier[] = [];
      for (const nodeId of getState().allocated) {
        const node = nodesById.get(nodeId);
        if (node === undefined) continue;
        node.mods.forEach((m, i) => {
          if (m.stat !== stat) return;
          mods.push({
            id: `passive.${nodeId}#${i}`,
            source: { kind: 'passive', refId: nodeId },
            stat: m.stat,
            op: m.op,
            value: m.value,
            ...(m.priority !== undefined ? { priority: m.priority } : {}),
            label: m.label ?? `${node.name} (${nodeId})`,
          });
        });
      }
      return mods;
    },
  };
}
