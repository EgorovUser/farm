/**
 * LakeHourly (M08.1 + M08.2): часовой и дневной обработчик озера — подписки
 * time.hourTick / time.dayTick по манифесту (прецедент pen; канон 02 §8 +
 * M06.2 §3: часовые границы ЦЕЛИКОМ → дневные → ленивый sweep — catchUp
 * публикует те же границы, кап 14).
 *
 * hourTick: ленивая переоценка ВСЕХ озёр (тот же sweep — завершение пар →
 * рождение икры → новые пары; payload.now — точка прохода).
 *
 * dayTick [M08.2 — по КАЖДОМУ озеру параллельно]:
 *   1) дрейф чистоты (−5/день база; Аэратор −2/день — эффект данных);
 *   2) АВТОКОРМУШКА (F12): кормит голодных (fedAt старше 24ч) из кошелька
 *      Корма — Корм ×N атомарно (eventId lake.feed, канон F4: нехватка на
 *      ВСЕХ → не кормит, состояние цело, событий нет); ролл-маркер
 *      lake:autofeed [DECISION-стрим — журнал факта кормления]; ПОРЯДОК:
 *      кормление ДО роллов болезней/разведения (сытые этим же тиком
 *      размножаются — канон M06.2 §3);
 *   3) sick-ролл (5%/2%; стрим lake:sick:<fishId>) + lake.fishSick;
 *   4) sweep (пары оценивают условия по новой воде).
 */
import type { EventBus } from '@/kernel/bus/event-bus/event-bus';
import type { RngBus } from '@/kernel/bus/rng-bus/rng-bus';
import type { TransactionService } from '@/kernel/services/transaction/transaction-service';
import type { TimeService } from '@/kernel/time/time-service';
import type { SaveDirector } from '@/kernel/save/save-director';
import type { LakeTable } from '@/content/balance/lake';
import type { LakeUpgradeDef } from '@/content/lake/upgrades';
import type { LakeGroup, LakeState } from './state';
import { groupOf, lakeIndices, withGroup } from './state';
import { canonicalSlot } from './state';
import { driftCleanliness, effectiveDriftPerDay, isHungry } from './logic/water';
import { sickPass } from './logic/sickness';

interface TimeTickPayload {
  now?: number;
  catchUp?: boolean;
}

export interface LakeHourlyDeps {
  bus: EventBus;
  rngBus: RngBus;
  transaction: TransactionService;
  time: TimeService;
  save: SaveDirector;
  table: LakeTable;
  upgradesDefs: LakeUpgradeDef[];
  fishOf(fishId: string): { lakeRequirements?: { tempMin: number; tempMax: number; cleanlinessMin: number } } | undefined;
  getState(): LakeState;
  setState(s: LakeState): void;
  /** ленивая переоценка всех озёр (икра/пары; публикует lake.bred) */
  sweep(now?: number): void;
}

/** дрейф группы за день — единая точка logic/water.ts [M11 · OBS-1
 *  AUDIT-M08]: Аэратор — эффект данных (−2/день вместо −5); общий для
 *  dayTick и витрины view.ts */
function driftOf(g: LakeGroup, table: LakeTable, upgradesDefs: LakeUpgradeDef[]): number {
  return effectiveDriftPerDay(g, table, upgradesDefs);
}

export function makeLakeHourly(deps: LakeHourlyDeps): { off(): void } {
  const roll01 = (streamId: string): number => deps.rngBus.rollRange(0, 1, 'uniform', streamId);

  const onHourTick = (payload: TimeTickPayload): void => {
    // ленивая переоценка всех озёр (точка прохода — payload.now: catchUp
    // публикует границы ЦЕЛИКОМ)
    deps.sweep(typeof payload?.now === 'number' ? payload.now : undefined);
  };

  const onDayTick = (payload: TimeTickPayload): void => {
    const now = typeof payload?.now === 'number' ? payload.now : deps.time.now();
    const state0 = deps.getState();
    // 1–2) по КАЖДОМУ озеру: дрейф → автокормушка (ДО болезней/разведения)
    let whole = state0;
    let changed = false;
    for (const idx of lakeIndices(state0)) {
      let g = groupOf(whole, idx);
      const water = driftCleanliness(g.water, deps.table, driftOf(g, deps.table, deps.upgradesDefs));
      if (water.cleanliness !== g.water.cleanliness || water.temperature !== g.water.temperature) {
        g = { ...g, water };
        changed = true;
      }
      const feeder = deps.upgradesDefs.find((u) => u.effect.t === 'autofeeder');
      if (feeder && (g.upgrades ?? []).includes(feeder.id)) {
        const hungryIdx = g.slots
          .map((s, i) => ({ s, i }))
          .filter(({ s }) => s.fishId !== undefined && isHungry(s.fedAt, now, deps.table))
          .map(({ i }) => i);
        if (hungryIdx.length > 0) {
          const n = hungryIdx.length;
          const tx = deps.transaction.transact({
            costs: [{ t: 'currency', id: deps.table.buy.feedCurrency, qty: n }],
            eventId: 'lake.feed',
            reason: `автокормушка озера №${idx + 1}: ${n} голодных`,
          });
          if (tx.ok) {
            // [DECISION-стрим] ролл-маркер журнала: факт автокормления (П6)
            roll01('lake:autofeed');
            const slots = [...g.slots];
            for (const si of hungryIdx) {
              slots[si] = canonicalSlot({ ...slots[si]!, fedAt: now });
            }
            g = { ...g, slots };
            changed = true;
          }
          // нехватка Корма → не кормит (событий нет, состояние цело — F4)
        }
      }
      if (g !== groupOf(whole, idx)) {
        whole = withGroup(whole, idx, g);
      }
    }
    if (changed) {
      deps.setState(whole);
      deps.save.markDirty();
    }
    // 3) sick-ролл по КАЖДОМУ озеру (вода НОВОГО дня; 5%/2%)
    const after = deps.getState();
    let sickWhole = after;
    let sickChanged = false;
    for (const idx of lakeIndices(after)) {
      const sick = sickPass(groupOf(sickWhole, idx), now, deps.table, deps.fishOf, roll01);
      if (sick.sickened.length > 0) {
        sickWhole = withGroup(sickWhole, idx, sick.state);
        sickChanged = true;
        for (const c of sick.sickened) {
          deps.bus.publish('lake.fishSick', { slotIdx: c.slotIdx, fishId: c.fishId });
        }
      }
    }
    if (sickChanged) {
      deps.setState(sickWhole);
      deps.save.markDirty();
    }
    // 4) ленивая переоценка (пары оценивают условия по новой воде)
    deps.sweep(now);
  };

  const offHour = deps.bus.subscribe('time.hourTick', onHourTick as (p: unknown) => void);
  const offDay = deps.bus.subscribe('time.dayTick', onDayTick as (p: unknown) => void);
  return { off: () => { offHour(); offDay(); } };
}
