/**
 * Ремонт на наковальне (карточка M09 §2 «ремонт»; карточка M02 §4: «ремонт
 * на наковальне (M09) за 10% базовой цены»; расходник — ремонтный набор,
 * комментарий каталога goods). Стоимость: ceil(basePrice × goldPercent%)
 * золота + kits наборов — атомарной транзакцией (eventId craft.repair),
 * затем прочность восстанавливается в максимум (inventory.dur через app-слой).
 *
 * Гейт: нужна построенная наковальня; цель — запись рюкзака (D30-консистентно:
 * экипированное чинится после снятия, [DECISION] M09). Целое → отказ
 * «не требует ремонта». База цены — через PriceBus НЕ читается: ремонтный
 * сбор — процент от БАЗОВОЙ цены (basePrice шаблона, данные), а не от итоговой
 * цены покупки со скидками (скидка дня не должна делать ремонт дешевле —
 * [DECISION] M09; итоговые цены — только для сделок покупки/продажи).
 */
import type { TransactionService } from '@/kernel/services/transaction/transaction-service';
import type { CraftTable } from '@/content/balance/craft';
import type { ID } from '@/shared/types/ids';
import type { Result } from '@/shared/types/result';
import { err, ok } from '@/shared/types/result';
import type { StationService } from './stations';

export interface RepairReceipt {
  iid: ID;
  defId: ID;
  goldCost: number;
  kits: number;
  durability: { current: number; max: number };
}

export interface RepairDeps {
  table: CraftTable;
  stations: StationService;
  transaction: TransactionService;
  /** записи рюкзака (inventory.list — экипированные исключены, D30) */
  listItems(): Array<{ iid: ID; defId: ID; durability?: { current: number; max: number } }>;
  tryItem(defId: ID): { id: ID; basePrice: number; durabilityMax?: number } | undefined;
  /** inventory.dur — установка прочности (после успешной транзакции) */
  setDurability(iid: ID, current: number): Result<{ iid: ID; current: number; max: number }>;
}

export class RepairService {
  private readonly deps: RepairDeps;

  constructor(deps: RepairDeps) {
    this.deps = deps;
  }

  repair(iid: ID): Result<RepairReceipt> {
    if (!this.deps.stations.isBuilt('anvil')) {
      return err('ремонт требует наковальню (craft.buy anvil)');
    }
    const entry = this.deps.listItems().find((e) => e.iid === iid);
    if (!entry) return err(`предмет "${iid}" не найден в рюкзаке (экипированное — сначала снимите)`);
    const def = this.deps.tryItem(entry.defId);
    if (!def) return err(`предмет-шаблон "${entry.defId}" не найден в content/items`);
    if (!def.durabilityMax || !entry.durability) {
      return err('этот предмет не имеет прочности (ремонт не нужен)');
    }
    if (entry.durability.current >= entry.durability.max) {
      return err('предмет в полном порядке — ремонт не требуется');
    }
    const { goldPercent, kits } = this.deps.table.repair;
    const goldCost = Math.ceil((def.basePrice * goldPercent) / 100);
    const costs: Array<{ t: 'currency'; id: 'gold'; qty: number } | { t: 'item'; defId: ID; qty: number }> = [
      { t: 'currency', id: 'gold', qty: goldCost },
    ];
    if (kits > 0) costs.push({ t: 'item', defId: 'repair_kit', qty: kits });
    const pay = this.deps.transaction.transact({
      costs,
      eventId: 'craft.repair',
      reason: `ремонт ${def.id} (${iid})`,
    });
    if (!pay.ok) return err(pay.error);
    const restored = this.deps.setDurability(iid, entry.durability.max);
    if (!restored.ok) return err(restored.error);
    return ok({
      iid,
      defId: entry.defId,
      goldCost,
      kits,
      durability: { current: restored.value.current, max: restored.value.max },
    });
  }
}
