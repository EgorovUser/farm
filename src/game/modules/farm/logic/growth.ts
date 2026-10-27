/**
 * Рост культур (карточка M05 §3) — чистые функции времени.
 *
 * grownAt = plantedAt + growMs, где growMs = growHours × 3600с ×
 * 100 / resolve('farm.growthSpeed') (процентный стат, база 100 = нейтраль;
 * прецедент craft.speedPercent). Удобрение/сорняки/вкладки — множители
 * состояния тайла (внутреннее состояние модуля, не внешние бафы): удобрение
 * пересчитывает остаток (fsm.fertilizeTile), сорняки будут делить скорость
 * этапами (M05.2) — шина остаётся единственным каналом ВНЕШНИХ влияний (П3).
 */
import type { CropDef } from '@/content/farm/crops';

/** время роста культуры при данной скорости шины (мс; целое, минимум 1) */
export function growMsOf(crop: CropDef, growthSpeedPercent: number): number {
  const speed = Math.max(1, growthSpeedPercent);
  return Math.max(1, Math.round(crop.growHours * 3_600_000 * (100 / speed)));
}
