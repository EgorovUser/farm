/**
 * БАЗЫ ИГРОКА (M01, 03-DATA §11): домен player.* + стоимости действий.
 *
 * [M01] Владение статами player.* перенесено из content/balance/bases.ts —
 * там эти строки были каталогом фазы 0 с пометкой «полные правила — M01».
 * Этот файл — единственное место баз игрока (П2: базы не мутируются),
 * balance/bases.ts больше player.* не содержит. Слияние таблиц выполняет
 * mergeBaseTables() в bootstrap.registerContent (02-BUSES: базы — одно место).
 *
 * Числа — из карточки M01 §2–§3: энергия 100 (реген 1 ед / 3 мин),
 * HP 50 (реген 1 / 5 мин), вспашка 5, посадка 1, полив 2, прополка 1,
 * сбор 3, заброс 4, кормление 1, вход в шахту 20, удар в бою 1,
 * крафт 2, попытка заточки 3.
 */
import type { StatId } from '@/shared/types/ids';
import type { BasesTable } from '@/content/balance/bases';

export const PLAYER_BASES_TABLE: BasesTable = {
  bases: {
    // --- тело игрока (M01 §2–§3). Реген — за ИГРОВУЮ минуту: тик ядра = 1 игровая
    // минута, поэтому численно «за тик» ≡ «за минуту»; имя perMinute каноническое
    // (D12: в системе есть minuteTick/hourTick/dayTick — «perTick» двусмысленен)
    'player.energy.max': 100,
    'player.energy.regenPerMinute': 1 / 3,
    'player.hp.max': 50,
    'player.hp.regenPerMinute': 0.2,
    'player.luck': 0,
    // --- расходы действий (M01 §2): action.<system>.<verb>.energyCost.
    // [DECISION] id-маппинг стоимостей (D16, ратифицировано 2026-10-22):
    // pen.feed / combat.hit / forge.sharpen — выбор по глаголам карточки
    // (SESSION-M01 §3.4 предлагал animals.feed / mine.attack). Асимметрия:
    // forge.sharpen — id СТОИМОСТИ действия (энергия), forge.attempt — id
    // СОБЫТИЯ XP (заточка качает кузнечество и при провале).
    // Потребитель: statBus.resolve(...) → player.spendEnergy (не напрямую).
    'action.farm.plow.energyCost': 5,
    'action.farm.plant.energyCost': 1,
    'action.farm.water.energyCost': 2,
    'action.farm.weed.energyCost': 1,
    'action.farm.harvest.energyCost': 3,
    'action.fishing.cast.energyCost': 4,
    'action.pen.feed.energyCost': 1,
    // [M06.1 · F6] энергии загона: кормление 1 (живо с M01), чистка 2,
    // сбор 2, гладить 0 (карточка M06 §3; конвенция action.farm.*)
    'action.pen.clean.energyCost': 2,
    'action.pen.collect.energyCost': 2,
    'action.pen.pet.energyCost': 0,
    // [M06.2 · F2] лечение больного — энергия 0 (уход за больным не труд
    // [DECISION]; прямой путь при нулевой стоимости — прецедент pet)
    'action.pen.heal.energyCost': 0,
    // [M08.1 · F4] энергии озера (бриф F4 [DECISION]: кормление всех
    // голодных одним действием 2, «Сачок» 3; конвенция action.farm.*/pen.*,
    // НЕ дублировать в balance — П2). Выпуск/лечение/сбор — без энергии
    // (в брифе F4 не заданы; прецедент pen.heal 0)
    'action.lake.feed.energyCost': 2,
    'action.lake.clean.energyCost': 3,
    'action.mine.enter.energyCost': 20,
    'action.combat.hit.energyCost': 1,
    'action.craft.make.energyCost': 2,
    'action.forge.sharpen.energyCost': 3,
    // --- [M12.1] боевые статы шахты (карточка M12 §3; санкция брифа
    //     SESSION-M12.1: домен mine.* живёт ЗДЕСЬ, energyCost — M12.2).
    //     Атака/защита игрока — ЖИВЫЕ статы combat.attack/combat.defense
    //     (content/balance/bases.ts — «владелец боевого баланса M12» +
    //     baseStats экипировки через equipmentProvider M02); ривен-канал
    //     чутья — combat.block (block_sense реестра M03, базы с M02.2);
    //     «Вещий удар» — combat.prophetic (content/balance/forging.ts, M10)
    'mine.crit': 5, // базовый шанс крита, % (F4: «base 5% через шину»)
    'mine.damage': 0, // модификатор урона, % (зелья/алтари — BUF-1, активаторы M12.2/M13)
    'mine.speed': 10, // скорость бойца: первым бьёт более быстрая сторона (F4)
  },
  meta: {
    'player.energy.max': { min: 0 },
    // [FIX-0.1 E] реген — дробный, без округления (1/3 не превращается в 0)
    'player.energy.regenPerMinute': { min: 0, round: 'none' },
    'player.hp.max': { min: 1 },
    'player.hp.regenPerMinute': { min: 0, round: 'none' },
    // стоимости: floor в пользу игрока, но не дешевле 1 (действие не бесплатно)
    'action.farm.plow.energyCost': { min: 1, round: 'floor' },
    'action.farm.plant.energyCost': { min: 1, round: 'floor' },
    'action.farm.water.energyCost': { min: 1, round: 'floor' },
    'action.farm.weed.energyCost': { min: 1, round: 'floor' },
    'action.farm.harvest.energyCost': { min: 1, round: 'floor' },
    'action.fishing.cast.energyCost': { min: 1, round: 'floor' },
    'action.pen.feed.energyCost': { min: 1, round: 'floor' },
    'action.pen.clean.energyCost': { min: 1, round: 'floor' },
    'action.pen.collect.energyCost': { min: 1, round: 'floor' },
    // гладить — бесплатно (карточка M06 §3 «энергия 0»): min 0, не 1
    'action.pen.pet.energyCost': { min: 0, round: 'floor' },
    // лечение — тоже бесплатно (M06.2 F2: уход за больным не труд)
    'action.pen.heal.energyCost': { min: 0, round: 'floor' },
    // [M08.1 · F4] озеро: кормление 2 / «Сачок» 3 (floor, не дешевле 1)
    'action.lake.feed.energyCost': { min: 1, round: 'floor' },
    'action.lake.clean.energyCost': { min: 1, round: 'floor' },
    'action.mine.enter.energyCost': { min: 1, round: 'floor' },
    'action.combat.hit.energyCost': { min: 1, round: 'floor' },
    'action.craft.make.energyCost': { min: 1, round: 'floor' },
    'action.forge.sharpen.energyCost': { min: 1, round: 'floor' },
    // [M12.1] проценты/скорость — неотрицательные (дебафы идут модами, не базой)
    'mine.crit': { min: 0 },
    'mine.damage': { min: 0 },
    'mine.speed': { min: 0 },
  },
};

/**
 * Слияние таблиц баз (bootstrap.registerContent): один источник для StatBus.
 * Дубликат ключа — ошибка старта: два источника одного стата запрещены (П2).
 */
export function mergeBaseTables(...tables: BasesTable[]): BasesTable {
  const bases: Record<StatId, number> = {};
  const meta: BasesTable['meta'] = {};
  for (const table of tables) {
    for (const [stat, value] of Object.entries(table.bases)) {
      if (stat in bases) {
        throw new Error(`[Content] дубликат базы "${stat}" при слиянии таблиц (П2: база задаётся один раз)`);
      }
      bases[stat] = value;
    }
    for (const [stat, entry] of Object.entries(table.meta)) {
      if (stat in meta) {
        throw new Error(`[Content] дубликат meta "${stat}" при слиянии таблиц`);
      }
      meta[stat] = entry;
    }
  }
  return { bases, meta };
}
