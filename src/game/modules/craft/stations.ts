/**
 * Станции крафта §2 (карточка M09): покупка за золото как улучшение дома.
 * Витрина (уровни/цены/гейты/улучшения/очереди) + атомарная покупка
 * TransactionService (eventId craft.station; нет золота — отказ, состояние
 * не тронут) + invalidate.stat (длина очереди/эффекты — статы шины).
 *
 * Гейты: unlock станции/улучшения — единый оценщик checkCondition (03-DATA §2);
 * требования видны текстом (П6). Улучшения независимы (покупка в любом
 * порядке, [DECISION] M09: карточка порядок не задаёт).
 */
import type { EventBus } from '@/kernel/bus/event-bus/event-bus';
import type { StatBus } from '@/kernel/bus/stat-bus/stat-bus';
import type { ResolveCtx } from '@/kernel/bus/stat-bus/modifier';
import type { TransactionService } from '@/kernel/services/transaction/transaction-service';
import type { Condition, ConditionCtx } from '@/shared/types/requirement';
import { checkCondition } from '@/shared/utils/condition-check';
import type { ID, StatId } from '@/shared/types/ids';
import { err, ok, type Result } from '@/shared/types/result';
import type { StationDef, StationId, StationUpgradeDef } from '@/content/craft/stations';
import type { CraftState } from './state';

export interface StationViewRow {
  id: StationId;
  name: string;
  built: boolean;
  costGold: number;
  unlockText: string | null;
  /** длина очереди (стат craft.queue.length.<id>, улучшения — flat) */
  queueLength: number;
  upgrades: Array<{
    id: ID;
    name: string;
    costGold: number;
    bought: boolean;
    queueBonus: number;
    unlockText: string | null;
    effectText: string;
  }>;
}

export interface StationBuyReceipt {
  kind: 'station' | 'upgrade';
  id: ID;
  name: string;
  cost: number;
}

export interface StationsDeps {
  stations: readonly StationDef[];
  statBus: StatBus;
  transaction: TransactionService;
  bus: EventBus;
  getState(): CraftState;
  setState(s: CraftState): void;
  markDirty(): void;
  /** гейт-контекст: уровень/навыки игрока (player.ctxExtras через П4) */
  gateCtx(): ConditionCtx;
  /** стандартный ResolveCtx для резолвов статов очереди */
  resolveCtx(): ResolveCtx;
}

/** Текст гейта для витрины (П6: «заблокированное видно с условием открытия») */
export function stationGateText(cond: Condition): string {
  switch (cond.t) {
    case 'playerLevel':
      return `Откроется: уровень ${cond.level}`;
    case 'skill':
      return `Откроется: навык ${cond.skill} ${cond.level}`;
    case 'achievement':
      return `Откроется: ачивка ${cond.id}`;
    case 'flag':
      return `Откроется: флаг ${cond.flag}`;
    default:
      return `Откроется: условие ${cond.t}`;
  }
}

export class StationService {
  private readonly deps: StationsDeps;

  constructor(deps: StationsDeps) {
    this.deps = deps;
  }

  isBuilt(id: StationId): boolean {
    return this.deps.getState().stations[id] !== undefined;
  }

  stationById(id: string): StationDef | undefined {
    return this.deps.stations.find((s) => s.id === id);
  }

  upgradeById(id: ID): { station: StationDef; upgrade: StationUpgradeDef } | undefined {
    for (const station of this.deps.stations) {
      const upgrade = station.upgrades.find((u) => u.id === id);
      if (upgrade) return { station, upgrade };
    }
    return undefined;
  }

  /** длина очереди станции — только через шину (П3: стат + улучшения flat) */
  queueLengthOf(id: StationId): number {
    return this.deps.statBus.resolve({
      stat: `craft.queue.length.${id}` as StatId,
      ctx: this.deps.resolveCtx(),
    });
  }

  upgradeBought(id: ID): boolean {
    for (const st of Object.values(this.deps.getState().stations)) {
      if (st?.upgrades.includes(id)) return true;
    }
    return false;
  }

