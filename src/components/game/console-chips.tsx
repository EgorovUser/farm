'use client';

/**
 * Быстрые команды консоли: чипы частых + меню «⋯» с группами по модулям
 * (имена — точные имена реестра команд; выполнение — через runCommand стора).
 */
import { ChevronDown } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

const QUICK: Array<{ label: string; cmd: string }> = [
  { label: 'selftest', cmd: 'selftest' },
  { label: 'modules', cmd: 'modules' },
  { label: 'farm.state', cmd: 'farm.state' },
  { label: 'pen.state', cmd: 'pen.state' },
  { label: 'quests list', cmd: 'quests list' },
  { label: 'events', cmd: 'events' },
  { label: 'save now', cmd: 'save now' },
];

const GROUPS: Array<{ label: string; items: Array<{ label: string; cmd: string }> }> = [
  {
    label: 'Ферма (M05)',
    items: [
      { label: 'каталог культур', cmd: 'farm.crops' },
      { label: 'улучшения фермы', cmd: 'farm.upgrades' },
      { label: 'цикл: вспахать #0', cmd: 'farm.plow 0' },
      { label: 'посадить пшеницу #0', cmd: 'farm.plant wheat 0' },
      { label: 'полить #0', cmd: 'farm.water 0' },
      { label: 'собрать #0', cmd: 'farm.harvest 0' },
    ],
  },
  {
    label: 'Загон (M06)',
    items: [
      { label: 'животные (витрина)', cmd: 'pen.animals' },
      { label: 'улучшения загона', cmd: 'pen.upgrades' },
      { label: 'купить курицу', cmd: 'pen.buy chicken' },
      { label: 'накормить #0', cmd: 'pen.feed 0' },
      { label: 'собрать продукцию', cmd: 'pen.collect' },
      { label: 'навоз (витрина)', cmd: 'pen.manure' },
    ],
  },
  {
    label: 'Квесты (M15)',
    items: [
      { label: 'квесты недели', cmd: 'quests list weekly' },
      { label: 'цепочки', cmd: 'quests list chains' },
      { label: 'ачивки', cmd: 'quests list ach' },
      { label: 'переброс дня', cmd: 'quests roll' },
      { label: 'флаги', cmd: 'flags list' },
    ],
  },
  {
    label: 'Ядро',
    items: [
      { label: 'каталог статов', cmd: 'stats.list' },
      { label: 'трассировка энергии', cmd: 'resolve player.energy.max' },
      { label: 'журнал роллов', cmd: 'roll.log' },
      { label: 'кошелёк', cmd: 'wallet' },
      { label: 'счётчики', cmd: 'counters' },
      { label: 'исполнители', cmd: 'tasks' },
      { label: 'экскурсия demo', cmd: 'demo' },
    ],
  },
  {
    label: 'Время и сейв',
    items: [
      { label: '+1 час', cmd: 'time +1h' },
      { label: '+1 день', cmd: 'time +1d' },
      { label: 'оффлайн-досчёт 8ч', cmd: 'catchup simulate 8' },
      { label: 'инфо сейва', cmd: 'save info' },
      { label: 'экспорт JSON', cmd: 'save export' },
    ],
  },
];

export function ConsoleChips({ run }: { run(cmd: string): void }) {
  return (
    <div className="flex flex-wrap items-center gap-1">
      {QUICK.map((q) => (
        <button
          key={q.cmd}
          type="button"
          onClick={() => run(q.cmd)}
          title={`выполнить: ${q.cmd}`}
          className="rounded border border-zinc-800 bg-zinc-900/60 px-2 py-0.5 font-mono text-[10px] text-zinc-400 transition-colors hover:border-amber-800/60 hover:bg-amber-950/30 hover:text-amber-300"
        >
          {q.label}
        </button>
      ))}
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant="outline"
            size="sm"
            className="h-6 border-zinc-800 bg-zinc-900/60 px-2 font-mono text-[10px] text-zinc-400 hover:bg-zinc-800 hover:text-amber-300"
          >
            ещё <ChevronDown className="size-3" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="max-h-[420px] w-64 overflow-y-auto border-zinc-700 bg-zinc-900">
          {GROUPS.map((g, gi) => (
            <div key={g.label}>
              {gi > 0 && <DropdownMenuSeparator className="bg-zinc-800" />}
              <DropdownMenuLabel className="font-mono text-[10px] tracking-wider text-amber-500/80 uppercase">{g.label}</DropdownMenuLabel>
              {g.items.map((it) => (
                <DropdownMenuItem
                  key={it.cmd}
                  onClick={() => run(it.cmd)}
                  className="flex cursor-pointer items-baseline justify-between gap-2 font-mono text-[11px] text-zinc-300 focus:bg-amber-950/40 focus:text-amber-200"
                >
                  <span>{it.label}</span>
                  <span className="shrink-0 text-[10px] text-zinc-600">{it.cmd}</span>
                </DropdownMenuItem>
              ))}
            </div>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}
