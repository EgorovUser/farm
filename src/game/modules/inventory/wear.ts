/**
 * WearService M02.3 (D35, реализация D22-хранения): износ прочности
 * `inventory.wear(iid, n)` / debug `inv wear <iid> <n>`.
 *
 *  - −n прочности носителям (tool/weapon/armor/shield/rod — записи с
 *    durabilityMax), клэмп 0..max;
 *  - при 0 «сломан» — модов НЕТ (сломан-гейт провайдера M02.2/D22), запись
 *    ЖИВА и не исчезает; ремонт — M09 (маркер остаётся);
 *  - износ ЭКИПИРОВАННОЙ записи → invalidate.stat (моды падают сразу);
 *    износ записи в рюкзаке resolve не меняет — события нет;
 *  - событие износа НЕ вводится (каталог заморожен, D11);
 *  - авто-износ за игровые действия (−1 за использование) — НЕ здесь:
 *    потребители M05+; в Фазе 1 wear вызывают selftest и debug-команда.
 */
import type { EventBus } from '@/kernel/bus/event-bus/event-bus';
import type { ID } from '@/shared/types/ids';
import { err, ok, type Result } from '@/shared/types/result';
import type { ItemDef } from '@/content/items/items';
import { equippedIidSet } from './equipment';
import type { InventoryState } from './state';

export interface WearReceipt {
  iid: ID;
  before: number;
  current: number;
  max: number;
  broken: boolean;
  equipped: boolean;
}

export interface WearDeps {
  tryItem(defId: ID): ItemDef | undefined;
  bus: EventBus;
  getState(): InventoryState;
  setState(s: InventoryState): void;
  markDirty(): void;
}

export class WearService {
  private readonly deps: WearDeps;

  constructor(deps: WearDeps) {
    this.deps = deps;
  }

  wear(iid: ID, n: number): Result<WearReceipt> {
    // --- валидность: запись есть, величина целая ≥ 1, предмет — носитель
    const state = this.deps.getState();
    const entry = state.items.find((it) => it.iid === iid);
    if (!entry) return err(`предмет "${iid}" не найден в инвентаре`);
    const k = Math.floor(n);
    if (!(k >= 1)) return err('величина износа должна быть целым положительным числом');
    const def = this.deps.tryItem(entry.defId);
    const max = entry.durability?.max ?? def?.durabilityMax;
    if (!max) {
      return err(`у предмета ${entry.defId} нет прочности (носители — tool/weapon/armor/shield/rod)`);
    }

    // --- применение: клэмп 0..max (D35); запись жива, НЕ исчезает
    const before = Math.max(0, Math.min(max, entry.durability?.current ?? max));
    const current = Math.max(0, before - k);
    const items = state.items.map((it) =>
      it.iid === iid ? { ...it, durability: { current, max } } : it,
    );
    const equipped = equippedIidSet(state).has(iid);
    this.deps.setState({ ...state, items });

    // --- износ экипированной записи: моды падают сразу (D35) — кэчи сбросить;
    // записи в рюкзаке resolve не меняют — события нет
    if (equipped) {
      this.deps.bus.publish('invalidate.stat', {});
    }
    this.deps.markDirty();
    return ok({ iid, before, current, max, broken: current <= 0, equipped });
  }
}
