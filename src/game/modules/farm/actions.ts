/**
 * FarmActions (M05.1+M05.2+M05.3) — механика действий фермы над чистыми
 * функциями logic/ (паттерн craft — 01 §6). Каждый переход: ленивый sweep →
 * валидации → withEnergy{сайд-эффекты → чистый переход → публикация} — отказ
 * любого звена = энергия не списана, состояние цело, событий нет (F6).
 * Удобрение — валюта: TransactionService. Выдача: probeCapacity до действия
 * (D23). Сбор — harvest.ts (wc-распил M05.3, поведение не менялось).
 *
 * [M05.3 · G1] таб-параметр: действия адресуются (tileIdx, tabId='field') —
 * вкладки улучшений несут свои сетки с независимой индексацией тайлов.
 * Посадка резолвит скорость роста с тегами культуры/вкладки — моды
 * улучшений (Плодородие/Чернозём/Теплица) ложатся через провайдера G3.
 */
import type { EventBus } from '@/kernel/bus/event-bus/event-bus';
import type { StatBus } from '@/kernel/bus/stat-bus/stat-bus';
import type { TransactionService } from '@/kernel/services/transaction/transaction-service';
import type { TimeService } from '@/kernel/time/time-service';
import type { SaveDirector } from '@/kernel/save/save-director';
import type { StatId, ID, QualityTier } from '@/shared/types/ids';
import type { Result } from '@/shared/types/result';
import { err, ok } from '@/shared/types/result';
import type { ConditionCtx } from '@/shared/types/requirement';
import { checkCondition } from '@/shared/utils/condition-check';
import type { CropDef } from '@/content/farm/crops';
import type { FarmTable } from '@/content/balance/farm';
import type { FarmState } from './state';
import {
  fertilizeTile,
  findTile,
  forceGrowTile,
  plantTile,
  plowTile,
  sweepTabs,
  waterTile,
  weedTile,
  isWatered,
  type TileTransition,
} from './logic/fsm';
import { growMsOf } from './logic/growth';
import { farmGateCtx, gateTextOf } from './logic/gates';

export interface FarmActionDeps {
  bus: EventBus;
  statBus: StatBus;
  transaction: TransactionService;
  time: TimeService;
  save: SaveDirector;
  table: FarmTable;
  crops: CropDef[];
  /** [M05.3 · G2] купленный Компостер (null — не куплен): вход/выход обмена
   *  из данных улучшения; прополка с навозом проводит транзакцию */
  composter(): { input: { item: ID; qty: number }; output: { currency: string; qty: number } } | null;
  getState(): FarmState;
  setState(s: FarmState): void;
  gateExtras(): Record<string, unknown>;
  withEnergy(stat: StatId, action: () => Result<unknown>, reason?: string): Result<unknown>;
  removeSeed(defId: ID, qty: number, source: string): Result<unknown>;
}

export interface HarvestLine {
  defId: ID;
  qty: number;
  quality: { tier: QualityTier; value: number };
}

interface WeedResult {
  tab: string;
  tileIdx: number;
  prevWeeds: number;
  /** [M05.3 · G2] обмен Компостера выполнен (навоз → Удобрение) */
  composted: boolean;
}

export class FarmActions {
  private readonly d: FarmActionDeps;
  private readonly cropById: Map<string, CropDef>;

  constructor(deps: FarmActionDeps) {
    this.d = deps;
    this.cropById = new Map(deps.crops.map((c) => [c.id, c] as const));
  }

  private resolveCtx() {
    return { ...this.d.time.ctx('player'), extra: this.d.gateExtras() };
  }

  gateCtx(): ConditionCtx {
    return farmGateCtx({ statBus: this.d.statBus, time: this.d.time, gateExtras: () => this.d.gateExtras() });
  }

  /** скорость роста с тегами культуры/категории/вкладки (G2/G3: моды
   *  улучшений — Плодородие/Чернозём таргетят категорию, Теплица — вкладку;
   *  фильтрацию по тегам делает StatBus — 02-BUSES §2) */
  growthSpeedFor(crop: CropDef | null, tabKind: string | null): number {
    const tags: string[] = [];
    if (crop) tags.push(`farm:crop:${crop.id}`);
    if (crop?.category) tags.push(`farm:crop:${crop.category}`);
    if (tabKind) tags.push(`farm:tab:${tabKind}`);
    return this.d.statBus.resolve({ stat: 'farm.growthSpeed', ctx: { ...this.d.time.ctx('player'), tags } });
  }

