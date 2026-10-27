/**
 * Контент M13.1: улучшения шахты ×4 (бриф R6 — из ×6 карточки §3; Барак и
 * Отряд — M13.2-замок, НЕ создаются). ВСЕ числа — ЗДЕСЬ (П6).
 *
 * Эффекты:
 *  - mine_cart «Рудный вагонёт»: +bagSlots слотов runBag;
 *  - mine_lighting «Освещение»: −25% скрытых — inc к mine.hiddenChance
 *    (доля скрытых 40% → 30% — оракул R9; через runBuffProvider);
 *  - mine_campgear «Оборудование лагеря»: реген 1 HP / perCards разрешённых
 *    карт в забеге (канал лечения M01 — deps.healHp);
 *  - mine_lift «Лифт»: старт забега с колонки startColumn — только повторные
 *    забеги слоя (Requirement achievement ach_mine_boss_<layer> — динамический
 *    по слою, код собирает условие по данным).
 */
import type { ID } from '@/shared/types/ids';

export interface MineUpgradeDef {
  id: ID;
  name: string;
  desc: string;
  costGold: number;
  effect:
    | { t: 'bagSlots'; bagSlots: number }
    | { t: 'lighting'; hiddenChanceInc: number }
    | { t: 'campgear'; perCards: number; hp: number }
    | { t: 'lift'; startColumn: number };
}

export const MINE_UPGRADES: MineUpgradeDef[] = [
  {
    id: 'mine_cart',
    name: 'Рудный вагонёт',
    desc: '+4 слота рюкзака забега (runBag)',
    costGold: 400,
    effect: { t: 'bagSlots', bagSlots: 4 },
  },
  {
    id: 'mine_lighting',
    name: 'Освещение',
    desc: '−25% скрытых карт (доля скрытых 40% → 30%)',
    costGold: 350,
    effect: { t: 'lighting', hiddenChanceInc: -25 },
  },
  {
    id: 'mine_campgear',
    name: 'Оборудование лагеря',
    desc: 'в забеге реген 1 HP за каждые 3 разрешённые карты',
    costGold: 300,
    effect: { t: 'campgear', perCards: 3, hp: 1 },
  },
  {
    id: 'mine_lift',
    name: 'Лифт',
    desc: 'старт забега с колонки 4 (после ачивки босса этого же слоя)',
    costGold: 500,
    effect: { t: 'lift', startColumn: 4 },
  },
];

/** базовые слоты runBag (карточка §3: «слоты = базово + Рудный вагонёт») */
export const MINE_RUN_BAG_BASE_SLOTS = 8;
