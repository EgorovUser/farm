/**
 * Разведение озера (M08.1, бриф F6; карточка §4 + решение №3 «2+ @1%»
 * Task 45 / M08 §8) — чистые функции.
 *
 * ФОРМУЛА ПОТОМСТВА (единая с загоном — M06 §4, канон-основа):
 *   childTier = clamp(max(родители) − 1 + mutationRoll, D, SS)
 *   mutationRoll — ОДИН категорийный ролл: 89% → +0 / 10% → +1 / 1% → +2
 * (редкая +2 даёт потомка ВЫШЕ лучшего родителя — max+1 в пределах клампа
 * до SS; «жемчужина» механики). Ролл — именованный стрим
 * `lake:breed:<fishId>:mutation`.
 *
 * [M08.2 · F11 · ИНКУБАТОР]: вес +1 = 10 + X (X = сумма модификаторов,
 * провайдер lake.upgrades — резолв lake.mutation.plus1Bonus с тегом озера;
 * кап X ≤ 40 — вес ≤ 50): окно +1 сдвигается вниз plus1From = 0.89 − X/100
 * (10 п.п. → 0.79); **+2-тир = база 1% ВСЕГДА** (plus2From 0.99 неподвижен —
 * «жемчужина» механики, решение брифа по §8 карточки, регистрация Task 48).
 *
 * [M08.2 · F13 · ЛАБОРАТОРИЯ]: если группа несёт непотреблённый форс
 * (research.mode), ролл РЕМАПИТСЯ в окно режима ПЕРЕД чтением бонуса:
 *   plus1 → из [plus1From, 1] (10/11 → +1, 1/11 → +2);
 *   plus2 → из [plus2From, 1] (100% +2 — РЕДКАЯ гарантирована).
 * Форс-роллы читаются по БАЗОВЫМ окнам 89/10/1 — Инкубатор-бонус на форс
 * НЕ действует [DECISION: +2-доля не инфлируется инструментами]. Форс
 * потребляется этой же икрой (mode снимается в состоянии).
 *
 * [M08.2 · F11 · ПОДОГРЕВАТЕЛЬ]: тёплая группа (правило ДАННЫМИ
 * warmBreeding): при воде ≥ threshold и тёплолюбивом виде (tempMin ≥
 * warmSpeciesTempMin — Линь/Щука/Зеркальный карп/Золотой карп) период
 * появления икры × periodFactor (0.75 — «тропические виды активны»);
 * холодолюбивые вне tempMax — условия-блок F3 (икры НЕТ — сильнее карточного
 * «inc −25%»: [DECISION-интерпретация], био-конфликт §5).
 */
import { QUALITY_TIERS, type QualityTier } from '@/shared/types/ids';
import type { ID } from '@/shared/types/ids';
import type { LakeTable } from '@/content/balance/lake';
import type { LakeGroup, LakeSlot, PairInfo, RoeRecord, LakeResearch } from '../state';
import { canonicalSlot } from '../state';
import { isHungry, requirementsMet, type LakeRequirements, type WaterState } from './water';

export interface MutationWindows {
  plus1From: number;
  plus2From: number;
}

/** [M08 · 89/10/1] категорийный ролл мутации: окно ролла → бонус тира */
export function mutationBonusOf(roll: number, w: MutationWindows): 0 | 1 | 2 {
  if (roll >= w.plus2From) return 2;
  if (roll >= w.plus1From) return 1;
  return 0;
}

/** [M08.2 · F11] окна с бонусом Инкубатора: plus1From = база − X/100
 *  (X — п.п. к весу +1; кап обеспечен шиной/данными plusBonusCap);
 *  plus2From НЕПОДВИЖЕН (+2 = база 1% всегда) */
export function windowsWithBonus(table: LakeTable, plus1BonusX: number): MutationWindows {
  const base = table.breeding.mutation;
  const x = Math.max(0, Math.min(base.plusBonusCap, plus1BonusX));
  return { plus1From: Math.max(0, base.plus1From - x / 100), plus2From: base.plus2From };
}

/** [M08.2 · F13] ремап базового ролла в окно режима Лаборатории:
 *  plus1 → [plus1From, 1]; plus2 → [plus2From, 1] (без режима — как есть) */
export function researchRemap(roll: number, table: LakeTable, mode: 'plus1' | 'plus2' | undefined): number {
  if (mode === undefined) return roll;
  const base = table.breeding.mutation;
  const from = mode === 'plus2' ? base.plus2From : base.plus1From;
  return from + roll * (1 - from);
}