  /** [F3] auto-score мини-игры: resolve('minigame.<id>.autoScore'), клэмп 0..1 */
  autoScore(verb: keyof FarmTable['minigames']): number {
    const stat = `minigame.${this.d.table.minigames[verb]}.autoScore`;
    return Math.min(1, Math.max(0, this.d.statBus.resolve({ stat, ctx: this.resolveCtx() })));
  }

  private publishTransition(tr: TileTransition): void {
    this.d.bus.publish('farm.tileChanged', { tab: tr.tab, tileIdx: tr.tileIdx, from: tr.from, to: tr.to });
  }

  /** ленивая переоценка (craft.sweep): готовность по датам + учёт сухости
   * (F3); now — точка переоценки (прод — time.now(); часовой обработчик
   * передаёт payload.now — catchUp-проходы переоценивают на границах, не
   * «наперёд») */
  sweep(now?: number): TileTransition[] {
    const r = sweepTabs(this.d.getState(), now ?? this.d.time.now());
    // [M05.2 · F3] применяем и БЕЗ переходов: учёт сухости меняет даты
    // (grownAt/wateredUntil) без tileChanged — раньше терялся (живой чек)
    if (r.changed) {
      this.d.setState(r.state);
      if (r.transitions.length > 0) {
        for (const tr of r.transitions) this.publishTransition(tr);
      }
      this.d.save.markDirty();
    }
    return r.transitions;
  }

  private findCrop(cropId: string): Result<CropDef> {
    const crop = this.cropById.get(cropId);
    if (!crop) return err(`культура «${cropId}» не найдена (farm.crops — список)`);
    return ok(crop);
  }

  private gateCrop(crop: CropDef): Result<void> {
    if (crop.unlock && !checkCondition(crop.unlock, this.gateCtx())) {
      return err(`культура «${crop.id}» закрыта: Откроется: ${gateTextOf(crop.unlock)}`);
    }
    return ok(undefined);
  }

  plow(tileIdx: number, tabId = 'field'): Result<{ tab: string; tileIdx: number }> {
    this.sweep();
    const act = (): Result<{ tab: string; tileIdx: number }> => {
      const r = plowTile(this.d.getState(), tabId, tileIdx);
      if (!r.ok) return r;
      this.d.setState(r.value.state);
      this.d.save.markDirty();
      this.publishTransition({ tab: tabId, tileIdx, from: 'empty', to: 'plowed' });
      return ok({ tab: tabId, tileIdx });
    };
    return this.d.withEnergy('action.farm.plow.energyCost', act, 'вспашка') as Result<{ tab: string; tileIdx: number }>;
  }

  plant(cropId: string, tileIdx: number, tabId = 'field'): Result<{ tab: string; tileIdx: number; cropId: ID; grownAt: number }> {
    this.sweep();
    const cropR = this.findCrop(cropId);
    if (!cropR.ok) return cropR;
    const crop = cropR.value;
    const gate = this.gateCrop(crop);
    if (!gate.ok) return gate;
    const act = (): Result<{ tab: string; tileIdx: number; cropId: ID; grownAt: number }> => {
      // ПОРЯДОК АТОМАРНОСТИ: чистая валидация перехода ДО изъятия семени —
      // отказ посадки (не вспахан/вкладка) НЕ должен стоить семя (живая проба
      // приёмки нашла обратный порядок: 5 − 2 отказных вызова = потеря 2 семян)
      const ref = findTile(this.d.getState(), tabId, tileIdx);
      if (!ref.ok) return err(ref.error);
      const growMs = growMsOf(crop, this.growthSpeedFor(crop, ref.value.tab.kind));
      const r = plantTile(this.d.getState(), tabId, tileIdx, crop, this.d.time.now(), growMs);
      if (!r.ok) return r;
      // изъятие семени — публичный API M02 (F6): отказ = энергия не тронута
      const took = this.d.removeSeed(crop.seedDef, 1, 'farm.plant');
      if (!took.ok) return err(took.error);
      this.d.setState(r.value.state);
      this.d.save.markDirty();
      const planted = findTile(this.d.getState(), tabId, tileIdx);
      this.publishTransition({ tab: tabId, tileIdx, from: 'plowed', to: 'growing' });
      return ok({ tab: tabId, tileIdx, cropId: crop.id, grownAt: planted.ok ? (planted.value.tile.grownAt ?? 0) : 0 });
    };
    return this.d.withEnergy('action.farm.plant.energyCost', act, `посадка ${crop.id}`) as Result<{
      tab: string;
      tileIdx: number;
      cropId: ID;
      grownAt: number;
    }>;
  }

