/**
 * Манифест M06 (01-CORE §9, образец — ферма): единственное место
 * точек интеграции модуля.
 *
 * [M06.2 · pre-commitment брифа F1/F3] bump 1.0.0 → 1.1.0 (один на сеанс:
 * болезни + улучшения): eventsPublished += pen.animalSick (строка каталога
 * 02 §4 внесена спекой при регистрации брифа M06.2 — Task 40, прецедент
 * weedsAppeared → M05.2); publicApi += pen.heal / pen.upgrade /
 * pen.upgrades / pen.breed / pen.sell / pen.manure / pen.manure.take
 * + dev pen.sick (заявлен SESSION-M06 §3.8; прецедент pen.produce);
 * modifierProviders += penUpgradesProvider (моды «Пастбища-люкс» — flat
 * +10 pen.happiness.bonus [tag=pen]; прецедент farmUpgradesProvider M05.3);
 * taskExecutors += pen.feed/clean/collect/pet (тонкие обёртки publicApi,
 * 02 §10 — работники M11; прецедент farm.* M05.2) + pen.autofeeder
 * (условная точка: регистрируется покупкой «Автокормушек», часовая ветка
 * восстанавливает due-проходом — прецедент farm.sprinkler).
 *
 * worker.actionDone НЕ публикуется — домен M11 (запрет-прецедент M05.2).
 * statsCounters — ПУСТО (счётчик pen.sick.days — конфиг ядра M01 §6
 * данными, content/player/counters.ts).
 */
import type { ModuleManifest } from '@/game/module-registry';

export function createPenManifest(): ModuleManifest {
  return {
    id: 'pen',
    title: 'M06 Загон',
    version: '1.1.0',
    stateKey: 'pen',
    publicApi: [
      'pen.state',
      'pen.buy',
      'pen.feed',
      'pen.clean',
      'pen.pet',
      'pen.collect',
      // --- [M06.2] болезни/улучшения/разведение/навоз (F1–F5)
      'pen.heal',
      'pen.upgrade',
      'pen.upgrades',
      'pen.breed',
      'pen.sell',
      'pen.manure',
      'pen.manure.take',
      // --- dev: форс продукции/болезни для быстрых проб (прецедент D24)
      'pen.produce',
      'pen.sick',
    ],
    eventsPublished: ['pen.produceCollected', 'pen.animalSick'],
    eventsSubscribed: [
      { event: 'time.hourTick', handler: 'onHourTick' },
      { event: 'time.dayTick', handler: 'onDayTick' },
    ],
    modifierProviders: ['penUpgradesProvider'],
    // pen.autofeeder — условная точка: регистрируется покупкой
    // «Автокормушек» (F3), часовая ветка восстанавливает после перезагрузки
    taskExecutors: ['pen.feed', 'pen.clean', 'pen.collect', 'pen.pet', 'pen.autofeeder'],
    statsCounters: [],
  };
}
