/**
 * Манифест M12 (01-CORE §9): единственное место точек интеграции.
 *
 * [бриф SESSION-M12.1 F2] манифест 1.0.0 = факту; [M12.2 · G6] ОДИН bump
 * 1.0.0 → 1.1.0 (прецедент F16 M11.2): publicApi += mine.enter, mine.boss
 * (×6); eventsPublished += mine.bossKilled — РОВНО ×3 = каталогу 02 §4
 * С ФАЗЫ 0 (каталог НЕ редактировался; строка mine.bossKilled жила с фазы 0).
 * mine.runStarted/mine.runEnded — домен забега M13, НЕ публиковать.
 * eventsSubscribed [] (бой синхронный — тики не нужны); modifierProviders []
 * (runBuffProvider — M13); taskExecutors [] (босс-бой = действия игрока/debug,
 * НЕ автоматизация; работники шахте НЕ служат — карточка M11 §8: «помощники
 * шахты — M13, другой профиль»; реестр исполнителей 15 цел);
 * statsCounters [] (счётчики — срез mine; M15-пул расширялся только ачивками
 * ach_mine_boss_<n> — данные content/quests/achievements-mine.ts).
 */
import type { ModuleManifest } from '@/game/module-registry';

export function createMineManifest(): ModuleManifest {
  return {
    id: 'mine',
    title: 'M12 Шахта',
    version: '1.1.0',
    stateKey: 'mine',
    publicApi: ['mine.state', 'mine.mob', 'mine.fight', 'mine.elite', 'mine.enter', 'mine.boss'],
    eventsPublished: ['mine.turnResolved', 'mine.enemyKilled', 'mine.bossKilled'],
    eventsSubscribed: [],
    modifierProviders: [],
    taskExecutors: [],
    statsCounters: [],
  };
}
