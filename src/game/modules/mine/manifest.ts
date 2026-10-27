/**
 * Манифест M13 (01-CORE §9): единственное место точек интеграции.
 *
 * [M12.2 · G6] bump 1.0.0 → 1.1.0 (прецедент F16 M11.2). [M13.1 · R7] ОДИН
 * bump 1.1.0 → 1.2.0: publicApi += ровно ×7 (mine.run, mine.pick, mine.gen,
 * mine.reveal, mine.torch, mine.upgrades, mine.upgrades.buy — итог ×13);
 * eventsPublished += ровно ×3 (mine.runStarted, mine.runEnded,
 * mine.cardResolved — каталог 02 §4, строки Task 70; итог ×6);
 * eventsSubscribed += player.hpChanged (идемпотентный death-обработчик R4 —
 * смерть завершает забег: cozy HP := 1, deaths+1, −20%/−5% runBag);
 * modifierProviders += runBuffProvider (итог ×1 — единый провайдер модуля:
 * алтари/статусы/насыщенность/Освещение); taskExecutors [] (реестр 15 ЦЕЛ —
 * работники шахте НЕ служат, карточка M11 §8); statsCounters [] (счётчик
 * mine.runs — объявление фазы 0, событие mine.runEnded, НЕ переобъявляется).
 *
 * priceModifierProviders += mineTraderProvider [DECISION — заявлено открыто:
 * поле НЕ входило в перечисление R7; кротовая наценка по канону 04-DISCOUNTS
 * §1 (источник скидок/наценок объявляется шине цен; крот ≠ M04-полка)].
 */
import type { ModuleManifest } from '@/game/module-registry';

export function createMineManifest(): ModuleManifest {
  return {
    id: 'mine',
    title: 'M12 Шахта',
    version: '1.2.0',
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
    ],
    eventsPublished: [
      'mine.turnResolved',
      'mine.enemyKilled',
      'mine.bossKilled',
      // --- [M13.1 · R7] каталог 02 §4, строки Task 70
      'mine.runStarted',
      'mine.runEnded',
      'mine.cardResolved',
    ],
    eventsSubscribed: [{ event: 'player.hpChanged', handler: 'onHpChanged' }],
    modifierProviders: ['runBuffProvider'],
    priceModifierProviders: ['mineTraderProvider'],
    taskExecutors: [],
    statsCounters: [],
  };
}
