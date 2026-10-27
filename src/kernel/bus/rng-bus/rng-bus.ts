/**
 * RngBus — шина рандома (02-BUSES §6).
 * - детерминированные стримы (mulberry32) от явного сида;
 * - dailySeed = hash(saveId + dateISO) — ротации дня не переролливаются перезапуском;
 * - roll(table, ctx): взвешенный выбор с удачей
 *     эффективный вес = weight × (1 + luck(stat, ctx)/100),
 *     luck читается ТОЛЬКО через StatBus;
 * - rollRange(min, max, curve): равномерно / треугольно / степенно;
 * - каждый ролл логируется (RollLog).
 */
import { dailySeed, hashString, mulberry32, rollRange, weightedPick, type RangeCurve } from '@/shared/utils/rng';
import type { ResolveCtx } from '@/kernel/bus/stat-bus/modifier';
import type { StatBus } from '@/kernel/bus/stat-bus/stat-bus';
import type { StatId } from '@/shared/types/ids';
import type { ID } from '@/shared/types/ids';
import type { RollLog } from './roll-log';

export interface RollTableEntry {
  id: string;
  weight: number;
  /** запись чувствительна к удаче таблицы (02-BUSES §6): редкие дропы помечаются здесь */
  lucky?: boolean;
}

export interface RollTable {
  id: string;
  /** какой стат даёт удачу на эту таблицу (например 'fishing.luck.rare') */
  luckStat?: StatId;
  entries: RollTableEntry[];
}

export interface RngBusDeps {
  seed: number;
  statBus: StatBus;
  tables: ReadonlyMap<string, RollTable>;
  log: RollLog;
}

export class RngBus {
  private readonly statBus: StatBus;
  private readonly tables: ReadonlyMap<string, RollTable>;
  private readonly log: RollLog;
  private seedValue: number;
  private readonly streams = new Map<string, () => number>();

  constructor(deps: RngBusDeps) {
    this.seedValue = deps.seed >>> 0;
    this.statBus = deps.statBus;
    this.tables = deps.tables;
    this.log = deps.log;
  }

  get seed(): number {
    return this.seedValue;
  }

  /** Смена сида (новый день, новый сейв) — все стримы пересоздаются */
  setSeed(seed: number): void {
    this.seedValue = seed >>> 0;
    this.streams.clear();
  }

  /** Детерминированный именованный стрим [0,1) */
  stream(streamId: string): () => number {
    let s = this.streams.get(streamId);
    if (!s) {
      s = mulberry32(hashString(`${this.seedValue}:${streamId}`));
      this.streams.set(streamId, s);
    }
    return s;
  }

  nextFloat(streamId: string): number {
    return this.stream(streamId)();
  }

  /** Сид дня: магазин/доска/биржа/daily-квесты роллятся одинаково весь день */
  dailySeed(saveId: string, dateISO: string): number {
    return dailySeed(saveId, dateISO);
  }

  tableIds(): string[] {
    return [...this.tables.keys()].sort();
  }

  getTable(tableId: string): RollTable | undefined {
    return this.tables.get(tableId);
  }

  /**
   * Взвешенный ролл из таблицы с удачей. Возвращает id записи или null,
   * если таблица пуста/не существует (П5: штатный случай).
   */
  rollTable(tableId: string, ctx?: ResolveCtx, streamId?: string): string | null {
    const table = this.tables.get(tableId);
    if (!table || table.entries.length === 0) return null;

    const luckStat = table.luckStat ?? 'player.luck';
    const luck = ctx ? this.statBus.resolve({ stat: luckStat, ctx }) : 0;
    const source = streamId ?? `table:${tableId}`;
    const pick = weightedPick(table.entries, this.stream(source), luck);

    if (!pick) return null;
    const chances = pick.effectiveWeights.map((w, i) => {
      const pct = pick.total > 0 ? (w / pick.total) * 100 : 0;
      return `${table.entries[i].id} ${(pct).toFixed(1)}%`;
    });
    this.log.push({
      at: ctx?.now ?? Date.now(),
      kind: 'table',
      source,
      input: tableId,
      output: pick.id,
      luck,
      detail: chances.join(' · '),
    });
    return pick.id;
  }

  /** Ролл диапазона с кривой распределения */
  rollRange(
    min: number,
    max: number,
    curve: RangeCurve = 'uniform',
    streamId = 'range:default',
    ctx?: ResolveCtx,
  ): number {
    const v = rollRange(min, max, this.stream(streamId), curve);
    this.log.push({
      at: ctx?.now ?? Date.now(),
      kind: 'range',
      source: streamId,
      input: `${min}..${max} (${curve})`,
      output: v.toFixed(2),
      luck: 0,
    });
    return v;
  }

  /** Честная таблица шансов таблицы с учётом текущей удачи (П6: шансы — на стол) */
  chances(tableId: string, ctx?: ResolveCtx): Array<{ id: string; chancePercent: number; weight: number }> {
    const table = this.tables.get(tableId);
    if (!table || table.entries.length === 0) return [];
    const luckStat = table.luckStat ?? 'player.luck';
    const luck = ctx ? this.statBus.resolve({ stat: luckStat, ctx }) : 0;
    const luckMult = Math.max(0, 1 + luck / 100);
    const weights = table.entries.map((e) => Math.max(0, e.weight) * (e.lucky ? luckMult : 1));
    const total = weights.reduce((a, b) => a + b, 0);
    return table.entries.map((e, i) => ({
      id: e.id,
      weight: e.weight,
      chancePercent: total > 0 ? (weights[i] / total) * 100 : 0,
    }));
  }

  rollLog(): RollLog {
    return this.log;
  }
}
