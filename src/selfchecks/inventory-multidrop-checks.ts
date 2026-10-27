/**
 * Self-checks FIX-M02 (бриф §3, группа «M02 · FIX-M02: изъятие партий
 * (мульти-дроп)») — регресс CRIT-1 аудита AUDIT-M02 §4: removeInternal
 * собирал drop в порядке КАЧЕСТВА (D25 худшие-вперёд), а не индексов, и
 * reverse() молча терял посторонние записи / оставлял зомби qty=0, когда
 * худшая из изымаемых записей стояла в items[] ПОЗЖЕ лучшей.
 *
 * Инвариант (§2 брифа): изъятие по плану удаляет ровно опустошённые планом
 * записи и только их — независимо от взаимного порядка quality-сортировки
 * plan.takes и индексов в items[]. Порядки записей строятся детерминированно
 * через addWithQuality (явные качества, никаких случайных роллов).
 *
 * Оракулы руками (§5 02-BUSES: sellPrice = round(base × редкость × качество
 * × 0.40), множители — внутри base; lucky_charm: 90 × 2.5 = 225):
 *   D 63/шт · C 90/шт · B 122/шт (round(121.5)) · A 162/шт.
 */
import { MemoryStorage } from '@/kernel/save/storage-drivers';
import type { ItemInstance } from '@/game/modules/inventory/state';
import { check, group, type CheckGroup, type CheckResult } from './types';
import {
  addQ,
  byDef,
  goldOf,
  list,
  makeActionGame,
  sell,
  type R,
} from './inventory-action-fixture';

type Fixture = ReturnType<typeof makeActionGame>;

/** слоты рюкзака (записи) — через канонический inventory.info */
function usedSlots(api: Fixture['api']): number {
  return (api['inventory.info']() as { used: number }).used;
}

/** в памяти нет зомби — записей с qty ≤ 0 (главный симптом CRIT-1) */
function noZombies(api: Fixture['api']): boolean {
  return list(api).every((it) => it.qty > 0);
}

