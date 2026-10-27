/**
 * Провайдер worker.traits (M11.2, бриф F14; карточка M11 §6) — трейты
 * НАЗНАЧЕННОГО работника действуют на ЕГО систему.
 *
 * Фильтр по тегу назначения [DECISION-архитектура]: тег системы объекта
 * (farm/lake/pen — systemOfObject director.ts; «worker:<object> → тег
 * системы объекта» брифа): провайдер отдаёт трейты работника ТОЛЬКО
 * когда запрос (ctx) несёт тег его системы — точный ('farm') или
 * префиксный ('farm:crop:wheat', 'lake:0', 'pen:...') — живые резолвы
 * систем уже тегируют запросы (ферма: farm:crop/tab; озеро: lake:N).
 * Запрос чужой системы — модов нет (оракул отрицания карточки §7).
 *
 * Трейт → Modifier: op 'inc' по стату типа (канон D31 «rolledMods → inc»,
 * прецедент equipmentProvider M02); id — worker.<defId>.<type>; source
 * {kind: 'worker', refId: defId}. Моды снимаются сами — провайдер читает
 * живое состояние: увольнение убирает работника из hired → моды исчезают.
 */
import type { Modifier, ModifierProvider, ResolveCtx } from '@/kernel/bus/stat-bus/modifier';
import type { StatId } from '@/shared/types/ids';
import type { ModTypeDef } from '@/content/mods/registry';
import type { WorkersState } from '../state';
import { systemOfObject } from './director';

export const WORKER_TRAITS_PROVIDER_ID = 'worker.traits';

export function makeWorkersTraitsProvider(
  getState: () => WorkersState,
  traitTypes: readonly ModTypeDef[],
): ModifierProvider {
  const byType = new Map(traitTypes.map((m) => [m.id, m] as const));
  return {
    id: WORKER_TRAITS_PROVIDER_ID,
    provide(stat: StatId, ctx: ResolveCtx): Modifier[] {
      const tags = ctx.tags ?? [];
      if (tags.length === 0) return [];
      const mods: Modifier[] = [];
      for (const w of getState().hired) {
        // фильтр назначения: запрос принадлежит системе объекта работника?
        const system = systemOfObject(w.object);
        const belongs = tags.includes(system) || tags.some((t) => t.startsWith(`${system}:`));
        if (!belongs) continue;
        for (const t of w.traits) {
          const def = byType.get(t.type);
          if (def === undefined || def.stat !== stat || t.value === 0) continue;
          mods.push({
            id: `worker.${w.defId}.${t.type}`,
            source: { kind: 'worker', refId: w.defId },
            stat,
            op: 'inc',
            value: t.value,
          });
        }
      }
      return mods;
    },
  };
}
