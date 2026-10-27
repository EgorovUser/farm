/**
 * Self-checks M10.1 «Заточка», часть 1 (бриф §4.8, карточка §3–§4/§7):
 * сетка шансов/pity/отката, стоимость, тир R2, statScale — ЧИСТЫЕ функции
 * outcome.ts; монте-карло 10k; C1-payload; паритет манифеста craft (MEL-D).
 * Живые пробы (attempt-цикл/швы/потолок/сейв/детерминизм) — forge-live-checks.ts
 * (расщепление 01 §6: файл превысил 300 строк; собираются в ОДНУ группу).
 */
import { check, group, type CheckGroup, type CheckResult } from './types';
import { FORGE_TABLE, attemptCostOf } from '@/content/balance/forging';
import {
  baseSuccessOf,
  decideOutcome,
  effectiveQualityOf,
  pityBonusOf,
  rollbackChanceOf,
  statScaleOf,
  successChanceOf,
} from '@/game/modules/forge/outcome';
import { createCraftManifest } from '@/game/modules/craft/manifest';
import { mulberry32 } from '@/shared/utils/rng';
import { makeForgeGame } from './forge-fixture';
import type { R } from './forge-fixture';
import { runForgeLiveChecks } from './forge-live-checks';

export async function runForgeChecks(): Promise<CheckGroup> {
  const results: CheckResult[] = [];
  const T = FORGE_TABLE;
  const near = (v: number, x: number) => Math.abs(v - x) < 1e-9;

  // ------------------------------------------- сетка baseSuccess (§4)
  results.push(
    check('сетка §4: baseSuccess L0=0.90, L5=0.60, L10=0.30, L14=0.06, L15=0.05 (клэмп), L20=0.05', () =>
      near(baseSuccessOf(0, T), 0.9) && near(baseSuccessOf(5, T), 0.6) &&
      near(baseSuccessOf(10, T), 0.3) && near(baseSuccessOf(14, T), 0.06) &&
      near(baseSuccessOf(15, T), 0.05) && near(baseSuccessOf(20, T), 0.05),
    { expected: '0.90/0.60/0.30/0.06/0.05/0.05', actual: [0, 5, 10, 14, 15, 20].map((L) => baseSuccessOf(L, T).toFixed(2)).join('/') }),
  );

  // ------------------------------------------- pity-арифметика (§4)
  results.push(
    check('pity §4: L0+1 провал → 0.95 (клэмп); L10+3 → 0.45; L15+18 → 0.95 (клэмп)', () =>
      near(successChanceOf(0, 1, T), 0.95) &&
      near(successChanceOf(10, 3, T), 0.45) &&
      near(successChanceOf(15, 18, T), 0.95) &&
      near(pityBonusOf(3, T), 0.15)),
  );

  // ------------------------------------------- rollback (§4)
  results.push(
    check('откат §4: L0=0.10, L5=0.25, L11=0.43, L12 → клэмп 0.45', () =>
      near(rollbackChanceOf(0, T), 0.1) && near(rollbackChanceOf(5, T), 0.25) &&
      near(rollbackChanceOf(11, T), 0.43) && near(rollbackChanceOf(12, T), 0.45)),
  );

  // ------------------------------------------- стоимость попытки (данные §4.3)
  results.push(
    check('стоимость §4.3: L0 = 1 слиток + 10 зол., L10 = 2 + 60, L20 = 3 + 110, L59 = 6 + 305', () => {
      const c = (L: number) => attemptCostOf(L, T);
      return (
        c(0).ingots === 1 && c(0).gold === 10 &&
        c(10).ingots === 2 && c(10).gold === 60 &&
        c(20).ingots === 3 && c(20).gold === 110 &&
        c(59).ingots === 6 && c(59).gold === 305
      );
    }),
  );

  // ------------------------------------------- тир R2 (floor, SS-клэмп, дробь)
  results.push(
    check('тир R2: L0/L9 → +0, L10/L19 → +1, L20 → +2, L50 → +5; SS-клэмп; C/58 + 1 тир = B/58', () => {
      const q = (tier: 'D' | 'C' | 'S', L: number) => effectiveQualityOf(tier, 58, L, T);
      return (
        q('D', 0).tier === 'D' && q('D', 9).tier === 'D' &&
        q('D', 10).tier === 'C' && q('D', 19).tier === 'C' &&
        q('D', 20).tier === 'B' && q('D', 50).tier === 'SS' &&
        q('S', 50).tier === 'SS' &&
        q('C', 10).tier === 'B' && q('C', 10).value === 58
      );
    }),
  );

  // ------------------------------------------- statScale (§3, к базе)
  results.push(
    check('statScale §3: L0=1.0, L10=1.5, L20=2.0 (к БАЗЕ в провайдере M02)', () =>
      near(statScaleOf(0, T), 1) && near(statScaleOf(10, T), 1.5) && near(statScaleOf(20, T), 2)),
  );

  // ------------------------------------------- C1: payload target (прямой вызов с адресатом)
  results.push(
    check('C1: payload modforge.rolled несёт target { kind: item, refId } (rollItem с адресатом)', () => {
      const f5 = makeForgeGame();
      const events: Array<Record<string, unknown>> = [];
      const off = f5.game.bus.subscribe('modforge.rolled', (p) => events.push(p as Record<string, unknown>));
      const r = f5.game.modules.get('modforge')?.api['modforge.rollItem'](
        'iron_pickaxe',
        'selfcheck:m10:c1',
        { kind: 'item', refId: 'pick#42' },
      ) as R<unknown>;
      off();
      f5.dispose();
      return r !== undefined && r.ok && events.length === 1 &&
        (events[0].target as { kind: string; refId: string } | null)?.kind === 'item' &&
        (events[0].target as { kind: string; refId: string } | null)?.refId === 'pick#42';
    }),
  );

  // ------------------------------------------- паритет манифеста craft (MEL-D-профилактика)
  results.push(
    check('паритет манифеста craft: publicApi 11 = 11 фактических api-методов (MEL-D-профилактика)', () => {
      const f6 = makeForgeGame();
      const apiKeys = new Set(Object.keys(f6.game.modules.get('craft')?.api ?? {}));
      const manifestKeys = new Set(createCraftManifest().publicApi as string[]);
      f6.dispose();
      if (apiKeys.size !== manifestKeys.size) return false;
      for (const k of manifestKeys) if (!apiKeys.has(k)) return false;
      return apiKeys.size === 11;
    }),
  );

  // ------------------------------------------- монте-карло 10k (L5, §7)
  results.push(
    check('монте-карло §7: 10 000 попыток L5 — доля успехов ≈ 0.60, доля откатов среди провалов ≈ 0.25; pity-цепочка монотонна', () => {
      const rng = mulberry32(20261023);
      let success = 0;
      let fails = 0;
      let rollbacks = 0;
      const chance = successChanceOf(5, 0, T);
      const rb = rollbackChanceOf(5, T);
      for (let i = 0; i < 10_000; i++) {
        const outcome = decideOutcome(rng(), rng(), chance, rb);
        if (outcome === 'success') success++;
        else {
          fails++;
          if (outcome === 'rollback') rollbacks++;
        }
      }
      const successRate = success / 10_000;
      const rbRate = fails > 0 ? rollbacks / fails : 0;
      const sTol = 3 * Math.sqrt((0.6 * 0.4) / 10_000);
      const rTol = 3 * Math.sqrt((0.25 * 0.75) / Math.max(1, fails));
      let monotone = true;
      for (let f = 0; f < 20; f++) {
        if (successChanceOf(5, f + 1, T) < successChanceOf(5, f, T) - 1e-12) monotone = false;
      }
      return Math.abs(successRate - 0.6) < sTol && Math.abs(rbRate - 0.25) < rTol && monotone;
    }, { expected: 'успехи ≈0.60±0.015, откаты/провалы ≈0.25±0.02, монотонность', actual: 'см. расчёт в условии' }),
  );

  // ------------------------------------------- живые пробы (forge-live-checks.ts)
  results.push(...(await runForgeLiveChecks()));

  // [FIX-PHASE-2 · 4.5] BAL-1 (дрейф L20+, AUDIT-M10) — верификация ФОРМУЛОЙ
  // (правка баланса ВНЕ сеанса; матрица решений для спеки — в отчёте):
  // аналитическое свойство ратифицированных формул §4 карточки M10:
  //   E[ΔL] = c − (1−c)·rb — ожидание изменения уровня за попытку.
  // При rb-капе 0.45 и минимальной базе c=0.05 (L≥15): E = −0.3775 < 0 —
  // высокий уровень гарантированно тянет вниз (монте-карло не нужен);
  // порог сходимости c* = rb/(1+rb) ≈ 0.31 — дрейф вниз при c < c*.
  // Восходящая фаза подтверждается на L0 (E > 0) — «старт-на-уровне» AUDIT-M10.
  {
    const T = FORGE_TABLE;
    const rbCap = T.rollback.cap;
    const cStar = rbCap / (1 + rbCap);
    let driftOk = true;
    let ascentOk = false;
    for (let L = 0; L <= 50; L++) {
      const c = baseSuccessOf(L, T);
      const rb = rollbackChanceOf(L, T);
      const e = c - (1 - c) * rb;
      if (L >= 15 && e >= 0) driftOk = false; // дрейф вниз — строго
      if (L === 0 && e > 0) ascentOk = true; // старт — вверх
    }
    const e15 = 0.05 - (1 - 0.05) * rbCap;
    results.push(
      check(
        `BAL-1 формулой: E[ΔL] = c − (1−c)·rb < 0 при L≥15 (rb-кап ${rbCap}, c=min ${T.baseSuccess.min} → E=${e15.toFixed(4)}); L0 — восходящая фаза; порог c* = rb/(1+rb) ≈ ${cStar.toFixed(2)} (дрейф вниз при c < c*)`,
        () => driftOk && ascentOk && cStar > 0.3 && cStar < 0.32 && e15 < 0,
      ),
    );
  }

  return group('M10 · Заточка: шансы, pity, откат и statScale (§2–§4)', results);
}
