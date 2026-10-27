/**
 * Состояние магазина (M04): уровень/XP, ветки §3, дневной сток §2.
 * Формат v1 — чистые данные (02-BUSES §11). Сток — СНЭПШОТ ротации на день:
 * пересчёт детерминирован (dailySeed), но уровень/ветки меняются в течение
 * дня — пересоздание стока «на лету» выдавало бы новые скидки за прокачку;
 * день сменился (dayTick) → новый завоз (карточка §2 «пересчёт при первом
 * dayTick»). Купленное снижает остаток стока (qty до 0 — «распродано»).
 */
import type { SaveSlice } from '@/kernel/save/save-director';
import type { ID } from '@/shared/types/ids';

/** строка стока: базовая (всегда) / роллящаяся (30% пула) / закреплённая (ветка) */
export interface ShopStockEntry {
  id: ID;
  kind: 'item' | 'currency';
  /** остаток дневного запаса (покупки снижают) */
  qty: number;
  /** скидка завоза, % (5..50; только у роллящихся/люкс-позиций) */
  discount?: number;
  /** базовый ассортимент §2(а) — всегда, фиксированное количество */
  base: boolean;
  /** закреплён «Постоянным заказом» (ветка §3) */
  pinned?: boolean;
}

export interface ShopStock {
  /** день завоза (локальная дата ISO) — ключ детерминизма ротации */
  dateISO: string;
  entries: ShopStockEntry[];
}

/** ветки §3: уровни и выборы игрока (покупка ветвей — сеанс M04.2) */
export interface ShopBranches {
  /** ветка «Ассортимент»: выбранные в каталоге «что привозить» */
  assortmentPicks: ID[];
  /** ветка «Постоянный заказ»: закреплённые предметы */
  pinned: ID[];
  /** ветка «Поставки»: 0..2 (+1..+2 к максимуму количества) */
  supplies: number;
  /** ветка «Торговые связи»: +2% к шансу скидки за уровень */
  ties: number;
  /** ветка «Категории»: 0..4 — открыто закрытых полок (по порядку unlockOrder) */
  categories: number;
  /** ветка «Люкс-витрина»: 0..1 — +1 гарантированный rare+ */
  luxury: number;
}

export interface ShopState {
  v: 1;
  /** уровень магазина §3 (XP за каждую покупку — событие shop.purchased) */
  level: number;
  xp: number;
  branches: ShopBranches;
  /** текущий завоз; null до первой ротации (ensureStock/dayTick) */
  stock: ShopStock | null;
}

export function defaultShopState(): ShopState {
  return {
    v: 1,
    level: 1,
    xp: 0,
    branches: {
      assortmentPicks: [],
      pinned: [],
      supplies: 0,
      ties: 0,
      categories: 0,
      luxury: 0,
    },
    stock: null,
  };
}

// ------------------------------------------------------------- save slice

/**
 * Срез сейва 'shop' (02-BUSES §11). Санация П5: битые значения — к дефолту
 * поля, сток с пустым dateISO/entries — null (ротация пересоздаст).
 */
export function shopSaveSlice(
  getState: () => ShopState,
  setState: (s: ShopState) => void,
): SaveSlice {
  return {
    save: () => {
      const s = getState();
      return {
        v: 1,
        level: s.level,
        xp: s.xp,
        branches: {
          assortmentPicks: [...s.branches.assortmentPicks],
          pinned: [...s.branches.pinned],
          supplies: s.branches.supplies,
          ties: s.branches.ties,
          categories: s.branches.categories,
          luxury: s.branches.luxury,
        },
        ...(s.stock
          ? {
              stock: {
                dateISO: s.stock.dateISO,
                entries: s.stock.entries.map((e) => ({
                  id: e.id,
                  kind: e.kind,
                  qty: e.qty,
                  ...(e.discount !== undefined ? { discount: e.discount } : {}),
                  base: e.base,
                  ...(e.pinned ? { pinned: true } : {}),
                })),
              },
            }
          : {}),
      };
    },
    load: (data) => {
      const parsed = data as
        | (Partial<ShopState> & { stock?: unknown })
        | null;
      if (!parsed || typeof parsed !== 'object') return;
      const num = (v: unknown, fallback: number, min: number): number =>
        typeof v === 'number' && Number.isFinite(v) ? Math.max(min, Math.floor(v)) : fallback;
      const idList = (v: unknown): ID[] =>
        Array.isArray(v) ? v.filter((x): x is ID => typeof x === 'string' && x !== '') : [];

      const rawStock = parsed.stock as ShopStock | null | undefined;
      let stock: ShopStock | null = null;
      if (rawStock && typeof rawStock === 'object' && typeof rawStock.dateISO === 'string' && Array.isArray(rawStock.entries)) {
        const entries: ShopStockEntry[] = [];
        for (const raw of rawStock.entries) {
          if (!raw || typeof raw !== 'object') continue;
          const e = raw as unknown as Record<string, unknown>;
          if (typeof e.id !== 'string' || !e.id) continue;
          if (e.kind !== 'item' && e.kind !== 'currency') continue;
          const qty = Math.max(0, Math.floor(num(e.qty, 0, 0)));
          if (qty < 1) continue; // распроданные строки не персистим
          const discount =
            typeof e.discount === 'number' && Number.isFinite(e.discount) && e.discount > 0
              ? e.discount
              : undefined;
          entries.push({
            id: e.id,
            kind: e.kind,
            qty,
            ...(discount !== undefined ? { discount } : {}),
            base: e.base === true,
            ...(e.pinned === true ? { pinned: true } : {}),
          });
        }
        if (entries.length > 0) stock = { dateISO: rawStock.dateISO, entries };
      }

      const b = (parsed.branches ?? {}) as Partial<ShopBranches>;
      setState({
        v: 1,
        level: Math.max(1, num(parsed.level, 1, 1)),
        xp: num(parsed.xp, 0, 0),
        branches: {
          assortmentPicks: idList(b.assortmentPicks),
          pinned: idList(b.pinned),
          supplies: num(b.supplies, 0, 0),
          ties: num(b.ties, 0, 0),
          categories: num(b.categories, 0, 0),
          luxury: num(b.luxury, 0, 0),
        },
        stock,
      });
    },
  };
}
