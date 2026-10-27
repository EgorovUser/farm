/**
 * НАЖИВКИ (карточка M07 §4, бриф F5): Червь (база) / Муха (+10% редкость) /
 * Икра (+25% редкость, −10% клёв) / Светящийся мотыль (+50% к событиям) /
 * Легендарная приманка (гарант rare+).
 *
 * [DECISION · M07.1 · канал статов] статы-моды наживок живут ЗДЕСЬ и
 * отдаются baitProvider'ом (F2: modifierProviders = [baitProvider]) —
 * предметные дефы наживок чистые (без baseStats: канал наживки — провайдер
 * модуля, не equipmentProvider; иначе двойной источник одного мода).
 *
 * [DECISION · M07.1 · Червь] сверка по ContentRegistry (F5): деф существовал
 * с фазы 2 — worm_bait «Червяк» (catalog-shelves, basePrice 1з, полка
 * «Наживки» закрыта). Рыболовная таблица продаёт Червя по цене брифа 2з;
 * каталог НЕ тронут (домен M04/скидок; [QUESTION] отчёта: выравнивание
 * 1з/2з — за заказчиком, прецедент [QUESTION] №1 M06 egg/wool).
 *
 * [DECISION · M07.1 · форма гаранта rare+] min-кап ДАННЫМИ (бриф F5,
 * вариант «ИЛИ min-кап данными»): Легендарная приманка даёт flat −60 на
 * fishing.weight.common и flat −25 на fishing.weight.uncommon — итоговые
 * веса 0/0, ролл редкости идёт только по rare+ (кап модификатором, НЕ
 * if-ом — та же семантика, что maxFishRarity удочек).
 *
 * Расход ровно 1 за заброс — TransactionService eventId fish.cast (F6).
 * Наживка может быть УСЛОВИЕМ появления рыбы (FishDef.conditions.bait).
 */
import type { StatId } from '@/shared/types/ids';
import type { ID } from '@/shared/types/ids';

/** стат-мод наживки (flat на удачу/вес/скорость клёва; baitProvider) */
export interface BaitModDef {
  stat: StatId;
  value: number;
  label: string;
}

export interface BaitShopDef {
  defId: ID;
  name: string;
  /** цена прямой продажи fish.buy (TransactionService, БЕЗ энергии) */
  price: number;
  mods: BaitModDef[];
}

export const BAITS: BaitShopDef[] = [
  {
    // деф жил с фазы 2 (catalog-shelves) — сверка по ContentRegistry F5
    defId: 'worm_bait',
    name: 'Червяк',
    price: 2,
    mods: [], // база: без модов
  },
  {
    defId: 'fly_bait',
    name: 'Муха',
    price: 5,
    mods: [{ stat: 'fishing.luck.rare', value: 10, label: '+10% редкость' }],
  },
  {
    defId: 'caviar_bait',
    name: 'Икра',
    price: 25,
    mods: [
      { stat: 'fishing.luck.rare', value: 25, label: '+25% редкость' },
      { stat: 'fishing.bite.speed', value: -10, label: '−10% клёв' },
    ],
  },
  {
    defId: 'moth_bait',
    name: 'Светящийся мотыль',
    price: 40,
    mods: [{ stat: 'fishing.luck.event', value: 50, label: '+50% к событиям' }],
  },
  {
    defId: 'legendary_bait',
    name: 'Легендарная приманка',
    price: 150,
    mods: [
      { stat: 'fishing.weight.common', value: -60, label: 'гарант rare+ (common выведен)' },
      { stat: 'fishing.weight.uncommon', value: -25, label: 'гарант rare+ (uncommon выведен)' },
    ],
  },
];
