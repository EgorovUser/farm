/**
 * villageTradeProvider (манифест priceModifierProviders, PriceBus) —
 * модификаторы цен БИРЖИ, скоуп = ctx.tags включает 'trade' (04-DISCOUNTS
 * §5: биржа — ТРЕТИЙ путь; тег отделяет её от магазина — изоляция цен):
 *
 *  - тренды дня (04 §2.1/§4.3, [DECISION M163-тренды]): «изобилие» →
 *    discountGlobal 15% на покупку товара; «дефицит» → markup 20%;
 *    на скупку по контракту — свинг премии ±10 (sellBonus);
 *  - репутация «Друг деревни» (04 §2.1, [DECISION M163-репутация]):
 *    discountGlobal 5% у торговцев партнёра с высшим уровнем (buy-сторона);
 *  - премия контракта ([DECISION M163-контракты]): sellBonus к ставке
 *    скупки при исполнении контракта (extra.contract, extra.partner) —
 *    итоговая ставка = min(1, 0.40 × (1 + премия/100));
 *  - Рынок деревни (G7, [DECISION M163-рынок]): discountLocal 5/8/10 на
 *    покупки у купцов — ПОТРЕБИТЕЛЬ override village.market.discountPercent
 *    (M16.2 оставил его резолв-без-потребителя).
 */
import type { PriceMod, PriceModifierProvider, PriceCtx } from '@/kernel/bus/price-bus/price-bus';
import type { VillageTradeTable } from '@/content/village/types';
import { premiumWithTrend, reputationLevelOf } from '@/content/village/trade';
import { marketDiscountOf } from './buildings';
import type { VillageBuildingDef } from '@/content/village/types';
import { reputationPointsOf } from './trade';
import type { VillageState } from './state';

export const VILLAGE_TRADE_PROVIDER_ID = 'village.trade';

export function makeVillageTradeProvider(
  getState: () => VillageState,
  table: VillageTradeTable,
  buildingDefs: VillageBuildingDef[],
): PriceModifierProvider {
  const trendCfg = table.trends;
  return {
    id: VILLAGE_TRADE_PROVIDER_ID,
    provide(defId: string, ctx: PriceCtx): PriceMod[] {
      const state = getState();
      if (!state.unlocked) return [];
      if (!ctx.tags?.includes('trade')) return []; // биржа-скоуп (04 §5)
      const mods: PriceMod[] = [];
      const trade = state.trade;
      const trend = trade?.trends[defId];
      // тренд дня: изобилие −15% (04 §2.1) / дефицит markup (04 §4.3)
      if (trend === 'abundance') {
        mods.push({
          id: `trade.trend.abundance.${defId}`,
          label: `изобилие на бирже −${trendCfg.abundancePercent}% (тренд дня)`,
          kind: 'discountGlobal',
          value: trendCfg.abundancePercent,
        });
      } else if (trend === 'deficit') {
        mods.push({
          id: `trade.trend.deficit.${defId}`,
          label: `дефицит на бирже +${trendCfg.deficitMarkupPercent}% (тренд дня)`,
          kind: 'markup',
          value: trendCfg.deficitMarkupPercent,
        });
      }
      // партнёр-скоуп (extra.partner): репутация + премия контракта
      const partnerId = typeof ctx.extra?.partner === 'string' ? (ctx.extra.partner as string) : null;
      if (partnerId !== null && trade !== undefined) {
        const points = reputationPointsOf(state, partnerId, table);
        // «Друг деревни» −5% у ЕЁ торговцев (04 §2.1; buy-сторона)
        if (reputationLevelOf(table, points) >= table.reputation.levels.length - 1) {
          mods.push({
            id: `trade.reputation.${partnerId}`,
            label: `«Друг деревни» −${table.reputation.friendDiscountPercent}% (репутация партнёра)`,
            kind: 'discountGlobal',
            value: table.reputation.friendDiscountPercent,
          });
        }
        // премия контракта дня (sellBonus к ставке скупки; extra.contract)
        if (ctx.extra?.contract === true) {
          const c = trade.contracts[partnerId];
          if (c !== undefined && c.item === defId) {
            const premium = premiumWithTrend(c.premiumPercent, trend, trendCfg.contractSwingPercent);
            if (premium > 0) {
              mods.push({
                id: `trade.contract.${partnerId}`,
                label: `премия контракта дня +${premium}% к ставке скупки${trend !== undefined ? ` (свинг тренда ${trend === 'abundance' ? '−' : '+'}${trendCfg.contractSwingPercent}%)` : ''}`,
                kind: 'sellBonus',
                value: premium,
              });
            }
          }
        }
      }
      // Рынок деревни (G7): discountLocal на покупки у купцов —
      // потребитель override village.market.discountPercent (M16.3)
      const market = marketDiscountOf(state, buildingDefs);
      if (market > 0) {
        mods.push({
          id: 'village.market.built',
          label: `Рынок деревни −${market}% у деревенских купцов (village.market.discountPercent)`,
          kind: 'discountLocal',
          value: market,
        });
      }
      return mods;
    },
  };
}
