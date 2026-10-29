/**
 * M14.2 «Дерево пассивик» — кластер РЫБАЛКА-ОЗЕРО (карточка §4: квота 25).
 * Существующие 2 (fish_luck_1/2) — первые узлы кластера, НЕ переносятся;
 * здесь 23 НОВЫХ = 19 Small + 4 Notable, добирающих квоту: 2 + 23 = 25.
 *
 * Ветви (система карточки «клёв/редкость/оживление»):
 *  - РЕДКОСТЬ: fish_rare_1..4 + Notable «Ловец легенд» (от fish_luck_2);
 *  - КАТЕГОРИИ: fish_cat_1..5 + Notable «Золотая наживка» (от fish_luck_1);
 *  - КЛЁВ: fish_bite_1..3 + Notable «Клёвое место» (от fish_luck_2);
 *  - СОКРОВИЩА/ОЗЕРО: lake_care → treasure → zone + Notable «Повелитель
 *    озера» (от fish_luck_1).
 *
 * [DECISION op по пред-базе — канон FIX-RIVEN]: inc только на ненулевых базах
 * (fish.minigame.zonePercent 100, action.lake.*.energyCost); flat — на
 * нулевых (fishing.weight.*, fishing.luck.*, fishing.bite.speed 0,
 * fishing.treasure.weight 0). «Клёв чаще» = flat +N на fishing.bite.speed
 * (ожидание × (1 − speed/100) — знак обратный «Рудному магнату», который
 * «реже» через −100). Новых зеркал bases.ts кластер не требует.
 *
 * [DECISION M142-цена]: Notable новой волны = 10 (см. nodes-farm.ts).
 */
import type { PassiveNodeDef } from './types';

