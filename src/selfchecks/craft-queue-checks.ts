/**
 * Self-checks M09 «Крафт», часть 2 (приёмка §5/§6/§7): очередь — фиксированные
 * даты, оффлайн-цепочка (catchUp), кап готового буфера (6 партий), отмена с
 * возвратом входов за вычетом 10%, сбор (качество + ривен-роллы modSlots-
 * выходов), рюкзак (+4 слота), XP-интеграция (craft.completed), TaskRegistry
 * (craft.queue), сейв-раундтрип v7.
 */
import { check, group, type CheckGroup, type CheckResult } from './types';
import { MemoryStorage } from '@/kernel/save/storage-drivers';
import { CRAFT_T0 } from './craft-fixture';
import {
  addXp,
  advance,
  advanceWithCatchUp,
  collect,
  countItem,
  giveItem,
  grantCurrency,
  make,
  makeCraftGame,
  makeSeededCraftGame,
  backpack,
  type R,
} from './craft-fixture';

export async function runCraftQueueChecks(): Promise<CheckGroup> {
  const results: CheckResult[] = [];

  // ------------------------------------------- фиксированные даты + XP + сбор
  const f1 = await makeSeededCraftGame('m09-dates');
  grantCurrency(f1, 'logs', 10);
  const m1 = make(f1, 'wb_planks');
  const snapAfterMake = f1.player['player.snapshot']() as {
    energy: { current: number };
    progress: { xp: number; level: number };
    skills: Array<{ id: string; xp: number; level: number }>;
  };
  results.push(
    check('запуск: craft.started, endsAt = T0+30с, входы и энергия списаны (логи 7, энергия 98)', () =>
      m1.ok && m1.value.batchId === 'craft:1' && m1.value.endsAt === CRAFT_T0 + 30_000 &&
      f1.game.wallet.get('logs') === 7 && snapAfterMake.energy.current === 98 &&
      f1.events.some((e) => e.name === 'craft.started' && e.payload.batchId === 'craft:1')),
  );
  advance(f1, 15_000);
  const queueMid = f1.craft['craft.queue']() as Array<{ batches: Array<{ id: string; started: boolean; endsAt: number | null }>; ready: number }>;
  advance(f1, 16_000); // всего 31с
  const ready1 = f1.craft['craft.ready']() as Array<{ id: string; recipeId: string; quality: { tier: string; value: number } }>;
  const snapAfterDone = f1.player['player.snapshot']() as {
    progress: { xp: number };
    skills: Array<{ id: string; xp: number; level: number }>;
  };
  const completed1 = f1.events.find((e) => e.name === 'craft.completed');
  results.push(
    check('даты: на 15с — работает (не готово); на 31с — готово, craft.completed с качеством C/50 (нейтральный вход)', () =>
      queueMid.length === 1 && queueMid[0].batches[0].started === true && queueMid[0].ready === 0 &&
      ready1.length === 1 && ready1[0].quality.tier === 'C' && ready1[0].quality.value === 50 &&
      completed1 !== undefined && (completed1.payload.defId as string) === 'planks',
    { expected: 'C/50', actual: ready1[0] ? `${ready1[0].quality.tier}/${ready1[0].quality.value}` : '—' }),
  );
  results.push(
    check('XP: craft.completed → игрок +10 XP и навык «Крафт» +10 (контент M01 слушает)', () =>
      snapAfterDone.progress.xp === 10 &&
      (snapAfterDone.skills.find((s) => s.id === 'crafting')?.xp ?? 0) === 10),
  );
  const c1 = collect(f1);
  results.push(
    check('сбор: валютный выход — planks +2 в кошелёк, буфер пуст', () =>
      c1.ok && c1.value.collected.length === 1 && f1.game.wallet.get('planks') === 2 &&
      (f1.craft['craft.ready']() as unknown[]).length === 0),
  );

  // ------------------------------------------------------------- очередь полна
  // wheat_grain — ПРЕДМЕТ (компонент, не валюта кошелька): выдаём явным качеством
  giveItem(f1, 'wheat_grain', 'D', 0, 4);
  const m2 = make(f1, 'wb_feed');
  const m3 = make(f1, 'wb_feed');
  const m4 = make(f1, 'wb_planks');
  results.push(
    check('очередь: заполнена 2/2 — третья постановка отказана (длина — стат)', () =>
      m2.ok && m3.ok && !m4.ok && m4.error.includes('заполнена: 2/2')),
  );

  // --------------------------------------- предметный сбор + гейт-рецепт + энергии
  const f2 = await makeSeededCraftGame('m09-collect');
  grantCurrency(f2, 'planks', 2);
  giveItem(f2, 'iron_ingot', 'D', 0);
  const acquired: Array<Record<string, unknown>> = [];
  const offAcq = f2.game.bus.subscribe('item.acquired', (p) => acquired.push(p as Record<string, unknown>));
  const mk = make(f2, 'wb_shovel');
  advance(f2, 91_000);
  const c2 = collect(f2);
  offAcq();
  const shovel = backpack(f2).find((i) => i.defId === 'shovel');
  results.push(
    check('сбор: предметный выход — качество D/0 в инвентаре, item.acquired source craft.collect', () =>
      mk.ok && c2.ok && shovel !== undefined && shovel.quality.tier === 'D' && shovel.quality.value === 0 &&
      acquired.some((a) => a.defId === 'shovel' && a.source === 'craft.collect')),
  );

  // ------------------------------------------------------ офлайн-цепочка (catchUp)
  const f3 = await makeSeededCraftGame('m09-chain');
  grantCurrency(f3, 'planks', 10);
  const n1 = make(f3, 'wb_nails');
  const n2 = make(f3, 'wb_nails');
  advanceWithCatchUp(f3, 2 * 3_600_000); // +2ч через catchUp (hourTick ×2)
  const ready3 = f3.craft['craft.ready']() as Array<{ id: string; completedAt: number }>;
  results.push(
    check('цепочка офлайн: обе партии готовы, вторая завершилась в T0+90с (старт сразу за первой)', () =>
      n1.ok && n2.ok && ready3.length === 2 &&
      ready3[0].completedAt === CRAFT_T0 + 45_000 && ready3[1].completedAt === CRAFT_T0 + 90_000,
    { expected: '45с и 90с', actual: ready3.map((r) => `${(r.completedAt - CRAFT_T0) / 1000}с`).join(' и ') }),
  );
  const c3 = collect(f3);
  results.push(
    check('цепочка офлайн: сбор обеих — nails +8 в кошелёк', () =>
      c3.ok && c3.value.collected.length === 2 && f3.game.wallet.get('nails') === 8),
  );

  // --------------------------------------------------------------- отмена (§5)
  const f4 = await makeSeededCraftGame('m09-cancel');
  grantCurrency(f4, 'logs', 10);
  const cm = make(f4, 'wb_planks');
  const cancelR = f4.craft['craft.cancel']('craft:1') as R<{ refunds: Array<{ defId: string; qty: number }> }>;
  const cancelAgain = f4.craft['craft.cancel']('craft:1') as R<unknown>;
  results.push(
    check('отмена: возврат входов за вычетом 10% (logs 3 → 2), партия исчезла, энергия не возвращена', () => {
      const snap = f4.player['player.snapshot']() as { energy: { current: number } };
      return (
        cm.ok && cancelR.ok &&
        cancelR.value.refunds.length === 1 && cancelR.value.refunds[0].defId === 'logs' && cancelR.value.refunds[0].qty === 2 &&
        f4.game.wallet.get('logs') === 9 &&
        (f4.craft['craft.queue']() as unknown[]).length === 0 &&
        snap.energy.current === 98 && !cancelAgain.ok
      );
    }),
  );
  grantCurrency(f4, 'logs', 0);
  const cm2 = make(f4, 'wb_planks');
  advance(f4, 31_000);
  const cancelReady = f4.craft['craft.cancel']('craft:2') as R<unknown>;
  results.push(
    check('отмена: готовая партия не отменяется (подсказка сбора)', () =>
      cm2.ok && !cancelReady.ok && cancelReady.error.includes('не отменяются')),
  );

  // [FIX-PHASE-2 · 4.3 · OBS-4 AUDIT-M09] ратифицированная формула потерь:
  // одиночная строка входа (qty=1) возвращается ПОЛНОСТЬЮ (loss=0) —
  // прежний ceil-вырождение съедало 100% строки (av_pickaxe: 0 досок)
  const f4b = await makeSeededCraftGame('m09-cancel-single');
  giveItem(f4b, 'healing_herb', 'D', 30, 4);
  grantCurrency(f4b, 'fiber', 3); // fiber — валюта кошелька (03-DATA §1)
  const cm3 = make(f4b, 'wb_fertilizer'); // herb×2 + fiber×1 (одиночная строка!)
  const cancelSingle = f4b.craft['craft.cancel']('craft:1') as R<{ refunds: Array<{ defId: string; qty: number }> }>;
  results.push(
    check('отмена: одиночная строка qty=1 возвращается полностью (fiber 1 → 1), соседняя 2 → 1', () =>
      cm3.ok && cancelSingle.ok &&
      cancelSingle.value.refunds.some((r) => r.defId === 'fiber' && r.qty === 1) &&
      cancelSingle.value.refunds.some((r) => r.defId === 'healing_herb' && r.qty === 1)),
  );

  // [FIX-PHASE-2 · 4.4 · OBS-5 AUDIT-M09] очередь ПОТРЕБЛЯЕТ craft.speedPercent
  // (перк «Крафт» ур.10 — inc +10): время = craftSeconds × (1 − speed/100),
  // клэмп-минимум minBatchSeconds=5 из content (тюнюется)
  const fS = await makeSeededCraftGame('m09-speed');
  grantCurrency(fS, 'logs', 10);
  fS.game.buffs.add(
    { id: 'speed.probe', source: { kind: 'buff', refId: 'selfcheck' }, stat: 'craft.speedPercent', op: 'inc', value: 10 },
    CRAFT_T0,
  );
  const mS = make(fS, 'wb_planks'); // 30с × 0.9 = 27с
  const fS2 = await makeSeededCraftGame('m09-speed-cap');
  grantCurrency(fS2, 'logs', 10);
  fS2.game.buffs.add(
    { id: 'speed.probe', source: { kind: 'buff', refId: 'selfcheck' }, stat: 'craft.speedPercent', op: 'inc', value: 95 },
    CRAFT_T0,
  );
  const mS2 = make(fS2, 'wb_planks'); // 30с × 0.05 = 1.5 → клэмп 5с
  results.push(
    check('скорость очереди: craft.speedPercent +10% → партия 30с → 27с; +95% → клэмп-минимум 5с (тюнюется)', () =>
      mS.ok && mS2.ok && mS.value.endsAt === CRAFT_T0 + 27_000 && mS2.value.endsAt === CRAFT_T0 + 5_000),
  );

  // ------------------------------------------- кап готового буфера (6 партий)
  const f5 = await makeSeededCraftGame('m09-cap');
  grantCurrency(f5, 'logs', 30);
  for (let round = 0; round < 3; round++) {
    make(f5, 'wb_planks');
    make(f5, 'wb_planks');
    advance(f5, 65_000); // цепочка 30с+30с — обе партии раунда завершаются
  }
  const ready6 = f5.craft['craft.ready']() as unknown[];
  const pausedMakes = [make(f5, 'wb_planks'), make(f5, 'wb_planks')];
  advanceWithCatchUp(f5, 10 * 3_600_000); // +10ч — станция на паузе
  const still6 = f5.craft['craft.ready']() as unknown[];
  const queuePaused = f5.craft['craft.queue']() as Array<{ batches: Array<{ started: boolean }>; ready: number }>;
  results.push(
    check('кап буфера: 6 готовых партий — станция встала (2 ждут старта, +10ч — без потерь)', () =>
      ready6.length === 6 && pausedMakes.every((m) => m.ok) && still6.length === 6 &&
      queuePaused.length === 1 && queuePaused[0].batches.length === 2 &&
      queuePaused[0].batches.every((b) => b.started === false) && queuePaused[0].ready === 6),
  );
  const capCollect = collect(f5);
  advance(f5, 65_000); // цепочка возобновления: 30с + 30с — обе ожидающие завершаются
  const readyAfter = f5.craft['craft.ready']() as unknown[];
  const capCollect2 = collect(f5);
  results.push(
    check('кап буфера: сбор 6 → пауза снята, обе ожидающие завершаются и собираются (planks 12+4=16)', () =>
      capCollect.ok && capCollect.value.collected.length === 6 &&
      readyAfter.length === 2 && capCollect2.ok && capCollect2.value.collected.length === 2 &&
      f5.game.wallet.get('planks') === 16),
  );

  // ------------------------------------------------------ ривен-роллы (C4-канон)
  const f6 = await makeSeededCraftGame('m09-rivens');
  addXp(f6, 600);
  grantCurrency(f6, 'gold', 700);
  f6.craft['craft.buy']('anvil');
  giveItem(f6, 'iron_plate', 'D', 0, 2);
  grantCurrency(f6, 'planks', 1);
  const mkPick = make(f6, 'av_pickaxe');
  advance(f6, 151_000);
  const c6 = collect(f6);
  const pick = backpack(f6).find((i) => i.defId === 'iron_pickaxe');
  const completedPick = f6.events.find((e) => e.name === 'craft.completed' && e.payload.defId === 'iron_pickaxe');
  results.push(
    check('ривен-роллы: кирка (modSlots uncommon) собрана с роллами from initial, ≥1', () =>
      mkPick.ok && c6.ok && pick !== undefined && (pick.rolledMods.length >= 1) &&
      pick.rolledMods.every((m) => m !== null) &&
      completedPick !== undefined,
    { expected: 'rolledMods ≥ 1', actual: pick ? String(pick.rolledMods.length) : 'нет предмета' }),
  );

  // ------------------------------------------------------ рюкзак (+4 слота)
  const f7 = await makeSeededCraftGame('m09-backpack');
  addXp(f7, 2000); // уровень ≥ 6
  grantCurrency(f7, 'gold', 800);
  f7.craft['craft.buy']('tannery');
  grantCurrency(f7, 'leather', 8);
  giveItem(f7, 'rope', 'D', 0, 2);
  giveItem(f7, 'cloth', 'D', 0, 2);
  const slotsBefore = f7.game.statBus.resolve({ stat: 'player.inventory.slots', ctx: f7.game.time.ctx('player') });
  const mkBp1 = make(f7, 'tn_backpack');
  advance(f7, 201_000);
  const cBp1 = collect(f7);
  const slotsAfter1 = f7.game.statBus.resolve({ stat: 'player.inventory.slots', ctx: f7.game.time.ctx('player') });
  const info1 = f7.inv['inventory.info']() as { capacity: number };
  const mkBp2 = make(f7, 'tn_backpack');
  advance(f7, 201_000);
  collect(f7);
  const slotsAfter2 = f7.game.statBus.resolve({ stat: 'player.inventory.slots', ctx: f7.game.time.ctx('player') });
  results.push(
    check('рюкзак: каждый собранный — +4 слота (20 → 24 → 28), вместимость M02 следует', () =>
      mkBp1.ok && cBp1.ok && slotsBefore === 20 && slotsAfter1 === 24 && info1.capacity === 24 &&
      mkBp2.ok && slotsAfter2 === 28 && countItem(f7, 'backpack') === 2,
    { expected: '20 → 24 → 28', actual: `${slotsBefore} → ${slotsAfter1} → ${slotsAfter2}` }),
  );

  // ------------------------------------------------------ TaskRegistry (§6)
  const taskList = f7.game.tasks.list();
  const taskRun = f7.game.tasks.runTask('craft.queue', { now: f7.game.time.now() });
  results.push(
    check('TaskRegistry: исполнитель craft.queue зарегистрирован и работает (работник-кузнец M11)', () =>
      taskList.some((t) => t.id === 'craft.queue') && taskRun.ok),
  );

  // ------------------------------------------------------ сейв-раундтрип v7
  const storage = new MemoryStorage();
  const f8 = await makeSeededCraftGame('m09-save', storage);
  addXp(f8, 2000);
  grantCurrency(f8, 'gold', 800);
  f8.craft['craft.buy']('tannery');
  grantCurrency(f8, 'leather', 4);
  giveItem(f8, 'rope', 'D', 0);
  giveItem(f8, 'cloth', 'D', 0);
  make(f8, 'tn_backpack');
  advance(f8, 201_000);
  collect(f8); // рюкзак собран → +4 слота, grantedEffects 1
  grantCurrency(f8, 'logs', 3);
  make(f8, 'wb_planks'); // очередь: 1 работает
  advance(f8, 31_000); // готово, НЕ собираем
  void (f8.craft['craft.ready']() as unknown[]); // sweep фиксирует готовность в сейв
  f8.dispose(); // сохраняет
  const f9 = makeCraftGame(storage);
  await f9.game.init();
  const reloaded = f9.craft['craft.ready']() as Array<{ recipeId: string; quality: { tier: string; value: number } }>;
  const stations9 = f9.craft['craft.stations']() as Array<{ id: string; built: boolean }>;
  const slots9 = f9.game.statBus.resolve({ stat: 'player.inventory.slots', ctx: f9.game.time.ctx('player') });
  const c9 = collect(f9);
  results.push(
    check('сейв v7: станции/готовый буфер/эффекты рюкзака переживают dispose/load (слоты 24, planks +2)', () =>
      f9.game.save.info().saveVersion === 15 && // [M05.1 · v10 → M06.1 · v11 → M07.1 · v12 → M11 · v14 → M12.1 · v15] легализация поимённо
      reloaded.length === 1 && reloaded[0].recipeId === 'wb_planks' && reloaded[0].quality.tier === 'C' &&
      stations9.find((s) => s.id === 'tannery')?.built === true &&
      stations9.find((s) => s.id === 'workbench')?.built === true &&
      slots9 === 24 && c9.ok && f9.game.wallet.get('planks') === 2),
  );
  f1.dispose();
  f2.dispose();
  f3.dispose();
  f4.dispose();
  f5.dispose();
  f6.dispose();
  f7.dispose();
  f9.dispose();

  return group('M09 · Крафт: очередь, сбор и экономика (§5/§6)', results);
}
