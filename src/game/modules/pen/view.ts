/**
 * Витрина pen.state (M06.1 + M06.2): сборка PenStateView для debug-панели
 * и команды pen.state. wc-распил module.ts (01 §6). Эффективное счастье —
 * min(100, raw + resolve(pen.happiness.bonus)) — «Пастбище-люкс» flat к
 * капу 100 ([DECISION-форма]; резолв с тегом 'pen' — мод в трассе).
 */
import type { StatBus } from '@/kernel/bus/stat-bus/stat-bus';
import type { TimeService } from '@/kernel/time/time-service';
import type { AnimalDef } from '@/content/pen/animals';
import type { PenUpgradeDef } from '@/content/pen/upgrades';
import type { PenTable } from '@/content/balance/pen';
import type { AnimalInstance, PenState } from './state';
import { localDayIndex } from './state';
import { needsMet, stockCapOf } from './logic/produce';
import { isSick } from './logic/sickness';

export interface AnimalView {
  idx: number;
  pen: 1 | 2;
  speciesId: string;
  name: string;
  quality: string;
  happiness: number;
  satiety: number;
  health: number;
  cleanliness: number;
  fedToday: boolean;
  pettedToday: boolean;
  hungryDays: number;
  dirtyDays: number;
  nextProduceAt: number | null;
  remainingMs: number | null;
  /** produceNeeds выполнены (сытая/здоровая) */
  producing: boolean;
  /** [M06.2] больна сейчас (sickAt в окне лечения) */
  sick: boolean;
  /** [M06.2] осталось до самолечения (мс; null — не больна) */
  healRemainingMs: number | null;
  /** [M06.2] осталось иммунитета (мс; null — нет окна) */
  immuneRemainingMs: number | null;
}

export interface PenStateView {
  now: number;
  slots: { used: number; base: number };
  animals: AnimalView[];
  stock: Array<{ defId: string; qty: number; cap: number }>;
  /** [F7] offlineReport: потеряно сверх склад-cap (накопительно) */
  overflow: Record<string, number>;
  /** [F3] репутация деревни — заглушка до M16 */
  reputationReady: boolean;
  /** [M06.2] второй загон (null — не построен) */
  pen2: {
    slots: { used: number; base: number };
    animals: AnimalView[];
    stock: Array<{ defId: string; qty: number; cap: number }>;
    overflow: Record<string, number>;
  } | null;
  /** [M06.2] буфер навоза (F4) */
  manure: { manure: number; cap: number };
  /** [M06.2] активное разведение (F5) */
  breeding: {
    pen: 1 | 2;
    speciesId: string;
    maxParentTier: string;
    remainingMs: number;
    waitingSlot: boolean;
  } | null;
  /** [M06.2] купленные улучшения: id → уровень */
  upgrades: Record<string, number>;
}

export interface PenViewDeps {
  statBus: StatBus;
  time: TimeService;
  table: PenTable;
  animals: AnimalDef[];
  upgradesDefs: PenUpgradeDef[];
  slotsOf(pen: 1 | 2): { used: number; base: number };
  pen2Ready(): boolean;
  getState(): PenState;
}

export function buildPenStateView(deps: PenViewDeps): PenStateView {
  const { statBus, time, table, animals } = deps;
  const state = deps.getState();
  const now = time.now();
  const today = localDayIndex(now);
  const byId = new Map(animals.map((a) => [a.id, a] as const));
  const capOf = (defId: string): number => stockCapOf(table, defId, animals);
  // «Пастбище-люкс»: flat-бонус к капу 100 (мод [tag=pen] penUpgradesProvider)
  const bonus = statBus.resolve({
    stat: 'pen.happiness.bonus',
    ctx: { ...time.ctx('player'), tags: ['pen'] },
  });
  const viewAnimal = (a: AnimalInstance, idx: number, pen: 1 | 2): AnimalView => {
    const def = byId.get(a.speciesId);
    const sick = isSick(a, now, table);
    return {
      idx,
      pen,
      speciesId: a.speciesId,
      name: def?.name ?? a.speciesId,
      quality: a.quality,
      happiness: Math.min(100, a.happiness + bonus),
      satiety: a.satiety,
      health: a.health,
      cleanliness: a.cleanliness ?? 100,
      fedToday: a.fedDay === today,
      pettedToday: a.pettedDay === today,
      hungryDays: a.hungryDays ?? 0,
      dirtyDays: a.dirtyDays ?? 0,
      nextProduceAt: a.nextProduceAt ?? null,
      remainingMs: a.nextProduceAt !== undefined ? Math.max(0, a.nextProduceAt - now) : null,
      producing: def !== undefined && needsMet(a, def),
      sick,
      healRemainingMs: sick && a.sickAt !== undefined ? Math.max(0, a.sickAt + table.sickness.healHours * 3_600_000 - now) : null,
      immuneRemainingMs: a.immuneUntil !== undefined ? Math.max(0, a.immuneUntil - now) : null,
    };
  };
  const b = state.breeding;
  return {
    now,
    slots: deps.slotsOf(1),
    animals: state.animals.map((a, idx) => viewAnimal(a, idx, 1)),
    stock: Object.entries(state.stock)
      .filter(([, qty]) => qty > 0)
      .map(([defId, qty]) => ({ defId, qty, cap: capOf(defId) })),
    overflow: { ...state.overflow },
    reputationReady: table.reputation.ready,
    pen2: deps.pen2Ready()
      ? {
          slots: deps.slotsOf(2),
          animals: (state.animals2 ?? []).map((a, idx) => viewAnimal(a, idx, 2)),
          stock: Object.entries(state.stock2 ?? {})
            .filter(([, qty]) => qty > 0)
            .map(([defId, qty]) => ({ defId, qty, cap: capOf(defId) })),
          overflow: { ...(state.overflow2 ?? {}) },
        }
      : null,
    manure: { manure: state.manure ?? 0, cap: table.manure.cap },
    breeding: b
      ? {
          pen: b.pen,
          speciesId: b.speciesId,
          maxParentTier: b.maxParentTier,
          remainingMs: Math.max(0, b.dueAt - now),
          waitingSlot: now >= b.dueAt,
        }
      : null,
    upgrades: { ...(state.upgrades ?? {}) },
  };
}
