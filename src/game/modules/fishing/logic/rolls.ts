/**
 * Роллы рыбалки (M07.1, карточка §2–§3, бриф F3/F6) — чистые функции.
 *
 * КАНОН УДАЧИ 02 §6: эффективный вес = weight × (1 + luck(stat, ctx)/100)
 * применяется ТОЛЬКО к lucky-записям; luck ≤ −100 обнуляет вес
 * (max(0, …) — никаких отрицательных весов и NaN). Категории:
 * редкая (fishing.luck.rare) / сокровище (fishing.treasure.weight —
 * «сокровищная тяга», та же форма) / событие (fishing.luck.event).
 *
 * ВЕСА РЕДКОСТИ — БАЗЫ fishing.weight.<rarity> (карточка §3:
 * 60/25/10/4/0.9/0.1), читаются ТОЛЬКО через StatBus (П3); lucky — rare+.
 * КАПЫ maxFishRarity удочек и гарант «Легендарной приманки» = flat-минусы
 * на эти базы (резолв → 0 → запись вне ролла) — НИ ОДНОГО if-а (§3).
 *
 * Все роллы — именованные стримы RngBus (roll01-контракт П6, прецедент
 * pen:buy): fish:cast:<loc>:category / :pick / fish:cast:rarity /
 * fish:bite:<loc> / fish:chest:<id>:qty / fish:size:<fishId>.
 */
import type { RngBus } from '@/kernel/bus/rng-bus/rng-bus';
import type { StatBus } from '@/kernel/bus/stat-bus/stat-bus';
import type { ResolveCtx } from '@/kernel/bus/stat-bus/modifier';
import type { Rarity } from '@/shared/types/ids';
import { RARITY_ORDER } from '@/content/items/items';
import type {
  ChestEntryDef,
  DropCategoryDef,
  FishDef,
  FishingEventDef,
  TrashDef,
} from '@/content/fishing/fish';
import type { FishingTable } from '@/content/balance/fishing';

export const RARITIES: Rarity[] = ['common', 'uncommon', 'rare', 'epic', 'legendary', 'mythic'];
/** lucky-редкости (02 §6): удача fishing.luck.rare тянет rare+ */
const LUCKY_RARITIES: ReadonlySet<Rarity> = new Set(['rare', 'epic', 'legendary', 'mythic']);

/** читать стат через шину (числа — ТОЛЬКО шиной, П3); пол 0 */
export function statOf(statBus: StatBus, ctx: ResolveCtx, stat: string): number {
  const v = statBus.resolve({ stat: stat as never, ctx });
  return Number.isFinite(v) ? v : 0;
}

/** эффективный вес lucky-записи: w × max(0, 1 + luck/100) — канон 02 §6 */
export function luckyWeight(weight: number, luck: number): number {
  return Math.max(0, weight) * Math.max(0, 1 + luck / 100);
}

/** веса категорий под текущими удачами (чистая функция от резолвов) */
export function categoryWeights(
  categories: readonly DropCategoryDef[],
  statBus: StatBus,
  ctx: ResolveCtx,
): Array<{ def: DropCategoryDef; weight: number }> {
  return categories.map((def) => ({
    def,
    weight: def.lucky
      ? luckyWeight(def.weight, statOf(statBus, ctx, def.luckStat))
      : Math.max(0, def.weight),
  }));
}

/** веса редкости улова: базы fishing.weight.* (через шину), lucky rare+ */
export function rarityWeights(
  statBus: StatBus,
  ctx: ResolveCtx,
): Array<{ rarity: Rarity; weight: number }> {
  const luck = statOf(statBus, ctx, 'fishing.luck.rare');
  return RARITIES.map((rarity) => {
    const base = statOf(statBus, ctx, `fishing.weight.${rarity}`);
    return {
      rarity,
      weight: LUCKY_RARITIES.has(rarity) ? luckyWeight(base, luck) : Math.max(0, base),
    };
  });
}

/** взвешенный выбор по roll01 (журнал RngBus — П6); пусто → null */
export function weightedPick01<T>(
  entries: ReadonlyArray<{ item: T; weight: number }>,
  roll01: number,
): T | null {
  const total = entries.reduce((s, e) => s + Math.max(0, e.weight), 0);
  if (total <= 0) return null;
  const x = roll01 * total;
  let acc = 0;
  for (const e of entries) {
    acc += Math.max(0, e.weight);
    if (x < acc) return e.item;
  }
  return entries[entries.length - 1]!.item;
}

/** гейт-условия рыбы против текущей снасти (карточка §4; eligibleFish) */
export interface FishCtxInfo {
  baitDefId: string | null;
  rodTier: number;
  playerLevel: number;
  hasAchievement: (id: string) => boolean;
}

