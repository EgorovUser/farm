/**
 * M14.2 «Дерево пассивик» — кластер ЭКОНОМИКА-МАГАЗИН (карточка §4: квота 25).
 * Существующие 2 (econ_luck_1, ks_orchestra) — НЕ переносятся; здесь 23 НОВЫХ
 * = 19 Small + 4 Notable: 2 + 23 = 25.
 *
 * Ветви (система карточки «цены/продажа/зарплата»; все четыре — от econ_luck_1,
 * keystone «Человек-оркестр» остаётся листом, как в M14.1):
 *  - ТОРГ: econ_trade_1..4 + Notable «Мастер торга» (скидки);
 *  - ПРОДАЖА: econ_sell_1..4 + Notable «Король рынка» (ставка продажи);
 *  - ЖАЛОВАНЬЕ: econ_wage_1..4 + Notable «Начальник артели» (зарплаты);
 *  - МАСТЕРСКИЕ/УДАЧА: econ_shop_1..7 + Notable «Сердце ярмарки».
 *
 * [DECISION op по пред-базе — канон FIX-RIVEN]: inc только на ненулевых базах
 * (shop.roll.discountChance 25, shop.roll.sizeMultPercent 30,
 * worker.salary.mult 100, action.craft/forge.energyCost); flat — на нулевых
 * (shop.luck.discount, shop.roll.luxuryCount, player.luck,
 * worker.salary.discount).
 *
 * [DECISION M142-зеркало]: shop.sell.ratePercent — НОВОЕ зеркало базы в
 * PASSIVES_BASES_TABLE (значение 40 = ECONOMY_TABLE.sellRatePercent «ставка
 * продажи 40%», прецедент worker.*-зеркал M14.1): резолв-уровень шины;
 * priceBus читает свою таблицу — поведенческая проводка = будущий сеанс
 * (бриф: «их код НЕ трогать»).
 */
import type { PassiveNodeDef } from './types';

