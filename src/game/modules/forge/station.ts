/**
 * «Точильный станок» и «Точильный круг» (карточка M10 §2; §4.3 брифа M10.1) —
 * улучшения ДОМА модуля forge: покупаются за золото (TransactionService,
 * eventId forge.station), состояние — в срезе forge (НЕ craft: вкладка
 * «Заточка» у наковальни — UI-слот M09, логика — отдельная, карточка M10 §2).
 *
 * Станок — гейт попыток (§4.4). Круг — бонус-улучшение: inc к процентному
 * стату forge.success.bonus (база 100) через forgingProvider (R3).
 */
import type { TransactionService } from '@/kernel/services/transaction/transaction-service';
import type { EventBus } from '@/kernel/bus/event-bus/event-bus';
import type { ConditionCtx } from '@/shared/types/requirement';
import { checkCondition } from '@/shared/utils/condition-check';
import type { ID } from '@/shared/types/ids';
import type { Result } from '@/shared/types/result';
import { err, ok } from '@/shared/types/result';
import type { ForgeTable } from '@/content/balance/forging';
import type { ForgeState } from './state';

export interface StationBuyReceipt {
  id: ID;
  name: string;
  cost: number;
}

export interface WhetstoneView {
  id: 'whetstone';
  name: string;
  costGold: number;
  unlockLevel: number;
  bought: boolean;
}

export interface CircleView {
  id: 'whetstone_circle';
  name: string;
  costGold: number;
  unlockLevel: number;
  bonusInc: number;
  bought: boolean;
  /** станок ещё не куплен — круг недоступен */
  requiresWhetstone: boolean;
}

export interface WhetstoneDeps {
  table: ForgeTable;
  transaction: TransactionService;
  bus: EventBus;
  gateCtx(): ConditionCtx;
  getState(): ForgeState;
  setState(s: ForgeState): void;
  markDirty(): void;
}

export class WhetstoneService {
  private readonly deps: WhetstoneDeps;

  constructor(deps: WhetstoneDeps) {
    this.deps = deps;
  }

  view(): { whetstone: WhetstoneView; circle: CircleView } {
    const { whetstone, whetstoneCircle } = this.deps.table;
    const st = this.deps.getState().stations;
    return {
      whetstone: {
        id: 'whetstone',
        name: 'Точильный станок',
        costGold: whetstone.costGold,
        unlockLevel: whetstone.unlockPlayerLevel,
        bought: st.whetstone,
      },
      circle: {
        id: 'whetstone_circle',
        name: 'Точильный круг',
        costGold: whetstoneCircle.costGold,
        unlockLevel: whetstoneCircle.unlockPlayerLevel,
        bonusInc: whetstoneCircle.bonusInc,
        bought: st.upgrades.includes('whetstone_circle'),
        requiresWhetstone: !st.whetstone,
      },
    };
  }

  /** покупка станка/круга за золото (атомарно; гейты текстом — П6) */
  buy(id: ID): Result<StationBuyReceipt> {
    if (id === 'whetstone') return this.buyWhetstone();
    if (id === 'whetstone_circle') return this.buyCircle();
    return err(`неизвестное улучшение "${id}" (доступно: whetstone, whetstone_circle)`);
  }

  private buyWhetstone(): Result<StationBuyReceipt> {
    const { costGold, unlockPlayerLevel } = this.deps.table.whetstone;
    const st = this.deps.getState().stations;
    if (st.whetstone) return err('«Точильный станок» уже построен');
    const gate = { t: 'playerLevel', level: unlockPlayerLevel } as const;
    if (!checkCondition(gate, this.deps.gateCtx())) {
      return err(`whetstone: Откроется: уровень ${unlockPlayerLevel}`);
    }
    const pay = this.deps.transaction.transact({
      costs: [{ t: 'currency', id: 'gold', qty: costGold }],
      eventId: 'forge.station',
      reason: 'постройка «Точильного станка»',
    });
    if (!pay.ok) return err(pay.error);
    const s = this.deps.getState();
    this.deps.setState({ ...s, stations: { ...s.stations, whetstone: true } });
    this.deps.markDirty();
    // эффектов на статы нет, но invalidate дешёвый и симметричен покупке
    this.deps.bus.publish('invalidate.stat', {});
    return ok({ id: 'whetstone', name: 'Точильный станок', cost: costGold });
  }

  private buyCircle(): Result<StationBuyReceipt> {
    const { costGold, unlockPlayerLevel } = this.deps.table.whetstoneCircle;
    const st = this.deps.getState().stations;
    if (!st.whetstone) {
      return err('улучшение «Точильный круг» требует «Точильный станок» (сначала forge buy whetstone)');
    }
    if (st.upgrades.includes('whetstone_circle')) return err('«Точильный круг» уже куплен');
    const gate = { t: 'playerLevel', level: unlockPlayerLevel } as const;
    if (!checkCondition(gate, this.deps.gateCtx())) {
      return err(`whetstone_circle: Откроется: уровень ${unlockPlayerLevel}`);
    }
    const pay = this.deps.transaction.transact({
      costs: [{ t: 'currency', id: 'gold', qty: costGold }],
      eventId: 'forge.station',
      reason: 'улучшение «Точильный круг»',
    });
    if (!pay.ok) return err(pay.error);
    const s = this.deps.getState();
    this.deps.setState({
      ...s,
      stations: { ...s.stations, upgrades: [...s.stations.upgrades, 'whetstone_circle'] },
    });
    this.deps.markDirty();
    // бонус круга — стат: кэш шины сбросить
    this.deps.bus.publish('invalidate.stat', {});
    return ok({ id: 'whetstone_circle', name: 'Точильный круг', cost: costGold });
  }
}
