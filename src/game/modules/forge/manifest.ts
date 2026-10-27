/**
 * Манифест M10 (01-CORE §9): единственное место точек интеграции модуля.
 * Зависимости — ТОЛЬКО ядро + общие реестры контента (карточка §7 «Границы»:
 * ривен-ролл карточек — M03, материалы — M04/M09, UI выбора — фаза 6):
 * доступ к рюкзаку, реестру, витрине craft.stations и карточным каналам
 * (modforge.rollFor / inventory.setRolls) — колбэки app-слоя через
 * ModuleRegistry (П4).
 *
 * События (каталог 02-BUSES §4): все 5 ЖИВЫ с M10.2 (R6:
 * levelUp/cardChosen опубликованы; декларация не менялась — bump только за
 * publicApi: +card/auto/offers, 1.0.0 → 1.0.1 по D24-букве).
 */
import type { ModuleManifest } from '@/game/module-registry';

export function createForgeManifest(): ModuleManifest {
  return {
    id: 'forge',
    title: 'M10 Заточка',
    version: '1.0.1',
    stateKey: 'forge',
    publicApi: [
      'forge.attempt',
      'forge.stats',
      'forge.info',
      'forge.buy',
      'forge.force',
      'forge.statScale',
      'forge.effectiveTier',
      'forge.levelOf',
      // --- [M10.2 · §5] карточки уровней (ручной режим + витрины)
      'forge.card',
      'forge.auto',
      'forge.offers',
    ],
    eventsPublished: [
      'forge.attempt',
      'forge.success',
      'forge.rollback',
      'forge.levelUp',
      'forge.cardChosen',
    ],
    eventsSubscribed: [],
    modifierProviders: ['forge.whetstone'],
    taskExecutors: [],
    statsCounters: [],
  };
}
