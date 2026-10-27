/**
 * БАЛАНС ЗАТОЧКИ (карточка M10 §2–§4; 03-DATA §11: имена таблиц = имена модулей).
 * Единственное место чисел заточки (П6): шансы §4, pity, откат, statScale,
 * тир-лестница, стоимости попыток, «Точильный станок» и «Точильный круг».
 *
 * Формулы (карточка §4, чистые функции — modules/forge/outcome.ts):
 *   baseSuccess(L)  = clamp(0.90 − 0.06 × L, 0.05, 0.90)
 *   pityBonus       = 0.05 × подрядПровальныеПопытки
 *   successChance   = min(0.95, baseSuccess + pityBonus + бонус круга)
 *   rollback(L)     = min(0.10 + 0.03 × L, 0.45)   // при ПРОВАЛЕ; от попыток НЕ зависит
 *
 * Стоимость попытки (слитки — ПРЕДМЕТ iron_ingot по OBS-1-канону M09 §3:
 * «материал-слиток = предмет там, где предмет существует»; валютные слитки
 * заточка не потребляет) + золото; числа стартовые — «тюнюется».
 */
import type { BasesTable } from '@/content/balance/bases';

export interface ForgeTable {
  /** §4: базовый шанс успеха и его затухание с уровнем */
  baseSuccess: {
    base: number;
    decayPerLevel: number;
    min: number;
  };
  /** §4: прибавка к шансу за каждый подряд провал */
  pityStepPerFail: number;
  /** §4: общий кап шанса успеха (cap данных) */
  successCap: number;
  /** §4: шанс отката при провале (от числа попыток НЕ зависит) */
  rollback: {
    base: number;
    stepPerLevel: number;
    cap: number;
  };
  /** §3: statScale = 1 + statScalePerLevel × уровень (к БАЗЕ, в провайдере M02) */
  statScalePerLevel: number;
  /** §3: каждые N уровней = +1 тир (эффективный тир R2) */
  tierStepLevels: number;
  /** стоимость попытки с уровня L (тюнюется): слитки + золото */
  costs: {
    ingotsBase: number;
    ingotsPerStep: number;
    ingotsStepLevels: number;
    goldBase: number;
    goldPerLevel: number;
  };
  /** «Точильный станок» — улучшение дома (гейт попыток §2) */
  whetstone: {
    costGold: number;
    unlockPlayerLevel: number;
  };
  /** «Точильный круг» — бонус-улучшение (inc к forge.success.bonus) */
  whetstoneCircle: {
    costGold: number;
    unlockPlayerLevel: number;
    /** +N% к шансу заточки (inc-модификатор станка) */
    bonusInc: number;
  };
  /** [M10.2] карточки уровней §5 */
  cards: {
    /** одноразовый бонус к следующей попытке за отказ от карточки (доля) */
    declineBonus: number;
  };
}

export const FORGE_TABLE: ForgeTable = {
  baseSuccess: { base: 0.9, decayPerLevel: 0.06, min: 0.05 },
  pityStepPerFail: 0.05,
  successCap: 0.95,
  rollback: { base: 0.1, stepPerLevel: 0.03, cap: 0.45 },
  statScalePerLevel: 0.05,
  tierStepLevels: 10,
  costs: { ingotsBase: 1, ingotsPerStep: 1, ingotsStepLevels: 10, goldBase: 10, goldPerLevel: 5 },
  whetstone: { costGold: 350, unlockPlayerLevel: 4 },
  whetstoneCircle: { costGold: 500, unlockPlayerLevel: 7, bonusInc: 5 },
  cards: { declineBonus: 0.02 },
};

/**
 * Базы статов заточки (П2: задаются один раз; эффекты — провайдерами).
 *
 * forge.sharpen.levelMax — ПОТОЛОК: база 60 [R1 · M10.1 — канон карточки M10 §3;
 * перенос владельца из balance/craft.ts (M09 регистрировал заранее — прецедент
 * combat.* M02.2)]. КАПЫ доставляет craftStationProvider (M09): наковальня 20 /
 * «Второй молот» 40 / мифрил 60 — стек-группа craft.anvil.cap (R3: один источник).
 *
 * forge.success.bonus — бонус «Точильного круга»: процентный стат, база 100
 * (= 100%, нейтраль; прецедент craft.qualityBonus), круг даёт inc +5 →
 * вклад в шанс (resolve − 100)/100 = +0.05. Доставляет forgingProvider (R3 —
 * только станочные моды M10, потолок НЕ дублирует).
 */
export const FORGE_BASES_TABLE: BasesTable = {
  bases: {
    'forge.sharpen.levelMax': 60,
    'forge.success.bonus': 100,
    // [M10.2] статы особых карточных свойств (реестр M03 ссылается на базы —
    // инвариант «stat только на существующие базы»); потребители — M12+
    // [FIX-RIVEN · FX1 · [QUESTION] №1] НУЛЕВЫЕ базы = метка flat-семантики:
    // ривен-строки на нулевой пред-базе провайдер M02 каталитирует как
    // op 'flat' — прибавление ПРОЦЕНТНЫХ ПУНКТОВ по значению строки реестра
    // («Вещий удар» +20 → resolve combat.prophetic = 20, вещий 20%; движок
    // M12 читает resolve как канонировано — без правок боя). Числа строк —
    // реестр M03 (content/mods/registry.ts; канон «числа в content»);
    // прецедент семантики — [DECISION] удач M01 (content/player/skills.ts:
    // нулевая база → 'flat'). Ненулевые пред-базы (attack/def/…) — inc, D31.
    'combat.prophetic': 0,
    'mine.oreSense': 0,
    'combat.lifesteal': 0,
  },
  meta: {
    'forge.sharpen.levelMax': { min: 0, round: 'floor' },
    'forge.success.bonus': { round: 'none' },
    'combat.prophetic': { min: 0, round: 'none' },
    'mine.oreSense': { min: 0, round: 'none' },
    'combat.lifesteal': { min: 0, round: 'none' },
  },
};

/** Стоимость попытки с уровня L (чистая функция от данных; оракулы руками:
 *  L0 = 1 слиток + 10 зол., L10 = 2 + 60, L20 = 3 + 110, L59 = 6 + 305) */
export function attemptCostOf(level: number, table: ForgeTable): { ingots: number; gold: number } {
  const L = Math.max(0, Math.floor(level));
  const { ingotsBase, ingotsPerStep, ingotsStepLevels, goldBase, goldPerLevel } = table.costs;
  return {
    ingots: ingotsBase + Math.floor(L / Math.max(1, ingotsStepLevels)) * ingotsPerStep,
    gold: goldBase + goldPerLevel * L,
  };
}
