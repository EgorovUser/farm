/**
 * Self-checks M03.1 — стоимости и бюджеты ривен-движка (карточка M03 §3–§4).
 * Оракулы вычислены руками по формулам брифа (atk_power: вес 10, +30/−10):
 *   costPositive(15) = 10 × (15/30)^1.35 = 3.92
 *   costNegative(−5) = −10 × (5/10)^0.9  = −5.36
 *   рефанд ×1.25 от −5.36 = 6.7
 * Инварианты: клэмпы границ типов, монотонность кривой бафа, maximality
 * обращения (fit), форма таблицы бюджетов (§4), реестр: stat только на
 * существующие базы (прецедент M02.2).
 */
import { ContentRegistry } from '@/kernel/content/content-registry';
import { registerContent } from '@/game/content-registration';
import type { ModTypeDef } from '@/content/mods/registry';
import type { ModForgeTable } from '@/content/balance/modforge';
import {
  costNegative,
  costOf,
  costPositive,
  fitPositiveValue,
  negativeRefund,
  spentBudget,
} from '@/game/modules/modforge/cost';
import { check, group, near, type CheckGroup, type CheckResult } from './types';

const ATK: ModTypeDef = {
  id: 'atk_power',
  stat: 'combat.attack',
  scopeTags: ['weapon', 'melee'],
  maxPositive: 30,
  maxNegative: -10,
  costWeight: 10,
  curve: 'linear',
};

