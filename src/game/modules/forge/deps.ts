/**
 * Зависимости сервисов заточки M10 — общий контракт (01-CORE §6). App-слой
 * вайрит колбэки через ModuleRegistry (П4): инвентарь/крафт НЕ импортируются.
 */
import type { EventBus } from '@/kernel/bus/event-bus/event-bus';
import type { StatBus } from '@/kernel/bus/stat-bus/stat-bus';
import type { ResolveCtx } from '@/kernel/bus/stat-bus/modifier';
import type { RngBus } from '@/kernel/bus/rng-bus/rng-bus';
import type { PityService } from '@/kernel/services/pity/pity-service';
import type { TransactionService } from '@/kernel/services/transaction/transaction-service';
import type { ConditionCtx } from '@/shared/types/requirement';
import type { ID, QualityTier } from '@/shared/types/ids';
import type { ItemDef } from '@/content/items/items';
import type { ForgeTable } from '@/content/balance/forging';
import type { ForgeState } from './state';
import type { ForgeOutcomeKind } from './outcome';

export interface ForgeDeps {
  table: ForgeTable;
  transaction: TransactionService;
  bus: EventBus;
  statBus: StatBus;
  rngBus: RngBus;
  pity: PityService;
  now(): number;
  resolveCtx(): ResolveCtx;
  gateCtx(): ConditionCtx;
  getState(): ForgeState;
  setState(s: ForgeState): void;
  markDirty(): void;
  // --- app-слой (module-wiring, П4: колбэки через ModuleRegistry)
  /** записи рюкзака (inventory.list — экипированные исключены, D30) */
  listItems(): Array<{ iid: ID; defId: ID; quality: { tier: QualityTier; value: number } }>;
  /** реестр предметов (content) */
  tryItem(defId: ID): ItemDef | undefined;
  /** витрина craft.stations → built (гейт наковальни — вызов API, не импорт) */
  craftStationBuilt(id: string): boolean;
  /** dev-форс исхода (02-BUSES §12 forge force; null — естественный ролл) */
  forceMode(): ForgeOutcomeKind | null;
}
