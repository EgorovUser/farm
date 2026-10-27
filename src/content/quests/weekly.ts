/**
 * WEEKLY-ПУЛ M15.2 (карточка §3: «3 квеста-цепочки из 3–4 условий, крупные
 * награды»): 3 цепочки по 4 шага, шаги строго последовательно, прогресс
 * недели = счётчик − базовая линия недели (state.ts). Крупные награды:
 * passivePoint в финале (событие-канал M14, фаза 4) + предметы + золото.
 *
 * [DECISION · N7] купоны магазина НЕ введены (04-DISCOUNTS шов жив, но
 * Reward-типа «купон» в данных нет): отложено к M16 (биржа) — рекомендация
 * спеки принята; weekly-крупное фазы 2 = passivePoint/золото/предметы.
 * Числа — стартовые (тюнюется, П6).
 */
import type { QuestDef } from './types';

export const WEEKLY_QUESTS: QuestDef[] = [
  {
    id: 'qw_hardening_cycle',
    kind: 'weekly',
    name: 'Недельный цикл закалки',
    steps: [
      {
        id: 'qw_hardening_step1',
        description: 'Неделя мастера: скрафти 10 партий',
        condition: { t: 'counterAtLeast', counter: 'craft.batches', value: 10 },
        rewards: [{ t: 'currency', id: 'gold', qty: 120 }], // тюнюется
      },
      {
        id: 'qw_hardening_step2',
        description: 'Неделя заточки: 10 успешных заточек',
        condition: { t: 'counterAtLeast', counter: 'forge.success', value: 10 },
        rewards: [
          { t: 'currency', id: 'gold', qty: 150 }, // тюнюется
          { t: 'xp', qty: 120 }, // тюнюется
        ],
      },
      {
        id: 'qw_hardening_step3',
        description: 'Неделя торговли: продай 20 предметов',
        condition: { t: 'counterAtLeast', counter: 'sell.items', value: 20 },
        rewards: [{ t: 'currency', id: 'gold', qty: 150 }], // тюнюется
      },
      {
        id: 'qw_hardening_step4',
        description: 'Неделя завоза: 6 покупок в магазине',
        condition: { t: 'counterAtLeast', counter: 'shop.purchases', value: 6 },
        rewards: [
          { t: 'passivePoint', qty: 1 }, // очко пассивки — слушатель M14 (фаза 4)
          { t: 'xp', qty: 150 }, // тюнюется
          { t: 'item', defId: 'lucky_charm', qty: 1 }, // крупная награда (тюнюется)
        ],
      },
    ],
  },
  {
    id: 'qw_workshop_week',
    kind: 'weekly',
    name: 'Неделя мастерской',
    steps: [
      {
        id: 'qw_workshop_step1',
        description: 'Мастерская не молчит: скрафти 25 партий за неделю',
        condition: { t: 'counterAtLeast', counter: 'craft.batches', value: 25 },
        rewards: [{ t: 'currency', id: 'gold', qty: 200 }], // тюнюется
      },
      {
        id: 'qw_workshop_step2',
        description: 'Верстак и плавильня: 10 партий на верстаке',
        condition: { t: 'counterAtLeast', counter: 'craft.batches.workbench', value: 10 },
        rewards: [
          { t: 'currency', id: 'gold', qty: 150 }, // тюнюется
          { t: 'currency', id: 'planks', qty: 15 }, // тюнюется
        ],
      },
      {
        id: 'qw_workshop_step3',
        description: 'Металл зовёт: 6 партий в плавильне',
        condition: { t: 'counterAtLeast', counter: 'craft.batches.smelter', value: 6 },
        rewards: [
          { t: 'currency', id: 'gold', qty: 150 }, // тюнюется
          { t: 'currency', id: 'coal', qty: 12 }, // тюнюется
        ],
      },
      {
        id: 'qw_workshop_step4',
        description: 'Финишная прямая: примени 10 карточек заточки (успехи уровня)',
        condition: { t: 'counterAtLeast', counter: 'forge.cards', value: 10 },
        rewards: [
          { t: 'passivePoint', qty: 1 }, // слушатель M14 (фаза 4)
          { t: 'xp', qty: 180 }, // тюнюется
          { t: 'item', defId: 'warm_scarf', qty: 1 }, // крупная награда (тюнюется)
        ],
      },
    ],
  },
  {
    id: 'qw_market_week',
    kind: 'weekly',
    name: 'Неделя рынка',
    steps: [
      {
        id: 'qw_market_step1',
        description: 'Торговый путь: продай 60 предметов за неделю',
        condition: { t: 'counterAtLeast', counter: 'sell.items', value: 60 },
        rewards: [{ t: 'currency', id: 'gold', qty: 250 }], // тюнюется
      },
      {
        id: 'qw_market_step2',
        description: 'Город по тебе скучает: 20 покупок в магазине',
        condition: { t: 'counterAtLeast', counter: 'shop.purchases', value: 20 },
        rewards: [
          { t: 'currency', id: 'gold', qty: 200 }, // тюнюется
          { t: 'xp', qty: 150 }, // тюнюется
        ],
      },
      {
        id: 'qw_market_step3',
        description: 'Оптовые аппетиты: 80 единиц товара куплено суммарно',
        condition: { t: 'counterAtLeast', counter: 'shop.purchased.qty', value: 80 },
        rewards: [{ t: 'currency', id: 'gold', qty: 250 }], // тюнюется
      },
      {
        id: 'qw_market_step4',
        description: 'Товарооборот: добудь 150 предметов за неделю',
        condition: { t: 'counterAtLeast', counter: 'items.acquired', value: 150 },
        rewards: [
          { t: 'passivePoint', qty: 1 }, // слушатель M14 (фаза 4)
          { t: 'xp', qty: 200 }, // тюнюется
          { t: 'item', defId: 'woven_banner', qty: 1 }, // крупная награда (тюнюется)
        ],
      },
    ],
  },
];
