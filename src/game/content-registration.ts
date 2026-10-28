/**
 * Регистрация контента в реестре (слой app): все таблицы данных игры — в одном
 * месте, zod-валидация при старте (битый контент = отказ с путём поля).
 * [M02.2] вынесено из bootstrap.ts по правилу 01-CORE §6 (файл превысил 300
 * строк при касании): сборка ядра и реестрация контента — разные ответственности.
 */
import { ContentRegistry } from '@/kernel/content/content-registry';
import { BASES_TABLE } from '@/content/balance/bases';
import { ECONOMY_TABLE } from '@/content/balance/economy';
import { TIME_TABLE } from '@/content/balance/time';
import { ROLL_TABLES, RNG_TABLE } from '@/content/balance/rng';
import { ITEMS } from '@/content/items/items';
import { PLAYER_BASES_TABLE, mergeBaseTables } from '@/content/player/bases';
import { PLAYER_TABLE } from '@/content/player/progression';
import { SKILLS_TABLE } from '@/content/player/skills';
import { COUNTERS_TABLE } from '@/content/player/counters';
import { CURRENCY_INFO } from '@/content/player/currencies';
import { countersTableSchema, currencyInfoSchema, playerTableSchema, skillsTableSchema } from '@/content/player/schemas';
// [M02] контент инвентаря: баланс (вместимость/качество/стаки/вкладки/слоты) + схемы
import { INVENTORY_BASES_TABLE, INVENTORY_TABLE } from '@/content/balance/inventory';
import { inventoryTableSchema } from '@/content/inventory/schemas';
// [M02.2] реестр типов ривен-характеристик (шов M03 §2, контент-минимум брифа §2.6)
import { MOD_TYPES } from '@/content/mods/registry';
import { modforgeTableSchema, modTypesSchema } from '@/content/mods/schemas';
// [M03.1] баланс модфорджа: бюджеты/форма роллов/стоимость реролла (бриф §3–§4/§6)
import { MODFORGE_TABLE } from '@/content/balance/modforge';
// [M04.1] контент магазина: пул ротации (карточка §2) + баланс (§2–§3)
import { SHOP_POOL } from '@/content/shopPool';
import { SHOP_BASES_TABLE, SHOP_TABLE } from '@/content/balance/shop';
import { shopPoolSchema, shopTableSchema } from '@/content/shop/schemas';
// [M09] контент крафта: рецепты + станции + баланс (формула/очереди/ремонт)
import { RECIPES } from '@/content/craft/recipes';
import { STATIONS } from '@/content/craft/stations';
import { craftRecipesSchema, craftStationsSchema, craftTableSchema } from '@/content/craft/schemas';
import { CRAFT_BASES_TABLE, CRAFT_TABLE } from '@/content/balance/craft';
// [M10.1] контент заточки: баланс (шансы/pity/откат/стоимости/станок/круг)
import { FORGE_BASES_TABLE, FORGE_TABLE } from '@/content/balance/forging';
import { forgeTableSchema } from '@/content/forging/schemas';
// [M15] контент квестов/ачивок: пулы (карточка §2–§5) + баланс движка (§3)
import { DAILY_QUESTS } from '@/content/quests/daily';
import { WEEKLY_QUESTS } from '@/content/quests/weekly';
import { CHAIN_QUESTS } from '@/content/quests/chains';
import { ACHIEVEMENTS } from '@/content/quests/achievements';
import { QUESTS_TABLE } from '@/content/balance/quests';
import { achievementsSchema, questsChainsSchema, questsDailySchema, questsTableSchema, questsWeeklySchema } from '@/content/quests/schemas';
// [M05] контент фермы: культуры (карточка §2) + баланс (§3–§5/F3/F6/F7)
import { CROPS } from '@/content/farm/crops';
import { cropsSchema } from '@/content/farm/schemas';
import { FARM_UPGRADES } from '@/content/farm/upgrades';
import { FARM_BASES_TABLE, FARM_TABLE } from '@/content/balance/farm';
import { farmTableSchema, farmUpgradesSchema } from '@/content/farm/schemas';
// [M06] контент загона: животные (карточка §2) + баланс (§3–§4/F5–F7)
import { ANIMALS } from '@/content/pen/animals';
import { animalsSchema, penTableSchema, penUpgradesSchema } from '@/content/pen/schemas';
import { PEN_BASES_TABLE, PEN_TABLE } from '@/content/balance/pen';
import { PEN_UPGRADES } from '@/content/pen/upgrades';
// [M07] контент рыбалки: таблицы дропа + удочки/наживки + баланс (карточка M07 §2–§5)
import { DROP_CATEGORIES, POND_FISH, RIVER_FISH, TRASH_ITEMS, CHEST_TABLE, TREASURE_MAP_TABLE, TREASURE_MAP_EVENT, FISHING_EVENTS } from '@/content/fishing/fish';
import { RODS } from '@/content/fishing/rods';
import { BAITS } from '@/content/fishing/baits';
import { baitsSchema, chestSchema, dropCategoriesSchema, fishingEventsSchema, fishingTableSchema, pondFishSchema, riverFishSchema, rodsSchema, trashSchema, treasureMapEventSchema, treasureMapSchema } from '@/content/fishing/schemas';
import { FISH_BASES_TABLE, FISHING_TABLE } from '@/content/balance/fishing';
// [M08] контент озера: баланс воды/ухода/разведения/болезней (карточка M08 §2–§4;
// требования видов lakeRequirements — аддитивные поля дефов рыб content/fishing)
// [M08.2 · F10] улучшения ×7 — данные (паттерн pen/upgrades.ts M06.2)
import { LAKE_BASES_TABLE, LAKE_TABLE } from '@/content/balance/lake';
import { LAKE_UPGRADES } from '@/content/lake/upgrades';
import { lakeTableSchema, lakeUpgradesSchema } from '@/content/lake/schemas';
// [M11] контент работников: числа (карточка M11 §2–§4) + трейты-кандидаты
// ривена (дефы-данными, слияние в 'mods' — живой ривен-конструктор M03
// роллит их по скоупу 'worker'; БЕЗ правки кода M03, П1/П5)
import { WORKERS_TABLE, WORKERS_BASES_TABLE, WORKER_OBJECTS } from '@/content/workers/table';
import { WORKER_TRAIT_TYPES } from '@/content/workers/traits';
import { WORKER_UPGRADES } from '@/content/workers/upgrades';
import { workersTableSchema, workerObjectSchema, workersUpgradesSchema } from '@/content/workers/schemas';
// [M12.1] контент шахты: мобы ×7 + элитные модификаторы ×3 + формулы боя
// (карточка M12 §3–§4, бриф SESSION-M12.1 F5; числа — только здесь)
import { MINE_MOBS, ELITE_MODS } from '@/content/mine/mobs';
import { MINE_TABLE } from '@/content/mine/table';
import { MINE_BOSSES } from '@/content/mine/bosses';
import { MINE_LAYERS } from '@/content/mine/layers';
// [M13.1] контент забега: карты ×12 + факел + статусы + крот + насыщенность
// + улучшения ×4 (бриф R2–R6; числа — только здесь)
import { MINE_CARDS, MINE_TORCH, MINE_LAYER_STATUSES, MINE_RUN_EFFECTS } from '@/content/mine/cards';
import { MINE_UPGRADES } from '@/content/mine/upgrades';
// [M13.2] контент помощников: классы ×5 + страхи-Condition + таблица модуля
// + трейт-типы ривена (скоуп 'helper'; слияние в 'mods' — ЖИВОЙ движок C6 M03
// роллит их по бюджету редкости, П1/П5 — паттерн трейтов работников M11)
import { HELPER_CLASSES, HELPER_FEAR_DEFS, MINE_HELPERS_TABLE, HELPER_TRAIT_TYPES } from '@/content/mine/helpers';
// [M14] контент пассивок: дерево (узлы/рёбра/эффекты) + очки (каналы/маркеры
// «крупных» и боссовых ачивок) + кривая респека + базы домена (П2)
// [M14.2] кластеры полного дерева ×5 сливаются в таблицу 'passives'
// (бриф G2: «агрегация массивов в таблицу — правкой content-registration.ts»;
// смежность = объединение рёбер, граф неориентированный — logic.ts M14.1)
import { PASSIVES_TREE } from '@/content/passives/nodes';
import { FARM_NODES } from '@/content/passives/nodes-farm';
import { FISH_NODES } from '@/content/passives/nodes-fish';
import { MINE_NODES } from '@/content/passives/nodes-mine';
import { ECONOMY_NODES } from '@/content/passives/nodes-economy';
import { ANIMALS_NODES } from '@/content/passives/nodes-animals';
import { PASSIVES_POINTS } from '@/content/passives/points';
import { PASSIVES_RESPEC } from '@/content/passives/respec';
import { PASSIVES_BASES_TABLE } from '@/content/passives/bases';
import { passivesPointsSchema, passivesRespecSchema, passivesTreeSchema } from '@/content/passives/schemas';
// [M16.1] контент деревни: жители/потребности/налог/подарки/помощь + баланс
// (бриф §0 «Леджер прав»; карточка M16 §2–§3; числа — только здесь, П1/П6)
import { VILLAGERS } from '@/content/village/villagers';
import { VILLAGE_NEEDS } from '@/content/village/needs';
import { VILLAGE_TAX } from '@/content/village/tax';
import { VILLAGE_GIFTS } from '@/content/village/gifts';
import { VILLAGE_HELP } from '@/content/village/help';
import { VILLAGE_BASES_TABLE, VILLAGE_TABLE } from '@/content/village/table';
import {
  villageBasesSchema,
  villageGiftsSchema,
  villageHelpSchema,
  villageNeedsSchema,
  villageTableSchema,
  villageTaxSchema,
  villagersSchema,
} from '@/content/village/schemas';
import {
  eliteModsSchema,
  mineMobsSchema,
  mineTableSchema,
  mineBossesSchema,
  mineLayersSchema,
  mineCardsSchema,
  mineTorchSchema,
  mineLayerStatusesSchema,
  mineRunEffectsSchema,
  mineUpgradesSchema,
} from '@/content/mine/schemas';
import {
  helperClassesSchema,
  helperFearsSchema,
  mineHelpersTableSchema,
} from '@/content/mine/helpers-schemas';
import { z } from 'zod';
import { basesTableSchema, economySchema, itemsSchema, rngSchema, rollTablesSchema, timeSchema } from '@/kernel/content/schemas';

