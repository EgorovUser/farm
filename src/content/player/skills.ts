/**
 * НАВЫКИ ОТ ИСПОЛЬЗОВАНИЯ (M01 §5): 9 навыков, перки — модификаторы из данных.
 *
 * Механика (карточка): значимое действие публикует событие → SkillEngine по
 * манифесту подписок добавляет XP. xpToNext(skillLevel) = 50 × 1.2^skillLevel.
 * Каждый уровень — модификатор из perLevel («+5% эффективность смежных
 * действий»); каждые 5 уровней — перк-порог (шире зоны мини-игр, +1 слот
 * грядки/озера на больших порогах, разблокировки локаций). Все перки отдаёт
 * провайдер skillProvider в StatBus — модуль не раздаёт эффекты руками.
 *
 * Заточка качает кузнечество ДАЖЕ при провале — подписка на forge.attempt
 * (попытку), а не на успех.
 *
 * ПРИМЕЧАНИЕ: статы целей (farm.plotSlots, lake.slots, …) задокументируют
 * модули-владельцы фаз 3–5; модификаторы на ещё не описанные статы безвредны —
 * StatBus опрашивает провайдера только по запрошенному стату (П5).
 *
 * [DECISION] Удачи (fishing.luck.rare, mine.luck.hidden, shop.luck.discount)
 * имеют нулевую базу — op 'inc' на нулевой базе — no-op (0 × 1.1 = 0),
 * поэтому перки на удачу дают 'flat'. Процентные статы будущих модулей
 * (zonePercent, yieldPercent, …) получат ненулевые базы — им 'inc'.
 */
import type { ID } from '@/shared/types/ids';
import type { SkillModDef, XpEventRule } from './rules';

export interface SkillThresholdDef {
  /** уровень, с которого порог действует */
  level: number;
  /** человекочитаемая заметка для UI (например «открывает Реку») */
  note?: string;
  mods: SkillModDef[];
}

export interface SkillDef {
  id: ID;
  name: string;
  /** модификатор за КАЖДЫЙ уровень навыка (применяется level раз) */
  perLevel: SkillModDef[];
  /** перк-пороги — каждые 5 уровней */
  thresholds: SkillThresholdDef[];
  /** события → XP навыка (манифест подписок SkillEngine) */
  xpEvents: XpEventRule[];
}

