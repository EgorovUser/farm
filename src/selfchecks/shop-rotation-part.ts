/**
 * Self-checks M04.1 — часть 1: ротация стока §2 (состав/детерминизм/30%/скидки/
 * капы). Оракулы: доступный пул (полки categories=0) = 60 − 20 закрытых = 40
 * [FIX-PHASE-2 · 4.1: пул 53→60 — карточка M04 §2 «~60», OBS-1 M04.2 закрыт];
 * ролл = ceil(0.30 × 40) = 12 в день (счётный тест на 100 «днях», §7.2);
 * базовый ассортимент §2(а) — 6 строк; скидки 5..50%, шанс 25% → 63% (ур. 20);
 * капы PriceBus: итог ≤ 90%, пол ceil(base × 0.1) (04-DISCOUNTS §4).
 */
import type { ShopTable } from '@/content/balance/shop';
import type { ShopPoolEntry } from '@/content/shopPool';
import { check, type CheckResult } from './types';
import { makeSeededShopGame, makeShopGame, stockOf, nextDay, type Stock, type StockEntry } from './shop-fixture';

export async function shopRotationChecks(): Promise<CheckResult[]> {
  const results: CheckResult[] = [];
  const probe = makeShopGame();
  const pool = probe.game.content.get<ShopPoolEntry[]>('shop.pool');
  const table = probe.game.content.get<ShopTable>('shop');
  probe.dispose();

  const availableBase = pool.filter(
    (e) => !table.categories.unlockOrder.includes(e.category),
  ).length;
  const rolledPerDay = Math.ceil((30 / 100) * availableBase);
  // --- 1. Сток-гарантия + состав §2 (база + ровно ceil(30% × пул) роллов)
  const f1 = await makeSeededShopGame('selfcheck-shop-1');
  const s1 = stockOf(f1);
  const baseRows = s1.entries.filter((e) => e.base);
  const rolledRows = s1.entries.filter((e) => !e.base && !e.pinned);
  results.push(
    check(`состав §2: базовый ассортимент 6 строк (репа 30/корм 12/удобрение 6/лопата 2/лейка 2/ремкомплект 3) + роллов ceil(0.30×${availableBase})=${rolledPerDay}`, () => {
      const want: Record<string, number> = { seed_turnip: 30, feed: 12, fertilizer: 6, shovel: 2, watering_can: 2, repair_kit: 3 };
      const got: Record<string, number> = {};
      for (const e of baseRows) got[e.id] = e.qty;
      return (
        s1.dateISO === '2024-01-01' &&
        baseRows.length === 6 &&
        Object.keys(want).every((k) => got[k] === want[k]) &&
        Object.keys(got).length === 6 &&
        rolledRows.length === rolledPerDay
      );
    }, { expected: `база 6 строк + ${rolledPerDay} роллов`, actual: `база ${baseRows.length}, роллов ${rolledRows.length}` }),
  );

  // --- 2. Детерминизм §7.1: повторная ротация того же дня — байт-в-байт
  const before = JSON.stringify(s1);
  const rr = f1.shop['shop.reroll']() as { dateISO: string; changed: boolean };
  results.push(
    check('детерминизм §7.1: shop.reroll того же дня — сток байт-в-байт (changed=false), закрытие/открытие игры бесполезно', () =>
      rr.changed === false && JSON.stringify(stockOf(f1)) === before),
  );

  // --- 3. Счётный тест 100 «дней» §7.2: ровно ceil(30% × пул) роллов в день;
  //     разнообразие: объединение роллов накрывает большую часть пула
  let allExact = true;
  const union = new Set<string>();
  for (let d = 0; d < 100; d++) {
    const stock = stockOf(f1);
    const rolled = stock.entries.filter((e) => !e.base && !e.pinned);
    if (rolled.length !== rolledPerDay) allExact = false;
    for (const e of rolled) union.add(e.id);
    nextDay(f1);
  }
  results.push(
    check(`счётный тест 100 дней §7.2: ровно ${rolledPerDay} роллов/день; объединение ${union.size}/${availableBase} позиций пула`, () =>
      allExact && union.size >= Math.floor(availableBase * 0.7), { expected: `100×${rolledPerDay}, покрытие ≥70%`, actual: `exact=${allExact}, union=${union.size}` }),
  );

  // --- 4. Скидки: границы 5..50 + шанс растёт от уровня (25% → 63% на ур. 20)
  let boundsOk = true;
  let disc1 = 0;
  let rolled1 = 0;
  for (let d = 0; d < 60; d++) {
    const stock = stockOf(f1);
    for (const e of stock.entries) {
      if (e.discount !== undefined && (e.discount < 5 || e.discount > 50)) boundsOk = false;
      if (!e.base && !e.pinned) {
        rolled1 += 1;
        if (e.discount !== undefined) disc1 += 1;
      }
    }
    nextDay(f1);
  }
  f1.shop['shop.levelup'](19); // ур. 20 → 25 + 2×19 = 63%
  let disc20 = 0;
  let rolled20 = 0;
  for (let d = 0; d < 60; d++) {
    const stock = stockOf(f1);
    for (const e of stock.entries) {
      if (!e.base && !e.pinned) {
        rolled20 += 1;
        if (e.discount !== undefined) disc20 += 1;
      }
    }
    nextDay(f1);
  }
  results.push(
    check('скидки §7.3: размер всегда 5..50; шанс растёт от уровня (ур.1 ~25% → ур.20 ~63%)', () => {
      const r1 = disc1 / Math.max(1, rolled1);
      const r20 = disc20 / Math.max(1, rolled20);
      return boundsOk && r1 > 0.1 && r20 > r1 + 0.2 && r20 <= 0.85;
    }, { expected: 'границы 5..50; 0.10 < r1 < r20 − 0.2', actual: `r1=${(disc1 / Math.max(1, rolled1)).toFixed(2)}, r20=${(disc20 / Math.max(1, rolled20)).toFixed(2)}` }),
  );

  // --- 5. Капы PriceBus §7.3: слот −50% + внешние локальные источники →
  //     итог ≤ 90%, пол базы (скан дат: скидочная строка гарантированно
  //     встречается среди первых 10 дней при любом фиксированном saveId)
  const f2 = await makeSeededShopGame('selfcheck-shop-2');
  let discounted: StockEntry | null = null;
  for (let d = 0; d < 10 && discounted === null; d++) {
    const stock = stockOf(f2);
    discounted = stock.entries.find((e) => e.discount !== undefined && e.kind === 'item') ?? null;
    if (discounted === null) nextDay(f2);
  }
  if (discounted) {
    const def = f2.itemById.get(discounted.id)!;
    const capB = f2.game.priceBus.buyPrice(def, { ctx: { buyer: 'player', now: f2.game.time.now() } });
    const floor = Math.ceil(capB.base * 0.1);
    results.push(
      check('капы §7.3: суммарная скидка ≤ 90% (группа локальных капится 40%), цена ≥ ceil(base×0.1)', () =>
        capB.totalDiscountPercent <= 90.0001 &&
        capB.final >= floor &&
        capB.localSumPercent <= 40.0001, { expected: 'итог ≤ 90%, пол базы', actual: `скидка ${capB.totalDiscountPercent.toFixed(1)}%, цена ${capB.final} ≥ ${floor}` }),
    );
  } else {
    results.push(check('капы §7.3: за 10 дней встретилась скидочная строка', () => false, { expected: 'скидочная строка', actual: 'не найдена' }));
  }

  f1.dispose();
  f2.dispose();

  return results;
}
