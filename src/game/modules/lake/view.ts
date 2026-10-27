/**
 * Витрина lake.state (M08.1 + M08.2, П6): АКТИВНОЕ озеро — вода (с дрейфом),
 * слоты с рыбами (сытость/болезнь/требования вида текстом + шанс болезни),
 * пары, икра, статы, цена Корма + [F10] купленные улучшения + [F13]
 * Лаборатория (форс/кулдаун) + [F14] второе озеро (сводка неактивного).
 */
import type { ID, QualityTier } from '@/shared/types/ids';
import type { LakeTable } from '@/content/balance/lake';
import type { FishDef } from '@/content/fishing/fish';
import type { LakeUpgradeDef } from '@/content/lake/upgrades';
import type { ContentRegistry } from '@/kernel/content/content-registry';
import type { LakeState } from './state';
import { activeLakeOf, groupOf, lakeIndices } from './state';
import { isHungry, requirementsMet, requirementsText, effectiveDriftPerDay, type LakeRequirements } from './logic/water';
import { sickChanceOf } from './logic/sickness';
import type { WaterState } from './logic/water';

export interface LakeFishRow {
  idx: number;
  fishId: ID;
  name: string;
  quality: QualityTier;
  hungry: boolean;
  sick: boolean;
  bornAt: number;
  requirementsMet: boolean;
  requirementsText: string | null;
  sickChance: number;
}

export interface LakePairRow {
  fishId: ID;
  name: string;
  maxParentTier: QualityTier;
  remainingMs: number;
}

export interface LakeRoeRow {
  fishId: ID;
  name: string;
  tier: QualityTier;
  remainingMs: number;
  waitingSlot: boolean;
}

export interface LakeUpgradeRowView {
  id: string;
  name: string;
  price: number;
  bought: boolean;
  description: string;
}

export interface LakeOtherView {
  idx: number;
  water: { temperature: number; cleanliness: number };
  slots: { used: number; base: number };
}

export interface LakeStateView {
  now: number;
  activeLake: number;
  hasLake2: boolean;
  slots: { used: number; base: number };
  water: { temperature: number; cleanliness: number; driftPerDay: number };
  fish: LakeFishRow[];
  pairs: LakePairRow[];
  roe: LakeRoeRow[];
  stats: { released: number; bred: number; harvested: number };
  hungryCount: number;
  sickCount: number;
  feedPrice: number | null;
  upgrades: LakeUpgradeRowView[];
  research: { built: boolean; mode: 'plus1' | 'plus2' | null; cooldownMs: number };
  other: LakeOtherView | null;
}

export interface UpgradesViewSource {
  upgradesView(): { lakeIdx: number; rows: LakeUpgradeRowView[] };
  researchView(): { built: boolean; mode: 'plus1' | 'plus2' | null; cooldownMs: number };
}

export function buildLakeStateView(
  state: LakeState,
  now: number,
  table: LakeTable,
  fishOf: (fishId: ID) => FishDef | undefined,
  content: ContentRegistry,
  upgradesDefs: LakeUpgradeDef[],
  upgradesApi: UpgradesViewSource,
): LakeStateView {
  const active = activeLakeOf(state);
  const group = groupOf(state, active);
  const used = group.slots.filter((s) => s.fishId !== undefined).length;
  const reqOf = (fishId: ID): LakeRequirements => fishOf(fishId)?.lakeRequirements ?? table.neutralRequirements;
  const water: WaterState = group.water;
  const fish: LakeFishRow[] = group.slots
    .map((slot, idx) => {
      if (slot.fishId === undefined) return null;
      const def = fishOf(slot.fishId);
      const req = def?.lakeRequirements ?? table.neutralRequirements;
      return {
        idx,
        fishId: slot.fishId,
        name: def?.name ?? slot.fishId,
        quality: slot.quality ?? 'D',
        hungry: isHungry(slot.fedAt, now, table),
        sick: slot.sick,
        bornAt: slot.bornAt ?? now,
        requirementsMet: requirementsMet(req, water),
        requirementsText: requirementsText(req, water),
        sickChance: sickChanceOf(req, water, table),
      };
    })
    .filter((r): r is LakeFishRow => r !== null);

  const freeSlot = group.slots.some((s) => s.fishId === undefined);
  const pairs: LakePairRow[] = Object.values(group.pairs ?? {}).map((p) => ({
    fishId: p.fishId,
    name: fishOf(p.fishId)?.name ?? p.fishId,
    maxParentTier: tierMax(p.tierA, p.tierB),
    remainingMs: Math.max(0, p.dueAt - now),
  }));

  const roe: LakeRoeRow[] = group.roe.map((r) => ({
    fishId: r.fishId,
    name: fishOf(r.fishId)?.name ?? r.fishId,
    tier: r.tier,
    remainingMs: Math.max(0, r.readyAt - now),
    waitingSlot: r.readyAt <= now && !freeSlot,
  }));

  const feedPrice =
    content.get<{ currencyGoods: Record<string, number> }>('shop')?.currencyGoods?.[table.buy.feedCurrency] ?? null;

  const bought = group.upgrades ?? [];
  const upgradesRows: LakeUpgradeRowView[] = upgradesDefs.map((u) => ({
    id: u.id,
    name: u.name,
    price: u.cost.qty,
    bought: bought.includes(u.id) || (u.effect.t === 'lake2' && state.lake2 !== undefined),
    description: u.description,
  }));

  const otherIdx = lakeIndices(state).find((i) => i !== active);
  const other: LakeOtherView | null =
    otherIdx !== undefined
      ? {
          idx: otherIdx,
          water: { ...groupOf(state, otherIdx).water },
          slots: {
            used: groupOf(state, otherIdx).slots.filter((s) => s.fishId !== undefined).length,
            base: groupOf(state, otherIdx).slots.length,
          },
        }
      : null;

  return {
    now,
    activeLake: active,
    hasLake2: state.lake2 !== undefined,
    slots: { used, base: group.slots.length },
    water: {
      temperature: group.water.temperature,
      cleanliness: group.water.cleanliness,
      // [M11 · OBS-1 AUDIT-M08] ЭФФЕКТИВНЫЙ дрейф: купленный Аэратор —
      // −2/день (чтение эффекта улучшения из данных, НЕ базовой таблицы)
      driftPerDay: effectiveDriftPerDay(group, table, upgradesDefs),
    },
    fish,
    pairs,
    roe,
    stats: { ...group.stats },
    hungryCount: fish.filter((f) => f.hungry).length,
    sickCount: fish.filter((f) => f.sick).length,
    feedPrice,
    upgrades: upgradesRows,
    research: upgradesApi.researchView(),
    other,
  };
}

function tierMax(a: QualityTier, b: QualityTier): QualityTier {
  const order = ['D', 'C', 'B', 'A', 'S', 'SS'];
  return order.indexOf(a) >= order.indexOf(b) ? a : b;
}
