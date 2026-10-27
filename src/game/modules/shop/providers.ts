/**
 * Провайдеры магазина (карточка §6 + 04-DISCOUNTS):
 *
 * - ShopStockProvider (PriceBus, 'shop.stock') — скидки завоза дня §2:
 *   «публикуется в систему скидок как локальный источник на этот день»;
 *   таргет — defId строк стока (предметные и валютные id, 04-DISCOUNTS §3).
 * - ShopLevelProvider (PriceBus, 'shop.level') — скидка уровня магазина
 *   (04-DISCOUNTS §2.2: «каждые 5 уровней −1%, до −10%»); действует на всё,
 *   что продаёт магазин (текущий сток).
 * - ShopBranchProvider (StatBus, 'shop.branches') — эффекты веток §3 и
 *   уровня как модификаторы статов shop.roll.* («эффекты веток — в StatBus»):
 *   будущие keystones M14 подцепятся к тем же статам без правки магазина.
 *
 * [DECISION · M04.1] уровень считается СВЫШЕ ПЕРВОГО (прецедент M01
 * levelBonus «за уровень свыше первого»): уровень 1 — базовые 25%.
 */
import type { PriceModifierProvider, PriceMod } from '@/kernel/bus/price-bus/price-bus';
import type { Modifier, ModifierProvider } from '@/kernel/bus/stat-bus/modifier';
import type { StatId, Tag } from '@/shared/types/ids';
import type { ShopTable } from '@/content/balance/shop';
import type { ShopState } from './state';

/** Скидки завоза дня: локальные источники на defId строк стока (§2) */
export class ShopStockProvider implements PriceModifierProvider {
  readonly id = 'shop.stock';

  constructor(
    private readonly deps: {
      getState(): ShopState;
    },
  ) {}

  provide(defId: string): PriceMod[] {
    const stock = this.deps.getState().stock;
    if (!stock) return [];
    const entry = stock.entries.find((e) => e.id === defId && e.discount !== undefined);
    if (!entry || entry.discount === undefined) return [];
    return [
      {
        id: `shop.slot.${stock.dateISO}.${defId}`,
        label: `скидка завоза ${stock.dateISO}`,
        kind: 'discountLocal',
        value: entry.discount,
      },
    ];
  }
}

/** Скидка уровня магазина (04-DISCOUNTS §2.2): −1% за каждые 5 уровней, до −10% */
export class ShopLevelProvider implements PriceModifierProvider {
  readonly id = 'shop.level';

  constructor(
    private readonly deps: {
      table: ShopTable;
      getState(): ShopState;
    },
  ) {}

  /** текущий размер скидки уровня, % (для debug/П6 — на стол) */
  currentPercent(): number {
    const { perLevels, percentPerStep, capPercent } = this.deps.table.levelDiscount;
    const level = this.deps.getState().level;
    return Math.min(capPercent, Math.floor(level / perLevels) * percentPerStep);
  }

  provide(defId: string): PriceMod[] {
    const value = this.currentPercent();
    if (value <= 0) return [];
    const stock = this.deps.getState().stock;
    if (!stock) return [];
    // таргет: только товары текущего завоза (магазин не «красит» чужие цены)
    if (!stock.entries.some((e) => e.id === defId)) return [];
    return [
      {
        id: 'shop.level',
        label: `уровень магазина ${this.deps.getState().level} (−${value}%)`,
        kind: 'discountLocal',
        value,
      },
    ];
  }
}

/** Эффекты веток §3 и уровня — модификаторами статов shop.roll.* (StatBus) */
export class ShopBranchProvider implements ModifierProvider {
  readonly id = 'shop.branches';

  constructor(
    private readonly deps: {
      getState(): ShopState;
    },
  ) {}

  provide(stat: StatId): Modifier[] {
    const s = this.deps.getState();
    const mod = (id: string, value: number, statId: StatId): Modifier => ({
      id,
      source: { kind: 'shop', refId: 'branches' },
      stat: statId,
      op: 'flat',
      value,
      tags: [] as Tag[],
    });
    switch (stat) {
      case 'shop.roll.discountChance': {
        // §2: 25% + 2% × уровень (свыше первого) + 2% × «Торговые связи» (§3)
        const value = 2 * (s.level - 1) + 2 * s.branches.ties;
        return value > 0 ? [mod('shop.level.chance', value, stat)] : [];
      }
      case 'shop.roll.qtyMax': {
        // §3 «Поставки»: +1..+2 к максимуму количества
        return s.branches.supplies > 0 ? [mod('shop.supplies', s.branches.supplies, stat)] : [];
      }
      case 'shop.roll.luxuryCount': {
        // §3 «Люкс-витрина»: +1 гарантированный rare+
        return s.branches.luxury > 0 ? [mod('shop.luxury', s.branches.luxury, stat)] : [];
      }
      default:
        return [];
    }
  }
}
