/**
 * Манифест и реестр модулей (01-CORE §9).
 * Манифест — единственное место, где модуль декларирует ВСЕ точки интеграции.
 * Прямые импорты между модулями запрещены (П4); публичный API — только через
 * ModuleRegistry.get(id).api.<method>().
 */
import type { EventBus } from '@/kernel/bus/event-bus/event-bus';
import type { StatBus } from '@/kernel/bus/stat-bus/stat-bus';
import type { PriceBus } from '@/kernel/bus/price-bus/price-bus';
import type { RngBus } from '@/kernel/bus/rng-bus/rng-bus';
import type { PityService } from '@/kernel/services/pity/pity-service';
import type { StatsService } from '@/kernel/services/stats/stats-service';
import type { TaskRegistry } from '@/kernel/services/task-registry/task-registry';
import type { TransactionService } from '@/kernel/services/transaction/transaction-service';
import type { TimeService } from '@/kernel/time/time-service';
import type { ContentRegistry } from '@/kernel/content/content-registry';
import type { SaveDirector } from '@/kernel/save/save-director';
import type { ID } from '@/shared/types/ids';

export interface ModuleManifest {
  /** совпадает с M-номером в ROADMAP: 'player', 'inventory', 'farm'... */
  id: ID;
  /**
   * Человекочитаемое имя с M-номером по ROADMAP (00-README §2), например
   * 'M12 Шахта'. Декларируется модулем в момент рождения (здесь — как и все
   * точки интеграции) и больше НИГДЕ не заносится: витрины `registry`/
   * `modules` и self-группа «Реестр» агрегируют живые манифесты — новый
   * модуль появляется в списках сам (сеанс REG-1).
   */
  title?: string;
  version: string;
  /** ключ среза в сейве */
  stateKey: string;
  publicApi?: string[];
  eventsPublished?: string[];
  eventsSubscribed?: Array<{ event: string; handler: string }>;
  modifierProviders?: string[];
  /** [M04.1] провайдеры ЦЕН (PriceBus; 04-DISCOUNTS §1): модуль-наблюдатель
   *  системы скидок регистрирует источники шине. Аддитивно к 01-CORE §9 —
 *  манифест остаётся единственным реестром точек интеграции. */
  priceModifierProviders?: string[];
  taskExecutors?: string[];
  statsCounters?: string[];
}

/**
 * Разрешённые каналы коммуникации — ТОЛЬКО через этот контекст (01-CORE §7).
 * Модуль не получает прямых ссылок на другие модули.
 */
export interface ModuleContext {
  bus: EventBus;
  statBus: StatBus;
  priceBus: PriceBus;
  rngBus: RngBus;
  pity: PityService;
  stats: StatsService;
  tasks: TaskRegistry;
  transaction: TransactionService;
  time: TimeService;
  content: ContentRegistry;
  save: SaveDirector;
}

export interface GameModule {
  manifest: ModuleManifest;
  activate(ctx: ModuleContext): void;
  deactivate?(): void;
  /** публичный API для других модулей — только через ModuleRegistry */
  api?: Record<string, (...args: unknown[]) => unknown>;
}

export interface MountedModuleInfo {
  manifest: ModuleManifest;
  active: boolean;
}

export class ModuleRegistry {
  private readonly modules = new Map<ID, { module: GameModule; active: boolean }>();

  register(module: GameModule): void {
    if (this.modules.has(module.manifest.id)) {
      throw new Error(`[Modules] модуль "${module.manifest.id}" уже зарегистрирован`);
    }
    this.modules.set(module.manifest.id, { module, active: false });
  }

  /** Активация модуля его же контекстом — реализует сам модуль */
  activate(id: ID, ctx: ModuleContext): boolean {
    const entry = this.modules.get(id);
    if (!entry || entry.active) return false;
    entry.module.activate(ctx);
    entry.active = true;
    return true;
  }

  deactivate(id: ID): boolean {
    const entry = this.modules.get(id);
    if (!entry || !entry.active) return false;
    entry.module.deactivate?.();
    entry.active = false;
    return true;
  }

  get(id: ID): { api: Record<string, (...args: unknown[]) => unknown>; manifest: ModuleManifest } | null {
    const entry = this.modules.get(id);
    if (!entry || !entry.active) return null;
    return { api: entry.module.api ?? {}, manifest: entry.module.manifest };
  }

  call(id: ID, method: string, ...args: unknown[]): unknown {
    const entry = this.modules.get(id);
    if (!entry || !entry.active) return null;
    const fn = entry.module.api?.[method];
    if (typeof fn !== 'function') return null;
    return fn(...args);
  }

  isRegistered(id: ID): boolean {
    return this.modules.has(id);
  }

  list(): MountedModuleInfo[] {
    return [...this.modules.values()].map((e) => ({
      manifest: e.module.manifest,
      active: e.active,
    }));
  }
}
