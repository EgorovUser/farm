/**
 * Self-checks M02 «Инвентарь», часть 1 (сеанс M02.1, бриф §3.8): группа
 * «M02 · Инвентарь: хранение и качество (часть 1)» — качество (детерминизм/
 * допустимость/value), стаки, вместимость (D19), события, подмена порта (D17)
 * + сейв-подгруппа из inventory-save-checks.ts (roundtrip, миграция v3→v4).
 * Оракулы — руками: арифметика maxStack/capacity в ожиданиях.
 */
import { ManualClock } from '@/kernel/di/clock';
import { MemoryStorage } from '@/kernel/save/storage-drivers';
import { createGame, type Game } from '@/game/bootstrap';
import type { ItemInstance } from '@/game/modules/inventory/state';
import type { InventoryInfo } from '@/game/modules/inventory/store';
import type { ModifierProvider } from '@/kernel/bus/stat-bus/modifier';
import { check, group, type CheckGroup, type CheckResult } from './types';
import { runInventorySaveChecks } from './inventory-save-checks';

const T0 = new Date(2024, 0, 1, 12, 0, 0, 0).getTime();

interface InvFixture {
  game: Game;
  api: Record<string, (...args: unknown[]) => unknown>;
  dispose(): void;
}

function makeInvGame(storage: MemoryStorage = new MemoryStorage()): InvFixture {
  const game = createGame(new ManualClock(T0), storage);
  const api = game.modules.get('inventory')?.api ?? {};
  return { game, api, dispose: () => game.dispose() };
}

/** тестовый провайдер вместимости: flat-модификатор на player.inventory.slots */
function slotsProvider(id: string, flat: number): ModifierProvider {
  return {
    id,
    provide: (stat) =>
      stat === 'player.inventory.slots'
        ? [{ id: `${id}.mod`, source: { kind: 'buff', refId: id }, stat, op: 'flat', value: flat }]
        : [],
  };
}

type AcquireResult =
  | { ok: true; value: { quality: { tier: string; value: number }; entries: number } }
  | { ok: false; error: string };

function acquire(api: InvFixture['api'], defId: string, qty: number, source = 'selfcheck'): AcquireResult {
  return api['inventory.acquire'](defId, qty, source) as AcquireResult;
}

function addQ(api: InvFixture['api'], defId: string, tier: string, value: number, qty: number, source = 'selfcheck'): AcquireResult {
  return api['inventory.add'](defId, tier, value, qty, source) as AcquireResult;
}

function removeQ(api: InvFixture['api'], defId: string, qty: number, source = 'selfcheck'): { ok: boolean; error?: string } {
  return api['inventory.remove'](defId, qty, source) as { ok: boolean; error?: string };
}

function list(api: InvFixture['api']): ItemInstance[] {
  return api['inventory.list']() as ItemInstance[];
}

function totalOf(api: InvFixture['api'], defId: string): number {
  return list(api).filter((it) => it.defId === defId).reduce((s, i) => s + i.qty, 0);
}

