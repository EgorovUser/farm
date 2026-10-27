/**
 * УЛУЧШЕНИЯ ОЗЕРА (карточка M08 §5; бриф M08.2 F10) — данные +
 * TransactionService (паттерн pen/upgrades.ts M06.2: улучшение = данные,
 * покупка = eventId 'lake.upgrade', БЕЗ энергии; НЕ товары M04 — пул 60 жив).
 *
 * Поимённо (цены — стартовые предложения [DECISION-сетка брифа F10], тюнинг
 * заказчика); владение ПЕР-ОЗЕРО (F14: upgrades?: string[] в группе озера):
 *   Аэратор 150з — дрейф чистоты −5 → −2/день («замедляет по формуле данных»,
 *     карточка §7);
 *   Подогреватель 200з — температура +10 (кап 100) НАВСЕГДА [DECISION: без
 *     выкл.]; тёплолюбивая группа (правило ДАННЫМИ warmBreeding в
 *     balance/lake.ts: tempMin ≥ 10 при воде ≥ 20 — Линь/Щука/Зеркальный
 *     карп/Золотой карп) — период разведения ×0.75 («тропические виды
 *     активны»); холодолюбивые вне tempMax — условия-блок F3 (икры нет) —
 *     карточное «inc −25%» перекрыто блоком (сильнее): [DECISION-интерпретация]
 *     — био-конфликт §5, осознанный выбор линии;
 *   Автокормушка 250з — dayTick ОЗЕРА кормит голодных из кошелька Корма
 *     (механика F12; исполнитель lake.feed — тот же канал);
 *   Инкубатор 400з — flat +10 к весу +1-тира (стат lake.mutation.plus1Bonus,
 *     провайдер lake.upgrades; кап суммы X ≤ 40 — вес ≤ 50; +2 = база 1%
 *     ВСЕГДА — «жемчужина» механики, решение брифа по §8 карточки Task 48);
 *   «Глубоководье» 500з — +4 слота (6 → 10; «глубоководные виды» — задел
 *     контента, НЕ этот сеанс);
 *   Лаборатория 600з — lake.research <plus1|plus2> раз в 24ч (механика F13);
 *   «Второе озеро» 1200з — группа lake2 среза + lake.switch (механика F14;
 *     «свой работник» — задел M11 §2, лимит найма = объектам).
 */
import type { ID } from '@/shared/types/ids';
import type { StatId } from '@/shared/types/ids';

/** форма мода улучшения (локальная копия — изоляция контента, прецедент pen) */
export interface LakeUpgradeMod {
  stat: StatId;
  op: 'flat' | 'inc' | 'more' | 'override' | 'cap';
  value: number;
  tag: string;
  label: string;
}

/** эффекты улучшений озера (дискриминированный юнион — паттерн pen/фермы) */
export type LakeUpgradeEffect =
  | { t: 'aerator'; driftPerDay: number }
  | { t: 'heater'; tempPlus: number }
  | { t: 'autofeeder' }
  | { t: 'incubator'; mods: LakeUpgradeMod[] }
  | { t: 'deepWater'; addSlots: number }
  | { t: 'laboratory' }
  | { t: 'lake2' };

export interface LakeUpgradeDef {
  id: ID;
  name: string;
  description: string;
  cost: { currency: 'gold'; qty: number };
  effect: LakeUpgradeEffect;
}

export const LAKE_UPGRADES: LakeUpgradeDef[] = [
  {
    id: 'upg_aerator',
    name: 'Аэратор',
    description: 'дрейф чистоты −5 → −2/день (фильтрация воды)',
    cost: { currency: 'gold', qty: 150 },
    effect: { t: 'aerator', driftPerDay: -2 },
  },
  {
    id: 'upg_heater',
    name: 'Подогреватель',
    description: 'температура +10 (навсегда); тёплолюбивые виды разводятся быстрее (период ×0.75)',
    cost: { currency: 'gold', qty: 200 },
    effect: { t: 'heater', tempPlus: 10 },
  },
  {
    id: 'upg_autofeeder',
    name: 'Автокормушка',
    description: 'каждый день кормит голодных рыб сама (Корм из кошелька)',
    cost: { currency: 'gold', qty: 250 },
    effect: { t: 'autofeeder' },
  },
  {
    id: 'upg_incubator',
    name: 'Инкубатор',
    description: 'шанс +1 тира мутации 10% → 20% (кап суммы бонусов ≤ 40 п.п.); редкая +2 не инфлируется',
    cost: { currency: 'gold', qty: 400 },
    effect: {
      t: 'incubator',
      mods: [
        {
          stat: 'lake.mutation.plus1Bonus',
          op: 'flat',
          value: 10,
          tag: 'lake',
          label: 'инкубатор: +10 п.п. к весу +1-тира',
        },
      ],
    },
  },
  {
    id: 'upg_deep_water',
    name: 'Глубоководье',
    description: '+4 слота озера (6 → 10)',
    cost: { currency: 'gold', qty: 500 },
    effect: { t: 'deepWater', addSlots: 4 },
  },
  {
    id: 'upg_laboratory',
    name: 'Лаборатория',
    description: 'раз в 24ч направить мутацию: plus1 (10/11 → +1) или plus2 (гарант +2)',
    cost: { currency: 'gold', qty: 600 },
    effect: { t: 'laboratory' },
  },
  {
    id: 'upg_lake2',
    name: 'Второе озеро',
    description: 'второй водоём со своей водой/слотами/улучшениями (lake.switch 0|1)',
    cost: { currency: 'gold', qty: 1200 },
    effect: { t: 'lake2' },
  },
];
