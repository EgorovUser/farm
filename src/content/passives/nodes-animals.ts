/**
 * M14.2 «Дерево пассивик» — кластер ЖИВОТНЫЕ-ЗАГОН (карточка §4: квота 20).
 * Существующие 3 (pen_happy_1, lake_mut_1, ks_humanist) — НЕ переносятся;
 * здесь 17 НОВЫХ = 13 Small + 4 Notable: 3 + 17 = 20.
 *
 * Ветви (система карточки «продукция/уход/разведение»; A/B/C — от pen_happy_1,
 * D — от lake_mut_1 «Терпеливый разводчик», keystone «Гуманист» остаётся
 * листом, как в M14.1):
 *  - ПРОДУКЦИЯ: pen_happy_2..4 + Notable «Душа загона»;
 *  - УХОД: pen_care_1..4 + Notable «Пастырь»;
 *  - ЗДОРОВЬЕ: pen_heal_1..3 + Notable «Крепкое здоровье»;
 *  - РАЗВЕДЕНИЕ: pen_mut_1..3 + Notable «Отец всех рыб».
 *
 * [DECISION op по пред-базе — канон FIX-RIVEN]: inc только на ненулевых базах
 * (pen.sickness.chancePercent 2 [зеркало], worker.sickChance 2,
 * worker.quitChance 10, action.pen.*.energyCost); flat — на нулевых
 * (pen.happiness.bonus, worker.care.bonus, worker.mood.aura,
 * lake.mutation.plus1Bonus).
 *
 * [DECISION M142-зеркало]: pen.sickness.chancePercent — НОВОЕ зеркало базы в
 * PASSIVES_BASES_TABLE (значение 2 = PEN_TABLE.sickness.base 0.02/день,
 * прецедент worker.sickChance M14.1): резолв-уровень шины; загон читает свою
 * таблицу — поведенческая проводка = будущий сеанс (бриф: «их код НЕ трогать»).
 */
import type { PassiveNodeDef } from './types';

