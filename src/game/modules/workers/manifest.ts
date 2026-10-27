/**
 * Манифест M11 (01-CORE §9): единственное место точек интеграции.
 *
 * [M11.2 · F16 · ОДИН bump 1.0.0 → 1.1.0 — прецеденты pen M06.2 / fishing
 * M07.2 / lake M08.2]: publicApi ×6 → ×8 (+= workers.upgrades витрина/
 * покупка, workers.last); eventsPublished ×4 → ×5 (+= worker.actionDone —
 * строка каталога 02 §4 с фазы 0, публикует ОБЁРТКА workers после runTask
 * [DECISION-архитектура]; только онлайн-тики — catchUp молчит F13);
 * eventsSubscribed += time.hourTick (worker.tick 2|4|6ч от фазы hiredAt);
 * modifierProviders [] → ['worker.traits'] (F14; имя-строка по канону
 * fishing.bait / lake.upgrades); taskExecutors ПО-ПРЕЖНЕМУ [] (работник
 * ВЫЗЫВАЕТ чужих исполнителей через TaskRegistry — сам задач НЕ
 * регистрирует; реестр 15 не меняется); statsCounters [] (worker-счётчики
 * карточкой НЕ предусмотрены; квесты M15 НЕ расширяются).
 */
import type { ModuleManifest } from '@/game/module-registry';

export function createWorkersManifest(): ModuleManifest {
  return {
    id: 'workers',
    title: 'M11 Работники',
    version: '1.1.0',
    stateKey: 'workers',
    publicApi: [
      'workers.board',
      'workers.list',
      'workers.hire',
      'workers.fire',
      'workers.bonus',
      // --- [M11.2 · F15/F17] улучшения ×5 + последние действия
      'workers.upgrades',
      'workers.last',
      // --- dev: mood set / payday force / tick force (карточка §6, F17)
      'workers.dev',
    ],
    eventsPublished: [
      'worker.hired',
      'worker.fired',
      'worker.sick',
      'worker.payday',
      // --- [M11.2 · F12] обёртка публикует ПОСЛЕ runTask (только онлайн)
      'worker.actionDone',
    ],
    eventsSubscribed: [
      { event: 'time.dayTick', handler: 'onDayTick' },
      { event: 'time.hourTick', handler: 'onHourTick' },
    ],
    modifierProviders: ['worker.traits'],
    taskExecutors: [],
    statsCounters: [],
  };
}