  water(tileIdx: number, tabId = 'field'): Result<{ tab: string; tileIdx: number; wateredUntil: number }> {
    this.sweep();
    const act = (): Result<{ tab: string; tileIdx: number; wateredUntil: number }> => {
      const windowMs = this.d.table.water.windowHours * 3_600_000;
      const r = waterTile(this.d.getState(), tabId, tileIdx, this.d.time.now(), windowMs);
      if (!r.ok) return r;
      this.d.setState(r.value.state);
      this.d.save.markDirty();
      const ref = findTile(this.d.getState(), tabId, tileIdx);
      return ok({ tab: tabId, tileIdx, wateredUntil: ref.ok ? (ref.value.tile.wateredUntil ?? 0) : 0 });
    };
    return this.d.withEnergy('action.farm.water.energyCost', act, 'полив') as Result<{
      tab: string;
      tileIdx: number;
      wateredUntil: number;
    }>;
  }

  fertilize(tileIdx: number, tabId = 'field'): Result<{ tab: string; tileIdx: number; grownAt: number; prevGrownAt: number }> {
    this.sweep();
    const r = fertilizeTile(this.d.getState(), tabId, tileIdx, this.d.time.now(), this.d.table.fertilizer.speedBonusPercent);
    if (!r.ok) return r;
    // удобрение — валюта кошелька: ТОЛЬКО TransactionService (F6);
    // отказ транзакции = состояние не тронуто (расчёт выше отброшен)
    const pay = this.d.transaction.transact({
      costs: [{ t: 'currency', id: 'fertilizer', qty: 1 }],
      eventId: 'farm.fertilize',
      reason: `удобрение тайла ${tileIdx}`,
    });
    if (!pay.ok) return err(pay.error);
    this.d.setState(r.value.state);
    this.d.save.markDirty();
    const t = findTile(this.d.getState(), tabId, tileIdx);
    return ok({ tab: tabId, tileIdx, grownAt: t.ok ? (t.value.tile.grownAt ?? 0) : 0, prevGrownAt: r.value.prevGrownAt });
  }

  /** dev-форс: время роста тайла истекло (полив-гейт и сбор — как обычно) */
  grow(tileIdx: number, tabId = 'field'): Result<{ tileIdx: number }> {
    const ref = findTile(this.d.getState(), tabId, tileIdx);
    if (!ref.ok) return err(ref.error);
    if (ref.value.tile.state !== 'growing') {
      return err(`форс роста применим только к растущему тайлу (тайл ${tileIdx}: «${ref.value.tile.state}»)`);
    }
    this.d.setState(forceGrowTile(this.d.getState(), tabId, tileIdx, this.d.time.now()));
    this.d.save.markDirty();
    this.sweep();
    return ok({ tileIdx });
  }

  /**
   * прополка (F2 · M05.2): снимает сорняки ЦЕЛИКОМ (энергия 1 —
   * action.farm.weed.energyCost с M01), остаток роста сжимается обратно
   * (штраф снят). [DECISION] без нового события — бейдж farm.weedsAppeared
   * только на появление; эффект видим в витрине/резолвах.
   *
   * [M05.3 · G2 · Компостер · DECISION] при купленном Компостере и навозе
   * в инвентаре прополка проводит транзакцию обмена (eventId farm.compost:
   * costs предмет-навоз, grants валюта-удобрение — TransactionService,
   * предметы через ItemPort инвентаря): отказ = навоза нет — прополка
   * проходит без обмена (штатно, не ошибка). «Сорняки» в обмене — сама
   * прополотая грядка (валидация weeds>0 выше — бесплатная часть рецепта).
   */
  weed(tileIdx: number, tabId = 'field'): Result<WeedResult> {
    this.sweep();
    const act = (): Result<WeedResult> => {
      const r = weedTile(this.d.getState(), tabId, tileIdx, this.d.time.now(), this.d.table.weeds.growthPenaltyPercent);
      if (!r.ok) return r;
      const composter = this.d.composter();
      let composted = false;
      if (composter) {
        const tx = this.d.transaction.transact({
          costs: [{ t: 'item', defId: composter.input.item, qty: composter.input.qty }],
          grants: [{ t: 'currency', id: composter.output.currency as never, qty: composter.output.qty }],
          eventId: 'farm.compost',
          reason: `компостер: прополка тайла ${tileIdx}`,
        });
        composted = tx.ok; // нет навоза — без обмена, прополка честная
      }
      this.d.setState(r.value.state);
      this.d.save.markDirty();
      this.d.bus.publish('invalidate.stat', {}); // кэш резолвов скорости
      return ok({ tab: tabId, tileIdx, prevWeeds: r.value.prevWeeds, composted });
    };
    return this.d.withEnergy('action.farm.weed.energyCost', act, `прополка тайла ${tileIdx}`) as Result<WeedResult>;
  }
}

export { isWatered };