export async function runInventoryMultidropChecks(): Promise<CheckGroup> {
  const results: CheckResult[] = [];

  // --- 1. Зомби-сценарий (механизм репро A аудита): один defId, худшая
  //     запись ПОЗЖЕ по индексу; sell обеих → обе удалены, зомби нет, −2 слота.
  const f1 = makeActionGame();
  addQ(f1.api, 'lucky_charm', 'C', 92.6, 1); // лучшая — индекс 0
  addQ(f1.api, 'lucky_charm', 'C', 87.4, 1); // худшая — индекс 1 (ПОЗЖЕ)
  const used1 = usedSlots(f1.api);
  const gold1 = goldOf(f1);
  const sellZ = sell(f1.api, 'lucky_charm', 2);
  results.push(
    check('мульти-дроп: худшая ПОЗЖЕ (репро A) — обе записи удалены, зомби qty=0 в памяти НЕТ, слоты −2', () => {
      if (!sellZ.ok) return false;
      return (
        byDef(f1.api, 'lucky_charm').length === 0 &&
        noZombies(f1.api) &&
        usedSlots(f1.api) === used1 - 2 &&
        goldOf(f1) === gold1 + 180
      );
    }),
  );

  // --- 2. Жертва-сценарий (репро B аудита — канонический): худшая позже +
  //     посторонняя запись ПОСЛЕ цели; sell 2 → посторонняя цела байт-в-байт,
  //     лента — только по продаваемому defId, цена по фактическим чанкам (Q11).
  const f2 = makeActionGame();
  addQ(f2.api, 'lucky_charm', 'A', 24.9, 1); // индекс 0 (лучшая)
  addQ(f2.api, 'lucky_charm', 'D', 47.7, 1); // индекс 1 — худшая ПОЗЖЕ (цель)
  addQ(f2.api, 'bread', 'D', 28.8, 1); // индекс 2 — посторонняя ЖЕРТВА после цели
  const breadBefore = JSON.stringify(byDef(f2.api, 'bread')[0]);
  let soldB: Array<Record<string, unknown>> = [];
  let consumedB: Array<Record<string, unknown>> = [];
  const offSold = f2.game.bus.subscribe('item.sold', (p) => soldB.push(p as Record<string, unknown>));
  const offCons = f2.game.bus.subscribe('item.consumed', (p) => consumedB.push(p as Record<string, unknown>));
  const sellB = sell(f2.api, 'lucky_charm', 2);
  offSold();
  offCons();
  results.push(
    check('мульти-дроп: жертва-сценарий (репро B) — посторонний хлеб цел байт-в-байт, обе цели удалены, зомби нет', () => {
      if (!sellB.ok) return false;
      return (
        JSON.stringify(byDef(f2.api, 'bread')[0]) === breadBefore &&
        byDef(f2.api, 'lucky_charm').length === 0 &&
        noZombies(f2.api)
      );
    }),
  );
  results.push(
    check('мульти-дроп: цена по фактическим чанкам (Q11) — D 63 + A 162 = 225 за 2 шт', () =>
      sellB.ok &&
      sellB.value.gold === 225 &&
      sellB.value.chunks.length === 2 &&
      sellB.value.chunks[0].tier === 'D' &&
      sellB.value.chunks[0].unitPrice === 63 &&
      sellB.value.chunks[1].tier === 'A' &&
      sellB.value.chunks[1].unitPrice === 162),
  );
  results.push(
    // [FIX-PHASE-2 · 4.6 · N6] байт-строгий оракул обновлён ПОИМЁННО (gold = 225,
    // сумма гранта транзакции — сверка строки ниже осталась прежней)
    check('мульти-дроп: лента — item.sold {defId, qty, gold} ровно одно; 0 событий по посторонним defId', () =>
      soldB.length === 1 &&
      JSON.stringify(soldB[0]) === JSON.stringify({ defId: 'lucky_charm', qty: 2, gold: 225 }) &&
      consumedB.length === 1 &&
      consumedB[0].defId === 'lucky_charm' &&
      consumedB[0].qty === 2),
  );

  // --- 3. Мульти-дроп ≥3 с перемешанным порядком (drop НЕ монотонен по
  //     индексам) + выжившие в середине и в конце.
  const f3 = makeActionGame();
  addQ(f3.api, 'lucky_charm', 'B', 50, 1); // индекс 0
  addQ(f3.api, 'bread', 'D', 10, 2); // индекс 1 — выживший В СЕРЕДИНЕ
  addQ(f3.api, 'lucky_charm', 'D', 10, 1); // индекс 2
  addQ(f3.api, 'lucky_charm', 'C', 50, 1); // индекс 3
  addQ(f3.api, 'apple_pie', 'D', 20, 4); // индекс 4 — выживший в конце
  addQ(f3.api, 'lucky_charm', 'A', 50, 1); // индекс 5
  // takes по качеству: D(2) → C(3) → B(0) → A(5) — drop [2,3,0,5] не монотонен
  const breadMid = JSON.stringify(byDef(f3.api, 'bread')[0]);
  const pieEnd = JSON.stringify(byDef(f3.api, 'apple_pie')[0]);
  const gold3 = goldOf(f3);
  const sellM = sell(f3.api, 'lucky_charm', 4);
  results.push(
    check('мульти-дроп ×4 перемешанный порядок: все цели удалены, выжившие в середине/конце целы, зомби нет', () => {
      if (!sellM.ok) return false;
      return (
        byDef(f3.api, 'lucky_charm').length === 0 &&
        JSON.stringify(byDef(f3.api, 'bread')[0]) === breadMid &&
        JSON.stringify(byDef(f3.api, 'apple_pie')[0]) === pieEnd &&
        noZombies(f3.api)
      );
    }),
  );
  results.push(
    check('мульти-дроп ×4: чанки по фактическим единицам — D 63 + C 90 + B 122 + A 162 = 437', () =>
      sellM.ok && sellM.value.gold === 437 && goldOf(f3) === gold3 + 437 && sellM.value.chunks.length === 4),
  );

  // --- 4. Порт-путь: транзакция ядра с item-cost qty ≥ 2, собирающая ≥2
  //     записи в обратном порядке (TransactionService → ItemPort.remove) —
  //     изъятие честное, item.consumed ядерной формы, без потерь.
  const f4 = makeActionGame();
  addQ(f4.api, 'lucky_charm', 'C', 90, 1); // индекс 0 (лучшая)
  addQ(f4.api, 'lucky_charm', 'C', 20, 1); // индекс 1 — худшая ПОЗЖЕ
  addQ(f4.api, 'bread', 'D', 15, 1); // индекс 2 — посторонняя
  const bread4 = JSON.stringify(byDef(f4.api, 'bread')[0]);
  const gold4 = goldOf(f4);
  let portConsumed: Array<Record<string, unknown>> = [];
  let portWallet: Array<Record<string, unknown>> = [];
  const offPC = f4.game.bus.subscribe('item.consumed', (p) => portConsumed.push(p as Record<string, unknown>));
  const offPW = f4.game.bus.subscribe('wallet.transaction', (p) => portWallet.push(p as Record<string, unknown>));
  const portR = f4.game.transaction.transact({
    costs: [{ t: 'item', defId: 'lucky_charm', qty: 2 }],
    grants: [{ t: 'currency', id: 'gold', qty: 1 }],
    eventId: 'selfcheck.multidrop-port',
    reason: 'мульти-дроп через порт',
  }) as R<unknown>;
  offPC();
  offPW();
  results.push(
    check('порт: transact item-cost ×2 в обратном порядке — обе записи изъяты, посторонняя цела, зомби нет', () =>
      portR.ok &&
      byDef(f4.api, 'lucky_charm').length === 0 &&
      JSON.stringify(byDef(f4.api, 'bread')[0]) === bread4 &&
      noZombies(f4.api)),
  );
  results.push(
    check('порт: item.consumed ядерной формы {defId, qty, source=eventId} ровно один + wallet.transaction один', () =>
      portConsumed.length === 1 &&
      JSON.stringify(portConsumed[0]) === JSON.stringify({ defId: 'lucky_charm', qty: 2, source: 'selfcheck.multidrop-port' }) &&
      portWallet.length === 1 &&
      goldOf(f4) === gold4 + 1),
  );

  // --- 5. Событийно-денежная сверка (каноны Q10/Q11): кошелёк — только
  //     транзакцией (шпион); худшая РАНЬШЕ (легальный порядок и до фикса —
  //     остаётся зелёным), золото сходится с грантом транзакции.
  const f5 = makeActionGame();
  addQ(f5.api, 'lucky_charm', 'D', 47.7, 1); // худшая — индекс 0 (РАНЬШЕ)
  addQ(f5.api, 'lucky_charm', 'A', 24.9, 1); // индекс 1
  addQ(f5.api, 'bread', 'D', 28.8, 2);
  const gold5 = goldOf(f5);
  let wallet5: Array<Record<string, unknown>> = [];
  let sold5: Array<Record<string, unknown>> = [];
  const offW5 = f5.game.bus.subscribe('wallet.transaction', (p) => wallet5.push(p as Record<string, unknown>));
  const offS5 = f5.game.bus.subscribe('item.sold', (p) => sold5.push(p as Record<string, unknown>));
  const sell5 = sell(f5.api, 'lucky_charm', 2);
  offW5();
  offS5();
  results.push(
    check('сверка: wallet.transaction ровно один, грант = цене (225), кошелёк меняет только транзакция; item.sold один', () => {
      if (!sell5.ok) return false;
      return (
        wallet5.length === 1 &&
        JSON.stringify(wallet5[0].grants) === JSON.stringify([{ t: 'currency', id: 'gold', qty: 225 }]) &&
        goldOf(f5) === gold5 + 225 &&
        sold5.length === 1 &&
        noZombies(f5.api)
      );
    }),
  );

  // --- 6. Сейв-раундтрип после мульти-дропа + повторная load — байт-в-байт;
  //     зомби не персистят (их нет в памяти — сейв их видеть не должен).
  const storage6 = new MemoryStorage();
  const f6 = makeActionGame(storage6);
  addQ(f6.api, 'lucky_charm', 'A', 24.9, 1); // индекс 0
  addQ(f6.api, 'lucky_charm', 'D', 47.7, 1); // индекс 1 — худшая ПОЗЖЕ (репро B)
  addQ(f6.api, 'bread', 'D', 28.8, 2); // выживающий
  addQ(f6.api, 'apple_pie', 'B', 40, 5); // выживающий
  const sell6 = sell(f6.api, 'lucky_charm', 2);
  const gold6 = goldOf(f6);
  f6.dispose(); // dispose сохраняет (bootstrap.dispose → save.save())
  const f6r = makeActionGame(storage6);
  await f6r.game.init();
  const snap6 = (f: Fixture) => JSON.stringify({ list: list(f.api), gold: goldOf(f) });
  const s6a = snap6(f6r);
  results.push(
    check('сейв после мульти-дропа: цели не персистят, выжившие (хлеб ×2, пирог ×5) и золото на месте, зомби нет', () => {
      if (!sell6.ok) return false;
      const items = list(f6r.api);
      return (
        items.filter((it: ItemInstance) => it.defId === 'lucky_charm').length === 0 &&
        items.find((it: ItemInstance) => it.defId === 'bread')?.qty === 2 &&
        items.find((it: ItemInstance) => it.defId === 'apple_pie')?.qty === 5 &&
        goldOf(f6r) === gold6 &&
        items.every((it: ItemInstance) => it.qty > 0)
      );
    }),
  );
  f6r.dispose();
  const f6r2 = makeActionGame(storage6);
  await f6r2.game.init();
  const s6b = snap6(f6r2);
  results.push(
    check('идемпотентность: повторная load после мульти-дропа — байт-в-байт', () => s6a === s6b),
  );
  f6r2.dispose();

  f1.dispose();
  f2.dispose();
  f3.dispose();
  f4.dispose();
  f5.dispose();

  return group('M02 · FIX-M02: изъятие партий (мульти-дроп)', results);
}
