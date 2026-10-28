/**
 * M14.2 «Дерево пассивик» — кластер ФЕРМЕРСТВО (карточка §4: квота 30; бриф
 * G2/G3). Существующие 3 (farm_growth_1/2, farm_water «Идеальный полив») —
 * первые узлы кластера, НЕ переносятся; здесь 27 НОВЫХ = 24 Small + 3 Notable,
 * добирающих квоту: 3 + 27 = 30. Рёбра от НОВЫХ узлов к существующим пишутся
 * ЗДЕСЬ (смежность = объединение, граф неориентированный — logic.ts M14.1).
 *
 * Ветви (система карточки «полив/сорняки/рост/сбор»):
 *  - РОСТ: farm_speed_1..5 + Notable «Селекционер» (от farm_growth_2);
 *  - СОРНЯКИ: farm_weeds_1..4 + Notable «Сорняковый оберег» (от farm_water);
 *  - СБОР: farm_harv_1..6 + Notable «Хозяин урожая» (от farm_growth_1);
 *  - ТРУД: farm_labor_1..9 — расходы энергии фермы (от farm_water).
 *
 * [DECISION M142-цена]: Notable новой волны = 10 (zod-капа schemas.ts
 * cost ≤ 10; G4a «Σ цен ≥ 300» выполним ТОЛЬКО ценой 10 при ≤ 4 Notable на
 * кластер: 36 существующих + 99 новых Small + 18×10 = 315). Small/Keystone = 1
 * — канон цен M14.1 НЕ тронут (keystone новых НЕТ — замок карточки §3).
 *
 * [DECISION op по пред-базе — канон FIX-RIVEN, прецедент M14.1]: inc только на
 * ненулевых базах (farm.growthSpeed 100, farm.weeds.chancePercent 8,
 * farm.harvest.mult 100, action.*.energyCost); flat — на нулевой базе
 * farm.harvest.tierUpChance 0. Шаги значений — класс M14.1 (inc ±5/±10, flat
 * +0.05). Эффекты — только модификаторы по СУЩЕСТВУЮЩИМ статам шины (новых
 * зеркал bases.ts кластер не требует).
 */
import type { PassiveNodeDef } from './types';

