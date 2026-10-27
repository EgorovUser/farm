/**
 * Манифест M09 (01-CORE §9): единственное место точек интеграции модуля.
 * Зависимости — ТОЛЬКО ядро + общие реестры контента (карточка §7 «Границы»:
 * заточка — M10, ривен-ролл — M03, цены — шина): выдача предметов/роллов,
 * энергия, гейт-контекст и ремонт — колбэки app-слойя, вайрятся в
 * module-wiring через ModuleRegistry (П4, прецеденты D33/D38/C4).
 *
 * События (каталог 02-BUSES §4): craft.started / craft.completed (defId,
 * качество — для XP/навыка/квестов/ачивок; контент M01 уже подписан:
 * игрок +10 XP, навык «Крафт» +10 за партию).
 *
 * Подписки: time.minuteTick — живой ход очередей (тик = 1 игровая минута),
 * time.hourTick — оффлайн-досчёт (catchUp гоняет часовые границы; сами
 * минуты НЕ проигрываются — 02-BUSES §8). Оба вызывают один и тот же sweep.
 *
 * Провайдер: craft.stations (карточка §6) — длины очередей, эффекты станций
 * («Мифриловая наковальня» — потолок заточки M10 как cap-модификатор),
 * постоянные эффекты рецептов (рюкзак +4 слота).
 *
 * TaskRegistry: craft.queue — исполнитель для работника-кузнеца (M11:
 * WorkersDirector вызывает run, модуль досчитывает очереди).
 *
 * [M10.1 · MEL-D AUDIT-M09] publicApi += craft.ready / craft.sweep —
 * манифест = факту (фактический api-рекорд — 11 методов; дисциплина bump —
 * прецедент D24/inventory). Версия 1.0.0 → 1.0.1.
 */
import type { ModuleManifest } from '@/game/module-registry';

export function createCraftManifest(): ModuleManifest {
  return {
    id: 'craft',
    title: 'M09 Крафт',
    version: '1.0.1',
    stateKey: 'craft',
    publicApi: [
      'craft.stations',
      'craft.buy',
      'craft.list',
      'craft.recipe',
      'craft.make',
      'craft.queue',
      'craft.collect',
      'craft.cancel',
      'craft.repair',
      // --- [M10.1 · MEL-D AUDIT-M09] фактические читатели очереди
      'craft.ready',
      'craft.sweep',
    ],
    eventsPublished: ['craft.started', 'craft.completed'],
    eventsSubscribed: [
      { event: 'time.minuteTick', handler: 'onMinuteTick' },
      { event: 'time.hourTick', handler: 'onHourTick' },
    ],
    modifierProviders: ['craft.stations'],
    taskExecutors: ['craft.queue'],
    statsCounters: [],
  };
}
