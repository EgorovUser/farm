/**
 * Манифест M08 (01-CORE §9, образец — pen/fishing): единственное место
 * точек интеграции модуля.
 *
 * [M08.2 · F16 · ОДИН bump за сеанс 1.0.0 → 1.1.0 — прецедент pen M06.2 /
 * fishing M07.2]: publicApi ×9 → ×12 (+= lake.upgrade [F10], lake.switch
 * [F14], lake.research [F13]; dev-слот lake.force расширен research-сбросом
 * без нового имени); modifierProviders [] → ['lake.upgrades'] [DECISION-id
 * по канону живых провайдеров (fishing.bait); карточное имя
 * lakeUpgradesProvider] — Инкубатор flat +10 к lake.mutation.plus1Bonus +
 * cap X ≤ 40 (пер-озёрные теги lake:N); taskExecutors [] → ×4
 * (lake.feed/treat/clean/harvest — тонкие обёртки publicApi, 02 §10;
 * работники НЕ строятся — M11; worker.actionDone НЕ публикуется — домен M11).
 *
 * eventsPublished — ПО-ПРЕЖНЕМУ РОВНО ['lake.bred', 'lake.fishSick']
 * (= каталогу 02 §4 с фазы 0; НОВЫХ шинных событий сеанс НЕ вводит:
 * research/upgrade/switch/autofeed — команды/транзакции/стримы).
 *
 * eventsSubscribed — прежние тики час/день (дрейф/болезни/разведение/икра/
 * автокормушка — hourTick/dayTick по ОБЕИМ озёрам, F14).
 *
 * statsCounters — ПУСТО в манифесте (счётчики lake.* — конфиг ядра M01 §6
 * данными, content/player/counters.ts — право касания по прецеденту
 * «Грибник» M06.1 / fish.<fishId> M07.2).
 */
import type { ModuleManifest } from '@/game/module-registry';

export function createLakeManifest(): ModuleManifest {
  return {
    id: 'lake',
    title: 'M08 Озеро',
    version: '1.1.0',
    stateKey: 'lake',
    publicApi: [
      'lake.state',
      'lake.release',
      'lake.feed',
      'lake.treat',
      'lake.clean',
      'lake.harvest',
      'lake.buy',
      // --- [M08.2 · F10/F13/F14] улучшения/лаборатория/второе озеро
      'lake.upgrade',
      'lake.switch',
      'lake.research',
      // --- dev: форс-пара/икра/болезнь/сброс кулдауна (карточка §6)
      'lake.pair',
      'lake.force',
    ],
    eventsPublished: ['lake.bred', 'lake.fishSick'],
    eventsSubscribed: [
      { event: 'time.hourTick', handler: 'onHourTick' },
      { event: 'time.dayTick', handler: 'onDayTick' },
    ],
    modifierProviders: ['lake.upgrades'],
    taskExecutors: ['lake.feed', 'lake.treat', 'lake.clean', 'lake.harvest'],
    statsCounters: [],
  };
}
