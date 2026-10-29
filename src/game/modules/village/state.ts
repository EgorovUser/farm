/**
 * Состояние M16 «Деревня» — срез `village`. M16.1: { v: 1, unlocked, xp,
 * villagers, helpLastDay }. [M16.2 · DECISION M162-срез]: расширение
 * ЛЕНЬИВЫМИ ключами БЕЗ bump (ПЯТНАДЦАТАЯ заморозка ядра; v: 1 НЕ растёт,
 * SAVE_VERSION 15 жив, миграций НЕТ — старые сейвы M16.1 грузятся без
 * изменений; вложенные ключи материализуются ТОЛЬКО при использовании):
 *  - buildings?: Record<id, { level, builtAt? }>     — построено/уровень;
 *  - construction?: Record<id, { finishAt }>          — живые таймеры стройки
 *    (finishAt — абсолют; час реального времени, hourTick-класс; цель
 *    уровня = текущий buildings[id].level + 1 — уровни строятся по одному);
 *  - equipped?: Record<villagerId, { defId, tier, value, sharpening }> —
 *    снаряжение жителей: СНАПШОТ качества/заточки на момент вручения
 *    (голый defId не выражает «разное качество → разная сила» G4; снятие
 *    возвращает предмет с исходным тиром/value каналом inventory.add);
 *  - raid?: { week, warned, lastResult? } — маркеры рейда: week — iso-якорь
 *    недели рейда (scoped-маркер: warned относится к окну week), lastResult
 *    — итог последнего разрешения (+week — идемпотентность разрешения).
 *
 * [M16.3 · DECISION M163-срез]: снова ЛЕНЬИВЫЕ ключи БЕЗ bump (v: 1 жив,
 * миграций НЕТ; док-факт «village-ключи материализуются при использовании»
 * сохраняется — до первого обращения к бирже открытой деревни ключей нет):
 *  - trade?: { day, contracts, trends, fulfilled, history, rerolls } —
 *    день биржи: контракты/тренды ротируются по маркеру day (идемпотентность
 *    dayTick-реплея и catchUp — прецедент need.day/raid.week); fulfilled —
 *    маркер «контракт партнёра исполнен в день N» (повтор — отказ);
 *    history — кольцевой буфер цен (cap в данных, хвост остаётся);
 *    rerolls — счётчик дев-форса ротации (сид-суффикс, обнуляется сменой дня);
 *  - reputation?: Record<partnerId, { points }> — очки репутации партнёров;
 *    уровень — ПРОИЗВОДНАЯ от очков (reputationLevelOf), в срезе не хранится;
 *    событие village.reputationChanged — на ИЗМЕНЕНИЕ уровня в момент
 *    исполнения контракта (единственный источник очков — маркер fulfilled
 *    гарантирует «ровно ×1»).
 *
 * КЛЮЧЕВЫЕ ИНВАРИАНТЫ (M16.1 живут):
 *  - ДО открытия гейта срез НЕ инициализируется: save() → undefined,
 *    файл чистой игры НЕ получает ключа village («пост-wipe тишина»).
 *  - Маркер «день обработан» = villager.need.day === today — повторный
 *    dayTick/catchUp налог НЕ задваивает.
 *  - Идемпотентность M16.2: завершение стройки УДАЛЯЕТ запись из
 *    construction (реплей hourTick не найдёт её — прецедент need.day);
 *    предвестник/разрешение рейда — маркеры (week, warned, lastResult.week).
 *  - Идемпотентность M16.3: trade.day === today — повторный dayTick НЕ
 *    переролливает контракты/тренды; fulfilled[partner] === today — повторное
 *    исполнение контракта отклоняется ещё до транзакции.
 *
 * Санитизация load: клэмпы; unknown-здания/жители/партнёры/товары НЕ
 * переносятся молча (контент мог уйти — канонический порядок ключей =
 * порядок контента, roundtrip байт-в-байт).
 */
import type { SaveSlice } from '@/kernel/save/save-director';
import type { VillagerDef, VillageBuildingDef, VillageTradeTable } from '@/content/village/types';
import { trendPoolOf } from '@/content/village/trade';
import { QUALITY_TIERS } from '@/shared/types/ids';
import type { QualityTier } from '@/shared/types/ids';

export interface VillageNeedState {
  item: string;
  qty: number;
  kind: 'daily' | 'weekly';
  /** день последнего подтверждения/ролла (weekly: обновляется ежедневно,
   *  item/qty стабильны в пределах iso-недели — см. шапку) */
  day: string;
}

export interface VillagerLiveState {
  happiness: number;
  grumbleDays: number;
  lastSatisfied?: string;
  need?: VillageNeedState;
}

