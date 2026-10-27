/**
 * Self-checks M04.2 — ветви прокачки §3 (покупка уровней за золото:
 * витрина/стоимости/капы/валидации выборов/эффекты со следующего завоза/
 * снапшот-инвариант/сейв-раундтрип) + C2-реролл-экономика AUDIT-M03
 * (база по редкости: живой реролл легендарки 150, инвариант калибровки
 * база ∈ [5%, 25%] цены гира). Фикстуры — ФИКСИРОВАННЫЕ saveId
 * ([DECISION] M04.1: ротация сидируется dailySeed(saveId, дата) —
 * детерминизм вывода байт-в-байт ×2).
 */
import { MemoryStorage } from '@/kernel/save/storage-drivers';
import { ITEMS, RARITY_ORDER } from '@/content/items/items';
import { MODFORGE_TABLE } from '@/content/balance/modforge';
import { check, group, type CheckGroup, type CheckResult } from './types';
import {
  makeSeededShopGame,
  makeShopGame,
  stockOf,
  nextDay,
  grantGold,
  drainGold,
  T0,
  type ShopFixture,
  type Stock,
  type R,
} from './shop-fixture';

interface BranchRow {
  key: string;
  level: number;
  maxLevel: number;
  nextCost: number | null;
  effect: string;
  picks: string[];
  nextShelf: string | null;
}

interface BranchReceipt {
  branch: string;
  level: number;
  cost: number;
  pick?: string;
  nextCost: number | null;
}

function branchView(f: ShopFixture): BranchRow[] {
  return f.shop['shop.branch.view']() as BranchRow[];
}

function branchBuy(f: ShopFixture, name: string, pick?: string): R<BranchReceipt> {
  return f.shop['shop.branch.buy'](name, pick) as R<BranchReceipt>;
}

function rolledOf(stock: Stock): Stock['entries'] {
  return stock.entries.filter((e) => !e.base && !e.pinned);
}

