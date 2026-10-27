/**
 * Резолв событий-мини С ВЫБОРОМ и «Клада» карты сокровищ (M07.2 · F13/F14).
 * Чистые функции над данными + колбэки выдачи (штатные каналы: TransactionService
 * grants / skills.addXp / inventory.acquire-remove). До фазы 6 — авто-резолв
 * ДЕФОЛТНОЙ (первой) опции; dev fish.choice подменяет одноразово (пробы);
 * manual — M18 (НЕ этот сеанс).
 */
import type { RngBus } from '@/kernel/bus/rng-bus/rng-bus';
import type { TransactionService } from '@/kernel/services/transaction/transaction-service';
import type { CurrencyId, ID } from '@/shared/types/ids';
import type {
  FishingEventDef,
  TreasureMapEntryDef,
  TreasureMapEventDef,
} from '@/content/fishing/fish';
import { weightedPick01 } from './rolls';

/** резолв выбора события-мини (F14): что выбрали и что вышло */
export interface ChoiceReceipt {
  eventId: ID;
  eventName: string;
  optionId: ID;
  label: string;
  /** текстовое описание исхода (витрина) */
  outcome: string;
  /** награда выдачи (золото) — если была */
  granted: string | null;
}

/** резолв «Клада» карты сокровищ (F13) */
export interface TreasureReceipt {
  choice: 'open' | 'stash';
  /** награда вскрытия (open): запись таблицы + qty */
  reward: { kind: 'currency' | 'item'; defId: ID; qty: number } | null;
}

export interface EventResolveDeps {
  rngBus: RngBus;
  transaction: TransactionService;
  treasureMap: readonly TreasureMapEntryDef[];
  treasureEvent: TreasureMapEventDef;
  probeCapacity(defId: ID, qty: number): { ok: boolean; value?: { fits: boolean } };
  acquire(defId: ID, qty: number, source: string): { ok: boolean };
  removeItem(defId: ID, qty: number, source: string): { ok: boolean };
  grantSkillXp(skill: ID, amount: number, source: string): void;
}

/** текст исхода опции (витрина П6) */
function describeOutcome(outcome: { t: string; skill?: string; amount?: number; qty?: number }): string {
  if (outcome.t === 'skillXp') return `+${outcome.amount ?? 0} XP навыка «${outcome.skill ?? '—'}»`;
  if (outcome.t === 'gold') return `золото +${outcome.qty ?? 0}`;
  if (outcome.t === 'treasureRoll') return 'ролл награды из карты-таблицы';
  return 'ничего';
}

/** [F14] событие-мини: выбор опции (dev-подмена / дефолт первая) + исход */
export function resolveEventChoice(
  d: EventResolveDeps,
  event: FishingEventDef,
  devChoice: string | null,
): ChoiceReceipt {
  const opt = event.options.find((o) => o.id === devChoice) ?? event.options[0]!;
  let granted: string | null = null;
  if (opt.outcome.t === 'skillXp') {
    d.grantSkillXp(opt.outcome.skill, opt.outcome.amount, 'fishing.event');
  } else if (opt.outcome.t === 'gold') {
    const tx = d.transaction.transact({
      grants: [{ t: 'currency', id: 'gold', qty: opt.outcome.qty }],
      eventId: 'fish.cast',
      reason: `событие-мини «${event.name}»: выбор «${opt.label}»`,
    });
    if (tx.ok) granted = `золото +${opt.outcome.qty}`;
  }
  return {
    eventId: event.id,
    eventName: event.name,
    optionId: opt.id,
    label: opt.label,
    outcome: describeOutcome(opt.outcome),
    granted,
  };
}

/** [F13] вылов Карты сокровищ → «Клад»: «Открыть сейчас» (ролл награды из
 *  карты-таблицы, стрим fish:treasure:<iid>, карта расходуется) / «Спрятать»
 *  (карта остаётся предметом — трофей/продажа) */
export function resolveTreasureMap(
  d: EventResolveDeps,
  lootIid: ID | null,
  devChoice: string | null,
): TreasureReceipt {
  const te = d.treasureEvent;
  const opt = te.options.find((o) => o.id === devChoice) ?? te.options[0]!;
  if (opt.outcome.t !== 'treasureRoll') {
    return { choice: 'stash', reward: null };
  }
  const streamKey = `fish:treasure:${lootIid ?? 'map'}`;
  const roll01 = d.rngBus.rollRange(0, 1, 'uniform', streamKey);
  const entry =
    weightedPick01(
      d.treasureMap.map((e) => ({ item: e, weight: Math.max(0, e.weight) })),
      roll01,
    ) ?? d.treasureMap[0] ?? null;
  if (entry === null) {
    return { choice: 'open', reward: null };
  }
  const qty = Math.round(d.rngBus.rollRange(entry.qty[0], entry.qty[1], 'uniform', `${streamKey}:qty`));
  // карта расходуется (штатный канал item.consumed); отказ — награды нет
  const removed = d.removeItem('treasure_map', 1, 'fishing.treasure');
  if (!removed.ok) {
    return { choice: 'open', reward: null };
  }
  if (entry.kind === 'currency') {
    const tx = d.transaction.transact({
      grants: [{ t: 'currency', id: entry.defId as CurrencyId, qty }],
      eventId: 'fish.cast',
      reason: `«Клад»: вскрытие карты — ${entry.defId} ${qty}`,
    });
    return { choice: 'open', reward: tx.ok ? { kind: 'currency', defId: entry.defId, qty } : null };
  }
  const probe = d.probeCapacity(entry.defId, qty);
  if (!probe.ok || !probe.value?.fits) {
    return { choice: 'open', reward: null };
  }
  const g = d.acquire(entry.defId, qty, 'fishing');
  return { choice: 'open', reward: g.ok ? { kind: 'item', defId: entry.defId, qty } : null };
}
