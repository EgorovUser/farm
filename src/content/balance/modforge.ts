/**
 * БАЛАНС МОДФОРДЖА (M03 §3–§4, 03-DATA §5): бюджеты, форма роллов, стоимость
 * реролла. Единственное место чисел движка ривен-роллов (П6: тюнюется здесь).
 *
 * [DECISION · M03.1] экспоненты стоимости (1.35/0.9) вынесены в контент, а не в
 * код формулы (П6 «ни одного магического числа в логике»): форма кривой —
 * настраиваемый баланс, как sellRate в economy. Канон значений — бриф M03 §3.
 *
 * [DECISION · M03.1] mythic-строка отсутствует в таблице брифа §4 — заполнена
 * экстраполяцией (90 / [3,4] / 0.90), тюнюемо без миграций (базы, не сейв).
 *
 * [DECISION · M03.1] reroll-параметры (growth/capMult) — дополнение к
 * брифу §6 («растёт геометрически ×1.15, кап ×10 базы»).
 *
 * [DECISION · M04.2 · C2 · AUDIT-M03] база реролла — ПО РЕДКОСТИ предмета
 * (бриф-вариант 10/20/40/80/150, ратифицирован пересмотром C2 «при появлении
 * золотого цикла»): плоские 10 золота делали реролл легендарного гира
 * (dragon_fang 1500) тридиальным — 0.7% цены. Канон: база ≈ 8–17% цены
 * предмета (инвариант-чек M04.2), кап ×10 базы (карточка §6 дословно);
 * mythic — экстраполяция ×2 от legendary (прецедент D36: строки mythic
 * заполняются экстраполяцией). Потребитель — M03.3 RerollService.
 */
import type { Rarity } from '@/shared/types/ids';

export interface ModForgeRarityRow {
  /** стартовый бюджет редкости (канон для modSlots.budgetBase предмета) */
  budget: number;
  /** кол-во бафов [min..max] */
  positives: [number, number];
  /** шанс дебафа 0..1 */
  negChance: number;
}

/** [M04.1 · C5 · AUDIT-M03] строка бюджета трейта (карточка M03 §4, строки
 *  «Трейт работника / Трейт помощника»): потребители — M11 (работники) и
 *  M13 (помощники) при генерации профилей (traits: RolledMod[]). Владелец
 *  строк — контент модфорджа (движку всё равно, кому роллить, §1/§8). */
export interface TraitBudgetRule {
  /** бюджет: perStar × звёзды (работник) | по редкости помощника (fromRarity) */
  budget: { kind: 'perStar'; perStar: number } | { kind: 'fromRarity' };
  /** кол-во бафов [min..max] */
  positives: [number, number];
  /** шанс дебафа 0..1 */
  negChance: number;
}

export interface ModForgeTable {
  byRarity: Record<Rarity, ModForgeRarityRow>;
  /** дебаф возвращает в бюджет больше отнятого (бриф §3: ~1.25) */
  negativeRefund: number;
  /** бюджет карточки заточки уровня L = forgeBudgetPerLevel × L (потребитель M10) */
  forgeBudgetPerLevel: number;
  /** экспонента стоимости бафа (>1 — суперлинейно, бриф §3) */
  positiveExponent: number;
  /** экспонента стоимости дебафа (<1 — почти линейно, бриф §3) */
  negativeExponent: number;
  /** реролл-цикл (бриф §6): цена(n) = ceil(base(rarity) × min(growth^n, capMult));
   *  [C2 · M04.2] база — по редкости предмета (было: плоско 10, фаза 1) */
  reroll: { baseCostByRarity: Record<Rarity, number>; growth: number; capMult: number };
  /** [C5] бюджеты трейтов §4: работник 6×звёзды / [1,2] / 30%; помощник
   *  по редкости / [1,3] / 50% (бюджет — из byRarity редкости помощника) */
  traitBudgets: { worker: TraitBudgetRule; helper: TraitBudgetRule };
}

export const MODFORGE_TABLE: ModForgeTable = {
  byRarity: {
    common: { budget: 10, positives: [1, 1], negChance: 0 },
    uncommon: { budget: 16, positives: [1, 2], negChance: 0.1 },
    rare: { budget: 25, positives: [2, 2], negChance: 0.25 },
    epic: { budget: 40, positives: [2, 3], negChance: 0.5 },
    legendary: { budget: 60, positives: [3, 3], negChance: 0.75 },
    mythic: { budget: 90, positives: [3, 4], negChance: 0.9 },
  },
  negativeRefund: 1.25,
  forgeBudgetPerLevel: 4,
  positiveExponent: 1.35,
  negativeExponent: 0.9,
  // [C2 · M04.2] база по редкости: бриф-вариант 10/20/40/80/150 (common..legendary),
  // mythic — экстраполяция ×2 (= 300); кап цены = ×10 базы соответствующей редкости
  reroll: {
    baseCostByRarity: { common: 10, uncommon: 20, rare: 40, epic: 80, legendary: 150, mythic: 300 },
    growth: 1.15,
    capMult: 10,
  },
  traitBudgets: {
    // «Трейт работника | по звёздам: 6 × звёзды | 1–2 | 30%» (§4)
    worker: { budget: { kind: 'perStar', perStar: 6 }, positives: [1, 2], negChance: 0.3 },
    // «Трейт помощника | по редкости | 1–3 | 50%» (§4): бюджет = byRarity[rarity]
    helper: { budget: { kind: 'fromRarity' }, positives: [1, 3], negChance: 0.5 },
  },
};
