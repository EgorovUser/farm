/**
 * M16.2 «Здания» (карточка §3; [DECISION M162-здания]) — чистые операции
 * среза: старт стройки (транзакцию выполняет module.ts), завершение
 * таймеров (finishAt — абсолют, hourTick-класс + ленивая проверка витрин),
 * эффекты построенных уровней. Ноль импортов игровых модулей (П4).
 *
 * Идемпотентность завершения: запись УДАЛЯЕТСЯ из construction и
 * появляется в buildings — реплей hourTick/повторный просмотр не
 * задваивает (прецеденты M11 workers / need.day).
 */
import type { VillageBuildingDef } from '@/content/village/types';
import { buildingEffectOf } from '@/content/village/buildings';
import type { VillageState } from './state';
import { err, ok, type Result } from '@/shared/types/result';

/** локальная дата ISO (YYYY-MM-DD) — тот же формат, что TimeService */
export function localDateISOOf(ms: number): string {
  const d = new Date(ms);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export interface BuildPlan {
  def: VillageBuildingDef;
  level: number;
  costGold: number;
  items: Array<{ t: 'currency' | 'item'; id: string; qty: number }>;
  finishAt: number;
}

export interface BuildingsDeps {
  /** уровень деревни (резолв шины/XP — module.ts) */
  villageLevel(): number;
  now(): number;
}

/** текущий уровень постройки (0 — не построено) */
export function buildingLevelOf(state: VillageState, id: string): number {
  return state.buildings?.[id]?.level ?? 0;
}

/** план постройки СЛЕДУЮЩЕГО уровня со всеми честными отказами (П6) */
export function planBuild(
  state: VillageState,
  defs: VillageBuildingDef[],
  id: string,
  deps: BuildingsDeps,
): Result<BuildPlan> {
  const def = defs.find((d) => d.id === id);
  if (def === undefined) {
    return err(`неизвестное здание: ${id} (реестр — village build без аргумента)`);
  }
  const current = buildingLevelOf(state, def.id);
  if (current >= def.levels.length) {
    return err(`${def.name}: уже построен максимальный уровень (${def.levels.length}/${def.levels.length})`);
  }
  if (state.construction?.[def.id] !== undefined) {
    const left = Math.max(0, state.construction[def.id]!.finishAt - deps.now());
    const h = Math.ceil(left / 3_600_000);
    return err(`${def.name}: стройка уже идёт — осталось ${h} ч (до завершения; повторный старт невозможен)`);
  }
  const gate = def.unlock;
  if (gate.t === 'statAtLeast' && gate.stat === 'village.level' && deps.villageLevel() < gate.value) {
    return err(`${def.name}: нужен уровень деревни ${gate.value} (сейчас ${deps.villageLevel()})`);
  }
  const level = current + 1;
  const lv = def.levels[level - 1]!;
  return ok({
    def,
    level,
    costGold: lv.costGold,
    items: lv.items,
    finishAt: deps.now() + lv.hours * 3_600_000,
  });
}

/** применить старт стройки (ПОСЛЕ успешной транзакции module.ts) */
export function applyBuildStart(state: VillageState, id: string, finishAt: number): VillageState {
  const construction = { ...(state.construction ?? {}) };
  construction[id] = { finishAt };
  return { ...state, construction };
}

export interface CompletedBuild {
  id: string;
  name: string;
  level: number;
  xp: number;
}

/**
 * Завершить все стройки с finishAt ≤ now: buildings[id] = {level+1,
 * builtAt}, XP деревне, запись удалена из construction. Чистая функция;
 * вызывается из hourTick И лениво из витрин (абсолютные таймеры).
 */
export function completeConstructions(
  state: VillageState,
  defs: VillageBuildingDef[],
  now: number,
): { state: VillageState; completed: CompletedBuild[] } {
  const live = state.construction ?? {};
  const ids = Object.keys(live).filter((id) => live[id]!.finishAt <= now);
  if (ids.length === 0) return { state, completed: [] };
  const construction = { ...live };
  const buildings = { ...(state.buildings ?? {}) };
  let xp = state.xp;
  const completed: CompletedBuild[] = [];
  const dateISO = localDateISOOf(now);
  for (const id of ids) {
    const def = defs.find((d) => d.id === id);
    delete construction[id];
    if (def === undefined) continue; // контент ушёл — таймер закрыт без уровня (П5)
    const target = (buildings[id]?.level ?? 0) + 1;
    if (target > def.levels.length) continue;
    buildings[id] = { level: target, builtAt: dateISO };
    xp += def.levels[target - 1]!.xp;
    completed.push({ id: def.id, name: def.name, level: target, xp: def.levels[target - 1]!.xp });
  }
  const next: VillageState = {
    ...state,
    xp,
    buildings,
    ...(Object.keys(construction).length > 0 ? { construction } : {}),
  };
  if (Object.keys(construction).length === 0) delete next.construction;
  return { state: next, completed };
}

// ---------------------------------------------------------------- эффекты

/** [DECISION M162-дом] «+1 житель» = unlock-скидка следующего жителя */
export function houseBonusOf(state: VillageState, defs: VillageBuildingDef[]): number {
  return buildingEffectOf(state.buildings, 'house', defs);
}

/** защита Склада: кража × (1 − N/100) */
export function warehouseProtectionOf(state: VillageState, defs: VillageBuildingDef[]): number {
  return buildingEffectOf(state.buildings, 'warehouse', defs);
}

/** суммарная защита построек рейда (Частокол + Стена) */
export function buildingDefenseOf(state: VillageState, defs: VillageBuildingDef[]): number {
  return buildingEffectOf(state.buildings, 'fence', defs) + buildingEffectOf(state.buildings, 'wall', defs);
}

/** счастье-аура (Колодец + Храм + Баня) → к среднему счастью налога */
export function happinessAuraOf(state: VillageState, defs: VillageBuildingDef[]): number {
  return (
    buildingEffectOf(state.buildings, 'well', defs) +
    buildingEffectOf(state.buildings, 'temple', defs) +
    buildingEffectOf(state.buildings, 'bath', defs)
  );
}

/** скидка Кузницы к цене починки (%%; 0 — не построена) */
export function repairDiscountOf(state: VillageState, defs: VillageBuildingDef[]): number {
  return buildingEffectOf(state.buildings, 'forge_village', defs);
}

/** скидка Рынка у деревенских купцов (%%; 0 — не построен; потребитель M16.3) */
export function marketDiscountOf(state: VillageState, defs: VillageBuildingDef[]): number {
  return buildingEffectOf(state.buildings, 'market', defs);
}
