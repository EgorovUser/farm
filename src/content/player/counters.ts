/**
 * СЧЁТЧИКИ ЯДРА (M01 §6): конфиг в данных — на новую статистику код не пишется.
 * Хранилище — StatsService (срез kernel.stats), триггеры — подписки на события.
 *
 * Потребители (карточка): квесты/ачивки (M15), биржевые тренды (M16),
 * пассивные очки. События фаз 3–5 (farm.*, fish.*, forge.*, mine.*,
 * trade.*) ещё не публикуются — конфиг описывает их заранее: подписка на
 * несуществующее событие безвредна (EventBus, П5).
 */
import type { ID } from '@/shared/types/ids';

export interface CounterDef {
  id: ID;
  event: string;
  /** точное совпадение плоских полей пейлоада (например { crop: 'wheat' }) */
  filter?: Record<string, string | number | boolean>;
  /** числовое поле пейлоада для суммирования (объёмы); нет поля или не число → +1 (П5) */
  valueKey?: string;
}

export const COUNTERS_TABLE: CounterDef[] = [
  // урожаи по типам (M05: farm.cropHarvested { defId, qty } — фильтры чинены
  // M06.2 · FIX M06-OBS-1: поле crop → defId, мёртвые фильтры не тикали с M05).
  // [M06.2 · сверка с живым контентом] урожай пшеницы — предмет wheat_grain
  // (yields дефа культуры)
  // [M07.2 · D2 · Task 45] счётчик harvest.turnip УДАЛЁН решением №2
  // (2026-10-25): культуры «репа» в контенте M05 нет и не планируется;
  // старые сейвы: loadState восстанавливает мапу целиком (stats-service),
  // устаревший ключ остаётся пассивным значением без конфига — молча
  // игнорируется (не тикает, загрузку не ломает); сейв-версия НЕ поднимается
  { id: 'harvest.total', event: 'farm.cropHarvested', valueKey: 'qty' },
  { id: 'harvest.wheat', event: 'farm.cropHarvested', filter: { defId: 'wheat_grain' }, valueKey: 'qty' },
  // [M05.3 · G6] счётчики фермы: единицы урожая (daily «Собери N урожая»;
  // пул 31→32) и число сборов (ачивка «Агроном» — 100 сборов, гейт солнечника)
  { id: 'farm.harvest.units', event: 'farm.cropHarvested', valueKey: 'qty' },
  { id: 'farm.harvest.batches', event: 'farm.cropHarvested' },
  // [M06.1 · F4] «Грибник» (гейт Свиньи): сборы грибницы Грибницы M05.3 —
  // счётчик = данные (M01 §6); фильтр по ЖИВОМУ полю payload defId события
  // farm.cropHarvested { defId, qty, quality, tab } (без valueKey → +1 за сбор)
  { id: 'farm.mushroom.harvests', event: 'farm.cropHarvested', filter: { defId: 'mushroom' } },
  // [M06.2 · F7] счётчик загона под будущую ачивку «Пастух» [DECISION-слот]:
  // случаи заболевания (pen.animalSick { animalIdx, speciesId, dayIndex } —
  // без valueKey → +1 за случай). pen.bred.count НЕ вводится: события
  // рождения в каталоге 02 §4 нет (право канона — у спеки, M08/M15 увидит)
  { id: 'pen.sick.days', event: 'pen.animalSick' },
  // рыбы по видам (M07: fish.caught { defId, qty }); [M07.2 · F15] счётчики
  // видов ×16 поимённо (пруд 7 + река 9) — право касания счётчиков по
  // прецеденту «Грибник» M06.1 / FIX M06-OBS-1; fish.perch/fish.pike жили с
  // фазы 0 с мёртвым фильтром {species} (payload несёт defId) — чинены
  // одновременно (жанр FIX M06-OBS-1)
  { id: 'fish.total', event: 'fish.caught', valueKey: 'qty' },
  { id: 'fish.crucian', event: 'fish.caught', filter: { defId: 'crucian' }, valueKey: 'qty' },
  { id: 'fish.rotan', event: 'fish.caught', filter: { defId: 'rotan' }, valueKey: 'qty' },
  { id: 'fish.perch', event: 'fish.caught', filter: { defId: 'perch' }, valueKey: 'qty' },
  { id: 'fish.tench', event: 'fish.caught', filter: { defId: 'tench' }, valueKey: 'qty' },
  { id: 'fish.pike', event: 'fish.caught', filter: { defId: 'pike' }, valueKey: 'qty' },
  { id: 'fish.mirror_carp', event: 'fish.caught', filter: { defId: 'mirror_carp' }, valueKey: 'qty' },
  { id: 'fish.golden_carp', event: 'fish.caught', filter: { defId: 'golden_carp' }, valueKey: 'qty' },
  { id: 'fish.loach', event: 'fish.caught', filter: { defId: 'loach' }, valueKey: 'qty' },
  { id: 'fish.dace', event: 'fish.caught', filter: { defId: 'dace' }, valueKey: 'qty' },
  { id: 'fish.gudgeon', event: 'fish.caught', filter: { defId: 'gudgeon' }, valueKey: 'qty' },
  { id: 'fish.chub', event: 'fish.caught', filter: { defId: 'chub' }, valueKey: 'qty' },
  { id: 'fish.zander', event: 'fish.caught', filter: { defId: 'zander' }, valueKey: 'qty' },
  { id: 'fish.trout', event: 'fish.caught', filter: { defId: 'trout' }, valueKey: 'qty' },
  { id: 'fish.sturgeon', event: 'fish.caught', filter: { defId: 'sturgeon' }, valueKey: 'qty' },
  { id: 'fish.ice_char', event: 'fish.caught', filter: { defId: 'ice_char' }, valueKey: 'qty' },
  { id: 'fish.ancient_som', event: 'fish.caught', filter: { defId: 'ancient_som' }, valueKey: 'qty' },
  // [M08.2 · F15] озеро: вывод (lake.bred {fishId, childTier, parents} — +1
  // на икру любого озера), тировые фильтры childTier (питают ачивку
  // «Хозяин озера» — A+ = A/S/SS), болезни (статистика/задел квестов;
  // квест-шаблоны НЕ добавляются — пул daily 32 не трогается)
  { id: 'lake.bred', event: 'lake.bred' },
  { id: 'lake.bred.a', event: 'lake.bred', filter: { childTier: 'A' } },
  { id: 'lake.bred.s', event: 'lake.bred', filter: { childTier: 'S' } },
  { id: 'lake.bred.ss', event: 'lake.bred', filter: { childTier: 'SS' } },
  { id: 'lake.sick', event: 'lake.fishSick' },
  // попытки заточки, успехи/откаты (M10)
  { id: 'forge.attempts', event: 'forge.attempt' },
  { id: 'forge.success', event: 'forge.success' },
  { id: 'forge.rollback', event: 'forge.rollback' },
  // отказы от карточек заточки (M10.2: forge.cardChosen {declined:true}) — hidden-ачивка M15
  { id: 'forge.declines', event: 'forge.cardChosen', filter: { declined: true } },
  // события живых систем фазы 2 для квестов/ачивок M15 (карточка §2: «если модуль
  // публикует событие — квест-шаблон просто добавляется ДАННЫМИ»)
  { id: 'craft.batches', event: 'craft.completed' },
  { id: 'shop.purchases', event: 'shop.purchased' },
  { id: 'shop.purchased.qty', event: 'shop.purchased', valueKey: 'qty' },
  { id: 'sell.items', event: 'item.sold', valueKey: 'qty' },
  // [FIX-PHASE-2 · 4.6 · N6] денежный счётчик: суммирует поле gold payload
  // item.sold (обогащение — маркер карточки M15 §3 / Task 29, вариант (а))
  { id: 'sell.gold', event: 'item.sold', valueKey: 'gold' },
  { id: 'items.acquired', event: 'item.acquired', valueKey: 'qty' },
  { id: 'modforge.rerolls', event: 'modforge.rolled', filter: { source: 'modforge.reroll' } },
  // [M15.2 · N8] расширение пула — только живые события фазы 2 (манифесты):
  { id: 'consume.items', event: 'item.consumed', valueKey: 'qty' }, // расход инвентаря (use)
  { id: 'player.energy.spent', event: 'player.energySpent', valueKey: 'cost' }, // энергия (крафт/заточка/…)
  { id: 'craft.batches.workbench', event: 'craft.completed', filter: { station: 'workbench' } }, // станции
  { id: 'craft.batches.smelter', event: 'craft.completed', filter: { station: 'smelter' } },
  { id: 'craft.batches.kitchen', event: 'craft.completed', filter: { station: 'kitchen' } },
  { id: 'craft.batches.anvil', event: 'craft.completed', filter: { station: 'anvil' } },
  { id: 'craft.stations.built', event: 'wallet.transaction', filter: { eventId: 'craft.station' } }, // постройка станций (прецедент quests.claimed)
  { id: 'forge.cards', event: 'forge.cardChosen', filter: { declined: false } }, // применённые карточки заточки
  { id: 'achievements.unlocked.count', event: 'achievement.unlocked' }, // мета-ачивки (данные о данных)
  // забранные награды квестов (M15: claim-транзакции) — гейт выдачи сюжетных
  // цепочек: доска дел хутора оживает, когда игрок забирает первое
  // заработанное вознаграждение (осознанное вовлечение, не фоновое событие)
  { id: 'quests.claimed', event: 'wallet.transaction', filter: { eventId: 'quest.claim' } },
  // забеги и боссы по типам (M12–13)
  { id: 'mine.runs', event: 'mine.runEnded' },
  { id: 'mine.bosses.total', event: 'mine.bossKilled' },
  { id: 'mine.bosses.stone_guardian', event: 'mine.bossKilled', filter: { bossType: 'stone_guardian' } },
  // объёмы торгов (M16: trade.fulfilled { gold, … })
  { id: 'trade.count', event: 'trade.fulfilled' },
  { id: 'trade.volume', event: 'trade.fulfilled', valueKey: 'gold' },
  // смерти игрока (M01 сам публикует player.hpChanged { died })
  { id: 'player.deaths', event: 'player.hpChanged', filter: { died: true } },
];
