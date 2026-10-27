/**
 * Трейты-кандидаты работников (F2): дефы-кандидаты ривена — ДАННЫЕ здесь
 * (не M03-код!); доска роллит их через ЖИВОЙ ривен-конструктор M03
 * (modforge.rollFor по ModuleRegistry, скоуп 'worker', бюджет 6 × звёзды,
 * форма positives [1,2] / negChance 30% — таблица M03 §4 «Трейт работника»).
 *
 * Слияние в реестр 'mods' — content-registration (паттерн LAKE_BASES_TABLE:
 * новые строки контента БЕЗ кода движка, П1/П5). Инвариант M03 «stat только
 * на существующие базы» — базы WORKERS_BASES_TABLE (table.ts) + существующие
 * доменные базы (farm.growthSpeed).
 *
 * ЗНАЧЕНИЯ трейтов применяет провайдер workerProvider в M11.2 (трейты
 * назначенного — на ЕГО систему, фильтр по тегу назначения); M11.1 хранит
 * трейты в профиле/экземпляре и показывает текстом (П6 «шансы на стол»).
 */
import type { ModTypeDef } from '@/content/mods/registry';
import type { ModForgeTable } from '@/content/balance/modforge';

/** дефы-кандидаты трейтов (скоуп worker; карточка M11 §4, бриф F2) */
export const WORKER_TRAIT_TYPES: ModTypeDef[] = [
  {
    // «Трудолюбивый»: −% к зарплате (скидка; бриф F2 «трудолюбивый −20% ЗП»)
    id: 'worker_diligent',
    stat: 'worker.salary.discount',
    scopeTags: ['worker'],
    maxPositive: 20,
    maxNegative: 0,
    costWeight: 6,
    curve: 'linear',
  },
  {
    // «Характер» (бриф F2 «ворчун −5 настроения окружающим» — дебаф-сторона;
    // двуполярный для инварианта M03 costPositive(max) = costWeight: плюс —
    // «обаятельный», плюс/минус к ауре настроения окружающим)
    id: 'worker_grumbler',
    stat: 'worker.mood.aura',
    scopeTags: ['worker'],
    maxPositive: 5,
    maxNegative: -5,
    costWeight: 4,
    curve: 'linear',
  },
  {
    // «Зелёные руки»: +20% скорость роста на своей ферме (бриф F2; стат
    // домена фермы — применяется провайдером только при назначении на ферму)
    id: 'worker_green_thumb',
    stat: 'farm.growthSpeed',
    scopeTags: ['worker'],
    maxPositive: 20,
    maxNegative: 0,
    costWeight: 8,
    curve: 'linear',
  },
  {
    // «Проворный»: ±% к скорости работы (M03 §2 workerSpeed — двуполярный)
    id: 'worker_swift',
    stat: 'worker.action.speed',
    scopeTags: ['worker'],
    maxPositive: 20,
    maxNegative: -10,
    costWeight: 7,
    curve: 'soft',
  },
  {
    // «Заботливый»: +уход (качество работ — потребляет M11.2)
    id: 'worker_careful',
    stat: 'worker.care.bonus',
    scopeTags: ['worker'],
    maxPositive: 2,
    maxNegative: 0,
    costWeight: 5,
    curve: 'linear',
  },
];

/** витринные имена и подписи трейтов (П6: трейты текстом в доске/списке) */
export const TRAIT_LABELS: Record<string, { name: string; text: (value: number) => string }> = {
  worker_diligent: {
    name: 'Трудолюбивый',
    text: (v) => `скидка к зарплате ${v}%`,
  },
  worker_grumbler: {
    name: 'Характер',
    text: (v) => `${v > 0 ? '+' : ''}${v} настроения окружающим`,
  },
  worker_green_thumb: {
    name: 'Зелёные руки',
    text: (v) => `${v > 0 ? '+' : ''}${v}% скорость роста на своей ферме`,
  },
  worker_swift: {
    name: 'Проворный',
    text: (v) => `${v > 0 ? '+' : ''}${v}% к скорости работы`,
  },
  worker_careful: {
    name: 'Заботливый',
    text: (v) => `уход +${v}`,
  },
};

/** форма ролла трейтов — ДАННЫЕ M03 (MODFORGE_TABLE.traitBudgets.worker:
 *  «Трейт работника | по звёздам: 6 × звёзды | 1–2 | 30%» — строки M03.3;
 *  П2: числа задаются один раз, НЕ дублируются в content/workers) */
export function traitRuleOf(modforge: ModForgeTable): { positives: [number, number]; negChance: number } {
  const rule = modforge.traitBudgets.worker;
  return { positives: rule.positives, negChance: rule.negChance };
}

/** бюджет трейтов: perStar × звёзды (MODFORGE_TABLE.traitBudgets.worker) */
export function traitBudgetOf(stars: number, modforge: ModForgeTable): number {
  const rule = modforge.traitBudgets.worker;
  return rule.budget.kind === 'perStar' ? rule.budget.perStar * stars : 0;
}
