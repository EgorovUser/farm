/**
 * Награды M15 (карточка §2: TransactionService + passivePoint + flag + xp).
 *
 * [DECISION · модель выдачи] два класса наград:
 *  - СОБЫТИЙНЫЕ (xp, passivePoint) привязаны к событию завершения: xp — канал
 *    M01-таблицы (xpEvents: quest.completed/achievement.unlocked c xpKey 'xp'),
 *    passivePoint — поле rewards пейлоада (слушатель M14, фаза 4). Событие —
 *    единственный канал между модулями (П4/N2), выдача ровно один раз по
 *    идемпотентности события завершения;
 *  - МАТЕРИАЛЬНЫЕ (currency, item, flag): цепочки — авто-выдача при завершении
 *    шага (карточка §4 «шаг может выдать предмет / разблокировать систему»),
 *    daily/weekly/ачивки — claim'ом (квитанция TransactionService; невзятые
 *    пропадают на границе периода, карточка §3).
 */
import type { EventBus } from '@/kernel/bus/event-bus/event-bus';
import type { TransactionService } from '@/kernel/services/transaction/transaction-service';
import type { Result } from '@/shared/types/result';
import { err, ok } from '@/shared/types/result';
import type { CurrencyId, ID } from '@/shared/types/ids';
import type { Reward } from '@/content/quests/types';

export interface RewardDeps {
  bus: EventBus;
  transaction: TransactionService;
  getFlags(): string[];
  addFlags(flags: string[]): void;
  markDirty(): void;
}

/** гранты транзакции: только currency/item (Cost — канон 02-BUSES §9) */
type TxGrant = { t: 'currency'; id: CurrencyId; qty: number } | { t: 'item'; defId: ID; qty: number };

/** Σ XP-наград (поле xp пейлоада завершения — канал M01) */
export function xpSumOf(rewards: readonly Reward[] | undefined): number {
  return (rewards ?? []).reduce((s, r) => (r.t === 'xp' ? s + r.qty : s), 0);
}

/** материальные награды: всё, что выдаётся транзакцией/флагом */
export function materialRewardsOf(rewards: readonly Reward[] | undefined): Reward[] {
  return (rewards ?? []).filter((r): r is Exclude<Reward, { t: 'xp' | 'passivePoint' }> => r.t !== 'xp' && r.t !== 'passivePoint');
}

export interface GrantReceipt {
  granted: Reward[];
  flags: string[];
  transaction: { eventId: string; grants: Array<{ t: 'currency' | 'item'; id: string; qty: number }> } | null;
}

/**
 * Выдать материальные награды: currency+item — ОДНОЙ атомарной транзакцией
 * (eventId — повод: 'quest.claim' | 'quest.chain' | 'achievement.claim'),
 * flag — в срез флагов. xp/passivePoint НЕ выдаются здесь (событийные).
 */
export function grantMaterialRewards(
  deps: RewardDeps,
  rewards: readonly Reward[],
  eventId: string,
  reason: string,
): Result<GrantReceipt> {
  const flags: string[] = [];
  const txGrants: TxGrant[] = [];
  for (const r of rewards) {
    if (r.t === 'flag') {
      if (!flags.includes(r.flag)) flags.push(r.flag);
    } else if (r.t === 'currency' || r.t === 'item') {
      txGrants.push(r);
    } // xp/passivePoint — событийные, здесь их нет
  }
  let transaction: GrantReceipt['transaction'] = null;
  if (txGrants.length > 0) {
    const tx = deps.transaction.transact({ grants: txGrants, eventId, reason });
    if (!tx.ok) return err(tx.error);
    transaction = { eventId, grants: tx.value.grants };
  }
  if (flags.length > 0) deps.addFlags(flags);
  if (flags.length > 0 || transaction !== null) deps.markDirty();
  return ok({ granted: [...rewards], flags, transaction });
}
