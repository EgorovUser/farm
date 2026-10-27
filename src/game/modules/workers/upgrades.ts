/**
 * WorkersUpgrades (M11.2, бриф F15; карточка M11 §5): покупка/витрина ×5 +
 * чтение эффектов для tick/day. Покупка = TransactionService eventId
 * 'worker.upgrade' БЕЗ энергии (прецедент lake.upgrade M08.2); владение
 * `workers.upgrades?: string[]` — АДДИТИВНО-ОПЦИОНАЛЬНО БЕЗ bump
 * (ленивый дефолт []; прецедент lake). Повтор — честный отказ.
 *
 * Эффекты (чтение данными, применение — module/day):
 *  - Домик: moodCapOf() = 100 + 5 (кап шкалы — [DECISION-интерпретация]);
 *  - Столовая: canteenBonus() = +3 при списанной еде (item-costs транзакцией
 *    — живой инвентарный канал ядра, прецедент lake.treat → animal_remedy);
 *  - Баня: sickFactorOf() = 0.5 (болезни реже вдвое);
 *  - Праздничный день: isHolidayActive() — тики молчат, +15 всем;
 *  - Инструментальный шкаф: toolRequirementClosed() — штраф F11 не применяется.
 */
import type { TransactionService } from '@/kernel/services/transaction/transaction-service';
import type { TimeService } from '@/kernel/time/time-service';
import type { SaveDirector } from '@/kernel/save/save-director';
import type { Result } from '@/shared/types/result';
import { err, ok } from '@/shared/types/result';
import type { WorkersTable } from '@/content/workers/table';
import type { WorkerUpgradeDef } from '@/content/workers/upgrades';
import type { WorkersState } from './state';
import { moodCapOf } from './state';
import { isHolidayDay } from './logic/tick';

export interface UpgradeReceipt {
  id: string;
  name: string;
  price: number;
}

export interface UpgradeRow {
  id: string;
  name: string;
  price: number;
  bought: boolean;
  description: string;
}

export interface WorkersUpgradesDeps {
  transaction: TransactionService;
  time: TimeService;
  save: SaveDirector;
  table: WorkersTable;
  upgradesDefs: WorkerUpgradeDef[];
  getState(): WorkersState;
  setState(s: WorkersState): void;
}

export class WorkersUpgrades {
  private readonly d: WorkersUpgradesDeps;

  constructor(deps: WorkersUpgradesDeps) {
    this.d = deps;
  }

  private owned(): string[] {
    return this.d.getState().upgrades ?? [];
  }

  has(id: string): boolean {
    return this.owned().includes(id);
  }

  /** F15: покупка (eventId worker.upgrade, БЕЗ энергии; повтор — отказ) */
  buy(id: string): Result<UpgradeReceipt> {
    const def = this.d.upgradesDefs.find((u) => u.id === id);
    if (!def) return err(`улучшение «${id}» не найдено (workers.upgrades — витрина)`);
    if (this.has(def.id)) return err(`«${def.name}» уже куплено`);
    const pay = this.d.transaction.transact({
      costs: [{ t: 'currency', id: 'gold', qty: def.cost.qty }],
      eventId: 'worker.upgrade',
      reason: `покупка улучшения «${def.name}»`,
    });
    if (!pay.ok) return err(pay.error);
    const state = this.d.getState();
    this.d.setState({ ...state, upgrades: [...(state.upgrades ?? []), def.id] });
    this.d.save.markDirty();
    return ok({ id: def.id, name: def.name, price: def.cost.qty });
  }

  /** F15: витрина ×5 (название/цена/куплено/эффект текстом) */
  view(): UpgradeRow[] {
    const owned = this.owned();
    return this.d.upgradesDefs.map((u) => ({
      id: u.id,
      name: u.name,
      price: u.cost.qty,
      bought: owned.includes(u.id),
      description: u.description,
    }));
  }

  // ------------------------------------------------ чтение эффектов (данные)

  /** Домик: кап настроения (базовый кап + бонус; без Домика — таблица).
   *  [FIX-M11 · FX1] делегирует ЕДИНОЙ точке moodCapOf(state) из state.ts —
   *  те же ДАННЫЕ (владение upgrades? + прирост из content/workers), что и
   *  sanitize load-пути / бонус / moodSet: расхождение капов невозможно */
  moodCapOf(): number {
    return moodCapOf(this.d.getState(), this.d.table, this.d.upgradesDefs);
  }

  /** Столовая: +N настроения за списанную еду (1 предмет foodWhitelist на
   *  работника; нехватка — не кормит, мягкий отказ → 0); возвращает бонус */
  canteenFeedOf(): number {
    const canteen = this.d.upgradesDefs.find((u) => u.effect.t === 'canteen' && this.has(u.id));
    if (!canteen || canteen.effect.t !== 'canteen') return 0;
    const perWorker = canteen.effect.foodPerWorker;
    const n = this.d.getState().hired.length;
    if (n === 0) return 0;
    // еда игрока из ИНВЕНТАРЯ: item-costs транзакцией (живой канал ядра —
    // прецедент lake.treat → animal_remedy M09); whitelist по порядку
    for (const defId of canteen.effect.foodWhitelist) {
      const tx = this.d.transaction.transact({
        costs: [{ t: 'item', defId, qty: perWorker * n }],
        eventId: 'worker.canteen',
        reason: `столовая: обед ×${n} работникам`,
      });
      if (tx.ok) return canteen.effect.moodPerDay;
    }
    return 0; // нехватка еды — не кормит (мягкий отказ, витрина-примечание)
  }

  /** Баня: эффективный sickFactor (без Бани — таблица; с Баней 0.5) */
  sickFactorOf(): number {
    const bath = this.d.upgradesDefs.find((u) => u.effect.t === 'bath' && this.has(u.id));
    return bath && bath.effect.t === 'bath' ? bath.effect.sickFactor : this.d.table.sickness.sickFactor;
  }

  /** Праздничный день: активен ли праздник сейчас (куплено + календарь) */
  isHolidayActive(now?: number): boolean {
    const owned = this.d.upgradesDefs.some((u) => u.effect.t === 'holiday' && this.has(u.id));
    return owned && isHolidayDay(now ?? this.d.time.now(), this.d.table);
  }

  /** Инструментальный шкаф: требования инструментов закрыты */
  toolRequirementClosed(): boolean {
    return this.d.upgradesDefs.some((u) => u.effect.t === 'toolCase' && this.has(u.id));
  }
}
