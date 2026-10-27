/**
 * Экипировка M02 (сеанс M02.2, карточка §3 + D21/D30): equip/unequip
 * над `(state, ctx)` — чистые проверки в этом файле, применение и события —
 * EquipService (паттерн сервисов M01: getState/setState/markDirty по ссылке).
 *
 * D30 (модель хранения): экипированные записи ОСТАЮТСЯ в items[], срез
 * equipped — ссылочная карта slot→iid; экипированные не занимают вместимость,
 * не видны в inv list, не участвуют в выборе изъятия. Занятый слот — отказ
 * с причиной (авто-подмена НЕ вводится). Unequip возвращает запись в рюкзак
 * даже сверх capacity (легально по D28). Unequip — БЕЗ события (D21), только
 * invalidate.stat.
 *
 * Гейты (§2.4): ItemDef.requirements — единым оценщиком checkCondition
 * (shared/utils, 03 §2); нарушение — штатный отказ Result с причиной.
 */
import type { EventBus } from '@/kernel/bus/event-bus/event-bus';
import type { StatBus } from '@/kernel/bus/stat-bus/stat-bus';
import type { ResolveCtx } from '@/kernel/bus/stat-bus/modifier';
import type { Condition, ConditionCtx } from '@/shared/types/requirement';
import { checkCondition } from '@/shared/utils/condition-check';
import type { ID } from '@/shared/types/ids';
import { err, ok, type Result } from '@/shared/types/result';
import type { ItemDef } from '@/content/items/items';
import type { EquipmentSlotDef, InventoryTable } from '@/content/balance/inventory';
import type { InventoryState, ItemInstance } from './state';

// ------------------------------------------------------------- чистые проверки

/** Слот по id (данные); undefined → вызывающий даст отказ с перечнем */
export function slotById(table: InventoryTable, slotId: string): EquipmentSlotDef | undefined {
  return table.equipmentSlots.find((s) => s.id === slotId);
}

/** Соответствие предмета слоту: itemType ∈ types И (subTypes задан → subType ∈ subTypes) */
export function fitsSlot(def: ItemDef, slot: EquipmentSlotDef): boolean {
  if (!slot.types.includes(def.itemType)) return false;
  if (slot.subTypes && (!def.subType || !slot.subTypes.includes(def.subType))) return false;
  return true;
}

/** Человекочитаемое «что принимает слот» (для причины отказа) */
export function slotAcceptsLabel(slot: EquipmentSlotDef): string {
  const types = slot.types.join('|');
  return slot.subTypes ? `требуется тип ${types} (subType: ${slot.subTypes.join('|')})` : `требуется тип ${types}`;
}

/** Причина отказа гейта: первое невыполненное требование — текстом (карточка §3:
 * «нарушение — штатный отказ Result с причиной») */
export function describeCondition(cond: Condition): string {
  switch (cond.t) {
    case 'playerLevel':
      return `требуется уровень ${cond.level}`;
    case 'skill':
      return `требуется навык ${cond.skill} ур. ${cond.level}`;
    case 'statAtLeast':
      return `требуется ${cond.stat} не ниже ${cond.value}`;
    case 'statAtMost':
      return `требуется ${cond.stat} не выше ${cond.value}`;
    case 'flag':
      return `требуется флаг ${cond.flag}`;
    case 'achievement':
      return `требуется ачивка ${cond.id}`;
    case 'hasItem':
      return `требуется ${cond.defId} ×${cond.qty ?? 1}`;
    case 'ctxTag':
      return `нужен контекст ${cond.tag}`;
    case 'not':
      return `НЕ (${describeCondition(cond.c)})`;
    case 'all':
      return cond.cs.map(describeCondition).join(' и ');
    case 'any':
      return cond.cs.map(describeCondition).join(' или ');
    default:
      return 'требование не выполнено';
  }
}