/** [M16.2] снапшот снаряжения жителя (тир/value/заточка на момент вручения) */
export interface VillageEquipState {
  defId: string;
  tier: QualityTier;
  value: number;
  sharpening: number;
}

export interface VillageRaidResultState {
  success: boolean;
  stolen: number;
  dateISO: string;
  /** iso-якорь недели разрешённого рейда (идемпотентность разрешения) */
  week: string;
}

export interface VillageRaidState {
  /** iso-якорь недели окна, к которой относится warned */
  week: string;
  warned: boolean;
  lastResult?: VillageRaidResultState;
}

/** [M16.3] запись истории цен биржи (кольцевой буфер, cap в данных) */
export interface VillageTradeHistoryEntry {
  day: string;
  defId: string;
  kind: 'contract' | 'buy';
  /** цена ЗА ЕДИНИЦУ фактической сделки (final/qty, округлено) */
  unit: number;
  qty: number;
}

/** [M16.3] день биржи: контракты/тренды/маркеры исполнений/история */
export interface VillageTradeState {
  /** маркер дня ротации (идемпотентность dayTick-реплея) */
  day: string;
  /** контракт дня по партнёрам (порядок ключей = контент) */
  contracts: Record<string, { item: string; qty: number; premiumPercent: number }>;
  /** тренды дня: defId → изобилие/дефицит (пул биржи) */
  trends: Record<string, 'abundance' | 'deficit'>;
  /** маркер исполнения: партнёр → день (повтор — отказ) */
  fulfilled: Record<string, string>;
  /** кольцевой буфер цен (последние N сделок; cap в данных) */
  history: VillageTradeHistoryEntry[];
  /** счётчик дев-форса ротации (сид-суффикс; сбрасывается сменой дня) */
  rerolls: number;
}

export interface VillageState {
  v: 1;
  unlocked: boolean;
  xp: number;
  villagers: Record<string, VillagerLiveState>;
  helpLastDay: string | null;
  buildings?: Record<string, { level: number; builtAt?: string }>;
  construction?: Record<string, { finishAt: number }>;
  equipped?: Record<string, VillageEquipState>;
  raid?: VillageRaidState;
  trade?: VillageTradeState;
  reputation?: Record<string, { points: number }>;
}

export function defaultVillageState(): VillageState {
  return { v: 1, unlocked: false, xp: 0, villagers: {}, helpLastDay: null };
}

/** «чист» ли срез: деревня не открыта и ничего не делалось → тишина файла */
export function isPristineVillage(s: VillageState): boolean {
  return (
    !s.unlocked &&
    s.xp === 0 &&
    Object.keys(s.villagers).length === 0 &&
    s.helpLastDay === null &&
    (s.buildings === undefined || Object.keys(s.buildings).length === 0) &&
    (s.construction === undefined || Object.keys(s.construction).length === 0) &&
    (s.equipped === undefined || Object.keys(s.equipped).length === 0) &&
    s.raid === undefined &&
    s.trade === undefined &&
    s.reputation === undefined
  );
}

const num = (v: unknown, def: number): number =>
  typeof v === 'number' && Number.isFinite(v) ? v : def;

const clampInt = (v: unknown, def: number, min: number, max: number): number =>
  Math.max(min, Math.min(max, Math.floor(num(v, def))));

/** [M16.2] качество — ДРОБНОЕ 0..100: сила защиты жителя зависит от
 *  value × factor — инт-пол ломал точность снапшота через save/load */
const clampFloat = (v: unknown, def: number, min: number, max: number): number =>
  Math.max(min, Math.min(max, num(v, def)));

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const dateOrNull = (v: unknown): string | null => (typeof v === 'string' && DATE_RE.test(v) ? v : null);

function canonicalNeed(raw: unknown): VillageNeedState | undefined {
  if (raw === null || typeof raw !== 'object') return undefined;
  const n = raw as Record<string, unknown>;
  const item = typeof n.item === 'string' && n.item.length > 0 ? n.item : null;
  const day = dateOrNull(n.day);
  if (item === null || day === null) return undefined;
  const qty = clampInt(n.qty, 1, 1, 1_000_000);
  const kind = n.kind === 'weekly' ? 'weekly' : 'daily';
  return { item, qty, kind, day };
}

