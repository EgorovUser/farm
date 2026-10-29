/**
 * Данные биржи M16.3 (карточка M16 §5 + 02-BUSES §5/§6 + 04-DISCOUNTS
 * §2.1/§4.3/§5). Форма — здесь; чистые оракулы (роллы контрактов/трендов
 * дня по dailySeed-канону, уровень репутации по очкам) — рядом, данные
 * без кода (03-DATA §12).
 *
 * [DECISION M163-партнёры] — 5 деревень-партнёров (коридор брифа 5–7):
 *  - Лесная Застава (травы/грибы) — торгует со всеми (0), старт 0;
 *  - Зернополье (зерно/овощи) — торгует со всеми (0), старт 10 («Знакомый»
 *    с самого начала — соседская деревня, данные);
 *  - Рыбный Кут (рыба) — контракты с «Знакомого» (1), старт 0;
 *  - Горный Перевал (руда/металл) — контракты с «Знакомого» (1), старт 0;
 *  - Баронство Юга (ткани/роскошь) — контракты с «Знакомого» (1), старт 0.
 *  Уникальные товары — СУЩЕСТВУЮЩИЕ defId (M09-каталог read-only), каждый
 *  принадлежит РОВНО ОДНОМУ партнёру (чек-связность — selftest):
 *  animal_remedy/spiced_stew/omelet/growth_elixir/fish_soup/battle_draught/
 *  luck_elixir/woven_banner — все ВНЕ пула магазина (покупка только тут).
 *
 * [DECISION M163-репутация] — шкала 4 ступени: Чужак 0 → Знакомый 10 →
 * Поставщик 30 → Друг деревни 60; +4 очка за контракт; «Друг деревни» −5%
 * (04 §2.1 — глобальный источник у ЕЁ торговцев).
 *
 * [DECISION M163-контракты] — контракт дня = (предмет из requests партнёра
 * × qty 2..6 × премия тира 40/60/90% к базовой ставке скупки 40%);
 * ролл по сиду hash(saveId, ':trade:', dateISO, partnerId[, '#', rerolls])
 * —dailySeed-канон 02 §6 («биржа роллится одинаково весь день»);
 * исполнение — TransactionService: списание предметов, выдача золота,
 * событие trade.fulfilled { gold } (счётчики trade.count/trade.volume —
 * конфиг ядра M01 §6, ждут это событие с фазы 0).
 *
 * [DECISION M163-тренды] — perDay товаров из пула биржи (requests ∪ goods)
 * получают тренд дня: «изобилие» (−15% на покупку, 04 §2.1) / «дефицит»
 * (+20% markup на покупку, 04 §4.3; ±10 к премии контракта); история цен —
 * кольцевой буфер 60 записей {day, defId, kind, unit, qty}.
 */
import type { VillageTradeTable } from './types';
import { hashString, mulberry32 } from '@/shared/utils/rng';

export const VILLAGE_TRADE: VillageTradeTable = {
  reputation: {
    levels: [
      { id: 'stranger', name: 'Чужак', minPoints: 0 },
      { id: 'acquaintance', name: 'Знакомый', minPoints: 10 },
      { id: 'supplier', name: 'Поставщик', minPoints: 30 },
      { id: 'friend', name: 'Друг деревни', minPoints: 60 },
    ],
    pointsPerContract: 4,
    friendDiscountPercent: 5,
  },
  contracts: {
    qtyMin: 2,
    qtyMax: 6,
    premiums: [40, 60, 90],
  },
  trends: {
    perDay: 2,
    abundancePercent: 15,
    deficitMarkupPercent: 20,
    contractSwingPercent: 10,
    historyCap: 60,
  },
  partners: [
    {
      id: 'lesnaya_zastava',
      name: 'Лесная Застава',
      desc: 'егеря и травники северного леса',
      requests: ['mushroom', 'healing_herb', 'amber_resin', 'honey'],
      goods: [
        { defId: 'animal_remedy', requiredLevel: 1 },
        { defId: 'spiced_stew', requiredLevel: 2 },
      ],
      startPoints: 0,
      contractMinLevel: 0,
    },
    {
      id: 'zernopolye',
      name: 'Зернополье',
      desc: 'хлеборобы бескрайних полей',
      requests: ['wheat_grain', 'carrot', 'potato', 'tomato'],
      goods: [
        { defId: 'omelet', requiredLevel: 0 },
        { defId: 'growth_elixir', requiredLevel: 2 },
      ],
      startPoints: 10,
      contractMinLevel: 0,
    },
    {
      id: 'rybny_kut',
      name: 'Рыбный Кут',
      desc: 'рыболовецкий посад у большой воды',
      requests: ['crucian', 'perch', 'tench', 'pike', 'zander'],
      goods: [{ defId: 'fish_soup', requiredLevel: 1 }],
      startPoints: 0,
      contractMinLevel: 1,
    },
    {
      id: 'gornyy_pereval',
      name: 'Горный Перевал',
      desc: 'рудокопы перевального кряжа',
      requests: ['iron_ore', 'copper_ore', 'tin_ore', 'iron_ingot'],
      goods: [{ defId: 'battle_draught', requiredLevel: 1 }],
      startPoints: 0,
      contractMinLevel: 1,
    },
    {
      id: 'baronstvo_yug',
      name: 'Баронство Юга',
      desc: 'богатый южный торговый дом',
      requests: ['wool', 'woven_banner', 'iron_plate', 'truffle'],
      goods: [
        { defId: 'luck_elixir', requiredLevel: 3 },
        { defId: 'woven_banner', requiredLevel: 2 },
      ],
      startPoints: 0,
      contractMinLevel: 1,
    },
  ],
};

