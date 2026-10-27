/**
 * baitProvider (F2: modifierProviders = [baitProvider]) — модификаторы
 * АКТИВНОЙ наживки в StatBus. Читает слот «Активная наживка» через колбэк
 * app-слоя (inventory.equipped, П4), находит деф в content/fishing/baits.ts
 * и отдаёт статы-моды наживки как flat-модификаторы (источник item/iid).
 *
 * Неизвестный defId в слоте (мёртвая наживка M07.1 вне пятёрки F5 —
 * опарыш/тесто/кузнечик/блёсны фазы 2) → модов НЕТ (П5: неизвестные данные
 * — рядовой случай). Смена экипировки публикует invalidate.stat (M02),
 * кэш шины сбрасывается — провайдер лениво опрашивается при резолве.
 *
 * Удочка — НЕ здесь: её baseStats/rolledMods отдаёт существующий
 * equipmentProvider M02 §5 (канал F2).
 */
import type { Modifier, ModifierProvider, ResolveCtx } from '@/kernel/bus/stat-bus/modifier';
import type { StatId } from '@/shared/types/ids';
import type { ID } from '@/shared/types/ids';
import type { BaitShopDef } from '@/content/fishing/baits';

/** вид слота «Активная наживка» из inventory.equipped() (D30) */
export interface EquippedEntryView {
  slot: string;
  slotName: string;
  entry: { iid: ID; defId: ID; qty: number };
}

export const BAIT_PROVIDER_ID = 'fishing.bait';

export interface BaitProviderDeps {
  /** app-слой: inventory.equipped() через ModuleRegistry (П4) */
  equippedView(): Array<EquippedEntryView>;
  baits: readonly BaitShopDef[];
}

export function makeBaitProvider(deps: BaitProviderDeps): ModifierProvider {
  const byDefId = new Map(deps.baits.map((b) => [b.defId, b] as const));
  return {
    id: BAIT_PROVIDER_ID,
    provide(stat: StatId, _ctx: ResolveCtx): Modifier[] {
      const equipped = deps.equippedView().find((e) => e.slot === 'bait');
      if (!equipped) return [];
      const def = byDefId.get(equipped.entry.defId);
      if (!def) return [];
      const out: Modifier[] = [];
      for (const m of def.mods) {
        if (m.stat !== stat) continue;
        out.push({
          id: `bait.${equipped.entry.iid}.${m.stat}`,
          source: { kind: 'item', refId: equipped.entry.iid },
          stat: m.stat,
          op: 'flat',
          value: m.value,
          label: `${def.name}: ${m.label}`,
        });
      }
      return out;
    },
  };
}
