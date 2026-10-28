/**
 * Чистое ядро M16.1 «Деревня» (карточка §2–§3, бриф G1–G7): роллы
 * потребностей dailySeed-каноном, дневной проход (ворчание → счастье →
 * ролл → налог), уровень/XP, оракулы налога/подарка. Ноль импортов
 * игровых модулей; шины — колбэками module.ts.
 *
 * Сид потребностей (бриф §0): hash(saveId, 'village-needs', dateISO) —
 * daily по дате, weekly по якорю iso-недели (понедельник); перезапуск
 * перероллов не даёт (прецеденты ротации M04 / доски M13).
 */
import { hashString, mulberry32, weightedPick } from '@/shared/utils/rng';
import type {
  VillagerDef,
  VillageGiftsTable,
  VillageNeedsTable,
  VillageTable,
  VillageTaxTable,
} from '@/content/village/types';
import { needWeightOf } from '@/content/village/needs';
import { giftChancePercent } from '@/content/village/gifts';
import { villageLevelOf } from '@/content/village/table';
import type { VillageNeedState, VillageState, VillagerLiveState } from './state';
export type { VillagerLiveState };

// ---------------------------------------------------------------- iso-неделя

/** якорь iso-недели (понедельник) для dateISO — сид weekly-роллов */
export function weekAnchorOf(dateISO: string): string {
  const d = new Date(`${dateISO}T00:00:00Z`);
  if (Number.isNaN(d.getTime())) return dateISO;
  const dow = d.getUTCDay(); // 0=вс .. 6=сб
  d.setUTCDate(d.getUTCDate() + (dow === 0 ? -6 : 1 - dow));
  return d.toISOString().slice(0, 10);
}

export function sameISOWeek(a: string, b: string): boolean {
  return weekAnchorOf(a) === weekAnchorOf(b);
}

// ---------------------------------------------------------------- роллы

function pickNeed(
  saveId: string,
  def: VillagerDef,
  pools: VillageNeedsTable,
  kind: 'daily' | 'weekly',
  dateISO: string,
): VillageNeedState | undefined {
  const candidates = def.needs[kind];
  if (candidates === undefined || candidates.length === 0) return undefined;
  // сид: daily — по дате; weekly — по якорю iso-недели (стабилен всю неделю);
  // day — ДЕНЬ РОЛЛА (маркер «день обработан»; weekly подтверждается ежедневно)
  const seedDay = kind === 'weekly' ? weekAnchorOf(dateISO) : dateISO;
  const seed = hashString(`${saveId}:village-needs${kind === 'weekly' ? ':weekly' : ''}:${seedDay}:${def.id}`);
  const rnd = mulberry32(seed);
  const entry = weightedPick(
    candidates.map((c) => ({ id: c.defId, weight: needWeightOf(pools, c.defId, kind) })),
    rnd,
  );
  if (entry === null) return undefined;
  const chosen = candidates.find((c) => c.defId === entry.id)!;
  return { item: chosen.defId, qty: chosen.qty, kind, day: dateISO };
}

export const rollDailyNeed = (
  saveId: string,
  def: VillagerDef,
  pools: VillageNeedsTable,
  dateISO: string,
): VillageNeedState | undefined => pickNeed(saveId, def, pools, 'daily', dateISO);

export const rollWeeklyNeed = (
  saveId: string,
  def: VillagerDef,
  pools: VillageNeedsTable,
  dateISO: string,
): VillageNeedState | undefined => {
  // сид — якорь iso-недели (стабилен пн–вс: перезапуск внутри недели
  // переролла НЕ даёт); day-маркер — ДАТА РОЛЛА (инвариант state.ts:
  // need.day = день обработки, weekly подтверждается ежедневно)
  const need = pickNeed(saveId, def, pools, 'weekly', weekAnchorOf(dateISO));
  return need === undefined ? undefined : { ...need, day: dateISO };
};

// ---------------------------------------------------------------- состояние потребности

/** потребность удовлетворена? (день — daily; iso-неделя — weekly) */
export function needSatisfied(need: VillageNeedState, lastSatisfied?: string): boolean {
  if (lastSatisfied === undefined) return false;
  return need.kind === 'weekly' ? sameISOWeek(lastSatisfied, need.day) : lastSatisfied === need.day;
}