/** кластер «Экономика и магазин» — 23 новых узла (квота 25 = 2 существующих + 23) */
export const ECONOMY_NODES: PassiveNodeDef[] = [
  // --- ветвь ТОРГ (от econ_luck_1): скидки магазина
  {
    id: 'econ_trade_1',
    name: 'Дар убеждения',
    kind: 'small',
    cluster: 'economy',
    cost: 1,
    mods: [{ stat: 'shop.luck.discount', op: 'flat', value: 5, label: '+5 к удаче скидок магазина' }],
    links: ['econ_luck_1'],
    pos: { x: 6, y: 6 },
  },
  {
    id: 'econ_trade_2',
    name: 'Слово торговца',
    kind: 'small',
    cluster: 'economy',
    cost: 1,
    mods: [{ stat: 'shop.luck.discount', op: 'flat', value: 5, label: '+5 к удаче скидок магазина' }],
    links: ['econ_trade_1'],
    pos: { x: 7, y: 6 },
  },
  {
    id: 'econ_trade_3',
    name: 'Репутация покупателя',
    kind: 'small',
    cluster: 'economy',
    cost: 1,
    mods: [{ stat: 'shop.roll.discountChance', op: 'inc', value: 5, label: '+5% к шансу скидки в ротации товара' }],
    links: ['econ_trade_2'],
    pos: { x: 8, y: 6 },
  },
  {
    id: 'econ_trade_4',
    name: 'Долгие переговоры',
    kind: 'small',
    cluster: 'economy',
    cost: 1,
    mods: [{ stat: 'shop.roll.discountChance', op: 'inc', value: 5, label: '+5% к шансу скидки в ротации товара' }],
    links: ['econ_trade_3'],
    pos: { x: 9, y: 6 },
  },
  {
    id: 'econ_haggle_n',
    name: 'Мастер торга',
    kind: 'notable',
    cluster: 'economy',
    cost: 10,
    mods: [
      { stat: 'shop.luck.discount', op: 'flat', value: 10, label: '+10 к удаче скидок магазина' },
      { stat: 'shop.roll.discountChance', op: 'inc', value: 10, label: '+10% к шансу скидки в ротации товара' },
    ],
    links: ['econ_trade_4'],
    pos: { x: 10, y: 6 },
    note: 'Notable = эффект-комбинация; цена 10 — [DECISION M142-цена]',
  },
  // --- ветвь ПРОДАЖА (от econ_luck_1): ставка и объёмы
  {
    id: 'econ_sell_1',
    name: 'Ярмарочный прилавок',
    kind: 'small',
    cluster: 'economy',
    cost: 1,
    mods: [{ stat: 'shop.sell.ratePercent', op: 'inc', value: 5, label: '+5% к ставке продажи (база 40%)' }],
    links: ['econ_luck_1'],
    pos: { x: 6, y: 7 },
  },
  {
    id: 'econ_sell_2',
    name: 'Заманчивая витрина',
    kind: 'small',
    cluster: 'economy',
    cost: 1,
    mods: [{ stat: 'shop.sell.ratePercent', op: 'inc', value: 5, label: '+5% к ставке продажи (база 40%)' }],
    links: ['econ_sell_1'],
    pos: { x: 7, y: 7 },
  },
  {
    id: 'econ_sell_3',
    name: 'Оптовик',
    kind: 'small',
    cluster: 'economy',
    cost: 1,
    mods: [{ stat: 'shop.roll.sizeMultPercent', op: 'inc', value: 10, label: '+10% к размеру партии товара' }],
    links: ['econ_sell_2'],
    pos: { x: 8, y: 7 },
  },
  {
    id: 'econ_sell_4',
    name: 'Роскошный ассортимент',
    kind: 'small',
    cluster: 'economy',
    cost: 1,
    mods: [{ stat: 'shop.roll.luxuryCount', op: 'flat', value: 1, label: '+1 к числу предметов роскоши в ротации' }],
    links: ['econ_sell_3'],
    pos: { x: 9, y: 7 },
  },
  {
    id: 'econ_market_n',
    name: 'Король рынка',
    kind: 'notable',
    cluster: 'economy',
    cost: 10,
    mods: [
      { stat: 'shop.sell.ratePercent', op: 'inc', value: 15, label: '+15% к ставке продажи (база 40%)' },
      { stat: 'shop.roll.luxuryCount', op: 'flat', value: 1, label: '+1 к числу предметов роскоши в ротации' },
    ],
    links: ['econ_sell_4'],
    pos: { x: 10, y: 7 },
    note: 'Notable = эффект-комбинация; цена 10 — [DECISION M142-цена]',
  },
  // --- ветвь ЖАЛОВАНЬЕ (от econ_luck_1): расходы на работников
  {
    id: 'econ_wage_1',
    name: 'Твёрдая рука кассира',
    kind: 'small',
    cluster: 'economy',
    cost: 1,
    mods: [{ stat: 'worker.salary.mult', op: 'inc', value: -5, label: '−5% к зарплатам работников' }],
    links: ['econ_luck_1'],
    pos: { x: 6, y: 8 },
  },
  {
    id: 'econ_wage_2',
    name: 'Грамотный договор',
    kind: 'small',
    cluster: 'economy',
    cost: 1,
    mods: [{ stat: 'worker.salary.discount', op: 'flat', value: 5, label: '+5% к скидке на зарплату' }],
    links: ['econ_wage_1'],
    pos: { x: 7, y: 8 },
  },
  {
    id: 'econ_wage_3',
    name: 'Умеренные аппетиты',
    kind: 'small',
    cluster: 'economy',
    cost: 1,
    mods: [{ stat: 'worker.salary.mult', op: 'inc', value: -5, label: '−5% к зарплатам работников' }],
    links: ['econ_wage_2'],
    pos: { x: 8, y: 8 },
  },
  {
    id: 'econ_wage_4',
    name: 'Артельная касса',
    kind: 'small',
    cluster: 'economy',
    cost: 1,
    mods: [{ stat: 'worker.salary.discount', op: 'flat', value: 5, label: '+5% к скидке на зарплату' }],
    links: ['econ_wage_3'],
    pos: { x: 9, y: 8 },
  },
  {
    id: 'econ_foreman_n',
    name: 'Начальник артели',
    kind: 'notable',
    cluster: 'economy',
    cost: 10,
    mods: [
      { stat: 'worker.salary.mult', op: 'inc', value: -10, label: '−10% к зарплатам работников' },
      { stat: 'worker.salary.discount', op: 'flat', value: 10, label: '+10% к скидке на зарплату' },
    ],
    links: ['econ_wage_4'],
    pos: { x: 10, y: 8 },
    note: 'Notable = эффект-комбинация; цена 10 — [DECISION M142-цена]; компонируется с «Гуманистом» (inc складываются — канон шины)',
  },
  // --- ветвь МАСТЕРСКИЕ/УДАЧА (от econ_luck_1): энергия ремёсел и удача
  {
    id: 'econ_shop_1',
    name: 'Ловкий счёт',
    kind: 'small',
    cluster: 'economy',
    cost: 1,
    mods: [{ stat: 'player.luck', op: 'flat', value: 1, label: '+1 к удаче игрока' }],
    links: ['econ_luck_1'],
    pos: { x: 6, y: 9 },
  },
  {
    id: 'econ_shop_2',
    name: 'Купеческая смекалка',
    kind: 'small',
    cluster: 'economy',
    cost: 1,
    mods: [{ stat: 'player.luck', op: 'flat', value: 1, label: '+1 к удаче игрока' }],
    links: ['econ_shop_1'],
    pos: { x: 7, y: 9 },
  },
  {
    id: 'econ_shop_3',
    name: 'Экономный верстак',
    kind: 'small',
    cluster: 'economy',
    cost: 1,
    mods: [{ stat: 'action.craft.make.energyCost', op: 'inc', value: -5, label: '−5% к стоимости крафта' }],
    links: ['econ_shop_2'],
    pos: { x: 8, y: 9 },
  },
  {
    id: 'econ_shop_4',
    name: 'Лёгкий молот',
    kind: 'small',
    cluster: 'economy',
    cost: 1,
    mods: [{ stat: 'action.forge.sharpen.energyCost', op: 'inc', value: -5, label: '−5% к стоимости заточки' }],
    links: ['econ_shop_3'],
    pos: { x: 9, y: 9 },
  },
  {
    id: 'econ_shop_5',
    name: 'Сноровистый подмастерье',
    kind: 'small',
    cluster: 'economy',
    cost: 1,
    mods: [{ stat: 'action.craft.make.energyCost', op: 'inc', value: -5, label: '−5% к стоимости крафта' }],
    links: ['econ_shop_4'],
    pos: { x: 10, y: 9 },
  },
  {
    id: 'econ_shop_6',
    name: 'Деловая хватка',
    kind: 'small',
    cluster: 'economy',
    cost: 1,
    mods: [{ stat: 'shop.roll.sizeMultPercent', op: 'inc', value: 10, label: '+10% к размеру партии товара' }],
    links: ['econ_shop_5'],
    pos: { x: 11, y: 9 },
  },
  {
    id: 'econ_shop_7',
    name: 'Обстоятельный расчёт',
    kind: 'small',
    cluster: 'economy',
    cost: 1,
    mods: [{ stat: 'action.forge.sharpen.energyCost', op: 'inc', value: -5, label: '−5% к стоимости заточки' }],
    links: ['econ_shop_6'],
    pos: { x: 12, y: 9 },
  },
  {
    id: 'econ_fair_n',
    name: 'Сердце ярмарки',
    kind: 'notable',
    cluster: 'economy',
    cost: 10,
    mods: [
      { stat: 'player.luck', op: 'flat', value: 2, label: '+2 к удаче игрока' },
      { stat: 'shop.roll.sizeMultPercent', op: 'inc', value: 15, label: '+15% к размеру партии товара' },
    ],
    links: ['econ_shop_7'],
    pos: { x: 13, y: 9 },
    note: 'Notable = эффект-комбинация; цена 10 — [DECISION M142-цена]',
  },
];
