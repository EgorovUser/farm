/**
 * ContentRegistry — реестр контента (03-DATA §11).
 * - все таблицы валидируются zod при старте: битый контент = отказ загрузки
 *   с указанием таблицы/поля, а не «молчаливый NaN»;
 * - реализует BaseSource для StatBus: базы статов — единственное место (П2);
 * - смотр недокументированного стата — исключение.
 */
import type { BaseSource, StatMeta } from '@/kernel/bus/stat-bus/stat-bus';
import type { EconomyConfig } from '@/kernel/bus/price-bus/price-bus';
import type { RollTable } from '@/kernel/bus/rng-bus/rng-bus';
import type { TimeConfig } from '@/kernel/time/time-service';
import type { Rarity, StatId } from '@/shared/types/ids';
import type { Rounding } from '@/shared/utils/math';
import type { ZodType } from 'zod';
import { formatZodIssues } from './schemas';

/**
 * [FIX-0.1 K] ядро не импортирует ничего выше себя (01-CORE §5) — в том числе
 * type-only из @/content. Формы таблиц описаны здесь структурно; конкретные
 * типы контента (BasesTable, ItemDef в content/) им удовлетворяют.
 */
interface BasesTableShape {
  bases: Record<string, number>;
  meta: Record<string, { round?: Rounding; min?: number }>;
}

/** Минимальная форма предмета для индексов реестра (полный ItemDef — в content) */
export interface RegistryItemDef {
  id: string;
  name: string;
  basePrice: number;
  rarity: Rarity;
  itemType?: string;
  subType?: string;
}

export class ContentValidationError extends Error {
  constructor(
    public readonly table: string,
    public readonly issues: string[],
  ) {
    super(`контент-таблица "${table}" не прошла валидацию:\n  - ${issues.join('\n  - ')}`);
    this.name = 'ContentValidationError';
  }
}

export const CONTENT_VERSION = '0.1.0-phase0';

interface TableEntry {
  data: unknown;
}

export class ContentRegistry implements BaseSource {
  readonly contentVersion = CONTENT_VERSION;

  private readonly tables = new Map<string, TableEntry>();
  private readonly itemsById = new Map<string, RegistryItemDef>();
  private readonly rollTablesById = new Map<string, RollTable>();
  private basesTable: BasesTableShape | null = null;

  /** Зарегистрировать и провалидировать таблицу. Бросает ContentValidationError. */
  register<T>(name: string, schema: ZodType<T>, data: unknown): T {
    const result = schema.safeParse(data);
    if (!result.success) {
      throw new ContentValidationError(name, formatZodIssues(result.error));
    }
    this.tables.set(name, { data: result.data });
    this.reindex(name, result.data);
    return result.data;
  }

  get<T>(name: string): T {
    const entry = this.tables.get(name);
    if (!entry) throw new Error(`[Content] таблица "${name}" не зарегистрирована`);
    return entry.data as T;
  }

  has(name: string): boolean {
    return this.tables.has(name);
  }

  tableNames(): string[] {
    return [...this.tables.keys()].sort();
  }

  // ------------------------------------------------------------ BaseSource

  base(stat: StatId): number {
    this.ensureBases();
    const value = this.basesTable?.bases[stat];
    if (value === undefined || !Number.isFinite(value)) {
      throw new Error(`[Content] стат "${stat}" не задокументирован в bases (П2: базы живут только тут)`);
    }
    return value;
  }

  meta(stat: StatId): StatMeta {
    this.ensureBases();
    return this.basesTable?.meta[stat] ?? {};
  }

  listStats(): StatId[] {
    this.ensureBases();
    return Object.keys(this.basesTable?.bases ?? {}).sort();
  }

  // ------------------------------------------------------------ типизированные таблицы

  items(): RegistryItemDef[] {
    return this.get<RegistryItemDef[]>('items');
  }

  item(defId: string): RegistryItemDef {
    const item = this.itemsById.get(defId);
    if (!item) throw new Error(`[Content] предмет "${defId}" не найден`);
    return item;
  }

  tryItem(defId: string): RegistryItemDef | undefined {
    return this.itemsById.get(defId);
  }

  rollTable(id: string): RollTable | undefined {
    return this.rollTablesById.get(id);
  }

  rollTables(): RollTable[] {
    return [...this.rollTablesById.values()].sort((a, b) => a.id.localeCompare(b.id));
  }

  economy(): EconomyConfig {
    return this.get<EconomyConfig>('economy');
  }

  time(): TimeConfig {
    return this.get<TimeConfig>('time');
  }

  rng(): { rollLogCap: number } {
    return this.get<{ rollLogCap: number }>('rng');
  }

  // ------------------------------------------------------------ internals

  private ensureBases(): void {
    if (this.basesTable) return;
    if (!this.tables.has('bases')) {
      throw new Error('[Content] таблица "bases" не зарегистрирована — ядро не может резолвить статы');
    }
    this.basesTable = this.get<BasesTableShape>('bases');
  }

  private reindex(name: string, data: unknown): void {
    if (name === 'items' && Array.isArray(data)) {
      this.itemsById.clear();
      for (const item of data as RegistryItemDef[]) this.itemsById.set(item.id, item);
    }
    if (name === 'rollTables' && Array.isArray(data)) {
      this.rollTablesById.clear();
      for (const table of data as RollTable[]) this.rollTablesById.set(table.id, table);
    }
    if (name === 'bases') this.basesTable = null; // перевалидировать лениво
  }
}
