/**
 * Витрины M16.1 «Деревня» (карточка §6; бриф §0 publicApi). ДО открытия
 * гейта — честное «деревня заперта» с условиями (П6 «гейты не прячутся»);
 * ПОСЛЕ — уровень/XP/жители/счастье/налог-строка с раскладкой модификаторов
 * (шансы и числа — на стол). Потребности — village.need <id|all>.
 */
import type { VillagerDef, VillageTable, VillageTaxTable } from '@/content/village/types';
import { villageLevelOf, villageXpToNext } from '@/content/village/table';
import { needSatisfied, taxInfoOf, taxModifiersOf } from './logic';
import type { VillageState } from './state';

export interface VillagerRow {
  id: string;
  name: string;
  profession: string;
  happiness: number;
  grumbleDays: number;
  grumbler: boolean;
  need: { item: string; qty: number; kind: 'daily' | 'weekly'; satisfied: boolean } | null;
  lastSatisfied: string | null;
}

export interface VillageStateView {
  unlocked: boolean;
  gateLines: string[];
  level: number;
  levelMax: number;
  xp: number;
  xpToNext: number | null;
  tax: {
    expectedGold: number;
    level: number;
    avgHappiness: number;
    grumblers: number;
    mods: Array<{ id: string; value: number }>;
  };
  villagers: VillagerRow[];
  villagersLocked: Array<{ id: string; name: string; profession: string; unlockLine: string }>;
  help: { usedToday: boolean; perDay: number };
}

export function buildVillageStateView(
  state: VillageState,
  defs: VillagerDef[],
  table: VillageTable,
  tax: VillageTaxTable,
  deps: { playerLevel(): number; hasFlag(flag: string): boolean; resolveTax(): number; dateISO(): string },
): VillageStateView {
  const level = villageLevelOf(state.xp, table.level);
  const xpToNext = level >= table.level.max ? null : villageXpToNext(table.level.baseXp, table.level.growth, level);
  const today = deps.dateISO();
  const rows: VillagerRow[] = [];
  const locked: VillageStateView['villagersLocked'] = [];
  for (const def of defs) {
    const live = state.villagers[def.id];
    if (live === undefined) {
      locked.push({
        id: def.id,
        name: def.name,
        profession: def.profession,
        unlockLine: unlockLineOf(def, level),
      });
      continue;
    }
    rows.push({
      id: def.id,
      name: def.name,
      profession: def.profession,
      happiness: live.happiness,
      grumbleDays: live.grumbleDays,
      grumbler: live.grumbleDays >= table.happiness.grumbleThreshold,
      need:
        live.need === undefined
          ? null
          : {
              item: live.need.item,
              qty: live.need.qty,
              kind: live.need.kind,
              satisfied: needSatisfied(live.need, live.lastSatisfied),
            },
      lastSatisfied: live.lastSatisfied ?? null,
    });
  }
  const info = taxInfoOf(state, defs, table, tax);
  return {
    unlocked: state.unlocked,
    gateLines: state.unlocked
      ? []
      : [
          `уровень игрока 30 (сейчас ${deps.playerLevel()})`,
          `ачивка «Мастер хутора» (ach_homestead_master)${deps.hasFlag('village.homestead.master') ? ' — открыта' : ' — не открыта (флаг village.homestead.master)'}`,
        ],
    level,
    levelMax: table.level.max,
    xp: state.xp,
    xpToNext,
    tax: {
      expectedGold: state.unlocked ? deps.resolveTax() : 0,
      level: info.level,
      avgHappiness: Math.round(info.avgHappiness * 10) / 10,
      grumblers: info.grumblers,
      mods: taxModifiersOf(info, tax),
    },
    villagers: rows,
    villagersLocked: locked,
    help: { usedToday: state.helpLastDay === today, perDay: 1 },
  };
}

function unlockLineOf(def: VillagerDef, level: number): string {
  const c = def.unlock;
  if (c === undefined) return 'открыт всегда';
  if (c.t === 'statAtLeast' && c.stat === 'village.level') {
    return `уровень деревни ${c.value} (сейчас ${level})`;
  }
  return `условие: ${JSON.stringify(c)}`;
}

export interface NeedRow {
  id: string;
  name: string;
  profession: string;
  line: string;
}

export function buildNeedsView(
  state: VillageState,
  defs: VillagerDef[],
  deps: { itemName(defId: string): string },
): NeedRow[] {
  const rows: NeedRow[] = [];
  for (const def of defs) {
    const live = state.villagers[def.id];
    if (live === undefined) continue;
    if (live.need === undefined) {
      rows.push({ id: def.id, name: def.name, profession: def.profession, line: 'потребности нет' });
      continue;
    }
    const satisfied = needSatisfied(live.need, live.lastSatisfied);
    const label = deps.itemName(live.need.item);
    rows.push({
      id: def.id,
      name: def.name,
      profession: def.profession,
      line: satisfied
        ? `удовлетворено сегодня: ${label} ×${live.need.qty} (${live.need.kind})`
        : `просит: ${label} ×${live.need.qty} (${live.need.kind}) — village supply ${def.id} ${live.need.item} ${live.need.qty}`,
    });
  }
  return rows;
}
