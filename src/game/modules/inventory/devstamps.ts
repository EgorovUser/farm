/**
 * Dev-штампы M02.2 (бриф §2.6): `inv mod` / `inv dur` — ручная установка
 * ривен-ролла и прочности для приёмочных проб. Генерация/бюджеты/кривые/
 * рероллы — M03, здесь их НЕТ (запрещено брифом). Штампы публикуют
 * invalidate.stat (выход провайдера меняется) и помечают сейв грязным.
 */
import type { EventBus } from '@/kernel/bus/event-bus/event-bus';
import type { ID } from '@/shared/types/ids';
import { err, ok, type Result } from '@/shared/types/result';
import type { ItemDef } from '@/content/items/items';
import type { ModTypeDef } from '@/content/mods/registry';
import type { InventoryState, RolledModEntry } from './state';

export interface DevStampsDeps {
  tryItem(defId: ID): ItemDef | undefined;
  mods: readonly ModTypeDef[];
  bus: EventBus;
  getState(): InventoryState;
  setState(s: InventoryState): void;
  markDirty(): void;
}

export interface StampReceipt {
  iid: ID;
  type: ID;
  value: number;
}

export interface DurReceipt {
  iid: ID;
  current: number;
  max: number;
}

export class DevStamps {
  private readonly deps: DevStampsDeps;
  private readonly modsById: Map<ID, ModTypeDef>;

  constructor(deps: DevStampsDeps) {
    this.deps = deps;
    this.modsById = new Map(deps.mods.map((m) => [m.id, m] as const));
  }

  /** Штамп ривен-ролла: { type, value, from: 'initial' }. Значение — в границах
   *  ModTypeDef [maxNegative..maxPositive] (границы видны в отказе). Повторный
   *  штамп того же типа ЗАМЕНЯЕТ значение (дублей не плодим). */
  stampMod(iid: ID, modType: ID, value: number): Result<StampReceipt> {
    const state = this.deps.getState();
    const entry = state.items.find((it) => it.iid === iid);
    if (!entry) return err(`предмет "${iid}" не найден в инвентаре`);
    const modDef = this.modsById.get(modType);
    if (!modDef) {
      return err(`неизвестный тип мода: ${modType} (реестр: ${this.deps.mods.map((m) => m.id).join(', ')})`);
    }
    if (!Number.isFinite(value)) return err('значение должно быть числом');
    if (value > modDef.maxPositive || value < modDef.maxNegative) {
      return err(`значение вне границ мода ${modType}: [${modDef.maxNegative}..${modDef.maxPositive}]`);
    }
    const stamped: RolledModEntry = { type: modType, value, from: 'initial' };
    const rolled = entry.rolledMods.filter((m) => m.type !== modType);
    rolled.push(stamped);
    this.applyEntry(entry.iid, { ...entry, rolledMods: rolled });
    return ok({ iid, type: modType, value });
  }

  /** Штамп прочности: durability.current, клэмп 0..max (бриф §2.6).
   *  Носителю без прочности поле инициализируется (def.durabilityMax). */
  setDurability(iid: ID, n: number): Result<DurReceipt> {
    const state = this.deps.getState();
    const entry = state.items.find((it) => it.iid === iid);
    if (!entry) return err(`предмет "${iid}" не найден в инвентаре`);
    const def = this.deps.tryItem(entry.defId);
    const max = entry.durability?.max ?? def?.durabilityMax;
    if (!max) return err(`у предмета ${entry.defId} нет прочности (не носитель)`);
    if (!Number.isFinite(n)) return err('прочность должна быть числом');
    const current = Math.min(max, Math.max(0, Math.floor(n)));
    this.applyEntry(entry.iid, { ...entry, durability: { current, max } });
    return ok({ iid, current, max });
  }

  private applyEntry(iid: ID, patch: InventoryState['items'][number]): void {
    const state = this.deps.getState();
    const items = state.items.map((it) => (it.iid === iid ? patch : it));
    this.deps.setState({ ...state, items });
    this.deps.bus.publish('invalidate.stat', {});
    this.deps.markDirty();
  }
}