export function fishConditionsMet(fish: FishDef, ctxInfo: FishCtxInfo): boolean {
  const c = fish.conditions;
  if (!c) return true;
  if (c.bait !== undefined && ctxInfo.baitDefId !== c.bait) return false;
  if (c.rodTierAtLeast !== undefined && ctxInfo.rodTier < c.rodTierAtLeast) return false;
  if (c.playerLevel !== undefined && ctxInfo.playerLevel < c.playerLevel) return false;
  if (c.achievement !== undefined && !ctxInfo.hasAchievement(c.achievement)) return false;
  return true;
}

/** доступные рыбы категории под текущей снастью (гейты — карточка §7) */
export function eligibleFish(
  fish: readonly FishDef[],
  category: 'small' | 'medium' | 'rare',
  ctxInfo: FishCtxInfo,
): FishDef[] {
  return fish.filter((f) => f.category === category && fishConditionsMet(f, ctxInfo));
}

/** результат ролла редкости: lucky-веса rare+; все нули → 'rare'
 *  ([DECISION] гарант приманки побеждает кап удочки — приманка дороже) */
export function pickRarity(
  weights: ReadonlyArray<{ rarity: Rarity; weight: number }>,
  roll01: number,
): Rarity {
  const pick = weightedPick01(
    weights.map((w) => ({ item: w.rarity, weight: w.weight })),
    roll01,
  );
  return pick ?? 'rare';
}

/** редкость выше или равна (по RARITY_ORDER) */
export function rarityAtLeast(a: Rarity, b: Rarity): boolean {
  return RARITY_ORDER[a] >= RARITY_ORDER[b];
}

/** интерфейс одного заброса (роллы собраны, до транзакции) */
export interface CastPlan {
  category: 'trash' | 'small' | 'medium' | 'rare' | 'treasure' | 'event';
  /** рыба (fish-категории) / мусор / сундук-запись / событие */
  fish: FishDef | null;
  trash: TrashDef | null;
  chest: ChestEntryDef | null;
  event: FishingEventDef | null;
  /** количество для сундука (item/currency qty из диапазона) */
  chestQty: number | null;
  /** редкость улова (только рыба) */
  rarity: Rarity | null;
  /** физический вес рыбы, граммы (только рыба) */
  weightGrams: number | null;
  /** ролл окна клёва, сек (до модификатора скорости) */
  biteRolledSeconds: number;
}

/** собрать план заброса: категория → сущность → редкость → вес → клёв.
 *  Все роллы — именованные стримы (журнал П6); forceFish — dev-режим
 *  fish.force (категория/рыба принудительны, остальное честно роллится). */