/** кластер «Рыбалка и озеро» — 23 новых узла (квота 25 = 2 существующих + 23) */
export const FISH_NODES: PassiveNodeDef[] = [
  // --- ветвь РЕДКОСТЬ (от fish_luck_2): веса редкого улова
  {
    id: 'fish_rare_1',
    name: 'Тонкая леска',
    kind: 'small',
    cluster: 'fish',
    cost: 1,
    mods: [{ stat: 'fishing.weight.rare', op: 'flat', value: 2, label: '+2 к весу редкой рыбы' }],
    links: ['fish_luck_2'],
    pos: { x: 0, y: -6 },
  },
  {
    id: 'fish_rare_2',
    name: 'Крючок-невидимка',
    kind: 'small',
    cluster: 'fish',
    cost: 1,
    mods: [{ stat: 'fishing.weight.rare', op: 'flat', value: 2, label: '+2 к весу редкой рыбы' }],
    links: ['fish_rare_1'],
    pos: { x: -1, y: -6 },
  },
  {
    id: 'fish_rare_3',
    name: 'Мастерская наживка',
    kind: 'small',
    cluster: 'fish',
    cost: 1,
    mods: [{ stat: 'fishing.weight.epic', op: 'flat', value: 1, label: '+1 к весу эпической рыбы' }],
    links: ['fish_rare_2'],
    pos: { x: -2, y: -6 },
  },
  {
    id: 'fish_rare_4',
    name: 'Серебряный блеск',
    kind: 'small',
    cluster: 'fish',
    cost: 1,
    mods: [{ stat: 'fishing.weight.epic', op: 'flat', value: 1, label: '+1 к весу эпической рыбы' }],
    links: ['fish_rare_3'],
    pos: { x: -3, y: -6 },
  },
  {
    id: 'fish_legend_n',
    name: 'Ловец легенд',
    kind: 'notable',
    cluster: 'fish',
    cost: 10,
    mods: [
      { stat: 'fishing.weight.legendary', op: 'flat', value: 0.3, label: '+0.3 к весу легендарной рыбы' },
      { stat: 'fishing.weight.mythic', op: 'flat', value: 0.1, label: '+0.1 к весу мифической рыбы' },
    ],
    links: ['fish_rare_4'],
    pos: { x: -4, y: -6 },
    note: 'Notable = эффект-комбинация; цена 10 — [DECISION M142-цена]',
  },
  // --- ветвь КАТЕГОРИИ (от fish_luck_1): удачи категорий улова
  {
    id: 'fish_cat_1',
    name: 'Верный глаз',
    kind: 'small',
    cluster: 'fish',
    cost: 1,
    mods: [{ stat: 'fishing.luck.small', op: 'flat', value: 5, label: '+5 к удаче мелкой рыбы' }],
    links: ['fish_luck_1'],
    pos: { x: 3, y: -6 },
  },
  {
    id: 'fish_cat_2',
    name: 'Тихая подсечка',
    kind: 'small',
    cluster: 'fish',
    cost: 1,
    mods: [{ stat: 'fishing.luck.medium', op: 'flat', value: 5, label: '+5 к удаче средней рыбы' }],
    links: ['fish_cat_1'],
    pos: { x: 4, y: -6 },
  },
  {
    id: 'fish_cat_3',
    name: 'Чутьё на клады',
    kind: 'small',
    cluster: 'fish',
    cost: 1,
    mods: [{ stat: 'fishing.luck.event', op: 'flat', value: 5, label: '+5 к удаче событий на рыбалке' }],
    links: ['fish_cat_2'],
    pos: { x: 5, y: -6 },
  },
  {
    id: 'fish_cat_4',
    name: 'Речной фарватер',
    kind: 'small',
    cluster: 'fish',
    cost: 1,
    mods: [{ stat: 'fishing.luck.small', op: 'flat', value: 5, label: '+5 к удаче мелкой рыбы' }],
    links: ['fish_cat_3'],
    pos: { x: 6, y: -6 },
  },
  {
    id: 'fish_cat_5',
    name: 'Озёрные тропы',
    kind: 'small',
    cluster: 'fish',
    cost: 1,
    mods: [{ stat: 'fishing.luck.medium', op: 'flat', value: 5, label: '+5 к удаче средней рыбы' }],
    links: ['fish_cat_4'],
    pos: { x: 7, y: -6 },
  },
  {
    id: 'fish_goldbait_n',
    name: 'Золотая наживка',
    kind: 'notable',
    cluster: 'fish',
    cost: 10,
    mods: [
      { stat: 'fishing.luck.rare', op: 'flat', value: 10, label: '+10 к удаче редкой рыбы' },
      { stat: 'fishing.luck.trash', op: 'flat', value: -10, label: '−10 к удаче мусора (реже хлам)' },
    ],
    links: ['fish_cat_5'],
    pos: { x: 8, y: -6 },
    note: 'Notable = эффект-комбинация; цена 10 — [DECISION M142-цена]',
  },
  // --- ветвь КЛЁВ (от fish_luck_2): скорость клёва (ожидание короче)
  {
    id: 'fish_bite_1',
    name: 'Ранний подъём',
    kind: 'small',
    cluster: 'fish',
    cost: 1,
    mods: [
      { stat: 'fishing.bite.speed', op: 'flat', value: 5, label: '+5 к скорости клёва (ожидание ×0.95)' },
    ],
    links: ['fish_luck_2'],
    pos: { x: 0, y: -7 },
  },
  {
    id: 'fish_bite_2',
    name: 'Ночная ловля',
    kind: 'small',
    cluster: 'fish',
    cost: 1,
    mods: [
      { stat: 'fishing.bite.speed', op: 'flat', value: 5, label: '+5 к скорости клёва (ожидание ×0.95)' },
    ],
    links: ['fish_bite_1'],
    pos: { x: -1, y: -7 },
  },
  {
    id: 'fish_bite_3',
    name: 'Любимая яма',
    kind: 'small',
    cluster: 'fish',
    cost: 1,
    mods: [
      { stat: 'fishing.bite.speed', op: 'flat', value: 10, label: '+10 к скорости клёва (ожидание ×0.9)' },
    ],
    links: ['fish_bite_2'],
    pos: { x: -2, y: -7 },
  },
  {
    id: 'fish_spot_n',
    name: 'Клёвое место',
    kind: 'notable',
    cluster: 'fish',
    cost: 10,
    mods: [
      { stat: 'fishing.bite.speed', op: 'flat', value: 20, label: '+20 к скорости клёва (ожидание ×0.8)' },
    ],
    links: ['fish_bite_3'],
    pos: { x: -3, y: -7 },
    note: 'Notable-моностат премиум-класса; цена 10 — [DECISION M142-цена]',
  },
  // --- ветвь СОКРОВИЩА/ОЗЕРО (от fish_luck_1): тяга кладов, подсечка, уход
  {
    id: 'lake_care_1',
    name: 'Лёгкий сачок',
    kind: 'small',
    cluster: 'fish',
    cost: 1,
    mods: [{ stat: 'action.lake.clean.energyCost', op: 'inc', value: -5, label: '−5% к стоимости чистки озера' }],
    links: ['fish_luck_1'],
    pos: { x: 3, y: -7 },
  },
  {
    id: 'lake_care_2',
    name: 'Щепетильный корм',
    kind: 'small',
    cluster: 'fish',
    cost: 1,
    mods: [{ stat: 'action.lake.feed.energyCost', op: 'inc', value: -5, label: '−5% к стоимости кормления рыб' }],
    links: ['lake_care_1'],
    pos: { x: 4, y: -7 },
  },
  {
    id: 'fish_treas_1',
    name: 'Нюх на клады',
    kind: 'small',
    cluster: 'fish',
    cost: 1,
    mods: [
      { stat: 'fishing.treasure.weight', op: 'flat', value: 10, label: '+10 к весу категории «сокровище»' },
    ],
    links: ['lake_care_2'],
    pos: { x: 5, y: -7 },
  },
  {
    id: 'fish_treas_2',
    name: 'Карты сокровищ',
    kind: 'small',
    cluster: 'fish',
    cost: 1,
    mods: [
      { stat: 'fishing.treasure.weight', op: 'flat', value: 10, label: '+10 к весу категории «сокровище»' },
    ],
    links: ['fish_treas_1'],
    pos: { x: 6, y: -7 },
  },
  {
    id: 'fish_zone_1',
    name: 'Твёрдая рука',
    kind: 'small',
    cluster: 'fish',
    cost: 1,
    mods: [{ stat: 'fish.minigame.zonePercent', op: 'inc', value: 5, label: '+5% к зоне подсечки' }],
    links: ['fish_treas_2'],
    pos: { x: 7, y: -7 },
  },
  {
    id: 'fish_zone_2',
    name: 'Чутьё на рывок',
    kind: 'small',
    cluster: 'fish',
    cost: 1,
    mods: [{ stat: 'fish.minigame.zonePercent', op: 'inc', value: 5, label: '+5% к зоне подсечки' }],
    links: ['fish_zone_1'],
    pos: { x: 8, y: -7 },
  },
  {
    id: 'fish_zone_3',
    name: 'Мгновенная подсечка',
    kind: 'small',
    cluster: 'fish',
    cost: 1,
    mods: [{ stat: 'fish.minigame.zonePercent', op: 'inc', value: 10, label: '+10% к зоне подсечки' }],
    links: ['fish_zone_2'],
    pos: { x: 9, y: -7 },
  },
  {
    id: 'fish_lake_n',
    name: 'Повелитель озера',
    kind: 'notable',
    cluster: 'fish',
    cost: 10,
    mods: [
      { stat: 'fishing.treasure.weight', op: 'flat', value: 25, label: '+25 к весу категории «сокровище»' },
      { stat: 'fish.minigame.zonePercent', op: 'inc', value: 10, label: '+10% к зоне подсечки' },
    ],
    links: ['fish_zone_3'],
    pos: { x: 10, y: -7 },
    note: 'Notable = эффект-комбинация; цена 10 — [DECISION M142-цена]',
  },
];
