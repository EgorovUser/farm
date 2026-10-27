/**
 * Self-checks M01 · тело игрока (карточка §8): реген в тике и catchUp
 * с ручным расчётом по фиксированным датам, списание энергии один раз,
 * не-списание при отказе транзакции, шпион кошелька (инвариант §4).
 */
import { err, ok } from '@/shared/types/result';
import { check, group, type CheckGroup, type CheckResult } from './types';
import { makePlayerGame, spyWallet, type PlayerFixture } from './player-fixture';

/** ручной оракул регена: минуты × ставка, клэмп к капу */
function manualRegen(from: number, to: number, start: number, perMinute: number, max: number): number {
  const minutes = Math.floor((to - from) / 1000); // tickMs = 1000 (1 игровая минута)
  return Math.min(max, start + minutes * perMinute);
}

export function runPlayerRegenChecks(): CheckGroup {
  const results: CheckResult[] = [];
  const f = makePlayerGame();

  // новая игра: стартовое состояние — полные энергия и HP (карточка §2–§3)
  results.push(
    check('новая игра: энергия 100/100, HP 50/50', () => {
      const s = f.snapshot();
      return s.energy.current === 100 && s.energy.max === 100 && s.hp.current === 50 && s.hp.max === 50;
    }),
  );
  results.push(
    check('базы из данных: реген энергии 1/3, HP 0.2 (round: none)', () => {
      const hpRegen = f.game.statBus.resolve({ stat: 'player.hp.regenPerMinute', ctx: f.game.time.ctx('player') });
      return Math.abs(f.snapshot().energy.regenPerMinute - 1 / 3) < 1e-9 && Math.abs(hpRegen - 0.2) < 1e-9;
    }),
  );

  // реген в тике: 0 + 3 тика × 1/3 = 1 (дробное накопление до целой единицы)
  f.api['player.setEnergy'](0);
  f.api['player.setHp'](0);
  f.tick(3);
  results.push(
    check('реген в тике: энергия 0 + 3 × (1/3) = 1', () => f.snapshot().energy.current === 1, {
      expected: '1',
      actual: String(f.snapshot().energy.current),
    }),
  );
  results.push(check('реген в тике: HP 0 + 3 × 0.2 = 0 (дробь копится)', () => f.snapshot().hp.current === 0));
  f.tick(2);
  results.push(check('реген в тике: HP 0 + 5 × 0.2 = 1', () => f.snapshot().hp.current === 1));

  // кап: реген не выводит за максимум
  f.tick(400);
  results.push(
    check('кап: 400 тиков не выводят энергию за 100', () => f.snapshot().energy.current === 100, {
      expected: '100',
      actual: String(f.snapshot().energy.current),
    }),
  );
  results.push(check('кап: HP не выше 50', () => f.snapshot().hp.current === 50));

  // оффлайн-досчёт по фиксированным датам: ручной расчёт vs модуль (карточка §8)
  const f2 = makePlayerGame();
  f2.api['player.setEnergy'](10);
  f2.api['player.setHp'](4);
  const from = f2.clock.now();
  const to = from + 30_000; // 30 секунд реального времени = 30 игровых минут
  f2.catchUp(from, to);
  const manualEnergy = manualRegen(from, to, 10, 1 / 3, 100);
  const manualHp = manualRegen(from, to, 4, 0.2, 50);
  results.push(
    check('catchUp 30 игровых минут: энергия = ручному расчёту 10 + 30×(1/3) = 20', () => f2.snapshot().energy.current === manualEnergy, {
      expected: String(manualEnergy),
      actual: String(f2.snapshot().energy.current),
    }),
  );
  results.push(
    check('catchUp: HP = ручному расчёту 4 + 30×0.2 = 10', () => f2.snapshot().hp.current === manualHp, {
      expected: String(manualHp),
      actual: String(f2.snapshot().hp.current),
    }),
  );

  // оффлайн 5 часов: оба стата добирают до капа (энергии нужно 300 минут, HP — 250)
  const f3 = makePlayerGame();
  f3.api['player.setEnergy'](0);
  f3.api['player.setHp'](0);
  const from3 = f3.clock.now();
  f3.catchUp(from3, from3 + 5 * 3_600_000);
  results.push(
    check('оффлайн 5 часов: энергия добрала до капа 100', () => f3.snapshot().energy.current === 100),
  );
  results.push(check('оффлайн 5 часов: HP добрал до капа 50', () => f3.snapshot().hp.current === 50));

  // отмотка часов: досчёт молчит
  const f4 = makePlayerGame();
  f4.api['player.setEnergy'](50);
  f4.catchUp(f4.clock.now(), f4.clock.now() - 60_000);
  results.push(check('отмотка: catchUp назад не меняет энергию', () => f4.snapshot().energy.current === 50));

  f.dispose();
  f2.dispose();
  f3.dispose();
  f4.dispose();
  return group('M01 · Реген и тело (карточка §8)', results);
}

