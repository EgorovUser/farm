/**
 * FarmHarvest (M05.3, wc-гигиена 01 §6 — extracted из actions.ts без
 * изменения поведения): сбор READY-тайла — фактор мини-игры → роллы
 * качества/количества → вместимость (D23) → выдача (inventory.add, источник
 * 'farm.grown') → переход → события (farm.cropHarvested c payload F4).
 *
 * Таб-параметр (G1): действие адресуется (tileIdx, tabId='field') — вкладки
 * улучшений имеют свои сетки тайлов с независимой индексацией.
 *
 * [M05.3 · G4] полный факторный расчёт качества: фактор auto-score (жив с
 * M05.1) + удобрение (жив) + перки навыка farming (шанс +1 тира — резолв
 * 'farm.harvest.tierUpChance' по контексту игрока) + «Парник-люкс»
 * (безусловный +1 тир вкладки — tierBonusOf по купленным улучшениям).
 */
import type { EventBus } from '@/kernel/bus/event-bus/event-bus';
import type { RngBus } from '@/kernel/bus/rng-bus/rng-bus';
import type { TimeService } from '@/kernel/time/time-service';
import type { SaveDirector } from '@/kernel/save/save-director';
import type { StatId, ID, QualityTier } from '@/shared/types/ids';
import type { Result } from '@/shared/types/result';
import { err, ok } from '@/shared/types/result';
import type { CropDef } from '@/content/farm/crops';
import type { FarmTable } from '@/content/balance/farm';
import type { FarmState } from './state';
import { findTile } from './logic/fsm';
import { harvestTile } from './logic/replant';
import { maxOf, rollHarvestQuality, rollYieldQty } from './logic/quality';
import type { HarvestLine } from './actions';

export interface FarmHarvestDeps {
  bus: EventBus;
  rngBus: RngBus;
  time: TimeService;
  save: SaveDirector;
  table: FarmTable;
  crops: CropDef[];
  getState(): FarmState;
  setState(s: FarmState): void;
  withEnergy(stat: StatId, action: () => Result<unknown>, reason?: string): Result<unknown>;
  deliverCrop(defId: ID, tier: QualityTier, value: number, qty: number, source: string): Result<unknown>;
  probeCapacity(defId: ID, qty: number): Result<{ fits: boolean; free: number; newEntries: number }>;
  /** фактор мини-игры сбора (auto-score → [0.8..1.3]) — резолв действий */
  factorOf(): number;
  /** [M05.3 · G4] шанс +1 тира от перков навыка farming (резолв стата) */
  skillTierUpChance(): number;
  /** [M05.3 · G4] «Парник-люкс»: +1 тир сборов вкладки (купленные tierBonus) */
  tierBonusOf(tabKind: string): number;
  /** [M05.3 · G5] регроу-время replantable-культуры (growHours × текущая
   *  скорость шины — как посадке; потребление — виноград в окне плодоношения) */
  regrowMsOf(crop: CropDef, tabKind: string): number;
  /** ленивая переоценка до действия (готовность/сухость) */
  sweep(): void;
}

export class FarmHarvest {
  private readonly d: FarmHarvestDeps;
  private readonly cropById: Map<string, CropDef>;

  constructor(deps: FarmHarvestDeps) {
    this.d = deps;
    this.cropById = new Map(deps.crops.map((c) => [c.id, c] as const));
  }

  run(tileIdx: number, tabId = 'field'): Result<{ tab: string; tileIdx: number; cropId: ID; yields: HarvestLine[]; aftermath: 'empty' | 'again' | 'regrow'; harvestsLeft?: number; fruitingUntil?: number }> {
    this.d.sweep();
    const ref = findTile(this.d.getState(), tabId, tileIdx);
    if (!ref.ok) return ref;
    const tile = ref.value.tile;
    const crop = tile.cropId ? this.cropById.get(tile.cropId) : undefined;
    if (tile.state === 'ready' && !crop) return err(`культура тайла ${tileIdx} неизвестна контенту (П5)`);
    const factor = this.d.factorOf();
    const fertilized = tile.fertilized === true;
    const skillChance = this.d.skillTierUpChance();
    const tierBonus = this.d.tierBonusOf(ref.value.tab.kind);
    // [G5] регроу-время для винограда (клубника регроу не использует)
    const regrowMs = crop?.fruitingDays !== undefined ? this.d.regrowMsOf(crop, ref.value.tab.kind) : null;
    const now = this.d.time.now();
    const act = (): Result<{ tab: string; tileIdx: number; cropId: ID; yields: HarvestLine[]; aftermath: 'empty' | 'again' | 'regrow'; harvestsLeft?: number; fruitingUntil?: number }> => {
      const r = harvestTile(this.d.getState(), tabId, tileIdx, { crop, now, regrowMs });
      if (!r.ok) return r;
      const harvested = crop as CropDef;
      // вместимость ДО выдачи (канон M04.1/D23): отказ = тайл цел, энергия не тронута
      for (const line of harvested.yields) {
        const probe = this.d.probeCapacity(line.defId, maxOf(line));
        if (!probe.ok) return err(probe.error);
        if (!probe.value.fits) {
          return err(`в инвентаре нет места для «${line.defId}» — освободите слоты (inv list)`);
        }
      }
      const yields: HarvestLine[] = [];
      for (const line of harvested.yields) {
        const qty = rollYieldQty(this.d.rngBus, line.minQty, line.maxQty);
        const quality = rollHarvestQuality(this.d.rngBus, this.d.table, factor, fertilized, skillChance, tierBonus);
        const deliver = this.d.deliverCrop(line.defId, quality.tier, quality.value, qty, 'farm.grown');
        if (!deliver.ok) return err(deliver.error);
        yields.push({ defId: line.defId, qty, quality });
      }
      this.d.setState(r.value.state);
      this.d.save.markDirty();
      // [G5] переход честный: empty | снова ready (клубника) | growing (регроу)
      this.d.bus.publish('farm.tileChanged', { tab: tabId, tileIdx, from: 'ready', to: r.value.aftermath === 'regrow' ? 'growing' : r.value.aftermath === 'again' ? 'ready' : 'empty' });
      for (const y of yields) {
        this.d.bus.publish('farm.cropHarvested', { defId: y.defId, qty: y.qty, quality: y.quality, tab: tabId });
      }
      return ok({
        tab: tabId,
        tileIdx,
        cropId: r.value.cropId,
        yields,
        aftermath: r.value.aftermath,
        ...(r.value.harvestsLeft !== undefined ? { harvestsLeft: r.value.harvestsLeft } : {}),
        ...(r.value.fruitingUntil !== undefined ? { fruitingUntil: r.value.fruitingUntil } : {}),
      });
    };
    return this.d.withEnergy('action.farm.harvest.energyCost', act, `сбор ${String(tile.cropId ?? '')}`) as Result<{
      tab: string;
      tileIdx: number;
      cropId: ID;
      yields: HarvestLine[];
      aftermath: 'empty' | 'again' | 'regrow';
      harvestsLeft?: number;
      fruitingUntil?: number;
    }>;
  }
}
