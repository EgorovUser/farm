/**
 * Доска профилей (M11.1, бриф F2; карточка §2): 5 профилей/день,
 * детерминированы dailySeed(saveId, dateISO) — канон 03-DATA §12
 * (прецеденты rollQuestIds M15 / ротация M04): СВЕЖИЙ mulberry32 от
 * dailySeed-хэша с пространством имён, НЕ общий стрим RngBus — повторный
 * вывод тем же днём байт-в-байт (перезапуск НЕ переролливает).
 *
 * Профиль = WorkerDef по 03-DATA §10: имя (пул content, без повторов в
 * наборе), профессия, звёзды 1–5, зарплата (сетка от звёзд × фактор ухода),
 * период 2|4|6, уход 1–5, ТРЕЙТЫ — через живой ривен-конструктор M03
 * (rollTraits-колбэк app-слоя → modforge.rollFor, скоуп 'worker', бюджет
 * perStar × звёзды, форма — MODFORGE_TABLE.traitBudgets.worker).
 *
 * defId детерминирован днём+индексом: wk_<YYYYMMDD>_<i> — профили в наборе
 * НЕ повторяются (F2); доска следующего дня даёт НОВЫЕ defId (нанятый
 * не меняется — профиль заморожен [DECISION F1]).
 */
import { dailySeed, hashString, mulberry32 } from '@/shared/utils/rng';
import type { ID } from '@/shared/types/ids';
import type { RolledModEntry } from '@/shared/types/rolled-mod';
import type { ModForgeTable } from '@/content/balance/modforge';
import { traitBudgetOf, traitRuleOf } from '@/content/workers/traits';
import type { WorkerProfession, WorkersTable } from '@/content/workers/table';
import type { ToolRequirement } from '../state';

/** профиль доски (WorkerDef 03-DATA §10; БЕЗ object/mood — это найм) */
export interface WorkerProfile {
  defId: ID;
  name: string;
  profession: WorkerProfession;
  stars: 1 | 2 | 3 | 4 | 5;
  salaryPerDay: number;
  checkPeriodHours: 2 | 4 | 6;
  care: 1 | 2 | 3 | 4 | 5;
  traits: RolledModEntry[];
  toolRequirement?: ToolRequirement;
}

/** ролл трейтов живым ривен-конструктором M03 (app-слой → ModuleRegistry) */
export type RollTraits = (
  budget: number,
  shape: { positives: [number, number]; negChance: number },
  rng: () => number,
) => RolledModEntry[];

export interface BoardDeps {
  table: WorkersTable;
  modforge: ModForgeTable;
  names: string[];
  professions: WorkerProfession[];
  rollTraits: RollTraits;
}

/** компактная дата для defId: '2026-11-16' → '20261116' */
function dayKey(dateISO: string): string {
  return dateISO.replaceAll('-', '');
}

/**
 * Доска дня: ровно board.size профилей (пул имён меньше — сколько есть, П5),
 * детерминизм (saveId, dateISO) — байт-в-байт на повторный вызов.
 */
export function rollBoard(saveId: string, dateISO: string, d: BoardDeps): WorkerProfile[] {
  const rng = mulberry32(hashString(`${dailySeed(saveId, dateISO)}:workers:board`));
  // имена без повторов в наборе (F2): выбор splice-ом, прецедент rollQuestIds
  const namesLeft = [...d.names];
  const pickedNames: string[] = [];
  const count = Math.min(d.table.board.size, Math.max(0, namesLeft.length));
  while (pickedNames.length < count && namesLeft.length > 0) {
    const idx = Math.floor(rng() * namesLeft.length);
    pickedNames.push(namesLeft.splice(idx, 1)[0] as string);
  }
  const shape = traitRuleOf(d.modforge);
  const profiles: WorkerProfile[] = [];
  for (let i = 0; i < count; i++) {
    const profession = d.professions[Math.floor(rng() * d.professions.length)] as WorkerProfession;
    const stars = (1 + Math.floor(rng() * 5)) as 1 | 2 | 3 | 4 | 5;
    const care = (1 + Math.floor(rng() * 5)) as 1 | 2 | 3 | 4 | 5;
    const periods = d.table.checkPeriodHours;
    const checkPeriodHours = periods[Math.floor(rng() * periods.length)] as 2 | 4 | 6;
    const base = d.table.salaryByStars[stars];
    const salaryPerDay = Math.max(
      1,
      Math.round(base * (1 + (care - 3) * d.table.salaryCareStep)),
    );
    const withTool = rng() < d.table.toolChance;
    const toolRequirement: ToolRequirement | undefined = withTool
      ? d.table.toolByProfession[profession]
      : undefined;
    const traits = d.rollTraits(traitBudgetOf(stars, d.modforge), shape, rng);
    profiles.push({
      defId: `wk_${dayKey(dateISO)}_${i}`,
      name: pickedNames[i] as string,
      profession,
      stars,
      salaryPerDay,
      checkPeriodHours,
      care,
      traits,
      ...(toolRequirement !== undefined ? { toolRequirement } : {}),
    });
  }
  return profiles;
}
