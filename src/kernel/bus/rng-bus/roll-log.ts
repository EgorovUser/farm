/**
 * RollLog — журнал всех роллов, влияющих на игрока (02-BUSES §6):
 * debug-команда `roll.log` и честные UI-таблицы шансов строятся на этом логе.
 * [РАСШИРЕНИЕ] Поле `detail` (строка шансов таблицы) сверх минимального контракта.
 */

export interface RollLogEntry {
  at: number;
  kind: 'table' | 'range';
  source: string;
  input: string;
  output: string;
  luck: number;
  detail?: string;
}

export class RollLog {
  private entries: RollLogEntry[] = [];
  private readonly cap: number;

  constructor(cap = 200) {
    this.cap = Math.max(10, cap);
  }

  push(entry: RollLogEntry): void {
    this.entries.push(entry);
    if (this.entries.length > this.cap) {
      this.entries = this.entries.slice(-this.cap);
    }
  }

  list(): readonly RollLogEntry[] {
    return this.entries;
  }

  clear(): void {
    this.entries = [];
  }
}