export function runModForgeCostChecks(): CheckGroup {
  const results: CheckResult[] = [];
  const content = new ContentRegistry();
  registerContent(content);
  const mods = content.get<ModTypeDef[]>('mods');
  const table = content.get<ModForgeTable>('modforge');
  const curve = { positiveExponent: table.positiveExponent, negativeExponent: table.negativeExponent };

  // --- 1–4. Формулы §3 (оракулы руками)
  results.push(
    check('costPositive(atk_power, 15) = 3.92 — 10 × (15/30)^1.35', () => costPositive(curve, ATK, 15) === 3.92, {
      expected: 3.92,
      actual: costPositive(curve, ATK, 15),
    }),
  );
  results.push(
    check('costPositive(atk_power, 30) = 10 — вес = стоимость максимума', () => costPositive(curve, ATK, 30) === 10, {
      expected: 10,
      actual: costPositive(curve, ATK, 30),
    }),
  );
  results.push(
    check('costNegative(atk_power, −5) = −5.36 — −10 × (5/10)^0.9', () => costNegative(curve, ATK, -5) === -5.36, {
      expected: -5.36,
      actual: costNegative(curve, ATK, -5),
    }),
  );
  results.push(
    check('клэмп границ: cost(+99) = 10, cost(−99) = −10, cost(−10) = −10', () => {
      const a = costPositive(curve, ATK, 99) === 10;
      const b = costNegative(curve, ATK, -99) === -10;
      const c = costNegative(curve, ATK, -10) === -10;
      return a && b && c;
    }),
  );

  // --- 5. Нулевые стороны типов (П5: отсутствие стороны — не ошибка)
  results.push(
    check('нулевые стороны: баф-цена отрицательного значения = 0; lucky_glow без минуса = 0; тип без плюса = 0', () => {
      const lucky = mods.find((m) => m.id === 'lucky_glow');
      if (!lucky) return false;
      const noPlus: ModTypeDef = {
        id: 'test_no_plus',
        stat: 'demo.attack',
        scopeTags: ['test'],
        maxPositive: 0,
        maxNegative: -10,
        costWeight: 5,
      };
      return (
        costPositive(curve, ATK, -5) === 0 &&
        costNegative(curve, lucky, -5) === 0 &&
        costPositive(curve, noPlus, 5) === 0
      );
    }),
  );

  // --- 6–8. Обращение кривой (§5 шаг 4: бинарный поиск по v, сетка 0.1)
  results.push(
    check('fitPositiveValue(atk_power, 3.92) = 15.0 — обращение кривой', () => fitPositiveValue(curve, ATK, 3.92) === 15, {
      expected: 15,
      actual: fitPositiveValue(curve, ATK, 3.92),
    }),
  );
  results.push(
    check('fitPositiveValue: target ≥ стоимости max → max (30); target ≤ 0 → 0', () => {
      const a = fitPositiveValue(curve, ATK, 100) === 30;
      const b = fitPositiveValue(curve, ATK, 0) === 0;
      return a && b;
    }),
  );
  results.push(
    check('roundtrip-инвариант: cost(fit(t)) ≤ t < cost(fit(t)+0.1) на сетке 0.1 (maximality)', () => {
      for (const t of [0.5, 2, 3.92, 5, 8, 9.99]) {
        const v = fitPositiveValue(curve, ATK, t);
        if (costPositive(curve, ATK, v) > t) return false;
        if (v < ATK.maxPositive && costPositive(curve, ATK, v + 0.1) <= t) return false;
      }
      return true;
    }),
  );

  // --- 9. Монотонность кривой бафа (linear и steep) по всей сетке 0.1
  results.push(
    check('монотонность costPositive по сетке 0.1: atk_power (linear) и mine_sense (steep)', () => {
      const steep = mods.find((m) => m.id === 'mine_sense');
      if (!steep) return false;
      for (const mod of [ATK, steep]) {
        let prev = -1;
        for (let d = 0; d <= Math.round(mod.maxPositive * 10); d++) {
          const c = costPositive(curve, mod, d / 10);
          if (c < prev) return false;
          prev = c;
        }
      }
      return true;
    }),
  );

  // --- 10–11. Рефанд и инвариант бюджета (§3)
  results.push(
    check('рефанд: 1.25 × |−5.36| = 6.7; не-дебаф (0 и баф) → 0', () => {
      const a = negativeRefund(table.negativeRefund, -5.36) === 6.7;
      const b = negativeRefund(table.negativeRefund, 0) === 0;
      const c = negativeRefund(table.negativeRefund, 5.36) === 0;
      return a && b && c;
    }),
  );
  results.push(
    check('spentBudget(1.25; [3.92, 10]; [−5.36]) = 7.22 — Σpos − Σ|neg|×refund', () =>
      spentBudget(table.negativeRefund, [3.92, 10], [-5.36]) === 7.22, {
        expected: 7.22,
        actual: spentBudget(table.negativeRefund, [3.92, 10], [-5.36]),
      }),
  );
  results.push(
    check('costOf — знаковая диспетчеризация: +15 → 3.92, −5 → −5.36', () => {
      const a = costOf(curve, ATK, 15) === 3.92;
      const b = costOf(curve, ATK, -5) === -5.36;
      return a && b;
    }),
  );

  // --- 12–13. Реестр типов (§2): уникальность, базы, веса, скоуп-покрытие
  results.push(
    check('реестр: id уникальны, costWeight > 0, stat ТОЛЬКО на существующие базы', () => {
      const bases = content.get<{ bases: Record<string, number> }>('bases').bases;
      const ids = new Set(mods.map((m) => m.id));
      if (ids.size !== mods.length) return false;
      for (const m of mods) {
        if (!(m.costWeight > 0)) return false;
        if (!(m.stat in bases)) return false;
      }
      return true;
    }),
  );
  results.push(
    check('скоуп-покрытие: weapon/melee ≥ 2 кандидата (multi-baff редких); rod, tool/pickaxe, armor/shield ≥ 1', () => {
      const count = (tag: string) => mods.filter((m) => m.scopeTags.includes(tag)).length;
      return count('weapon') >= 2 && count('rod') >= 1 && count('pickaxe') >= 1 && count('armor') >= 1;
    }),
  );

  // --- 14–16. Таблица бюджетов (§4) и параметры кривых/реролла
  results.push(
    check('бюджеты §4: 6 редкостей, min ≤ max, negChance ∈ [0,1]; канон common = 10/[1,1]/0%', () => {
      for (const r of ['common', 'uncommon', 'rare', 'epic', 'legendary', 'mythic'] as const) {
        const row = table.byRarity[r];
        if (!row) return false;
        if (row.positives[0] > row.positives[1]) return false;
        if (row.negChance < 0 || row.negChance > 1) return false;
        if (!(row.budget > 0)) return false;
      }
      const c = table.byRarity.common;
      return c.budget === 10 && c.positives[0] === 1 && c.positives[1] === 1 && c.negChance === 0;
    }),
  );
  results.push(
    check('кривые §3: refund ≥ 1; positiveExponent > 1 (суперлинейно); negativeExponent ∈ (0,1)', () =>
      table.negativeRefund >= 1 && table.positiveExponent > 1 && table.negativeExponent > 0 && table.negativeExponent < 1),
  );
  results.push(
    check('реролл §6 [C2 · M04.2]: baseCostByRarity — все 6 редкостей ≥ 0 (растёт с редкостью), growth ≥ 1, capMult ≥ 1', () => {
      const r = table.reroll;
      const rarities = ['common', 'uncommon', 'rare', 'epic', 'legendary', 'mythic'] as const;
      const values = rarities.map((k) => r.baseCostByRarity[k]);
      return (
        values.every((v) => typeof v === 'number' && v >= 0) &&
        values.every((v, i) => i === 0 || v > values[i - 1]) &&
        r.growth >= 1 &&
        r.capMult >= 1
      );
    }),
  );

  // --- 17. Вес = стоимость максимума для всех строк реестра (self-consistency)
  results.push(
    check('вес = стоимость max-бафа для всех строк реестра (costPositive(max) = costWeight)', () =>
      mods.every((m) => near(costPositive(curve, m, m.maxPositive), m.costWeight, 0.01))),
  );

  return group('M03 · Модфордж: стоимости и бюджеты', results);
}