export async function runInventoryChecks(): Promise<CheckGroup> {
  const results: CheckResult[] = [];

  // --- 1. вместимость: resolve 20, capacity = min(60, 20) = 20 (оракул руками)
  const f1 = makeInvGame();
  const info1 = f1.api['inventory.info']() as InventoryInfo;
  results.push(
    check('вместимость: resolve player.inventory.slots = 20 (база из данных)', () => info1.slotsResolved === 20),
  );
  results.push(check('вместимость: capacity = min(кап 60, resolve 20) = 20', () => info1.capacity === 20));

  // --- 2. поведение D19: модификатор −18 → resolve 2 → capacity 2
  f1.game.statBus.registerProvider(slotsProvider('selfcheck.inv.low', -18));
  const a1 = acquire(f1.api, 'lucky_charm', 1); // treasure, не стакается
  const a2 = acquire(f1.api, 'iron_pickaxe', 1); // tool, не стакается
  results.push(
    check('D19 в действии: два некстакающихся предмета заняли ровно 2 слота', () => a1.ok && a2.ok && list(f1.api).length === 2),
  );
  const beforeRefuse = JSON.stringify(list(f1.api));
  let refuseEvents = 0;
  const offRefuse = f1.game.bus.subscribe('item.acquired', () => refuseEvents++);
  const a3 = acquire(f1.api, 'iron_sword', 1);
  offRefuse();
  results.push(
    check('переполнение слотов: отказ партии целиком (без частичной выдачи)', () => !a3.ok && a3.error.includes('инвентарь полон')),
  );
  results.push(
    check('переполнение слотов: состояние не тронуто, событий 0', () =>
      JSON.stringify(list(f1.api)) === beforeRefuse && refuseEvents === 0),
  );

  // --- 3. рост вместимости модификатором: +100 → resolve 120 → capacity 60 (кап)
  f1.game.statBus.unregisterProvider('selfcheck.inv.low');
  f1.game.statBus.registerProvider(slotsProvider('selfcheck.inv.high', 100));
  f1.game.statBus.clearCache();
  const info2 = f1.api['inventory.info']() as InventoryInfo;
  results.push(
    check('D19 в действии: +100 к слотам → capacity = min(60, 120) = 60 (кап)', () => info2.capacity === 60),
  );
  const a4 = acquire(f1.api, 'iron_sword', 1);
  results.push(check('после роста вместимости предмет помещается', () => a4.ok && list(f1.api).length === 3));
  f1.dispose();

  // --- 4. качество: тир из допустимого набора, value 0..100
  const f2 = makeInvGame();
  let tiersOk = true;
  let valuesOk = true;
  for (let i = 0; i < 15; i++) {
    const r = acquire(f2.api, 'worm_bait', 1);
    if (!r.ok) {
      tiersOk = false;
      valuesOk = false;
      break;
    }
    if (!['D', 'C', 'B', 'A', 'S', 'SS'].includes(r.value.quality.tier)) tiersOk = false;
    if (!(r.value.quality.value >= 0 && r.value.quality.value < 100)) valuesOk = false;
  }
  results.push(check('качество: тир всегда из D..SS (15 роллов)', () => tiersOk));
  results.push(check('качество: value равномерно в [0, 100)', () => valuesOk));

  // детерминизм: пересев той же игры → тот же ролл
  const SEED = 987654321;
  f2.game.rngBus.setSeed(SEED);
  const q1 = acquire(f2.api, 'river_perch', 1);
  f2.game.rngBus.setSeed(SEED);
  const q2 = acquire(f2.api, 'river_perch', 1);
  results.push(
    check('качество детерминировано по сиду (пересев → идентичный ролл)', () => {
      if (!q1.ok || !q2.ok) return false;
      return q1.value.quality.tier === q2.value.quality.tier && q1.value.quality.value === q2.value.quality.value;
    }),
  );
  // и между двумя играми с одним сидом
  const f2b = makeInvGame();
  f2b.game.rngBus.setSeed(SEED);
  const q3 = acquire(f2b.api, 'river_perch', 1);
  results.push(
    check('качество детерминировано между играми (один сид → один ролл)', () => {
      if (!q1.ok || !q3.ok) return false;
      return q1.value.quality.tier === q3.value.quality.tier && q1.value.quality.value === q3.value.quality.value;
    }),
  );
  f2b.dispose();

  // --- 5. событие item.acquired с полным payload (D23)
  let captured: Record<string, unknown> | null = null;
  const offEvt = f2.game.bus.subscribe('item.acquired', (p) => {
    captured = p as Record<string, unknown>;
  });
  acquire(f2.api, 'bread', 3, 'test.src');
  offEvt();
  results.push(
    check('событие item.acquired: полный payload { defId, quality, qty, source }', () => {
      if (!captured) return false;
      const q = captured.quality as { tier?: unknown; value?: unknown } | undefined;
      return (
        captured.defId === 'bread' &&
        captured.qty === 3 &&
        captured.source === 'test.src' &&
        typeof q?.tier === 'string' &&
        typeof q?.value === 'number'
      );
    }),
  );

  // --- 6. стаки: слияние при полном равенстве defId+quality до maxStack
  const f3 = makeInvGame();
  const b1 = addQ(f3.api, 'seed_turnip', 'C', 42.5, 30);
  const b2 = addQ(f3.api, 'seed_turnip', 'C', 42.5, 30);
  const seeds = list(f3.api).filter((it) => it.defId === 'seed_turnip');
  results.push(
    check('стаки: слияние одинаковых defId+quality, лимит maxStack 50 (30+30 → 50+10)', () => {
      if (!b1.ok || !b2.ok) return false;
      const total = seeds.reduce((s, i) => s + i.qty, 0);
      return seeds.length === 2 && total === 60 && seeds.every((i) => i.qty <= 50);
    }),
  );

  // --- 7. разные качества — разные стаки
  addQ(f3.api, 'seed_turnip', 'C', 10, 5);
  addQ(f3.api, 'seed_turnip', 'B', 42.5, 5);
  const seedsNow = list(f3.api).filter((it) => it.defId === 'seed_turnip');
  results.push(
    check('разные качества = разные стаки (каждое занимает слот)', () => seedsNow.length === 4),
  );

  // --- 8. партия больше maxStack: нарезка записями
  const f4 = makeInvGame();
  const big = addQ(f4.api, 'iron_ore', 'D', 50, 2500);
  const ores = list(f4.api).filter((it) => it.defId === 'iron_ore');
  results.push(
    check('партия больше maxStack: нарезка записями (2500 при maxStack 999 → 999+999+502)', () => {
      if (!big.ok) return false;
      const total = ores.reduce((s, i) => s + i.qty, 0);
      return ores.length === 3 && total === 2500 && ores.every((i) => i.qty <= 999);
    }),
  );

  // --- 9. изъятие: по возрастанию качества, отказ при нехватке
  const f5 = makeInvGame();
  addQ(f5.api, 'turnip', 'D', 10, 5);
  addQ(f5.api, 'turnip', 'B', 20, 5);
  const rm1 = removeQ(f5.api, 'turnip', 6);
  const after = list(f5.api).filter((it) => it.defId === 'turnip');
  results.push(
    check('изъятие забирает худшие вперёд (D до B): 6 из 5+5 → остался B ×4', () => {
      if (!rm1.ok) return false;
      return after.length === 1 && after[0].quality.tier === 'B' && after[0].qty === 4;
    }),
  );
  const rm2 = removeQ(f5.api, 'turnip', 99);
  results.push(
    check('изъятие сверх наличия — отказ без изменений', () => !rm2.ok && list(f5.api).filter((it) => it.defId === 'turnip').length === 1),
  );
  f5.dispose();

  // --- 10. вкладки — из данных
  addQ(f4.api, 'bread', 'C', 30, 2);
  addQ(f4.api, 'iron_sword', 'D', 50, 1);
  const tabsInfo = f4.api['inventory.info']() as InventoryInfo;
  const supplies = f4.api['inventory.list']('supplies') as ItemInstance[];
  const gear = f4.api['inventory.list']('gear') as ItemInstance[];
  results.push(
    check('вкладки из данных: 4 вкладки, фильтры по вкладкам работают', () =>
      tabsInfo.tabs.length === 4 &&
      supplies.length === 1 &&
      supplies[0].defId === 'bread' &&
      gear.length === 1 &&
      gear[0].defId === 'iron_sword'),
  );

  // --- 11. подмена порта (D17): транзакционный грант попадает в инвентарь
  let kernelAcquired = 0;
  const offPort = f4.game.bus.subscribe('item.acquired', () => kernelAcquired++);
  const tr = f4.game.transaction.transact({
    grants: [{ t: 'item', defId: 'turnip', qty: 3 }],
    eventId: 'selfcheck.port',
  });
  offPort();
  results.push(
    check('подмена порта: транзакционный грант → предмет в инвентаре (с качеством)', () => {
      if (!tr.ok) return false;
      const turnips = list(f4.api).filter((it) => it.defId === 'turnip');
      return (
        turnips.reduce((s, i) => s + i.qty, 0) === 3 &&
        turnips.every((i) => ['D', 'C', 'B', 'A', 'S', 'SS'].includes(i.quality.tier))
      );
    }),
  );
  results.push(
    check('подмена порта: событие item.acquired РОВНО одно (публикует ядро, дублей нет)', () => kernelAcquired === 1),
  );

  // --- 12. портовый remove + отказ транзакции при нехватке (откат)
  const beforeFail = JSON.stringify(list(f4.api));
  const trFail = f4.game.transaction.transact({
    costs: [{ t: 'item', defId: 'turnip', qty: 999 }],
    eventId: 'selfcheck.portfail',
  });
  results.push(
    check('транзакция с нехваткой предметов: отказ, инвентарь цел', () => !trFail.ok && JSON.stringify(list(f4.api)) === beforeFail),
  );
  const trSell = f4.game.transaction.transact({
    costs: [{ t: 'item', defId: 'iron_ore', qty: 500 }],
    grants: [{ t: 'currency', id: 'gold', qty: 100 }],
    eventId: 'selfcheck.portsell',
  });
  results.push(
    check('транзакционное списание: 500 руды из стаков 999+999+502 → остаток 2000', () => {
      if (!trSell.ok) return false;
      return totalOf(f4.api, 'iron_ore') === 2000;
    }),
  );
  f4.dispose();
  f2.dispose();
  f3.dispose();

  // --- сейв-подгруппа: roundtrip, миграции v3→v4 / v2→v4, нормализация, v99
  results.push(...(await runInventorySaveChecks()));

  return group('M02 · Инвентарь: хранение и качество (часть 1)', results);
}