/** день жителя обработан? (маркер идемпотентности — шапка state.ts) */
export function villagerProcessedToday(v: VillagerLiveState, dateISO: string): boolean {
  return v.need !== undefined && v.need.day === dateISO;
}

/** новый ролл слота потребности на день D (weekly держится всю неделю) */
export function rollNeedFor(
  saveId: string,
  def: VillagerDef,
  v: VillagerLiveState,
  pools: VillageNeedsTable,
  dateISO: string,
): VillageNeedState | undefined {
  const stored = v.need;
  // недельная этой недели, ещё НЕ удовлетворённая — держится (подтверждение дня)
  if (
    stored !== undefined &&
    stored.kind === 'weekly' &&
    sameISOWeek(stored.day, dateISO) &&
    !needSatisfied(stored, v.lastSatisfied)
  ) {
    return { ...stored, day: dateISO };
  }
  // недельная уже была удовлетворена на этой неделе → до конца недели daily
  const weeklyDone =
    stored !== undefined && stored.kind === 'weekly' && sameISOWeek(stored.day, dateISO);
  if (!weeklyDone) {
    const w = rollWeeklyNeed(saveId, def, pools, dateISO);
    if (w !== undefined) return w;
  }
  return rollDailyNeed(saveId, def, pools, dateISO);
}

// ---------------------------------------------------------------- день-пас

export interface DayPassResult {
  state: VillageState;
  /** обработан ли хотя бы один житель (налог стрелял только тогда) */
  processed: boolean;
  /** собранный налог (золото; 0 — день уже обработан/деревня закрыта) */
  taxGold: number;
  grumblersAfter: string[];
  newVillagers: string[];
}

/**
 * Дневной проход (dayTick/catchUp — идемпотентен по маркерам need.day):
 *  1) joining новых жителей по unlock-гейтам (уровень деревни);
 *  2) по каждому НЕобработанному сегодня: ворчание (unsatisfied →
 *     grumbleDays++, иначе сброс) → падение счастья ворчуна → ролл слота
 *     (присоединившийся житель без need тоже обрабатывается здесь);
 *  3) processed = кто-то обработан → НАЛОГ: модуль применит состояние и
 *     только затем резолвит 'village.tax.gold' через шину (провайдер
 *     читает НОВОЕ состояние дня — G4/G6; повторный тик того же дня ничего
 *     не делает — маркеры need.day, налог НЕ задваивается).
 */
export function dayPass(
  state: VillageState,
  defs: VillagerDef[],
  unlockPass: (def: VillagerDef) => boolean,
  deps: { saveId(): string; pools: VillageNeedsTable; table: VillageTable },
  dateISO: string,
  force = false,
): DayPassResult {
  const villagers: Record<string, VillagerLiveState> = { ...state.villagers };
  const newVillagers: string[] = [];
  // 1) joining: unlock-гейт прошёл, записи ещё нет
  for (const def of defs) {
    if (villagers[def.id] === undefined && unlockPass(def)) {
      villagers[def.id] = { happiness: deps.table.happiness.start, grumbleDays: 0 };
      newVillagers.push(def.id);
    }
  }
  let processed = newVillagers.length > 0;
  // 2) дневная обработка каждого жителя (force — dev-обход маркеров)
  for (const def of defs) {
    const v = villagers[def.id];
    if (v === undefined) continue;
    if (!force && villagerProcessedToday(v, dateISO)) continue;
    processed = true;
    let happiness = v.happiness;
    let grumbleDays = v.grumbleDays;
    const stale = v.need;
    if (stale !== undefined && !needSatisfied(stale, v.lastSatisfied)) {
      grumbleDays += 1;
    } else {
      grumbleDays = 0;
    }
    if (grumbleDays >= deps.table.happiness.grumbleThreshold) {
      happiness = Math.max(0, happiness - deps.table.happiness.dropPerGrumbleDay);
    }
    const need = rollNeedFor(deps.saveId(), def, { ...v, happiness, grumbleDays }, deps.pools, dateISO);
    villagers[def.id] = {
      happiness,
      grumbleDays,
      ...(v.lastSatisfied !== undefined ? { lastSatisfied: v.lastSatisfied } : {}),
      ...(need !== undefined ? { need } : {}),
    };
  }
  // 3) processed → налог-сигнал: вызывающий применит состояние и только
  //    затем резолвит через шину (провайдер читает НОВЫЙ день)
  const taxGold = processed ? -1 : 0; // −1 = «собрать налог» (resolve модуля)
  const grumblersAfter = Object.entries(villagers)
    .filter(([, v]) => v.grumbleDays >= deps.table.happiness.grumbleThreshold)
    .map(([id]) => id);
  return {
    state: { ...state, villagers, xp: state.xp },
    processed,
    taxGold,
    grumblersAfter,
    newVillagers,
  };
}