function canonicalVillager(raw: unknown): VillagerLiveState {
  const v = (raw === null || typeof raw !== 'object' ? {} : raw) as Record<string, unknown>;
  return {
    happiness: clampInt(v.happiness, 70, 0, 100),
    grumbleDays: clampInt(v.grumbleDays, 0, 0, 365),
    ...(dateOrNull(v.lastSatisfied) !== null ? { lastSatisfied: dateOrNull(v.lastSatisfied)! } : {}),
    ...(canonicalNeed(v.need) !== undefined ? { need: canonicalNeed(v.need)! } : {}),
  };
}

/** снапшот снаряжения: defId + валидный тир + value/заточка клэмпами */
function canonicalEquip(raw: unknown): VillageEquipState | undefined {
  if (raw === null || typeof raw !== 'object') return undefined;
  const e = raw as Record<string, unknown>;
  if (typeof e.defId !== 'string' || e.defId.length === 0) return undefined;
  const tier = QUALITY_TIERS.includes(e.tier as QualityTier) ? (e.tier as QualityTier) : null;
  if (tier === null) return undefined;
  return {
    defId: e.defId,
    tier,
    value: clampFloat(e.value, 50, 0, 100),
    sharpening: clampInt(e.sharpening, 0, 0, 1000),
  };
}

/** маркеры рейда: week — дата, warned — bool, lastResult — форма + week */
function canonicalRaid(raw: unknown): VillageRaidState | undefined {
  if (raw === null || typeof raw !== 'object') return undefined;
  const r = raw as Record<string, unknown>;
  const week = dateOrNull(r.week);
  if (week === null) return undefined;
  let lastResult: VillageRaidResultState | undefined;
  if (r.lastResult !== null && typeof r.lastResult === 'object') {
    const l = r.lastResult as Record<string, unknown>;
    const lw = dateOrNull(l.week);
    const ld = dateOrNull(l.dateISO);
    if (lw !== null && ld !== null) {
      lastResult = {
        success: l.success === true,
        stolen: clampInt(l.stolen, 0, 0, 1_000_000_000),
        dateISO: ld,
        week: lw,
      };
    }
  }
  return { week, warned: r.warned === true, ...(lastResult !== undefined ? { lastResult } : {}) };
}

/** [M16.3] день биржи: порядок ключей = контент партнёров/пула трендов;
 *  unknown-партнёры/товары НЕ переносятся молча; история — хвост cap */
function canonicalTrade(
  raw: unknown,
  trade: VillageTradeTable,
): VillageTradeState | undefined {
  if (raw === null || typeof raw !== 'object') return undefined;
  const t = raw as Record<string, unknown>;
  const day = dateOrNull(t.day);
  if (day === null) return undefined;
  const contracts: VillageTradeState['contracts'] = {};
  const contractsRaw = (t.contracts ?? {}) as Record<string, unknown>;
  for (const p of trade.partners) {
    const c = contractsRaw[p.id];
    if (c === null || typeof c !== 'object') continue;
    const rec = c as Record<string, unknown>;
    if (typeof rec.item !== 'string' || !p.requests.includes(rec.item)) continue;
    contracts[p.id] = {
      item: rec.item,
      qty: clampInt(rec.qty, 1, trade.contracts.qtyMin, trade.contracts.qtyMax),
      premiumPercent: clampInt(rec.premiumPercent, trade.contracts.premiums[0]!, trade.contracts.premiums[0]!, trade.contracts.premiums[trade.contracts.premiums.length - 1]!),
    };
  }
  const trendPool = trendPoolOf(trade);
  const trends: VillageTradeState['trends'] = {};
  const trendsRaw = (t.trends ?? {}) as Record<string, unknown>;
  for (const id of trendPool) {
    const kind = trendsRaw[id];
    if (kind === 'abundance' || kind === 'deficit') trends[id] = kind;
  }
  const fulfilled: VillageTradeState['fulfilled'] = {};
  const fulfilledRaw = (t.fulfilled ?? {}) as Record<string, unknown>;
  for (const p of trade.partners) {
    const d = dateOrNull(fulfilledRaw[p.id]);
    if (d !== null) fulfilled[p.id] = d;
  }
  const historyRaw = Array.isArray(t.history) ? t.history : [];
  const history: VillageTradeHistoryEntry[] = [];
  for (const h of historyRaw) {
    if (history.length >= trade.trends.historyCap) break;
    if (h === null || typeof h !== 'object') continue;
    const e = h as Record<string, unknown>;
    const d = dateOrNull(e.day);
    if (d === null || typeof e.defId !== 'string' || !trendPool.includes(e.defId)) continue;
    history.push({
      day: d,
      defId: e.defId,
      kind: e.kind === 'buy' ? 'buy' : 'contract',
      unit: clampInt(e.unit, 0, 0, 10_000_000),
      qty: clampInt(e.qty, 1, 1, 1_000_000),
    });
  }
  return {
    day,
    contracts,
    trends,
    fulfilled,
    history,
    rerolls: clampInt(t.rerolls, 0, 0, 999),
  };
}

