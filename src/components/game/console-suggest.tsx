'use client';

/**
 * Автодополнение консоли: живой список команд по префиксу (тот же реестр,
 * что строит help). Tab — дополнить выбранное, ↑/↓ — выбор (когда список
 * открыт; иначе — история команд), Esc — закрыть до следующего ввода.
 */
import type { ConsoleCommand } from '@/debug/console-types';
import { cn } from '@/lib/utils';

export const SUGGEST_LIMIT = 8;

/** команды, начинающиеся с ввода; хвостовой пробел = пошли аргументы → пусто */
export function matchCommands(commands: ConsoleCommand[], typed: string): ConsoleCommand[] {
  const q = typed.trimStart();
  if (q.length === 0 || /\s$/.test(typed)) return [];
  return commands
    .filter((c) => c.name.startsWith(q) && c.name !== q)
    .sort((a, b) => a.name.localeCompare(b.name))
    .slice(0, SUGGEST_LIMIT);
}

export function ConsoleSuggest({
  items,
  index,
  onHover,
  onPick,
}: {
  items: ConsoleCommand[];
  index: number;
  onHover(i: number): void;
  onPick(c: ConsoleCommand): void;
}) {
  if (items.length === 0) return null;
  return (
    <div
      role="listbox"
      aria-label="Подсказки команд"
      className="absolute bottom-full left-0 z-30 mb-1.5 w-full overflow-hidden rounded-lg border border-zinc-700 bg-zinc-900 shadow-xl shadow-black/50"
    >
      <div className="border-b border-zinc-800 px-3 py-1 font-mono text-[10px] text-zinc-600">
        Tab — дополнить · ↑/↓ — выбор · Esc — скрыть
      </div>
      <ul className="max-h-56 overflow-y-auto p-1">
        {items.map((c, i) => (
          <li key={c.name}>
            <button
              type="button"
              role="option"
              aria-selected={i === index}
              onMouseEnter={() => onHover(i)}
              onClick={() => onPick(c)}
              className={cn(
                'flex w-full items-baseline justify-between gap-3 rounded px-2 py-1 text-left font-mono text-[11px] transition-colors',
                i === index ? 'bg-amber-950/50 text-amber-300' : 'text-zinc-300 hover:bg-zinc-800/70',
              )}
            >
              <span className="shrink-0">{c.name}</span>
              <span className="min-w-0 truncate text-[10px] text-zinc-500">{c.description}</span>
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
