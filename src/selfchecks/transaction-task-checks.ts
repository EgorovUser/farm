/**
 * Self-checks TransactionService + TaskRegistry (02-BUSES §13.5, §13.8).
 * Атомарность, отказ при нехватке, публикация событий; реестр исполнителей.
 */
import { EventBus } from '@/kernel/bus/event-bus/event-bus';
import { TransactionService } from '@/kernel/services/transaction/transaction-service';
import { SimpleStash } from '@/kernel/services/item-stash/simple-stash';
import { WalletService } from '@/kernel/services/wallet/wallet-service';
import { TaskRegistry } from '@/kernel/services/task-registry/task-registry';
import { err, ok } from '@/shared/types/result';
import type { Result } from '@/shared/types/result';
import { check, group, type CheckGroup, type CheckResult } from './types';

function makeSetup() {
  const bus = new EventBus();
  const wallet = new WalletService();
  const stash = new SimpleStash();
  let now = 1_700_000_000_000;
  const tx = new TransactionService({ wallet, items: stash, bus, now: () => now });
  return { bus, wallet, stash, tx, tick: () => (now += 1000) };
}

export function runTransactionChecks(): CheckGroup {
  const results: CheckResult[] = [];
  const { bus, wallet, stash, tx, tick } = makeSetup();

  let eventsFired = 0;
  bus.subscribe('wallet.transaction', () => eventsFired++);

  wallet.grant('gold', 100);
  stash.add('iron_ore', 5);

  // успешная транзакция: списание + выдача
  const r = tx.transact({
    costs: [
      { t: 'currency', id: 'gold', qty: 30 },
      { t: 'item', defId: 'iron_ore', qty: 2 },
    ],
    grants: [{ t: 'item', defId: 'turnip', qty: 3 }],
    eventId: 'selfcheck.buy',
  });
  results.push(check('успех: транзакция прошла', () => r.ok));
  results.push(check('списание золота: 100 − 30 = 70', () => wallet.get('gold') === 70));
  results.push(check('списание предметов: 5 − 2 = 3', () => stash.count('iron_ore') === 3));
  results.push(check('выдача грантов: turnip ×3', () => stash.count('turnip') === 3));
  results.push(check('событие wallet.transaction опубликовано', () => eventsFired === 1));

  // отказ при нехватке золота — ничего не меняется
  const r2 = tx.transact({
    costs: [{ t: 'currency', id: 'gold', qty: 999 }],
    grants: [{ t: 'item', defId: 'turnip', qty: 1 }],
    eventId: 'selfcheck.fail',
  });
  results.push(check('нехватка золота: отказ', () => !r2.ok));
  results.push(check('атомарность: золото не тронуто', () => wallet.get('gold') === 70));
  results.push(check('атомарность: грант не выдан', () => stash.count('turnip') === 3));
  results.push(check('событие при отказе НЕ публикуется', () => eventsFired === 1));

  // нехватка предметов
  const r3 = tx.transact({
    costs: [{ t: 'item', defId: 'iron_ore', qty: 99 }],
    eventId: 'selfcheck.fail2',
  });
  results.push(check('нехватка предметов: отказ', () => !r3.ok && stash.count('iron_ore') === 3));

  // много-валютная атомарность: одна из двух не хватает — обе целы
  wallet.grant('stone', 10);
  const r4 = tx.transact({
    costs: [
      { t: 'currency', id: 'gold', qty: 10 },
      { t: 'currency', id: 'stone', qty: 999 },
    ],
    eventId: 'selfcheck.fail3',
  });
  results.push(
    check('мульти-валюта: отказ оставил обе валюты целыми', () => !r4.ok && wallet.get('gold') === 70 && wallet.get('stone') === 10),
  );

  // события грантов
  let acquired = 0;
  let consumed = 0;
  bus.subscribe('item.acquired', () => acquired++);
  bus.subscribe('item.consumed', () => consumed++);
  tx.transact({
    costs: [{ t: 'item', defId: 'iron_ore', qty: 1 }],
    grants: [{ t: 'currency', id: 'gold', qty: 5 }],
    eventId: 'selfcheck.mix',
  });
  results.push(check('item.consumed опубликовано', () => consumed === 1));
  results.push(check('валютные гранты не плодят item-события', () => acquired === 0));
  tick();

  // receipt содержит чек
  const r5 = tx.transact({ grants: [{ t: 'currency', id: 'gold', qty: 1 }], eventId: 'selfcheck.receipt' });
  results.push(
    check('receipt несёт eventId и гранты', () => {
      if (!r5.ok) return false;
      return r5.value.eventId === 'selfcheck.receipt' && r5.value.grants.length === 1;
    }),
  );

  // [FIX-0.1 I] защитный отказ в фазе применения: порт-заглушка падает на ВТОРОМ
  // remove → уже списанное возвращается, состояние байт-в-байт, событий нет
  class SecondRemoveFails {
    readonly kind = 'stub' as const;
    private inner = new SimpleStash();
    calls = 0;
    count(defId: string): number {
      return this.inner.count(defId);
    }
    add(defId: string, qty: number): void {
      this.inner.add(defId, qty);
    }
    remove(defId: string, qty: number): Result<void> {
      this.calls++;
      if (this.calls === 2) return err('порт сломался на второй позиции (заглушка M02)');
      return this.inner.remove(defId, qty);
    }
    snapshot() {
      return JSON.stringify(this.inner.snapshot());
    }
  }
  const failingPort = new SecondRemoveFails();
  const busI = new EventBus();
  const walletI = new WalletService();
  walletI.grant('gold', 50);
  const txI = new TransactionService({
    wallet: walletI,
    items: failingPort,
    bus: busI,
    now: () => 1_700_000_000_000,
  });
  failingPort.add('iron_ore', 10);
  failingPort.add('turnip', 10);
  let txEvents = 0;
  let consumedEvents = 0;
  let acquiredEvents = 0;
  busI.subscribe('wallet.transaction', () => txEvents++);
  busI.subscribe('item.consumed', () => consumedEvents++);
  busI.subscribe('item.acquired', () => acquiredEvents++);

  const beforeItems = failingPort.snapshot();
  const beforeWallet = JSON.stringify(walletI.snapshot());
  const rI = txI.transact({
    costs: [
      { t: 'item', defId: 'iron_ore', qty: 2 },
      { t: 'item', defId: 'turnip', qty: 3 },
    ],
    grants: [{ t: 'currency', id: 'gold', qty: 5 }],
    eventId: 'selfcheck.rollback',
  });
  results.push(
    check('откат: отказ на 2-м remove возвращает 1-е списание (байт-в-байт)', () => !rI.ok && failingPort.snapshot() === beforeItems, {
      expected: beforeItems,
      actual: failingPort.snapshot(),
    }),
  );
  results.push(check('откат: кошелёк не тронут', () => JSON.stringify(walletI.snapshot()) === beforeWallet));
  results.push(
    check('откат: ни одного события (wallet/consumed/acquired)', () => txEvents === 0 && consumedEvents === 0 && acquiredEvents === 0),
  );
  results.push(check('откат: сообщение отказа доходит до вызывающего', () => (rI.ok ? false : rI.error.includes('порт сломался'))));

  return group('TransactionService (§13.5)', results);
}

