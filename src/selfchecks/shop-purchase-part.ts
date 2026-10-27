/**
 * Self-checks M04.1 — часть 2: покупки §5 — гейты §4 (repair_kit: отказ с
 * причиной на ур. 1, покупается с ур. 5), атомарность §7.5 (нет денег/места —
 * состояние не изменилось), C4 (покупка gear с modSlots → стартовые роллы у
 * новой записи, реролл-цикл жив, события shop.purchased + item.acquired).
 */
import { check, type CheckResult } from './types';
import { makeSeededShopGame, stockOf, grantGold, drainGold, buy, invCount, findRolledGear, nextDay, type Stock, type ShopFixture, type R } from './shop-fixture';

export async function shopPurchaseChecks(): Promise<CheckResult[]> {
  const results: CheckResult[] = [];
  // --- 6. Гейты §7.4: repair_kit (unlock ур. 5) — отказ с причиной на ур. 1,
  //     покупается с ур. 5 (гейты показываем: строка в стоке видна)
  const f3 = await makeSeededShopGame('selfcheck-shop-3');
  const s3 = stockOf(f3);
  const gateErr = buy(f3, 'repair_kit');
  results.push(
    check('гейт §7.4: repair_kit не покупается на ур. 1 — причина читаема («Откроется: уровень 5»)', () =>
      !gateErr.ok && gateErr.error.includes('Откроется: уровень 5') && s3.entries.some((e) => e.id === 'repair_kit'), { expected: 'отказ с текстом гейта', actual: gateErr.ok ? 'куплен!' : gateErr.error }),
  );
  f3.game.modules.call('player', 'player.addXp', 600, 'selfcheck'); // ур. 5
  grantGold(f3, 200);
  const gateOk = buy(f3, 'repair_kit');
  results.push(
    check('гейт §7.4: с ур. 5 repair_kit покупается (сток/кошелёк/инвентарь согласованы)', () => {
      if (!gateOk.ok) return false;
      const stock = f3.shop['shop.stock']() as Stock;
      const row = stock.entries.find((e) => e.id === 'repair_kit');
      return (
        invCount(f3, 'repair_kit') === 1 &&
        row !== undefined && row.qty === 2 &&
        f3.game.wallet.get('gold') === 200 - gateOk.value.total
      );
    }),
  );

  // --- 7. Атомарность §7.5: нет денег — ничего не изменилось
  const f4 = await makeSeededShopGame('selfcheck-shop-4');
  stockOf(f4);
  drainGold(f4);
  const stockBefore = JSON.stringify(f4.shop['shop.stock']());
  const invBefore = JSON.stringify(f4.inv['inventory.list']());
  const noGold = buy(f4, 'seed_turnip');
  results.push(
    check('атомарность §7.5а: без денег — отказ; кошелёк/сток/инвентарь не тронуты', () =>
      !noGold.ok &&
      f4.game.wallet.get('gold') === 0 &&
      JSON.stringify(f4.shop['shop.stock']()) === stockBefore &&
      JSON.stringify(f4.inv['inventory.list']()) === invBefore),
  );

  // --- 8. Атомарность §7.5б: инвентарь полон — отказ ДО оплаты
  const f5 = await makeSeededShopGame('selfcheck-shop-5');
  stockOf(f5);
  grantGold(f5, 1000);
  // 20 слотов — заполняем неконфликтным стаком 20 разных записейiron_ore-подобных
  for (let i = 0; i < 20; i++) {
    f5.inv['inventory.add']('lucky_charm', 'D', i, 1, 'selfcheck.fill');
  }
  const fullInv = buy(f5, 'shovel');
  results.push(
    check('атомарность §7.5б: инвентарь полон — отказ до оплаты (кошелёк 1000, сток цел)', () => {
      const stock = f5.shop['shop.stock']() as Stock;
      const shovel = stock.entries.find((e) => e.id === 'shovel');
      return (
        !fullInv.ok &&
        fullInv.error.includes('инвентарь полон') &&
        f5.game.wallet.get('gold') === 1000 &&
        shovel !== undefined && shovel.qty === 2 &&
        invCount(f5, 'shovel') === 0
      );
    }, { expected: 'отказ «инвентарь полон», ничего не списано', actual: fullInv.ok ? 'куплен!' : fullInv.error }),
  );

  // --- 9. C4: покупка gear с modSlots → стартовые роллы у НОВОЙ записи;
  //     реролл-цикл жив после покупки; события shop.purchased/item.acquired
  const f6 = await makeSeededShopGame('selfcheck-shop-6');
  const gear = findRolledGear(f6);
  if (gear) {
    const qtyBefore = (f6.shop['shop.stock']() as Stock).entries.find((e) => e.id === gear.id)?.qty ?? 0;
    grantGold(f6, 5000);
    let purchasedEvents = 0;
    let acquiredEvents = 0;
    const offP = f6.game.bus.subscribe('shop.purchased', () => purchasedEvents++);
    const offA = f6.game.bus.subscribe('item.acquired', (p) => {
      if ((p as { source?: string }).source === 'shop.buy') acquiredEvents++;
    });
    const gearBuy = buy(f6, gear.id);
    // кошелёк фиксируем ДО реролл-пробы (она платная — 10 золота за попытку 0)
    const walletAfterBuy = gearBuy.ok ? f6.game.wallet.get('gold') : -1;
    const newInstance = gearBuy.ok && gearBuy.value.iids && gearBuy.value.iids.length > 0
      ? (f6.inv['inventory.list']() as Array<{ iid: string; defId: string; rolledMods: unknown[] }>).find((i) => i.iid === gearBuy.value.iids![0])
      : undefined;
    const rerollOk = newInstance
      ? (f6.game.modules.call('modforge', 'modforge.reroll', newInstance.iid) as R<unknown>)
      : null;
    results.push(
      check(`C4: куплен ${gear.id} (день +${gear.date}) → у новой записи ЕСТЬ стартовые роллы; события shop.purchased + item.acquired{shop.buy}; сток −1; реролл-цикл жив`, () => {
        if (!gearBuy.ok || !newInstance) return false;
        const stock = f6.shop['shop.stock']() as Stock;
        const row = stock.entries.find((e) => e.id === gear.id);
        return (
          newInstance.rolledMods.length > 0 &&
          newInstance.rolledMods.every((m) => (m as { from?: string }).from === 'initial') &&
          purchasedEvents === 1 &&
          acquiredEvents === 1 &&
          walletAfterBuy === 5000 - gearBuy.value.total &&
          row !== undefined && row.qty === qtyBefore - 1 &&
          rerollOk !== null && rerollOk.ok
        );
      }, { expected: `роллы > 0, сток ${qtyBefore - 1}, реролл ok`, actual: gearBuy.ok ? `роллов ${newInstance?.rolledMods.length ?? 0}, цена ${gearBuy.value.total}, кошелёк ${walletAfterBuy}, сток ${(() => { const r = (f6.shop['shop.stock']() as Stock).entries.find((e) => e.id === gear.id); return r?.qty ?? '—'; })()}, реролл ${rerollOk?.ok}` : gearBuy.error }),
    );
    offP();
    offA();
  } else {
    results.push(check('C4: за 30 дней встретился gear с modSlots', () => false, { expected: 'gear в ролле', actual: 'не встретился' }));
  }
  f3.dispose();
  f4.dispose();
  f5.dispose();
  f6.dispose();

  return results;
}
