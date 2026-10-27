/**
 * Зависимости сервисов очереди крафта M09 — общий контракт (01-CORE §6:
 * расщепление queue.ts при превышении 500 строк). App-слой вайрит колбэки
 * через ModuleRegistry (П4): инвентарь/модфордж/игрок НЕ импортируются.
 */
import type { EventBus } from '@/kernel/bus/event-bus/event-bus';
import type { StatBus } from '@/kernel/bus/stat-bus/stat-bus';
import type { ResolveCtx } from '@/kernel/bus/stat-bus/modifier';
import type { TransactionService } from '@/kernel/services/transaction/transaction-service';
import type { ConditionCtx } from '@/shared/types/requirement';
import type { ID, QualityTier, StatId } from '@/shared/types/ids';
import type { Result } from '@/shared/types/result';
import type { RolledModEntry } from '@/shared/types/rolled-mod';
import type { CraftTable } from '@/content/balance/craft';
import type { RecipeDef } from '@/content/craft/recipes';
import type { StationId } from '@/content/craft/stations';
import type { CraftState } from './state';
import type { InventoryEntryLike } from './inputs';
import type { StationService } from './stations';

export interface QueueDeps {
  table: CraftTable;
  recipes: readonly RecipeDef[];
  stations: StationService;
  transaction: TransactionService;
  bus: EventBus;
  statBus: StatBus;
  now(): number;
  resolveCtx(): ResolveCtx;
  gateCtx(): ConditionCtx;
  /** уровень навыка «Крафт» (из player.ctxExtras, П4) */
  skillLevel(): number;
  getState(): CraftState;
  setState(s: CraftState): void;
  markDirty(): void;
  // --- app-слой (module-wiring, П4: колбэки через ModuleRegistry)
  listItems(): InventoryEntryLike[];
  walletGet(id: ID): number;
  isCurrency(defId: ID): boolean;
  tryItem(defId: ID): { id: ID; modSlots?: { budgetBase: number; tags: string[] } | undefined } | undefined;
  /** player.withEnergy — энергия списывается ТОЛЬКО при успехе действия
   *  (не-дженерик адаптер app-слоя; вызывающий кастует к своему T) */
  withEnergy(stat: StatId, action: () => Result<unknown>, reason?: string): Result<unknown>;
  /** inventory.addWithQuality (явное качество крафта) */
  deliverOutput(defId: ID, tier: QualityTier, value: number, qty: number, source: string): Result<{ iids: ID[] }>;
  /** inventory.canAcquire — проба вместимости до выдачи (D23-канон) */
  probeCapacity(defId: ID, qty: number): Result<{ fits: boolean; free: number; newEntries: number }>;
  /** modforge.rollItem — стартовые ривен-роллы выхода (C4-прецедент) */
  rollItem(defId: ID, streamKey: string): Result<{ rolls: RolledModEntry[] }>;
  /** inventory.setRolls — применение партии роллов */
  applyRolls(iid: ID, rolls: RolledModEntry[]): Result<unknown>;
}

export type { StationId };
