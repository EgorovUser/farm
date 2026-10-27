/**
 * RollsPort (M02, шов M03.3): ПРОИЗВОДСТВЕННЫЙ канал записи ривен-роллов в
 * экземпляр предмета. Карточка M02 §1: «роллы — НЕ здесь (генерирует M03),
 * здесь — хранение и применение» — модфордж (реролл §6) и будущие M09/M10
 * применяют сгенерированные партии через этот API (П4: ModuleRegistry).
 *
 * Отличие от dev-штампов DevStamps (§2.6): штампы — одиночные ручные пробы
 * оператора; RollsPort — атомарная партия с полной валидацией (fail-closed:
 * любая битая запись отклоняет ВСЮ партию, предмет не меняется).
 *
 * [DECISION · M03.3] дубликаты (type, from) в партии запрещены (замена-
 * семантика), но initial + forge одного типа сосуществуют: карточка заточки
 * M10 может лежать поверх стартового ролла того же типа (03-DATA §4).
 */
import type { EventBus } from '@/kernel/bus/event-bus/event-bus';
import type { ID } from '@/shared/types/ids';
import { err, ok, type Result } from '@/shared/types/result';
import type { ItemDef } from '@/content/items/items';
import type { ModTypeDef } from '@/content/mods/registry';
import type { RolledModEntry } from '@/shared/types/rolled-mod';
import type { InventoryState } from './state';

export interface RollsPortDeps {
  tryItem(defId: ID): ItemDef | undefined;
  mods: readonly ModTypeDef[];
  bus: EventBus;
  getState(): InventoryState;
  setState(s: InventoryState): void;
  markDirty(): void;
}

export interface SetRollsReceipt {
  iid: ID;
  /** записано модов */
  count: number;
  /** было модов до замены */
  replaced: number;
}

/** атомарная валидация партии: форма + реестр + границы + маркеры происхождения */
function validateRolls(
  modsById: Map<ID, ModTypeDef>,
  rolls: ReadonlyArray<unknown>,
): Result<RolledModEntry[]> {
  if (!Array.isArray(rolls)) return err('rolls должен быть массивом');
  const seen = new Set<string>();
  const out: RolledModEntry[] = [];
  for (const raw of rolls) {
    if (!raw || typeof raw !== 'object') return err('каждый ролл должен быть объектом {type, value, from}');
    const r = raw as Record<string, unknown>;
    if (typeof r.type !== 'string' || r.type === '') return err('type ролла должен быть непустой строкой');
    const modDef = modsById.get(r.type);
    if (!modDef) return err(`неизвестный тип мода: ${r.type}`);
    if (typeof r.value !== 'number' || !Number.isFinite(r.value)) return err('value ролла должно быть числом');
    if (r.value > modDef.maxPositive || r.value < modDef.maxNegative) {
      return err(`значение ${r.type} ${r.value} вне границ [${modDef.maxNegative}..${modDef.maxPositive}]`);
    }
    const from: RolledModEntry['from'] = r.from === 'forge' ? 'forge' : 'initial';
    let forgeLevel: number | undefined;
    if (from === 'forge') {
      if (r.forgeLevel === undefined || !Number.isInteger(r.forgeLevel) || (r.forgeLevel as number) < 0) {
        return err('карточка заточки (from forge) требует целочисленный forgeLevel ≥ 0');
      }
      forgeLevel = r.forgeLevel as number;
    }
    const key = `${r.type}:${from}`;
    if (seen.has(key)) return err(`дубликат в партии: ${r.type} (${from})`);
    seen.add(key);
    out.push(forgeLevel !== undefined ? { type: r.type, value: r.value, from, forgeLevel } : { type: r.type, value: r.value, from });
  }
  return ok(out);
}

export class RollsPort {
  private readonly deps: RollsPortDeps;
  private readonly modsById: Map<ID, ModTypeDef>;

  constructor(deps: RollsPortDeps) {
    this.deps = deps;
    this.modsById = new Map(deps.mods.map((m) => [m.id, m] as const));
  }

  /** Атомарная замена rolledMods экземпляра валидной партией.
   *  Публикует invalidate.stat (выход equipmentProvider меняется), помечает
   *  сейв грязным. Предмет не найден / партия битая — отказ без изменений. */
  setRolls(iid: ID, rolls: ReadonlyArray<unknown>): Result<SetRollsReceipt> {
    const state = this.deps.getState();
    const entry = state.items.find((it) => it.iid === iid);
    if (!entry) return err(`предмет "${iid}" не найден в инвентаре`);
    const validated = validateRolls(this.modsById, rolls);
    if (!validated.ok) return validated;
    const replaced = entry.rolledMods.length;
    const items = state.items.map((it) => (it.iid === iid ? { ...it, rolledMods: validated.value } : it));
    this.deps.setState({ ...state, items });
    this.deps.bus.publish('invalidate.stat', {});
    this.deps.markDirty();
    return ok({ iid, count: validated.value.length, replaced });
  }
}
