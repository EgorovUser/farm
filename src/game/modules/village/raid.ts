/**
 * M16.2 «Рейды» (карточка §4; [DECISION M162-рейд] — порог-данные, БЕЗ rng)
 * — чистое ядро: расписание (день iso-недели + час ночи — данные), окно
 * предвестника РОВНО за 24 ч, расчёт защиты vs порог, кража с капой ≤ 20%
 * склада дня и защитой Склада. Транзакции/события — module.ts.
 *
 * Маркеры идемпотентности (срез state.ts): raid.week — iso-якорь недели
 * окна, к которому относится warned; raid.lastResult.week — неделя
 * разрешённого рейда. Повторный hourTick/реплей/catchUp не задваивают
 * ни предвестник, ни разрешение (прецедент налога M16.1).
 */
import type { VillageBuildingDef, VillageRaidTable, VillagerDef } from '@/content/village/types';
import { defenseStrengthOf, raidThresholdOf, stolenGoldOf, stolenPercentOf } from '@/content/village/raid';
import type { VillageState } from './state';
import { localDateISOOf } from './buildings';

const MS_HOUR = 3_600_000;
const MS_DAY = 86_400_000;

/** локальный iso-день недели (1=пн..7=вс) */
function localWeekdayOf(ms: number): number {
  const d = new Date(ms).getDay(); // 0=вс
  return d === 0 ? 7 : d;
}

/** iso-якорь недели (понедельник, локальный календарь) — ключ маркеров */
export function raidWeekKeyOf(ms: number): string {
  const wd = localWeekdayOf(ms);
  const monday = new Date(ms - (wd - 1) * MS_DAY);
  return localDateISOOf(monday.getTime());
}

/** таймстамп рейд-ночи ТЕКУЩЕЙ недели ms (понедельник недели + weekday−1 день, hour) */
export function raidAtOfWeek(ms: number, raid: VillageRaidTable): number {
  const wd = localWeekdayOf(ms);
  const d = new Date(ms);
  const monday = new Date(d.getFullYear(), d.getMonth(), d.getDate() - (wd - 1), raid.hour, 0, 0, 0);
  return monday.getTime() + (raid.weekday - 1) * MS_DAY;
}

/** рейд СЛЕДУЮЩЕЙ недели (после разрешённой текущей) */
export function nextRaidAfter(ms: number, raid: VillageRaidTable): { week: string; at: number } {
  const at = raidAtOfWeek(ms + 7 * MS_DAY, raid);
  return { week: raidWeekKeyOf(at), at };
}

/** момент предвестника (ровно warningLeadHours до рейд-ночи) */
export function warningAtOf(raidAt: number, raid: VillageRaidTable): number {
  return raidAt - raid.warningLeadHours * MS_HOUR;
}

export interface RaidVillagerRow {
  id: string;
  name: string;
  item: string;
  tier: string;
  value: number;
  sharpening: number;
  strength: number;
}

export interface RaidDefense {
  total: number;
  buildings: number;
  villagers: RaidVillagerRow[];
}

/** суммарная защита: постройки (fence+wall) + Σ сил снаряжения жителей */
export function raidDefenseOf(
  state: VillageState,
  defs: VillagerDef[],
  raid: VillageRaidTable,
  buildingDefense: number,
  deps: { itemTypeOf(defId: string): string; itemName(defId: string): string },
): RaidDefense {
  const rows: RaidVillagerRow[] = [];
  for (const def of defs) {
    const eq = state.equipped?.[def.id];
    if (eq === undefined) continue;
    const type = deps.itemTypeOf(eq.defId);
    rows.push({
      id: def.id,
      name: def.name,
      item: deps.itemName(eq.defId),
      tier: eq.tier,
      value: eq.value,
      sharpening: eq.sharpening,
      strength: defenseStrengthOf(raid, type, eq.tier, eq.value, eq.sharpening),
    });
  }
  const villagersSum = rows.reduce((s, r) => s + r.strength, 0);
  return { total: Math.round((buildingDefense + villagersSum) * 10) / 10, buildings: buildingDefense, villagers: rows };
}

export interface RaidOutcome {
  success: boolean;
  defense: number;
  threshold: number;
  deficit: number;
  stolenPercent: number;
  stolenGold: number;
  warehouseProtection: number;
  week: string;
  dateISO: string;
}

/**
 * Исход рейда — РАСЧЁТ (не лотерея): защита ≥ порога → победа (кража 0);
 * иначе кража = base + perDeficit × дефицит (капа ≤ capPercent cozy),
 * Склад режет на свой %; золото = % от склада (кошелька) на момент ночи.
 */
export function resolveRaidOutcome(
  state: VillageState,
  defs: VillagerDef[],
  raid: VillageRaidTable,
  deps: {
    villageLevel: number;
    walletGold: number;
    buildingDefense: number;
    warehouseProtection: number;
    itemTypeOf(defId: string): string;
    itemName(defId: string): string;
    now: number;
    raidAt: number;
  },
): RaidOutcome {
  const defense = raidDefenseOf(state, defs, raid, deps.buildingDefense, deps).total;
  const threshold = raidThresholdOf(raid, deps.villageLevel);
  const success = defense >= threshold;
  const deficit = Math.max(0, threshold - defense);
  const stolenPercent = success ? 0 : stolenPercentOf(raid, deficit);
  const stolenGold = success ? 0 : stolenGoldOf(raid, stolenPercent, deps.walletGold, deps.warehouseProtection);
  return {
    success,
    defense,
    threshold,
    deficit,
    stolenPercent,
    stolenGold,
    warehouseProtection: deps.warehouseProtection,
    week: raidWeekKeyOf(deps.raidAt),
    dateISO: localDateISOOf(deps.now),
  };
}

/** окно рейда для hourTick-детекции: что должно произойти в момент now */
export type RaidWindowAction =
  | { t: 'quiet' }
  | { t: 'warn'; week: string; raidAt: number; warningAt: number; leadHours: number }
  | { t: 'resolve'; week: string; raidAt: number };

/**
 * Детекция окна (чистая): маркеры среза решают, тихо ли. Вызывается на
 * КАЖДОМ hourTick (живой и catchUp) — идемпотентность маркерами:
 *  - lastResult.week === неделя текущего рейда → разрешено → quiet;
 *  - now ≥ рейд-ночь и не разрешено → resolve (вовремя или опоздание);
 *  - now в окне предвестника и warned не относится к этой неделе → warn.
 */
export function raidWindowAction(
  state: VillageState,
  raid: VillageRaidTable,
  now: number,
): RaidWindowAction {
  const week = raidWeekKeyOf(now);
  const raidAt = raidAtOfWeek(now, raid);
  if (state.raid?.lastResult?.week === week) return { t: 'quiet' };
  if (now >= raidAt) return { t: 'resolve', week, raidAt };
  const warningAt = warningAtOf(raidAt, raid);
  if (now >= warningAt && !(state.raid?.week === week && state.raid?.warned === true)) {
    return { t: 'warn', week, raidAt, warningAt, leadHours: raid.warningLeadHours };
  }
  return { t: 'quiet' };
}