export function buildCastPlan(deps: {
  rngBus: RngBus;
  statBus: StatBus;
  ctx: ResolveCtx;
  table: FishingTable;
  categories: readonly DropCategoryDef[];
  fish: readonly FishDef[];
  trash: readonly TrashDef[];
  chest: readonly ChestEntryDef[];
  events: readonly FishingEventDef[];
  location: string;
  ctxInfo: FishCtxInfo;
  /** dev fish.force: рыба / сундук-запись / событие (гейты игнорируются) */
  force?: { kind: 'fish' | 'chest' | 'event'; id: string } | null;
}): CastPlan {
  const { rngBus, statBus, ctx, table, categories, fish, trash, chest, events, location, ctxInfo } =
    deps;
  const forceFish =
    deps.force !== undefined && deps.force !== null && deps.force.kind === 'fish'
      ? fish.find((f) => f.id === deps.force!.id) ?? null
      : null;
  const forceChest =
    deps.force !== undefined && deps.force !== null && deps.force.kind === 'chest'
      ? chest.find((c) => c.id === deps.force!.id || c.defId === deps.force!.id) ?? null
      : null;
  const forceEvent =
    deps.force !== undefined && deps.force !== null && deps.force.kind === 'event'
      ? events.find((e) => e.id === deps.force!.id) ?? null
      : null;

  // --- 1. категория (lucky-веса 02 §6); dev-форс подменяет
  let category: CastPlan['category'];
  if (forceFish) {
    category = forceFish.category;
  } else if (forceChest) {
    category = 'treasure';
  } else if (forceEvent) {
    category = 'event';
  } else {
    const catPick = weightedPick01(
      categoryWeights(categories, statBus, ctx).map((e) => ({ item: e.def.id, weight: e.weight })),
      rngBus.rollRange(0, 1, 'uniform', `fish:cast:${location}:category`),
    );
    if (catPick === null) {
      // все веса нулевые (теоретически: удачи −100 на всех lucky) — мусор
      category = 'trash';
    } else {
      category = catPick;
    }
  }

  // --- 2. сущность внутри категории
  let planFish: FishDef | null = null;
  let planTrash: TrashDef | null = null;
  let planChest: ChestEntryDef | null = null;
  let planEvent: FishingEventDef | null = null;
  let chestQty: number | null = null;
  if (category === 'trash') {
    planTrash =
      weightedPick01(
        trash.map((t) => ({ item: t, weight: Math.max(0, t.weight) })),
        rngBus.rollRange(0, 1, 'uniform', `fish:cast:${location}:pick`),
      ) ?? trash[0] ?? null;
  } else if (category === 'treasure') {
    const luck = statOf(statBus, ctx, 'fishing.luck.rare');
    planChest =
      forceChest ??
      weightedPick01(
        chest.map((c) => ({
          item: c,
          weight: c.lucky ? luckyWeight(c.weight, luck) : Math.max(0, c.weight),
        })),
        rngBus.rollRange(0, 1, 'uniform', `fish:cast:${location}:pick`),
      ) ??
      chest[0] ??
      null;
    if (planChest) {
      chestQty = Math.round(
        rngBus.rollRange(planChest.qty[0], planChest.qty[1], 'uniform', `fish:chest:${planChest.id}:qty`),
      );
    }
  } else if (category === 'event') {
    planEvent =
      forceEvent ??
      weightedPick01(
        events.map((e) => ({ item: e, weight: Math.max(0, e.weight) })),
        rngBus.rollRange(0, 1, 'uniform', `fish:cast:${location}:pick`),
      ) ??
      events[0] ??
      null;
  } else {
    // fish-категории: гейт-условия фильтруют пул (карточка §7)
    const pool = eligibleFish(fish, category, ctxInfo);
    planFish = forceFish
      ? forceFish
      : weightedPick01(
          pool.map((f) => ({ item: f, weight: Math.max(0, f.weight) })),
          rngBus.rollRange(0, 1, 'uniform', `fish:cast:${location}:pick`),
        );
  }

  // --- 3. редкость (только рыба; lucky rare+, базы fishing.weight.*)
  let rarity: Rarity | null = null;
  if (planFish) {
    rarity = pickRarity(
      rarityWeights(statBus, ctx),
      rngBus.rollRange(0, 1, 'uniform', 'fish:cast:rarity'),
    );
  }

  // --- 4. физический вес рыбы (граммы; payload «вес/качество»)
  let weightGrams: number | null = null;
  if (planFish) {
    weightGrams = Math.round(
      rngBus.rollRange(planFish.sizeGrams[0], planFish.sizeGrams[1], 'uniform', `fish:size:${planFish.id}`),
    );
  }

  // --- 5. окно клёва (рыба — своё; остальное — defaultSeconds;
  //     модификатор скорости fishing.bite.speed применяет cast.ts)
  const window: [number, number] = planFish ? planFish.biteSeconds : table.bite.defaultSeconds;
  const biteRolledSeconds = rngBus.rollRange(window[0], window[1], 'uniform', `fish:bite:${location}`);

  return {
    category,
    fish: planFish,
    trash: planTrash,
    chest: planChest,
    event: planEvent,
    chestQty,
    rarity,
    weightGrams,
    biteRolledSeconds,
  };
}

/** итоговое ожидание клёва: rolled × (1 − speed/100), предел minWaitSeconds
 *  (Икра −10% клёв → ×1.1; F5) */
export function applyBiteSpeed(
  table: FishingTable,
  rolledSeconds: number,
  biteSpeed: number,
): number {
  const raw = rolledSeconds * (1 - biteSpeed / 100);
  return Math.max(table.biteSpeed.minWaitSeconds, Math.round(raw * 10) / 10);
}

/** [M07.2 · F10] гейт-причины рыбы ТЕКСТОМ из conditions (данные → текст,
 *  НЕ if-ы по id; «гейты показываем» — карточка §5). Возвращает null для
 *  безусловной рыбы. ctxInfo передан — печатаются ТОЛЬКО невыполненные
 *  условия (точная причина отказа) */
export function gateTextForFish(
  fish: FishDef,
  names: { bait: (id: string) => string | undefined; rodTier: (tier: number) => string | undefined; achievement: (id: string) => string | undefined },
  ctxInfo?: FishCtxInfo,
): string | null {
  const c = fish.conditions;
  if (!c) return null;
  const parts: string[] = [];
  if (c.bait !== undefined && (ctxInfo === undefined || ctxInfo.baitDefId !== c.bait)) {
    parts.push(`нужна наживка «${names.bait(c.bait) ?? c.bait}»`);
  }
  if (c.rodTierAtLeast !== undefined && (ctxInfo === undefined || ctxInfo.rodTier < c.rodTierAtLeast)) {
    parts.push(`нужна удочка тира ≥ ${c.rodTierAtLeast} (${names.rodTier(c.rodTierAtLeast) ?? `тир ${c.rodTierAtLeast}`})`);
  }
  if (c.playerLevel !== undefined && (ctxInfo === undefined || ctxInfo.playerLevel < c.playerLevel)) {
    parts.push(`нужен уровень ${c.playerLevel}`);
  }
  if (c.achievement !== undefined && (ctxInfo === undefined || !ctxInfo.hasAchievement(c.achievement))) {
    const achName = names.achievement(c.achievement);
    parts.push(achName !== undefined ? `нужна ачивка «${achName}»` : `нужна ачивка ${c.achievement}`);
  }
  return parts.length > 0 ? parts.join(' + ') : null;
}
