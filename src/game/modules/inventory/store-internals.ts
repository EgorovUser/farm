/**
 * Внутренние операции размещения партий (расщепление store.ts по 01 §6 —
 * файл превысил 300 строк при касании M04.1). Изъятие removeInternal
 * (CRIT-1/FIX-M02) осталось в store.ts — не тронуто ни на символ.
 *
 * applyPlacement — единый пайплайн размещения (D23): план planPlacement →
 * проверка вместимости (D30: рюкзак без экипированных) → слияния + новые
 * записи `${defId}#${seq}`; [M04.1 · C4] собирает iid'ы СОЗДАННЫХ записей
 * (нужны магазину для применения стартовых ривен-роллов к новой покупке).
 */
import type { RngBus } from '@/kernel/bus/rng-bus/rng-bus';
import type { StatBus } from '@/kernel/bus/stat-bus/stat-bus';
import type { ResolveCtx } from '@/kernel/bus/stat-bus/modifier';
import type { ID, QualityTier } from '@/shared/types/ids';
import { QUALITY_TIERS } from '@/shared/types/ids';
import type { Result } from '@/shared/types/result';
import { err, ok } from '@/shared/types/result';
import type { ItemDef } from '@/content/items/items';
import type { InventoryTable } from '@/content/balance/inventory';
import { capacityOf, planPlacement } from './logic';
import { equippedIidSet } from './equipment';
import { maxStackOf, type InventoryState, type ItemQuality } from './state';

/** минимальный контекст размещения (структурно совместим с InventoryStoreDeps) */
export interface PlacementDeps {
  table: InventoryTable;
  tryItem(defId: ID): ItemDef | undefined;
  rngBus: RngBus;
  statBus: StatBus;
  ctx(): ResolveCtx;
}

/** Ролл качества (D23): тир по весам через RngBus (лог + шансы на стол, П6),
 *  value — равномерно 0..100 внутри тира. Таблицы нет — деградация в D (П5). */
export function rollQuality(rngBus: RngBus, ctx: ResolveCtx): ItemQuality {
  const tier = rngBus.rollTable('inventory.quality', ctx);
  const value = rngBus.rollRange(0, 100, 'uniform', 'inventory.quality.value', ctx);
  return {
    tier: QUALITY_TIERS.includes(tier as QualityTier) ? (tier as QualityTier) : 'D',
    value,
  };
}

export interface PlacementOutcome {
  entries: number;
  /** iid СОЗДАННЫХ записей партии (слияния не входят; C4) */
  iids: ID[];
  nextState: InventoryState;
}

/** Разместить партию одного качества (мутаций входного state нет — новый) */
export function applyPlacement(
  deps: PlacementDeps,
  state: InventoryState,
  defId: ID,
  quality: ItemQuality,
  qty: number,
  opts: { enforceCapacity: boolean },
): Result<PlacementOutcome> {
  const def = deps.tryItem(defId);
  const maxStack = maxStackOf(def, deps.table);
  const plan = planPlacement(state.items, defId, quality, qty, maxStack);
  if (opts.enforceCapacity) {
    // D30: свободные слоты считаются по рюкзаку (экипированные не занимают вместимость)
    const eq = equippedIidSet(state);
    const backpack = state.items.filter((it) => !eq.has(it.iid)).length;
    const resolved = deps.statBus.resolve({ stat: 'player.inventory.slots', ctx: deps.ctx() });
    const free = capacityOf(deps.table.slotsCap, resolved) - backpack;
    if (plan.newEntries > free) {
      return err(
        `инвентарь полон: нужно записей ${plan.newEntries}, свободно слотов ${Math.max(0, free)} — партия отклонена целиком (без частичной выдачи)`,
      );
    }
  }
  const items = state.items.map((it) => ({ ...it }));
  for (const m of plan.merges) items[m.index].qty += m.add;
  let rest = plan.remainder;
  let seq = state.seq;
  let entries = 0;
  const iids: ID[] = [];
  while (rest > 0) {
    const take = Math.min(maxStack, rest);
    seq += 1;
    const iid = `${defId}#${seq}`;
    items.push({
      iid,
      defId,
      qty: take,
      quality: { ...quality },
      sharpeningLevel: 0,
      rolledMods: [],
      // носители получают прочность с рождения (карточка §4: прочность —
      // поле экземпляра; ранее заполнялась только нормализацией загрузки)
      ...(def?.durabilityMax ? { durability: { current: def.durabilityMax, max: def.durabilityMax } } : {}),
    });
    iids.push(iid);
    rest -= take;
    entries += 1;
  }
  return ok({ entries: entries + plan.merges.length, iids, nextState: { ...state, items, seq } });
}

/** качество последней оставшейся записи defId — для payload события изъятия */
export function qualityOfRemoved(state: InventoryState, defId: ID): ItemQuality {
  const left = state.items.find((it) => it.defId === defId);
  return left ? { ...left.quality } : { tier: 'D', value: 50 };
}