export const SKILLS_TABLE: SkillDef[] = [
  {
    id: 'farming',
    name: 'Фермерство',
    perLevel: [{ stat: 'action.farm.efficiency', op: 'inc', value: 5, label: '+5% эффективность действий фермы' }],
    thresholds: [
      // [M05.3 · G4 · DECISION] перки качества: пороги 5/10/15/20 дают +5%
      // к шансу +1 тира качества сбора — op FLAT на шкале 0..1 (база 0 —
      // FARM_BASES_TABLE; inc на нулевой базе = no-op — прецедент удач в
      // шапке этого файла). Максимум фазы — +0.20; отдельный бросок
      // farm:harvest:skill при сборе, семантика как fertilizer.tierUpChance.
      { level: 5, note: 'шире зоны мини-игр фермы', mods: [{ stat: 'farm.minigame.zonePercent', op: 'inc', value: 10 }, { stat: 'farm.harvest.tierUpChance', op: 'flat', value: 0.05 }] },
      { level: 10, mods: [{ stat: 'farm.minigame.zonePercent', op: 'inc', value: 10 }, { stat: 'farm.harvest.tierUpChance', op: 'flat', value: 0.05 }] },
      { level: 15, mods: [{ stat: 'farm.minigame.zonePercent', op: 'inc', value: 10 }, { stat: 'farm.harvest.tierUpChance', op: 'flat', value: 0.05 }] },
      { level: 20, mods: [{ stat: 'farm.minigame.zonePercent', op: 'inc', value: 10 }, { stat: 'farm.harvest.tierUpChance', op: 'flat', value: 0.05 }] },
      { level: 25, note: '+1 слот грядки', mods: [{ stat: 'farm.plotSlots', op: 'flat', value: 1 }] },
      { level: 50, note: '+1 слот грядки (мастер)', mods: [{ stat: 'farm.plotSlots', op: 'flat', value: 1 }] },
    ],
    xpEvents: [
      { event: 'farm.plotPlowed', xp: 2 },
      { event: 'farm.cropHarvested', xp: 5 },
    ],
  },
  {
    id: 'fishing',
    name: 'Рыболовство',
    perLevel: [{ stat: 'action.fishing.efficiency', op: 'inc', value: 5, label: '+5% эффективность рыбалки' }],
    thresholds: [
      { level: 5, note: 'шире зона подсечки', mods: [{ stat: 'fish.minigame.zonePercent', op: 'inc', value: 10 }] },
      { level: 10, note: 'открывает Реку (гейт: навык 10)', mods: [{ stat: 'fishing.luck.rare', op: 'flat', value: 10 }] },
      { level: 25, mods: [{ stat: 'fishing.luck.rare', op: 'flat', value: 10 }] },
      { level: 50, mods: [{ stat: 'fishing.luck.rare', op: 'flat', value: 20 }] },
    ],
    xpEvents: [{ event: 'fish.caught', xp: 8 }],
  },
  {
    id: 'fish_breeding',
    name: 'Рыбоводство',
    perLevel: [{ stat: 'action.lake.efficiency', op: 'inc', value: 5, label: '+5% эффективность ухода за озером' }],
    thresholds: [
      { level: 5, note: 'мальки растут быстрее', mods: [{ stat: 'lake.growthPercent', op: 'inc', value: 5 }] },
      { level: 25, note: '+1 слот озера', mods: [{ stat: 'lake.slots', op: 'flat', value: 1 }] },
      { level: 50, note: '+1 слот озера (мастер)', mods: [{ stat: 'lake.slots', op: 'flat', value: 1 }] },
    ],
    xpEvents: [{ event: 'lake.bred', xp: 5 }],
  },
  {
    id: 'animal_husbandry',
    name: 'Животноводство',
    perLevel: [{ stat: 'action.pen.efficiency', op: 'inc', value: 5, label: '+5% эффективность ухода' }],
    thresholds: [
      { level: 5, note: 'продуктивность', mods: [{ stat: 'pen.yieldPercent', op: 'inc', value: 5 }] },
      { level: 10, mods: [{ stat: 'pen.yieldPercent', op: 'inc', value: 5 }] },
      { level: 25, note: '+1 к складу продукции оффлайн', mods: [{ stat: 'pen.productCap', op: 'flat', value: 1 }] },
      { level: 50, mods: [{ stat: 'pen.yieldPercent', op: 'inc', value: 10 }] },
    ],
    xpEvents: [{ event: 'pen.produceCollected', xp: 3 }],
  },
  {
    id: 'crafting',
    name: 'Крафт',
    perLevel: [{ stat: 'action.craft.efficiency', op: 'inc', value: 5, label: '+5% эффективность крафта' }],
    thresholds: [
      { level: 5, note: 'качество результата', mods: [{ stat: 'craft.qualityBonus', op: 'inc', value: 5 }] },
      { level: 10, note: 'быстрее очереди', mods: [{ stat: 'craft.speedPercent', op: 'inc', value: 10 }] },
      { level: 25, mods: [{ stat: 'craft.qualityBonus', op: 'inc', value: 5 }] },
      { level: 50, mods: [{ stat: 'craft.qualityBonus', op: 'inc', value: 10 }] },
    ],
    xpEvents: [{ event: 'craft.completed', xp: 10 }],
  },
  {
    id: 'smithing',
    name: 'Кузнечество',
    perLevel: [{ stat: 'action.forge.efficiency', op: 'inc', value: 5, label: '+5% эффективность заточки' }],
    thresholds: [
      { level: 5, note: 'шанс заточки', mods: [{ stat: 'forge.sharpenChancePercent', op: 'inc', value: 2 }] },
      { level: 10, note: 'богаче карточки', mods: [{ stat: 'forge.cardBudgetPercent', op: 'inc', value: 10 }] },
      { level: 25, mods: [{ stat: 'forge.sharpenChancePercent', op: 'inc', value: 2 }] },
      { level: 50, mods: [{ stat: 'forge.sharpenChancePercent', op: 'inc', value: 3 }] },
    ],
    // стаж есть всегда: XP за ПОПЫТКУ — успех не нужен (карточка §5)
    xpEvents: [{ event: 'forge.attempt', xp: 3 }],
  },
  {
    id: 'mining',
    name: 'Горняк',
    perLevel: [{ stat: 'action.mine.efficiency', op: 'inc', value: 5, label: '+5% эффективность шахты' }],
    thresholds: [
      { level: 5, note: 'факел видит глубже', mods: [{ stat: 'mine.luck.hidden', op: 'flat', value: 10 }] },
      { level: 10, mods: [{ stat: 'mine.luck.hidden', op: 'flat', value: 10 }] },
      { level: 25, mods: [{ stat: 'mine.luck.hidden', op: 'flat', value: 10 }] },
      { level: 50, mods: [{ stat: 'mine.luck.hidden', op: 'flat', value: 20 }] },
    ],
    xpEvents: [{ event: 'mine.oreMined', xp: 5 }],
  },
  {
    id: 'combat',
    name: 'Боец',
    perLevel: [{ stat: 'action.combat.efficiency', op: 'inc', value: 5, label: '+5% эффективность боя' }],
    thresholds: [
      { level: 5, note: 'урон', mods: [{ stat: 'combat.damagePercent', op: 'inc', value: 5 }] },
      { level: 10, note: 'броня', mods: [{ stat: 'combat.armorPercent', op: 'inc', value: 5 }] },
      { level: 25, mods: [{ stat: 'combat.damagePercent', op: 'inc', value: 5 }] },
      { level: 50, mods: [{ stat: 'combat.damagePercent', op: 'inc', value: 10 }] },
    ],
    xpEvents: [
      { event: 'mine.enemyKilled', xp: 15 },
      { event: 'mine.bossKilled', xp: 100 },
    ],
  },
  {
    id: 'trading',
    name: 'Торговля',
    perLevel: [{ stat: 'action.trade.efficiency', op: 'inc', value: 5, label: '+5% эффективность сделок' }],
    thresholds: [
      { level: 5, note: 'удача скидок магазина', mods: [{ stat: 'shop.luck.discount', op: 'flat', value: 10 }] },
      { level: 10, note: 'дороже продажа', mods: [{ stat: 'trade.sellBonusPercent', op: 'inc', value: 5 }] },
      { level: 25, mods: [{ stat: 'shop.luck.discount', op: 'flat', value: 10 }] },
      { level: 50, mods: [{ stat: 'trade.sellBonusPercent', op: 'inc', value: 10 }] },
    ],
    xpEvents: [{ event: 'trade.fulfilled', xp: 5 }],
  },
];
