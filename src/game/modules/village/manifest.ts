/**
 * Манифест M16 (01-CORE §9): единственное место точек интеграции.
 * Версия 1.1.0 = факту сеанса M16.2 (bump по факту; отличия от 1.0.0
 * ТОЛЬКО: version; publicApi ×5 → ×9; eventsPublished ×1 → ×3;
 * eventsSubscribed +time.hourTick):
 *  - publicApi ×9: village.state / village.need / village.supply /
 *    village.help / village.force (dev) + village.build <id|витрина> /
 *    village.equip <villagerId> <itemId|off> / village.raid /
 *    village.raid.force (dev: форс окна предвестник→ночь — прецедент
 *    lake.force / village.force);
 *  - eventsPublished ровно ×3: village.taxCollected (Task 84) +
 *    village.raidWarning + village.raidResolved — строки каталога 02 §4
 *    [касса Task 84; каталог сеансом НЕ редактировался];
 *    village.reputationChanged/trade.fulfilled — публиковать в M16.3;
 *  - eventsSubscribed — time-события: dayTick (налог/потребности/
 *    ворчание) + hourTick (таймеры построек, окно рейда; catchUp — те же
 *    границы, идемпотентность маркерами);
 *  - modifierProviders: villageProvider (эффекты зданий — Кузница/Рынок
 *    override, счастье-аура к налогу; НОВЫХ провайдеров НЕТ);
 *  - taskExecutors: village-helper без изменений (реестр задач 15 жив,
 *    mine.assist — контракт-слот [DECISION M162-бой]);
 *  - statsCounters [] (счётчики трендов — M16.3).
 */
import type { ModuleManifest } from '@/game/module-registry';

export function createVillageManifest(): ModuleManifest {
  return {
    id: 'village',
    title: 'M16 Деревня',
    version: '1.1.0',
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
    ],
    eventsPublished: ['village.taxCollected', 'village.raidWarning', 'village.raidResolved'],
    eventsSubscribed: [
      { event: 'time.dayTick', handler: 'onDayTick' },
      { event: 'time.hourTick', handler: 'onHourTick' },
    ],
    modifierProviders: ['villageProvider'],
    taskExecutors: ['village-helper'],
    statsCounters: [],
  };
}