/** [M16.3] очки репутации: порядок ключей = контент, клэмпы */
function canonicalReputation(raw: unknown, trade: VillageTradeTable): Record<string, { points: number }> | undefined {
  if (raw === null || typeof raw !== 'object') return undefined;
  const r = raw as Record<string, unknown>;
  const out: Record<string, { points: number }> = {};
  for (const p of trade.partners) {
    if (!Object.prototype.hasOwnProperty.call(r, p.id)) continue;
    const rec = r[p.id];
    if (rec === null || typeof rec !== 'object') continue;
    out[p.id] = { points: clampInt((rec as Record<string, unknown>).points, p.startPoints, 0, 999_999) };
  }
  return Object.keys(out).length > 0 ? out : undefined;
}

/** канонический порядок полей — roundtrip байт-в-байт */
export function canonicalVillageState(
  s: VillageState,
  defs: VillagerDef[],
  buildings: VillageBuildingDef[],
  trade: VillageTradeTable,
): VillageState {
  const villagers: Record<string, VillagerLiveState> = {};
  const raw = (s.villagers ?? {}) as Record<string, unknown>;
  // порядок ключей — порядок контента (стабильный roundtrip)
  for (const def of defs) {
    if (Object.prototype.hasOwnProperty.call(raw, def.id)) {
      villagers[def.id] = canonicalVillager(raw[def.id]);
    }
  }
  const buildingsRaw = (s.buildings ?? {}) as Record<string, unknown>;
  const built: Record<string, { level: number; builtAt?: string }> = {};
  for (const def of buildings) {
    const b = buildingsRaw[def.id];
    if (b === null || typeof b !== 'object') continue;
    const level = clampInt((b as Record<string, unknown>).level, 0, 0, def.levels.length);
    if (level <= 0) continue;
    const at = dateOrNull((b as Record<string, unknown>).builtAt);
    built[def.id] = { level, ...(at !== null ? { builtAt: at } : {}) };
  }
  const constructionRaw = (s.construction ?? {}) as Record<string, unknown>;
  const construction: Record<string, { finishAt: number }> = {};
  for (const def of buildings) {
    const c = constructionRaw[def.id];
    if (c === null || typeof c !== 'object') continue;
    const finishAt = Math.floor(num((c as Record<string, unknown>).finishAt, 0));
    if (finishAt > 0) construction[def.id] = { finishAt };
  }
  const equippedRaw = (s.equipped ?? {}) as Record<string, unknown>;
  const equipped: Record<string, VillageEquipState> = {};
  for (const def of defs) {
    if (Object.prototype.hasOwnProperty.call(equippedRaw, def.id)) {
      const e = canonicalEquip(equippedRaw[def.id]);
      if (e !== undefined) equipped[def.id] = e;
    }
  }
  return {
    v: 1,
    unlocked: s.unlocked === true,
    xp: Math.max(0, Math.floor(num(s.xp, 0))),
    villagers,
    helpLastDay: dateOrNull(s.helpLastDay),
    ...(Object.keys(built).length > 0 ? { buildings: built } : {}),
    ...(Object.keys(construction).length > 0 ? { construction } : {}),
    ...(Object.keys(equipped).length > 0 ? { equipped } : {}),
    ...(canonicalRaid(s.raid) !== undefined ? { raid: canonicalRaid(s.raid)! } : {}),
    ...(canonicalTrade(s.trade, trade) !== undefined ? { trade: canonicalTrade(s.trade, trade)! } : {}),
    ...(canonicalReputation(s.reputation, trade) !== undefined ? { reputation: canonicalReputation(s.reputation, trade)! } : {}),
  };
}

/**
 * Срез сейва: чистые данные; save() → undefined для чистого среза (до
 * открытия гейта ключ village НЕ пишется — «пост-wipe тишина»).
 */
export function villageSaveSlice(
  getState: () => VillageState,
  setState: (s: VillageState) => void,
  defs: VillagerDef[],
  buildings: VillageBuildingDef[],
  trade: VillageTradeTable,
): SaveSlice {
  return {
    save: () => {
      const s = getState();
      return isPristineVillage(s) ? undefined : canonicalVillageState(s, defs, buildings, trade);
    },
    load: (data: unknown) => {
      const s = data as VillageState | undefined;
      if (!s || typeof s !== 'object') {
        setState(defaultVillageState());
        return;
      }
      setState(canonicalVillageState(s, defs, buildings, trade));
    },
  };
}
