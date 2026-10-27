/**
 * Self-checks M04.1 — часть 3: экономика/прогрессия/сейв — валютная покупка
 * §5 (gold → feed атомарно), XP/уровень §3 (5×5 XP = 25 → ур. 2; скидка
 * уровня −1% с ур. 5 в расшифровке PriceBus), ветки в ротации (crafted-сейв:
 * люкс +1 rare+, поставки qty ≤ 7, заказ cloth ×3, полки открыты → 18+1
 * роллов), сейв v6 (раундтрип стока/уровня + холодная v5-подкладка),
 * C3-инвариант (candidates ≥ maxPos) и C5 (строки трейтов §4).
 */
import { MemoryStorage } from '@/kernel/save/storage-drivers';
import { RARITY_ORDER, ITEMS } from '@/content/items/items';
import { MODFORGE_TABLE } from '@/content/balance/modforge';
import { MOD_TYPES } from '@/content/mods/registry';
import { check, type CheckResult } from './types';
import { makeSeededShopGame, makeShopGame, stockOf, grantGold, buy, T0, type Stock, type ShopFixture } from './shop-fixture';

export async function shopSaveChecks(): Promise<CheckResult[]> {
  const results: CheckResult[] = [];
  // --- 10. Валютная покупка §5: атомарная транзакция gold → feed
  const f7 = await makeSeededShopGame('selfcheck-shop-7');
  stockOf(f7);
  grantGold(f7, 100);
  const feedBuy = buy(f7, 'feed', 4);
  results.push(
    check('валютный товар §5: корм ×4 — gold −12, feed +4, сток −4, событие shop.purchased', () => {
      if (!feedBuy.ok) return false;
      const stock = f7.shop['shop.stock']() as Stock;
      const row = stock.entries.find((e) => e.id === 'feed');
      return (
        feedBuy.value.unitPrice === 3 &&
        feedBuy.value.total === 12 &&
        f7.game.wallet.get('gold') === 100 - 12 &&
        f7.game.wallet.get('feed') === 4 &&
        row !== undefined && row.qty === 8
      );
    }),
  );

  // --- 11. XP/уровень §3: 5 покупок × 5 XP → уровень 2 (кривая 25 × 1.25^0)
  let xpOk = true;
  for (let i = 0; i < 5; i++) buy(f7, 'seed_turnip');
  const view7 = f7.shop['shop.view']() as { level: number; xp: number; xpToNext: number };
  if (view7.level !== 2) xpOk = false;
  results.push(
    check('XP §3: 5 покупок × 5 XP = 25 (кривая уровня 1) → магазин ур. 2; скидка уровня с ур. 5 (−1%)', () => {
      if (!xpOk) return false;
      f7.shop['shop.levelup'](3); // ур. 5
      const view = f7.shop['shop.view']() as { levelDiscountPercent: number };
      return view.levelDiscountPercent === 1;
    }, { expected: 'ур. 2 после 5 покупок; −1% на ур. 5', actual: `ур. ${view7.level}, xp ${view7.xp}/${view7.xpToNext}` }),
  );

  // --- 12. Скидка уровня в PriceBus: расшифровка seed_turnip (база, без слота)
  const noDisc = (f7.shop['shop.stock']() as Stock).entries.find((e) => e.id === 'seed_turnip');
  if (noDisc) {
    const def = f7.itemById.get('seed_turnip')!;
    const b = f7.game.priceBus.buyPrice(def, { ctx: { buyer: 'player', now: T0 } });
    results.push(
      check('скидка уровня §6: localSum = 1% (−1% за ур. 5) в расшифровке PriceBus', () =>
        b.localSumPercent === 1 && b.applied.some((m) => m.id === 'shop.level'), { expected: 'локально 1%', actual: `${b.localSumPercent}% (${b.applied.map((m) => m.id).join(',')})` }),
    );
  }

  // --- 13. Ветки в ротации (crafted-сейв): люкс +1 rare+, поставки qty ≤ 7,
  //     постоянный заказ в стоке, все полки открыты (роллов ceil(0.30×53)=16)
  const storageB = new MemoryStorage();
  await storageB.set('main', JSON.stringify({
    saveVersion: 6,
    savedAt: T0,
    saveId: 'selfcheck-branches',
    contentVersion: '0.0.1',
    lastSeen: T0,
    modules: {
      shop: {
        v: 1,
        level: 1,
        xp: 0,
        branches: {
          assortmentPicks: [],
          pinned: ['cloth'],
          supplies: 2,
          ties: 0,
          categories: 4,
          luxury: 1,
        },
        stock: null,
      },
    },
  }));
  const f8 = makeShopGame(storageB);
  await f8.game.init();
  grantGold(f8, 100);
  const s8 = f8.shop['shop.stock']() as Stock;
  const rolled8 = s8.entries.filter((e) => !e.base && !e.pinned);
  const luxury8 = rolled8.filter((e) => {
    const def = e.kind === 'item' ? f8.itemById.get(e.id) : undefined;
    return def !== undefined && RARITY_ORDER[def.rarity] >= RARITY_ORDER.rare;
  }).length;
  results.push(
    // [FIX-PHASE-2 · 4.1] [DECISION] оракул ПОИМЁННО: пул 53→60, все полки
    // открыты → ceil(0.30×60)=18 + 1 люкс = 19 (было 16+1=17)
    check('ветки §3 (crafted-сейв): люкс +1 rare+; поставки qty ≤ 7; заказ cloth ×3; полки открыты → ceil(0.30×60)=18 роллов + 1 люкс', () => {
      const cloth = s8.entries.find((e) => e.id === 'cloth' && e.pinned);
      return (
        s8.dateISO === '2024-01-01' &&
        rolled8.length === 19 &&
        luxury8 >= 1 &&
        rolled8.every((e) => e.qty >= 1 && e.qty <= 7) &&
        cloth !== undefined && cloth.qty === 3
      );
    }, { expected: '17 роллов (16+люкс), rare+ ≥1, qty 1..7, cloth×3', actual: `роллов ${rolled8.length}, rare+ ${luxury8}, cloth ${s8.entries.find((e) => e.id === 'cloth')?.qty ?? 0}` }),
  );

  // --- 14. Сейв v7: раундтрип стока/уровня + холодная v5-подкладка
  f8.shop['shop.levelup'](4); // ур. 5
  buy(f8, 'feed', 2);
  f8.dispose(); // сохраняет
  const f9 = makeShopGame(storageB);
  await f9.game.init();
  const s9 = f9.shop['shop.stock']() as Stock;
  const feed9 = s9.entries.find((e) => e.id === 'feed');
  const v9 = f9.shop['shop.view']() as { level: number };
  const coldStorage = new MemoryStorage();
  await coldStorage.set('main', JSON.stringify({
    saveVersion: 5,
    savedAt: T0,
    saveId: 'selfcheck-cold-v5',
    contentVersion: '0.0.1',
    lastSeen: T0,
    modules: { 'kernel.wallet': { balances: [['gold', 77]] } },
  }));
  const f10 = makeShopGame(coldStorage);
  await f10.game.init();
  const coldStock = f10.shop['shop.stock']() as Stock;
  results.push(
    check('сейв v7: сток (feed 12−2=10) и уровень 5 переживают dispose/load; холодная v5 → v14, кошелёк цел, магазин свежий (сток дня) [M08 · v13 → M11 · v14]', () => // [M05.1 · v10 → M06.1 · v11 → M07.1 · v12: +срезы pen/fishing — легализация поимённо, прецедент M05.1]
      f9.game.save.info().saveVersion === 15 && // [M12.1 · v15]
      feed9 !== undefined && feed9.qty === 10 &&
      v9.level === 5 &&
      f10.game.save.info().saveVersion === 15 && // [M12.1 · v15]
      f10.game.wallet.get('gold') === 77 &&
      coldStock !== null && coldStock.dateISO === '2024-01-01', { expected: 'v13, feed 10, ур. 5; v5→v13, gold 77', actual: `v${f9.game.save.info().saveVersion}, feed ${feed9?.qty}, ур. ${v9.level}; cold v${f10.game.save.info().saveVersion}, gold ${f10.game.wallet.get('gold')}` }),
  );
  f7.dispose();
  f8.dispose();
  f9.dispose();
  f10.dispose();

  // --- 15. C3-инвариант (AUDIT-M03): candidates(скоуп) ≥ maxPos редкости
  //      каждого предмета с modSlots (новые rare+ gear магазина)
  const modsByTag = (tags: string[]): number =>
    MOD_TYPES.filter((m) => m.scopeTags.some((t) => tags.includes(t))).length;
  const violations = ITEMS.filter(
    (d) => d.modSlots && modsByTag(d.modSlots.tags) < MODFORGE_TABLE.byRarity[d.rarity].positives[1],
  );
  results.push(
    // [M10.2] легализация: реестр расширен карточными модами (14 строк: 9 + 5
    // скоупа card:forge — не пересекаются с modSlots предметов, инвариант жив)
    // [M07.1 · v12] +4 rod-мода (лестница удочек F4) — 18 строк
    check('C3-инвариант: candidates(скоуп) ≥ maxPos редкости всех modSlots-предметов (18 строк реестра)', () =>
      MOD_TYPES.length === 18 && violations.length === 0, { expected: '0 нарушений', actual: violations.map((v) => `${v.id} (${modsByTag(v.modSlots!.tags)}<${MODFORGE_TABLE.byRarity[v.rarity].positives[1]})`).join(', ') || '0' }),
  );

  // --- 16. C5-подтверждение: строки трейтов §4 в контенте (значения карточки)
  const w = MODFORGE_TABLE.traitBudgets.worker;
  const h = MODFORGE_TABLE.traitBudgets.helper;
  results.push(
    check('C5: трейты §4 — работник 6×звёзды/[1,2]/30%; помощник по редкости/[1,3]/50%', () =>
      w.budget.kind === 'perStar' && w.budget.perStar === 6 &&
      w.positives[0] === 1 && w.positives[1] === 2 && w.negChance === 0.3 &&
      h.budget.kind === 'fromRarity' &&
      h.positives[0] === 1 && h.positives[1] === 3 && h.negChance === 0.5),
  );

  return results;
}
