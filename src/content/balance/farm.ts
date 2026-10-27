/**
 * БАЛАНС ФЕРМЫ (карточка M05 §3–§5; 03-DATA §11: имена таблиц = имена модулей).
 * Единственное место чисел фермы (П6): окно полива, правила сорняков
 * (M05.2 живые: стадии/штраф/гербициды + базовый шанс в FARM_BASES_TABLE
 * ниже — см. [DECISION] переноса), факторы качества сбора (F7), удобрение,
 * мини-игры (F3).
 *
 * ЭНЕРГИИ ДЕЙСТВИЙ — НЕ здесь: статы action.farm.<verb>.energyCost живут в
 * content/player/bases.ts с фазы M01 (карточка M01 §2: вспахать 5 / посадить 1
 * / полить 2 / прополоть 1 / собрать 3) — дублирование баз запрещено (П2),
 * FARM_BASES_TABLE их НЕ повторяет.
 *
 * [M05.2 · F1/F6] БАЗОВЫЙ шанс зарастания — стат 'farm.weeds.chancePercent'
 * в FARM_BASES_TABLE (8%): шанс — потребляемое число с будущими модами
 * (гербициды — inc −50% к шансу мультипликативно, карточка §4), по П3 такое
 * число идёт ТОЛЬКО через bus.resolve — база обязана жить в реестре статов.
 * [DECISION · M05.2] перенос из FARM_TABLE.weeds.chancePercent (M05.1 держал
 * его как «данные для M05.2» без потребителя): единственный источник, файл
 * тот же balance/farm, число то же 8; FARM_TABLE.weeds оставляет себе
 * ПРАВИЛА (maxStages/штраф/гербициды).
 *
 * [F3 · MinigameContract] auto-score мини-игр — процентные базы 100-паттерна
 * НЕ используют: score 0..1, база 0.7 (карточка §5). Имена мини-игр карточки
 * §5: Тайминг (plow) / Ряды (plant) / Струя (water) / Кликер (weed) /
 * Серп (harvest) — маппинг действие→мини-игра в table.minigames.
 *
 * [F7 · качество при сборе] тир роллится по таблице весов (стартует копией
 * inventory.qualityWeights — прецедент acquire M02, тюнюется независимо),
 * фактор auto-score применяется К ВЕСАМ тиров: w_i × factor^i (D..SS,
 * i = индекс тира) — мини-игра геймплейно значимо смещает качество, factor
 * в коридоре [minFactor, maxFactor] = [0.8, 1.3] (карточка §3 «×0.8–1.3»);
 * value — равномерно 0..100 как в acquire. Удобрение: скорость ×(1 +
 * speedBonusPercent/100) (пересчёт оставшегося времени) + шанс +1 тира.
 *
 * [M05.3 · G4] перки навыка farming — шанс +1 тира: стат
 * 'farm.harvest.tierUpChance' (база 0 ниже; пороговые флэты +0.05 —
 * SKILLS_TABLE фермества 5/10/15/20: inc на нулевой базе = no-op);
 * «Парник-люкс» — безусловный +1 тир сборам вкладки (улучшение tierBonus
 * greenhouse; потребление — harvest.ts).
 */
import type { BasesTable } from '@/content/balance/bases';
import type { QualityTier } from '@/shared/types/ids';

export interface FarmTable {
  /** §3: полив — окно влажности (вода высыхает; пауза роста — M05.2) */
  water: {
    /** часы влажности после полива */
    windowHours: number;
  };
  /** §4: сорняки — данные часового правила (потребитель — M05.2)
   *  [M05.2] базовый шанс перенесён в FARM_BASES_TABLE['farm.weeds.chancePercent'] —
   *  резолвится через StatBus (мод-путь гербицидов; П2/П3) */
  weeds: {
    /** стадии зарастания 1..maxStages */
    maxStages: number;
    /** штраф скорости роста за стадию, % (кумулятивно: −25×стадия) */
    growthPenaltyPercent: number;
    /** гербициды: −% к шансу мультипликативно (мод-значение буд. источника M04/M05.3) */
    herbicideReductionPercent: number;
    /** [M05.3 · G1] вкладки без сорняков (карточка §2 «Теплица … без
     *  сорняков»): часовой проход такие вкладки пропускает */
    immuneTabKinds: string[];
  };
  /** §3: удобрение (валюта fertilizer кошелька; рецепт wb_fertilizer жив) */
  fertilizer: {
    /** +% к скорости роста (пересчёт оставшегося времени при внесении) */
    speedBonusPercent: number;
    /** шанс подъёма тира качества при сборе, 0..1 */
    tierUpChance: number;
  };
  /** F7: качество при сборе (база; полные факторы — M05.3) */
  harvest: {
    /** веса тиров D..SS (старт — копия inventory.qualityWeights) */
    qualityWeights: Record<QualityTier, number>;
    /** коридор фактора мини-игры (карточка §3 «×0.8–1.3») */
    minFactor: number;
    maxFactor: number;
  };
  /** F3: маппинг действие → мини-игра карточки §5 (стат minigame.<id>.autoScore) */
  minigames: {
    plow: string;
    plant: string;
    water: string;
    weed: string;
    harvest: string;
  };
}

