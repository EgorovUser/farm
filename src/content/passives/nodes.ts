/**
 * M14 «Дерево пассивик» — узлы и рёбра (карточка M14 §3–§4; бриф SESSION-M14
 * F2/F6). КОНТЕНТ сеанса M14.1 = стартовое ядро 20 узлов (энергия, инвентарь,
 * XP) + минимальные представители КАЖДОГО кластера полного дерева M14.2
 * (Фермерство / Рыбалка-озеро / Бой-шахта / Экономика / Животные) + keystone
 * ×4. ПОЛНОЕ дерево 150 узлов — M14.2 (замок этого сеанса).
 *
 * Типы узлов (карточка §3): Small (мелкие модификаторы) / Notable («+1 слот
 * инвентаря», «+1 слот помощника», «Идеальный полив», «Золотая жила») /
 * Keystone ×4 — «комбинация модификаторов override/inc/more — БЕЗ спец-кода»
 * (приёмка §6: в коде модуля НЕТ слов «магнат/гуманист/спартанец/оркестр» —
 * rg-оракул; имена живут ЗДЕСЬ, в данных).
 *
 * [DECISION · op по пред-базе — канон FIX-RIVEN] inc на нулевой базе
 * инертен: «Рудный магнат» — руда через flat +100 на mine.oreYield (база 0),
 * клёв «вдвое реже» через flat −100 на fishing.bite.speed (база 0; ожидание
 * = rolled × (1 − speed/100) → ×2 — частота клёва −50%, дословно «вдвое
 * реже клюёт» карточки). Прецедент: providers.ts M13 `op: baseOf(stat) === 0
 * ? 'flat' : 'inc'`.
 *
 * [DECISION · Спартанец = override 50 + inc −50 × ВСЕ 17 статов расходов]
 * «inc −50% на ВСЕ расходы энергии» — модификатор имеет один стат, поэтому
 * узел перечисляет все 17 action.*.energyCost базами данных (П1: контент, не
 * код). override 50 на player.energy.max — пример канона 02-BUSES §3
 * (побеждает flats/inc — «замена есть замена»; priority 10 — «высокий»
 * по примеру канона).
 *
 * [DECISION · Идеальный полив = override 0, эффективно 1] override 0 на
 * action.farm.water.energyCost клампится meta.min=1 (канон M01 «действие не
 * бесплатно»; прецедент withWorkerEnergy M11.2: «override-0 не проходит
 * сквозь meta.min=1»). Полив 2 → 1 (−50%), НЕ 0 — витрина честна, модификатор
 * дословно по карточке («override 0 на стат полива»).
 *
 * [DECISION · кластеры keystone] «Спартанец» — core (энергия), «Рудный
 * магнат» — mine, «Гуманист» — animals (уход/загон/работники), «Человек-
 * оркестр» — economy. Стоимость: small 1 / notable 2 / keystone 1 (PoE-канон:
 * keystone — «большой эффект за большой штраф», плата — сам компромисс).
 *
 * Рёбра: links перечисляются с любой из вершин, граф НЕориентированный
 * (смежность = объединение). pos — данные для UI-зума (фаза 6, M18; здесь —
 * только хранятся). Валидация: каждый узел достижим из старта (BFS) —
 * висячие узлы/недостижимые кластеры = ошибка загрузки (schemas.ts).
 */
import type { PassiveNodeDef, PassivesTree } from './types';

