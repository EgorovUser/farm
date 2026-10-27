/**
 * DebugConsole — типы и реестр команд (02-BUSES §12).
 * Это «интерфейс» фаз 0–5: команды текстом, минимальные панели-таблицы.
 * Каждый модуль будет ДОБАВЛЯТЬ свои команды через манифест.
 */
import type { Game } from '@/game/bootstrap';

export type LineKind = 'cmd' | 'out' | 'ok' | 'err' | 'warn' | 'info' | 'title';

export interface ConsoleLine {
  id: number;
  kind: LineKind;
  text: string;
  at: number;
}

export interface CommandContext {
  game: Game;
  print(text: string): void;
  printOk(text: string): void;
  printErr(text: string): void;
  printWarn(text: string): void;
  printTitle(text: string): void;
  clear(): void;
  /** обновить панели состояния UI */
  refresh(): void;
  /** [FIX-0.1 B] фильтр отображения minuteTick в ленте событий (только UI-слой) */
  setTickFilter(visible: boolean): void;
  getTickFilter(): boolean;
}

export interface ConsoleCommand {
  /** имя команды: 'resolve', 'mod add', 'price'... */
  name: string;
  usage: string;
  description: string;
  run(args: string[], ctx: CommandContext): void | Promise<void>;
}

export class CommandRegistry {
  private readonly commands = new Map<string, ConsoleCommand>();

  register(command: ConsoleCommand): void {
    this.commands.set(command.name, command);
  }

  get(name: string): ConsoleCommand | undefined {
    return this.commands.get(name);
  }

  /** Разбор ввода: 'mod add player.luck flat 5' → ['mod add', ['player.luck','flat','5']] */
  parse(input: string): { command: ConsoleCommand; args: string[] } | null {
    const parts = input.trim().split(/\s+/).filter(Boolean);
    if (parts.length === 0) return null;
    // сначала пробуем двухсловные команды ('mod add', 'roll log', 'save wipe')
    if (parts.length >= 2) {
      const two = `${parts[0]} ${parts[1]}`;
      const cmd = this.commands.get(two);
      if (cmd) return { command: cmd, args: parts.slice(2) };
    }
    const one = this.commands.get(parts[0]);
    if (one) return { command: one, args: parts.slice(1) };
    return null;
  }

  list(): ConsoleCommand[] {
    return [...this.commands.values()].sort((a, b) => a.name.localeCompare(b.name));
  }
}
