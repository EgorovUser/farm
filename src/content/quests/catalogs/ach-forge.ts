/**
 * АЧИВКИ · заточка (M15.2, карточка §5): успехи/попытки/откаты/отказы/карточки.
 * hidden-пасхалки: «Скромность» (три отказа), «Философия камня» (25 откатов).
 * Числа — стартовые (тюнюется, П6). Сборка — achievements.ts.
 */
import type { AchievementDef } from '../types';

export const ACH_FORGE: AchievementDef[] = [
  {
    id: 'ach_first_spark',
    name: 'Первая искра',
    condition: { t: 'counterAtLeast', counter: 'forge.success', value: 1 },
    rewards: [{ t: 'xp', qty: 20 }], // тюнюется
    unlockFlags: ['ach.forge.first'], // гейт ассортимента M04 (фикстура «Брусок удачи»)
  },
  {
    id: 'ach_spark_keeps',
    name: 'Искра не гаснет',
    condition: { t: 'counterAtLeast', counter: 'forge.success', value: 10 },
    rewards: [{ t: 'currency', id: 'gold', qty: 80 }], // тюнюется
    unlockFlags: ['ach.forge.keeps'],
  },
  {
    id: 'ach_forge_master',
    name: 'Мастер заточки',
    condition: { t: 'counterAtLeast', counter: 'forge.success', value: 25 },
    rewards: [
      { t: 'currency', id: 'gold', qty: 200 }, // тюнюется
      { t: 'xp', qty: 100 }, // тюнюется
    ],
    unlockFlags: ['ach.forge.master'], // гейт ассортимента M04 (фикстура «Фартук кузнеца»)
  },
  {
    id: 'ach_forge_virtuoso',
    name: 'Виртуоз наковальни',
    condition: { t: 'counterAtLeast', counter: 'forge.success', value: 100 },
    rewards: [
      { t: 'currency', id: 'gold', qty: 600 }, // тюнюется
      { t: 'item', defId: 'hp_potion', qty: 3 }, // тюнюется
    ],
    unlockFlags: ['ach.forge.virtuoso'],
  },
  {
    id: 'ach_forge_legend',
    name: 'Легенда наковальни',
    condition: { t: 'counterAtLeast', counter: 'forge.success', value: 250 },
    rewards: [
      { t: 'passivePoint', qty: 1 }, // слушатель M14 (фаза 4)
      { t: 'xp', qty: 400 }, // тюнюется
    ],
    unlockFlags: ['ach.forge.legend'],
  },
  {
    id: 'ach_steel_nerves',
    name: 'Стальные нервы',
    condition: { t: 'counterAtLeast', counter: 'forge.attempts', value: 50 },
    rewards: [{ t: 'currency', id: 'gold', qty: 120 }], // тюнюется
    unlockFlags: ['ach.forge.nerves'],
  },
  {
    id: 'ach_thousand_blows',
    name: 'Тысяча ударов',
    condition: { t: 'counterAtLeast', counter: 'forge.attempts', value: 200 },
    rewards: [
      { t: 'currency', id: 'gold', qty: 400 }, // тюнюется
      { t: 'xp', qty: 250 }, // тюнюется
    ],
    unlockFlags: ['ach.forge.blows'],
  },
  {
    id: 'ach_hardened',
    name: 'Закалённый',
    condition: { t: 'counterAtLeast', counter: 'forge.rollback', value: 10 },
    rewards: [{ t: 'currency', id: 'gold', qty: 100 }], // тюнюется
    unlockFlags: ['ach.forge.hardened'],
  },
  {
    id: 'ach_stoic',
    name: 'Стоик',
    condition: { t: 'counterAtLeast', counter: 'forge.declines', value: 10 },
    rewards: [{ t: 'xp', qty: 90 }], // тюнюется
    unlockFlags: ['ach.forge.stoic'],
  },
  {
    id: 'ach_card_collector',
    name: 'Коллекционер карточек',
    condition: { t: 'counterAtLeast', counter: 'forge.cards', value: 25 },
    rewards: [
      { t: 'currency', id: 'gold', qty: 150 }, // тюнюется
      { t: 'item', defId: 'iron_ingot', qty: 10 }, // тюнюется
    ],
    unlockFlags: ['ach.forge.cards'],
  },
  {
    id: 'ach_modesty',
    name: 'Скромность',
    hidden: true, // пасхалка: трижды отказаться от карточки заточки (§5 карточки)
    condition: { t: 'counterAtLeast', counter: 'forge.declines', value: 3 },
    rewards: [{ t: 'passivePoint', qty: 1 }], // слушатель M14 (фаза 4)
    unlockFlags: ['ach.forge.modest'],
  },
  {
    id: 'ach_philosopher_stone',
    name: 'Философия камня',
    hidden: true, // пасхалка: 25 откатов — камень тоже учит
    condition: { t: 'counterAtLeast', counter: 'forge.rollback', value: 25 },
    rewards: [{ t: 'passivePoint', qty: 1 }], // слушатель M14 (фаза 4)
    unlockFlags: ['ach.forge.philosopher'],
  },
];