/** кластер «Фермерство» — 27 новых узлов (квота 30 = 3 существующих + 27) */
export const FARM_NODES: PassiveNodeDef[] = [
  // --- ветвь РОСТ (от farm_growth_2): скорость роста + качество сбора
  {
    id: 'farm_speed_1',
    name: 'Ранние всходы',
    kind: 'small',
    cluster: 'farm',
    cost: 1,
    mods: [{ stat: 'farm.growthSpeed', op: 'inc', value: 5, label: '+5% к скорости роста' }],
    links: ['farm_growth_2'],
    pos: { x: -2, y: 4 },
  },
  {
    id: 'farm_speed_2',
    name: 'Тёплые грядки',
    kind: 'small',
    cluster: 'farm',
    cost: 1,
    mods: [{ stat: 'farm.growthSpeed', op: 'inc', value: 5, label: '+5% к скорости роста' }],
    links: ['farm_speed_1'],
    pos: { x: -3, y: 4 },
  },
  {
    id: 'farm_speed_3',
    name: 'Гидропоника',
    kind: 'small',
    cluster: 'farm',
    cost: 1,
    mods: [{ stat: 'farm.growthSpeed', op: 'inc', value: 10, label: '+10% к скорости роста' }],
    links: ['farm_speed_2'],
    pos: { x: -4, y: 4 },
  },
  {
    id: 'farm_speed_4',
    name: 'Теплица',
    kind: 'small',
    cluster: 'farm',
    cost: 1,
    mods: [{ stat: 'farm.growthSpeed', op: 'inc', value: 10, label: '+10% к скорости роста' }],
    links: ['farm_speed_3'],
    pos: { x: -5, y: 4 },
  },
  {
    id: 'farm_speed_5',
    name: 'Круглогодичный цикл',
    kind: 'small',
    cluster: 'farm',
    cost: 1,
    mods: [{ stat: 'farm.growthSpeed', op: 'inc', value: 10, label: '+10% к скорости роста' }],
    links: ['farm_speed_4'],
    pos: { x: -6, y: 4 },
  },
  {
    id: 'farm_breed_n',
    name: 'Селекционер',
    kind: 'notable',
    cluster: 'farm',
    cost: 10,
    mods: [
      { stat: 'farm.growthSpeed', op: 'inc', value: 15, label: '+15% к скорости роста' },
      { stat: 'farm.harvest.tierUpChance', op: 'flat', value: 0.05, label: '+0.05 к шансу +1 тира качества сбора' },
    ],
    links: ['farm_speed_5'],
    pos: { x: -7, y: 4 },
    note: 'Notable = эффект-комбинация (карточка §3); цена 10 — [DECISION M142-цена]',
  },
  // --- ветвь СОРНЯКИ (от farm_water): зарастание и прополка
  {
    id: 'farm_weeds_1',
    name: 'Чистые борозды',
    kind: 'small',
    cluster: 'farm',
    cost: 1,
    mods: [{ stat: 'farm.weeds.chancePercent', op: 'inc', value: -5, label: '−5% к шансу зарастания сорняками' }],
    links: ['farm_water'],
    pos: { x: -4, y: 3 },
  },
  {
    id: 'farm_weeds_2',
    name: 'Мульча',
    kind: 'small',
    cluster: 'farm',
    cost: 1,
    mods: [{ stat: 'farm.weeds.chancePercent', op: 'inc', value: -5, label: '−5% к шансу зарастания сорняками' }],
    links: ['farm_weeds_1'],
    pos: { x: -5, y: 3 },
  },
  {
    id: 'farm_weeds_3',
    name: 'Густой посев',
    kind: 'small',
    cluster: 'farm',
    cost: 1,
    mods: [{ stat: 'farm.weeds.chancePercent', op: 'inc', value: -10, label: '−10% к шансу зарастания сорняками' }],
    links: ['farm_weeds_2'],
    pos: { x: -6, y: 3 },
  },
  {
    id: 'farm_weeds_4',
    name: 'Севооборот',
    kind: 'small',
    cluster: 'farm',
    cost: 1,
    mods: [{ stat: 'farm.weeds.chancePercent', op: 'inc', value: -10, label: '−10% к шансу зарастания сорняками' }],
    links: ['farm_weeds_3'],
    pos: { x: -7, y: 3 },
  },
  {
    id: 'farm_weeds_n',
    name: 'Сорняковый оберег',
    kind: 'notable',
    cluster: 'farm',
    cost: 10,
    mods: [
      { stat: 'farm.weeds.chancePercent', op: 'inc', value: -15, label: '−15% к шансу зарастания сорняками' },
      { stat: 'action.farm.weed.energyCost', op: 'inc', value: -25, label: '−25% к стоимости прополки' },
    ],
    links: ['farm_weeds_4'],
    pos: { x: -8, y: 3 },
    note: 'Notable = эффект-комбинация; цена 10 — [DECISION M142-цена]',
  },
  // --- ветвь СБОР (от farm_growth_1): обильный и качественный урожай
  {
    id: 'farm_harv_1',
    name: 'Острые серпы',
    kind: 'small',
    cluster: 'farm',
    cost: 1,
    mods: [{ stat: 'farm.harvest.mult', op: 'inc', value: 5, label: '+5% к личному сбору урожая' }],
    links: ['farm_growth_1'],
    pos: { x: -2, y: 2 },
  },
  {
    id: 'farm_harv_2',
    name: 'Двойная жатва',
    kind: 'small',
    cluster: 'farm',
    cost: 1,
    mods: [{ stat: 'farm.harvest.mult', op: 'inc', value: 5, label: '+5% к личному сбору урожая' }],
    links: ['farm_harv_1'],
    pos: { x: -3, y: 2 },
  },
  {
    id: 'farm_harv_3',
    name: 'Урожайные сорта',
    kind: 'small',
    cluster: 'farm',
    cost: 1,
    mods: [{ stat: 'farm.harvest.mult', op: 'inc', value: 10, label: '+10% к личному сбору урожая' }],
    links: ['farm_harv_2'],
    pos: { x: -4, y: 2 },
  },
  {
    id: 'farm_harv_4',
    name: 'Золотые колосья',
    kind: 'small',
    cluster: 'farm',
    cost: 1,
    mods: [
      { stat: 'farm.harvest.tierUpChance', op: 'flat', value: 0.05, label: '+0.05 к шансу +1 тира качества сбора' },
    ],
    links: ['farm_harv_3'],
    pos: { x: -5, y: 2 },
  },
  {
    id: 'farm_harv_5',
    name: 'Агротехника',
    kind: 'small',
    cluster: 'farm',
    cost: 1,
    mods: [{ stat: 'farm.harvest.mult', op: 'inc', value: 10, label: '+10% к личному сбору урожая' }],
    links: ['farm_harv_4'],
    pos: { x: -6, y: 2 },
  },
  {
    id: 'farm_harv_6',
    name: 'Калёные лезвия',
    kind: 'small',
    cluster: 'farm',
    cost: 1,
    mods: [{ stat: 'farm.harvest.mult', op: 'inc', value: 10, label: '+10% к личному сбору урожая' }],
    links: ['farm_harv_5'],
    pos: { x: -7, y: 2 },
  },
  {
    id: 'farm_harv_n',
    name: 'Хозяин урожая',
    kind: 'notable',
    cluster: 'farm',
    cost: 10,
    mods: [
      { stat: 'farm.harvest.mult', op: 'inc', value: 15, label: '+15% к личному сбору урожая' },
      { stat: 'farm.harvest.tierUpChance', op: 'flat', value: 0.1, label: '+0.1 к шансу +1 тира качества сбора' },
    ],
    links: ['farm_harv_6'],
    pos: { x: -8, y: 2 },
    note: 'Notable = эффект-комбинация; цена 10 — [DECISION M142-цена]',
  },
  // --- ветвь ТРУД (от farm_water): расходы энергии фермы (5 действий)
  {
    id: 'farm_labor_1',
    name: 'Лёгкая тяпка',
    kind: 'small',
    cluster: 'farm',
    cost: 1,
    mods: [{ stat: 'action.farm.plow.energyCost', op: 'inc', value: -5, label: '−5% к стоимости вспашки' }],
    links: ['farm_water'],
    pos: { x: -4, y: 1 },
  },
  {
    id: 'farm_labor_2',
    name: 'Наездной плуг',
    kind: 'small',
    cluster: 'farm',
    cost: 1,
    mods: [{ stat: 'action.farm.plow.energyCost', op: 'inc', value: -5, label: '−5% к стоимости вспашки' }],
    links: ['farm_labor_1'],
    pos: { x: -5, y: 1 },
  },
  {
    id: 'farm_labor_3',
    name: 'Сноровка посадки',
    kind: 'small',
    cluster: 'farm',
    cost: 1,
    mods: [{ stat: 'action.farm.plant.energyCost', op: 'inc', value: -5, label: '−5% к стоимости посадки' }],
    links: ['farm_labor_2'],
    pos: { x: -6, y: 1 },
  },
  {
    id: 'farm_labor_4',
    name: 'Сев вразброс',
    kind: 'small',
    cluster: 'farm',
    cost: 1,
    mods: [{ stat: 'action.farm.plant.energyCost', op: 'inc', value: -5, label: '−5% к стоимости посадки' }],
    links: ['farm_labor_3'],
    pos: { x: -7, y: 1 },
  },
  {
    id: 'farm_labor_5',
    name: 'Капельная система',
    kind: 'small',
    cluster: 'farm',
    cost: 1,
    mods: [{ stat: 'action.farm.water.energyCost', op: 'inc', value: -5, label: '−5% к стоимости полива' }],
    links: ['farm_labor_4'],
    pos: { x: -8, y: 1 },
  },
  {
    id: 'farm_labor_6',
    name: 'Дождевая бочка',
    kind: 'small',
    cluster: 'farm',
    cost: 1,
    mods: [{ stat: 'action.farm.water.energyCost', op: 'inc', value: -5, label: '−5% к стоимости полива' }],
    links: ['farm_labor_5'],
    pos: { x: -9, y: 1 },
  },
  {
    id: 'farm_labor_7',
    name: 'Проворные руки',
    kind: 'small',
    cluster: 'farm',
    cost: 1,
    mods: [{ stat: 'action.farm.harvest.energyCost', op: 'inc', value: -5, label: '−5% к стоимости сбора' }],
    links: ['farm_labor_6'],
    pos: { x: -10, y: 1 },
  },
  {
    id: 'farm_labor_8',
    name: 'Крестьянская закалка',
    kind: 'small',
    cluster: 'farm',
    cost: 1,
    mods: [{ stat: 'action.farm.weed.energyCost', op: 'inc', value: -5, label: '−5% к стоимости прополки' }],
    links: ['farm_labor_7'],
    pos: { x: -11, y: 1 },
  },
  {
    id: 'farm_labor_9',
    name: 'Разминка на заре',
    kind: 'small',
    cluster: 'farm',
    cost: 1,
    mods: [{ stat: 'action.farm.weed.energyCost', op: 'inc', value: -5, label: '−5% к стоимости прополки' }],
    links: ['farm_labor_8'],
    pos: { x: -12, y: 1 },
  },
];
