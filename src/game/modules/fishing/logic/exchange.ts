/**
 * Обмен снасти на улов (M07.1 F6 / M07.2 — расщепление cast.ts по 01 §6):
 * расход наживки (unequip → TransactionService → re-equip с авто-пополнением
 * из рюкзака), выдача улова (acquire-канон D23, источник 'fishing'), износ
 * удочки (inventory.wear D35). Атомарность: отказ транзакции — возврат
 * наживки в слот, ничего не списано; emergency-предохранители
 * fish.cast.refund (прецедент shop.buy.refund).
 */
import type { ID, QualityTier } from '@/shared/types/ids';
import type { Result } from '@/shared/types/result';
import { err, ok } from '@/shared/types/result';
import type { ChestEntryDef } from '@/content/fishing/fish';
import type { EquippedEntryView } from './bait-provider';

export interface ExchangeDeps {
  transaction: {
    transact(req: {
      costs?: Array<{ t: 'item'; defId: ID; qty: number } | { t: 'currency'; id: ID; qty: number }>;
      grants?: Array<{ t: 'item'; defId: ID; qty: number } | { t: 'currency'; id: ID; qty: number }>;
      eventId: string;
      reason?: string;
    }): Result<unknown>;
  };
  acquire(defId: ID, qty: number, source: string): Result<{ quality: { tier: QualityTier; value: number }; iids?: ID[] }>;
  unequip(slot: ID): Result<unknown>;
  equip(iid: ID, slot: ID): Result<unknown>;
  findEntryByDef(defId: ID): ID | null;
  wear(iid: ID, n: number): Result<{ current: number; max: number; broken: boolean }>;
}

export interface ExchangeArgs {
  loc: string;
  rodView: EquippedEntryView;
  baitView: EquippedEntryView;
  /** предмет улова (рыба/мусор/карта) — null для валют/событий */
  resultDefId: ID | null;
  resultQty: number;
  /** валютная запись сундука (грант в транзакции) */
  chest: ChestEntryDef | null;
  chestQty: number | null;
}

export interface ExchangeOutcome {
  quality: { tier: QualityTier; value: number } | null;
  lootIid: ID | null;
  rod: { current: number; max: number };
  baitInSlot: boolean;
}

export function performLootExchange(d: ExchangeDeps, a: ExchangeArgs): Result<ExchangeOutcome> {
  // --- расход наживки: снятие → транзакция (кост: наживка; грант: валюта
  //     сундука) → (отказ: возврат в слот, ничего не списано)
  const baitIid = a.baitView.entry.iid;
  const off = d.unequip('bait');
  if (!off.ok) return err(`не удалось снять наживку: ${off.error}`);
  const pay = d.transaction.transact({
    costs: [{ t: 'item', defId: a.baitView.entry.defId, qty: 1 }],
    ...(a.chestQty !== null && a.chest
      ? { grants: [{ t: 'currency' as const, id: a.chest.defId, qty: a.chestQty }] }
      : {}),
    eventId: 'fish.cast',
    reason: `заброс (${a.loc}): расход наживки ${a.baitView.entry.defId}${a.chestQty !== null && a.chest ? `, улов сундука: ${a.chest.defId} ${a.chestQty}` : ''}`,
  });
  if (!pay.ok) {
    d.equip(baitIid, 'bait');
    return err(pay.error);
  }

  // --- выдача улова (acquire-канон: качество D23, источник 'fishing')
  let quality: { tier: QualityTier; value: number } | null = null;
  let lootIid: ID | null = null;
  if (a.resultDefId !== null) {
    const grant = d.acquire(a.resultDefId, a.resultQty, 'fishing');
    if (!grant.ok) {
      // emergency-предохранитель: проба была зелёной — компенсирующая транзакция
      d.transaction.transact({
        grants: [{ t: 'item', defId: a.baitView.entry.defId, qty: 1 }],
        eventId: 'fish.cast.refund',
        reason: 'аварийный возврат наживки (выдача улова не удалась после зелёной пробы)',
      });
      d.equip(baitIid, 'bait');
      return err(grant.error);
    }
    quality = grant.value.quality;
    lootIid = grant.value.iids?.[0] ?? null;
  }

  // --- износ удочки (D35: −1 за заброс)
  const wear = d.wear(a.rodView.entry.iid, 1);
  const rod = wear.ok ? { current: wear.value.current, max: wear.value.max } : { current: 0, max: 0 };

  // --- наживка обратно в слот: свой iid, иначе — авто-пополнение из рюкзака
  //     (транзакция изымает худшие-качеством — стек слота мог уйти)
  let baitInSlot = false;
  const re = d.equip(baitIid, 'bait');
  if (re.ok) {
    baitInSlot = true;
  } else {
    const nextIid = d.findEntryByDef(a.baitView.entry.defId);
    if (nextIid !== null) {
      baitInSlot = d.equip(nextIid, 'bait').ok;
    }
  }
  return ok({ quality, lootIid, rod, baitInSlot });
}