/** формула потомка (M06 §4 / M08 §8 — единая): max(родители) − 1 + бонус,
 *  кап [D, SS]; +2 даёт max+1 в пределах клампа */
export function childTierOf(maxParentTier: QualityTier, mutationBonus: number): QualityTier {
  const base = QUALITY_TIERS.indexOf(maxParentTier) - 1 + mutationBonus;
  const clamped = Math.min(QUALITY_TIERS.length - 1, Math.max(0, base));
  return QUALITY_TIERS[clamped] as QualityTier;
}

/** период появления икры по редкости вида (лестница; П5 — кап);
 *  [M08.2 · F11] тёплая группа — × periodFactor (правило ДАННЫМИ) */
export function breedPeriodHours(rarity: string, table: LakeTable): number {
  return table.breeding.periodHoursByRarity[rarity] ?? table.breeding.fallbackPeriodHours;
}

/** [M08.2 · F11] фактор тёплой группы для вида при текущей воде */
export function warmFactorOf(
  req: LakeRequirements | undefined,
  water: WaterState,
  table: LakeTable,
): number {
  const w = table.breeding.warmBreeding;
  if (req === undefined) return 1;
  if (water.temperature < w.threshold) return 1;
  if (req.tempMin < w.warmSpeciesTempMin) return 1;
  return w.periodFactor;
}

/** пригодна ли рыба к авто-паре (сыта + здорова; условия вида — отдельно) */
export function pairEligible(slot: LakeSlot, now: number, table: LakeTable): boolean {
  if (slot.fishId === undefined) return false;
  if (slot.sick) return false;
  return !isHungry(slot.fedAt, now, table);
}

export interface PairFormDeps {
  now: number;
  table: LakeTable;
  /** деф вида: редкость (период) + lakeRequirements (условия) */
  fishOf(fishId: ID): { rarity: string; lakeRequirements?: LakeRequirements } | undefined;
}

export interface PairFormResult {
  state: LakeGroup;
  formed: PairInfo[];
}

/** проход формирования пар: для каждого вида ≥2 годных рыб, условий в норме
 *  и без активной пары — пара двух старейших по bornAt [DECISION брифа F6].
 *  [M08.2 · F11] период — лестница редкости × фактор тёплой группы */
export function formPairsPass(state: LakeGroup, d: PairFormDeps): PairFormResult {
  const pairs = { ...(state.pairs ?? {}) };
  const formed: PairInfo[] = [];
  const bySpecies = new Map<ID, number[]>();
  state.slots.forEach((slot, idx) => {
    if (slot.fishId === undefined) return;
    const list = bySpecies.get(slot.fishId) ?? [];
    list.push(idx);
    bySpecies.set(slot.fishId, list);
  });
  for (const [fishId, idxs] of bySpecies) {
    if (pairs[fishId] !== undefined) continue; // одна пара на вид [DECISION]
    const def = d.fishOf(fishId);
    if (def === undefined) continue; // вид исчез из контента (П5) — не пара
    const req = def.lakeRequirements ?? d.table.neutralRequirements;
    if (!requirementsMet(req, state.water)) continue; // условия-блок
    const eligible = idxs
      .filter((idx) => pairEligible(state.slots[idx]!, d.now, d.table))
      .sort((a, b) => {
        const ba = state.slots[a]!.bornAt ?? 0;
        const bb = state.slots[b]!.bornAt ?? 0;
        return ba !== bb ? ba - bb : a - b; // старшинство bornAt [DECISION]
      });
    if (eligible.length < 2) continue;
    const [slotA, slotB] = [eligible[0]!, eligible[1]!];
    const warm = warmFactorOf(def.lakeRequirements, state.water, d.table);
    const info: PairInfo = {
      fishId,
      slotA,
      slotB,
      tierA: state.slots[slotA]!.quality ?? 'D',
      tierB: state.slots[slotB]!.quality ?? 'D',
      dueAt: d.now + breedPeriodHours(def.rarity, d.table) * warm * 3_600_000,
    };
    pairs[fishId] = info;
    formed.push(info);
  }
  if (formed.length === 0) return { state, formed };
  return { state: { ...state, ...(Object.keys(pairs).length > 0 ? { pairs } : {}) }, formed };
}

