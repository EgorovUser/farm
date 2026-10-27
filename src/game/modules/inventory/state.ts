/**
 * Состояние инвентаря (M02): экземпляры предметов, экипировка (M02.2), счётчик iid.
 * Формат экземпляра — 03-DATA §4 (ItemInstance). Роллы — НЕ здесь (M03),
 * здесь — хранение и применение (карточка M02 §1).
 */
import type { SaveSlice } from '@/kernel/save/save-director';
import type { ID, QualityTier } from '@/shared/types/ids';
import { QUALITY_TIERS } from '@/shared/types/ids';
import type { RolledModEntry } from '@/shared/types/rolled-mod';
import type { ItemDef } from '@/content/items/items';
import type { InventoryTable } from '@/content/balance/inventory';

/** Качество экземпляра: тир D..SS + дробное значение 0..100 внутри тира */
export interface ItemQuality {
  tier: QualityTier;
  value: number;
}

/**
 * Ривен-ролл экземпляра — контракт 03-DATA §5. [M03.2] тип живёт в
 * shared/types/rolled-mod.ts (перекрёстный контракт M02/M03/M10/M11/M13, П4:
 * прямые импорты между модулями запрещены); здесь — реэкспорт для обратной
 * совместимости импортов M02. Генерация/бюджеты — M03; M02.2 хранит и
 * применяет (провайдер: type → ModTypeDef.stat, op inc, D31).
 * Чужая/битая форма в старых сейвах — passthrough без интерпретации (П5).
 */
export type { RolledModEntry };

export interface ItemInstance {
  iid: ID;
  defId: ID;
  qty: number;
  quality: ItemQuality;
  sharpeningLevel: number;
  rolledMods: RolledModEntry[];
  /** карточки «замороженных» откатом уровней заточки (M10) */
  frozenCards?: Record<number, ID>;
  /** только tool/weapon/armor/shield/rod (карточка §4) */
  durability?: { current: number; max: number };
}

export interface InventoryState {
  items: ItemInstance[];
  /** слот экипировки → iid; наполняется в M02.2 (D18: поле в срезе с первого дня) */
  equipped: Record<string, ID>;
  /** монотонный счётчик iid: `${defId}#${seq}` — [DECISION] читаемость для debug */
  seq: number;
}

export function defaultInventoryState(): InventoryState {
  return { items: [], equipped: {}, seq: 0 };
}

export function sameQuality(a: ItemQuality, b: ItemQuality): boolean {
  // D23: слияние только при ПОЛНОМ равенстве defId + quality (tier и value)
  return a.tier === b.tier && a.value === b.value;
}

/** maxStack по def + таблице (явный в def перекрывает дефолт типа, карточка §2) */
export function maxStackOf(def: ItemDef | undefined, table: InventoryTable): number {
  if (!def) return 50; // П5: неизвестный def — консервативный стандартный стак
  if (!def.stackable) return 1;
  return def.maxStack ?? table.stackDefaults[def.itemType] ?? 1;
}

// ------------------------------------------------------------- save slice

export interface InventorySaveDeps {
  tryItem(defId: ID): ItemDef | undefined;
  table: InventoryTable;
}

/**
 * Срез сейва 'inventory' (02-BUSES §11: чистые данные).
 * Формат v1: { v, items, equipped, seq }. Битые значения отбрасываются
 * с возвратом к дефолту поля (П5), после загрузки — нормализация по контенту:
 * слияние одинаковых defId+quality до maxStack, нарезка превышений,
 * заполнение прочности носителям (D18: «стаки режутся по maxStack» — точная
 * нарезка контент-осведомлена, ядрровая миграция v3→v4 контента не читает).
 */
