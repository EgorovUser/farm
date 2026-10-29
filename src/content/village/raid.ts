/**
 * Рейд гоблинов M16.2 (карточка §4; [DECISION M162-рейд] — порог-данные,
 * БЕЗ rng: исход — РАСЧЁТ защиты против порога, оракулы точные).
 *
 * Расписание: еженедельный рейд НОЧЬЮ (день iso-недели + час — данные);
 * предвестник РОВНО за 24 ч (hourTick-детекция; «разведчик видел огни»).
 * Разрешение: суммарная защита (Частокол + Стена + Σ сил снаряжения
 * жителей) vs порог = base + perVillageLevel × (уровень деревни − 1):
 *   защита ≥ порога → победа (кража 0; +строка счастья);
 *   защита < порога  → кража stolenPercent = base + perDeficitPoint ×
 *     дефицит, КАПА ≤ 20% склада дня (cozy-инвариант, zod + оракул),
 *     Склад режет кражу на свой % защиты; списание — TransactionService
 *     eventId 'village.raidLoss' (данные: только gold — предметы
 *     игрока неприкосновенны, cozy).
 *
 * Сила защиты жителя = f(тип, качество, forgeLevel) — снапшот снаряжения
 * (экземпляр снимается транзакцией D25 «худшие-вперёд», качество/заточка
 * фиксируются в срезе equipped).
 */
import type { VillageRaidTable } from './types';

export const VILLAGE_RAID: VillageRaidTable = {
  weekday: 5, // пятница
  hour: 23, // ночь (локальное время игрока)
  warningLeadHours: 24,
  threshold: { base: 12, perVillageLevel: 4 },
  defense: {
    typeBase: { weapon: 5, armor: 6, shield: 4, other: 2 },
    tierStep: 2,
    valueFactor: 0.03,
    sharpenStep: 1,
    equippableTypes: ['weapon', 'armor', 'shield'],
  },
  stolen: { basePercent: 8, perDeficitPoint: 1.5, capPercent: 20, currencies: ['gold'] },
  winHappinessBonus: 4,
};

/** ранг тира качества (D=0 .. SS=5) — по QUALITY_TIERS ядра ids */
const TIER_ORDER = ['D', 'C', 'B', 'A', 'S', 'SS'] as const;

/** сила защиты снаряжения жителя (данные; оракул selftest G4/G8) */
export function defenseStrengthOf(
  raid: VillageRaidTable,
  itemType: string,
  tier: string,
  value: number,
  sharpening: number,
): number {
  const base = raid.defense.typeBase[itemType] ?? raid.defense.typeBase['other'] ?? 2;
  const rank = Math.max(0, TIER_ORDER.indexOf(tier as (typeof TIER_ORDER)[number]));
  const raw =
    base +
    rank * raid.defense.tierStep +
    Math.max(0, Math.min(100, value)) * raid.defense.valueFactor +
    Math.max(0, sharpening) * raid.defense.sharpenStep;
  return Math.round(raw * 10) / 10;
}

/** порог защиты на уровне деревни (данные; РАСЧЁТ, не лотерея) */
export function raidThresholdOf(raid: VillageRaidTable, villageLevel: number): number {
  return Math.round(raid.threshold.base + raid.threshold.perVillageLevel * Math.max(0, villageLevel - 1));
}

/**
 * Кража при провале (%, ДО защиты Склада): base + perDeficit × дефицит,
 * КАПА capPercent (cozy ≤ 20% склада дня). Оракул: результат ≤ capPercent.
 */
export function stolenPercentOf(raid: VillageRaidTable, deficit: number): number {
  const raw = raid.stolen.basePercent + raid.stolen.perDeficitPoint * Math.max(0, deficit);
  return Math.round(Math.min(raid.stolen.capPercent, raw) * 10) / 10;
}

/** итоговое золото кражи: % от склада (кошелёк на момент рейда) минус
 *  защита Склада (кража × (1 − N/100)); капа 20% гарантирована данными */
export function stolenGoldOf(
  raid: VillageRaidTable,
  stolenPercent: number,
  walletGold: number,
  warehouseProtectionPercent: number,
): number {
  const eff = stolenPercent * (1 - Math.max(0, Math.min(100, warehouseProtectionPercent)) / 100);
  return Math.max(0, Math.floor((walletGold * eff) / 100));
}
