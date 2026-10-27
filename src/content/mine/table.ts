/**
 * Контент M12 «Шахта»: формулы боя (карточка M12 §3, бриф SESSION-M12.1 F4).
 * ВСЕ числа формул — ЗДЕСЬ (П6; единственное место чисел: движок читает
 * таблицу, числа НЕ хардкодятся — канон «числа в content»).
 *
 * Формула урона: damage = floor(atk × divisor / (divisor + def)), минимум
 * min (карточка §3: «atk × 100 / (100 + def), округление вниз, минимум 1»).
 * Крит: урон × multiplier (карточка §3: ×1.5). Масштаб слоя: mobHP =
 * floor(hpBase × hpScale^(слой−1)) (карточка §4: «50 × 1.6^(n−1)»).
 * Чутьё щита: +sensePerTier × (тир − 1) свыше честных 1/3 (карточка §3)
 * + ЖИВОЙ ривен-канал M03 (block_sense → combat.block, базы с M02.2).
 */
import type { QualityTier } from '@/shared/types/ids';

export interface MineTable {
  /** масштаб слоя: mobHP = floor(hpBase × hpScale^(layer−1)) */
  layer: { hpScale: number };
  /** урон: floor(atk × divisor / (divisor + def)), минимум min */
  damage: { divisor: number; min: number };
  /** крит: урон × multiplier */
  crit: { multiplier: number };
  /** чутьё щита: шанс подтяжки блока = sensePerTier × (тир − 1) */
  block: {
    sensePerTier: number;
    /** нумерация тиров качества для формулы чутья (D=1 … SS=6) */
    tierNumbers: Record<QualityTier, number>;
  };
  /** лимит раундов боя (защита от вечного боя; минималка урона = 1) */
  rounds: { cap: number };
  /** боссы: масштаб HP отдельный (мягче мобового — глубокие циклы слоёв
   *  проходимы в лимит раундов; мобы каноном M12.1 ×1.6 не тронуты) */
  boss: { hpScale: number };
  /** элитные модификаторы ×3 (карточка §4; размеры эффектов) */
  elite: {
    venomous: { dot: number };
    armored: { defBonus: number };
    swarm: { targets: number; hpFactor: number };
  };
}

export const MINE_TABLE: MineTable = {
  layer: { hpScale: 1.6 },
  damage: { divisor: 100, min: 1 },
  crit: { multiplier: 1.5 },
  block: {
    sensePerTier: 5,
    tierNumbers: { D: 1, C: 2, B: 3, A: 4, S: 5, SS: 6 },
  },
  rounds: { cap: 200 },
  boss: { hpScale: 1.25 },
  elite: {
    venomous: { dot: 2 },
    armored: { defBonus: 6 },
    swarm: { targets: 2, hpFactor: 0.5 },
  },
};
