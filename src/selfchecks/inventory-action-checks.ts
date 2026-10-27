/**
 * Self-checks M02 «Инвентарь», часть 3 (сеанс M02.3, бриф §2.8): группа
 * «M02 · Действия над предметом: use/sell/износ» — сборка группы.
 * Use-проверки (D32: гейты, клэмпы грантов D33, стаки, item.consumed) — здесь;
 * sell/wear — inventory-action-sell-checks.ts; сейв-подгруппа —
 * inventory-action-save-checks.ts (паттерн расщеплений M02.2, 01 §6).
 * Оракулы — руками (капы уровня: energy/hp.max растут на 2/5 за уровень).
 */
import { check, group, type CheckGroup, type CheckResult } from './types';
import { runInventoryActionSaveChecks } from './inventory-action-save-checks';
import { runInventorySellWearChecks } from './inventory-action-sell-checks';
import {
  addQ,
  addXp,
  applyUse,
  byDef,
  energyOf,
  hpOf,
  makeActionGame,
  setEnergy,
  setHp,
} from './inventory-action-fixture';

export async function runInventoryActionChecks(): Promise<CheckGroup> {
  const results: CheckResult[] = [];

  // --- 1. use: валидность — «не расходник» и отсутствующая запись
  const f1 = makeActionGame();
  addQ(f1.api, 'iron_pickaxe', 'D', 40, 1);
  const pickIid = byDef(f1.api, 'iron_pickaxe')[0]?.iid ?? '';
  const notConsumable = applyUse(f1.api, pickIid);
  results.push(
    check('use: не расходник — отказ с причиной (проба §2.3)', () =>
      !notConsumable.ok && notConsumable.error.includes('не расходник')),
  );
  const noRecord = applyUse(f1.api, 'bread#999');
  results.push(
    check('use: неизвестный iid — отказ «не найден в инвентаре»', () =>
      !noRecord.ok && noRecord.error.includes('не найден')),
  );

  // --- 2. use: гейт требований (уровень 2 у мази) — отказ до уровня, успех после
  addQ(f1.api, 'healing_salve', 'D', 20, 2);
  const salveIid = byDef(f1.api, 'healing_salve')[0]?.iid ?? '';
  const gateRefuse = applyUse(f1.api, salveIid);
  results.push(
    check('use: гейт мази на ур. 1 — отказ «требуется уровень 2» (проба §2.3)', () =>
      !gateRefuse.ok && gateRefuse.error.includes('требуется уровень 2')),
  );
  addXp(f1, 120); // уровень 2 (115 XP)
  setHp(f1, 30);
  let hpEvents: Array<{ delta: number; current: number; reason: string }> = [];
  const offHp = f1.game.bus.subscribe('player.hpChanged', (p) => {
    hpEvents.push(p as { delta: number; current: number; reason: string });
  });
  const gatePass = applyUse(f1.api, salveIid);
  offHp();
  results.push(
    check('use: после уровня 2 гейт проходит — grantHp 30 + 15 = 45 (клэмп не режет)', () =>
      gatePass.ok && hpOf(f1) === 45),
  );
  results.push(
    check('D33: player.hpChanged с reason=item.use, delta +15 (клэмп-добавление, не отказ)', () =>
      hpEvents.length === 1 && hpEvents[0].delta === 15 && hpEvents[0].current === 45 && hpEvents[0].reason === 'item.use'),
  );

  // --- 3. use: клэмп hp у капа (уровень 2 → hp.max 55: 45 + 15 = 60 → 55)
  setHp(f1, 45);
  const hpClamp = applyUse(f1.api, salveIid);
  results.push(
    check('use: клэмп hp у капа — 45 + 15 → 55 (кап ур. 2), последняя единица записи удаляется', () => {
      if (!hpClamp.ok) return false;
      return hpOf(f1) === 55 && byDef(f1.api, 'healing_salve').length === 0;
    }),
  );

  // --- 4. use: грант энергии + клэмп у капа + событие reason=item.use
  addQ(f1.api, 'apple_pie', 'D', 10, 30);
  const pieIid = byDef(f1.api, 'apple_pie')[0]?.iid ?? '';
  setEnergy(f1, 50);
  let energyEvents: Array<{ delta: number; current: number; reason: string }> = [];
  const offEn = f1.game.bus.subscribe('player.energyChanged', (p) => {
    energyEvents.push(p as { delta: number; current: number; reason: string });
  });
  let consumedEvents: Array<Record<string, unknown>> = [];
  let walletEvents: Array<Record<string, unknown>> = [];
  const offC = f1.game.bus.subscribe('item.consumed', (p) => {
    consumedEvents.push(p as Record<string, unknown>);
  });
  const offW = f1.game.bus.subscribe('wallet.transaction', (p) => {
    walletEvents.push(p as Record<string, unknown>);
  });
  const pieUse = applyUse(f1.api, pieIid);
  offEn();
  offC();
  offW();
  results.push(
    check('use: грант энергии 50 + 20 = 70; стак 30 → 29 (та же запись)', () => {
      if (!pieUse.ok) return false;
      const pies = byDef(f1.api, 'apple_pie');
      return energyOf(f1) === 70 && pies.length === 1 && pies[0].qty === 29 && pies[0].iid === pieIid;
    }),
  );
  results.push(
    check('D33: player.energyChanged с reason=item.use, delta +20', () =>
      energyEvents.length === 1 && energyEvents[0].delta === 20 && energyEvents[0].current === 70 && energyEvents[0].reason === 'item.use'),
  );
  // [QUESTION · D32(5)] payload item.consumed публикует ядро: {defId, qty, source}
  // БЕЗ iid (предписано {defId, iid, qty:1}); дубль модулем не шлётся — «ровно
  // одно» важнее формы, канон состояния — API (детали в M02.3-REPORT)
  results.push(
    check('use: item.consumed ровно одно, payload ядра {defId, qty:1, source:item.use}', () =>
      consumedEvents.length === 1 &&
      consumedEvents[0].defId === 'apple_pie' &&
      consumedEvents[0].qty === 1 &&
      consumedEvents[0].source === 'item.use'),
  );
  results.push(
    check('use: wallet.transaction от ядра — cost-only transact (grants пуст, costs — предмет)', () =>
      walletEvents.length === 1 && Array.isArray(walletEvents[0].grants) && (walletEvents[0].grants as unknown[]).length === 0),
  );
  setEnergy(f1, 95);
  const clampUse = applyUse(f1.api, pieIid);
  results.push(
    check('use: клэмп энергии у капа — 95 + 20 → 102 (кап ур. 2: 100 + 2×1)', () => clampUse.ok && energyOf(f1) === 102),
  );

  // --- 5-8. sell/wear — отдельный файл (расщепление по 01 §6)
  results.push(...(await runInventorySellWearChecks()));

  // --- сейв-подгруппа: раундтрип после use/sell/wear + идемпотентность (§2.7)
  results.push(...(await runInventoryActionSaveChecks()));

  f1.dispose();

  return group('M02 · Действия над предметом: use/sell/износ (часть 3)', results);
}