// ---------------------------------------------------------------- налог-инфо

export interface TaxInfo {
  level: number;
  avgHappiness: number;
  grumblers: number;
}

/** сводка для провайдера и витрины (ожидание дня — до resolve) */
export function taxInfoOf(state: VillageState, defs: VillagerDef[], table: VillageTable, tax: VillageTaxTable): TaxInfo {
  const live = defs.filter((d) => state.villagers[d.id] !== undefined);
  const level = villageLevelOf(state.xp, table.level);
  if (live.length === 0) return { level, avgHappiness: tax.happinessPivot, grumblers: 0 };
  const values = live.map((d) => state.villagers[d.id]!.happiness);
  const avg = values.reduce((a, b) => a + b, 0) / values.length;
  const grumblers = live.filter((d) => state.villagers[d.id]!.grumbleDays >= table.happiness.grumbleThreshold).length;
  return { level, avgHappiness: avg, grumblers };
}

/** модификаторы провайдера для стата 'village.tax.gold' (G4/G6 — шина) */
export function taxModifiersOf(
  info: TaxInfo,
  tax: VillageTaxTable,
): Array<{ id: string; value: number }> {
  const mods: Array<{ id: string; value: number }> = [];
  const levelInc = tax.perLevelPercent * Math.max(0, info.level - 1);
  if (levelInc !== 0) mods.push({ id: 'village.tax.level', value: levelInc });
  const happinessInc = (tax.happinessSwingPercent * (info.avgHappiness - tax.happinessPivot)) / 50;
  if (happinessInc !== 0) mods.push({ id: 'village.tax.happiness', value: happinessInc });
  const grumblerInc = -tax.grumblerPenaltyPercent * info.grumblers;
  if (grumblerInc !== 0) mods.push({ id: 'village.tax.grumbler', value: grumblerInc });
  return mods;
}

// ---------------------------------------------------------------- подарки

/** шанс подарка (%%) при счастье жителя — данные gifts.ts (G7) */
export const giftChanceOf = (gifts: VillageGiftsTable, happiness: number): number =>
  giftChancePercent(gifts, happiness);

/** выбор записи таблицы подарков: pick-ролл (взвешенный) + qty-ролл
 *  (диапазон записи) — раздельные стримы RngBus; оракул selftest */
export function giftEntryByRoll(
  gifts: VillageGiftsTable,
  pickRoll: number,
  qtyRoll: number,
): { t: 'currency' | 'item'; id: string; qty: number; tier?: string; value?: number } | null {
  const entries = gifts.table.map((e) => ({ id: e.id, weight: e.weight }));
  const picked = weightedPick(entries, () => pickRoll);
  if (picked === null) return null;
  const e = gifts.table.find((x) => x.id === picked.id)!;
  const span = Math.max(0, e.qtyMax - e.qtyMin);
  const qty = e.qtyMin + Math.floor(Math.max(0, Math.min(0.999999, qtyRoll)) * (span + 1));
  return {
    t: e.t,
    id: e.id,
    qty: Math.max(e.qtyMin, Math.min(e.qtyMax, qty)),
    ...(e.tier !== undefined ? { tier: e.tier } : {}),
    ...(e.value !== undefined ? { value: e.value } : {}),
  };
}
