/**
 * PriceBus — шина цен (02-BUSES §5 + 04-DISCOUNTS).
 *
 * buyPrice  = round( base × (1 + Σmarkup) × (1 − gGlobal) × (1 − gLocal) )
 *   gGlobal = min(capG, Σ глобальных скидок)   — внутри группы складываются
 *   gLocal  = min(capL, Σ локальных скидок)
 *   итог ≤ 90% от base: цена ≥ ceil(base × 0.1) — бесплатно ничего не бывает
 *
 * sellPrice = round( base × min(1, sellRate × (1 + ΣsellBonus)) )
 *
 * base экземпляра = def.basePrice × rarityMult × qualityMult.
 * Ни один модуль не имеет права считать цену сам — только priceBus.buy/sell.
 * Скидки приходят от зарегистрированных провайдеров (04-DISCOUNTS §1).
 */
import type { ID, QualityTier, Rarity } from '@/shared/types/ids';

export type PriceModKind = 'markup' | 'discountGlobal' | 'discountLocal' | 'sellBonus';

export interface PriceMod {
  id: string;
  label: string;
  kind: PriceModKind;
  /** проценты > 0 (для скидки — величина скидки) */
  value: number;
}

export interface PriceModifierProvider {
  id: ID;
  provide(defId: ID, ctx: PriceCtx): PriceMod[];
}

export interface PriceCtx {
  buyer: ID;
  now: number;
  tags?: string[];
  extra?: Record<string, unknown>;
}

export interface EconomyConfig {
  sellRatePercent: number;
  maxTotalDiscountPercent: number;
  minPriceFactor: number;
  globalGroupCapPercent: number;
  localGroupCapPercent: number;
  rarityPriceMult: Record<Rarity, number>;
  qualityPriceMult: Record<QualityTier, number>;
}

export interface PricedItemDef {
  id: ID;
  basePrice: number;
  rarity: Rarity;
  itemType?: string;
  subType?: string;
}

export interface AppliedPriceMod extends PriceMod {
  group: 'markup' | 'global' | 'local' | 'sell';
}

export interface PriceBreakdown {
  defId: ID;
  kind: 'buy' | 'sell';
  base: number;
  rarityMult: number;
  qualityMult: number;
  qualityTier: QualityTier | null;
  markupSumPercent: number;
  globalSumPercent: number;
  globalCapped: boolean;
  localSumPercent: number;
  localCapped: boolean;
  sellBonusPercent: number;
  final: number;
  floorApplied: boolean;
  /** [FIX-0.1 F] эффективная суммарная скидка ПОСЛЕ всех капов, % (1 − итоговый множитель) */
  totalDiscountPercent: number;
  /** [FIX-0.1 F] сработал клэмп maxTotalDiscountPercent (04-DISCOUNTS §4.1) */
  totalDiscountCapped: boolean;
  applied: AppliedPriceMod[];
}

export class PriceBus {
  private readonly economy: EconomyConfig;
  private readonly providers = new Map<string, PriceModifierProvider>();
  private readonly cache = new Map<string, PriceBreakdown>();

  constructor(economy: EconomyConfig) {
    this.economy = economy;
  }

  registerProvider(provider: PriceModifierProvider): void {
    this.providers.set(provider.id, provider);
    this.cache.clear();
  }

  unregisterProvider(providerId: string): void {
    if (this.providers.delete(providerId)) this.cache.clear();
  }

  providerIds(): string[] {
    return [...this.providers.keys()].sort();
  }

  clearCache(): void {
    this.cache.clear();
  }

  /** base экземпляра: basePrice × редкость × качество (03-DATA §1) */
  instanceBase(def: PricedItemDef, qualityTier?: QualityTier | null): number {
    const rarityMult = this.economy.rarityPriceMult[def.rarity] ?? 1;
    const qualityMult = qualityTier ? (this.economy.qualityPriceMult[qualityTier] ?? 1) : 1;
    return def.basePrice * rarityMult * qualityMult;
  }

