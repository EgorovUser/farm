/**
 * Self-checks M02.3 — sell/wear-подгруппа (бриф §2.4/§2.5): порядок изъятия D25,
 * цена-оракулы по формуле §5 02-BUSES (множители тира/редкости — внутри base),
 * wallet.transaction/item.sold, отказы (экипировка D30, qty, пустой инвентарь),
 * wear (D35: клэмп, сломан → модов нет, invalidate.stat). Возвращает сырые
 * результаты — группа собирается в inventory-action-checks.ts (01 §6).
 */
import { check, type CheckResult } from './types';
import {
  addQ,
  addXp,
  byDef,
  goldOf,
  list,
  makeActionGame,
  resolveAttack,
  sell,
  wear,
  type R,
} from './inventory-action-fixture';

export async function runInventorySellWearChecks(): Promise<CheckResult[]> {
  const results: CheckResult[] = [];

  // --- 5. sell: порядок D25 + цена-оракулы (§5: round(base × 0.40), множители в base)
  const f2 = makeActionGame();
  addQ(f2.api, 'apple_pie', 'D', 10, 5);
  addQ(f2.api, 'apple_pie', 'B', 40, 5);
  const goldBefore = goldOf(f2);
  let soldEvents: Array<Record<string, unknown>> = [];
  let walletSell: Array<Record<string, unknown>> = [];
  const offS = f2.game.bus.subscribe('item.sold', (p) => {
    soldEvents.push(p as Record<string, unknown>);
  });
  const offWS = f2.game.bus.subscribe('wallet.transaction', (p) => {
    walletSell.push(p as Record<string, unknown>);
  });
  const sellD = sell(f2.api, 'apple_pie', 2);
  offS();
  offWS();
  results.push(
    check('sell: изъяты худшие вперёд (D25) — D-стак 5→3, B-запись цела', () => {
      if (!sellD.ok) return false;
      const d = byDef(f2.api, 'apple_pie').find((it) => it.quality.tier === 'D');
      const b = byDef(f2.api, 'apple_pie').find((it) => it.quality.tier === 'B');
      return d?.qty === 3 && b?.qty === 5;
    }),
  );
  // оракул: round(15 × 0.7 × 0.4) = round(4.2) = 4/шт → 2 шт = 8 золота
  results.push(
    check('sell: цена-оракул D-партии — round(15 × 0.7 × 0.4) = 4/шт → +8 золота', () =>
      sellD.ok && sellD.value.gold === 8 && sellD.value.chunks[0].unitPrice === 4 && goldOf(f2) === goldBefore + 8),
  );
  results.push(
    check('sell: wallet.transaction ровно одно, grants — золото (канон денег, D34)', () =>
      walletSell.length === 1 &&
      JSON.stringify(walletSell[0].grants) === JSON.stringify([{ t: 'currency', id: 'gold', qty: 8 }])),
  );
  results.push(
    // [FIX-PHASE-2 · 4.6 · N6] байт-строгий оракул обновлён ПОИМЁННО:
    // payload item.sold обогащён полем gold (маркер карточки M15 §3, вариант (а))
    check('sell: item.sold ровно одно { defId, qty, gold } — без iid/quality/price (D34 + N6)', () =>
      soldEvents.length === 1 &&
      JSON.stringify(soldEvents[0]) === JSON.stringify({ defId: 'apple_pie', qty: 2, gold: 8 })),
  );

  // --- 6. sell: разнородная партия (D×1 + B×2 → продажа 2: 4 + 8 = 12)
  const f2b = makeActionGame();
  addQ(f2b.api, 'apple_pie', 'D', 10, 1); // худший стак — всего 1 единица
  addQ(f2b.api, 'apple_pie', 'B', 40, 2);
  const sellMix = sell(f2b.api, 'apple_pie', 2);
  results.push(
    check('sell: разнородная партия — цена по фактическим единицам (D 4 + B 8 = 12)', () =>
      sellMix.ok &&
      sellMix.value.gold === 12 &&
      sellMix.value.chunks.length === 2 &&
      sellMix.value.chunks[0].tier === 'D' &&
      sellMix.value.chunks[1].tier === 'B' &&
      byDef(f2b.api, 'apple_pie').length === 1 &&
      byDef(f2b.api, 'apple_pie')[0].quality.tier === 'B' &&
      byDef(f2b.api, 'apple_pie')[0].qty === 1),
  );

  // --- 6b. [FIX-PHASE-2 · 4.6 · N6] денежный счётчик sell.gold суммирует
  //     поле gold payload item.sold (маркер M15 §3 / Task 29, вариант (а));
  //     вторая продажа добивает сумму — счётчик аддитивен
  const goldCounterBefore = f2b.game.stats.get("sell.gold");
  const sellMore = sell(f2b.api, 'apple_pie', 1);
  results.push(
    check('N6: sell.gold — счётчик суммирует gold продаж (данные о данных: valueKey gold)', () =>
      sellMore.ok && f2b.game.stats.get("sell.gold") === goldCounterBefore + sellMore.value.gold),
  );
  f2b.dispose();

  // --- 6c. [FIX-PHASE-2 · 4.7 · SALV-1] «Разобрать» (карточка M02 §3):
  //     25% материалов рецепта (ceil в пользу игрока), точечный iid,
  //     качество/моды/заточка теряются, экипированное не разбирается (D30)
  const fSal = makeActionGame();
  addQ(fSal.api, 'shovel', 'C', 50, 1); // рецепт wb_shovel: planks×2 + iron_ingot×1
  const shovelIid = byDef(fSal.api, 'shovel')[0].iid;
  let salvagedEvents: Array<Record<string, unknown>> = [];
  const offSal = fSal.game.bus.subscribe('item.salvaged', (p) => {
    salvagedEvents.push(p as Record<string, unknown>);
  });
  const salR = fSal.api['inventory.salvage'](shovelIid) as R<{ iid: string; defId: string; recipeId: string; returned: Array<{ defId: string; qty: number }> }>;
  const salAgain = fSal.api['inventory.salvage'](shovelIid) as R<unknown>;
  const salGhost = fSal.api['inventory.salvage']('nope#1') as R<unknown>;
  offSal();
  addQ(fSal.api, 'apple_pie', 'C', 50, 1); // еды без рецепта в каталоге крафта нет
  const pieIid = byDef(fSal.api, 'apple_pie')[0].iid;
  const salNoRecipe = fSal.api['inventory.salvage'](pieIid) as R<unknown>;
  results.push(
    check('SALV-1: разбор 25% материалов рецепта (shovel → planks ×1 + iron_ingot ×1), запись изъята, item.salvaged ровно одно', () =>
      salR.ok &&
      salR.value.recipeId === 'wb_shovel' &&
      JSON.stringify(salR.value.returned) === JSON.stringify([{ defId: 'planks', qty: 1 }, { defId: 'iron_ingot', qty: 1 }]) &&
      fSal.game.wallet.get('planks') === 1 &&
      byDef(fSal.api, 'iron_ingot').length === 1 &&
      byDef(fSal.api, 'shovel').length === 0 &&
      salvagedEvents.length === 1 &&
      salvagedEvents[0].iid === shovelIid),
  );
  results.push(
    check('SALV-1: отказы — повтор записи («не найдена»), мусорный iid, предмет без рецепта крафта', () =>
      !salAgain.ok && salAgain.error.includes('не найдена') &&
      !salGhost.ok &&
      !salNoRecipe.ok && salNoRecipe.error.includes('нет рецепта')),
  );
  fSal.dispose();

  // --- 6d. SALV-1: экипированная запись не разбирается (D30)
  const fEq = makeActionGame();
  addXp(fEq, 600); // уровень 5 — гейт меча
  addQ(fEq.api, 'iron_sword', 'D', 50, 1);
  const swIid = byDef(fEq.api, 'iron_sword')[0].iid;
  fEq.api['inventory.equip'](swIid, 'weapon');
  const salEq = fEq.api['inventory.salvage'](swIid) as R<unknown>;
  results.push(
    check('SALV-1: экипированный предмет не разбирается («сначала снимите», D30)', () =>
      !salEq.ok && salEq.error.includes('экипирована')),
  );
  fEq.dispose();

  // --- 7. sell: отказы — экипированная защита и qty сверх наличного
  const f3 = makeActionGame();
  addXp(f3, 600); // уровень 5 — гейт меча
  addQ(f3.api, 'iron_sword', 'D', 50, 1);
  addQ(f3.api, 'iron_sword', 'D', 60, 1);
  const swords = byDef(f3.api, 'iron_sword');
  f3.api['inventory.equip'](swords[0].iid, 'weapon');
  const goldF3 = goldOf(f3);
  let sellFailEvents = 0;
  const offSF = f3.game.bus.subscribe('item.sold', () => sellFailEvents++);
  const offWF = f3.game.bus.subscribe('wallet.transaction', () => sellFailEvents++);
  const sellEquipped = sell(f3.api, 'iron_sword', 2);
  offSF();
  offWF();
  results.push(
    check('sell: нехватка незэкипированных — отказ «сначала снимите» (D30), без потерь', () =>
      !sellEquipped.ok &&
      sellEquipped.error.includes('сначала снимите') &&
      goldOf(f3) === goldF3 &&
      sellFailEvents === 0),
  );
  addQ(f3.api, 'bread', 'D', 30, 5);
  const snapBeforeQtyFail = JSON.stringify(list(f3.api));
  const sellQty = sell(f3.api, 'bread', 99);
  results.push(
    check('sell: qty сверх наличного — отказ, состояние и кошелёк не тронуты', () =>
      !sellQty.ok &&
      sellQty.error.includes('не хватает') &&
      goldOf(f3) === goldF3 &&
      JSON.stringify(list(f3.api)) === snapBeforeQtyFail &&
      byDef(f3.api, 'bread')[0].qty === 5),
  );
  const sellEmpty = sell(f3.api, 'turnip', 1);
  results.push(
    check('sell: пустой инвентарь по defId — отказ с причиной', () =>
      !sellEmpty.ok && sellEmpty.error.includes('не хватает предметов turnip')),
  );

  // --- 8. wear: клэмп, сломан-гейт, invalidate.stat (D35)
  const f4 = makeActionGame();
  addQ(f4.api, 'iron_pickaxe', 'D', 40, 1);
  const f4Pick = byDef(f4.api, 'iron_pickaxe')[0]?.iid ?? '';
  let invalidations = 0;
  const offInv = f4.game.bus.subscribe('invalidate.stat', () => invalidations++);
  const wear5 = wear(f4.api, f4Pick, 5);
  const wornList = byDef(f4.api, 'iron_pickaxe')[0];
  results.push(
    check('wear: −5 от 100 → 95/100, запись жива (D35)', () =>
      wear5.ok && wear5.value.current === 95 && wornList?.durability?.current === 95),
  );
  results.push(
    check('wear: износ НЕэкипированной записи — БЕЗ invalidate.stat (resolve не меняется)', () =>
      invalidations === 0),
  );
  const wearHuge = wear(f4.api, f4Pick, 200);
  results.push(
    check('wear: клэмп 0..max — 95 − 200 → 0/100, СЛОМАН, запись НЕ исчезает', () =>
      wearHuge.ok && wearHuge.value.current === 0 && wearHuge.value.broken && byDef(f4.api, 'iron_pickaxe').length === 1),
  );
  offInv();
  // сломан → resolve к базе: меч 17 → износ до 0 → 5 (оракул M02.2)
  addXp(f4, 600);
  addQ(f4.api, 'iron_sword', 'D', 50, 1);
  const f4Sword = byDef(f4.api, 'iron_sword')[0]?.iid ?? '';
  f4.api['inventory.equip'](f4Sword, 'weapon');
  const attackBefore = resolveAttack(f4); // 5 + 12 = 17
  let equippedInvalidations = 0;
  const offEqInv = f4.game.bus.subscribe('invalidate.stat', () => equippedInvalidations++);
  const wearEquipped = wear(f4.api, f4Sword, 80);
  offEqInv();
  results.push(
    check('wear: сломан-гейт — equip 17 → износ до 0 → resolve к базе 5; invalidate.stat опубликован', () =>
      wearEquipped.ok &&
      attackBefore === 17 &&
      resolveAttack(f4) === 5 &&
      equippedInvalidations >= 1),
  );

  f2.dispose();
  f3.dispose();
  f4.dispose();

  return results;
}
