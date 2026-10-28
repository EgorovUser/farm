/**
 * village-helper (G8; манифест taskExecutors) — исполнитель помощи: раз в
 * день 1 случайный житель БЕСПЛАТНО выполняет задачу СУЩЕСТВУЮЩЕГО типа
 * TaskRegistry (карточка §3: вспашет 4 грядки / накормит озеро / соберёт
 * урожай / поможет в бою — контракт M16.2). НОЛЬ импортов игровых модулей
 * (линтер изоляции rg ×3): вызов — ctx.tasks.runTask, целеподбор — витрины
 * publicApi через deps.views (паттерн WorkersDirector M11.2), энергия —
 * нейтральная обёртка withVillagerEnergy (прецедент withWorkerEnergy).
 *
 * Селектор задач: только ЗАРЕГИСТРИРОВАННЫЕ типы (tasks.has, П5) и только
 * с ЦЕЛЬЮ; пусто → честный отказ БЕЗ расхода дневного слота. Повтор в тот
 * же день — честный отказ (helpLastDay, карточка §3 «раз в день»).
 */
import type { Result } from '@/shared/types/result';
import { err, ok } from '@/shared/types/result';
import type { VillageHelpTable } from '@/content/village/types';
import type { VillageViews } from './deps';
import type { VillagerDef } from '@/content/village/types';

export interface HelpDeps {
  views: VillageViews;
  hasTask(type: string): boolean;
  runTask(type: string, params: Record<string, unknown>, workerId: string): Result<unknown>;
  roll01(stream: string): number;
  withVillagerEnergy(run: () => Result<unknown>): Result<unknown>;
}

export interface HelpReceipt {
  villagerId: string;
  villagerName: string;
  profession: string;
  taskType: string;
  taskLabel: string;
  done: number;
  attempts: number;
  note: string;
}

/** целеподбор задачи (null — подходящей цели нет; паттерн director.ts M11.2) */
function targetParamsOf(taskType: string, views: VillageViews): Record<string, unknown> | null {
  const m = /^([a-z]+)\.([a-zA-Z.]+)$/.exec(taskType);
  const ns = m === null ? '' : m[1]!;
  if (ns === 'farm') {
    const tab = views.farmTabs().find((t) => {
      switch (taskType) {
        case 'farm.plow':
          return t.tiles.some((tile) => tile.state === 'empty');
        case 'farm.water':
          return t.tiles.some((tile) => tile.state === 'growing' && !tile.wet);
        case 'farm.weed':
          return t.tiles.some((tile) => tile.weeds >= 1);
        case 'farm.harvest':
          return t.tiles.some((tile) => tile.state === 'ready');
        default:
          return false;
      }
    });
    if (tab === undefined) return null;
    const tile = tab.tiles.find((t) => {
      switch (taskType) {
        case 'farm.plow':
          return t.state === 'empty';
        case 'farm.water':
          return t.state === 'growing' && !t.wet;
        case 'farm.weed':
          return t.weeds >= 1;
        case 'farm.harvest':
          return t.state === 'ready';
        default:
          return false;
      }
    });
    return tile !== undefined ? { tileIdx: tile.index, tab: tab.id } : null;
  }
  if (ns === 'lake') {
    // цель: голодные рыбы (feed) или грязная вода (clean); активное озеро —
    // контракт lakeIdx (прецедент WorkersDirector M11.2)
    const lake = views.lakes().find((l) => l.active);
    if (lake === undefined) return null;
    if (taskType === 'lake.feed') return lake.hungryCount > 0 ? { lakeIdx: views.lakes().indexOf(lake) } : null;
    if (taskType === 'lake.clean') return lake.cleanliness < 100 ? { lakeIdx: views.lakes().indexOf(lake) } : null;
    return null;
  }
  if (ns === 'pen') {
    const pen = views.pens()[0];
    if (pen === undefined || pen.animals.length === 0) return null;
    switch (taskType) {
      case 'pen.collect':
        return { species: 'all', pen: 1 };
      case 'pen.feed': {
        const idx = pen.animals.findIndex((a) => !a.fedToday);
        return idx >= 0 ? { idx, pen: 1 } : null;
      }
      case 'pen.clean': {
        const idx = pen.animals.findIndex((a) => a.cleanliness < 100);
        return idx >= 0 ? { idx, pen: 1 } : null;
      }
      default:
        return null;
    }
  }
  // mine.assist (контракт M16.2) и неизвестные — рядовой случай (П5)
  return {};
}

/**
 * Одна помощь дня: выбор жителя (стрим 'village:help:villager') и задачи
 * ('village:help:task') из ДОСТУПНЫХ (зарегистрирован + есть цель), батч
 * повторов с перевыбором цели, энергия игрока НЕ тратится.
 */
export function runVillageHelp(
  liveVillagers: VillagerDef[],
  help: VillageHelpTable,
  deps: HelpDeps,
): Result<HelpReceipt> {
  if (liveVillagers.length === 0) {
    return err('жителей в деревне нет — помощь невозможна (village state)');
  }
  // кандидатные задачи: зарегистрированные ИЛИ контракт-слоты с живым исполнителем
  const available = help.tasks.filter((t) => deps.hasTask(t.type));
  const withTarget = available.filter((t) => targetParamsOf(t.type, deps.views) !== null);
  if (withTarget.length === 0) {
    return err(
      available.length === 0
        ? 'в реестре задач нет исполнителей для помощи (tasks — витрина)'
        : 'нечего делать: подходящих целей нет — помощь не требуется (слот дня НЕ потрачен)',
    );
  }
  const vIdx = Math.min(liveVillagers.length - 1, Math.floor(deps.roll01('village:help:villager') * liveVillagers.length));
  const villager = liveVillagers[vIdx]!;
  const tIdx = Math.min(withTarget.length - 1, Math.floor(deps.roll01('village:help:task') * withTarget.length));
  const task = withTarget[tIdx]!;
  let done = 0;
  let attempts = 0;
  for (let i = 0; i < task.repeats; i++) {
    const params = targetParamsOf(task.type, deps.views);
    if (params === null) break; // цели кончились
    attempts += 1;
    const r = deps.withVillagerEnergy(() =>
      deps.runTask(task.type, params, `villager:${villager.id}`),
    );
    if (r.ok) done += 1;
  }
  if (done === 0) {
    return err(
      `${villager.name} (${villager.profession}) взялся «${task.label}», но не смог — исполнение отклонено (слот дня НЕ потрачен)`,
    );
  }
  return ok({
    villagerId: villager.id,
    villagerName: villager.name,
    profession: villager.profession,
    taskType: task.type,
    taskLabel: task.label,
    done,
    attempts,
    note: `${villager.name} (${villager.profession}) — «${task.label}»: выполнено ${done} из ${attempts} попыток (энергия игрока не потрачена; исполнитель — TaskRegistry ${task.type})`,
  });
}
