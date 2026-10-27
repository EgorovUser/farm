/**
 * LakeDev (M08.1 + M08.2): dev-форсы АКТИВНОГО озера для живых проб
 * (карточка §6 — lake.pair / lake.force sick|roe; прецеденты pen.produce/
 * pen.sick). [M08.2 · F14] группа — activeLakeOf(state); записи — withGroup.
 *
 * форс-пара — требует рыбу одного вида в двух слотах, условия/сытость/
 * здоровье НЕ проверяются (это форс); тиры фиксируются как обычно.
 * форс-икра — немедленный мутационный ролл (стрим
 * lake:breed:<fishId>:mutation — окно в журнале) + событие lake.bred.
 * [M11 · OBS-2 AUDIT-M08] окна форс-икры — те же, что живой sweep:
 * бонус Инкубатора АКТИВНОГО озера учитывается (windowsWithBonus).
 * форс-болезни — тот же переход, что ролл: sick = true + lake.fishSick.
 */
import type { EventBus } from '@/kernel/bus/event-bus/event-bus';
import type { RngBus } from '@/kernel/bus/rng-bus/rng-bus';
import type { TimeService } from '@/kernel/time/time-service';
import type { SaveDirector } from '@/kernel/save/save-director';
import type { ID, QualityTier } from '@/shared/types/ids';
import type { Result } from '@/shared/types/result';
import { err, ok } from '@/shared/types/result';
import type { LakeTable } from '@/content/balance/lake';
import type { FishDef } from '@/content/fishing/fish';
import type { LakeState, LakeSlot } from './state';
import { activeLakeOf, canonicalSlot, groupOf, withGroup } from './state';
import { breedPeriodHours, childTierOf, mutationBonusOf, tierMaxOf, windowsWithBonus } from './logic/breeding';

export interface LakeDevDeps {
  bus: EventBus;
  rngBus: RngBus;
  time: TimeService;
  save: SaveDirector;
  table: LakeTable;
  getState(): LakeState;
  setState(s: LakeState): void;
  fishOf(fishId: ID): FishDef | undefined;
  /** [M11 · OBS-2 AUDIT-M08] бонус Инкубатора озера №N — резолв шины
   *  lake.mutation.plus1Bonus с тегом lake:N (та же, что живой sweep) */
  incubatorBonusOf(idx: number): number;
  /** ленивая переоценка (икра/пары) до действий */
  sweep(): void;
}

export class LakeDev {
  private readonly d: LakeDevDeps;

  constructor(deps: LakeDevDeps) {
    this.d = deps;
  }

  /** dev: форс-пара двух слотов (тот же вид; условия/сытость/здоровье НЕ
   *  проверяются — это форс для живых проб; тиры фиксируются как обычно) */
  pair(slotA: number, slotB: number): Result<{ fishId: ID; dueAt: number; maxParentTier: QualityTier }> {
    this.d.sweep();
    const state = this.d.getState();
    const lidx = activeLakeOf(state);
    const group = groupOf(state, lidx);
    const a = group.slots[slotA];
    const b = group.slots[slotB];
    if (!a?.fishId || !b?.fishId) return err(`нужны ДВА занятых слота (lake.state — витрина)`);
    if (a.fishId !== b.fishId) return err(`форс-пара одного вида: ${a.fishId} ≠ ${b.fishId}`);
    if (slotA === slotB) return err('нужны ДВА разных слота');
    const def = this.d.fishOf(a.fishId);
    if (!def) return err(`вид ${a.fishId} не найден (рыбы пруда/реки — каталог)`);
    if ((group.pairs ?? {})[a.fishId] !== undefined) {
      return err('пара этого вида уже идёт (lake.state — витрина)');
    }
    const dueAt = this.d.time.now() + breedPeriodHours(def.rarity, this.d.table) * 3_600_000;
    const pairs = { ...(group.pairs ?? {}) };
    pairs[a.fishId] = {
      fishId: a.fishId,
      slotA,
      slotB,
      tierA: a.quality ?? 'D',
      tierB: b.quality ?? 'D',
      dueAt,
    };
    this.d.setState(withGroup(state, lidx, { ...group, ...(Object.keys(pairs).length > 0 ? { pairs } : {}) }));
    this.d.save.markDirty();
    return ok({ fishId: a.fishId, dueAt, maxParentTier: tierMaxOf(a.quality ?? 'D', b.quality ?? 'D') });
  }

  /** dev: форс болезни слота (тот же переход, что ролл; событие публикуется) */
  sick(slotIdx: number): Result<{ slotIdx: number; fishId: ID }> {
    this.d.sweep();
    const state = this.d.getState();
    const lidx = activeLakeOf(state);
    const group = groupOf(state, lidx);
    const slot: LakeSlot | undefined = group.slots[slotIdx];
    if (!slot?.fishId) return err(`слот ${slotIdx} пуст (lake.state — витрина)`);
    if (slot.sick) return err(`рыба в слоте ${slotIdx} уже больна (lake.state — витрина)`);
    const slots = [...group.slots];
    slots[slotIdx] = canonicalSlot({ ...slot, sick: true });
    this.d.setState(withGroup(state, lidx, { ...group, slots }));
    this.d.save.markDirty();
    this.d.bus.publish('lake.fishSick', { slotIdx, fishId: slot.fishId });
    return ok({ slotIdx, fishId: slot.fishId });
  }

  /** dev: форс икры немедленно из двух слотов (мутационный ролл сейчас —
   *  стрим lake:breed:<fishId>:mutation; событие lake.bred публикуется) */
  roe(slotA: number, slotB: number): Result<{ fishId: ID; childTier: QualityTier; bonus: 0 | 1 | 2; roll: number }> {
    this.d.sweep();
    const state = this.d.getState();
    const lidx = activeLakeOf(state);
    const group = groupOf(state, lidx);
    const a = group.slots[slotA];
    const b = group.slots[slotB];
    if (!a?.fishId || !b?.fishId) return err(`нужны ДВА занятых слота (lake.state — витрина)`);
    if (a.fishId !== b.fishId) return err(`форс-икра одного вида: ${a.fishId} ≠ ${b.fishId}`);
    const now = this.d.time.now();
    const roll = this.d.rngBus.rollRange(0, 1, 'uniform', `lake:breed:${a.fishId}:mutation`);
    // [M11 · OBS-2 AUDIT-M08] те же окна, что живой sweep: бонус Инкубатора
    // АКТИВНОГО озера (plus1From = 0.89 − X/100, кап данных; +2 = база 1%)
    const bonus = mutationBonusOf(roll, windowsWithBonus(this.d.table, this.d.incubatorBonusOf(lidx)));
    const childTier = childTierOf(tierMaxOf(a.quality ?? 'D', b.quality ?? 'D'), bonus);
    const roe = [...group.roe, { fishId: a.fishId, tier: childTier, readyAt: now + this.d.table.roe.matureHours * 3_600_000 }];
    this.d.setState(withGroup(state, lidx, {
      ...group,
      roe,
      stats: { ...group.stats, bred: group.stats.bred + 1 },
    }));
    this.d.save.markDirty();
    this.d.bus.publish('lake.bred', {
      fishId: a.fishId,
      childTier,
      parents: [
        { slot: slotA, tier: a.quality ?? 'D' },
        { slot: slotB, tier: b.quality ?? 'D' },
      ],
    });
    return ok({ fishId: a.fishId, childTier, bonus, roll });
  }
}
