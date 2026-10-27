/**
 * SalvageService [FIX-PHASE-2 · 4.7 · SALV-1] — «Разобрать» (карточка M02 §3:
 * «разобрать (вернуть 25% ресурсов рецепта)», шов задокументирован в шапке
 * module.ts со времён M02.1; владелец по праву касания — этот сеанс).
 *
 *  - цель — КОНКРЕТНАЯ запись инвентаря (iid): разбор точечный, повтор той же
 *    записи — штатный отказ «не найдена» (запись уничтожена);
 *  - рецепт ищется по выходу (output.defId) в общем реестре контента M09
 *    (П4 п.г «чтение общих реестров данных» — прямой импорт модуля craft
 *    запрещён и не нужен); нет рецепта — отказ с причиной;
 *  - возврат: ceil(inputs.qty × salvage.share) ПО КАЖДОЙ строке — округление
 *    в пользу игрока (25% от 3 брёвен = 1); род строки (предмет/валюта) —
 *    по каталогу (прецедент resolveRecipeIO M09);
 *  - [DECISION] качество/моды/заточка разобранной записи НЕ влияют на возврат
 *    и ТЕРЯЮТСЯ: разбор — утилизация базовых материалов рецепта (анти-абуз
 *    «сальваж-реролла» ривен-предметов); экипированная запись не разбирается
 *    (D30 — «сначала снимите»);
 *  - гранты — ТОЛЬКО транзакцией (eventId 'inventory.salvage', канон выдач),
 *    изъятие записи —setState модульного среза (прецедент craft.cancel:
 *    партия удаляется из состояния, возвраты идут грантами);
 *  - событие `item.salvaged { iid, defId, recipeId, returned }` — ровно одно
 *    на операцию (аддитивно в манифесте M02; ратификация канона 02-BUSES §4 —
 *    спека-стороной при приёмке).
 */
import type { EventBus } from '@/kernel/bus/event-bus/event-bus';
import type { TransactionService } from '@/kernel/services/transaction/transaction-service';
import type { CurrencyId, ID } from '@/shared/types/ids';
import { err, ok, type Result } from '@/shared/types/result';
import type { ItemDef } from '@/content/items/items';
import type { RecipeDef } from '@/content/craft/recipes';
import { equippedIidSet } from './equipment';
import type { InventoryState } from './state';

export interface SalvageReturnLine {
  defId: ID;
  qty: number;
}

export interface SalvageReceipt {
  iid: ID;
  defId: ID;
  recipeId: ID;
  returned: SalvageReturnLine[];
}

export interface SalvageDeps {
  /** общий реестр контента: рецепты M09 (П4 п.г — чтение, не импорт модуля) */
  recipes(): RecipeDef[];
  /** доля возврата из content/balance/craft.ts (salvage.share, тюнюется) */
  salvageShare(): number;
  tryItem(defId: ID): ItemDef | undefined;
  transaction: TransactionService;
  bus: EventBus;
  getState(): InventoryState;
  setState(s: InventoryState): void;
  markDirty(): void;
}

export class SalvageService {
  private readonly deps: SalvageDeps;

  constructor(deps: SalvageDeps) {
    this.deps = deps;
  }

  salvage(iidRaw: unknown): Result<SalvageReceipt> {
    const iid = String(iidRaw ?? '');
    if (!iid) return err('укажите запись: inv salvage <iid> (inv list)');

    // --- цель: конкретная запись (iid); экипированные защищены (D30)
    const state = this.deps.getState();
    const rec = state.items.find((it) => it.iid === iid);
    if (!rec) return err(`запись "${iid}" не найдена в инвентаре (inv list)`);
    if (equippedIidSet(state).has(iid)) {
      return err(`запись "${iid}" экипирована — сначала снимите (inv unequip)`);
    }

    // --- рецепт по выходу (общий реестр M09; первый подходящий)
    const recipe = this.deps.recipes().find((r) => r.output.defId === rec.defId);
    if (!recipe) {
      return err(`для «${rec.defId}» нет рецепта крафта — разобрать нельзя (разбор возвращает материалы рецепта)`);
    }

    // --- 25% материалов: ceil по каждой строке, в пользу игрока (тюнюется)
    const share = this.deps.salvageShare();
    const returned: SalvageReturnLine[] = recipe.inputs.map((line) => ({
      defId: line.defId,
      qty: Math.max(1, Math.ceil(line.qty * share)),
    }));

    // --- гранты транзакцией (канон выдач; отказ — ничего не менялось)
    const grants = returned.map((line) =>
      this.deps.tryItem(line.defId)
        ? { t: 'item' as const, defId: line.defId, qty: line.qty }
        : { t: 'currency' as const, id: line.defId as CurrencyId, qty: line.qty },
    );
    const r = this.deps.transaction.transact({
      grants,
      eventId: 'inventory.salvage',
      reason: `разбор ${rec.defId} (${Math.round(share * 100)}% материалов «${recipe.id}»)`,
    });
    if (!r.ok) return err(r.error);

    // --- изъятие записи (прецедент craft.cancel: состояние — своё, гранты —
    //     уже проведены транзакцией; запись уничтожается целиком)
    const s2 = this.deps.getState();
    this.deps.setState({ ...s2, items: s2.items.filter((it) => it.iid !== iid) });
    this.deps.markDirty();

    // --- событие ровно одно
    this.deps.bus.publish('item.salvaged', { iid, defId: rec.defId, recipeId: recipe.id, returned });
    return ok({ iid, defId: rec.defId, recipeId: recipe.id, returned });
  }
}
