/**
 * Манифест M13 (01-CORE §9): единственное место точек интеграции.
 *
 * [M12.2 · G6] bump 1.0.0 → 1.1.0 (прецедент F16 M11.2). [M13.1 · R7] ОДИН
 * bump 1.1.0 → 1.2.0: publicApi += ровно ×7 (итог ×13); eventsPublished +=
 * ровно ×3 (итог ×6); eventsSubscribed += player.hpChanged;
 * modifierProviders += runBuffProvider (итог ×1); priceModifierProviders
 * += mineTraderProvider [DECISION — вне перечисления R7, канон 04 §1].
 *
 * [M13.2 · R10] ЗАКРЫВАЮЩИЙ bump сеанса модуля 1.2.0 → 1.3.0 (паттерн M12.2
 * 1.0.0 → 1.1.0): publicApi += ровно ×3 (mine.helpers / mine.helpers.hire /
 * mine.helpers.fire — итог ×16; имена — карточка §5 helpers board/hire +
 * fire симметрично quit); eventsPublished += ровно ×3 (helper.hired /
 * helper.quit / helper.levelReputation — каталог 02 §4, строки Task 70;
 * итог ×9); eventsSubscribed БЕЗ изменений (player.hpChanged уже жив;
 * перк медика — в цепи смерти обёрткой, НЕ новой подпиской); taskExecutors []
 * (helpers ≠ работники M11 — «нанимаются на забеги, не на обслуживание»);
 * statsCounters [] (mine.runs фазы 0 достаточно; данные helpers — срез).
 */
import type { ModuleManifest } from '@/game/module-registry';

export function createMineManifest(): ModuleManifest {
  return {
    id: 'mine',
    title: 'M12 Шахта',
    version: '1.3.0',
    stateKey: 'mine',
    publicApi: [
      'mine.state',
      'mine.mob',
      'mine.fight',
      'mine.elite',
      'mine.enter',
      'mine.boss',
      // --- [M13.1 · R7] забег: витрина/выбор/оракул/debug/факел/улучшения
      'mine.run',
      'mine.pick',
      'mine.gen',
      'mine.reveal',
      'mine.torch',
      'mine.upgrades',
      'mine.upgrades.buy',
      // --- [M13.2 · R10] помощники: доска+состав / наём / увольнение
      'mine.helpers',
      'mine.helpers.hire',
      'mine.helpers.fire',
    ],
    eventsPublished: [
      'mine.turnResolved',
      'mine.enemyKilled',
      'mine.bossKilled',
      // --- [M13.1 · R7] каталог 02 §4, строки Task 70
      'mine.runStarted',
      'mine.runEnded',
      'mine.cardResolved',
      // --- [M13.2 · R10] каталог 02 §4, строки Task 70 (для сеанса M13.2)
      'helper.hired',
      'helper.quit',
      'helper.levelReputation',
    ],
    eventsSubscribed: [{ event: 'player.hpChanged', handler: 'onHpChanged' }],
    modifierProviders: ['runBuffProvider'],
    priceModifierProviders: ['mineTraderProvider'],
    taskExecutors: [],
    statsCounters: [],
  };
}
