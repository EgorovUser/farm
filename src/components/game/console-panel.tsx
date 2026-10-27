'use client';

/**
 * ConsolePanel — командная строка + журнал (главный интерфейс фаз 0–5).
 * [Фаза 3 · дебаг-обновление] таймстемпы строк, фильтр уровня, копия
 * журнала, умный автоскролл (не отрывает от прочитанного), автодополнение
 * команд по реестру и быстрые чипы команд (console-suggest/console-chips).
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { Check, Copy, Eraser } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { useGameStore } from '@/stores/game-store';
import { getCommandRegistry } from '@/debug/console';
import type { ConsoleLine, LineKind } from '@/debug/console-types';
import { formatClock } from '@/shared/utils/format';
import { cn } from '@/lib/utils';
import { ConsoleChips } from './console-chips';
import { ConsoleSuggest, matchCommands } from './console-suggest';

const LINE_STYLES: Record<LineKind, string> = {
  cmd: 'text-amber-300',
  out: 'text-zinc-300',
  ok: 'text-emerald-400',
  err: 'text-red-400',
  warn: 'text-amber-400',
  info: 'text-zinc-500 italic',
  title: 'text-amber-200 font-bold tracking-wide',
};

type FilterMode = 'all' | 'problems' | 'commands';
const FILTERS: Array<{ id: FilterMode; label: string; title: string }> = [
  { id: 'all', label: 'все', title: 'журнал целиком' },
  { id: 'problems', label: 'ошибки', title: 'только err/warn' },
  { id: 'commands', label: 'команды', title: 'только ввод' },
];

function passes(l: ConsoleLine, mode: FilterMode): boolean {
  if (mode === 'all') return true;
  if (mode === 'problems') return l.kind === 'err' || l.kind === 'warn';
  return l.kind === 'cmd';
}

export function ConsolePanel() {
  const lines = useGameStore((s) => s.lines);
  const history = useGameStore((s) => s.history);
  const ready = useGameStore((s) => s.ready);
  const runCommand = useGameStore((s) => s.runCommand);
  const clearConsole = useGameStore((s) => s.clearConsole);
  const [value, setValue] = useState('');
  const [historyIndex, setHistoryIndex] = useState(-1);
  const [filter, setFilter] = useState<FilterMode>('all');
  const [copied, setCopied] = useState(false);
  const [suggestIdx, setSuggestIdx] = useState(-1);
  const [suggestClosed, setSuggestClosed] = useState(false);
  const [stick, setStick] = useState(true);
  const scrollRef = useRef<HTMLDivElement>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const commands = useMemo(() => getCommandRegistry().list(), []);
  const suggestItems = suggestClosed ? [] : matchCommands(commands, value);
  const visible = lines.filter((l) => passes(l, filter));

  // умный автоскролл: приклеены к низу — едем за новыми строками;
  // пользователь ушёл вверх читать — не дёргаем журнал
  useEffect(() => {
    const el = scrollRef.current;
    if (el && stick) el.scrollTop = el.scrollHeight;
  }, [lines, stick]);

  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [filter]);

  const submit = () => {
    if (!value.trim()) return;
    runCommand(value);
    setValue('');
    setHistoryIndex(-1);
    setSuggestIdx(-1);
    setSuggestClosed(false);
    setStick(true);
    inputRef.current?.focus();
  };

  const complete = () => {
    const pick = suggestIdx >= 0 ? suggestItems[suggestIdx] : suggestItems[0];
    if (pick) setValue(`${pick.name} `);
    setSuggestIdx(-1);
    inputRef.current?.focus();
  };

  const copyLog = async () => {
    const text = visible
      .map((l) => `[${formatClock(l.at)}] ${l.kind === 'cmd' ? '❯ ' : ''}${l.text}`)
      .join('\n');
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* clipboard недоступен — тихо игнорируем (кнопка останется прежней) */
    }
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      submit();
      return;
    }
    if (e.key === 'Tab') {
      e.preventDefault();
      if (suggestItems.length > 0) complete();
      return;
    }
    if (e.key === 'Escape') {
      if (suggestItems.length > 0) {
        e.preventDefault();
        setSuggestClosed(true);
        setSuggestIdx(-1);
      }
      return;
    }
    // ↑/↓: открытые подсказки — выбор; иначе — история команд
    const useSuggest = suggestItems.length > 0 && value.trim() !== '';
    if (e.key === 'ArrowUp') {
      e.preventDefault();
      if (useSuggest) {
        setSuggestIdx((prev) => (prev <= 0 ? suggestItems.length - 1 : prev - 1));
        return;
      }
      if (history.length === 0) return;
      const next = historyIndex < 0 ? history.length - 1 : Math.max(0, historyIndex - 1);
      setHistoryIndex(next);
      setValue(history[next] ?? '');
      return;
    }
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      if (useSuggest) {
        setSuggestIdx((prev) => {
          const next = prev + 1;
          return next >= suggestItems.length ? -1 : next;
        });
        return;
      }
      if (historyIndex < 0) return;
      const next = historyIndex + 1;
      if (next >= history.length) {
        setHistoryIndex(-1);
        setValue('');
      } else {
        setHistoryIndex(next);
        setValue(history[next] ?? '');
      }
    }
  };

  return (
    <div className="flex h-full min-h-0 flex-col rounded-xl border border-zinc-800/80 bg-zinc-950/70">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 border-b border-zinc-800/80 px-4 py-2.5">
        <span className="flex items-center gap-2">
          <span className="size-2 rounded-full bg-amber-500" aria-hidden />
          <span className="text-[11px] font-semibold tracking-[0.14em] text-zinc-400 uppercase">Консоль отладки</span>
        </span>
        <span className="font-mono text-[10px] text-zinc-600" title="строк в журнале (лимит 600)">
          {lines.length} стр.{filter !== 'all' ? ` · видимо ${visible.length}` : ''}
        </span>
        <div className="ml-auto flex items-center gap-1.5">
          <div className="flex overflow-hidden rounded-md border border-zinc-800" role="group" aria-label="Фильтр журнала">
            {FILTERS.map((f) => (
              <button
                key={f.id}
                type="button"
                title={f.title}
                aria-pressed={filter === f.id}
                onClick={() => setFilter(f.id)}
                className={cn(
                  'px-2 py-0.5 font-mono text-[10px] transition-colors',
                  filter === f.id ? 'bg-amber-950/60 text-amber-300' : 'text-zinc-500 hover:text-zinc-300',
                )}
              >
                {f.label}
              </button>
            ))}
          </div>
          <button
            type="button"
            onClick={copyLog}
            title="копировать видимый журнал (для отчётов)"
            aria-label="Копировать журнал"
            className="rounded-md border border-zinc-800 p-1 text-zinc-500 transition-colors hover:border-zinc-700 hover:text-zinc-300"
          >
            {copied ? <Check className="size-3.5 text-emerald-400" /> : <Copy className="size-3.5" />}
          </button>
          <button
            type="button"
            onClick={clearConsole}
            title="очистить консоль (clear)"
            aria-label="Очистить консоль"
            className="rounded-md border border-zinc-800 p-1 text-zinc-500 transition-colors hover:border-zinc-700 hover:text-zinc-300"
          >
            <Eraser className="size-3.5" />
          </button>
        </div>
      </div>

      <div
        ref={scrollRef}
        onScroll={(e) => {
          const el = e.currentTarget;
          setStick(el.scrollHeight - el.scrollTop - el.clientHeight < 48);
        }}
        className="min-h-0 flex-1 overflow-y-auto px-4 py-2 font-mono text-[12.5px] leading-relaxed [scrollbar-color:#3f3f46_transparent] [scrollbar-width:thin] [&::-webkit-scrollbar]:w-1.5 [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:bg-zinc-700"
      >
        {visible.map((line) => (
          <div
            key={line.id}
            className={cn(
              'whitespace-pre-wrap break-words',
              LINE_STYLES[line.kind],
              (line.kind === 'err' || line.kind === 'warn') && 'border-l-2 border-red-900/50 pl-2',
            )}
          >
            <span className="mr-2 text-[10px] text-zinc-700">{formatClock(line.at)}</span>
            {line.kind === 'cmd' ? (
              <span>
                <span className="mr-2 text-amber-500">❯</span>
                {line.text}
              </span>
            ) : (
              line.text || '\u00A0'
            )}
          </div>
        ))}
        {visible.length === 0 && lines.length > 0 && (
          <div className="py-2 text-zinc-600 italic">под фильтр ничего не попало</div>
        )}
        {!ready && (
          <div className="py-2 text-zinc-600 italic">ядро загружается… (контент-реестр валидируется)</div>
        )}
        <div ref={bottomRef} aria-hidden />
      </div>

      <div className="border-t border-zinc-800/80 px-3 pt-2">
        <ConsoleChips run={runCommand} />
      </div>

      <div className="relative flex items-center gap-2 p-3">
        <ConsoleSuggest
          items={suggestItems}
          index={suggestIdx}
          onHover={setSuggestIdx}
          onPick={(c) => {
            setValue(`${c.name} `);
            setSuggestIdx(-1);
            inputRef.current?.focus();
          }}
        />
        <span className="font-mono text-sm text-amber-500" aria-hidden>
          ❯
        </span>
        <Input
          ref={inputRef}
          value={value}
          onChange={(e) => {
            setValue(e.target.value);
            setSuggestIdx(-1);
            setSuggestClosed(false);
          }}
          onKeyDown={onKeyDown}
          placeholder={ready ? 'help — список команд · Tab — автодополнение' : 'загрузка…'}
          disabled={!ready}
          aria-label="Командная строка отладочной консоли"
          className="h-9 border-zinc-800 bg-zinc-900/60 font-mono text-[13px] text-zinc-200 placeholder:text-zinc-600 focus-visible:ring-amber-500/40"
        />
      </div>
    </div>
  );
}
