/**
 * Доска наёмников M13.2 (бриф R1, карточка §4; прецедент workers/logic/board
 * M11.1): 3 кандидата/день после покупки «Барака», детерминизм
 * dailySeed(saveId, dateISO) — СВЕЖИЙ mulberry32 от dailySeed-хэша с
 * пространством имён mine:helpers (перезапуск НЕ переролливает, смена
 * состава в полночь).
 *
 * Кандидат = HelperProfile (канон HelperDef 03-DATA §7 + экономика найма):
 * класс ×5, редкость (частоты — данные HELPER_RARITY_ROWS), зарплата/день,
 * доля награды 20%, atk/hp/speed (канон Task 70), ТРЕЙТЫ — живой
 * ривен-конструктор M03 (rollTraits-колбэк app-слоя → modforge.rollFor,
 * скоуп 'helper', бюджет byRarity редкости, форма —
 * MODFORGE_TABLE.traitBudgets.helper [1,3]/50%), СТРАХИ — пул данных
 * (Condition + эффект; универсальный оценщик, ветвлений по id НЕТ).
 *
 * defId детерминирован днём+индексом: hpr_<YYYYMMDD>_<i> (прецедент wk_);
 * профиль нанятого перепосчитывается из доски дня найма (hiredDay) —
 * [DECISION R2-форма]: срез хранит компакт {instanceId, defId, hp,
 * reputation, hiredDay?} по ратифицированной форме, полный профиль —
 * детерминированная функция (saveId, hiredDay, index).
 */
import { dailySeed, hashString, mulberry32, weightedPick } from '@/shared/utils/rng';
import type { ID, Rarity } from '@/shared/types/ids';
import type { RolledModEntry } from '@/shared/types/rolled-mod';
import type {
  HelperClassDef,
  HelperFearDef,
  HelperProfile,
  MineHelpersTable,
} from '@/content/mine/helpers';
import { HELPER_RARITY_ROWS } from '@/content/mine/helpers';

/** ролл трейтов живым ривен-конструктором M03 (app-слой → ModuleRegistry) */
export type RollHelperTraits = (
  budget: number,
  shape: { positives: [number, number]; negChance: number },
  rng: () => number,
) => RolledModEntry[];

/** форма трейтов помощника — ДАННЫЕ M03 (traitBudgets.helper: [1,3]/50%) */
export type TraitShapeOf = () => { positives: [number, number]; negChance: number };
/** бюджет трейтов — byRarity редкости кандидата (traitBudgets.helper) */
export type TraitBudgetOf = (rarity: Rarity) => number;

export interface HelpersBoardDeps {
  classes: HelperClassDef[];
  table: MineHelpersTable;
  fears: HelperFearDef[];
  rollTraits: RollHelperTraits;
  traitShape: TraitShapeOf;
  traitBudget: TraitBudgetOf;
}

/** компактная дата для defId: '2026-10-27' → '20261027' */
export function dayKeyOf(dateISO: string): string {
  return dateISO.replaceAll('-', '');
}

/** dateISO из defId: 'hpr_20261027_1' → '2026-10-27' (некорректный — null) */
export function dayOfDefId(defId: ID): string | null {
  const m = /^hpr_(\d{4})(\d{2})(\d{2})_(\d+)$/.exec(defId);
  if (m === null) return null;
  return `${m[1]}-${m[2]}-${m[3]}`;
}

/** индекс кандидата из defId (некорректный — null) */
export function indexOfDefId(defId: ID): number | null {
  const m = /^hpr_(\d{4})(\d{2})(\d{2})_(\d+)$/.exec(defId);
  return m === null ? null : Number(m[4]);
}

/** редкость по весам данных (weightedPick; П6 — числа в HELPER_RARITY_ROWS) */
function rollRarity(rng: () => number): Rarity {
  const entries = (Object.keys(HELPER_RARITY_ROWS) as Rarity[]).map((r) => ({
    id: r,
    weight: HELPER_RARITY_ROWS[r].weight,
  }));
  const pick = weightedPick(entries, rng);
  return (pick ? pick.id : 'common') as Rarity;
}

/** число страхов кандидата — взвешенно по данным table.fearCounts */
function rollFearCount(table: MineHelpersTable, rng: () => number): number {
  const pick = weightedPick(
    table.fearCounts.map((f) => ({ id: String(f.count), weight: f.weight })),
    rng,
  );
  return pick ? Number(pick.id) : 0;
}

/**
 * Доска дня: ровно table.boardSize профилей, детерминизм (saveId, dateISO) —
 * байт-в-байт на повторный вызов (имена без повторов в наборе — splice-ом,
 * прецедент rollBoard M11 / rollQuestIds M15).
 */
export function rollHelpersBoard(saveId: string, dateISO: string, d: HelpersBoardDeps): HelperProfile[] {
  const rng = mulberry32(hashString(`${dailySeed(saveId, dateISO)}:mine:helpers`));
  const namesLeft = [...d.table.names];
  const pickedNames: string[] = [];
  const count = Math.min(d.table.boardSize, Math.max(0, namesLeft.length));
  while (pickedNames.length < count && namesLeft.length > 0) {
    const idx = Math.floor(rng() * namesLeft.length);
    pickedNames.push(namesLeft.splice(idx, 1)[0] as string);
  }
  const shape = d.traitShape();
  const profiles: HelperProfile[] = [];
  for (let i = 0; i < count; i++) {
    const cls = d.classes[Math.floor(rng() * d.classes.length)] as HelperClassDef;
    const rarity = rollRarity(rng);
    const row = HELPER_RARITY_ROWS[rarity];
    // страхов: count по весам, выбор из пула без повторов (взвешенно)
    const nFears = Math.min(rollFearCount(d.table, rng), d.fears.length);
    const fearsLeft = [...d.fears];
    const fears: HelperFearDef[] = [];
    for (let f = 0; f < nFears && fearsLeft.length > 0; f++) {
      const pick = weightedPick(
        fearsLeft.map((x) => ({ id: x.id, weight: x.weight })),
        rng,
      );
      const idx = fearsLeft.findIndex((x) => x.id === pick?.id);
      if (idx < 0) break;
      fears.push(fearsLeft.splice(idx, 1)[0]!);
    }
    const traits = d.rollTraits(d.traitBudget(rarity), shape, rng);
    profiles.push({
      defId: `hpr_${dayKeyOf(dateISO)}_${i}`,
      name: pickedNames[i] as string,
      classId: cls.classId,
      rarity,
      salaryPerDay: Math.max(1, Math.round(row.salaryBase * cls.salaryFactor)),
      shareOfLoot: d.table.sharePoolPercent,
      atk: Math.max(1, Math.round(cls.atkBase * row.atkMult)),
      hp: Math.max(1, Math.round(cls.hpBase * row.hpMult)),
      speed: Math.max(1, cls.speedBase + row.speedAdd),
      hireCost: row.hireCost,
      traits,
      fears,
    });
  }
  return profiles;
}
