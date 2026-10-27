/**
 * GameDirector — координатор (01-CORE §8): монтирует модули, включает/выключает.
 * Один знает обо всех — модули не знают друг о друге (П4).
 */
import type { ModuleContext, ModuleRegistry } from './module-registry';

export class GameDirector {
  private readonly registry: ModuleRegistry;
  private readonly context: ModuleContext;

  constructor(registry: ModuleRegistry, context: ModuleContext) {
    this.registry = registry;
    this.context = context;
  }

  activate(moduleId: string): boolean {
    return this.registry.activate(moduleId, this.context);
  }

  deactivate(moduleId: string): boolean {
    return this.registry.deactivate(moduleId);
  }

  activateAll(): void {
    for (const info of this.registry.list()) {
      this.activate(info.manifest.id);
    }
  }
}
