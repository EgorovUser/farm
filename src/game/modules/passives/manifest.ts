/**
 * Манифест M14 (01-CORE §9): единственное место точек интеграции.
 * Манифест 1.0.0 = факту сеанса M14.1 (бриф §0):
 *  - publicApi ×5 [DECISION-имена]: passives.state (витрина очков/среза),
 *    passives.tree (текстовая витрина дерева), passives.alloc <nodeId>,
 *    passives.refund <nodeId|all>, passives.canReach <nodeId>;
 *  - eventsPublished ровно ×1: passive.allocated — каталог 02 §4 С ФАЗЫ 0,
 *    каталог НЕ редактируется (refund-события НЕТ — витрина достаточна);
 *  - eventsSubscribed ×3 (бриф §0): player.levelUp / achievement.unlocked /
 *    mine.bossKilled — каналы очков;
 *  - modifierProviders: passivesProvider (перечисляет модификаторы
 *    выделенных узлов; passive.allocated → invalidate.stat);
 *  - taskExecutors/statsCounters [] (пассивки — не автоматизация; реестр
 *    задач 15 жив, счётчики — домен M01).
 */
import type { ModuleManifest } from '@/game/module-registry';

export function createPassivesManifest(): ModuleManifest {
  return {
    id: 'passives',
    title: 'M14 Пассивки',
    version: '1.0.0',
    stateKey: 'passives',
    publicApi: [
      'passives.state',
      'passives.tree',
      'passives.alloc',
      'passives.refund',
      'passives.canReach',
      // dev-точка (бриф F7 «passives reset — dev, помечен»; прецеденты
      // lake.force / workers.dev / mine.reveal — манифест = факту)
      'passives.reset',
    ],
    eventsPublished: ['passive.allocated'],
    eventsSubscribed: [
      { event: 'player.levelUp', handler: 'onLevelUp' },
      { event: 'achievement.unlocked', handler: 'onAchievementUnlocked' },
      { event: 'mine.bossKilled', handler: 'onBossKilled' },
    ],
    modifierProviders: ['passivesProvider'],
    taskExecutors: [],
    statsCounters: [],
  };
}
