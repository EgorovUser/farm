/**
 * Контент M12.2 «Шахта»: слои ×9 (карточка M12 §2 «доступ/слои», бриф G3/G5).
 * ВСЕ числа слоёв — ЗДЕСЬ (П6): руда по слою, таблица предметов слоя,
 * двойной гейт (ачивка предыдущего слоя + тир кирки), трофей слоя.
 *
 * Прогрессия слоя НЕ персистируется (M13-замок): трофей слоя — предмет-доказательство
 * (ачивка ach_mine_boss_<n> = hasItem трофея; auto-claim M15 живой).
 * Гейт тира кирки: тир = тир качества кирки (D=1…SS=6) + floor(заточка/10)
 * (канон M10 §2, живой канал forge.effectiveTier); диапазоны карточки §2:
 * 1–2 любая · 3–4 железная+ · 5–6 стальная+ · 7+ мифриловая+.
 * Боссы циклируются по слоям (канонические: 1 королева · 2 владыка · 3 змей).
 */
import type { ID } from '@/shared/types/ids';
import type { Condition } from '@/shared/types/requirement';

export interface MineLayerDef {
  layer: number;
  /** руда по слою (дефы — ContentRegistry 'items'; сверка — self-группа M12.2) */
  ore: { defId: ID; qty: [number, number] };
  /** % шанс предмета из таблицы слоя за победу над мобом */
  itemChance: number;
  /** таблица предметов слоя (взвешенный выбор при срабатывании шанса) */
  items: Array<{ defId: ID; weight: number; qty: [number, number] }>;
  /** гейт тира кирки (витрина publicApi M02 + forge.effectiveTier M10) */
  pickGate: { minTier: number; label: string };
  /** гейт ачивки предыдущего слоя (Requirement-оценщик, G3) */
  unlock?: Condition;
  /** босс слоя (цикл: королева/владыка/змей) */
  bossId: ID;
  /** трофей слоя — гарантированный дроп за победу над боссом (ачивка = hasItem) */
  trophy: ID;
}

export const MINE_LAYERS: MineLayerDef[] = [
  {
    layer: 1,
    ore: { defId: 'copper_ore', qty: [1, 2] },
    itemChance: 15,
    items: [
      { defId: 'rope', weight: 5, qty: [1, 1] },
      { defId: 'cloth', weight: 3, qty: [1, 1] },
      { defId: 'healing_herb', weight: 2, qty: [1, 2] },
    ],
    pickGate: { minTier: 1, label: 'любая кирка' },
    bossId: 'spider_queen',
    trophy: 'trophy_mine_1',
  },
  {
    layer: 2,
    ore: { defId: 'copper_ore', qty: [1, 2] },
    itemChance: 15,
    items: [
      { defId: 'rope', weight: 4, qty: [1, 2] },
      { defId: 'healing_herb', weight: 3, qty: [1, 2] },
      { defId: 'cloth', weight: 3, qty: [1, 1] },
    ],
    pickGate: { minTier: 1, label: 'любая кирка' },
    unlock: { t: 'achievement', id: 'ach_mine_boss_1' },
    bossId: 'stone_guardian',
    trophy: 'trophy_mine_2',
  },
  {
    layer: 3,
    ore: { defId: 'tin_ore', qty: [1, 2] },
    itemChance: 15,
    items: [
      { defId: 'iron_ingot', weight: 3, qty: [1, 1] },
      { defId: 'amber_resin', weight: 3, qty: [1, 1] },
      { defId: 'repair_kit', weight: 2, qty: [1, 1] },
    ],
    pickGate: { minTier: 3, label: 'железная кирка' },
    unlock: { t: 'achievement', id: 'ach_mine_boss_2' },
    bossId: 'deep_serpent',
    trophy: 'trophy_mine_3',
  },
  {
    layer: 4,
    ore: { defId: 'tin_ore', qty: [1, 3] },
    itemChance: 20,
    items: [
      { defId: 'iron_ingot', weight: 4, qty: [1, 2] },
      { defId: 'repair_kit', weight: 2, qty: [1, 1] },
      { defId: 'amber_resin', weight: 2, qty: [1, 2] },
    ],
    pickGate: { minTier: 3, label: 'железная кирка' },
    unlock: { t: 'achievement', id: 'ach_mine_boss_3' },
    bossId: 'spider_queen',
    trophy: 'trophy_mine_4',
  },
  {
    layer: 5,
    ore: { defId: 'iron_ore', qty: [1, 3] },
    itemChance: 20,
    items: [
      { defId: 'iron_plate', weight: 3, qty: [1, 1] },
      { defId: 'iron_ingot', weight: 3, qty: [1, 2] },
      { defId: 'silk', weight: 2, qty: [1, 1] },
    ],
    pickGate: { minTier: 4, label: 'стальная кирка' },
    unlock: { t: 'achievement', id: 'ach_mine_boss_4' },
    bossId: 'stone_guardian',
    trophy: 'trophy_mine_5',
  },
  {
    layer: 6,
    ore: { defId: 'iron_ore', qty: [1, 3] },
    itemChance: 20,
    items: [
      { defId: 'iron_plate', weight: 3, qty: [1, 2] },
      { defId: 'silk', weight: 2, qty: [1, 1] },
      { defId: 'iron_ingot', weight: 3, qty: [2, 3] },
    ],
    pickGate: { minTier: 4, label: 'стальная кирка' },
    unlock: { t: 'achievement', id: 'ach_mine_boss_5' },
    bossId: 'deep_serpent',
    trophy: 'trophy_mine_6',
  },
  {
    layer: 7,
    ore: { defId: 'silver_ore', qty: [2, 4] },
    itemChance: 25,
    items: [
      { defId: 'lucky_charm', weight: 1, qty: [1, 1] },
      { defId: 'silk', weight: 3, qty: [1, 2] },
      { defId: 'iron_plate', weight: 3, qty: [1, 2] },
    ],
    pickGate: { minTier: 5, label: 'мифриловая кирка' },
    unlock: { t: 'achievement', id: 'ach_mine_boss_6' },
    bossId: 'spider_queen',
    trophy: 'trophy_mine_7',
  },
  {
    layer: 8,
    ore: { defId: 'silver_ore', qty: [2, 4] },
    itemChance: 25,
    items: [
      { defId: 'lucky_charm', weight: 1, qty: [1, 1] },
      { defId: 'iron_plate', weight: 3, qty: [2, 3] },
      { defId: 'silk', weight: 3, qty: [1, 2] },
    ],
    pickGate: { minTier: 5, label: 'мифриловая кирка' },
    unlock: { t: 'achievement', id: 'ach_mine_boss_7' },
    bossId: 'stone_guardian',
    trophy: 'trophy_mine_8',
  },
  {
    layer: 9,
    ore: { defId: 'silver_ore', qty: [2, 4] },
    itemChance: 25,
    items: [
      { defId: 'lucky_charm', weight: 2, qty: [1, 1] },
      { defId: 'silk', weight: 3, qty: [2, 3] },
      { defId: 'iron_plate', weight: 3, qty: [2, 3] },
    ],
    pickGate: { minTier: 5, label: 'мифриловая кирка' },
    unlock: { t: 'achievement', id: 'ach_mine_boss_8' },
    bossId: 'deep_serpent',
    trophy: 'trophy_mine_9',
  },
];