/** стартовое ядро — 20 узлов (энергия/инвентарь/XP) + якорь старта */
const CORE_NODES: PassiveNodeDef[] = [
  {
    id: 'core_start',
    name: 'Корни',
    kind: 'small',
    cluster: 'core',
    cost: 0,
    mods: [],
    links: ['core_energy_1', 'core_hp_1', 'core_xp_1', 'farm_growth_1'],
    pos: { x: 0, y: 0 },
    note: 'старт-узел: достижим всегда, выделения не требует',
  },
  // --- ветвь энергии (5)
  {
    id: 'core_energy_1',
    name: 'Крепкий сон',
    kind: 'small',
    cluster: 'core',
    cost: 1,
    mods: [{ stat: 'player.energy.max', op: 'flat', value: 5, label: '+5 к максимуму энергии' }],
    links: ['core_energy_2'],
    pos: { x: 1, y: -3 },
  },
  {
    id: 'core_energy_2',
    name: 'Второе дыхание',
    kind: 'small',
    cluster: 'core',
    cost: 1,
    mods: [{ stat: 'player.energy.max', op: 'flat', value: 10, label: '+10 к максимуму энергии' }],
    links: ['core_energy_3', 'core_fish_cost'],
    pos: { x: 2, y: -3 },
  },
  {
    id: 'core_energy_3',
    name: 'Жаворонок',
    kind: 'small',
    cluster: 'core',
    cost: 1,
    mods: [
      { stat: 'player.energy.regenPerMinute', op: 'flat', value: 0.05, label: '+0.05 к регену энергии в минуту' },
    ],
    links: ['core_energy_4', 'core_mine_cost'],
    pos: { x: 3, y: -3 },
  },
  {
    id: 'core_energy_4',
    name: 'Сила воли',
    kind: 'small',
    cluster: 'core',
    cost: 1,
    mods: [{ stat: 'player.energy.max', op: 'flat', value: 10, label: '+10 к максимуму энергии' }],
    links: ['core_energy_5'],
    pos: { x: 4, y: -3 },
  },
  {
    id: 'core_energy_5',
    name: 'Размеренный ритм',
    kind: 'small',
    cluster: 'core',
    cost: 1,
    mods: [
      { stat: 'player.energy.regenPerMinute', op: 'inc', value: 10, label: '+10% к регену энергии' },
    ],
    links: ['ks_spartan'],
    pos: { x: 5, y: -3 },
  },
  // --- ветвь здоровья (4)
  {
    id: 'core_hp_1',
    name: 'Здоровяк',
    kind: 'small',
    cluster: 'core',
    cost: 1,
    mods: [{ stat: 'player.hp.max', op: 'flat', value: 5, label: '+5 к максимуму HP' }],
    links: ['core_hp_2'],
    pos: { x: 1, y: 0 },
  },
  {
    id: 'core_hp_2',
    name: 'Дубовая кожа',
    kind: 'small',
    cluster: 'core',
    cost: 1,
    mods: [{ stat: 'player.hp.max', op: 'flat', value: 10, label: '+10 к максимуму HP' }],
    links: ['core_hp_3', 'core_craft_cost'],
    pos: { x: 2, y: 0 },
  },
  {
    id: 'core_hp_3',
    name: 'Живучесть',
    kind: 'small',
    cluster: 'core',
    cost: 1,
    mods: [{ stat: 'player.hp.regenPerMinute', op: 'flat', value: 0.05, label: '+0.05 к регену HP в минуту' }],
    links: ['core_hp_4'],
    pos: { x: 3, y: 0 },
  },
  {
    id: 'core_hp_4',
    name: 'Закалка',
    kind: 'small',
    cluster: 'core',
    cost: 1,
    mods: [{ stat: 'player.hp.max', op: 'flat', value: 10, label: '+10 к максимуму HP' }],
    links: [],
    pos: { x: 4, y: 0 },
  },
  // --- ветвь учения (3)
  {
    id: 'core_xp_1',
    name: 'Любознательность',
    kind: 'small',
    cluster: 'core',
    cost: 1,
    mods: [{ stat: 'player.xp.mult', op: 'inc', value: 5, label: '+5% к получаемому опыту' }],
    links: ['core_xp_2'],
    pos: { x: 1, y: 3 },
  },
  {
    id: 'core_xp_2',
    name: 'Быстрая учёба',
    kind: 'small',
    cluster: 'core',
    cost: 1,
    mods: [{ stat: 'player.xp.mult', op: 'inc', value: 10, label: '+10% к получаемому опыту' }],
    links: ['core_xp_3', 'core_inv_slots'],
    pos: { x: 2, y: 3 },
  },
  {
    id: 'core_xp_3',
    name: 'Мудрость годов',
    kind: 'small',
    cluster: 'core',
    cost: 1,
    mods: [{ stat: 'player.xp.mult', op: 'inc', value: 5, label: '+5% к получаемому опыту' }],
    links: ['core_xp_4'],
    pos: { x: 3, y: 3 },
  },
  {
    id: 'core_xp_4',
    name: 'Наставник',
    kind: 'small',
    cluster: 'core',
    cost: 1,
    mods: [{ stat: 'player.xp.mult', op: 'inc', value: 5, label: '+5% к получаемому опыту' }],
    links: [],
    pos: { x: 4, y: 3 },
  },
  // --- инвентарь/помощники/удача (Notable ×2 + Small)
  {
    id: 'core_inv_slots',
    name: 'Просторный рюкзак',
    kind: 'notable',
    cluster: 'core',
    cost: 2,
    mods: [{ stat: 'player.inventory.slots', op: 'flat', value: 1, label: '+1 слот инвентаря' }],
    links: ['core_helper_slot', 'core_luck'],
    pos: { x: 3, y: 4 },
    note: 'модификатор инвентарного стата — M02 не правится (бриф F2)',
  },
  {
    id: 'core_helper_slot',
    name: 'Верный товарищ',
    kind: 'notable',
    cluster: 'core',
    cost: 2,
    mods: [{ stat: 'mine.helperSlots.bonus', op: 'flat', value: 1, label: '+1 слот помощника' }],
    links: ['pen_happy_1'],
    pos: { x: 4, y: 4 },
    note: 'слот отряда: старт 1 + Отряд (кап 3, M13.2) — бонус-стат шины',
  },
  {
    id: 'core_luck',
    name: 'Талисман',
    kind: 'small',
    cluster: 'core',
    cost: 1,
    mods: [{ stat: 'player.luck', op: 'flat', value: 1, label: '+1 к удаче игрока' }],
    links: ['econ_luck_1'],
    pos: { x: 4, y: 5 },
  },
  // --- расходы действий (энергия-домен ядра)
  {
    id: 'core_mine_cost',
    name: 'Шахтёрская выносливость',
    kind: 'small',
    cluster: 'core',
    cost: 1,
    mods: [
      { stat: 'action.mine.enter.energyCost', op: 'inc', value: -10, label: '−10% к стоимости входа в шахту' },
    ],
    links: ['mine_ore_1'],
    pos: { x: 4, y: -4 },
  },
  {
    id: 'core_fish_cost',
    name: 'Экономный заброс',
    kind: 'small',
    cluster: 'core',
    cost: 1,
    mods: [
      { stat: 'action.fishing.cast.energyCost', op: 'inc', value: -10, label: '−10% к стоимости заброса' },
    ],
    links: ['fish_luck_1'],
    pos: { x: 3, y: -4 },
  },
  {
    id: 'core_craft_cost',
    name: 'Умелые руки',
    kind: 'small',
    cluster: 'core',
    cost: 1,
    mods: [
      { stat: 'action.craft.make.energyCost', op: 'inc', value: -10, label: '−10% к стоимости крафта' },
    ],
    links: [],
    pos: { x: 3, y: 1 },
  },
];

