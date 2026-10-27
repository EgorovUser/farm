/**
 * Self-checks M07 «Рыбалка» — удча-часть: канон 02 §6 (lucky-веса, luck −100
 * обнуляет), монте-карло luck (карточка §7: удочка +40% — редкая категория
 * тяжелее, 10 000 роллов фикс-LCG), гейт-рыба (10 000 роллов — ноль).
 */
import { DROP_CATEGORIES, POND_FISH, type FishDef } from '@/content/fishing/fish';
import {
  categoryWeights,
  eligibleFish,
  luckyWeight,
  weightedPick01,
  type FishCtxInfo,
} from '@/game/modules/fishing/logic/rolls';
import { mulberry32 } from '@/shared/utils/rng';
import { check, type CheckResult } from './types';
import { makeSeededFishGame, type FishFixture } from './fish-fixture';

/** фикс-игра с ФИКС-saveId (веса без снаряги — luck 0) */
async function makeFishGameSeedHelper(): Promise<FishFixture> {
  return makeSeededFishGame('m071-luck');
}

/** маппинг-оракул категории: roll01 × эффективные веса (та же арифметика) */
function categoryOfRoll(weights: Array<{ def: { id: string }; weight: number }>, roll: number): string {
  const total = weights.reduce((s, e) => s + e.weight, 0);
  const x = roll * total;
  let acc = 0;
  for (const e of weights) {
    acc += e.weight;
    if (x < acc) return e.def.id;
  }
  return weights[weights.length - 1]!.def.id;
}

/** простая LCG-серия для монте-карло (фикс-сид — воспроизводимо) */
function series(n: number, seed: number): () => number {
  const next = mulberry32(seed);
  return () => next();
}

const noCtxInfo: FishCtxInfo = { baitDefId: null, rodTier: 0, playerLevel: 1, hasAchievement: () => false };

export async function runFishLuckChecks(): Promise<CheckResult[]> {
  const results: CheckResult[] = [];

  // ------------------------------------------------ 1. lucky-веса: канон 02 §6
  {
    const f = await makeFishGameSeedHelper();
    const ctx = f.game.time.ctx('player');
    const w0 = categoryWeights(DROP_CATEGORIES, f.game.statBus, ctx);
    results.push(
      check('lucky-веса 02 §6: luck 0 → веса = базам (25/40/20/8/4/3); luckyWeight(−100) = 0; NaN/отрицательных нет', () =>
        w0.map((e) => e.weight).join(',') === '25,40,20,8,4,3' &&
        luckyWeight(8, -100) === 0 &&
        luckyWeight(8, -200) === 0 &&
        Number.isFinite(luckyWeight(8, 33.3)) &&
        luckyWeight(8, -50) === 4, {
        expected: '25,40,20,8,4,3; lucky(−100)=0; lucky(−50)=4',
        actual: `${w0.map((e) => e.weight).join(',')}; lucky(−100)=${luckyWeight(8, -100)}; lucky(−50)=${luckyWeight(8, -50)}`,
      }),
    );
    f.dispose();
  }

  // ------------------------------------------------ 2. монте-карло: luck смещает rare-категорию
  {
    // +40% luck на fishing.luck.rare → вес редкой 8 → 11.2 (частота растёт);
    // 10 000 роллов фикс-LCG, допуск хи-квадрат ~ ±3% абсолютных
    const withLuck: Array<{ def: { id: string }; weight: number }> = DROP_CATEGORIES.map((def) => ({
      def,
      weight: def.lucky && def.luckStat === 'fishing.luck.rare' ? luckyWeight(def.weight, 40) : def.weight,
    }));
    const rng = series(10_000, 20260707);
    let rare0 = 0;
    let rare40 = 0;
    for (let i = 0; i < 10_000; i++) {
      const r = rng();
      if (categoryOfRoll(DROP_CATEGORIES.map((def) => ({ def, weight: def.weight })), r) === 'rare') rare0 += 1;
      if (categoryOfRoll(withLuck, r) === 'rare') rare40 += 1;
    }
    results.push(
      check('монте-карло luck (карточка §7): удочка +40% luck — редкая категория тяжелее (10 000 роллов, фикс-LCG)', () =>
        rare40 > rare0 && rare0 > 500 && rare40 < 1400, {
        expected: 'частота rare с luck+40 строго выше (база ~8%)',
        actual: `без luck ${rare0}/10000, с luck +40 ${rare40}/10000`,
      }),
    );
  }

  // ------------------------------------------------ 3. гейт-рыба: 10 000 роллов — ноль
  {
    const golden: FishDef = {
      ...POND_FISH[0]!,
      id: 'golden_carp',
      name: 'Золотой карп',
      category: 'rare',
      conditions: { bait: 'caviar_bait', rodTierAtLeast: 5, playerLevel: 20 },
    };
    const pool = eligibleFish([...POND_FISH, golden], 'rare', noCtxInfo);
    const poolWithGear = eligibleFish([...POND_FISH, golden], 'rare', {
      baitDefId: 'caviar_bait',
      rodTier: 5,
      playerLevel: 20,
      hasAchievement: () => false,
    });
    const rng = series(10_000, 4242);
    let goldenHits = 0;
    for (let i = 0; i < 10_000; i++) {
      const pick = weightedPick01(pool.map((f) => ({ item: f.id, weight: f.weight })), rng());
      if (pick === 'golden_carp') goldenHits += 1;
    }
    results.push(
      check('гейт-рыба: conditions (наживка+тир удочки+уровень) — не в пуле без условия; 10 000 роллов — ноль попаданий; со снаряжой — в пуле', () =>
        pool.every((f) => f.id !== 'golden_carp') &&
        poolWithGear.some((f) => f.id === 'golden_carp') &&
        goldenHits === 0, {
        expected: 'пул без golden_carp; 0/10000; со снаряжой golden_carp есть',
        actual: `пул ${pool.map((f) => f.id).join(',')}; попаданий ${goldenHits}/10000; со снаряжой ${poolWithGear.length}`,
      }),
    );
  }

  return results;
}
