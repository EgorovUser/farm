'use client';

/**
 * Общие элементы отладочных таблиц (правая колонка): строки, секции,
 * мини-бары и статус-пилюли. Палитра «руда и корни»: цинк + янтарь.
 */
import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

export function Row({ label, value, hint, tone }: { label: ReactNode; value: ReactNode; hint?: string; tone?: string }) {
  return (
    <div className="flex items-baseline justify-between gap-2 border-b border-zinc-800/60 py-1.5 last:border-0" title={hint}>
      <span className="min-w-0 truncate font-mono text-[11px] text-zinc-400">{label}</span>
      <span className={cn('shrink-0 font-mono text-[11px] text-zinc-200', tone)}>{value}</span>
    </div>
  );
}

/** Заголовок секции внутри вкладки (после пилюль-вкладок модуля) */
export function Section({ title, right }: { title: ReactNode; right?: ReactNode }) {
  return (
    <div className="mt-3 mb-1.5 flex items-baseline justify-between gap-2 first:mt-0">
      <h4 className="text-[10px] font-semibold tracking-[0.14em] text-zinc-500 uppercase">{title}</h4>
      {right}
    </div>
  );
}

type BarTone = 'amber' | 'emerald' | 'red' | 'zinc';
const BAR_TONES: Record<BarTone, string> = {
  amber: 'bg-amber-500/70',
  emerald: 'bg-emerald-500/70',
  red: 'bg-red-500/70',
  zinc: 'bg-zinc-500/70',
};

/** Мини-бар прогресса: 0..100 */
export function Bar({ pct, tone = 'amber', label }: { pct: number; tone?: BarTone; label?: string }) {
  const clamped = Math.max(0, Math.min(100, pct));
  return (
    <div className="flex items-center gap-2">
      <div className="h-1 flex-1 overflow-hidden rounded bg-zinc-800" role="progressbar" aria-valuenow={Math.round(clamped)} aria-valuemin={0} aria-valuemax={100} aria-label={label}>
        <div className={cn('h-full rounded transition-[width]', BAR_TONES[tone])} style={{ width: `${clamped}%` }} />
      </div>
      {label && <span className="shrink-0 font-mono text-[10px] text-zinc-500">{label}</span>}
    </div>
  );
}

type PillTone = 'ok' | 'warn' | 'err' | 'dim' | 'info';
const PILL_TONES: Record<PillTone, string> = {
  ok: 'border-emerald-800/60 bg-emerald-950/40 text-emerald-400',
  warn: 'border-amber-800/60 bg-amber-950/40 text-amber-400',
  err: 'border-red-900/60 bg-red-950/40 text-red-400',
  dim: 'border-zinc-800 bg-zinc-900/60 text-zinc-500',
  info: 'border-zinc-700 bg-zinc-900/60 text-zinc-300',
};

/** Статус-пилюля (маленький бейдж состояния) */
export function Pill({ tone = 'info', children, title }: { tone?: PillTone; children: ReactNode; title?: string }) {
  return (
    <span title={title} className={cn('inline-flex items-center gap-1 rounded border px-1.5 py-px font-mono text-[10px] leading-4 whitespace-nowrap', PILL_TONES[tone])}>
      {children}
    </span>
  );
}

/** Подсказка-действие: какая команда консоли построит этот блок */
export function CmdHint({ children }: { children: ReactNode }) {
  return <p className="mb-2 text-[10px] leading-snug text-zinc-600">{children}</p>;
}
