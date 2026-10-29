/**
 * Манифест M16 (01-CORE §9): единственное место точек интеграции.
 * Версия 1.2.0 = факту сеанса M16.3 (bump по факту; отличия от 1.1.0
 * ТОЛЬКО: version; publicApi ×9 → ×13; eventsPublished ×3 → ×5;
 * priceModifierProviders [] → [village.trade]; statsCounters [] →
 * [trade.count, trade.volume]):
 *  - publicApi ×13: state/need/supply/help/force (dev) + build/equip/raid/
 *    raid.force (dev) + trade (витрина биржи — замок-на-разблокировку
 *    «trade» брифа; паттерн village.raid) + trade.fulfill <partnerId>
 *    [item] + trade.buy <partnerId> <itemId> [qty] + trade.trend.force
 *    (dev: реролл контрактов/трендов дня, сид-суффикс #N — прецедент
 *    raid.force; маркеры fulfilled НЕ сбрасывает);
 *  - eventsPublished ровно ×5: village.taxCollected + village.raidWarning +
 *    village.raidResolved + trade.fulfilled + village.reputationChanged —
 *    строки каталога 02 §4 [касса Task 84; каталог сеансом НЕ
 *    редактировался; обе строки M16 висели в каталоге с фазы 0];
 *  - eventsSubscribed — time-события: dayTick (налог/потребности/
 *    ворчание + РОТАЦИЯ ДНЯ БИРЖИ) + hourTick (таймеры построек, окно
 *    рейда; catchUp — те же границы, идемпотентность маркерами);
 *  - modifierProviders: villageProvider (эффекты зданий — Кузница/Рынок
 *    override, счастье-аура к налогу; НОВЫХ stat-провайдеров НЕТ);
 *  - priceModifierProviders: [village.trade] — тренды/репутация/премия
 *    контракта/потребитель Рынка (04-DISCOUNTS; тег trade — биржа-скоуп);
 *  - taskExecutors: village-helper без изменений (реестр задач 15 жив,
 *    mine.assist — контракт-слот [DECISION M162-бой]);
 *  - statsCounters: [trade.count, trade.volume] — конфиг ядра M01 §6
 *    описывал их ЗАРАНЕЕ под событие trade.fulfilled { gold } (докблок
 *    «биржевые тренды (M16)»); владение объявлено фактом M16.3 — счётчики
 *    тикают CountersEngine'ом ядра, модуль их только публикует.
 */
import type { ModuleManifest } from '@/game/module-registry';

export function createVillageManifest(): ModuleManifest {
  return {
    id: 'village',
    title: 'M16 Деревня',
    version: '1.2.0',
    stateKey: 'village',
    publicApi: [
      'village.state',
      'village.need',
      'village.supply',
      'village.help',
      // dev (бриф §0: «помечен dev» — прецеденты lake.force/passives.reset)
      'village.force',
      // --- M16.2
      'village.build',
      'village.equip',
      'village.raid',
      // dev: форс окна рейда (предвестник → ночь)
      'village.raid.force',
      // --- M16.3 (биржа: витрина/исполнение/покупка + dev-реролл дня)
      'village.trade',
      'village.trade.fulfill',
      'village.trade.buy',
      // dev: реролл контрактов/трендов дня (сид-суффикс)
      'village.trade.trend.force',
    ],
    eventsPublished: [
      'village.taxCollected',
      'village.raidWarning',
      'village.raidResolved',
      'trade.fulfilled',
      'village.reputationChanged',
    ],
    eventsSubscribed: [
      { event: 'time.dayTick', handler: 'onDayTick' },
      { event: 'time.hourTick', handler: 'onHourTick' },
    ],
    modifierProviders: ['villageProvider'],
    priceModifierProviders: ['village.trade'],
    taskExecutors: ['village-helper'],
    statsCounters: ['trade.count', 'trade.volume'],
  };
}
