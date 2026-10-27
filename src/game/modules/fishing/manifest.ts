/**
 * Манифест M07 (01-CORE §9, образец — pen): единственное место точек
 * интеграции модуля.
 *
 * [M07.2 · один bump за сеанс 1.0.0 → 1.1.0 — прецедент pen M06.2]:
 * publicApi += fish.album (витрина альбома «гейты показываем» — F10),
 * fish.location (переход локации с гейтом навыка — F12),
 * dev fish.choice (одноразовая подмена выбора события-мини — пробы F13/F14);
 * taskExecutors [] → ['fishing.cast'] (F16 — обёртка publicApi; работники
 * НЕ строятся — M11; worker.actionDone НЕ публикуется — домен M11).
 *
 * eventsPublished — по-прежнему РОВНО ['cast.completed', 'fish.caught']
 * (= каталогу 02 §4, строки с фазы 0; каталог НЕ редактировался — запрет
 * брифа: исходы событий-мини видны через wallet.transaction/item-каноны).
 * eventsSubscribed — ПУСТО: таймеров hourTick/dayTick у модуля НЕТ (клёв —
 * рил-тайм окно активной сессии; срез — счётчики, catchUp не нужен).
 *
 * modifierProviders: [baitProvider] — активная наживка; удочка — через
 * существующий equipmentProvider M02 §5. statsCounters — ПУСТО (счётчики
 * fish.<fishId> ×16 — конфиг ядра M01 §6 данными, content/player/counters).
 */
import type { ModuleManifest } from '@/game/module-registry';

export function createFishingManifest(): ModuleManifest {
  return {
    id: 'fishing',
    title: 'M07 Рыбалка',
    version: '1.1.0',
    stateKey: 'fishing',
    publicApi: [
      'fish.state',
      'fish.cast',
      'fish.buy',
      'fish.tables',
      // --- [M07.2] витрина альбома (F10) + локации (F12)
      'fish.album',
      'fish.location',
      // --- dev: форс результата заброса (карточка §6, прецедент D24) +
      //     одноразовая подмена выбора события-мини (пробы F13/F14)
      'fish.force',
      'fish.choice',
    ],
    eventsPublished: ['cast.completed', 'fish.caught'],
    eventsSubscribed: [],
    modifierProviders: ['fishing.bait'],
    // [M07.2 · F16] исполнитель для работника-рыболова (M11 не строится)
    taskExecutors: ['fishing.cast'],
    statsCounters: [],
  };
}
