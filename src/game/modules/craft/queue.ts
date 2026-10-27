/**
 * Очередь крафта §5 (карточка M09) — фасад QueueService: запуск (make),
 * отмена, витрины. Прогресс — sweep.ts, сбор — collect.ts (расщепление
 * 01-CORE §6: файл превысил 500 строк).
 *
 * ЗАПУСК (make): гейты → вместимость очереди → план входов (D25-зеркало,
 * inputs.ts) → энергия + входы (withEnergy обнимает транзакцию: отказ
 * любого звена — ничего не списано) → enqueue → sweep (старт немедленно,
 * craft.started). Энергия — стат action.craft.make.energyCost (карточка
 * M01 §2, [DECISION] M09: рецепты energyCost не задают — Спартанец M14
 * работает через шину).
 *
 * ОТМЕНА: возврат входов за вычетом 10% ([FIX-PHASE-2 · 4.3] ратифицированная
 * формула потерь: loss = 0 при qty = 1 (прежний ceil-вырождение съедало 100%
 * одиночной строки — OBS-4 AUDIT-M09); при qty > 1 loss = max(1, floor(qty ×
 * (1 − refundShare))) — отмена никогда не бесплатна, но и не отнимает всё);
 * энергия не возвращается (refundEnergy: false в данных); готовые партии
 * не отменяются.
 */
import type { CurrencyId, ID, StatId } from '@/shared/types/ids';
import type { Result } from '@/shared/types/result';
import { err, ok } from '@/shared/types/result';
import type { RecipeDef } from '@/content/craft/recipes';
import type { StationId } from '@/content/craft/stations';
import type { CraftBatch, CraftReadyBatch, CraftState } from './state';
import { planInputs, resolveRecipeIO, type RecipeIO } from './inputs';
import { stationGateText } from './stations';
import { checkCondition } from '@/shared/utils/condition-check';
import type { QueueDeps } from './deps';
import { sweepQueues, type SweepReceipt } from './sweep';
import { collectReady, type CollectReceipt } from './collect';

export interface MakeReceipt {
  batchId: ID;
  recipeId: ID;
  station: StationId;
  /** null — станция на паузе (готовый буфер полон): старт при сборе */
  endsAt: number | null;
  energyCost: number;
}

export interface CancelReceipt {
  batchId: ID;
  recipeId: ID;
  refunds: Array<{ defId: ID; qty: number }>;
}

export interface QueueViewRow {
  station: StationId;
  queueLength: number;
  batches: Array<{ id: ID; recipeId: ID; started: boolean; endsAt: number | null }>;
  ready: number;
}

export type { QueueDeps, SweepReceipt, CollectReceipt };

export class QueueService {
  private readonly deps: QueueDeps;

  constructor(deps: QueueDeps) {
    this.deps = deps;
  }

  // ------------------------------------------------------------- запуск

  make(recipeId: ID, minigameAdj = 0): Result<MakeReceipt> {
    sweepQueues(this.deps);
    const recipe = this.deps.recipes.find((r) => r.id === recipeId);
    if (!recipe) {
      return err(`неизвестный рецепт "${recipeId}" (craft.list — витрина)`);
    }
    if (!this.deps.stations.isBuilt(recipe.station)) {
      const st = this.deps.stations.stationById(recipe.station);
      return err(`рецепт «${recipe.id}» требует станцию «${st?.name ?? recipe.station}» (craft.buy ${recipe.station})`);
    }
    if (recipe.unlock && !checkCondition(recipe.unlock, this.deps.gateCtx())) {
      return err(`рецепт «${recipe.id}» закрыт: ${stationGateText(recipe.unlock)}`);
    }
    const io = resolveRecipeIO(recipe, this.deps);
    if (!io.ok) return io;

    const state = this.deps.getState();
    const queue = state.queues[recipe.station] ?? [];
    const maxLength = this.deps.stations.queueLengthOf(recipe.station);
    if (queue.length >= maxLength) {
      return err(`очередь «${recipe.station}» заполнена: ${queue.length}/${maxLength} (улучшение станции — craft.list)`);
    }

    const plan = planInputs(io.value, this.deps);
    if (!plan.ok) return plan;

    // --- энергия + входы: withEnergy обнимает транзакцию (атомарно; отказ
    //     любого звена — ничего не списано, событий расхода нет)
    const enqueue = (): Result<{ batchId: ID }> => {
      const pay = this.deps.transaction.transact({
        costs: plan.value.costs,
        eventId: 'craft.make',
        reason: `запуск ${recipe.id}`,
      });
      if (!pay.ok) return err(pay.error);
      const s = this.deps.getState();
      const batchId = `craft:${s.seq + 1}`;
      const batch: CraftBatch = {
        id: batchId,
        recipeId: recipe.id,
        station: recipe.station,
        enqueuedAt: this.deps.now(),
        inputTier: plan.value.avgInputTier,
        ...(minigameAdj !== 0 ? { minigameAdj } : {}),
      };
      this.deps.setState({
        ...s,
        seq: s.seq + 1,
        queues: { ...s.queues, [recipe.station]: [...(s.queues[recipe.station] ?? []), batch] },
      });
      this.deps.markDirty();
      return ok({ batchId });
    };
    const ran = this.deps.withEnergy('action.craft.make.energyCost', enqueue, `крафт ${recipe.id}`) as Result<{
      batchId: ID;
    }>;
    if (!ran.ok) return err(ran.error);

    // --- sweep: старт немедленно, если станция свободна (craft.started)
    sweepQueues(this.deps);
    const after = this.deps.getState();
    const batch = (after.queues[recipe.station] ?? []).find((b) => b.id === ran.value.batchId);
    return ok({
      batchId: ran.value.batchId,
      recipeId: recipe.id,
      station: recipe.station,
      endsAt: batch?.endsAt ?? null,
      energyCost: this.energyCostOf(recipe),
    });
  }

