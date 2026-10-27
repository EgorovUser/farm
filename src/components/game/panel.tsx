'use client';

/**
 * Panel — общая обёртка отладочной панели-таблицы (фаза 0–5, 02-BUSES §12).
 * Тёмная тёплая палитра «руда и корни»: цинк + янтарь, без синего.
 */
import type { ReactNode } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { cn } from '@/lib/utils';

export function Panel({
  title,
  right,
  children,
  className,
  contentClassName,
}: {
  title: ReactNode;
  right?: ReactNode;
  children: ReactNode;
  className?: string;
  contentClassName?: string;
}) {
  return (
    <Card className={cn('gap-3 border-zinc-800/80 bg-zinc-900/50 py-4 shadow-none', className)}>
      <CardHeader className="shrink-0 px-4">
        <div className="flex items-center justify-between gap-2">
          <CardTitle className="flex items-center gap-2 text-[11px] font-semibold tracking-[0.14em] text-zinc-400 uppercase">
            {title}
          </CardTitle>
          {right}
        </div>
      </CardHeader>
      <CardContent className={cn('px-4', contentClassName)}>{children}</CardContent>
    </Card>
  );
}

export function EmptyHint({ children }: { children: ReactNode }) {
  return <p className="py-3 text-center text-xs text-zinc-600 italic">{children}</p>;
}
