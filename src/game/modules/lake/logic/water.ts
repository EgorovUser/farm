/**
 * Вода озера (M08.1, бриф F3; карточка §2) — чистые функции.
 *
 * Требования видов lakeRequirements {tempMin, tempMax, cleanlinessMin} —
 * ДАННЫЕ на дефах рыб (канон 03-DATA §6). Проверка — общий Condition-оценщик
 * (03-DATA §2, данные → НЕ if-ы): lakeRequirements компилируется в Condition[]
 * {statAtLeast/statAtMost} по статам lake.water.temperature /
 * lake.water.cleanliness, оценщик получает контекст, чей stat()-резолвер читает
 * срез воды. Вид без записи — нейтрален (LAKE_TABLE.neutralRequirements).
 *
 * Гейт-причины — ТЕКСТОМ (прецедент альбома M07.2 «гейты показываем»):
 * requirementsText перечисляет только НАРУШЕННЫЕ требования с текущими
 * значениями воды (данные → текст).
 *
 * Дрейф чистоты — −5/день без фильтрации (карточка §2; «Аэратор» — M08.2),
 * кап [0, 100]; температура в M08.1 без дрейфа (меняется улучшениями —
 * M08.2). «Сачок» — +15 чистоты (кап 100; карточка §3).
 */
import { checkCondition } from '@/shared/utils/condition-check';
import type { Condition, ConditionCtx } from '@/shared/types/requirement';
import type { LakeTable } from '@/content/balance/lake';
import type { LakeUpgradeDef } from '@/content/lake/upgrades';

export interface WaterState {
  temperature: number;
  cleanliness: number;
}

export interface LakeRequirements {
  tempMin: number;
  tempMax: number;
  cleanlinessMin: number;
}

/** условия воды как Condition[] — данные → общий оценщик (бриф F3) */
export function waterConditionsOf(req: LakeRequirements): Condition {
  return {
    t: 'all',
    cs: [
      { t: 'statAtLeast', stat: 'lake.water.temperature', value: req.tempMin },
      { t: 'statAtMost', stat: 'lake.water.temperature', value: req.tempMax },
      { t: 'statAtLeast', stat: 'lake.water.cleanliness', value: req.cleanlinessMin },
    ],
  };
}

/** контекст оценщика: резолвер воды среза (неизвестный стат — 0, П5) */
export function waterCtxOf(water: WaterState): ConditionCtx {
  return {
    tags: [],
    stat: (stat) =>
      stat === 'lake.water.temperature'
        ? water.temperature
        : stat === 'lake.water.cleanliness'
          ? water.cleanliness
          : 0,
    hasFlag: () => false,
    skillLevel: () => 0,
    playerLevel: 0,
    itemCount: () => 0,
    hasAchievement: () => false,
  };
}

/** требованиям вида удовлетворена ли вода (общий Condition-оценщик) */
export function requirementsMet(req: LakeRequirements, water: WaterState): boolean {
  return checkCondition(waterConditionsOf(req), waterCtxOf(water));
}

/** гейт-причины ТЕКСТОМ — только нарушенные (прецедент «гейты показываем») */
export function requirementsText(req: LakeRequirements, water: WaterState): string | null {
  const parts: string[] = [];
  if (water.temperature < req.tempMin) {
    parts.push(`температура ${req.tempMin}–${req.tempMax} (сейчас ${water.temperature} — холодно)`);
  }
  if (water.temperature > req.tempMax) {
    parts.push(`температура ${req.tempMin}–${req.tempMax} (сейчас ${water.temperature} — жарко)`);
  }
  if (water.cleanliness < req.cleanlinessMin) {
    parts.push(`чистота ≥ ${req.cleanlinessMin} (сейчас ${water.cleanliness})`);
  }
  return parts.length > 0 ? parts.join(' + ') : null;
}

/** дрейф чистоты за день (dayTick-проход; кап [min, max]).
 *  [M08.2 · F11] Аэратор: дрейф — ПАРАМЕТР (эффект улучшения из данных
 *  content/lake/upgrades.ts: −5/день база → −2/день с Аэратором); без
 *  аргумента — базовый дрейф LAKE_TABLE (обратно-совместимо, чеки M08.1) */
export function driftCleanliness(state: WaterState, table: LakeTable, driftPerDay?: number): WaterState {
  const clamp = (v: number): number => Math.min(table.water.max, Math.max(table.water.min, v));
  const drift = driftPerDay ?? table.water.cleanlinessDriftPerDay;
  return {
    temperature: clamp(state.temperature),
    cleanliness: clamp(state.cleanliness + drift),
  };
}

/** [M11 · OBS-1 AUDIT-M08] ЭФФЕКТИВНЫЙ дрейф чистоты группы за день:
 *  −5/день база; купленный Аэратор — эффект улучшения из ДАННЫХ (−2/день),
 *  НЕ базовая таблица напрямую. Единая точка чтения для dayTick (hourly.ts)
 *  и витрины lake.state (view.ts) — перенос локального driftOf hourly.ts. */
export function effectiveDriftPerDay(
  g: { upgrades?: string[] },
  table: LakeTable,
  upgradesDefs: LakeUpgradeDef[],
): number {
  const aerator = upgradesDefs.find((u) => u.effect.t === 'aerator');
  if (
    aerator &&
    aerator.effect.t === 'aerator' &&
    (g.upgrades ?? []).includes(aerator.id)
  ) {
    return aerator.effect.driftPerDay;
  }
  return table.water.cleanlinessDriftPerDay;
}

/** «Сачок»: +чистоты (кап max; карточка §3 — до фазы 6 auto-score) */
export function cleanWater(state: WaterState, table: LakeTable): WaterState {
  const clamp = (v: number): number => Math.min(table.water.max, Math.max(table.water.min, v));
  return {
    temperature: state.temperature,
    cleanliness: clamp(state.cleanliness + table.care.cleanAmount),
  };
}

/** голодная ли рыба (fedAt старше hungryHours; undefined — голодная, П5) */
export function isHungry(fedAt: number | undefined, now: number, table: LakeTable): boolean {
  if (fedAt === undefined) return true;
  return now - fedAt > table.care.hungryHours * 3_600_000;
}
