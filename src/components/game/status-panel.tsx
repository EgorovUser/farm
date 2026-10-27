'use client';

/**
 * StatusPanel — левая колонка: время, кошелёк, ключевые статы игрока.
 */
import { Coins, Heart, Layers, Sparkles, Timer, Zap } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { useGameStore } from '@/stores/game-store';
import { formatClock, formatDateTime } from '@/shared/utils/format';
import { CURRENCY_LABELS_RU } from '@/content/locale/ru';
import { Panel, EmptyHint } from './panel';

function statRow(icon: React.ReactNode, stat: string, final: number, max: number | null, hint: string) {
  const pct = max !== null && max > 0 ? Math.min(100, (final / max) * 100) : null;
  return (
    <div className="space-y-1" title={hint}>
      <div className="flex items-baseline justify-between gap-2">
        <span className="flex items-center gap-1.5 text-xs text-zinc-400">
          {icon}
          {stat}
        </span>
        <span className="font-mono text-sm text-zinc-100">
          {final}
          {max !== null ? <span className="text-zinc-600"> / {max}</span> : null}
        </span>
      </div>
      {pct !== null && (
        <div className="h-1 overflow-hidden rounded bg-zinc-800">
          <div className="h-full rounded bg-amber-500/80" style={{ width: `${pct}%` }} />
        </div>
      )}
    </div>
  );
}

export function StatusPanel() {
  const now = useGameStore((s) => s.now);
  const wallet = useGameStore((s) => s.wallet);
  const stats = useGameStore((s) => s.stats);
  const saveInfo = useGameStore((s) => s.saveInfo);
  const player = useGameStore((s) => s.player);
  const modulesInfo = useGameStore((s) => s.modulesInfo);

  const stat = (id: string) => stats.find((s) => s.stat === id);
  const luck = stat('player.luck');

  return (
    <div className="flex min-h-0 flex-col gap-4">
      <Panel
        title={
          <>
            <Timer className="size-3.5 text-amber-500" /> Время
          </>
        }
        right={
          <Badge variant="outline" className="border-amber-800/60 bg-amber-950/40 text-[10px] text-amber-400">
            тик = 1 игровая минута
          </Badge>
        }
      >
        {/* [FIX-0.1 A] часы — только после монтирования (now > 0 ставится в useEffect):
            до этого плейсхолдер, иначе SSR(UTC) и клиент(локальная зона) разошлись бы. */}
        <p className="font-mono text-2xl text-amber-200">{now > 0 ? formatClock(now) : '--:--:--'}</p>
        <p className="mt-1 text-[11px] text-zinc-500">{now > 0 ? formatDateTime(now) : 'время появится после загрузки ядра'}</p>
      </Panel>

      <Panel
        title={
          <>
            <Coins className="size-3.5 text-amber-500" /> Кошелёк
          </>
        }
        contentClassName="px-0"
      >
        {wallet.length === 0 ? (
          <EmptyHint>пусто — give gold 100</EmptyHint>
        ) : (
          <ScrollArea className="max-h-44">
            <ul className="px-4">
              {wallet.map((w) => (
                <li key={w.id} className="flex items-baseline justify-between border-b border-zinc-800/60 py-1.5 last:border-0">
                  <span className="text-xs text-zinc-400">
                    {CURRENCY_LABELS_RU[w.id] ?? w.id}
                    <span className="ml-1.5 text-[10px] text-zinc-600">{w.id}</span>
                  </span>
                  <span className="font-mono text-sm text-amber-200">{w.qty}</span>
                </li>
              ))}
            </ul>
          </ScrollArea>
        )}
      </Panel>

      <Panel
        title={
          <>
            <Sparkles className="size-3.5 text-amber-500" /> Игрок (M01)
          </>
        }
        right={
          <Badge variant="outline" className="border-amber-800/60 bg-amber-950/40 text-[10px] text-amber-400">
            {player ? `ур. ${player.progress.level}` : '…'}
          </Badge>
        }
      >
        {player ? (
          <div className="space-y-3">
            {statRow(
              <Zap className="size-3.5 text-amber-500" />,
              'энергия',
              player.energy.current,
              player.energy.max,
              `реген ${player.energy.regenPerMinute.toFixed(2)}/мин · списания через player.spendEnergy`,
            )}
            {statRow(
              <Heart className="size-3.5 text-red-400" />,
              'здоровье',
              player.hp.current,
              player.hp.max,
              player.hp.alive ? 'реген 1/5 мин вне шахты' : 'HP = 0 — событие смерти отправлено (M13 решит)',
            )}
            {statRow(
              <Sparkles className="size-3.5 text-emerald-400" />,
              `опыт (ур. ${player.progress.level})`,
              player.progress.xp,
              player.progress.xpNeed,
              `кривая 100 × 1.15^L · кап уровня ${player.progress.maxLevel}`,
            )}
            {luck && statRow(<Sparkles className="size-3.5 text-emerald-400" />, 'удача', luck.final, null, 'player.luck — множитель весов в RngBus')}
            <p className="border-t border-zinc-800/60 pt-2 text-[10px] leading-snug text-zinc-600">
              Навыки: {player.skills.filter((s) => s.level > 0).length} из {player.skills.length} качаются — таблица во вкладке «Навыки» справа.
            </p>
          </div>
        ) : (
          <EmptyHint>модуль player не активен</EmptyHint>
        )}
      </Panel>

      {modulesInfo.length > 0 && (
        <Panel
          title={
            <>
              <Layers className="size-3.5 text-amber-500" /> Модули
            </>
          }
          right={
            <Badge variant="outline" className="border-amber-800/60 bg-amber-950/40 text-[10px] text-amber-400">
              {modulesInfo.filter((m) => m.active).length} активны
            </Badge>
          }
          contentClassName="px-0"
        >
          <ScrollArea className="max-h-44">
            <ul className="px-4">
              {modulesInfo.map((m) => (
                <li key={m.id} className="flex items-baseline justify-between gap-2 border-b border-zinc-800/60 py-1 last:border-0">
                  <span className="font-mono text-[11px] text-zinc-300">
                    {m.id}
                    <span className="ml-1.5 text-[10px] text-zinc-600">срез: {m.stateKey}</span>
                  </span>
                  <span className="shrink-0 font-mono text-[10px] text-amber-400/80">v{m.version}</span>
                </li>
              ))}
            </ul>
          </ScrollArea>
        </Panel>
      )}

      {saveInfo && (
        <Panel
          title={
            <>
              <Coins className="size-3.5 text-amber-500" /> Сейв
            </>
          }
        >
          <div className="space-y-1 font-mono text-[11px] text-zinc-500">
            <div className="flex justify-between">
              <span>формат</span>
              <span className="text-zinc-300">v{saveInfo.saveVersion}</span>
            </div>
            <div className="flex justify-between">
              <span>хранилище</span>
              <span className="text-zinc-300">{saveInfo.storageKind}</span>
            </div>
            <div className="flex justify-between gap-2">
              <span>saveId</span>
              <span className="truncate text-zinc-300">{saveInfo.saveId.slice(0, 13)}…</span>
            </div>
            <div className="flex justify-between">
              <span>срезы</span>
              <span className="text-zinc-300">{saveInfo.slices.length}</span>
            </div>
          </div>
        </Panel>
      )}
    </div>
  );
}
