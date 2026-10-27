'use client';

/**
 * GameConsole — корневой компонент фазы 0: монтирует ядро, рисует консольный каркас.
 * Тёмная тёплая палитра «руда и корни»: цинк + янтарь. Десктоп-first, адаптив.
 */
import { useEffect } from 'react';
import { Mountain, Sprout } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { useGameStore } from '@/stores/game-store';
import { ConsolePanel } from './console-panel';
import { StatusPanel } from './status-panel';
import { StatePanel } from './state-panel';

export function GameConsole() {
  const init = useGameStore((s) => s.init);
  const ready = useGameStore((s) => s.ready);
  const now = useGameStore((s) => s.now);
  const bootMessage = useGameStore((s) => s.bootMessage);
  const saveInfo = useGameStore((s) => s.saveInfo);
  const modulesInfo = useGameStore((s) => s.modulesInfo);

  useEffect(() => {
    void init();
  }, [init]);

  return (
    <div className="dark flex min-h-screen flex-col bg-zinc-950 text-zinc-200 lg:h-screen lg:overflow-hidden">
      {/* Шапка */}
      <header className="sticky top-0 z-20 border-b border-zinc-800/80 bg-zinc-950/90 backdrop-blur">
        <div className="mx-auto flex max-w-[1600px] flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3">
          <div className="flex items-center gap-2.5">
            <span className="flex size-8 items-center justify-center rounded-lg border border-amber-800/50 bg-amber-950/40">
              <Sprout className="size-4 text-amber-400" />
            </span>
            <div>
              <h1 className="text-sm font-bold tracking-[0.18em] text-amber-100 uppercase">Корни и Руда</h1>
              <p className="font-mono text-[10px] text-zinc-500">
                cozy-экономическая RPG-инкубатор · ядро + {modulesInfo.length || '…'} модулей
              </p>
            </div>
          </div>

          {/* [M09] бейдж модулей растёт — MEL-C (AUDIT-M04): разрешён перенос,
              мобильный вьюпорт 390px больше не переполняется (whitespace-normal) */}
          <Badge
            variant="outline"
            className="max-w-full whitespace-normal border-amber-800/60 bg-amber-950/40 text-left leading-snug text-[10px] text-amber-400"
          >
            <Mountain className="mr-1 size-3 shrink-0" /> Фаза 3 · Игрок (M01) · Инвентарь (M02) · Модфордж (M03) · Магазин (M04) · Ферма (M05) · Загон (M06) · Крафт (M09) · Заточка (M10) · Квесты (M15)
          </Badge>

          <div className="ml-auto flex items-center gap-3 font-mono text-[11px] text-zinc-500">
            <span className={ready ? 'text-emerald-400' : 'text-amber-400'} aria-hidden>
              ●
            </span>
            <span>{ready ? `ядро активно · ${bootMessage ?? ''}` : 'загрузка ядра…'}</span>
            {/* [FIX-0.1 A] время рендерится только после монтирования (now > 0 наступает
                в useEffect-инициализации): SSR-формат new Date(0) в таймзоне сервера (UTC)
                давал hydration-mismatch с локальной зоной клиента. До готовности — плейсхолдер. */}
            <span className="hidden text-zinc-600 sm:inline">
              {now > 0 ? new Date(now).toLocaleTimeString('ru-RU') : '--:--:--'}
            </span>
          </div>
        </div>
      </header>

      {/* Основная сетка: на десктопе — IDE-раскладка (колонки скроллятся
          внутри, подвал всегда виден); на мобиле — естественная прокрутка
          страницы со стопкой панелей */}
      <main className="mx-auto grid w-full max-w-[1600px] flex-1 grid-cols-1 gap-4 p-4 lg:min-h-0 lg:grid-cols-[280px_minmax(0,1fr)_400px]">
        <aside className="order-2 min-h-0 lg:order-1 lg:overflow-y-auto lg:pr-1 [scrollbar-color:#3f3f46_transparent] [scrollbar-width:thin] [&::-webkit-scrollbar]:w-1.5 [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:bg-zinc-700">
          <StatusPanel />
        </aside>
        <section className="order-1 min-h-[520px] lg:order-2 lg:min-h-0">
          <ConsolePanel />
        </section>
        <aside className="order-3 min-h-0">
          <StatePanel />
        </aside>
      </main>

      {/* Липкий подвал */}
      <footer className="mt-auto border-t border-zinc-800/80 bg-zinc-950/95">
        <div className="mx-auto flex max-w-[1600px] flex-wrap items-center gap-x-5 gap-y-1 px-4 py-2.5">
          <span className="font-mono text-[11px] text-zinc-600">
            <span className="text-amber-500">help</span> команды ·{' '}
            <span className="text-amber-500">farm.state</span> ферма ·{' '}
            <span className="text-amber-500">pen.state</span> загон ·{' '}
            <span className="text-amber-500">quests list</span> квесты ·{' '}
            <span className="text-amber-500">selftest</span> приёмка
          </span>
          <span className="ml-auto font-mono text-[10px] text-zinc-700">
            ядро + модули Фазы 3: игрок · инвентарь · модфордж · магазин · ферма · загон · крафт · заточка · квесты · кошелёк (kernel) · сейв
            {saveInfo ? ` v${saveInfo.saveVersion} · срезы ${saveInfo.slices.length}` : ''}
          </span>
        </div>
      </footer>
    </div>
  );
}