/** Первое невыполненное требование (для текста отказа) */
export function firstFailedRequirement(
  requirements: readonly Condition[] | undefined,
  ctx: ConditionCtx,
): Condition | undefined {
  if (!requirements || requirements.length === 0) return undefined;
  return requirements.find((c) => !checkCondition(c, ctx));
}

/** iid экипированных записей (D30: фильтр видимости/вместимости/изъятия) */
export function equippedIidSet(state: InventoryState): Set<ID> {
  return new Set(Object.values(state.equipped));
}

// ------------------------------------------------------------------- сервис

/** Зависимости строителя гейт-контекста (общие для equip M02.2 и use M02.3) */
export interface GateCtxDeps {
  statBus: StatBus;
  /** стандартный ResolveCtx (time.ctx('player')) */
  ctx(): ResolveCtx;
  /** уровень/навыки игрока для гейтов: gateExtras() отдаёт player.ctxExtras()
   *  через ModuleRegistry из app-слоя (П4: прямой импорт модулей запрещён) */
  gateExtras(): Record<string, unknown>;
  /** количество defId у игрока ЦЕЛИКОМ (включая экипированное) — гейт hasItem */
  countAll(defId: ID): number;
}

/** Единый строитель ConditionCtx для гейтов ItemDef.requirements (карточка §3):
 *  statAtLeast → шина (с extras), hasItem → счёт модуля, остальное — из
 *  player.ctxExtras (уровень/навыки/флаги/ачивки). Используется экипировкой
 *  (M02.2) и использованием (M02.3) — один и тот же оценщик checkCondition. */
export function buildGateCtx(deps: GateCtxDeps): ConditionCtx {
  const extra = deps.gateExtras();
  const resolveCtx = deps.ctx();
  return {
    tags: [],
    stat: (stat) => deps.statBus.resolve({ stat, ctx: { ...resolveCtx, extra } }),
    hasFlag: (flag) => Boolean(extra[`flag:${flag}`]),
    skillLevel: (skill) => Number(extra[`skill:${skill}`] ?? 0),
    playerLevel: Number(extra['player:level'] ?? 0),
    itemCount: (defId) => deps.countAll(defId),
    hasAchievement: (id) => Boolean(extra[`achievement:${id}`]),
  };
}

export interface EquipDeps {
  table: InventoryTable;
  tryItem(defId: ID): ItemDef | undefined;
  statBus: StatBus;
  bus: EventBus;
  /** стандартный ResolveCtx (time.ctx('player')) */
  ctx(): ResolveCtx;
  /** уровень/навыки игрока для гейтов: gateExtras() отдаёт player.ctxExtras()
   *  через ModuleRegistry из app-слоя (П4: прямой импорт модулей запрещён) */
  gateExtras(): Record<string, unknown>;
  /** количество defId у игрока ЦЕЛИКОМ (включая экипированное) — гейт hasItem */
  countAll(defId: ID): number;
  getState(): InventoryState;
  setState(s: InventoryState): void;
  markDirty(): void;
}

export interface EquipReceipt {
  defId: ID;
  iid: ID;
  slot: string;
}

/** Куда надета запись (для отказов «уже экипирована») */
function slotOfIid(state: InventoryState, iid: ID): string | undefined {
  for (const [slot, id] of Object.entries(state.equipped)) {
    if (id === iid) return slot;
  }
  return undefined;
}

export class EquipService {
  private readonly deps: EquipDeps;

  constructor(deps: EquipDeps) {
    this.deps = deps;
  }

  /** Контекст гейтов: общий строитель equip/use (M02.3) — см. buildGateCtx */
  private gateCtx(): ConditionCtx {
    return buildGateCtx(this.deps);
  }

