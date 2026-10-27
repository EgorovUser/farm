/**
 * DAILY-ПУЛ · заточка (M15.2, N8/N9): попытки/успехи/откат/отказ — уровни НЕ
 * в daily (N9: playerLevel глобален, вырождается в бесплатную награду).
 * Числа — стартовые (тюнюется, П6). Сборка пула — daily.ts.
 */
import type { QuestDef } from '../types';

export const DAILY_FORGE: QuestDef[] = [
  {
    id: 'qd_forge_warmup',
    kind: 'daily',
    name: 'Разогрев наковальни',
    steps: [
      {
        id: 'qd_forge_warmup_main',
        description: 'Сделай 3 попытки заточки',
        condition: { t: 'counterAtLeast', counter: 'forge.attempts', value: 3 },
        rewards: [
          { t: 'currency', id: 'gold', qty: 40 }, // тюнюется
          { t: 'xp', qty: 30 }, // тюнюется
        ],
      },
    ],
  },
  {
    id: 'qd_forge_marathon',
    kind: 'daily',
    name: 'Марафон заточки',
    steps: [
      {
        id: 'qd_forge_marathon_main',
        description: 'Сделай 6 попыток заточки за день',
        condition: { t: 'counterAtLeast', counter: 'forge.attempts', value: 6 },
        rewards: [
          { t: 'currency', id: 'gold', qty: 70 }, // тюнюется
          { t: 'currency', id: 'nails', qty: 4 }, // тюнюется
          { t: 'xp', qty: 45 }, // тюнюется
        ],
      },
    ],
  },
  {
    id: 'qd_forge_lucky',
    kind: 'daily',
    name: 'Уверенная рука',
    steps: [
      {
        id: 'qd_forge_lucky_main',
        description: 'Добейся 2 успешных заточек',
        condition: { t: 'counterAtLeast', counter: 'forge.success', value: 2 },
        rewards: [
          { t: 'currency', id: 'gold', qty: 60 }, // тюнюется
          { t: 'currency', id: 'nails', qty: 6 }, // сундучок ресурсов (тюнюется)
          { t: 'xp', qty: 40 }, // тюнюется
        ],
      },
    ],
  },
  {
    id: 'qd_forge_precision',
    kind: 'daily',
    name: 'Ювелирная точность',
    steps: [
      {
        id: 'qd_forge_precision_main',
        description: 'Добейся 4 успешных заточек за день',
        condition: { t: 'counterAtLeast', counter: 'forge.success', value: 4 },
        rewards: [
          { t: 'currency', id: 'gold', qty: 95 }, // тюнюется
          { t: 'xp', qty: 60 }, // тюнюется
        ],
      },
    ],
  },
  {
    id: 'qd_forge_price',
    kind: 'daily',
    name: 'Такова цена',
    steps: [
      {
        id: 'qd_forge_price_main',
        description: 'Переживи 1 откат уровня — мастерство не пропьёшь',
        condition: { t: 'counterAtLeast', counter: 'forge.rollback', value: 1 },
        rewards: [
          { t: 'currency', id: 'gold', qty: 45 }, // тюнюется (утешительный)
          { t: 'xp', qty: 35 }, // тюнюется
        ],
      },
    ],
  },
  {
    id: 'qd_forge_willpower',
    kind: 'daily',
    name: 'Железная воля',
    steps: [
      {
        id: 'qd_forge_willpower_main',
        description: 'Откажись от 1 карточки заточки (forge decline)',
        condition: { t: 'counterAtLeast', counter: 'forge.declines', value: 1 },
        rewards: [
          { t: 'currency', id: 'gold', qty: 35 }, // тюнюется
          { t: 'xp', qty: 25 }, // тюнюется
        ],
      },
    ],
  },
];