export function registerContent(content: ContentRegistry): void {
  // [M01] базы — слияние таблиц: ядро/демо + домен player.* + домен inventory.*
  // + shop.* (M04.1) + craft.* (M09) + forge.* (M10.1: потолок — перенос
  // владельца из craft, бонус круга)
  // (дубликат = отказ старта, П2: база задаётся один раз; файлы-владельцы не трогают друг друга)
  content.register(
    'bases',
    basesTableSchema,
    mergeBaseTables(BASES_TABLE, PLAYER_BASES_TABLE, INVENTORY_BASES_TABLE, SHOP_BASES_TABLE, CRAFT_BASES_TABLE, FORGE_BASES_TABLE, FARM_BASES_TABLE, PEN_BASES_TABLE, FISH_BASES_TABLE, LAKE_BASES_TABLE, WORKERS_BASES_TABLE, PASSIVES_BASES_TABLE, VILLAGE_BASES_TABLE),
  );
  content.register('economy', economySchema, ECONOMY_TABLE);
  content.register('time', timeSchema, TIME_TABLE);
  content.register('rng', rngSchema, RNG_TABLE);
  content.register('items', itemsSchema, ITEMS);
  content.register('rollTables', rollTablesSchema, ROLL_TABLES);
  // --- контент M01 (03-DATA §11: имена таблиц = имена модулей)
  content.register('player.progression', playerTableSchema, PLAYER_TABLE);
  content.register('player.skills', skillsTableSchema, SKILLS_TABLE);
  content.register('player.counters', countersTableSchema, COUNTERS_TABLE);
  content.register('player.currencies', currencyInfoSchema, CURRENCY_INFO);
  // --- контент M02 (D19: база 20 в bases-слиянии, кап/качество/стаки/вкладки — таблицей)
  content.register('inventory', inventoryTableSchema, INVENTORY_TABLE);
  // --- контент M02.2: реестр ModTypeDef (D31: rolledMods → inc через stat);
  //     [M11 · F2] + трейты-кандидаты работников (скоуп 'worker' — дефы в
  //     content/workers/traits.ts, слияние ЗДЕСЬ: живой ривен-конструктор M03
  //     видит их через реестр БЕЗ правки своего кода — П1/П5; инвариант
  //     «stat → существующие базы» проверяет группа M03 по реестру 'mods')
  content.register('mods', modTypesSchema, [...MOD_TYPES, ...WORKER_TRAIT_TYPES, ...HELPER_TRAIT_TYPES]);
  // --- контент M03: баланс модфорджа (бюджеты по редкости, рефанд, реролл)
  content.register('modforge', modforgeTableSchema, MODFORGE_TABLE);
  // --- контент M04 (карточка §2: «стартовый пул в content/shopPool.ts»)
  content.register('shop.pool', shopPoolSchema, SHOP_POOL);
  content.register('shop', shopTableSchema, SHOP_TABLE);
  // --- контент M09 (карточка §2/§3: станции/рецепты/баланс — данные, П1)
  content.register('craft.recipes', craftRecipesSchema, RECIPES);
  content.register('craft.stations', craftStationsSchema, STATIONS);
  content.register('craft', craftTableSchema, CRAFT_TABLE);
  // --- контент M10 (карточка §4: шансы/pity/откат/стоимости — данные, П1)
  content.register('forge', forgeTableSchema, FORGE_TABLE);
  // --- контент M15 (карточка §2–§5: пулы квестов/ачивок + баланс движка — данные, П1)
  content.register('quests.daily', questsDailySchema, DAILY_QUESTS);
  content.register('quests.weekly', questsWeeklySchema, WEEKLY_QUESTS);
  content.register('quests.chains', questsChainsSchema, CHAIN_QUESTS);
  content.register('quests.achievements', achievementsSchema, ACHIEVEMENTS);
  content.register('quests', questsTableSchema, QUESTS_TABLE);
  // --- контент M05 (карточка §2/§3: культуры — данные, П1; энергии действий —
  //     в content/player/bases.ts с фазы M01, здесь НЕ дублируются — П2)
  content.register('farm.crops', cropsSchema, CROPS);
  // --- [M05.3 · G1/G2] улучшения фермы (карточка §6: данные + TransactionService)
  content.register('farm.upgrades', farmUpgradesSchema, FARM_UPGRADES);
  content.register('farm', farmTableSchema, FARM_TABLE);
  // --- контент M06 (карточка §2/§3: животные — данные, П1; баланс —
  //     единственное место чисел загона; энергии действий — в content/player/
  //     bases.ts с фазы M01, здесь НЕ дублируются — П2)
  content.register('pen.animals', animalsSchema, ANIMALS);
  content.register('pen', penTableSchema, PEN_TABLE);
  // --- [M06.2 · F3] улучшения загона (карточка §5: данные + TransactionService)
  content.register('pen.upgrades', penUpgradesSchema, PEN_UPGRADES);
  // --- контент M07 (карточка §2–§5: таблицы дропа/лестница удочек/наживки —
  //     данные, П1; энергии действий — в content/player/bases.ts с фазы M01,
  //     здесь НЕ дублируются — П2; редкости улова — БАЗЫ fishing.weight.*)
  content.register('fishing.categories', dropCategoriesSchema, DROP_CATEGORIES);
  content.register('fishing.fish', pondFishSchema, POND_FISH);
  // [M07.2 · F12] река: вторая таблица со своими рыбами (гейт-навык 10;
  // мусор/события — общие дефы, веса категорий — те же базы)
  content.register('fishing.river', riverFishSchema, RIVER_FISH);
  content.register('fishing.trash', trashSchema, TRASH_ITEMS);
  content.register('fishing.chest', chestSchema, CHEST_TABLE);
  // [M07.2 · F13] таблица наград вскрытия карты сокровищ + событие «Клад»
  content.register('fishing.treasureMap', treasureMapSchema, TREASURE_MAP_TABLE);
  content.register('fishing.treasureEvent', treasureMapEventSchema, TREASURE_MAP_EVENT);
  content.register('fishing.events', fishingEventsSchema, FISHING_EVENTS);
  content.register('fishing.rods', rodsSchema, RODS);
  content.register('fishing.baits', baitsSchema, BAITS);
  content.register('fishing', fishingTableSchema, FISHING_TABLE);
  // --- контент M08 (карточка §2–§4: вода/уход/разведение/болезни — данные, П1;
  //     энергии действий — в content/player/bases.ts с фазы M01, здесь НЕ
  //     дублируются — П2; требования видов — на дефах рыб, НЕ здесь)
  content.register('lake', lakeTableSchema, LAKE_TABLE);
  // --- [M08.2 · F10] улучшения озера ×7 (карточка §5: данные + TransactionService)
  content.register('lake.upgrades', lakeUpgradesSchema, LAKE_UPGRADES);
  // --- контент M11 (карточка §2–§4: доска/зарплаты/настроение/болезни/
  //     расчётный день — данные, П1); объекты — реестр проб живого состояния
  content.register('workers', workersTableSchema, WORKERS_TABLE);
  content.register('workers.objects', z.array(workerObjectSchema), WORKER_OBJECTS);
  // --- [M11.2 · F15] улучшения качества жизни ×5 (карточка §5: данные +
  //     TransactionService eventId worker.upgrade — паттерн lake.upgrades)
  content.register('workers.upgrades', workersUpgradesSchema, WORKER_UPGRADES);
  // --- контент M12 (карточка §3–§4: мобы/элиты/формулы — данные, П1;
  //     энергии действий — в content/player/bases.ts с фазы M01 (mine.enter
  //     20), здесь НЕ дублируются — П2; боевые базы — слияние 'bases' выше)
  content.register('mine.mobs', mineMobsSchema, MINE_MOBS);
  content.register('mine.eliteMods', eliteModsSchema, ELITE_MODS);
  content.register('mine', mineTableSchema, MINE_TABLE);
  // --- [M12.2] боссы ×3 фазами + слои ×9 (бриф G1/G3/G5: боссы/гейты/
  //     дропы-таблицы — данные; сверка defId против 'items' — self-группа M12)
  content.register('mine.bosses', mineBossesSchema, MINE_BOSSES);
  content.register('mine.layers', mineLayersSchema, MINE_LAYERS);
  // --- [M13.1] контент забега (карточка M13 §2–§3: карты/факел/статусы/крот/
  //     насыщенность/run-эффекты предметов + улучшения ×4 — данные, П1;
  //     свёртка таблиц карточки в один реестровый ключ 'mine.cards')
  content.register('mine.cards', mineCardsSchema, MINE_CARDS);
  content.register('mine.cards.torch', mineTorchSchema, MINE_TORCH);
  content.register('mine.cards.statuses', mineLayerStatusesSchema, MINE_LAYER_STATUSES);
  content.register('mine.cards.runEffects', mineRunEffectsSchema, MINE_RUN_EFFECTS);
  content.register('mine.upgrades', mineUpgradesSchema, MINE_UPGRADES);
  // --- [M13.2] контент помощников (карточка M13 §4, брифы R1–R7; данные, П1;
  //     инвариант M03 «stat → существующие базы» — mine.helper.*-строки в bases)
  content.register('mine.helpers', helperClassesSchema, HELPER_CLASSES);
  content.register('mine.helpers.fears', helperFearsSchema, HELPER_FEAR_DEFS);
  content.register('mine.helpers.table', mineHelpersTableSchema, MINE_HELPERS_TABLE);
  // --- контент M14 (карточка §3–§4: дерево/очки/респек — данные, П1;
  //     zod-валидация достижимости BFS — висячий узел = отказ загрузки F6;
  //     инвариант M03 «stat → существующие базы» — домен в PASSIVES_BASES_TABLE;
  //     [M14.2] полное дерево 150 allocatable = 34 M14.1 + 117 новых по квотам
  //     карточки §4: ядро 20 / ферма 30 / рыбалка 25 / шахта 30 / экономика 25
  //     / животные 20 (+ старт-якорь вне счёта — счёт allocatable, G2/G8)
  content.register('passives', passivesTreeSchema, {
    startNodes: PASSIVES_TREE.startNodes,
    nodes: [...PASSIVES_TREE.nodes, ...FARM_NODES, ...FISH_NODES, ...MINE_NODES, ...ECONOMY_NODES, ...ANIMALS_NODES],
  });
  content.register('passives.points', passivesPointsSchema, PASSIVES_POINTS);
  content.register('passives.respec', passivesRespecSchema, PASSIVES_RESPEC);
  // --- контент M16 (карточка §2–§3: жители/потребности/налог/подарки/
  //     помощь — данные, П1; гейт модуля — уровень 30 + ачивка «Мастер
  //     хутора» [ветка (б) DECISION M161-гейт]; счётчики трендов — M16.3)
  content.register('village.villagers', villagersSchema, VILLAGERS);
  content.register('village.needs', villageNeedsSchema, VILLAGE_NEEDS);
  content.register('village.tax', villageTaxSchema, VILLAGE_TAX);
  content.register('village.gifts', villageGiftsSchema, VILLAGE_GIFTS);
  content.register('village.help', villageHelpSchema, VILLAGE_HELP);
  content.register('village', villageTableSchema, VILLAGE_TABLE);
  // базы домена: слияние 'bases' (П2; прецедент PASSIVES_BASES_TABLE M14.1)
  content.register('village.bases', villageBasesSchema, VILLAGE_BASES_TABLE);
}