/** keystone ×4 — комбинации модификаторов, БЕЗ спец-кода (карточка §3) */
const KEYSTONE_NODES: PassiveNodeDef[] = [
  {
    id: 'ks_spartan',
    name: 'Спартанец',
    kind: 'keystone',
    cluster: 'core',
    cost: 1,
    mods: [
      {
        stat: 'player.energy.max',
        op: 'override',
        value: 50,
        priority: 10,
        label: 'максимум энергии = 50 (замена; flats/inc этой ветки не применяются)',
      },
      // inc −50% на ВСЕ расходы энергии: 17 статов баз данных (см. шапку)
      { stat: 'action.farm.plow.energyCost', op: 'inc', value: -50, label: '−50% к стоимости вспашки' },
      { stat: 'action.farm.plant.energyCost', op: 'inc', value: -50, label: '−50% к стоимости посадки' },
      { stat: 'action.farm.water.energyCost', op: 'inc', value: -50, label: '−50% к стоимости полива' },
      { stat: 'action.farm.weed.energyCost', op: 'inc', value: -50, label: '−50% к стоимости прополки' },
      { stat: 'action.farm.harvest.energyCost', op: 'inc', value: -50, label: '−50% к стоимости сбора' },
      { stat: 'action.fishing.cast.energyCost', op: 'inc', value: -50, label: '−50% к стоимости заброса' },
      { stat: 'action.pen.feed.energyCost', op: 'inc', value: -50, label: '−50% к стоимости кормления' },
      { stat: 'action.pen.clean.energyCost', op: 'inc', value: -50, label: '−50% к стоимости чистки' },
      { stat: 'action.pen.collect.energyCost', op: 'inc', value: -50, label: '−50% к стоимости сбора продукции' },
      { stat: 'action.pen.pet.energyCost', op: 'inc', value: -50, label: '−50% к стоимости глажения' },
      { stat: 'action.pen.heal.energyCost', op: 'inc', value: -50, label: '−50% к стоимости лечения' },
      { stat: 'action.lake.feed.energyCost', op: 'inc', value: -50, label: '−50% к стоимости кормления рыб' },
      { stat: 'action.lake.clean.energyCost', op: 'inc', value: -50, label: '−50% к стоимости чистки озера' },
      { stat: 'action.mine.enter.energyCost', op: 'inc', value: -50, label: '−50% к стоимости входа в шахту' },
      { stat: 'action.combat.hit.energyCost', op: 'inc', value: -50, label: '−50% к стоимости удара' },
      { stat: 'action.craft.make.energyCost', op: 'inc', value: -50, label: '−50% к стоимости крафта' },
      { stat: 'action.forge.sharpen.energyCost', op: 'inc', value: -50, label: '−50% к стоимости заточки' },
    ],
    links: [],
    pos: { x: 6, y: -3 },
  },
  {
    id: 'ks_magnate',
    name: 'Рудный магнат',
    kind: 'keystone',
    cluster: 'mine',
    cost: 1,
    mods: [
      { stat: 'mine.oreYield', op: 'flat', value: 100, label: '+100% к добыче руды' },
      { stat: 'fishing.bite.speed', op: 'flat', value: -100, label: 'клёв вдвое реже (ожидание ×2)' },
    ],
    links: [],
    pos: { x: 7, y: -4 },
  },
  {
    id: 'ks_humanist',
    name: 'Гуманист',
    kind: 'keystone',
    cluster: 'animals',
    cost: 1,
    mods: [
      { stat: 'worker.quitChance', op: 'override', value: 0, priority: 10, label: 'работники не увольняются' },
      { stat: 'worker.sickChance', op: 'override', value: 0, priority: 10, label: 'работники не болеют' },
      { stat: 'worker.salary.mult', op: 'inc', value: 30, label: 'зарплаты +30%' },
    ],
    links: [],
    pos: { x: 7, y: 4 },
  },
  {
    id: 'ks_orchestra',
    name: 'Человек-оркестр',
    kind: 'keystone',
    cluster: 'economy',
    cost: 1,
    mods: [
      { stat: 'worker.limitPerObject', op: 'flat', value: 1, label: '+1 работник на объект' },
      { stat: 'farm.harvest.mult', op: 'inc', value: -25, label: 'личный сбор урожая −25%' },
    ],
    links: [],
    pos: { x: 6, y: 5 },
  },
];

