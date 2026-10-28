/**
 * M14 · Очки пассивик — каналы начисления (карточка §2; бриф §0 [DECISION
 * M14-очки]: события + идемпотентный ретро-подсчёт). ЕДИНСТВЕННОЕ место чисел.
 *
 * Подписки ×3 (манифест eventsSubscribed):
 *  - player.levelUp → +perLevel за каждый ПОДЪЁМ уровня (ретро-семантика:
 *    «за каждый обладаемый уровень» — при уровне N всего N очков, включая
 *    стартовое очко уровня 1; первая инициализация внутри обработчика НЕ
 *    дублирует — skip-if-init в module.ts);
 *  - achievement.unlocked → +points «крупной» ачивки по МАРКЕРУ ЗДЕСЬ
 *    (бриф: «маркер очков ДАННЫМИ в content/passives по СУЩЕСТВУЮЩИМ ачивкам,
 *    пул M15 61 НЕ расширять»);
 *  - mine.bossKilled → +perBoss за КАЖДУЮ победу над боссом слоя (живой канал
 *    платит за повторы; ретро — по флагам ачивок боссов, см. ниже).
 *
 * [DECISION · консистентность M15-обещания «passivePoint — слушатель M14»]
 * в маркер включены ВСЕ ачивки, чьи награды в контенте M15 уже несут
 * { t: 'passivePoint', qty: 1 } (11 шт.), с points = qty — семантика обещания
 * «эти ачивки дают очко пассивки» держится через маркер (поле rewards
 * пейлоада НЕ обрабатывается — единственный механизм по брифу, двойной счёт
 * исключён). Weekly-квесты с passivePoint-наградами остаются заделом: их
 * канал — quest.completed, подписка НЕ входит в санкционированные ×3.
 *
 * [DECISION · ретро-факты] ретро-подсчёт при первой инициализации среза — по
 * ФАКТАМ сейва, перечисленным брифом §0/§5: уровень (ровно N) + флаги
 * ach_mine_boss_N (perBoss за каждый) + «крупные» ачивки (Σ points открытых).
 * Повторные победы над боссами в ретро не восстанавливаются (живой канал
 * платит за каждый килл, ретро — по одному флагу на босса; задокументировано
 * открыто в M14.1-REPORT).
 */
import type { PassivesPointsTable } from './types';

export const PASSIVES_POINTS: PassivesPointsTable = {
  perLevel: 1,
  perBoss: 5,
  // «крупные» ачивки (маркер очков; 1..3 по брифу). Первые 11 — ачивки с
  // passivePoint-наградой контента M15 (консистентность, см. шапку); далее —
  // мастерство-вехи полного пула 61 (все id СУЩЕСТВУЮЩИЕ, пул не расширен).
  largeAchievements: [
    { id: 'ach_patience', points: 1 },
    { id: 'ach_tireless', points: 1 },
    { id: 'ach_valley_legend', points: 1 },
    { id: 'ach_reward_sage', points: 1 },
    { id: 'ach_full_collection', points: 1 },
    { id: 'ach_trade_empire', points: 1 },
    { id: 'ach_forge_legend', points: 1 },
    { id: 'ach_modesty', points: 1 },
    { id: 'ach_philosopher_stone', points: 1 },
    { id: 'ach_craft_grandmaster', points: 1 },
    { id: 'ach_full_workshop', points: 1 },
    { id: 'ach_mature_master', points: 1 },
    { id: 'ach_homestead_glory', points: 2 },
    { id: 'ach_agronomist', points: 2 },
    { id: 'ach_pond_master', points: 1 },
    { id: 'ach_river_master', points: 2 },
    { id: 'ach_lake_master', points: 2 },
  ],
  // боссовые ачивки (ретро-факты «победил босса слоя N»; живой канал —
  // mine.bossKilled, НЕ achievement.unlocked — двойной счёт исключён)
  bossAchievements: [
    'ach_mine_boss_1',
    'ach_mine_boss_2',
    'ach_mine_boss_3',
    'ach_mine_boss_4',
    'ach_mine_boss_5',
    'ach_mine_boss_6',
    'ach_mine_boss_7',
    'ach_mine_boss_8',
    'ach_mine_boss_9',
  ],
};