// ---------------------------------------------------------------- оракулы

/** индекс уровня репутации по очкам (шкала возрастает; cap = последний) */
export function reputationLevelOf(table: VillageTradeTable, points: number): number {
  const pts = Math.max(0, Math.floor(points));
  let level = 0;
  for (let i = 0; i < table.reputation.levels.length; i++) {
    if (pts >= table.reputation.levels[i]!.minPoints) level = i;
  }
  return level;
}

/** имя уровня репутации по очкам (витрины/отказы) */
export function reputationLevelName(table: VillageTradeTable, points: number): string {
  return table.reputation.levels[reputationLevelOf(table, points)]!.name;
}

/** пул трендов биржи = requests ∪ goods (стабильный порядок: контент) */
export function trendPoolOf(table: VillageTradeTable): string[] {
  const seen: string[] = [];
  for (const p of table.partners) {
    for (const id of p.requests) if (!seen.includes(id)) seen.push(id);
    for (const g of p.goods) if (!seen.includes(g.defId)) seen.push(g.defId);
  }
  return seen;
}

/** суффикс дев-форса: '#N' после первого реролла (0 → пусто) */
export function rerollSuffixOf(rerolls: number): string {
  return rerolls > 0 ? `#${rerolls}` : '';
}

export interface VillageContract {
  item: string;
  qty: number;
  premiumPercent: number;
}

/** контракт дня партнёра — чистый ролл по сиду (детерминизм 02 §6) */
export function rollContractOf(
  table: VillageTradeTable,
  saveId: string,
  dateISO: string,
  partnerId: string,
  rerolls = 0,
): VillageContract {
  const p = table.partners.find((x) => x.id === partnerId)!;
  const seed = hashString(`${saveId}:trade:${dateISO}:${partnerId}${rerollSuffixOf(rerolls)}`);
  const rnd = mulberry32(seed);
  const item = p.requests[Math.floor(rnd() * p.requests.length)]!;
  const qty =
    table.contracts.qtyMin +
    Math.floor(rnd() * (table.contracts.qtyMax - table.contracts.qtyMin + 1));
  const premium = table.contracts.premiums[Math.floor(rnd() * table.contracts.premiums.length)]!;
  return { item, qty: Math.max(table.contracts.qtyMin, Math.min(table.contracts.qtyMax, qty)), premiumPercent: premium };
}

/** тренды дня — чистый ролл по сиду: perDay РАЗЛИЧНЫХ товаров пула,
 *  каждому «изобилие»/«дефицит» (50/50); пусто — ни один не выпал */
export function rollTrendsOf(
  table: VillageTradeTable,
  saveId: string,
  dateISO: string,
  rerolls = 0,
): Record<string, 'abundance' | 'deficit'> {
  const seed = hashString(`${saveId}:trade:trends:${dateISO}${rerollSuffixOf(rerolls)}`);
  const rnd = mulberry32(seed);
  const pool = [...trendPoolOf(table)];
  const out: Record<string, 'abundance' | 'deficit'> = {};
  const count = Math.min(table.trends.perDay, pool.length);
  for (let i = 0; i < count; i++) {
    const idx = Math.floor(rnd() * pool.length);
    const defId = pool.splice(idx, 1)[0]!;
    out[defId] = rnd() < 0.5 ? 'abundance' : 'deficit';
  }
  return out;
}

/** премия контракта с трендовым свингом (изобилие −, дефицит +; ≥ 0) */
export function premiumWithTrend(
  premiumPercent: number,
  trend: 'abundance' | 'deficit' | undefined,
  swingPercent: number,
): number {
  if (trend === 'abundance') return Math.max(0, premiumPercent - swingPercent);
  if (trend === 'deficit') return premiumPercent + swingPercent;
  return premiumPercent;
}
