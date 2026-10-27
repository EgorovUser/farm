'use client';

/**
 * StatePanel — правая колонка: таблицы состояния ядра по вкладкам.
 * «Уродливые отладочные панели» (05-ROADMAP): таблицы без красоты, но читаемо.
 * [Фаза 3 · дебаг-обновление] вкладок стало 13 — контент расщеплён по
 * components/game/state/* (01 §6); появились живые витрины модулей:
 * Ферма (M05) · Загон (M06) · Квесты (M15).
 */
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Panel } from './panel';
import { BuffsTab, CountersTab, PityTab, RollsTab, SkillsTab, StatsTab } from './state/stats-tabs';
import { InventoryTab } from './state/inventory-tab';
import { FarmTab } from './state/farm-tab';
import { PenTab } from './state/pen-tab';
import { QuestsTab } from './state/quests-tab';
import { EventsTab, TasksTab } from './state/events-tab';
import { SaveTab } from './state/save-tab';

const TABS: Array<{ value: string; label: string }> = [
  { value: 'stats', label: 'Статы' },
  { value: 'skills', label: 'Навыки' },
  { value: 'buffs', label: 'Бафы' },
  { value: 'rolls', label: 'Роллы' },
  { value: 'pity', label: 'Pity' },
  { value: 'counters', label: 'Счёт' },
  { value: 'stash', label: 'Инвентарь' },
  { value: 'farm', label: 'Ферма' },
  { value: 'pen', label: 'Загон' },
  { value: 'quests', label: 'Квесты' },
  { value: 'events', label: 'Лента' },
  { value: 'tasks', label: 'Задачи' },
  { value: 'save', label: 'Сейв' },
];

// h-7 flex-none перекрывают h-[calc(100%-1px)] flex-1 базового триггера —
// при переносе строк те растягиваются на всю высину списка
const TRIGGER_CLASS =
  'h-7 flex-none px-2.5 text-[11px] data-[state=active]:bg-amber-950 data-[state=active]:text-amber-300';

export function StatePanel() {
  return (
    <Panel
      title="Состояние ядра"
      right={<Badge variant="outline" className="border-zinc-700 text-[10px] text-zinc-500">отладочные таблицы</Badge>}
      className="min-h-0 lg:h-full"
      contentClassName="flex min-h-0 flex-1 flex-col px-0"
    >
      <Tabs defaultValue="stats" className="flex min-h-0 flex-1 flex-col gap-3">
        {/* перенос строк: 13 вкладок видны целиком (прецедент MEL-C — бейдж модулей) */}
        <TabsList className="h-auto w-full flex-wrap justify-start gap-1 bg-zinc-900/80 p-1">
          {TABS.map((t) => (
            <TabsTrigger key={t.value} value={t.value} className={TRIGGER_CLASS}>
              {t.label}
            </TabsTrigger>
          ))}
        </TabsList>

        <ScrollArea className="h-[420px] px-4 lg:h-auto lg:min-h-0 lg:flex-1">
          <TabsContent value="stats" className="mt-0">
            <StatsTab />
          </TabsContent>
          <TabsContent value="skills" className="mt-0">
            <SkillsTab />
          </TabsContent>
          <TabsContent value="buffs" className="mt-0">
            <BuffsTab />
          </TabsContent>
          <TabsContent value="rolls" className="mt-0">
            <RollsTab />
          </TabsContent>
          <TabsContent value="pity" className="mt-0">
            <PityTab />
          </TabsContent>
          <TabsContent value="counters" className="mt-0">
            <CountersTab />
          </TabsContent>
          <TabsContent value="stash" className="mt-0">
            <InventoryTab />
          </TabsContent>
          <TabsContent value="farm" className="mt-0">
            <FarmTab />
          </TabsContent>
          <TabsContent value="pen" className="mt-0">
            <PenTab />
          </TabsContent>
          <TabsContent value="quests" className="mt-0">
            <QuestsTab />
          </TabsContent>
          <TabsContent value="events" className="mt-0">
            <EventsTab />
          </TabsContent>
          <TabsContent value="tasks" className="mt-0">
            <TasksTab />
          </TabsContent>
          <TabsContent value="save" className="mt-0">
            <SaveTab />
          </TabsContent>
        </ScrollArea>
      </Tabs>
    </Panel>
  );
}
