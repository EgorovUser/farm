/**
 * Мини DI-контейнер (01-CORE §5: kernel/di/service-container.ts).
 * Регистрация по токену-строке, resolve ленив, циклы запрещены.
 */

export interface ServiceContainer {
  register<T>(token: string, factory: (c: ServiceContainer) => T): void;
  registerValue<T>(token: string, value: T): void;
  resolve<T>(token: string): T;
  has(token: string): boolean;
  describe(): string[];
}

class ContainerImpl implements ServiceContainer {
  private readonly factories = new Map<string, (c: ServiceContainer) => unknown>();
  private readonly singletons = new Map<string, unknown>();
  private readonly resolving = new Set<string>();

  register<T>(token: string, factory: (c: ServiceContainer) => T): void {
    if (this.factories.has(token) || this.singletons.has(token)) {
      throw new Error(`[DI] токен уже зарегистрирован: ${token}`);
    }
    this.factories.set(token, factory as (c: ServiceContainer) => unknown);
  }

  registerValue<T>(token: string, value: T): void {
    if (this.factories.has(token) || this.singletons.has(token)) {
      throw new Error(`[DI] токен уже зарегистрирован: ${token}`);
    }
    this.singletons.set(token, value);
  }

  resolve<T>(token: string): T {
    if (this.singletons.has(token)) return this.singletons.get(token) as T;
    const factory = this.factories.get(token);
    if (!factory) throw new Error(`[DI] токен не найден: ${token}`);
    if (this.resolving.has(token)) {
      throw new Error(`[DI] циклическая зависимость: ${token}`);
    }
    this.resolving.add(token);
    try {
      const instance = factory(this);
      this.singletons.set(token, instance);
      return instance as T;
    } finally {
      this.resolving.delete(token);
    }
  }

  has(token: string): boolean {
    return this.factories.has(token) || this.singletons.has(token);
  }

  describe(): string[] {
    return [...this.singletons.keys(), ...this.factories.keys()];
  }
}

export function createContainer(): ServiceContainer {
  return new ContainerImpl();
}
