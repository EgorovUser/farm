/**
 * Манифест M17 (01-CORE §9): ЧИСТЫЙ модуль-проекция (бриф G1).
 * Версия 1.0.0 — рождение модуля (16-й по счёту, Фаза 5).
 *  - publicApi ровно ×5 (точечные имена — корпусная конвенция M161-OBS-3,
 *    прецедент village): social.state (день/прочтено/статус деревни/титул),
 *    social.board (заметки дня), social.mail (+ под-действие 'read' —
 *    пометить прочитанным, идемпотентно), social.profile (визитка),
 *    social.force (dev: реролл витрин дня — сид-суффикс #N, прецедент
 *    village.force; НЕ сбрасывает mailReadDay);
 *  - eventsPublished [] / eventsSubscribed [] — публикация/подписка
 *    событий = 0 (каталог 02 §4 НЕ редактировался);
 *  - modifierProviders [] / priceModifierProviders [] — шины не трогаем;
 *  - taskExecutors [] / statsCounters [] — реестры не растут.
 * Оракул реестра в self-группе «M17 Соц»: события/провайдеры/счётчики/
 * задачи реестра НЕ изменились (нейтральность).
 */
import type { ModuleManifest } from '@/game/module-registry';

export function createSocialManifest(): ModuleManifest {
  return {
    id: 'social',
    title: 'M17 Соц',
    version: '1.0.0',
    stateKey: 'social',
    publicApi: [
      'social.state',
      'social.board',
      'social.mail',
      'social.profile',
      // dev (бриф G1: помечен dev — прецедент village.force)
      'social.force',
    ],
    eventsPublished: [],
    eventsSubscribed: [],
    modifierProviders: [],
    priceModifierProviders: [],
    taskExecutors: [],
    statsCounters: [],
  };
}
