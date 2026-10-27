/**
 * UseService M02.3 (D32): пайплайн использования расходника `inv use <iid>`.
 *
 * Порядок (D32): все проверки → transact → гранты.
 *  - валидность: запись есть, это consumable с useAction (иначе «не расходник»);
 *  - гейты ItemDef.requirements — единый оценщик M02.2 (checkCondition +
 *    describeCondition), отказ с причиной;
 *  - пригодность: схема UseEffect заморожена (D36) — ТОЛЬКО grantEnergy/grantHp
 *    с положительным значением; 'modifier'-бафы — только спека-процессом;
 *  - расход 1 единицы ЧЕРЕЗ TransactionService (02 §9 — единственный способ
 *    тратить предметы): cost {t:'item', qty:1}; ядро транзакционно (ЦЕЛИКОМ или
 *    отказ), изъятие выбирает порт хранилища — худшие вперёд (D25), экипированные
 *    защищены (D30), последняя единица удаляет запись;
 *  - гранты (D33): клэмп-добавления через публичный API игрока — канал вайрит
 *    app-слой (bootstrap → ModuleRegistry.get('player'); прямой импорт запрещён,
 *    П4); отказать не могут (клэмп на капе — не отказ).
 *
 * [QUESTION · бриф D32(5)] событие item.consumed публикует ЯДРО в момент
 * transact — ровно одно на use, но payload ядра заморожен: {defId, qty, source}
 * БЕЗ iid (предписано {defId, iid, qty:1}). Модуль дубль не публикует:
 * «ровно одно» (целостность подписчиков) важнее формы payload; канон состояния —
 * API инвентаря (D29-прецедент двойной формы). Ядро также публикует
 * wallet.transaction с пустыми grants — неизбежное следствие cost-only transact.
 *
 * ШВЫ (D36): заточка → M10 (ModuleRegistry.get('forging') в будущем);
 * разобрать → M09 (25% ресурсов рецепта); подарить → M16 (флаг giftable).
 * Здесь этих вызовов НЕТ — только документация швов.
 */
import type { EventBus } from '@/kernel/bus/event-bus/event-bus';
import type { TransactionService } from '@/kernel/services/transaction/transaction-service';
import type { ID } from '@/shared/types/ids';
import { err, ok, type Result } from '@/shared/types/result';
import type { ItemDef, UseEffectDef } from '@/content/items/items';
import type { InventoryState } from './state';
import { buildGateCtx, describeCondition, firstFailedRequirement, type GateCtxDeps } from './equipment';

export interface UseEffectApplied {
  t: 'grantEnergy' | 'grantHp';
  value: number;
}

export interface UseReceipt {
  defId: ID;
  iid: ID;
  effects: UseEffectApplied[];
}

export interface UseDeps {
  tryItem(defId: ID): ItemDef | undefined;
  transaction: TransactionService;
  bus: EventBus;
  /** гейт-контекст требований (тот же, что у экипировки M02.2) */
  gate: GateCtxDeps;
  /** D33-канал грантов: app-слой вайрит player.grantEnergy/grantHp (П4).
   *  Отсутствие канала = отказ ДО транзакции (предмет не теряется). */
  applyUseEffect?(t: 'grantEnergy' | 'grantHp', value: number, reason: string): void;
  getState(): InventoryState;
  markDirty(): void;
}

/** Пригодность эффекта (D36): только grantEnergy/grantHp с положительным значением */
export function parseEffect(e: UseEffectDef): Result<UseEffectApplied> {
  if (e.t === 'grantEnergy' || e.t === 'grantHp') {
    if (typeof e.value === 'number' && Number.isFinite(e.value) && e.value > 0) {
      return ok({ t: e.t, value: e.value });
    }
    return err(`эффект ${e.t} без положительного значения — контент сломан`);
  }
  return err(`эффект «${e.t}» не поддерживается (схема UseEffect заморожена, D36 — бафы только спека-процессом)`);
}

export class UseService {
  private readonly deps: UseDeps;

  constructor(deps: UseDeps) {
    this.deps = deps;
  }

  use(iid: ID): Result<UseReceipt> {
    // --- валидность: запись + шаблон + расходник (Q8: валидность первой)
    const state = this.deps.getState();
    const entry = state.items.find((it) => it.iid === iid);
    if (!entry) return err(`предмет "${iid}" не найден в инвентаре`);
    const def = this.deps.tryItem(entry.defId);
    if (!def) return err(`предмет-шаблон "${entry.defId}" не найден в content/items`);
    if (def.itemType !== 'consumable' || !def.useAction || def.useAction.effects.length === 0) {
      return err(`${def.name} — не расходник (использовать можно только consumable с useAction)`);
    }
    // --- гейты использования (карточка §3): единый оценщик, отказ с причиной
    const failed = firstFailedRequirement(def.requirements, buildGateCtx(this.deps.gate));
    if (failed) {
      return err(`нельзя использовать «${def.name}»: ${describeCondition(failed)}`);
    }
    // --- пригодность эффектов (D36) + наличие канала грантов (fail-closed)
    const effects: UseEffectApplied[] = [];
    for (const e of def.useAction.effects) {
      const parsed = parseEffect(e);
      if (!parsed.ok) return err(parsed.error);
      effects.push(parsed.value);
    }
    if (effects.length > 0 && !this.deps.applyUseEffect) {
      return err('канал эффектов игрока не подключён (app-слой: ModuleRegistry → player.grantEnergy/grantHp)');
    }
    // --- расход 1 единицы через TransactionService (ЦЕЛИКОМ или отказ, D32(3))
    const r = this.deps.transaction.transact({
      costs: [{ t: 'item', defId: entry.defId, qty: 1 }],
      eventId: 'item.use',
      reason: `использование ${def.name} (${iid})`,
    });
    if (!r.ok) return err(r.error);
    // --- гранты (D32(4)): после успешного transact; клэмп-добавления, не отказывают
    for (const e of effects) {
      this.deps.applyUseEffect?.(e.t, e.value, 'item.use');
    }
    this.deps.markDirty();
    return ok({ defId: entry.defId, iid, effects });
  }
}
