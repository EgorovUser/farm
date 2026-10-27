/**
 * Улучшения качества жизни M11.2 (карточка M11 §5, бриф F15) — ДАННЫЕ
 * (паттерн content/lake/upgrades.ts M08.2): покупка = TransactionService
 * eventId 'worker.upgrade' БЕЗ энергии (прецедент lake.upgrade); владение
 * `workers.upgrades?: string[]` в срезе — АДДИТИВНО-ОПЦИОНАЛЬНО БЕЗ bump
 * (прецедент lake); повторная покупка — честный отказ.
 *
 * Цены [DECISION]-сетка брифа F15: 300/400/500/600/900 (Σ 2700з).
 * Эффекты применяет modules/workers (tick/day/upgrades) чтением данных:
 *  - Домик работников (house): +5 к КАПУ настроения — [DECISION-интерпретация]:
 *    «кап» = верхняя граница шкалы 100 → 105 (витрина знаменатель = капу);
 *  - Столовая (canteen): +3/день всем нанятым; тратит еду ИГРОКА — 1 предмет
 *    из foodWhitelist на работника в день через живой inventory-канал
 *    (прецедент lake.treat → animal_remedy M09); НОВЫХ дефов НЕ создавать
 *    (старт — живые egg/mushroom); нехватка еды — не кормит (мягкий отказ);
 *  - Баня (bath): −50% болезней — sickFactor 0.5 (задел F5 M11.1);
 *  - Праздничный день (holiday): каждый 7-й игровой день от абсолютного
 *    календаря (НЕ от hiredAt) +15 всем нанятым; тики работника в этот
 *    день НЕ выполняются (actionDone-тишина);
 *  - Инструментальный шкаф (toolCase): закрывает toolRequirement профилей
 *    автоматически — штраф F11 НЕ применяется (витрина помечает).
 */
import type { ID } from '@/shared/types/ids';

export type WorkerUpgradeEffect =
  | { t: 'house'; moodCapBonus: number }
  | { t: 'canteen'; moodPerDay: number; foodPerWorker: number; foodWhitelist: ID[] }
  | { t: 'bath'; sickFactor: number }
  | { t: 'holiday' }
  | { t: 'toolCase' };

export interface WorkerUpgradeDef {
  id: ID;
  name: string;
  description: string;
  cost: { currency: 'gold'; qty: number };
  effect: WorkerUpgradeEffect;
}

export const WORKER_UPGRADES: WorkerUpgradeDef[] = [
  {
    id: 'upg_worker_house',
    name: 'Домик работников',
    description: '+5 к потолку настроения (шкала до 105)',
    cost: { currency: 'gold', qty: 300 },
    effect: { t: 'house', moodCapBonus: 5 },
  },
  {
    id: 'upg_worker_canteen',
    name: 'Столовая',
    description: '+3 настроения в день; ест еду игрока (1 предмет на работника в день)',
    cost: { currency: 'gold', qty: 400 },
    effect: { t: 'canteen', moodPerDay: 3, foodPerWorker: 1, foodWhitelist: ['egg', 'mushroom'] },
  },
  {
    id: 'upg_worker_bath',
    name: 'Баня',
    description: '−50% болезней работников',
    cost: { currency: 'gold', qty: 500 },
    effect: { t: 'bath', sickFactor: 0.5 },
  },
  {
    id: 'upg_worker_holiday',
    name: 'Праздничный день',
    description: 'раз в неделю: +15 настроения всем, работы в этот день нет',
    cost: { currency: 'gold', qty: 600 },
    effect: { t: 'holiday' },
  },
  {
    id: 'upg_worker_tool_case',
    name: 'Инструментальный шкаф',
    description: 'закрывает требования к инструментам профилей (штраф не применяется)',
    cost: { currency: 'gold', qty: 900 },
    effect: { t: 'toolCase' },
  },
];
