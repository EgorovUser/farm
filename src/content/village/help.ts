/**
 * Помощь деревни (карточка M16 §3; бриф G8) — раз в день 1 случайный житель
 * БЕСПЛАТНО выполняет задачу СУЩЕСТВУЮЩЕГО типа TaskRegistry (02 §10).
 * ВСЁ через TaskRegistry, ноль импортов (линтер изоляции rg ×3 — импорт
 * модулей фермы/озера/шахты ЗАПРЕЩЁН; целеподбор — витрины publicApi
 * через deps, прецедент WorkersDirector M11.2).
 *
 * [КОНТРАКТ M16.2 · карточка §3 «помочь в бою»] mine.assist (житель-
 * единица одного боя M12) — тип НЕ зарегистрирован в живом реестре
 * (tasks = 15: farm ×6 / lake ×4 / pen ×5 / fishing.cast / craft.queue);
 * §6 брифа запрещает новые типы — слот перечислен ЗДЕСЬ данными и
 * селектор пропускает незарегистрированные (tasks.has, П5): когда
 * владелец боя зарегистрирует исполнителя, жители начнут помогать в бою
 * без правки этого кода. Найдено при сверке брифа с живым реестром —
 * M161-OBS-1 (факт-расхождение посылки брифа, НЕ блокер).
 */
import type { VillageHelpTable } from './types';

export const VILLAGE_HELP: VillageHelpTable = {
  perDay: 1,
  tasks: [
    { type: 'farm.plow', label: 'вспахать грядки', repeats: 4 },
    { type: 'farm.water', label: 'полить грядки', repeats: 4 },
    { type: 'farm.weed', label: 'прополоть грядки', repeats: 3 },
    { type: 'farm.harvest', label: 'собрать урожай', repeats: 3 },
    { type: 'lake.feed', label: 'накормить озеро', repeats: 1 },
    { type: 'lake.clean', label: 'почистить озеро', repeats: 1 },
    { type: 'pen.collect', label: 'собрать продукцию загона', repeats: 1 },
    { type: 'pen.feed', label: 'накормить животных', repeats: 3 },
    // контракт M16.2: житель-единица одного боя (M12) — сейчас не зарегистрирован
    { type: 'mine.assist', label: 'помочь в бою', repeats: 1, contractOnly: true },
  ],
};
