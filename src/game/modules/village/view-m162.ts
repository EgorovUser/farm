/**
 * Витрины M16.2 «Деревня» (расщепление view.ts по wc-гигиене 01 §6):
 * реестр построек (village build без аргумента — статусы/цены/таймеры/
 * эффекты, П6 «числа на стол») и рейд (village.raid — порог/защита/
 * расписание/маркеры окна). Ноль импортов игровых модулей (П4).
 */
import type { VillageBuildingDef, VillageRaidTable, VillagerDef } from '@/content/village/types';
import { raidThresholdOf } from '@/content/village/raid';
import { buildingLevelOf } from './buildings';
import {
  nextRaidAfter,
  raidAtOfWeek,
  raidDefenseOf,
  raidWeekKeyOf,
  warningAtOf,
  type RaidVillagerRow,
} from './raid';
import type { VillageState } from './state';

const MS_HOUR = 3_600_000;
const WEEKDAY_RU = ['—', 'понедельник', 'вторник', 'среда', 'четверг', 'пятница', 'суббота', 'воскресенье'] as const;

// ---------------------------------------------------------------- постройки

export interface BuildingRow {
  id: string;
  name: string;
  desc: string;
  kind: string;
  level: number;
  maxLevel: number;
  builtAt: string | null;
  status: 'built' | 'construction' | 'locked' | 'available';
  unlockLine: string;
  unlockPassed: boolean;
  construction: { finishAt: number; hoursLeft: number } | null;
  next: { level: number; costGold: number; items: Array<{ t: string; id: string; qty: number }>; hours: number; effect: number; xp: number } | null;
  effectNow: number;
}

export interface BuildingsView {
  level: number;
  rows: BuildingRow[];
  effects: { repairDiscount: number; marketDiscount: number; houseBonus: number; aura: number };
}

export function buildBuildingsView(
  state: VillageState,
  defs: VillageBuildingDef[],
  deps: {
    now(): number;
    villageLevel(): number;
    repairDiscount(): number;
    marketDiscount(): number;
    houseBonus(): number;
    aura(): number;
  },
): BuildingsView {
  const now = deps.now();
  const level = deps.villageLevel();
  const rows: BuildingRow[] = defs.map((def) => {
    const built = buildingLevelOf(state, def.id);
    const constr = state.construction?.[def.id];
    const gate = def.unlock;
    const unlockPassed = !(gate.t === 'statAtLeast' && gate.stat === 'village.level' && level < gate.value);
    const nextLevel = built + 1;
    const next = nextLevel <= def.levels.length && constr === undefined ? def.levels[nextLevel - 1]! : null;
    const status: BuildingRow['status'] =
      constr !== undefined ? 'construction' : built >= def.levels.length ? 'built' : unlockPassed ? 'available' : 'locked';
    return {
      id: def.id,
      name: def.name,
      desc: def.desc,
      kind: def.kind,
      level: built,
      maxLevel: def.levels.length,
      builtAt: state.buildings?.[def.id]?.builtAt ?? null,
      status,
      unlockLine: gate.t === 'statAtLeast' && gate.stat === 'village.level' ? `уровень деревни ${gate.value} (сейчас ${level})` : 'условие',
      unlockPassed,
      construction:
        constr !== undefined
          ? { finishAt: constr.finishAt, hoursLeft: Math.max(0, Math.ceil((constr.finishAt - now) / MS_HOUR)) }
          : null,
      next:
        next !== null
          ? {
              level: nextLevel,
              costGold: next.costGold,
              items: next.items.map((c) => ({ t: c.t, id: c.id, qty: c.qty })),
              hours: next.hours,
              effect: next.effect,
              xp: next.xp,
            }
          : null,
      effectNow: built > 0 ? def.levels[built - 1]!.effect : 0,
    };
  });
  return {
    level,
    rows,
    effects: {
      repairDiscount: deps.repairDiscount(),
      marketDiscount: deps.marketDiscount(),
      houseBonus: deps.houseBonus(),
      aura: deps.aura(),
    },
  };
}

// ---------------------------------------------------------------- рейд

export interface RaidView {
  threshold: number;
  villageLevel: number;
  defense: { total: number; buildings: number; villagers: RaidVillagerRow[] };
  warehouseProtection: number;
  walletGold: number;
  schedule: { weekday: string; hour: number; nextAt: number; nextWeek: string; inHours: number; warningAt: number };
  warning: { sent: boolean; week: string | null; leadHours: number; resolvedThisWeek: boolean };
  lastResult: { success: boolean; stolen: number; dateISO: string; week: string } | null;
}

export function buildRaidView(
  state: VillageState,
  defs: VillagerDef[],
  raid: VillageRaidTable,
  deps: {
    now(): number;
    villageLevel(): number;
    walletGold(): number;
    buildingDefense(): number;
    warehouseProtection(): number;
    itemTypeOf(defId: string): string;
    itemName(defId: string): string;
  },
): RaidView {
  const now = deps.now();
  const week = raidWeekKeyOf(now);
  const resolvedThisWeek = state.raid?.lastResult?.week === week;
  const raidAt = raidAtOfWeek(now, raid);
  const upcoming = resolvedThisWeek || now >= raidAt ? nextRaidAfter(now, raid) : { week, at: raidAt };
  const defense = raidDefenseOf(state, defs, raid, deps.buildingDefense(), {
    itemTypeOf: deps.itemTypeOf,
    itemName: deps.itemName,
  });
  return {
    threshold: raidThresholdOf(raid, deps.villageLevel()),
    villageLevel: deps.villageLevel(),
    defense,
    warehouseProtection: deps.warehouseProtection(),
    walletGold: deps.walletGold(),
    schedule: {
      weekday: WEEKDAY_RU[raid.weekday] ?? String(raid.weekday),
      hour: raid.hour,
      nextAt: upcoming.at,
      nextWeek: upcoming.week,
      inHours: Math.max(0, Math.round(((upcoming.at - now) / MS_HOUR) * 10) / 10),
      warningAt: warningAtOf(upcoming.at, raid),
    },
    warning: {
      sent: state.raid?.warned === true && state.raid?.week === raidWeekKeyOf(upcoming.at),
      week: state.raid?.week ?? null,
      leadHours: raid.warningLeadHours,
      resolvedThisWeek,
    },
    lastResult:
      state.raid?.lastResult !== undefined
        ? {
            success: state.raid.lastResult.success,
            stolen: state.raid.lastResult.stolen,
            dateISO: state.raid.lastResult.dateISO,
            week: state.raid.lastResult.week,
          }
        : null,
  };
}
