/**
 * Витрина M16.3 «Биржа» (village trade — доска контрактов/уникальные
 * товары/тренды/репутация/история цен; П6 «числа на стол», 04 §6.6
 * «любая скидка видна расшифровкой»). Текстовые ряды — БЕЗ графиков
 * (M18-замок: история цен — лента со стрелкой направления). Ноль импортов
 * игровых модулей (П4): цены — коллбек priceUnit/priceEstimate.
 */
import type { VillageTradeTable, VillageTradePartnerDef } from '@/content/village/types';
import { premiumWithTrend, reputationLevelOf, reputationLevelName } from '@/content/village/trade';
import { reputationPointsOf } from './trade';
import type { VillageState } from './state';

export interface TradeContractRow {
  partnerId: string;
  partnerName: string;
  item: string;
  qty: number;
  /** премия с трендовым свингом (к ставке скупки), % */
  premiumPercent: number;
  /** оценка за единицу по худшему экземпляру рюкзака (null — предмета нет) */
  estimateUnit: number | null;
  estimateTotal: number | null;
  fulfilledToday: boolean;
  /** гейт-причина контрактов партнёра (null — доступно) */
  gateLine: string | null;
}

export interface TradeGoodRow {
  partnerId: string;
  partnerName: string;
  defId: string;
  requiredLevel: number;
  requiredLevelName: string;
  price: number;
  applied: string[];
  gateLine: string | null;
}

export interface TradeTrendRow {
  defId: string;
  kind: 'abundance' | 'deficit';
  line: string;
}

export interface TradeRepRow {
  partnerId: string;
  partnerName: string;
  points: number;
  level: number;
  levelName: string;
  toNext: number | null;
}

export interface TradeHistoryRow {
  defId: string;
  kind: 'contract' | 'buy';
  unit: number;
  day: string;
  qty: number;
  arrow: 'up' | 'down' | 'flat' | 'none';
}

export interface TradeView {
  day: string;
  contracts: TradeContractRow[];
  goods: TradeGoodRow[];
  trends: TradeTrendRow[];
  reputation: TradeRepRow[];
  history: TradeHistoryRow[];
  marketDiscount: number;
}

export function buildTradeView(
  state: VillageState,
  table: VillageTradeTable,
  deps: {
    dateISO(): string;
    itemName(defId: string): string;
    /** sell-оценка единицы контракта (по тиру худшего экземпляра; null-тир — без качества) */
    contractUnitPrice(defId: string, tier: string | null, partnerId: string): number;
    /** buy-цена единицы уникального товара партнёра + расшифровка модов */
    goodPrice(defId: string, partnerId: string): { final: number; applied: string[] };
    /** худший экземпляр предмета в рюкзаке (D25) или null */
    worstTierOf(defId: string): string | null;
    marketDiscount(): number;
  },
): TradeView {
  const trade = state.trade;
  const dateISO = deps.dateISO();
  const contracts: TradeContractRow[] = [];
  const goods: TradeGoodRow[] = [];
  const reputation: TradeRepRow[] = [];
  const trends: TradeTrendRow[] = [];

  if (trade !== undefined) {
    for (const p of table.partners) {
      const points = reputationPointsOf(state, p.id, table);
      const level = reputationLevelOf(table, points);
      const next = table.reputation.levels[level + 1];
      reputation.push({
        partnerId: p.id,
        partnerName: p.name,
        points,
        level,
        levelName: reputationLevelName(table, points),
        toNext: next !== undefined ? Math.max(0, next.minPoints - points) : null,
      });

      const c = trade.contracts[p.id];
      if (c !== undefined) {
        const trend = trade.trends[c.item];
        const worst = deps.worstTierOf(c.item);
        const unit = deps.contractUnitPrice(c.item, worst, p.id);
        contracts.push({
          partnerId: p.id,
          partnerName: p.name,
          item: c.item,
          qty: c.qty,
          premiumPercent: premiumWithTrend(c.premiumPercent, trend, table.trends.contractSwingPercent),
          estimateUnit: unit,
          estimateTotal: unit * c.qty,
          fulfilledToday: trade.fulfilled[p.id] === dateISO,
          gateLine:
            level < p.contractMinLevel
              ? `нужен уровень репутации «${table.reputation.levels[p.contractMinLevel]!.name}» (сейчас «${table.reputation.levels[level]!.name}», очков ${points}/${table.reputation.levels[p.contractMinLevel]!.minPoints})`
              : null,
        });
      }
      for (const g of p.goods) {
        const { final, applied } = deps.goodPrice(g.defId, p.id);
        goods.push({
          partnerId: p.id,
          partnerName: p.name,
          defId: g.defId,
          requiredLevel: g.requiredLevel,
          requiredLevelName: table.reputation.levels[g.requiredLevel]!.name,
          price: final,
          applied,
          gateLine:
            level < g.requiredLevel
              ? `нужен уровень репутации «${table.reputation.levels[g.requiredLevel]!.name}» (сейчас «${table.reputation.levels[level]!.name}»)`
              : null,
        });
      }
    }
    for (const [defId, kind] of Object.entries(trade.trends)) {
      trends.push({
        defId,
        kind,
        line:
          kind === 'abundance'
            ? `изобилие: −${table.trends.abundancePercent}% на покупку (04 §2.1), свинг премии −${table.trends.contractSwingPercent}%`
            : `дефицит: +${table.trends.deficitMarkupPercent}% на покупку (04 §4.3), свинг премии +${table.trends.contractSwingPercent}%`,
      });
    }
  }

  // история: последние записи по каждому товару + стрелка (лента, НЕ график)
  const history: TradeHistoryRow[] = [];
  if (trade !== undefined) {
    const byItem = new Map<string, typeof trade.history>();
    for (const h of trade.history) {
      const list = byItem.get(h.defId) ?? [];
      list.push(h);
      byItem.set(h.defId, list);
    }
    for (const [defId, list] of byItem) {
      const last = list[list.length - 1]!;
      const prev = list.length >= 2 ? list[list.length - 2]! : null;
      history.push({
        defId,
        kind: last.kind,
        unit: last.unit,
        day: last.day,
        qty: last.qty,
        arrow: prev === null ? 'none' : last.unit > prev.unit ? 'up' : last.unit < prev.unit ? 'down' : 'flat',
      });
    }
  }

  return { day: trade?.day ?? dateISO, contracts, goods, trends, reputation, history, marketDiscount: deps.marketDiscount() };
}

/** партнёр по id ИЛИ имени (паттерн жителей) */
export function findPartner(table: VillageTradeTable, idOrName: string): VillageTradePartnerDef | undefined {
  return table.partners.find((p) => p.id === idOrName || p.name === idOrName);
}