export function inventorySaveSlice(
  getState: () => InventoryState,
  setState: (s: InventoryState) => void,
  deps: InventorySaveDeps,
): SaveSlice {
  return {
    save: () => {
      const s = getState();
      return {
        v: 1,
        items: s.items.map((it) => ({
          iid: it.iid,
          defId: it.defId,
          qty: it.qty,
          quality: { tier: it.quality.tier, value: it.quality.value },
          sharpeningLevel: it.sharpeningLevel,
          rolledMods: it.rolledMods,
          ...(it.frozenCards !== undefined ? { frozenCards: it.frozenCards } : {}),
          ...(it.durability !== undefined
            ? { durability: { current: it.durability.current, max: it.durability.max } }
            : {}),
        })),
        equipped: { ...s.equipped },
        seq: s.seq,
      };
    },
    load: (data) => {
      const parsed = data as
        | { items?: unknown; equipped?: unknown; seq?: unknown }
        | null;
      if (!parsed || typeof parsed !== 'object') return;
      const base = defaultInventoryState();
      const num = (v: unknown, fallback: number): number =>
        typeof v === 'number' && Number.isFinite(v) ? v : fallback;

      const loaded: ItemInstance[] = [];
      if (Array.isArray(parsed.items)) {
        for (const raw of parsed.items) {
          if (!raw || typeof raw !== 'object') continue;
          const r = raw as Record<string, unknown>;
          if (typeof r.iid !== 'string' || !r.iid) continue;
          if (typeof r.defId !== 'string' || !r.defId) continue;
          const qty = Math.floor(num(r.qty, 0));
          if (qty < 1) continue;
          const q = r.quality as { tier?: unknown; value?: unknown } | undefined;
          const tier = QUALITY_TIERS.includes(q?.tier as QualityTier)
            ? (q?.tier as QualityTier)
            : 'D';
          const value = Math.min(100, Math.max(0, num(q?.value, 50)));
          // [M02.2] роллы — структурная санация (П5): валидные {type, value}
          // проходят как есть (from без значения нормализуется в 'initial'),
          // мусор отбрасывается — провайдер интерпретирует только честную форму
          const rolled: RolledModEntry[] = (Array.isArray(r.rolledMods) ? r.rolledMods : [])
            .filter(isRolledModShape)
            .map((m) => (m.from === 'initial' || m.from === 'forge' ? m : { ...m, from: 'initial' }));
          const frozen =
            r.frozenCards && typeof r.frozenCards === 'object'
              ? (r.frozenCards as Record<number, ID>)
              : undefined;
          const d = r.durability as { current?: unknown; max?: unknown } | undefined;
          const durability =
            d && typeof d === 'object'
              ? {
                  current: Math.max(0, Math.floor(num(d.current, 1))),
                  max: Math.max(1, Math.floor(num(d.max, 1))),
                }
              : undefined;
          loaded.push({
            iid: r.iid,
            defId: r.defId,
            qty,
            quality: { tier, value },
            sharpeningLevel: Math.max(0, Math.floor(num(r.sharpeningLevel, 0))),
            rolledMods: rolled,
            ...(frozen !== undefined ? { frozenCards: frozen } : {}),
            ...(durability !== undefined ? { durability } : {}),
          });
        }
      }
      const equippedRaw: Record<string, ID> =
        parsed.equipped && typeof parsed.equipped === 'object'
          ? Object.fromEntries(
              Object.entries(parsed.equipped as Record<string, unknown>).filter(
                (e): e is [string, ID] => typeof e[0] === 'string' && typeof e[1] === 'string',
              ),
            )
          : {};

      const items = normalizeItems(loaded, deps);
      // [M02.2 · П5] битая ссылка слота (iid отсутствует в items) — не ошибка:
      // ссылка отбрасывается, остальное грузится как есть
      const known = new Set(items.map((it) => it.iid));
      const equipped = Object.fromEntries(
        Object.entries(equippedRaw).filter(([, iid]) => known.has(iid)),
      );

      setState({
        items,
        equipped,
        seq: Math.max(0, Math.floor(num(parsed.seq, loaded.length))),
      });
    },
  };
}

/**
 * Нормализация после загрузки (контент-осведомлённая, без потерь количества):
 * 1) носителям без прочности — полная (D18);
 * 2) записи с qty > maxStack режутся на дополнительные записи (новые iid).
 * Идемпотентна: валидное состояние проходит без изменений (roundtrip байт-в-байт).
 * Слияние одинаковых defId+quality НЕ выполняется — структура записей
 * (частичные стаки после изъятий) сохраняется как есть.
 */
function normalizeItems(items: ItemInstance[], deps: InventorySaveDeps): ItemInstance[] {
  const out: ItemInstance[] = [];
  let seq = 0;
  for (const raw of items) {
    const def = deps.tryItem(raw.defId);
    const it: ItemInstance =
      def?.durabilityMax && !raw.durability
        ? { ...raw, durability: { current: def.durabilityMax, max: def.durabilityMax } }
        : { ...raw };
    const max = maxStackOf(def, deps.table);
    let rest = it.qty;
    let first = true;
    while (rest > 0) {
      const take = Math.min(max, rest);
      out.push(
        first
          ? { ...it, qty: take }
          : { ...it, iid: `${it.defId}#n${++seq}`, qty: take },
      );
      rest -= take;
      first = false;
    }
  }
  return out;
}

/** структурная проверка ривен-ролла для загрузки (П5: мусор — не ошибка) */
function isRolledModShape(v: unknown): v is RolledModEntry {
  if (!v || typeof v !== 'object') return false;
  const r = v as Record<string, unknown>;
  return (
    typeof r.type === 'string' &&
    r.type !== '' &&
    typeof r.value === 'number' &&
    Number.isFinite(r.value) &&
    (r.from === undefined || r.from === 'initial' || r.from === 'forge') &&
    (r.forgeLevel === undefined || typeof r.forgeLevel === 'number')
  );
}
