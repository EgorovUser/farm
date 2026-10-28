/**
 * Манифест M16 (01-CORE §9): единственное место точек интеграции.
 * Версия 1.0.0 = факту сеанса M16.1 (бриф §0 «манифест village 1.0.0 =
 * факту», образец mine/passives):
 *  - publicApi ×5 [DECISION-имена, бриф §0]: village.state (гейт/уровень/
 *    XP/жители/счастье/налог-строка), village.need <villagerId|all>,
 *    village.supply <villagerId> <itemId> [qty] (TransactionService),
 *    village.help (дневная помощь), village force (dev: форс дня деревни —
 *    переролль потребностей + сбор налога; прецедент lake.force/
 *    passives reset);
 *  - eventsPublished ровно ×1: village.taxCollected — НОВАЯ строка
 *    каталога 02 §4, зарегистрирована кассой [Task 84]; каталог сеансом
 *    НЕ редактировался. village.reputationChanged/trade.fulfilled —
 *    с Фазы 0, публиковать в M16.3; raid-пара — M16.2 (замки §6);
 *  - eventsSubscribed — только time-события ядра: time.dayTick (налог/
 *    ролл потребностей/ворчание; catchUp публикует те же границы —
 *    сверено с hourTick/dayTick-модулями M05/M08);
 *  - modifierProviders: villageProvider — счастье-модификаторы и
 *    ворчун-минус к налогам (эффекты зданий — M16.2, скидки репутации —
 *    M16.3); village.level — override фактическим уровнем (unlock-гейты
 *    жителей через statAtLeast);
 *  - taskExecutors: village-helper — исполнитель СУЩЕСТВУЮЩИХ типов
 *    TaskRegistry (farm, lake, pen + контракт-слот mine.assist M16.2;
 *    НОВЫЙ исполнитель, НЕ новые типы — прецедент M11 workers; реестр
 *    задач 15 жив; селектор пропускает незарегистрированные — help.ts);
 *  - statsCounters [] (счётчики налогов-итого/подарков/сделок — задел
 *    трендов M16.3, домен counters.ts M01 сеансом НЕ трогается).
 */
import type { ModuleManifest } from '@/game/module-registry';

export function createVillageManifest(): ModuleManifest {
  return {
    id: 'village',
    title: 'M16 Деревня',
    version: '1.0.0',
    stateKey: 'village',
    publicApi: [
      'village.state',
      'village.need',
      'village.supply',
      'village.help',
      // dev (бриф §0: «помечен dev» — прецеденты lake.force/passives.reset)
      'village.force',
    ],
    eventsPublished: ['village.taxCollected'],
    eventsSubscribed: [{ event: 'time.dayTick', handler: 'onDayTick' }],
    modifierProviders: ['villageProvider'],
    taskExecutors: ['village-helper'],
    statsCounters: [],
  };
}