export async function shopBranchChecks(): Promise<CheckGroup> {
  const results: CheckResult[] = [];

  // --- 1. Витрина ветвей: 6 строк, уровни 0, цены первых уровней из таблицы
  const f1 = await makeSeededShopGame('selfcheck-branch-1');
  stockOf(f1);
  const rows1 = branchView(f1);
  results.push(
    check('ветви §3: витрина — 6 ветвей, уровни 0, первые уровни 150/200/250/120/180/400 золота, «Категории» → полка baits', () => {
      const by = (k: string) => rows1.find((r) => r.key === k);
      return (
        rows1.length === 6 &&
        rows1.every((r) => r.level === 0 && r.effect.length > 0 && r.picks.length === 0) &&
        by('assortment')?.nextCost === 150 &&
        by('permanent')?.nextCost === 200 &&
        by('supplies')?.nextCost === 250 &&
        by('ties')?.nextCost === 120 &&
        by('categories')?.nextCost === 180 &&
        by('luxury')?.nextCost === 400 &&
        by('categories')?.nextShelf === 'baits'
      );
    }),
  );

  // --- 2. «Торговые связи»: 120 золота → ур.1, discountChance 25 → 27 (StatBus)
  grantGold(f1, 500);
  const tiesBuy = branchBuy(f1, 'ties');
  const chanceAfter = f1.game.statBus.resolve({ stat: 'shop.roll.discountChance', ctx: f1.game.time.ctx('player') });
  results.push(
    check('ветви §3: «Торговые связи» ур.1 за 120 (500→380) → discountChance 27 (база 25 + 2% связи, уровень свыше первого), след. уровень 192', () =>
      tiesBuy.ok &&
      tiesBuy.value.cost === 120 &&
      tiesBuy.value.level === 1 &&
      tiesBuy.value.nextCost === 192 &&
      f1.game.wallet.get('gold') === 380 &&
      chanceAfter === 27 &&
      branchView(f1).find((r) => r.key === 'ties')?.level === 1),
  );

  // --- 3. [DECISION] снапшот: покупка ветви НЕ пересоздаёт сегодняшний завоз
  const stockBeforeBuy = JSON.stringify(f1.shop['shop.stock']());
  branchBuy(f1, 'ties'); // ур.2 за 192
  results.push(
    check('ветви §3: снапшот дня — покупка ветви не меняет сегодняшний завоз (байт-в-байт), кошелёк 380−192=188', () =>
      JSON.stringify(f1.shop['shop.stock']()) === stockBeforeBuy && f1.game.wallet.get('gold') === 188),
  );

  // --- 4. Атомарность без золота + кап уровня (supplies maxLevel 2 → qtyMax 7)
  drainGold(f1);
  const noGold = branchBuy(f1, 'supplies');
  const suppliesBefore = branchView(f1).find((r) => r.key === 'supplies')?.level;
  grantGold(f1, 2000);
  const s1 = branchBuy(f1, 'supplies');
  const s2 = branchBuy(f1, 'supplies');
  const s3 = branchBuy(f1, 'supplies');
  results.push(
    check('ветви §3: без золота — отказ, уровень не тронут; «Поставки» 250+500 → ур.2 (кап), третья — отказ, кошелёк 1250, qtyMax 5→7', () =>
      !noGold.ok &&
      suppliesBefore === 0 &&
      s1.ok && s1.value.cost === 250 &&
      s2.ok && s2.value.cost === 500 &&
      !s3.ok &&
      f1.game.wallet.get('gold') === 2000 - 750 &&
      f1.game.statBus.resolve({ stat: 'shop.roll.qtyMax', ctx: f1.game.time.ctx('player') }) === 7),
  );
  f1.dispose();

  // --- 5. «Ассортимент»: валидация выборов (без выбора / вне каталога / мусор)
  const f2 = await makeSeededShopGame('selfcheck-branch-2');
  stockOf(f2);
  grantGold(f2, 1000);
  const noPick = branchBuy(f2, 'assortment');
  const offCatalog = branchBuy(f2, 'assortment', 'seed_turnip'); // базовый товар — вне каталога
  const junkPick = branchBuy(f2, 'assortment', 'несуществующий');
  const junkBranch = branchBuy(f2, 'бред');
  results.push(
    check('ветви §3 «Ассортимент»: без выбора / вне каталога «что привозить» / мусорная ветка — отказы, деньги целы (1000)', () =>
      !noPick.ok && !offCatalog.ok && !junkPick.ok && !junkBranch.ok && f2.game.wallet.get('gold') === 1000),
  );

  // --- 6. «Ассортимент»: выбор river_perch (150) → пул дня 40→41 → роллов 13
  const pickBuy = branchBuy(f2, 'assortment', 'river_perch');
  const dupPick = branchBuy(f2, 'assortment', 'river_perch');
  nextDay(f2);
  const s2d1 = stockOf(f2);
  results.push(
    // [FIX-PHASE-2 · 4.1] [DECISION] оракул ПОИМЁННО: пул 53→60 (доступная база
    // 33→40) — числа пересчитаны по факту нового N: 34→41, ceil(0.30×41)=13
    check('ветви §3 «Ассортимент»: river_perch за 150 (фикс данных M04.1 — дубли пула были no-op) → выбор в состоянии; дубль — отказ; следующий день: пул 41 → роллов ceil(0.30×41)=13', () =>
      pickBuy.ok && pickBuy.value.cost === 150 && !dupPick.ok &&
      branchView(f2).find((r) => r.key === 'assortment')?.picks.join(',') === 'river_perch' &&
      rolledOf(s2d1).length === 13),
  );

  // --- 7. «Постоянный заказ»: валидация (вне пула / закрытая полка) + покупка
  const offPool = branchBuy(f2, 'permanent', 'silk'); // каталог ассортимента, но НЕ выбран — вне пула
  const lockedShelf = branchBuy(f2, 'permanent', 'worm_bait'); // полка baits закрыта (categories 0)
  const pinBuy = branchBuy(f2, 'permanent', 'healing_herb');
  nextDay(f2);
  const s2d2 = stockOf(f2);
  results.push(
    check('ветви §3 «Постоянный заказ»: вне пула / закрытая полка — отказы; healing_herb за 200 → закреплён (pinned в состоянии, в завозе ежедневно)', () =>
      !offPool.ok && !lockedShelf.ok && pinBuy.ok && pinBuy.value.cost === 200 &&
      branchView(f2).find((r) => r.key === 'permanent')?.picks.join(',') === 'healing_herb' &&
      s2d2.entries.some((e) => e.id === 'healing_herb')),
  );

  // --- 8. «Категории»: ур.1 (180) → полка baits в пуле: 41+6 → роллов 15
  const catBuy = branchBuy(f2, 'categories');
  nextDay(f2);
  const s2d3 = stockOf(f2);
  results.push(
    // [FIX-PHASE-2 · 4.1] [DECISION] оракул ПОИМЁННО: пул 47 (41 с выбором +
    // 6 baits) → ceil(0.30×47)=15
    check('ветви §3 «Категории»: ур.1 за 180 → полка baits открыта (след. potions): пул 47 → роллов ceil(0.30×47)=15', () =>
      catBuy.ok && catBuy.value.cost === 180 &&
      branchView(f2).find((r) => r.key === 'categories')?.nextShelf === 'potions' &&
      rolledOf(s2d3).length === 15),
  );
  f2.dispose();

  // --- 9. «Люкс-витрина»: 400 → ур.1 (кап); следующий день: 10 роллов + 1 rare+
  const f3 = await makeSeededShopGame('selfcheck-branch-3');
  stockOf(f3);
  grantGold(f3, 500);
  const luxBuy = branchBuy(f3, 'luxury');
  nextDay(f3);
  const stockLux = stockOf(f3);
  const rolled3 = rolledOf(stockLux);
  const rarePlus3 = rolled3.filter((e) => {
    const def = f3.itemById.get(e.id);
    return def !== undefined && RARITY_ORDER[def.rarity] >= RARITY_ORDER.rare;
  }).length;
  results.push(
    // [FIX-PHASE-2 · 4.1] [DECISION] оракул ПОИМЁННО: доступная база 40 →
    // ceil(0.30×40)=12 → «13 роллов (12+1 сверх 30%)»
    check('ветви §3 «Люкс-витрина»: 400 → ур.1 (кап, nextCost null); следующий день: 13 роллов (12+1 сверх 30%) и rare+ ≥ 1', () =>
      luxBuy.ok && luxBuy.value.cost === 400 && luxBuy.value.nextCost === null &&
      rolled3.length === 13 && rarePlus3 >= 1),
  );
  f3.dispose();

  // --- 10. Сейв-раундтрип: уровни/выборы/заказы переживают dispose/load
  const storageRt = new MemoryStorage();
  await storageRt.set('main', JSON.stringify({
    saveVersion: 6,
    savedAt: T0,
    saveId: 'selfcheck-branch-4',
    contentVersion: '0.0.1',
    lastSeen: T0,
    modules: { 'kernel.wallet': { balances: [['gold', 1000]] } },
  }));
  const f4 = makeShopGame(storageRt);
  await f4.game.init();
  stockOf(f4);
  branchBuy(f4, 'ties'); // 120
  branchBuy(f4, 'assortment', 'spices'); // 150
  branchBuy(f4, 'permanent', 'cloth'); // 200
  f4.dispose(); // сохраняет
  const f5 = makeShopGame(storageRt);
  await f5.game.init();
  const rows5 = branchView(f5);
  const chance5 = f5.game.statBus.resolve({ stat: 'shop.roll.discountChance', ctx: f5.game.time.ctx('player') });
  results.push(
    check('сейв v7: ветви переживают dispose/load (ties 1 + выбор spices + заказ cloth; discountChance 27 после загрузки; золото 530)', () =>
      rows5.find((r) => r.key === 'ties')?.level === 1 &&
      rows5.find((r) => r.key === 'assortment')?.picks.join(',') === 'spices' &&
      rows5.find((r) => r.key === 'permanent')?.picks.join(',') === 'cloth' &&
      chance5 === 27 &&
      f5.game.wallet.get('gold') === 530),
  );
  f5.dispose();

  // --- 11. C2: живой реролл легендарного гира — 150 золота (база legendary)
  const f6 = await makeSeededShopGame('selfcheck-branch-5');
  grantGold(f6, 200);
  f6.inv['inventory.add']('dragon_fang', 'C', 50, 1, 'selfcheck');
  const dfIid = (f6.inv['inventory.list']() as Array<{ iid: string; defId: string }>).find((e) => e.defId === 'dragon_fang')?.iid;
  const mf6 = f6.game.modules.get('modforge')?.api ?? {};
  const rrLeg = dfIid
    ? (mf6['modforge.reroll'](dfIid) as R<{ cost: number; attempts: number; nextCost: number }>)
    : ({ ok: false, error: 'фикстура: dragon_fang не выдан' } as R<never>);
  results.push(
    check('C2: живой реролл легендарного гира — 150 золота (200→50), попытка 1, следующая 173 (кап 1500)', () =>
      rrLeg.ok && rrLeg.value.cost === 150 && rrLeg.value.attempts === 1 && rrLeg.value.nextCost === 173 && f6.game.wallet.get('gold') === 50),
  );
  f6.dispose();

  // --- 12. C2: инвариант калибровки — база реролла ∈ [3%, 25%] цены гира
  //     [M04.2 · [DECISION]] коридор [5%, 25%] амендирован заказчиком
  //     [M07.2 · D5 · Task 45]: нижняя граница 5% → 3% (решение №5,
  //     2026-10-25) — лестница удочек M07.1 (цены F4 ратифицированы):
  //     bamboo 20.0% / walnut 13.3% / glass 10.0% / carbon 8.9% / mithril
  //     (эпик 2000з) 4.0% / flow (легендарная 5000з) 3.0% — все в [3%, 25%];
  //     baseCostByRarity и кап ×10 — БЕЗ изменений
  const rerollTable = MODFORGE_TABLE.reroll;
  const gear = ITEMS.filter((d) => d.modSlots);
  const bad = gear.filter((d) => {
    const ratio = rerollTable.baseCostByRarity[d.rarity] / d.basePrice;
    return ratio < 0.03 || ratio > 0.25;
  });
  results.push(
    // [FIX-PHASE-2 · 4.2] 6 → 8 строк (наковальня куёт топоры); [M07.1] +6
    // удочек — 14 строк реролл-гира; [M07.2 · D5] коридор [3%, 25%]
    check('C2: калибровка золотого цикла — база реролла в [3%, 25%] цены modSlots-предмета (14 строк; амендимент D5 Task 45)', () =>
      gear.length === 14 && bad.length === 0, {
      expected: '14 предметов, 0 нарушений',
      actual: bad.map((d) => `${d.id}: ${((rerollTable.baseCostByRarity[d.rarity] / d.basePrice) * 100).toFixed(1)}%`).join(', ') || '0',
    }),
  );

  return group('M04 · Магазин: ветви и реролл-экономика (§3/C2)', results);
}