/** минимальные представители кластеров полного дерева (M14.2 — замок) */
const CLUSTER_NODES: PassiveNodeDef[] = [
  // --- Фермерство
  {
    id: 'farm_growth_1',
    name: 'Зелёный палец',
    kind: 'small',
    cluster: 'farm',
    cost: 1,
    mods: [{ stat: 'farm.growthSpeed', op: 'inc', value: 5, label: '+5% к скорости роста' }],
    links: ['farm_growth_2'],
    pos: { x: -1, y: 3 },
  },
  {
    id: 'farm_growth_2',
    name: 'Плодородие',
    kind: 'small',
    cluster: 'farm',
    cost: 1,
    mods: [{ stat: 'farm.growthSpeed', op: 'inc', value: 5, label: '+5% к скорости роста' }],
    links: ['farm_water'],
    pos: { x: -2, y: 3 },
  },
  {
    id: 'farm_water',
    name: 'Идеальный полив',
    kind: 'notable',
    cluster: 'farm',
    cost: 1,
    mods: [
      {
        stat: 'action.farm.water.energyCost',
        op: 'override',
        value: 0,
        priority: 10,
        label: 'полив бесплатно (override 0; не дешевле 1 — канон M01 min)',
      },
    ],
    links: [],
    pos: { x: -3, y: 3 },
  },
  // --- Рыбалка и озеро
  {
    id: 'fish_luck_1',
    name: 'Чутьё на редкость',
    kind: 'small',
    cluster: 'fish',
    cost: 1,
    mods: [{ stat: 'fishing.luck.rare', op: 'flat', value: 5, label: '+5 к удаче редкой рыбы' }],
    links: ['fish_luck_2'],
    pos: { x: 2, y: -5 },
  },
  {
    id: 'fish_luck_2',
    name: 'Секретные места',
    kind: 'small',
    cluster: 'fish',
    cost: 1,
    mods: [{ stat: 'fishing.luck.rare', op: 'flat', value: 5, label: '+5 к удаче редкой рыбы' }],
    links: [],
    pos: { x: 1, y: -5 },
  },
  // --- Бой и шахта
  {
    id: 'mine_ore_1',
    name: 'Золотая жила',
    kind: 'notable',
    cluster: 'mine',
    cost: 2,
    mods: [{ stat: 'mine.oreYield', op: 'flat', value: 25, label: '+25% к добыче руды' }],
    links: ['mine_crit_1'],
    pos: { x: 5, y: -4 },
  },
  {
    id: 'mine_crit_1',
    name: 'Меткий глаз',
    kind: 'small',
    cluster: 'mine',
    cost: 1,
    mods: [{ stat: 'mine.crit', op: 'flat', value: 2, label: '+2% к шансу крита' }],
    links: ['ks_magnate'],
    pos: { x: 6, y: -4 },
  },
  // --- Экономика и магазин
  {
    id: 'econ_luck_1',
    name: 'Нос для выгоды',
    kind: 'small',
    cluster: 'economy',
    cost: 1,
    mods: [{ stat: 'shop.luck.discount', op: 'flat', value: 5, label: '+5 к удаче скидок магазина' }],
    links: ['ks_orchestra'],
    pos: { x: 5, y: 5 },
  },
  // --- Животные и загон
  {
    id: 'pen_happy_1',
    name: 'Заботливый хозяин',
    kind: 'small',
    cluster: 'animals',
    cost: 1,
    mods: [{ stat: 'pen.happiness.bonus', op: 'flat', value: 5, label: '+5 к счастью животных' }],
    links: ['lake_mut_1'],
    pos: { x: 5, y: 4 },
  },
  {
    id: 'lake_mut_1',
    name: 'Терпеливый разводчик',
    kind: 'small',
    cluster: 'animals',
    cost: 1,
    mods: [
      { stat: 'lake.mutation.plus1Bonus', op: 'flat', value: 0.05, label: '+0.05 к шансу мутации +1 тир' },
    ],
    links: ['ks_humanist'],
    pos: { x: 6, y: 4 },
  },
];

/** дерево M14.1: 20 ядра + 4 keystone + 10 представителей = 34 узла */
export const PASSIVES_TREE: PassivesTree = {
  startNodes: ['core_start'],
  nodes: [...CORE_NODES, ...KEYSTONE_NODES, ...CLUSTER_NODES],
};