/** кластер «Животные и загон» — 17 новых узлов (квота 20 = 3 существующих + 17) */
export const ANIMALS_NODES: PassiveNodeDef[] = [
  // --- ветвь ПРОДУКЦИЯ (от pen_happy_1): счастье и сбор продукции
  {
    id: 'pen_happy_2',
    name: 'Тёплый загон',
    kind: 'small',
    cluster: 'animals',
    cost: 1,
    mods: [{ stat: 'pen.happiness.bonus', op: 'flat', value: 5, label: '+5 к счастью животных' }],
    links: ['pen_happy_1'],
    pos: { x: 6, y: 3 },
  },
  {
    id: 'pen_happy_3',
    name: 'Ласковый голос',
    kind: 'small',
    cluster: 'animals',
    cost: 1,
    mods: [{ stat: 'pen.happiness.bonus', op: 'flat', value: 5, label: '+5 к счастью животных' }],
    links: ['pen_happy_2'],
    pos: { x: 7, y: 3 },
  },
  {
    id: 'pen_happy_4',
    name: 'Вкусные добавки',
    kind: 'small',
    cluster: 'animals',
    cost: 1,
    mods: [{ stat: 'pen.happiness.bonus', op: 'flat', value: 10, label: '+10 к счастью животных' }],
    links: ['pen_happy_3'],
    pos: { x: 8, y: 3 },
  },
  {
    id: 'pen_soul_n',
    name: 'Душа загона',
    kind: 'notable',
    cluster: 'animals',
    cost: 10,
    mods: [
      { stat: 'pen.happiness.bonus', op: 'flat', value: 15, label: '+15 к счастью животных' },
      { stat: 'action.pen.collect.energyCost', op: 'inc', value: -25, label: '−25% к стоимости сбора продукции' },
    ],
    links: ['pen_happy_4'],
    pos: { x: 9, y: 3 },
    note: 'Notable = эффект-комбинация; цена 10 — [DECISION M142-цена]',
  },
  // --- ветвь УХОД (от pen_happy_1): работники рядом с животными
  {
    id: 'pen_care_1',
    name: 'Забота без выходных',
    kind: 'small',
    cluster: 'animals',
    cost: 1,
    mods: [{ stat: 'worker.care.bonus', op: 'flat', value: 5, label: '+5 к бонусу ухода работника' }],
    links: ['pen_happy_1'],
    pos: { x: 6, y: 2 },
  },
  {
    id: 'pen_care_2',
    name: 'Чуткость к зверью',
    kind: 'small',
    cluster: 'animals',
    cost: 1,
    mods: [{ stat: 'worker.care.bonus', op: 'flat', value: 5, label: '+5 к бонусу ухода работника' }],
    links: ['pen_care_1'],
    pos: { x: 7, y: 2 },
  },
  {
    id: 'pen_care_3',
    name: 'Свисток для своих',
    kind: 'small',
    cluster: 'animals',
    cost: 1,
    mods: [{ stat: 'worker.mood.aura', op: 'flat', value: 5, label: '+5 к ауре настроения работника' }],
    links: ['pen_care_2'],
    pos: { x: 8, y: 2 },
  },
  {
    id: 'pen_care_4',
    name: 'Добрая песня',
    kind: 'small',
    cluster: 'animals',
    cost: 1,
    mods: [{ stat: 'worker.mood.aura', op: 'flat', value: 5, label: '+5 к ауре настроения работника' }],
    links: ['pen_care_3'],
    pos: { x: 9, y: 2 },
  },
  {
    id: 'pen_shepherd_n',
    name: 'Пастырь',
    kind: 'notable',
    cluster: 'animals',
    cost: 10,
    mods: [
      { stat: 'worker.care.bonus', op: 'flat', value: 10, label: '+10 к бонусу ухода работника' },
      { stat: 'worker.mood.aura', op: 'flat', value: 10, label: '+10 к ауре настроения работника' },
    ],
    links: ['pen_care_4'],
    pos: { x: 10, y: 2 },
    note: 'Notable = эффект-комбинация; цена 10 — [DECISION M142-цена]',
  },
  // --- ветвь ЗДОРОВЬЕ (от pen_happy_1): болезни загона и работников
  {
    id: 'pen_heal_1',
    name: 'Чистая подстилка',
    kind: 'small',
    cluster: 'animals',
    cost: 1,
    mods: [
      { stat: 'pen.sickness.chancePercent', op: 'inc', value: -5, label: '−5% к шансу заболевания животного' },
    ],
    links: ['pen_happy_1'],
    pos: { x: 6, y: 1 },
  },
  {
    id: 'pen_heal_2',
    name: 'Свежая вода',
    kind: 'small',
    cluster: 'animals',
    cost: 1,
    mods: [
      { stat: 'pen.sickness.chancePercent', op: 'inc', value: -5, label: '−5% к шансу заболевания животного' },
    ],
    links: ['pen_heal_1'],
    pos: { x: 7, y: 1 },
  },
  {
    id: 'pen_heal_3',
    name: 'Ветеринар в доле',
    kind: 'small',
    cluster: 'animals',
    cost: 1,
    mods: [{ stat: 'worker.sickChance', op: 'inc', value: -10, label: '−10% к шансу болезни работника' }],
    links: ['pen_heal_2'],
    pos: { x: 8, y: 1 },
  },
  {
    id: 'pen_health_n',
    name: 'Крепкое здоровье',
    kind: 'notable',
    cluster: 'animals',
    cost: 10,
    mods: [
      { stat: 'pen.sickness.chancePercent', op: 'inc', value: -15, label: '−15% к шансу заболевания животного' },
      { stat: 'worker.quitChance', op: 'inc', value: -10, label: '−10% к шансу увольнения работника' },
    ],
    links: ['pen_heal_3'],
    pos: { x: 9, y: 1 },
    note: 'Notable = эффект-комбинация; цена 10 — [DECISION M142-цена]; «Гуманист»-override сильнее inc — канон 02 §2',
  },
  // --- ветвь РАЗВЕДЕНИЕ (от lake_mut_1): мутации потомства
  {
    id: 'pen_mut_1',
    name: 'Тёплая вода',
    kind: 'small',
    cluster: 'animals',
    cost: 1,
    mods: [
      { stat: 'lake.mutation.plus1Bonus', op: 'flat', value: 0.05, label: '+0.05 к шансу мутации +1 тир' },
    ],
    links: ['lake_mut_1'],
    pos: { x: 7, y: 5 },
  },
  {
    id: 'pen_mut_2',
    name: 'Минеральные корма',
    kind: 'small',
    cluster: 'animals',
    cost: 1,
    mods: [
      { stat: 'lake.mutation.plus1Bonus', op: 'flat', value: 0.05, label: '+0.05 к шансу мутации +1 тир' },
    ],
    links: ['pen_mut_1'],
    pos: { x: 8, y: 5 },
  },
  {
    id: 'pen_mut_3',
    name: 'Гены великанов',
    kind: 'small',
    cluster: 'animals',
    cost: 1,
    mods: [
      { stat: 'lake.mutation.plus1Bonus', op: 'flat', value: 0.1, label: '+0.1 к шансу мутации +1 тир' },
    ],
    links: ['pen_mut_2'],
    pos: { x: 9, y: 5 },
  },
  {
    id: 'pen_father_n',
    name: 'Отец всех рыб',
    kind: 'notable',
    cluster: 'animals',
    cost: 10,
    mods: [
      { stat: 'lake.mutation.plus1Bonus', op: 'flat', value: 0.15, label: '+0.15 к шансу мутации +1 тир' },
      { stat: 'pen.happiness.bonus', op: 'flat', value: 10, label: '+10 к счастью животных' },
    ],
    links: ['pen_mut_3'],
    pos: { x: 10, y: 5 },
    note: 'Notable = эффект-комбинация; цена 10 — [DECISION M142-цена]',
  },
];
