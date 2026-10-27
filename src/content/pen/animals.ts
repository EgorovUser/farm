/**
 * ЖИВОТНЫЕ ЗАГОНА (карточка M06 §2; AnimalDef — канон 03-DATA §6).
 *
 * Семь стартовых видов поимённо (бриф F3; числа — стартовые предложения,
 * тюнинг заказчика): Кура 80з / Яйца 6ч; Коза 150з / Молоко 8ч; Овца 200з /
 * Шерсть 12ч; Корова 400з / Молоко ×2 8ч; Свинья 500з / Трюфели 24ч;
 * Пчёлы (улий) 350з / Мёд 10ч; Альпака 900з / Шерсть ×2 12ч.
 *
 * Гейты (F3): Пчёлы — уровень 15; Свинья — ачивка «Грибник» ach_mycologist
 * (вводится этим сеансом по праву касания, F4 — тип {t:'achievement'} —
 * канон M15); Корова/Кура/Коза/Овца — без гейтов; Альпака — уровень 20 +
 * «репутация деревни» (M16 НЕ реализована): [DECISION · F3-вариант (а)]
 * unlock-Requirement {t:'all'} = playerLevel 20 + флаг-заглушка
 * 'pen.reputationReady' (данные pen: PEN_TABLE.reputation.ready = false до
 * M16; витрина честно показывает замок «уровень 20 + репутация деревни
 * (скоро)»; покупка отклонена; M16 подключит реальную репутацию по праву
 * касания — pen-домен не трогает M15/M16).
 *
 * produceNeeds — канон 03-DATA §6 (satiety/health пороги продукции);
 * качество animalQuality относится к экземпляру (AnimalInstance.quality,
 * 03-DATA §6), не к дефу.
 */
import type { ID } from '@/shared/types/ids';
import type { Condition } from '@/shared/types/requirement';

export interface AnimalProduceDef {
  defId: ID;
  periodHours: number;
  qty: number;
}

export interface AnimalDef {
  id: ID;
  name: string;
  price: number;
  produce: AnimalProduceDef;
  produceNeeds?: { satiety: number; health: number };
  unlock?: Condition;
}

export const ANIMALS: AnimalDef[] = [
  {
    id: 'chicken',
    name: 'Кура',
    price: 80,
    produce: { defId: 'egg', periodHours: 6, qty: 1 },
    produceNeeds: { satiety: 50, health: 50 },
  },
  {
    id: 'goat',
    name: 'Коза',
    price: 150,
    produce: { defId: 'milk', periodHours: 8, qty: 1 },
    produceNeeds: { satiety: 50, health: 50 },
  },
  {
    id: 'sheep',
    name: 'Овца',
    price: 200,
    produce: { defId: 'wool', periodHours: 12, qty: 1 },
    produceNeeds: { satiety: 50, health: 50 },
  },
  {
    id: 'cow',
    name: 'Корова',
    price: 400,
    produce: { defId: 'milk', periodHours: 8, qty: 2 },
    produceNeeds: { satiety: 50, health: 50 },
  },
  {
    id: 'pig',
    name: 'Свинья',
    price: 500,
    produce: { defId: 'truffle', periodHours: 24, qty: 1 },
    produceNeeds: { satiety: 50, health: 50 },
    // [F4] гейт «Грибник» — ачивка вводится M06 по праву касания
    // (прецедент «Агроном» M05.3): counterAtLeast farm.mushroom.harvests 25
    unlock: { t: 'achievement', id: 'ach_mycologist' },
  },
  {
    id: 'bees',
    name: 'Пчёлы',
    price: 350,
    produce: { defId: 'honey', periodHours: 10, qty: 1 },
    produceNeeds: { satiety: 50, health: 50 },
    unlock: { t: 'playerLevel', level: 15 },
  },
  {
    id: 'alpaca',
    name: 'Альпака',
    price: 900,
    produce: { defId: 'wool', periodHours: 12, qty: 2 },
    produceNeeds: { satiety: 50, health: 50 },
    // [F3 · DECISION (а)] уровень 20 + репутация деревни (скоро) — флаг-заглушка
    // pen.reputationReady = false до M16 (данные PEN_TABLE.reputation)
    unlock: {
      t: 'all',
      cs: [{ t: 'playerLevel', level: 20 }, { t: 'flag', flag: 'pen.reputationReady' }],
    },
  },
];