export const FARM_TABLE: FarmTable = {
  water: {
    windowHours: 8, // тюнюется (карточка §3 «земля высыхает через 8 ч»)
  },
  weeds: {
    maxStages: 3, // тюнюется (карточка §4 «стадия 1..3»)
    growthPenaltyPercent: 25, // тюнюется (карточка §4 «−25%/стадия»)
    herbicideReductionPercent: 50, // тюнюется (карточка §4 «гербициды −50%»)
    immuneTabKinds: ['greenhouse'], // «Теплица … без сорняков» (карточка §2)
  },
  fertilizer: {
    speedBonusPercent: 15, // тюнюется (карточка §3 «+15% скорость роста»)
    tierUpChance: 0.25, // тюнюется (карточка §3 «шанс +1 тира»)
  },
  harvest: {
    // старт — копия inventory.qualityWeights (прецедент acquire M02),
    // дальше тюнюется независимо (ферма — отдельный домен баланса)
    qualityWeights: { D: 40, C: 30, B: 20, A: 8, S: 1.6, SS: 0.4 },
    minFactor: 0.8, // карточка §3 «×0.8–1.3»
    maxFactor: 1.3,
  },
  minigames: {
    plow: 'timing', // «Тайминг»
    plant: 'rows', // «Ряды»
    water: 'jet', // «Струя»
    weed: 'clicker', // «Кликер»
    harvest: 'sickle', // «Серп»
  },
};

/**
 * Базы статов фермы (П2: задаются один раз; модификаторы — провайдером M05.3).
 *
 * farm.growthSpeed — процентный стат (база 100 = без ускорения; прецедент
 * craft.speedPercent): grownAt = now + growMs × 100 / resolve(...). Перки
 * навыка «Фермерство» и улучшения дадут inc — без правки модуля (П3).
 *
 * minigame.<id>.autoScore — auto-режим мини-игр (F3, карточка §5 «0.7
 * базово, растёт навыком»): база 0.7, будущие перки — inc через шину.
 */
export const FARM_BASES_TABLE: BasesTable = {
  bases: {
    'farm.growthSpeed': 100, // нейтраль: 100 = обычная скорость (inc от перков)
    // [M05.2 · F1] базовый шанс зарастания за hourTick, % (карточка §4 «8% ×
    // weedRiskMult»): резолв с тегом тайла — гербицидный мод увидит его
    'farm.weeds.chancePercent': 8,
    // [M05.3 · G4] перки навыка farming: шанс +1 тира качества сбора
    // (база 0 — без навыка; пороговые флэты +0.05 — SKILLS_TABLE фермества)
    'farm.harvest.tierUpChance': 0,
    'minigame.timing.autoScore': 0.7,
    'minigame.rows.autoScore': 0.7,
    'minigame.jet.autoScore': 0.7,
    'minigame.clicker.autoScore': 0.7,
    'minigame.sickle.autoScore': 0.7,
  },
  meta: {
    'farm.growthSpeed': { min: 1, round: 'floor' },
    'farm.weeds.chancePercent': { min: 0, round: 'none' },
    'farm.harvest.tierUpChance': { min: 0, round: 'none' },
    'minigame.timing.autoScore': { min: 0, round: 'none' },
    'minigame.rows.autoScore': { min: 0, round: 'none' },
    'minigame.jet.autoScore': { min: 0, round: 'none' },
    'minigame.clicker.autoScore': { min: 0, round: 'none' },
    'minigame.sickle.autoScore': { min: 0, round: 'none' },
  },
};