  /** расход энергии рецепта: стат M01 §2 (рецепт может задать свой, данные) */
  energyCostOf(recipe: RecipeDef): number {
    if (recipe.energyCost !== undefined) return recipe.energyCost;
    return this.deps.statBus.resolve({ stat: 'action.craft.make.energyCost' as StatId, ctx: this.deps.resolveCtx() });
  }

  // ------------------------------------------------------------- отмена

  cancel(batchId: ID): Result<CancelReceipt> {
    sweepQueues(this.deps);
    const state = this.deps.getState();
    for (const station of Object.keys(state.queues) as StationId[]) {
      const list = state.queues[station] ?? [];
      const idx = list.findIndex((b) => b.id === batchId);
      if (idx < 0) continue;
      const recipe = this.deps.recipes.find((r) => r.id === list[idx].recipeId);
      const io = recipe ? resolveRecipeIO(recipe, this.deps) : null;
      if (!io?.ok) return err('рецепт партии неизвестен контенту — отмена недоступна');
      // --- возврат входов: ратифицированная формула потерь отмены
      //     [FIX-PHASE-2 · 4.3 · OBS-4 AUDIT-M09]: loss = 0 при qty=1;
      //     при qty>1 loss = max(1, floor(qty × (1 − refundShare)))
      const { refundShare } = this.deps.table.cancel;
      const refunds: Array<{ defId: ID; qty: number }> = [];
      const grants = io.value.inputs
        .map((line) => {
          const loss = line.qty === 1 ? 0 : Math.max(1, Math.floor(line.qty * (1 - refundShare)));
          const refund = Math.max(0, line.qty - loss);
          if (refund > 0) refunds.push({ defId: line.defId, qty: refund });
          return line.kind === 'currency'
            ? { t: 'currency' as const, id: line.defId as CurrencyId, qty: refund }
            : { t: 'item' as const, defId: line.defId, qty: refund };
        })
        .filter((g) => g.qty > 0);
      const back = this.deps.transaction.transact({
        ...(grants.length > 0 ? { grants } : {}),
        eventId: 'craft.cancel',
        reason: `отмена партии ${batchId} (возврат ${Math.round(refundShare * 100)}%)`,
      });
      if (!back.ok) return err(back.error);
      const recipeId = list[idx].recipeId;
      const next = [...list];
      next.splice(idx, 1);
      const queues = { ...state.queues };
      if (next.length > 0) queues[station] = next;
      else delete queues[station];
      this.deps.setState({ ...state, queues });
      this.deps.markDirty();
      return ok({ batchId, recipeId, refunds });
    }
    return err(`партия "${batchId}" не найдена в очередях (готовые партии не отменяются — craft.collect)`);
  }

  // ------------------------------------------------------------- прогресс/сбор

  /** делегирование sweep.ts (лениво на каждом доступе + тики + исполнитель) */
  sweep(): SweepReceipt {
    return sweepQueues(this.deps);
  }

  /** делегирование collect.ts (проба → преролл → выдача → эффекты) */
  collect(batchId?: ID): Result<CollectReceipt> {
    return collectReady(this.deps, batchId);
  }

  // ------------------------------------------------------------- витрины

  view(station?: StationId): QueueViewRow[] {
    sweepQueues(this.deps);
    const state = this.deps.getState();
    const ids = new Set<StationId>(station ? [station] : []);
    if (!station) {
      for (const q of Object.keys(state.queues) as StationId[]) ids.add(q);
      for (const r of state.ready) ids.add(r.station);
    }
    const rows: QueueViewRow[] = [];
    for (const id of ids) {
      const list = state.queues[id] ?? [];
      rows.push({
        station: id,
        queueLength: this.deps.stations.queueLengthOf(id),
        batches: list.map((b) => ({
          id: b.id,
          recipeId: b.recipeId,
          started: b.startedAt !== undefined,
          endsAt: b.endsAt ?? null,
        })),
        ready: state.ready.filter((r) => r.station === id).length,
      });
    }
    return rows;
  }

  readyView(): CraftReadyBatch[] {
    sweepQueues(this.deps);
    return [...this.deps.getState().ready];
  }

  /** рецепт по id (debug craft.recipe) */
  recipeById(id: ID): RecipeDef | undefined {
    return this.deps.recipes.find((r) => r.id === id);
  }

  /** IO рецепта для витрин (debug/П6) */
  ioOf(recipe: RecipeDef): Result<RecipeIO> {
    return resolveRecipeIO(recipe, this.deps);
  }
}

/** состояние для внешних читателей (манифест-инвариант: срез один) */
export type { CraftState };
