/**
 * Болезни озера (M08.1, бриф F5; карточка §3) — чистые функции.
 *
 * Шанс заболевания за день на рыбу: 5% при ЛЮБОМ нарушенном требовании
 * вида, 2% при хороших условиях (карточка §3; числа — LAKE_TABLE.sickness).
 * Ролл — именованный стрим `lake:sick:<fishId>` (прецедент pen:sick:*;
 * один стрим на вид — два fishа одного вида = два продвижения стрима,
 * детерминизм по saveId). Больная не размножается и не даёт икры
 * (pairEligible-гейт), самолечения НЕТ (в отличие от pen — рыба лечится
 * лекарством lake.treat; окна иммунитета НЕТ — по букве брифа F5), смерти
 * НЕ вводим (карточкой не предусмотрена). Событие lake.fishSick
 * { slotIdx, fishId } = каталогу 02 §4.
 */
import type { ID } from '@/shared/types/ids';
import type { LakeTable } from '@/content/balance/lake';
import type { LakeGroup } from '../state';
import { canonicalSlot } from '../state';
import { requirementsMet, type LakeRequirements, type WaterState } from './water';

export interface SickCase {
  slotIdx: number;
  fishId: ID;
}

export interface SickPassResult {
  state: LakeGroup;
  sickened: SickCase[];
}

/** итоговый шанс заболевания (доля 0..1) для рыбы вида при текущей воде */
export function sickChanceOf(
  req: LakeRequirements,
  water: WaterState,
  table: LakeTable,
): number {
  return requirementsMet(req, water)
    ? table.sickness.goodConditionsChance
    : table.sickness.badConditionsChance;
}

/** один sick-проход по занятым слотам: ролл за каждую здоровую рыбу;
 *  now — точка прохода (dayTick, после дрейфа чистоты) */
export function sickPass(
  state: LakeGroup,
  now: number,
  table: LakeTable,
  fishOf: (fishId: ID) => { lakeRequirements?: LakeRequirements } | undefined,
  roll01: (streamId: string) => number,
): SickPassResult {
  const sickened: SickCase[] = [];
  let changed = false;
  const slots = state.slots.map((slot, idx) => {
    if (slot.fishId === undefined || slot.sick) return slot;
    const def = fishOf(slot.fishId);
    const req = def?.lakeRequirements ?? table.neutralRequirements;
    const chance = sickChanceOf(req, state.water, table);
    const roll = roll01(`lake:sick:${slot.fishId}`);
    if (roll >= chance) return slot;
    changed = true;
    sickened.push({ slotIdx: idx, fishId: slot.fishId });
    return canonicalSlot({ ...slot, sick: true });
  });
  if (!changed) return { state, sickened };
  return { state: { ...state, slots }, sickened };
}
