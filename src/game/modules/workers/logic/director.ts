/**
 * WorkersDirector (M11.2, бриф F10; карточка M11 §3 + 01-CORE §8) —
 * ЧИСТАЯ логика распределения: работник → задачи назначенной системы
 * (taskBySystem ДАННЫМИ) → план вызовов (taskId, params) по порядку
 * приоритета. Вызов исполнителя (runTask, 02 §10) делает обёртка module.ts:
 * импорт игровых модулей — 0, чтение реестра задач через ctx.tasks.
 *
 * [DECISION Task 54 · АДРЕСАЦИЯ КОПИЙ] параметр объекта в контексте
 * вызова: farm — вкладка объекта tab: field|field2; pen — параметр
 * pen: 1|2 (M06.2); lake — активное озеро (M08.2): работник действует
 * ТОЛЬКО на СВОЁ озеро и ТОЛЬКО когда оно активно (lakeIdx в params —
 * контракт для будущих исполнителей; НЕактивное — пункт плана молча
 * пропускается, активное озеро НЕ переключается; см. [QUESTION] M11.2
 * worklog: канонизация — расширение lake-исполнителей или switch-обёртка).
 *
 * ЦЕЛЕПОДБОР (farm/pen): первая подходящая цель из витрин живых систем
 * ([DECISION-архитектура] M11.1 — чтение publicApi через views; пусто →
 * пункт плана пропускается); lake.treat/harvest цели находят сами
 * исполнители (firstSickSlot/firstHarvestSlot M08.2); lake.feed/clean —
 * беспараметрические. farm.plant НЕ входит в приоритет: выбор
 * культуры/семян — за игроком (декларация).
 */
import type { WorkersTable, WorkerObjectId } from '@/content/workers/table';
import type { WorkerInstance } from '../state';
import type { SystemViews } from '../hire';

/** пункт плана директора: исполнитель + контекст вызова */
export interface DirectorStep {
  taskId: string;
  params: Record<string, unknown>;
}

/** вкладка фермы объекта (field|field2 — адресация по id вкладки) */
function farmTabOf(object: WorkerObjectId): string {
  return object === 'field2' ? 'field2' : 'field';
}

/** номер загона объекта (1-based — канон pen: 1|2) */
function penOf(object: WorkerObjectId): 1 | 2 {
  return object === 'animals2' ? 2 : 1;
}

/** индекс озера объекта (0-based — контракт lakeIdx в params) */
export function lakeIdxOf(object: WorkerObjectId): number {
  return object === 'lake2' ? 1 : 0;
}

/**
 * План тика работника: задачи системы по приоритету данных, у каждой —
 * целеподбор из витрин; пустой план = «нечего делать» (вызов не происходит,
 * тик пропускается без actionDone). Перебор до первого ok — обёртка.
 */
export function directorPlan(w: WorkerInstance, table: WorkersTable, views: SystemViews): DirectorStep[] {
  const system = systemOfObject(w.object);
  const order = table.taskBySystem[system];
  const steps: DirectorStep[] = [];
  for (const taskId of order) {
    const params = targetParamsOf(w, taskId, views);
    if (params !== null) steps.push({ taskId, params });
  }
  return steps;
}

/** тег системы объекта (провайдер worker.traits — фильтр назначения F14) */
export function systemOfObject(object: WorkerObjectId): 'farm' | 'lake' | 'pen' {
  switch (object) {
    case 'field':
    case 'field2':
      return 'farm';
    case 'lake':
    case 'lake2':
      return 'lake';
    case 'pen':
    case 'animals2':
      return 'pen';
  }
}

/** целеподбор задачи: null — подходящей цели нет (пункт пропускается) */
function targetParamsOf(
  w: WorkerInstance,
  taskId: string,
  views: SystemViews,
): Record<string, unknown> | null {
  switch (taskId) {
    // --- ферма: вкладка объекта + первый подходящий тайл из витрины
    case 'farm.water': {
      const tab = views.farmTabs().find((t) => t.id === farmTabOf(w.object));
      const tile = tab?.tiles.find((t) => t.state === 'growing' && !t.wet);
      return tile !== undefined && tab !== undefined ? { tileIdx: tile.index, tab: tab.id } : null;
    }
    case 'farm.weed': {
      const tab = views.farmTabs().find((t) => t.id === farmTabOf(w.object));
      const tile = tab?.tiles.find((t) => t.weeds >= 1);
      return tile !== undefined && tab !== undefined ? { tileIdx: tile.index, tab: tab.id } : null;
    }
    case 'farm.harvest': {
      const tab = views.farmTabs().find((t) => t.id === farmTabOf(w.object));
      const tile = tab?.tiles.find((t) => t.state === 'ready');
      return tile !== undefined && tab !== undefined ? { tileIdx: tile.index, tab: tab.id } : null;
    }
    case 'farm.plow': {
      const tab = views.farmTabs().find((t) => t.id === farmTabOf(w.object));
      const tile = tab?.tiles.find((t) => t.state === 'empty');
      return tile !== undefined && tab !== undefined ? { tileIdx: tile.index, tab: tab.id } : null;
    }
    // --- озеро: ТОЛЬКО СВОЁ АКТИВНОЕ (lakeIdx — контракт; без switch)
    case 'lake.clean':
    case 'lake.feed':
    case 'lake.treat':
    case 'lake.harvest': {
      const lakeIdx = lakeIdxOf(w.object);
      const lake = views.lakes()[lakeIdx];
      return lake !== undefined && lake.active ? { lakeIdx } : null;
    }
    // --- загон: pen параметр + первый подходящий животный из витрины
    case 'pen.collect':
      return { species: 'all', pen: penOf(w.object) };
    case 'pen.feed': {
      const pen = penOf(w.object);
      const list = views.pens()[pen - 1]?.animals ?? [];
      const idx = list.findIndex((a) => !a.fedToday);
      return idx >= 0 ? { idx, pen } : null;
    }
    case 'pen.clean': {
      const pen = penOf(w.object);
      const list = views.pens()[pen - 1]?.animals ?? [];
      const idx = list.findIndex((a) => a.cleanliness < 100);
      return idx >= 0 ? { idx, pen } : null;
    }
    case 'pen.pet': {
      const pen = penOf(w.object);
      const list = views.pens()[pen - 1]?.animals ?? [];
      const idx = list.findIndex((a) => !a.pettedToday);
      return idx >= 0 ? { idx, pen } : null;
    }
    default:
      return null; // неизвестная задача — рядовой случай (П5): пропустить
  }
}
