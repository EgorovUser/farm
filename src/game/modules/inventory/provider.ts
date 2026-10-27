/**
 * equipmentProvider (карточка M02 §5, бриф M02.2 §2.5): провайдер модификаторов
 * экипировки в StatBus. При резолве любого стата перечисляет экипированные
 * записи (D30: они в items[] по ссылке equipped) и отдаёт:
 *   - baseStats шаблона → flat (source kind 'item', refId = iid);
 *   - rolledMods → inc через ModTypeDef.stat (D31: значения M03 процентные,
 *     отрицательное значение = дебаф).
 *
 * [FIX-RIVEN · FX1 · [QUESTION] №1] НУЛЕВАЯ пред-база → flat-катализ: ривен-
 * строка, чей целевой стат на пред-базе 0 (дата-база 'bases' + флэты baseStats
 * экипированных носителей — ровно то, на что умножал бы inc), действует как
 * flat-прибавление ПРОЦЕНТНЫХ ПУНКТОВ (0 × 1.2 = 0 — инертность снята):
 * «Вещий удар» +20 → resolve combat.prophetic = 20 (вещий 20%); движок M12
 * читает resolve КАК КАНОНИРОВАНО. Выбор семантики — по данным (нулевая
 * пред-база → flat), НЕ хардкод имён строк (прецедент [DECISION] удач M01:
 * content/player/skills.ts — перки на нулевых базах дают 'flat'). Обычные
 * строки (ненулевая пред-база: attack 5+12, def 0+6, …) — inc, D31 цел
 * (оракул отрицания: 17 × 1.25 = 21.25 → 21).
 *
 * [M10.1 · шов §4.5] flat-база умножается на statScale заточки (1 + 0.05×L,
 * модуль forge через app-колбэк — П4, прецедент D38/C4): БАЗА не мутируется,
 * масштабируется только значение модификатора (П2). Без вайринга — 1 (инвариант
 * прежнего поведения).
 *
 * Сломан-гейт D22: durability.current = 0 → предмет НЕ даёт модов (остаётся
 * в слоте, «не работает, НЕ исчезает»). Неизвестный тип мода — пропуск (П5).
 * Смена экипировки публикует invalidate.stat (EquipService) — кэш шины сбрасывается.
 */
import type { Modifier, ModifierProvider, ResolveCtx } from '@/kernel/bus/stat-bus/modifier';
import type { StatId } from '@/shared/types/ids';
import type { ID } from '@/shared/types/ids';
import type { ItemDef } from '@/content/items/items';
import type { ModTypeDef } from '@/content/mods/registry';
import type { InventoryState, RolledModEntry } from './state';
import { equippedIidSet } from './equipment';

export interface EquipmentProviderDeps {
  getState(): InventoryState;
  tryItem(defId: ID): ItemDef | undefined;
  mods: readonly ModTypeDef[];
  /** [M10.1 · шов §4.5] множитель базы от заточки (forge.statScale); дефолт 1 */
  statScaleOf?(iid: ID): number;
  /** [FIX-RIVEN · FX1] дата-база стата из слияния 'bases' (П2 — данные,
  *  не мутируются). Без вайринга — 0 (пред-база = флэты носителей; инвариант
  *  прежнего поведения для статов без дата-базы). */
  baseOf?(stat: StatId): number;
}

/** Интерпретация роллов: структурная защита (П5) — форма {type, value} проверяется
 *  на всякий случай (загрузка уже санирует; здесь защита от чужих писателей) */
function interpretRolledMods(rolled: readonly RolledModEntry[]): RolledModEntry[] {
  return rolled.filter(
    (m) =>
      typeof m?.type === 'string' &&
      m.type !== '' &&
      typeof m.value === 'number' &&
      Number.isFinite(m.value),
  );
}

export class EquipmentProvider implements ModifierProvider {
  readonly id = 'inventory.equipment';
  private readonly deps: EquipmentProviderDeps;
  private readonly modsById: Map<ID, ModTypeDef>;

  constructor(deps: EquipmentProviderDeps) {
    this.deps = deps;
    this.modsById = new Map(deps.mods.map((m) => [m.id, m] as const));
  }

  provide(stat: StatId, _ctx: ResolveCtx): Modifier[] {
    const state = this.deps.getState();
    const equipped = equippedIidSet(state);
    if (equipped.size === 0) return [];

    const out: Modifier[] = [];
    // [FIX-RIVEN · FX1] накопитель флэтов baseStats по ЭТОМУ стату: пред-база
    // для выбора inc/flat у rolledMods (ровно то, на что умножал бы inc шины)
    let carrierFlats = 0;
    // отложенные ривен-строки: оп семантики решается ПОСЛЕ подсчёта пред-базы
    const deferred: Array<{ iid: ID; type: ID; value: number }> = [];
    for (const entry of state.items) {
      if (!equipped.has(entry.iid)) continue;
      // D22: сломанный носитель не работает (но не исчезает и остаётся в слоте)
      if (entry.durability !== undefined && entry.durability.current <= 0) continue;
      const def = this.deps.tryItem(entry.defId);
      if (!def) continue;

      for (const [statId, value] of Object.entries(def.baseStats ?? {})) {
        if (statId !== stat || typeof value !== 'number' || !Number.isFinite(value)) continue;
        // [M10.1 · шов §4.5] statScale заточки — к БАЗЕ (П2: сама база не мутируется)
        const scale = this.deps.statScaleOf ? this.deps.statScaleOf(entry.iid) : 1;
        const scaled = value * (Number.isFinite(scale) && scale > 0 ? scale : 1);
        carrierFlats += scaled;
        out.push({
          id: `item.${entry.iid}.base.${statId}`,
          source: { kind: 'item', refId: entry.iid },
          stat: statId,
          op: 'flat',
          value: scaled,
        });
      }
      for (const rm of interpretRolledMods(entry.rolledMods)) {
        const modDef = this.modsById.get(rm.type);
        if (!modDef || modDef.stat !== stat) continue;
        deferred.push({ iid: entry.iid, type: rm.type, value: rm.value });
      }
    }
    // [FIX-RIVEN · FX1] нулевая пред-база (дата-база + флэты носителей) →
    // flat-прибавление процентных пунктов; иначе — inc (D31 цел)
    const preBase = (this.deps.baseOf ? this.deps.baseOf(stat) : 0) + carrierFlats;
    const rollOp = preBase === 0 ? 'flat' : 'inc';
    for (const d of deferred) {
      out.push({
        id: `item.${d.iid}.roll.${d.type}`,
        source: { kind: 'item', refId: d.iid },
        stat,
        op: rollOp,
        value: d.value,
      });
    }
    return out;
  }
}