  view(): StationViewRow[] {
    const ctx = this.deps.gateCtx();
    return this.deps.stations.map((s) => ({
      id: s.id,
      name: s.name,
      built: this.isBuilt(s.id),
      costGold: s.costGold,
      unlockText: s.unlock && !checkCondition(s.unlock, ctx) ? stationGateText(s.unlock) : null,
      queueLength: this.queueLengthOf(s.id),
      upgrades: s.upgrades.map((u) => ({
        id: u.id,
        name: u.name,
        costGold: u.costGold,
        bought: this.upgradeBought(u.id),
        queueBonus: u.queueBonus,
        unlockText: u.unlock && !checkCondition(u.unlock, ctx) ? stationGateText(u.unlock) : null,
        effectText: u.effects.map((e) => e.label ?? `${e.op} ${e.value} на ${e.stat}`).join('; '),
      })),
    }));
  }

  /** покупка станции или улучшения за золото (единая точка, атомарно) */
  buy(id: ID): Result<StationBuyReceipt> {
    const up = this.upgradeById(id);
    if (up) return this.buyUpgrade(up.station, up.upgrade);

    const station = this.stationById(id);
    if (station) return this.buyStation(station);

    const known = [
      ...this.deps.stations.filter((s) => s.costGold > 0).map((s) => s.id),
      ...this.deps.stations.flatMap((s) => s.upgrades.map((u) => u.id)),
    ];
    return err(`неизвестная станция/улучшение "${id}" (доступно: ${known.join(', ')})`);
  }

  private buyStation(station: StationDef): Result<StationBuyReceipt> {
    if (station.costGold === 0) return err(`"${station.id}" — стартовая станция, уже построена`);
    if (this.isBuilt(station.id)) return err(`станция «${station.name}» уже построена`);
    const gate = station.unlock;
    if (gate && !checkCondition(gate, this.deps.gateCtx())) {
      return err(`${station.id}: ${stationGateText(gate)}`);
    }
    const pay = this.deps.transaction.transact({
      costs: [{ t: 'currency', id: 'gold', qty: station.costGold }],
      eventId: 'craft.station',
      reason: `постройка станции ${station.name}`,
    });
    if (!pay.ok) return err(pay.error);
    const s = this.deps.getState();
    this.deps.setState({
      ...s,
      stations: { ...s.stations, [station.id]: { upgrades: [] } },
    });
    this.deps.markDirty();
    // эффекты станции (cap наковальни) и длина очереди — статы: кэш сбросить
    this.deps.bus.publish('invalidate.stat', {});
    return ok({ kind: 'station', id: station.id, name: station.name, cost: station.costGold });
  }

  private buyUpgrade(station: StationDef, upgrade: StationUpgradeDef): Result<StationBuyReceipt> {
    if (!this.isBuilt(station.id)) {
      return err(`улучшение «${upgrade.name}» требует станцию «${station.name}» (сначала craft.buy ${station.id})`);
    }
    if (this.upgradeBought(upgrade.id)) return err(`улучшение «${upgrade.name}» уже куплено`);
    const gate = upgrade.unlock;
    if (gate && !checkCondition(gate, this.deps.gateCtx())) {
      return err(`${upgrade.id}: ${stationGateText(gate)}`);
    }
    const pay = this.deps.transaction.transact({
      costs: [{ t: 'currency', id: 'gold', qty: upgrade.costGold }],
      eventId: 'craft.station',
      reason: `улучшение ${upgrade.name} (${station.name})`,
    });
    if (!pay.ok) return err(pay.error);
    const s = this.deps.getState();
    const st = s.stations[station.id] ?? { upgrades: [] };
    this.deps.setState({
      ...s,
      stations: { ...s.stations, [station.id]: { upgrades: [...st.upgrades, upgrade.id] } },
    });
    this.deps.markDirty();
    this.deps.bus.publish('invalidate.stat', {});
    return ok({ kind: 'upgrade', id: upgrade.id, name: upgrade.name, cost: upgrade.costGold });
  }
}
