/**
 * M14 · БАЗЫ СТАТОВ домена пассивик (П2; сливаются в 'bases' при регистрации
 * content-registration.ts — паттерн доменных таблиц PLAYER/WORKERS/...).
 *
 * Статусы на момент M14.1 (бриф §5: «Keystones живьём (resolve ДО/ПОСЛЕ,
 * чужой код НЕ участвует)»):
 *  - ПОТРЕБЛЯЕМЫЕ статами-шиной живого ядра: player.xp.mult (будущий
 *    XP-канал M01), mine.helperSlots.bonus (слот отряда M13.2), farm.harvest
 *    .mult (личный сбор M05) — резолв-уровень M14.1, поведенческая проводка
 *    в модули-владельцы — будущие сеансы (код M01/M05/M11/M13 НЕ трогается
 *    брифом: «keystone-интеграции ЧТЕНИЕМ шин: их код НЕ трогать»);
 *  - worker.quitChance / worker.sickChance / worker.salary.mult /
 *    worker.limitPerObject — шинный канал шансов/зарплат/лимита работников
 *    (базы зеркалят числа данных M11: moodFire.chance 10%, sickness.chance
 *    2%, зарплата ×100 = обычная, 1 работник на объект); dayPass M11 читает
 *    свои таблицы — проводка шанса через шину = будущий сеанс M11-домена.
 *
 * Инвариант M03 «stat → существующие базы»: все статы узлов дерева (nodes.ts)
 * либо существуют в чужих доменных таблицах (player.*, action.*, farm.*,
 * mine.*, fishing.*, worker.salary.discount…), либо задокументированы ЗДЕСЬ
 * ровно один раз (П2: дубликат = отказ старта).
 *
 * [M14.2 · зеркала новой волны] эффекты кластеров полного дерева используют
 * существующие статы шины; РОВНО ДВА новых зеркала данных (бриф: «НОВЫЕ
 * зеркала баз в bases.ts легальны (П2 — только зеркала)»):
 *  - shop.sell.ratePercent — зеркало ECONOMY_TABLE.sellRatePercent (ставка
 *    продажи 40%); priceBus читает свою таблицу — резолв-уровень шины,
 *    поведенческая проводка = будущий сеанс (прецедент worker.* M14.1);
 *  - pen.sickness.chancePercent — зеркало PEN_TABLE.sickness.base 0.02/день
 *    (2%); загон читает свою таблицу — аналогично.
 */
import type { BasesTable } from '@/content/balance/bases';

export const PASSIVES_BASES_TABLE: BasesTable = {
  bases: {
    // XP-множитель игрока (процент; 100 = обычный; inc от узлов учения)
    'player.xp.mult': 100,
    // бонус слотов отряда наёмников (M13.2: старт 1 + Отряд, кап 3)
    'mine.helperSlots.bonus': 0,
    // личный сбор урожая (процент; 100 = обычный)
    'farm.harvest.mult': 100,
    // шинные шансы/зарплата/лимит работников (зеркала данных M11; см. шапку)
    'worker.quitChance': 10,
    'worker.sickChance': 2,
    'worker.salary.mult': 100,
    'worker.limitPerObject': 1,
    // [M14.2 · зеркала] ставка продажи (ECONOMY_TABLE.sellRatePercent) и
    // базовый шанс заболевания животного (PEN_TABLE.sickness.base 2%/день)
    'shop.sell.ratePercent': 40,
    'pen.sickness.chancePercent': 2,
  },
  meta: {
    'player.xp.mult': { min: 0, round: 'none' },
    'mine.helperSlots.bonus': { min: 0, round: 'none' },
    'farm.harvest.mult': { min: 0, round: 'none' },
    'worker.quitChance': { min: 0, round: 'none' },
    'worker.sickChance': { min: 0, round: 'none' },
    'worker.salary.mult': { min: 0, round: 'none' },
    'worker.limitPerObject': { min: 0, round: 'floor' },
    'shop.sell.ratePercent': { min: 0, round: 'none' },
    'pen.sickness.chancePercent': { min: 0, round: 'none' },
  },
};
