/**
 * PenCollect (M06.1 + M06.2): сбор продукции со склада загона в инвентарь.
 *
 * `pen.collect [species|all] [pen]` (энергия 2 — ОДНО списание за действие
 * сбора, не за вид): ленивая переоценка продукции → вместимость (канон D23 —
 * проба ДО выдачи) → качество продукта (ролл из таблицы тиров с фактором
 * factorOfShare(среднее счастье производителей ЭТОГО загона/100) + шанс +1
 * тира от качества животных) → выдача inventory.add (acquire-канон M02,
 * источник-тег 'pen.grown') → событие `pen.produceCollected
 * { defId, qty, quality }` → склад загона очищается.
 *
 * [M06.2 · F3] адресация параметром загона: pen 1|2 (по умолчанию 1) —
 * склад у каждого загона свой ([DECISION-форма] «копия»), продукция в
 * инвентаре объединяется.
 */
import type { EventBus } from '@/kernel/bus/event-bus/event-bus';
import type { RngBus } from '@/kernel/bus/rng-bus/rng-bus';
import type { TimeService } from '@/kernel/time/time-service';
import type { SaveDirector } from '@/kernel/save/save-director';
import type { StatId, ID, QualityTier } from '@/shared/types/ids';
import type { Result } from '@/shared/types/result';
import { err, ok } from '@/shared/types/result';
import { QUALITY_TIERS } from '@/shared/types/ids';
import type { AnimalDef } from '@/content/pen/animals';
import type { PenTable } from '@/content/balance/pen';
import type { PenState } from './state';
import { factorOfShare, rollProduceQuality } from './logic/quality';

export interface CollectLine {
  defId: ID;
  qty: number;
  quality: { tier: QualityTier; value: number };
}

export interface PenCollectDeps {
  bus: EventBus;
  rngBus: RngBus;
  time: TimeService;
  save: SaveDirector;
  table: PenTable;
  animals: AnimalDef[];
  /** животные загона (адресация pen 1|2) */
  list(pen: 1 | 2): PenState['animals'];
  getState(): PenState;
  setState(s: PenState): void;
  withEnergy(stat: StatId, action: () => Result<unknown>, reason?: string): Result<unknown>;
  deliverProduct(defId: ID, tier: QualityTier, value: number, qty: number, source: string): Result<unknown>;
  probeCapacity(defId: ID, qty: number): Result<{ fits: boolean; free: number; newEntries: number }>;
  /** ленивая переоценка продукции до сбора (производство — модуль) */
  sweep(): void;
}

export class PenCollect {
  private readonly d: PenCollectDeps;
  private readonly bySpecies: Map<string, AnimalDef>;

  constructor(deps: PenCollectDeps) {
    this.d = deps;
    this.bySpecies = new Map(deps.animals.map((a) => [a.id, a] as const));
  }

  /** сбор: species — один вид (его продукт) или 'all' (весь склад загона) */
  run(species: string = 'all', pen: 1 | 2 = 1): Result<{ lines: CollectLine[] }> {
    this.d.sweep();
    const s = this.d.getState();
    const stockRec = pen === 1 ? s.stock : (s.stock2 ?? {});
    const animals = this.d.list(pen);
    let defIds: string[];
    if (species === 'all') {
      defIds = Object.keys(stockRec).filter((k) => (stockRec[k] ?? 0) > 0);
    } else {
      const def = this.bySpecies.get(species);
      if (!def) return err(`животное «${species}» не найдено (pen.animals — каталог)`);
      defIds = (stockRec[def.produce.defId] ?? 0) > 0 ? [def.produce.defId] : [];
    }
    if (defIds.length === 0) {
      return err(species === 'all' ? `склад загона ${pen} пуст (pen.state — витрина)` : `на складе загона ${pen} нет продукции «${species}»`);
    }
    const act = (): Result<{ lines: CollectLine[] }> => {
      const state = this.d.getState();
      const rec = pen === 1 ? state.stock : (state.stock2 ?? {});
      // вместимость ДО выдачи (канон M04.1/D23): отказ = склад цел, энергия не тронута
      for (const defId of defIds) {
        const qty = rec[defId] ?? 0;
        if (qty <= 0) continue;
        const probe = this.d.probeCapacity(defId, qty);
        if (!probe.ok) return err(probe.error);
        if (!probe.value.fits) {
          return err(`в инвентаре нет места для «${defId}» — освободите слоты (inv list)`);
        }
      }
      const lines: CollectLine[] = [];
      const stock: Record<string, number> = { ...rec };
      for (const defId of defIds) {
        const qty = stock[defId] ?? 0;
        if (qty <= 0) continue;
        // [F7] фактор счастья: среднее счастье ЖИВЫХ производителей продукта
        // ЭТОГО загона (молоко: коза + корова); нет производителей — стартовое 100 (П5)
        const producers = animals.filter(
          (a) => this.bySpecies.get(a.speciesId)?.produce.defId === defId,
        );
        const avgHappiness =
          producers.length > 0
            ? producers.reduce((sum, a) => sum + a.happiness, 0) / producers.length
            : this.d.table.newborn.happiness;
        const avgTier =
          producers.length > 0
            ? producers.reduce((sum, a) => sum + QUALITY_TIERS.indexOf(a.quality), 0) / producers.length
            : 0;
        const factor = factorOfShare(this.d.table, avgHappiness / 100);
        const quality = rollProduceQuality(
          this.d.rngBus,
          this.d.table,
          defId,
          factor,
          avgTier * this.d.table.produce.qualityTierUpChancePerTier,
        );
        const deliver = this.d.deliverProduct(defId, quality.tier, quality.value, qty, 'pen.grown');
        if (!deliver.ok) return err(deliver.error);
        delete stock[defId];
        lines.push({ defId, qty, quality });
        this.d.bus.publish('pen.produceCollected', { defId, qty, quality });
      }
      if (pen === 1) this.d.setState({ ...state, stock });
      else this.d.setState({ ...state, stock2: stock });
      this.d.save.markDirty();
      if (lines.length === 0) return err(`склад загона ${pen} пуст (pen.state — витрина)`);
      return ok({ lines });
    };
    return this.d.withEnergy('action.pen.collect.energyCost', act, `сбор продукции загона ${pen}`) as Result<{
      lines: CollectLine[];
    }>;
  }
}
