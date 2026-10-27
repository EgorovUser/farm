/**
 * UI-строки инвентаря (M02.2): отображение рюкзака и экипировки для панелей.
 * Вынесено из stores/game-store.ts по правилу 01-CORE §6 (>300 строк —
 * жёлтый флаг при следующем касании): маппинг строк — отдельная
 * ответственность, без игровой логики (UI только читает API модуля).
 */
import type { Game } from '@/game/bootstrap';

export interface StashRow {
  iid: string;
  defId: string;
  qty: number;
  name: string;
  tier: string;
  value: number;
}

export interface EquippedRow {
  slot: string;
  slotName: string;
  iid: string;
  defId: string;
  name: string;
  qty: number;
  tier: string;
  value: number;
  /** «80/80» или null, если предмет не носитель */
  durability: string | null;
  broken: boolean;
  /** текстовые подписи роллов: «atk_power +25» */
  mods: string[];
}

interface InvEntryShape {
  iid: string;
  defId: string;
  qty: number;
  quality: { tier: string; value: number };
  durability?: { current: number; max: number };
  rolledMods?: Array<{ type: string; value: number }>;
}

/** Рюкзак: записи инвентаря БЕЗ экипированных (D30 — их inv list не показывает) */
export function invRows(game: Game): StashRow[] {
  const inv = game.modules.get('inventory')?.api;
  if (inv) {
    const items = inv['inventory.list']() as InvEntryShape[];
    return items.map((it) => ({
      iid: it.iid,
      defId: it.defId,
      qty: it.qty,
      name: game.content.tryItem(it.defId)?.name ?? '???',
      tier: it.quality.tier,
      value: it.quality.value,
    }));
  }
  return game.stash.snapshot().map((s) => ({
    iid: s.defId,
    defId: s.defId,
    qty: s.qty,
    name: game.content.tryItem(s.defId)?.name ?? '???',
    tier: '—',
    value: 0,
  }));
}

/** Экипировка: слот → запись (целиком, D30), с прочностью и роллами */
export function equippedRows(game: Game): EquippedRow[] {
  const inv = game.modules.get('inventory')?.api;
  if (!inv) return [];
  const equipped = inv['inventory.equipped']() as Array<{
    slot: string;
    slotName: string;
    entry: InvEntryShape;
  }>;
  return equipped.map(({ slot, slotName, entry }) => ({
    slot,
    slotName,
    iid: entry.iid,
    defId: entry.defId,
    name: game.content.tryItem(entry.defId)?.name ?? '???',
    qty: entry.qty,
    tier: entry.quality.tier,
    value: entry.quality.value,
    durability: entry.durability ? `${entry.durability.current}/${entry.durability.max}` : null,
    broken: entry.durability !== undefined && entry.durability.current <= 0,
    mods: (entry.rolledMods ?? []).map((m) => `${m.type} ${m.value > 0 ? '+' : ''}${m.value}`),
  }));
}