  buyPrice(def: PricedItemDef, opts?: { qualityTier?: QualityTier | null; ctx?: PriceCtx }): PriceBreakdown {
    const ctx = opts?.ctx ?? { buyer: 'player', now: 0 };
    const key = `buy|${def.id}|${opts?.qualityTier ?? ''}|${ctx.buyer}|${ctx.now}|${(ctx.tags ?? []).join(',')}`;
    const cached = this.cache.get(key);
    if (cached) return cached;

    const base = this.instanceBase(def, opts?.qualityTier ?? null);
    const mods = this.gather(def.id, ctx);
    const markups = mods.filter((m) => m.kind === 'markup');
    const global = mods.filter((m) => m.kind === 'discountGlobal');
    const local = mods.filter((m) => m.kind === 'discountLocal');

    const markupSum = markups.reduce((a, m) => a + m.value, 0);
    const globalSumRaw = global.reduce((a, m) => a + m.value, 0);
    const localSumRaw = local.reduce((a, m) => a + m.value, 0);
    const globalSum = Math.min(this.economy.globalGroupCapPercent, globalSumRaw);
    const localSum = Math.min(this.economy.localGroupCapPercent, localSumRaw);

    // [FIX-0.1 F] инвариант 04-DISCOUNTS §4.1: эффективная суммарная скидка
    // 1 − (1−g)(1−l) не выше maxTotalDiscountPercent ИЗ КОНФИГА (раньше поле было
    // мёртвым и держалось лишь капами групп 60/40 → макс 76%). Клэмп виден в breakdown.
    const keepRaw = (1 - globalSum / 100) * (1 - localSum / 100);
    const minKeep = 1 - this.economy.maxTotalDiscountPercent / 100;
    const totalDiscountCapped = keepRaw < minKeep - 1e-9;
    const keep = totalDiscountCapped ? minKeep : keepRaw;

    let v = base * (1 + markupSum / 100);
    v *= keep;

    const floor = Math.ceil(base * this.economy.minPriceFactor);
    const rounded = Math.round(v);
    const floorApplied = rounded < floor;
    const final = Math.max(rounded, floor);

    const breakdown: PriceBreakdown = {
      defId: def.id,
      kind: 'buy',
      base,
      rarityMult: this.economy.rarityPriceMult[def.rarity] ?? 1,
      qualityMult: opts?.qualityTier ? (this.economy.qualityPriceMult[opts.qualityTier] ?? 1) : 1,
      qualityTier: opts?.qualityTier ?? null,
      markupSumPercent: markupSum,
      globalSumPercent: globalSum,
      globalCapped: globalSumRaw > globalSum,
      localSumPercent: localSum,
      localCapped: localSumRaw > localSum,
      sellBonusPercent: 0,
      final,
      floorApplied,
      totalDiscountPercent: (1 - keep) * 100,
      totalDiscountCapped,
      applied: mods.map((m) => ({
        ...m,
        group:
          m.kind === 'markup' ? 'markup' : m.kind === 'discountGlobal' ? 'global' : m.kind === 'discountLocal' ? 'local' : 'sell',
      })),
    };
    this.cache.set(key, breakdown);
    return breakdown;
  }

  sellPrice(def: PricedItemDef, opts?: { qualityTier?: QualityTier | null; ctx?: PriceCtx }): PriceBreakdown {
    const ctx = opts?.ctx ?? { buyer: 'player', now: 0 };
    const key = `sell|${def.id}|${opts?.qualityTier ?? ''}|${ctx.buyer}|${ctx.now}|${(ctx.tags ?? []).join(',')}`;
    const cached = this.cache.get(key);
    if (cached) return cached;

    const base = this.instanceBase(def, opts?.qualityTier ?? null);
    const mods = this.gather(def.id, ctx);
    const sellBonuses = mods.filter((m) => m.kind === 'sellBonus');
    const sellBonus = sellBonuses.reduce((a, m) => a + m.value, 0);

    // скупка не зависит от дневных скидок (04-DISCOUNTS §5)
    const rate = Math.min(1, (this.economy.sellRatePercent / 100) * (1 + sellBonus / 100));
    const final = Math.round(base * rate);

    const breakdown: PriceBreakdown = {
      defId: def.id,
      kind: 'sell',
      base,
      rarityMult: this.economy.rarityPriceMult[def.rarity] ?? 1,
      qualityMult: opts?.qualityTier ? (this.economy.qualityPriceMult[opts.qualityTier] ?? 1) : 1,
      qualityTier: opts?.qualityTier ?? null,
      markupSumPercent: 0,
      globalSumPercent: 0,
      globalCapped: false,
      localSumPercent: 0,
      localCapped: false,
      sellBonusPercent: sellBonus,
      final,
      floorApplied: false,
      totalDiscountPercent: 0,
      totalDiscountCapped: false,
      applied: sellBonuses.map((m) => ({ ...m, group: 'sell' as const })),
    };
    this.cache.set(key, breakdown);
    return breakdown;
  }

  private gather(defId: ID, ctx: PriceCtx): PriceMod[] {
    const out: PriceMod[] = [];
    for (const provider of this.providers.values()) {
      let provided: PriceMod[] = [];
      try {
        provided = provider.provide(defId, ctx) ?? [];
      } catch (e) {
         
        console.error(`[PriceBus] провайдер "${provider.id}" упал на ${defId}:`, e);
        continue;
      }
      for (const mod of provided) {
        if (mod && typeof mod.value === 'number' && Number.isFinite(mod.value) && mod.value > 0) {
          out.push(mod);
        }
      }
    }
    return out;
  }
}