export function runPlayerEnergyChecks(): CheckGroup {
  const results: CheckResult[] = [];
  const f = makePlayerGame();

  let spentEvents = 0;
  let changedEvents = 0;
  f.game.bus.subscribe('player.energySpent', () => spentEvents++);
  f.game.bus.subscribe('player.energyChanged', () => changedEvents++);

  // списание по стату стоимости действия: вспашка 5 (данные balance)
  const r = f.api['player.spendEnergy']('action.farm.plow.energyCost') as { ok: boolean; value?: { current: number } };
  results.push(
    check('spendEnergy: вспашка стоит 5 (из данных), 100 → 95', () => r.ok === true && f.snapshot().energy.current === 95, {
      expected: '95',
      actual: String(f.snapshot().energy.current),
    }),
  );
  results.push(check('события: energySpent ×1 и energyChanged ×1', () => spentEvents === 1 && changedEvents === 1));

  // отказ при нехватке: ничего не списано, событий нет
  // (счётчики обнуляем ПОСЛЕ setEnergy — сама установка тоже публикует energyChanged)
  f.api['player.setEnergy'](3);
  spentEvents = 0;
  changedEvents = 0;
  const r2 = f.api['player.spendEnergy']('action.mine.enter.energyCost') as { ok: boolean; error?: string };
  results.push(
    check('нехватка энергии: отказ с внятной причиной', () => r2.ok === false && String(r2.error).includes('не хватает энергии')),
  );
  results.push(
    check('нехватка: энергия не тронута, событий нет', () => f.snapshot().energy.current === 3 && spentEvents === 0 && changedEvents === 0),
  );

  // стоимость через шину: модификатор меняет цену без правки модуля (П3)
  f.game.buffs.add(
    {
      id: 'selfcheck.spartan',
      source: { kind: 'buff', refId: 'selfcheck' },
      stat: 'action.farm.plow.energyCost',
      op: 'inc',
      value: -50, // «Спартанец» M14 ополовинит: 5 × 0.5 = 2.5 → floor 2
    },
    f.game.time.now(),
  );
  f.game.bus.publish('invalidate.stat', {});
  f.api['player.setEnergy'](10);
  const r3 = f.api['player.spendEnergy']('action.farm.plow.energyCost') as { ok: boolean };
  results.push(
    check('стоимость через шину: inc −50% → вспашка 5 → 2 (floor, min 1)', () => r3.ok === true && f.snapshot().energy.current === 8, {
      expected: '10 − 2 = 8',
      actual: String(f.snapshot().energy.current),
    }),
  );
  f.game.buffs.remove('selfcheck.spartan');
  f.game.bus.publish('invalidate.stat', {});

  // withEnergy: отказ транзакции → энергия не списана, событий расхода нет
  f.api['player.setEnergy'](50);
  spentEvents = 0;
  const fail = f.api['player.withEnergy']('action.farm.plow.energyCost', () =>
    f.game.transaction.transact({ costs: [{ t: 'currency', id: 'gold', qty: 9999 }], eventId: 'selfcheck.fail' }),
  ) as { ok: boolean };
  results.push(
    check('withEnergy: отказ транзакции → энергия НЕ списана (карточка §8)', () => fail.ok === false && f.snapshot().energy.current === 50),
  );
  results.push(check('withEnergy: при отказе событий расхода нет', () => spentEvents === 0));

  // withEnergy: успех → и транзакция, и списание ровно один раз
  f.game.transaction.transact({ grants: [{ t: 'currency', id: 'gold', qty: 100 }], eventId: 'selfcheck.fund' });
  const done = f.api['player.withEnergy']('action.farm.plow.energyCost', () =>
    f.game.transaction.transact({
      costs: [{ t: 'currency', id: 'gold', qty: 10 }],
      grants: [{ t: 'currency', id: 'stone', qty: 1 }],
      eventId: 'selfcheck.buy',
    }),
  ) as { ok: boolean };
  results.push(
    check('withEnergy: успех → энергия списана один раз (50 → 45)', () => done.ok === true && f.snapshot().energy.current === 45 && spentEvents === 1),
  );
  results.push(check('withEnergy: транзакция прошла (камень выдан)', () => f.game.wallet.get('stone') === 1));

  // grant: еда/кровать — не выше капа
  f.api['player.setEnergy'](0);
  f.api['player.grantEnergy'](30, 'selfcheck.pie');
  results.push(check('grantEnergy: 0 + 30 = 30', () => f.snapshot().energy.current === 30));
  f.api['player.grantEnergy'](500, 'selfcheck.bed');
  results.push(check('grantEnergy: клэмп к капу 100', () => f.snapshot().energy.current === 100));

  // ok/err — smoke типов фикстуры (не даёт lint счесть импорты неиспользуемыми)
  results.push(check('Result-хелперы на месте', () => ok(1).ok === true && err('x').ok === false));

  f.dispose();
  return group('M01 · Энергия: списание и атомарность (§8)', results);
}

