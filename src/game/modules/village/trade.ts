/**
 * Чистые потоки M16.3 «Биржа» (бриф G2/G3/G4/G5): ротация дня (контракты +
 * тренды по маркеру day — идемпотентность dayTick-реплея/catchUp, прецедент
 * need.day/raid.week), план исполнения контракта (худшие-вперёд D25 —
 * прецедент equip), план покупки уникального товара, история цен кольцевым
 * буфером. Ноль импортов игровых модулей (П4): цены/рюкзак — колбэками.
 *
 * [DECISION M163-контракты] исполнение: TransactionService costs=[предмет
 * ×qty] grants=[золото = Σ sellPrice экземпляров]; премия контракта —
 * sellBonus PriceBus (тег trade + extra.contract), трендовый свинг — там же.
 * [DECISION M163-окупаемость] — модельный расчёт по данным (модулем, G10).
 */
import type { VillageTradeTable } from '@/content/village/types';
import { rollContractOf, rollTrendsOf } from '@/content/village/trade';
import type { VillageState, VillageTradeHistoryEntry } from './state';

/** ротация дня биржи: маркер day (реплей того же дня НЕ переролливает;
 *  fulfilled сбрасывается (новый день — новые контракты), history живёт,
 *  rerolls обнуляются (дев-счётчик дня)) */
export function ensureTradeDay(
  state: VillageState,
  table: VillageTradeTable,
  deps: { saveId(): string },
  dateISO: string,
): { state: VillageState; rotated: boolean } {
  if (state.trade !== undefined && state.trade.day === dateISO) return { state, rotated: false };
  const rerolls = state.trade?.day === dateISO ? state.trade.rerolls : 0;
  const contracts: VillageState['trade'] extends undefined ? never : NonNullable<VillageState['trade']>['contracts'] = {};
  for (const p of table.partners) {
    contracts[p.id] = rollContractOf(table, deps.saveId(), dateISO, p.id, rerolls);
  }
  const trends = rollTrendsOf(table, deps.saveId(), dateISO, rerolls);
  const trade = {
    day: dateISO,
    contracts,
    trends,
    fulfilled: {} as Record<string, string>,
    history: state.trade?.history ?? [],
    rerolls,
  };
  return { state: { ...state, trade }, rotated: true };
}

/** дев-форс ротации: rerolls+1 → новые сиды контрактов/трендов ТОГО же дня;
 *  маркеры fulfilled НЕ сбрасываются (двойных исполнений форс не даёт) */
export function rerollTradeDay(
  state: VillageState,
  table: VillageTradeTable,
  deps: { saveId(): string },
  dateISO: string,
): VillageState {
  const rerolls = (state.trade?.day === dateISO ? state.trade.rerolls : 0) + 1;
  const contracts: Record<string, { item: string; qty: number; premiumPercent: number }> = {};
  for (const p of table.partners) {
    contracts[p.id] = rollContractOf(table, deps.saveId(), dateISO, p.id, rerolls);
  }
  const trends = rollTrendsOf(table, deps.saveId(), dateISO, rerolls);
  return {
    ...state,
    trade: {
      day: dateISO,
      contracts,
      trends,
      fulfilled: state.trade?.fulfilled ?? {},
      history: state.trade?.history ?? [],
      rerolls,
    },
  };
}

/** очки репутации партнёра (срез || стартовые из данных — до первого
 *  исполнения ключ reputation материализуется только при ИЗМЕНЕНИИ) */
export function reputationPointsOf(state: VillageState, partnerId: string, table: VillageTradeTable): number {
  const stored = state.reputation?.[partnerId]?.points;
  if (stored !== undefined) return stored;
  return table.partners.find((p) => p.id === partnerId)?.startPoints ?? 0;
}

/** запись в историю: кольцевой буфер — хвост cap последних сделок */
export function pushHistory(
  state: VillageState,
  table: VillageTradeTable,
  entry: VillageTradeHistoryEntry,
): VillageState {
  const trade = state.trade;
  if (trade === undefined) return state;
  const history = [...trade.history, entry];
  const cap = table.trends.historyCap;
  return { ...state, trade: { ...trade, history: history.length > cap ? history.slice(history.length - cap) : history } };
}

/** план списания контракта: худшие-вперёд D25 до qty (прецедент equip);
 *  null — предметов не хватает (честный отказ ДО транзакции) */
export function planContractTake(
  backpack: Array<{ iid: string; defId: string; qty: number; tier: string; value: number }>,
  item: string,
  qty: number,
): Array<{ tier: string; value: number }> | null {
  const order = ['D', 'C', 'B', 'A', 'S', 'SS'];
  const rows = backpack
    .filter((e) => e.defId === item && e.qty > 0)
    .sort((a, b) => order.indexOf(a.tier) - order.indexOf(b.tier) || a.value - b.value);
  const have = rows.reduce((s, e) => s + e.qty, 0);
  if (have < qty) return null;
  const take: Array<{ tier: string; value: number }> = [];
  let rest = qty;
  for (const e of rows) {
    const n = Math.min(rest, e.qty);
    for (let i = 0; i < n; i++) take.push({ tier: e.tier, value: e.value });
    rest -= n;
    if (rest <= 0) break;
  }
  return take;
}
