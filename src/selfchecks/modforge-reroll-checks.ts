/**
 * Self-checks M03.3 — реролл-цикл §6 + шов inventory.setRolls (§6/§10):
 * цена ceil(base(rarity)×min(growth^n,cap)) — [C2 · M04.2] база ПО РЕДКОСТИ
 * (оракулы: common 0:10 · 1:12 · 2:14 · 5:21 · 17:100-кап; uncommon
 * 0:20 · 1:23 · 2:27 · 5:41 · 17:200-кап; legendary 150/кап 1500, mythic 300/кап 3000);
 * happy path: платный реролл → pending в срезе (предмет НЕ меняется до выбора)
 * → choose new: стартовые роллы = вариант, инфляция сброшена; keep — роллы не
 * тронуты; [DECISION] forge-карточки переживают choose new (M10 — отдельная
 * система); повторный реролл при pending — геометрия §6; детерминизм: та же
 * попытка того же iid → тот же вариант; fail-closed: нет золота / нет modSlots
 * / неизвестный iid — отказы без списаний; шов setRolls: валидная партия +
 * invalidate.stat, битые (неизвестный тип / вне границ / дубликат / forge без
 * уровня / не-массив) — атомарный отказ; end-to-end: партия → setRolls →
 * equipmentProvider → resolve combat.attack = (5+12)×1.25 = 21 (канон M02.2
 * §7); pending переживает сейв-раундтрип. Всё детерминировано (явные гранты
 * транзакцией; реролл — свежий PRNG от хеша seed:iid:attempts). Арифметика
 * кошелька — кирка/меч uncommon (база 20): rr1 −20, rr2/rr3 −20/−20, rr4 −23.
 */
import { MemoryStorage } from '@/kernel/save/storage-drivers';
import { makeActionGame, type ActionFixture } from './inventory-action-fixture';
import { check, group, type CheckGroup, type CheckResult } from './types';

type MfApi = Record<string, (...args: unknown[]) => unknown>;
type R<T> = { ok: true; value: T } | { ok: false; error: string };

interface View {
  iid: string;
  attempts: number;
  nextCost: number;
  pending: Array<{ type: string; value: number }> | null;
}

function mfOf(f: ActionFixture): MfApi {
  return f.game.modules.get('modforge')?.api ?? {};
}

function grantGold(f: ActionFixture, qty: number): void {
  f.game.transaction.transact({
    grants: [{ t: 'currency', id: 'gold', qty }],
    eventId: 'selfcheck.m033-setup',
    reason: 'фикстура: золото для рероллов',
  });
}

function firstIid(f: ActionFixture, defId: string): string {
  const it = (f.api['inventory.list']() as Array<{ iid: string; defId: string }>).find((e) => e.defId === defId);
  if (!it) throw new Error(`фикстура: ${defId} не выдан`);
  return it.iid;
}

function rollsOf(f: ActionFixture, iid: string): Array<{ type: string; value: number; from: string; forgeLevel?: number }> {
  const it = (f.api['inventory.list']() as Array<{ iid: string; rolledMods: Array<{ type: string; value: number; from: string; forgeLevel?: number }> }>).find((e) => e.iid === iid);
  return it ? it.rolledMods : [];
}

