'use client';

/**
 * Лента событий EventBus + исполнители TaskRegistry. Перенос из state-panel.tsx
 * с обновлёнными подсказками Фазы 3 (исполнители фермы/загона уже живут).
 */
import { Button } from '@/components/ui/button';
import { useGameStore } from '@/stores/game-store';
import { formatClock } from '@/shared/utils/format';
import { EmptyHint } from '../panel';
import { CmdHint, Row } from './shared';

export function EventsTab() {
  const eventFeed = useGameStore((s) => s.eventFeed);
  const showTicks = useGameStore((s) => s.showTicks);
  const setShowTicks = useGameStore((s) => s.setShowTicks);
  return (
    <div>
      <div className="mb-2 flex items-center justify-between gap-2">
        <CmdHint>подписчики шины получают все события — фильтр тиков только отображения</CmdHint>
        <Button
          size="sm"
          variant="outline"
          className="h-7 shrink-0 border-zinc-700 bg-transparent px-2 text-[10px] hover:bg-zinc-800"
          onClick={() => setShowTicks(!showTicks)}
        >
          тики: {showTicks ? 'видны' : 'скрыты'}
        </Button>
      </div>
      {eventFeed.length === 0 ? (
        <EmptyHint>лента событий пуста</EmptyHint>
      ) : (
        eventFeed.map((e, i) => (
          <div key={`${e.at}-${i}`} className="border-b border-zinc-800/60 py-1.5 last:border-0">
            <div className="flex items-baseline gap-2">
              <span className="shrink-0 font-mono text-[10px] text-zinc-600">{formatClock(e.at)}</span>
              <span className="shrink-0 font-mono text-[11px] text-amber-300">{e.name}</span>
            </div>
            <p className="truncate font-mono text-[10px] text-zinc-500" title={e.payload}>
              {e.payload}
            </p>
          </div>
        ))
      )}
    </div>
  );
}

export function TasksTab() {
  const tasks = useGameStore((s) => s.tasks);
  return (
    <div>
      <CmdHint>
        исполнители TaskRegistry (02 §10): регистрируются модулями; farm.sprinkler и pen.autofeeder — покупками улучшений
      </CmdHint>
      {tasks.length === 0 ? (
        <EmptyHint>исполнителей нет — купите спринклеры (farm.upgrade) или автокормушки (pen.upgrade)</EmptyHint>
      ) : (
        tasks.map((t) => <Row key={t.id} label={t.id} value={t.label ?? ''} />)
      )}
    </div>
  );
}
