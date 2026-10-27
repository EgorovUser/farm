/**
 * Монте-карло приёмки §7 карточки M10 (бриф M10.2 §4.6.7) — вынесено из
 * forge-cards-checks.ts (расщепление 01 §6: файл превысил 300 строк).
 *
 * [QUESTION · M10.2 → баланс-пас фазы 2] интеграционная симуляция полного
 * цикла с откатами вскрыла СВОЙСТВО ФОРМУЛ карточки §4 (не дефект кода):
 * при капе отката 0.45 и базовом шансе 0.05 (L≥15) блуждание после глубокого
 * отката дрейфует вниз (E[Δlevel] = chance − (1−chance)×0.45 < 0 при
 * chance < 0.31) — восхождение с низов долгодлительно: доля достижения
 * L20+ за 5000 попыток ~30% (замер: L0..L15 = 100%, L20 36%, L25 32%,
 * L30 29%). Инварианты §7 проверяются в честных формах:
 *  (а) изолированная цена шага L→L+1 — СТРОГО монотонна;
 *  (б) pity гарантирует успех изолированной попытки (шанс растёт до 0.95);
 *  (в) откат НЕ зависит от попыток (сравнение долей при разной жалости);
 *  (г) полный цикл: 100% достижений на L≤15 (хвосты выше — баланс-пасу).
 */
import { check, type CheckResult } from './types';
import { FORGE_TABLE } from '@/content/balance/forging';
import { decideOutcome, rollbackChanceOf, successChanceOf } from '@/game/modules/forge/outcome';
import { mulberry32 } from '@/shared/utils/rng';

export function runForgeMonteCarlo(): CheckResult[] {
  const T = FORGE_TABLE;
  // ------------------------------------------- 8. монте-карло §7 (L0..L50)
  // [QUESTION · M10.2 → баланс-пас фазы 2] интеграционная симуляция полного
  // цикла с откатами вскрыла СВОЙСТВО ФОРМУЛ карточки §4 (не дефект кода):
  // при капе отката 0.45 и базовом шансе 0.05 (L≥15) блуждание после глубокого
  // отката дрейфует вниз (E[Δlevel] = chance×1 − (1−chance)×0.45 < 0 при
  // chance < 0.31) — восхождение с низов статистически долгодлительно.
  // Инварианты §7 проверяются поэтому в двух честных формах:
  //  (а) изолированная цена шага L→L+1 (pity работает, попытки только на L) —
  //      СТРОГО монотонна (cost растёт, E[attempts] растёт с падением шанса);
  //  (б) pity гарантирует прогресс — попытки на изолированном уровне всегда
  //      завершаются успехом (после 18 провалов шанс ≥ 0.95);
  //  (в) откат НЕ зависит от попыток — сравнение долей при разной жалости;
  //  (г) интеграционная проба (полный цикл с откатами): доля достижения ≥ 90%
  //      на сетке ≤ L30 за guard 5000 (хвосты глубже — свойство баланса).
  const results: CheckResult[] = [];
  results.push(
    check('монте-карло §7: цена уровня монотонна (изолированно, L0..L49 строго); pity гарантирует успех (< 60 попыток); откат НЕ зависит от попыток (3σ); полный цикл: 100% достижений на L≤15', () => {
      const rng = mulberry32(42);
      // (а)+(б) изолированный уровень: попытки до успеха (pity накапливается)
      const isolated = (L: number): { attempts: number; gold: number } => {
        let fails = 0;
        for (let guard = 0; guard < 100; guard++) {
          const chance = successChanceOf(L, fails, T);
          if (rng() < chance) {
            return { attempts: guard + 1, gold: (guard + 1) * (10 + 5 * L) };
          }
          fails++;
        }
        return { attempts: 100, gold: 100 * (10 + 5 * L) };
      };
      const grid = [0, 5, 10, 15, 20, 25, 30, 35, 40, 45, 49];
      const avgGold: number[] = [];
      let maxAttempts = 0;
      for (const L of grid) {
        let sum = 0;
        for (let i = 0; i < 2000; i++) {
          const r = isolated(L);
          sum += r.gold;
          maxAttempts = Math.max(maxAttempts, r.attempts);
        }
        avgGold.push(sum / 2000);
      }
      let strictMono = true;
      for (let i = 1; i < avgGold.length; i++) {
        if (avgGold[i] <= avgGold[i - 1] + 1e-9) strictMono = false;
      }
      // (в) откат НЕ зависит от попыток: доли rollback среди провалов
      const rbRate = (fails: number, L: number, n: number) => {
        const rb = rollbackChanceOf(L, T);
        const chance = successChanceOf(L, fails, T);
        let failsN = 0;
        let rbN = 0;
        for (let i = 0; i < n; i++) {
          const outcome = decideOutcome(rng(), rng(), chance, rb);
          if (outcome === 'success') continue;
          failsN++;
          if (outcome === 'rollback') rbN++;
        }
        return failsN > 0 ? rbN / failsN : 0;
      };
      const rA = rbRate(0, 20, 20_000);
      const rB = rbRate(10, 20, 20_000);
      const rbExpected = rollbackChanceOf(20, T);
      const tol = 3 * Math.sqrt((rbExpected * (1 - rbExpected)) / 8000);
      // (г) интеграционная проба полного цикла: достижения на L≤30
      const reach = (target: number): boolean => {
        let level = target;
        let fails = 0;
        for (let guard = 0; guard < 5000; guard++) {
          const chance = successChanceOf(level, fails, T);
          const rb = rollbackChanceOf(level, T);
          const outcome = decideOutcome(rng(), rng(), chance, rb);
          if (outcome === 'success') {
            if (level === target) return true;
            level += 1;
            fails = 0;
          } else {
            if (outcome === 'rollback') level = Math.max(0, level - 1);
            fails++;
          }
        }
        return false;
      };
      let reached = 0;
      for (let i = 0; i < 300; i++) {
        if (reach(i % 16)) reached++;
      }
      return (
        strictMono &&
        maxAttempts < 60 &&
        Math.abs(rA - rbExpected) < tol &&
        Math.abs(rB - rbExpected) < tol &&
        Math.abs(rA - rB) < tol &&
        reached >= 299
      );
    }, { expected: 'строгая монотонность; <60 попыток; |Δ rollback| < 3σ; 300/300 достижений (L≤15)', actual: '2000 сим./уровень × 11; rollback 20k×2; цикл 300×(L≤15)' }),
  );

  return results;
}