export async function runModForgeRerollChecks(): Promise<CheckGroup> {
  const results: CheckResult[] = [];

  // --- 1. Цена реролла (§6, [C2 · M04.2] база по редкости: common 10, uncommon 20,
  //     legendary 150, mythic 300; рост ×1.15, кап ×10 базы)
  const f0 = makeActionGame();
  const mf0 = mfOf(f0);
  results.push(
    check('цена §6 [C2]: ceil(base(rarity)×min(1.15^n,10)) → common 0:10·1:12·2:14·5:21·17:100(кап); uncommon 0:20·1:23·2:27·5:41·17:200(кап); legendary 150/1500; mythic 300/3000', () => {
      const c = (r: string, n: number) => (mf0['modforge.rerollCost'](r, n) as R<number>);
      const oracles: Array<[string, number, number]> = [
        ['common', 0, 10], ['common', 1, 12], ['common', 2, 14], ['common', 5, 21], ['common', 17, 100], ['common', 100, 100],
        ['uncommon', 0, 20], ['uncommon', 1, 23], ['uncommon', 2, 27], ['uncommon', 5, 41], ['uncommon', 17, 200], ['uncommon', 100, 200],
        ['legendary', 0, 150], ['legendary', 17, 1500],
        ['mythic', 0, 300], ['mythic', 17, 3000],
      ];
      return (
        oracles.every(([r, n, want]) => {
          const got = c(r, n);
          return got.ok && got.value === want;
        }) &&
        !c('common', -3).ok &&
        !c('бред', 0).ok
      );
    }, {
      expected: 'common 10/12/14/21/100/100; uncommon 20/23/27/41/200/200; legendary 150/1500; mythic 300/3000; мусор — отказы',
      actual: 'посчитано по формуле контента (база по редкости, C2)',
    }),
  );
  f0.dispose();

  // --- 2–4. Happy path: реролл → pending → choose new (кирка uncommon → база 20)
  const f1 = makeActionGame();
  const mf1 = mfOf(f1);
  grantGold(f1, 200);
  f1.api['inventory.add']('iron_pickaxe', 'C', 50, 1, 'selfcheck');
  const pick1 = firstIid(f1, 'iron_pickaxe');
  let rolledEvents1: Array<Record<string, unknown>> = [];
  let walletEvents1: Array<Record<string, unknown>> = [];
  const offR = f1.game.bus.subscribe('modforge.rolled', (p) => rolledEvents1.push(p as Record<string, unknown>));
  const offW = f1.game.bus.subscribe('wallet.transaction', (p) => walletEvents1.push(p as Record<string, unknown>));
  const rr1 = mf1['modforge.reroll'](pick1) as R<{ defId: string; cost: number; attempts: number; nextCost: number; variant: Array<{ type: string; value: number }> }>;
  results.push(
    check('реролл: попытка 1 за 20 золота — uncommon-база [C2 · M04.2] (200→180 wallet), pending в срезе, предмет НЕ менялся до выбора', () => {
      if (!rr1.ok) return false;
      const v = mf1['modforge.rerollView'](pick1) as View;
      return (
        rr1.value.cost === 20 &&
        rr1.value.attempts === 1 &&
        rr1.value.nextCost === 23 &&
        f1.game.wallet.get('gold') === 180 &&
        v.attempts === 1 &&
        v.nextCost === 23 &&
        Array.isArray(v.pending) &&
        v.pending.length > 0 &&
        JSON.stringify(v.pending) === JSON.stringify(rr1.value.variant) &&
        rollsOf(f1, pick1).length === 0
      );
    }),
  );
  results.push(
    // [M10.1 · C1] легализация: payload += target { kind: 'item', refId: iid }
    check('реролл: события — wallet.transaction {modforge.reroll} ровно один + modforge.rolled {source: modforge.reroll} ровно один', () =>
      walletEvents1.length === 1 &&
      walletEvents1[0].eventId === 'modforge.reroll' &&
      rolledEvents1.length === 1 &&
      rolledEvents1[0].source === 'modforge.reroll' &&
      rolledEvents1[0].budget === 16 &&
      (rolledEvents1[0].target as { kind: string; refId: string } | null)?.kind === 'item' &&
      (rolledEvents1[0].target as { kind: string; refId: string } | null)?.refId === pick1),
  );

  const ch1 = mf1['modforge.choose'](pick1, 'new') as R<{ applied: boolean; rolls: Array<{ type: string; value: number; from: string }> }>;
  results.push(
    check('choose new: стартовые роллы = вариант (from initial, скоуп кирки → mine_sense/mine_instinct [M04.1 · C3]), инфляция сброшена', () => {
      if (!ch1.ok || !ch1.value.applied) return false;
      const v = mf1['modforge.rerollView'](pick1) as View;
      const rolls = rollsOf(f1, pick1);
      return (
        JSON.stringify(rolls) === JSON.stringify(ch1.value.rolls) &&
        rolls.length > 0 &&
        rolls.every((m) => m.from === 'initial' && (m.type === 'mine_sense' || m.type === 'mine_instinct')) &&
        v.attempts === 0 &&
        v.nextCost === 20 &&
        v.pending === null
      );
    }),
  );

  // --- 5. Детерминизм: та же попытка того же iid → тот же вариант.
  //     После choose new попытки СБРОШЕНЫ: rr2 идёт при attempts=0 (цена 10).
  const rr2 = mf1['modforge.reroll'](pick1) as R<{ variant: Array<{ type: string; value: number }> }>;
  const keep2 = mf1['modforge.choose'](pick1, 'keep') as R<{ applied: boolean }>;
  const rr3 = mf1['modforge.reroll'](pick1) as R<{ variant: Array<{ type: string; value: number }> }>;
  results.push(
    check('детерминизм реролла: сброс (keep) → та же попытка 0 → тот же вариант байт-в-байт; keep не тронул роллы', () => {
      if (!rr2.ok || !keep2.ok || keep2.value.applied || !rr3.ok) return false;
      const before = JSON.stringify(rollsOf(f1, pick1));
      const v = mf1['modforge.rerollView'](pick1) as View;
      return (
        JSON.stringify(rr2.value.variant) === JSON.stringify(rr3.value.variant) &&
        JSON.stringify(rollsOf(f1, pick1)) === before &&
        v.attempts === 1
      );
    }),
  );
  offR();
  offW();

  // --- 6. Повторный реролл при pending: попытка 2, цена 23 (геометрия §6, база 20).
  //     Кошелёк: 200 −20(rr1) −20(rr2) −20(rr3) = 140 → rr4 −23 → 117
  const rr4 = mf1['modforge.reroll'](pick1) as R<{ cost: number; attempts: number }>;
  results.push(
    check('повторный реролл при pending: попытка 2 за 23 золота (140→117), pending обновлён', () => {
      if (!rr4.ok) return false;
      const v = mf1['modforge.rerollView'](pick1) as View;
      return rr4.value.cost === 23 && rr4.value.attempts === 2 && f1.game.wallet.get('gold') === 117 && v.attempts === 2 && Array.isArray(v.pending);
    }),
  );

  // --- 7. Forge-карточки переживают choose new ([DECISION] M03.3)
  const ch2 = mf1['modforge.choose'](pick1, 'keep') as R<{ applied: boolean }>;
  void ch2;
  f1.api['inventory.add']('iron_sword', 'C', 50, 1, 'selfcheck');
  const sword1 = firstIid(f1, 'iron_sword');
  const setMixed = f1.api['inventory.setRolls'](sword1, [
    { type: 'atk_power', value: 5, from: 'initial' },
    { type: 'atk_finesse', value: 3, from: 'forge', forgeLevel: 2 },
  ]) as R<{ count: number }>;
  const forgeCardBefore = JSON.stringify(rollsOf(f1, sword1).find((m) => m.from === 'forge'));
  const rr5 = mf1['modforge.reroll'](sword1) as R<{ variant: Array<{ type: string }> }>;
  const ch3 = mf1['modforge.choose'](sword1, 'new') as R<{ applied: boolean; rolls: Array<{ type: string; from: string; forgeLevel?: number }> }>;
  results.push(
    check('choose new: forge-карточка сохранена байт-в-байт, initial заменён вариантом; сетап setRolls прошёл', () =>
      setMixed.ok &&
      setMixed.value.count === 2 &&
      rr5.ok &&
      ch3.ok &&
      ch3.value.applied &&
      JSON.stringify(rollsOf(f1, sword1).find((m) => m.from === 'forge')) === forgeCardBefore &&
      rollsOf(f1, sword1).filter((m) => m.from === 'initial').every((m) => rr5.value.variant.some((v) => v.type === m.type)) &&
      rollsOf(f1, sword1).some((m) => m.from === 'forge' && m.forgeLevel === 2)),
  );

  // --- 8. fail-closed: нет золота / нет modSlots / неизвестный iid.
  //     Кошелёк: 117 −20(rr5 меч) = 97 → сливаем ФАКТИЧЕСКИЙ остаток
  const drain = f1.game.wallet.get('gold');
  f1.game.transaction.transact({ costs: [{ t: 'currency', id: 'gold', qty: drain }], eventId: 'selfcheck.m033-drain' });
  f1.api['inventory.add']('bread', 'C', 50, 1, 'selfcheck');
  const bread1 = firstIid(f1, 'bread');
  const rNoGold = mf1['modforge.reroll'](pick1) as R<unknown>;
  const rNoSlots = mf1['modforge.reroll'](bread1) as R<unknown>;
  const rUnknown = mf1['modforge.reroll']('нет_такого#99') as R<unknown>;
  const rBadChoice = mf1['modforge.choose'](pick1, 'side') as R<unknown>;
  results.push(
    check('fail-closed: без золота / без modSlots / неизвестный iid / мусорный choice — отказы, pending не создан, кошелёк 0', () => {
      const v = mf1['modforge.rerollView'](pick1) as View;
      return (
        !rNoGold.ok &&
        !rNoSlots.ok &&
        !rUnknown.ok &&
        !rBadChoice.ok &&
        v.pending === null &&
        f1.game.wallet.get('gold') === 0
      );
    }),
  );
  f1.dispose();

  // --- 9. Шов setRolls: валидная партия + invalidate.stat; битые — атомарный отказ
  const f2 = makeActionGame();
  f2.api['inventory.add']('willow_rod', 'C', 50, 1, 'selfcheck');
  const rod1 = firstIid(f2, 'willow_rod');
  let invalidations = 0;
  const offI = f2.game.bus.subscribe('invalidate.stat', () => invalidations++);
  const setOk = f2.api['inventory.setRolls'](rod1, [{ type: 'lucky_glow', value: 10, from: 'initial' }]) as R<{ count: number; replaced: number }>;
  const invAfterSet = invalidations;
  const badParties: unknown[] = [
    'не массив',
    [{ type: 'бред', value: 5 }],
    [{ type: 'lucky_glow', value: 99 }],
    [{ type: 'lucky_glow', value: 5 }, { type: 'lucky_glow', value: 6 }],
    [{ type: 'atk_power', value: 5, from: 'forge' }],
  ];
  const badResults = badParties.map((p) => f2.api['inventory.setRolls'](rod1, p) as R<unknown>);
  const rollsAfterBad = JSON.stringify(rollsOf(f2, rod1));
  const setUnknownIid = f2.api['inventory.setRolls']('нет#1', []) as R<unknown>;
  results.push(
    check('setRolls: валидная партия применяется (count 1) + invalidate.stat; битые — атомарный отказ (5 вариантов), роллы не тронуты', () =>
      setOk.ok &&
      setOk.value.count === 1 &&
      setOk.value.replaced === 0 &&
      invAfterSet === 1 &&
      badResults.every((r) => !r.ok) &&
      JSON.stringify(rollsOf(f2, rod1)) === rollsAfterBad &&
      rollsAfterBad === JSON.stringify([{ type: 'lucky_glow', value: 10, from: 'initial' }]) &&
      !setUnknownIid.ok),
  );
  offI();
  f2.dispose();

  // --- 10. End-to-end: партия → setRolls → equipmentProvider → StatBus (канон M02.2 §7)
  const f3 = makeActionGame();
  f3.api['inventory.add']('iron_sword', 'D', 40, 1, 'selfcheck');
  const sword3 = firstIid(f3, 'iron_sword');
  f3.game.modules.call('player', 'player.addXp', 600, 'selfcheck'); // гейт уровня 5
  const before = f3.game.statBus.resolve({ stat: 'combat.attack', ctx: f3.game.time.ctx('player') });
  const eq3 = f3.api['inventory.equip'](sword3, 'weapon') as R<unknown>;
  const withBase = f3.game.statBus.resolve({ stat: 'combat.attack', ctx: f3.game.time.ctx('player') });
  const setRoll3 = f3.api['inventory.setRolls'](sword3, [{ type: 'atk_power', value: 25, from: 'initial' }]) as R<unknown>;
  const withRoll = f3.game.statBus.resolve({ stat: 'combat.attack', ctx: f3.game.time.ctx('player') });
  results.push(
    check('end-to-end: 5 → (5+12)=17 → ×1.25 → 21 (партия → setRolls → провайдер → шина)', () =>
      before === 5 && eq3.ok && withBase === 17 && setRoll3.ok && withRoll === 21, {
        expected: '5 → 17 → 21',
        actual: `${before} → ${withBase} → ${withRoll}`,
      }),
  );
  f3.dispose();

  // --- 11. Pending переживает сейв-раундтрип
  const storage = new MemoryStorage();
  const f4 = makeActionGame(storage);
  grantGold(f4, 50);
  f4.api['inventory.add']('iron_pickaxe', 'C', 50, 1, 'selfcheck');
  const pick4 = firstIid(f4, 'iron_pickaxe');
  const rr6 = mfOf(f4)['modforge.reroll'](pick4) as R<{ variant: unknown[] }>;
  const pendingBefore = JSON.stringify((mfOf(f4)['modforge.rerollView'](pick4) as View).pending);
  f4.dispose(); // dispose сохраняет
  const f5 = makeActionGame(storage);
  await f5.game.init();
  const v5 = mfOf(f5)['modforge.rerollView'](pick4) as View;
  results.push(
    check('сейв-раундтрип: pending и попытки переживают dispose/load; choose keep после загрузки работает', () => {
      if (!rr6.ok) return false;
      const okPending = v5.attempts === 1 && v5.nextCost === 23 && JSON.stringify(v5.pending) === pendingBefore;
      const keep5 = mfOf(f5)['modforge.choose'](pick4, 'keep') as R<{ applied: boolean }>;
      const after = mfOf(f5)['modforge.rerollView'](pick4) as View;
      return okPending && keep5.ok && !keep5.value.applied && after.attempts === 0 && f5.game.wallet.get('gold') === 30;
    }),
  );
  f5.dispose();

  return group('M03 · Модфордж: реролл-цикл и шов setRolls (§6)', results);
}