export interface BredEventInfo {
  fishId: ID;
  childTier: QualityTier;
  mutationBonus: 0 | 1 | 2;
  roll: number;
  parents: Array<{ slot: number; tier: QualityTier }>;
}

export interface PairCompleteResult {
  state: LakeGroup;
  bred: BredEventInfo[];
}

/** [M08.2] опции завершения пар: X — бонус Инкубатора (провайдер),
 *  research — форс Лаборатории группы (потребляется этой же икрой) */
export interface CompletePairsOpts {
  plus1BonusX?: number;
  research?: LakeResearch;
}

/** проход завершения пар: dueAt ≤ now → ролл мутации (стрим
 *  lake:breed:<fishId>:mutation; [F13] ремап окна Лаборатории, [F11] окна
 *  с бонусом Инкубатора у обычных роллов), икра в очередь, событие lake.bred */
export function completePairsPass(
  state: LakeGroup,
  now: number,
  table: LakeTable,
  roll01: (streamId: string) => number,
  opts: CompletePairsOpts = {},
): PairCompleteResult {
  const pairs = state.pairs ?? {};
  const roe = [...state.roe];
  const bred: BredEventInfo[] = [];
  let changed = false;
  let research = opts.research;
  let researchConsumed = false;
  const windows = windowsWithBonus(table, opts.plus1BonusX ?? 0);
  for (const [fishId, pair] of Object.entries(pairs)) {
    if (now < pair.dueAt) continue;
    const baseRoll = roll01(`lake:breed:${fishId}:mutation`);
    // [F13] форс-роллы — по БАЗОВЫМ окнам (Инкубатор НЕ действует);
    // обычные роллы — по окнам с бонусом (+2 = база 1% всегда)
    const roll = researchRemap(baseRoll, table, research?.mode);
    const bonus = mutationBonusOf(roll, research?.mode !== undefined ? table.breeding.mutation : windows);
    if (research?.mode !== undefined) {
      research = { ...(research as LakeResearch) };
      delete research.mode;
      researchConsumed = true;
    }
    const maxTier = tierMaxOf(pair.tierA, pair.tierB);
    const childTier = childTierOf(maxTier, bonus);
    roe.push({ fishId: pair.fishId, tier: childTier, readyAt: now + table.roe.matureHours * 3_600_000 });
    bred.push({
      fishId: pair.fishId,
      childTier,
      mutationBonus: bonus,
      roll,
      parents: [
        { slot: pair.slotA, tier: pair.tierA },
        { slot: pair.slotB, tier: pair.tierB },
      ],
    });
    delete pairs[fishId];
    changed = true;
  }
  if (!changed) return { state, bred };
  void researchConsumed;
  const stats = { ...state.stats, bred: state.stats.bred + bred.length };
  return {
    state: {
      ...state,
      roe,
      stats,
      ...(Object.keys(pairs).length > 0 ? { pairs } : {}),
      ...(researchConsumed && research !== undefined ? { research } : {}),
    },
    bred,
  };
}

export interface BornInfo {
  slotIdx: number;
  fishId: ID;
  tier: QualityTier;
}

export interface RoeBirthResult {
  state: LakeGroup;
  born: BornInfo[];
}

/** ленивое рождение: готовая икра (readyAt ≤ now) → свободный слот (FIFO;
 *  «ждёт свободного слота» при полном озере — прецедент pen) */
export function birthRoePass(state: LakeGroup, now: number): RoeBirthResult {
  const slots = state.slots.map((s) => ({ ...s }));
  const roe: RoeRecord[] = [];
  const born: BornInfo[] = [];
  for (const r of state.roe) {
    if (now < r.readyAt) {
      roe.push(r);
      continue;
    }
    const free = slots.findIndex((s) => s.fishId === undefined);
    if (free === -1) {
      roe.push(r); // ждёт свободный слот (лениво, в т.ч. после harvest)
      continue;
    }
    slots[free] = canonicalSlot({ fishId: r.fishId, quality: r.tier, fedAt: now, sick: false, bornAt: now });
    born.push({ slotIdx: free, fishId: r.fishId, tier: r.tier });
  }
  if (born.length === 0) return { state, born };
  return { state: { ...state, slots, roe }, born };
}

export function tierMaxOf(a: QualityTier, b: QualityTier): QualityTier {
  return QUALITY_TIERS.indexOf(a) >= QUALITY_TIERS.indexOf(b) ? a : b;
}
