/**
 * Манифест M05 (01-CORE §9, образец — буквально ферма): единственное место
 * точек интеграции модуля.
 *
 * [M05.1 · F4] eventsPublished: farm.tileChanged + farm.cropHarvested
 * (живые с M05.1).
 *
 * [M05.2 · pre-commitment манифест-комментария M05.1] bump 1.0.0 → 1.1.0:
 * eventsPublished += farm.weedsAppeared (3) — часовые правила сорняков живы;
 * eventsSubscribed += time.hourTick (02 §4: подписка — только через
 * манифест; ядро публикует и живые тики, и catchUp-проходы — F4).
 *
 * [M05.3 · pre-commitment брифа G3] bump 1.1.0 → 1.2.0: publicApi +=
 * farm.upgrade (покупка улучшения: TransactionService, гейт уровня) +
 * farm.upgrades (витрина доступных/купленных — карточка §7, debug-наследие);
 * modifierProviders += farmUpgradesProvider (моды улучшений G2: Плодородие/
 * Чернозём/Гербициды/скорость Теплицы); taskExecutors += farm.sprinkler
 * («Спринклеры» — автополив через TaskRegistry, карточка §6; условная точка:
 * регистрируется при покупке, часовая ветка ведёт каденс из данных).
 *
 * publicApi: действия FSM (таб-параметр G1: вкладки улучшений) + прополка +
 * витрина + ленивый sweep (прецедент DEBT-8/craft.ready/craft.sweep) +
 * dev-форс farm.grow (прецедент D24). Dev-форс зарастания — НЕ здесь:
 * debug-слой собирает его из мод-инъекции + hourTick.
 *
 * statsCounters — ПУСТО (счётчики farm.* — конфиг ядра M01 §6 данными,
 * content/player/counters.ts; прецедент D1: пустые списки монтируются).
 */
import type { ModuleManifest } from '@/game/module-registry';

export function createFarmManifest(): ModuleManifest {
  return {
    id: 'farm',
    title: 'M05 Ферма',
    version: '1.2.0',
    stateKey: 'farm',
    publicApi: [
      'farm.state',
      'farm.plow',
      'farm.plant',
      'farm.water',
      'farm.fertilize',
      'farm.weed',
      'farm.harvest',
      // --- ленивая переоценка (прецедент craft.sweep, DEBT-8)
      'farm.sweep',
      // --- dev: форс готовности для быстрых проб (прецедент D24)
      'farm.grow',
      // --- [M05.3 · G1/G3] покупки улучшений + витрина
      'farm.upgrade',
      'farm.upgrades',
    ],
    eventsPublished: ['farm.tileChanged', 'farm.cropHarvested', 'farm.weedsAppeared'],
    eventsSubscribed: [{ event: 'time.hourTick', handler: 'onHourTick' }],
    modifierProviders: ['farmWeedsProvider', 'farmUpgradesProvider'],
    // farm.sprinkler — условная точка: регистрируется при покупке «Спринклеров»
    // (G2), часовая ветка восстанавливает после перезагрузки
    taskExecutors: ['farm.plow', 'farm.plant', 'farm.water', 'farm.weed', 'farm.harvest', 'farm.sprinkler'],
    statsCounters: [],
  };
}