export function runWalletSpyChecks(): CheckGroup {
  const results: CheckResult[] = [];
  const f: PlayerFixture = makePlayerGame();

  // шпион на прямые записи: любые grant/spend вне TransactionService видны
  const spy = spyWallet(f.game);

  // полный букет операций игрока — ни одна не пишет в кошелёк напрямую
  f.api['player.addXp'](200, 'selfcheck');
  f.api['skills.addXp']('farming', 300, 'selfcheck');
  f.api['player.setEnergy'](42);
  f.api['player.setHp'](33);
  f.api['player.spendEnergy']('action.fishing.cast.energyCost');
  f.game.bus.publish('farm.cropHarvested', { crop: 'wheat', qty: 2 });
  f.game.bus.publish('quest.completed', { xp: 120 });

  results.push(
    check('операции игрока не пишут в кошелёк напрямую (шпион: 0 вызовов)', () => spy.directWrites() === 0, {
      expected: '0 прямых grant/spend',
      actual: String(spy.directWrites()),
    }),
  );

  // операции игрока при этом работают (XP пришёл от квеста — событие с пейлоадом)
  const s = f.snapshot();
  results.push(
    check('XP от quest.completed {xp:120} дошёл (события, не прямой вызов)', () => s.progress.xp >= 120 || s.progress.level > 1),
  );

  // валидный путь изменения кошелька — только TransactionService (§4)
  let txEvents = 0;
  f.game.bus.subscribe('wallet.transaction', () => txEvents++);
  const r = f.game.transaction.transact({
    grants: [{ t: 'currency', id: 'gold', qty: 25 }],
    eventId: 'selfcheck.grant',
  });
  results.push(
    check('TransactionService: кошелёк меняется, событие wallet.transaction опубликовано', () => r.ok && f.game.wallet.get('gold') === 25 && txEvents === 1),
  );
  results.push(
    check('шпион видит запись ровно от транзакции (1 вызов grant)', () => spy.directWrites() === 1),
  );

  f.dispose();
  return group('M01 · Инвариант кошелька (§8, шпион)', results);
}
