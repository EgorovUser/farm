/**
 * БАЛАНС КРАФТА (карточка M09; 03-DATA §11: имена таблиц = имена модулей).
 * Единственное место чисел крафта (П6): формула качества §4, очередь §5,
 * отмена, ремонт §2 (наковальня), готовый буфер.
 *
 * Формула качества §4:
 *   outputTier = round( 0.5 × avgInputTier + 0.4 × craftSkillTier + (−1..+1) )
 * Веса/капы тира навыка — здесь; мини-игра — MinigameContract с auto-режимом
 * (0 по умолчанию до фазы 6). Навык «Крафт» (M01) — через шину: уровень даёт
 * skillTier (каждые skillTierPerLevels уровней = +1 тир, кап skillTierCap),
 * а перки порогов дают стат craft.qualityBonus (inc, %) → +qualityBonus/100
 * к значению тира до округления ([DECISION] M09: проценты порога — сотые
 * тира; тюнюется контентом M01 без миграций).
 */
import type { BasesTable } from '@/content/balance/bases';

export interface CraftTable {
  /** §4: веса формулы качества */
  quality: {
    inputWeight: number;
    skillWeight: number;
    /** каждые N уровней навыка «Крафт» = +1 тир в формуле */
    skillTierPerLevels: number;
    /** кап тира навыка в формуле (тиры D..SS = 0..5) */
    skillTierCap: number;
    /** тир нейтральных входов (валюты без качества) в шкале 0..5 */
    neutralInputTier: number;
    /** мини-игра: |поправка| ≤ maxMinigameAdj; auto-режим = 0 до фазы 6 */
    maxMinigameAdj: number;
  };
  /** §5: очередь и готовый буфер */
  queue: {
    /** готовые партии копятся до cap (данные: 6) — станция встаёт на паузу */
    readyCap: number;
    /** пауза при переполнении готового буфера: новые партии не стартуют */
    pauseOnReadyCap: boolean;
    /** [FIX-PHASE-2 · 4.4 · OBS-5 AUDIT-M09] клэмп-минимум времени партии (сек)
     * при потреблении craft.speedPercent — «быстрее 5с не бывает» (тюнюется) */
    minBatchSeconds: number;
  };
  /** §5: отмена — возврат входов за вычетом 10% (мягко, cozy-правило) */
  cancel: {
    /** доля возврата, 0..1 (0.9 = «за вычетом 10%») */
    refundShare: number;
    /** энергия не возвращается (потрачена при запуске) */
    refundEnergy: false;
  };
  /** [FIX-PHASE-2 · 4.7 · SALV-1] «Разобрать» (карточка M02 §3): доля ресурсов
 *  рецепта, возвращаемая разбором предмета крафта (0.25 = 25%; округление —
 *  ceil в пользу игрока, исполнитель — inventory/salvage.ts) */
  salvage: {
    share: number;
  };
  /** §2/карточка M02 §4: ремонт на наковальне за 10% базовой цены */
  repair: {
    /** % от basePrice предмета в золоте (округление вверх) */
    goldPercent: number;
    /** расход ремонтных наборов за ремонт */
    kits: number;
  };
}

export const CRAFT_TABLE: CraftTable = {
  quality: {
    inputWeight: 0.5,
    skillWeight: 0.4,
    skillTierPerLevels: 5,
    skillTierCap: 5,
    neutralInputTier: 1,
    maxMinigameAdj: 1,
  },
  queue: {
    readyCap: 6,
    pauseOnReadyCap: true,
    minBatchSeconds: 5, // тюнюется (клэмп скорости очереди)
  },
  cancel: {
    refundShare: 0.9,
    refundEnergy: false,
  },
  salvage: {
    share: 0.25, // тюнюется (разбор возвращает четверть материалов рецепта)
  },
  repair: {
    goldPercent: 10,
    kits: 1,
  },
};

/**
 * Базы статов крафта (П2: задаются один раз; модификаторы — провайдером).
 *
 * ОЧЕРЕДЬ: длина очереди станции — стат craft.queue.length.<station> (база 2,
 * улучшения дают flat). Статовая форма — П3: будущие пассивки M14 («ушистый
 * подмастерье») подцепятся без правки модуля.
 *
 * forge.sharpen.levelMax — ПОТОЛОК ЗАТОЧКИ M10: база 60 [R1 · M10.1 — канон
 * карточки M10 §3: лестница капов наковальня 20 / второй молот 40 / мифрил 60;
 * числа M09 (20/10/15) были временными]. [M10.1] база ПЕРЕНЕСЕНА владельцем в
 * balance/forging.ts (FORGE_BASES_TABLE; слияние едино, дублей нет — П2).
 *
 * craft.qualityBonus — интеграция перков навыка «Крафт» (M01 §5: пороги дают
 * inc +5/+10). Процентный стат → база 100 (= 100%, нейтраль; прецедент
 * skills.ts: «процентные статы будущих модулей получат ненулевые базы — им
 * inc», иначе inc на нуле — no-op). Формула качества прибавляет
 * (resolve − 100)/100 тира: порог +5% → +0.05 тира ([DECISION], тюнюемо).
 *
 * craft.speedPercent — [FIX-PHASE-2 · 4.4 · OBS-5 AUDIT-M09] ПОТРЕБЛЯЕТСЯ
 * очередью (sweep.ts): время партии = craftSeconds × (1 − (resolve−100)/100),
 * клэмп-минимум queue.minBatchSeconds. База 100 (= 0% ускорения, нейтраль):
 * перк «Крафт» ур.10 даёт inc +10 → 110 → «на 10% быстрее» — тот же
 * процентный паттерн, что у craft.qualityBonus (inc на нулевой базе — no-op).
 */
export const CRAFT_BASES_TABLE: BasesTable = {
  bases: {
    'craft.queue.length.workbench': 2,
    'craft.queue.length.smelter': 2,
    'craft.queue.length.anvil': 2,
    'craft.queue.length.tannery': 2,
    'craft.queue.length.loom': 2,
    'craft.queue.length.kitchen': 2,
    'craft.queue.length.alchemy': 2,
    'craft.qualityBonus': 100,
    'craft.speedPercent': 100, // нейтраль: 100 = без ускорения (inc от перков)
    // forge.sharpen.levelMax перенесён в FORGE_BASES_TABLE (владелец M10.1)
  },
  meta: {
    'craft.queue.length.workbench': { min: 1, round: 'floor' },
    'craft.queue.length.smelter': { min: 1, round: 'floor' },
    'craft.queue.length.anvil': { min: 1, round: 'floor' },
    'craft.queue.length.tannery': { min: 1, round: 'floor' },
    'craft.queue.length.loom': { min: 1, round: 'floor' },
    'craft.queue.length.kitchen': { min: 1, round: 'floor' },
    'craft.queue.length.alchemy': { min: 1, round: 'floor' },
    'craft.qualityBonus': { round: 'none' },
    'craft.speedPercent': { min: 0, round: 'floor' },
  },
};