export function runTaskRegistryChecks(): CheckGroup {
  const results: CheckResult[] = [];
  const tasks = new TaskRegistry();

  tasks.register('selfcheck.echo', {
    label: 'эхо для проверки',
    run: (ctx) => ok({ message: `now=${ctx.now}`, echo: ctx.params?.echo }),
  });

  const r = tasks.runTask('selfcheck.echo', { now: 42, params: { echo: 'привет' } });
  results.push(
    check('вызов исполнителя возвращает результат', () => {
      if (!r.ok) return false;
      return r.value.message === 'now=42' && r.value.echo === 'привет';
    }),
  );

  const missing = tasks.runTask('no.such.task', { now: 1 });
  results.push(check('отсутствующий исполнитель — штатный отказ', () => !missing.ok && missing.error.includes('не зарегистрирован')));

  tasks.register('selfcheck.boom', {
    run: () => {
      throw new Error('взрыв');
    },
  });
  const boom = tasks.runTask('selfcheck.boom', { now: 1 });
  results.push(check('упавший исполнитель — отказ, не крэш', () => !boom.ok));

  results.push(check('list() показывает исполнителей', () => tasks.list().some((t) => t.id === 'selfcheck.echo')));

  tasks.unregister('selfcheck.echo');
  const after = tasks.runTask('selfcheck.echo', { now: 1 });
  results.push(check('после unregister — отказ', () => !after.ok));

  return group('TaskRegistry (§13.8)', results);
}