  equip(iid: ID, slotId: ID): Result<EquipReceipt> {
    const state = this.deps.getState();
    const slot = slotById(this.deps.table, slotId);
    if (!slot) {
      return err(
        `неизвестный слот экипировки: ${slotId} (доступны: ${this.deps.table.equipmentSlots.map((s) => s.id).join(', ')})`,
      );
    }
    const entry = state.items.find((it) => it.iid === iid);
    if (!entry) return err(`предмет "${iid}" не найден в инвентаре`);
    const already = slotOfIid(state, iid);
    if (already !== undefined) {
      return err(`запись ${iid} уже экипирована (слот ${already}) — сначала снимите`);
    }
    const occupied = state.equipped[slot.id];
    if (occupied !== undefined) {
      const occName = this.deps.tryItem(
        state.items.find((it) => it.iid === occupied)?.defId ?? '',
      )?.name;
      return err(
        `слот «${slot.name}» занят${occName ? ` (${occName} ${occupied})` : ` (${occupied})`} — сначала снимите`,
      );
    }
    const def = this.deps.tryItem(entry.defId);
    if (!def) return err(`предмет-шаблон "${entry.defId}" не найден в content/items`);
    if (!fitsSlot(def, slot)) {
      return err(`${def.name} (${def.itemType}) не подходит в слот «${slot.name}» — ${slotAcceptsLabel(slot)}`);
    }
    const failed = firstFailedRequirement(def.requirements, this.gateCtx());
    if (failed) {
      return err(`нельзя экипировать «${def.name}»: ${describeCondition(failed)}`);
    }

    this.deps.setState({ ...state, equipped: { ...state.equipped, [slot.id]: iid } });
    // событие ровно одно на экип (D29-правило: quality опциональна — включена,
    // подписчики её наличие НЕ предполагают)
    this.deps.bus.publish('item.equipped', {
      defId: entry.defId,
      iid,
      slot: slot.id,
      quality: { tier: entry.quality.tier, value: entry.quality.value },
    });
    // смена экипировки меняет выход провайдера — кэши шин пересчитать (§2.5)
    this.deps.bus.publish('invalidate.stat', {});
    this.deps.markDirty();
    return ok({ defId: entry.defId, iid, slot: slot.id });
  }

  /** Снятие: смена состояния + invalidate.stat, БЕЗ события (D21) */
  unequip(slotId: ID): Result<EquipReceipt> {
    const state = this.deps.getState();
    const slot = slotById(this.deps.table, slotId);
    if (!slot) {
      return err(
        `неизвестный слот экипировки: ${slotId} (доступны: ${this.deps.table.equipmentSlots.map((s) => s.id).join(', ')})`,
      );
    }
    const iid = state.equipped[slot.id];
    if (iid === undefined) return err(`слот «${slot.name}» пуст`);

    const equipped = { ...state.equipped };
    delete equipped[slot.id];
    this.deps.setState({ ...state, equipped });

    const entry = state.items.find((it) => it.iid === iid);
    if (!entry) {
      // битая ссылка (теоретически невозможна после загрузки) — самоисцеление
      this.deps.markDirty();
      return err(`слот «${slot.name}» ссылался на несуществующую запись ${iid} — ссылка очищена`);
    }
    // запись ВОЗВРАЩАЕТСЯ в рюкзак даже сверх capacity (легально по D28):
    // вместимость гейтит приобретение, а не владение
    this.deps.bus.publish('invalidate.stat', {});
    this.deps.markDirty();
    return ok({ defId: entry.defId, iid, slot: slot.id });
  }

  /** Вид экипировки для debug/UI: слот → запись (целиком, D30) */
  equippedView(): Array<{ slot: string; slotName: string; entry: ItemInstance }> {
    const state = this.deps.getState();
    const byIid = new Map(state.items.map((it) => [it.iid, it] as const));
    return this.deps.table.equipmentSlots.flatMap((slot) => {
      const iid = state.equipped[slot.id];
      const entry = iid !== undefined ? byIid.get(iid) : undefined;
      return entry ? [{ slot: slot.id, slotName: slot.name, entry }] : [];
    });
  }
}
