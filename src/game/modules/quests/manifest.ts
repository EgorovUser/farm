/**
 * Манифест M15 (01-CORE §9 + D24): единственное место точек интеграции.
 *
 * eventsPublished — 4 ЖИВЫХ события, паритет = факт (урок MEL-D):
 *  - quest.progress / quest.completed / achievement.unlocked — каталог
 *    02-BUSES §4 (строка «квесты M15»), имена и payload — по карточке §6/N2;
 *  - quest.reminder — [DECISION · M15.1] событие-напоминание 22:00 требует
 *    бриф (§3/§4.4 «невзятые награды пропадают мягко»); файл 02-BUSES НЕ
 *    редактировался (каталог заморожен), имя следует конвенции
 *    <модуль>.<сущность>.<действие>, декларация — здесь (манифест и есть
 *    реестр событий модуля).
 *
 * eventsSubscribed — ДАННЫЕ: уникальные события конфига счётчиков (M01 §6,
 * N3 — при добавлении счётчика данными подписка появляется сама) + фиксированный
 * движковый минимум (уровень/навыки/предметы для не-счётчиковых условий,
 * границы времени). Порядок обработки: после M01 (montage последним) —
 * счётчики подняты до переоценки.
 */
import type { ModuleManifest } from '@/game/module-registry';
import type { CounterDef } from '@/content/player/counters';

export function createQuestsManifest(counters: readonly CounterDef[]): ModuleManifest {
  const counterEvents = [...new Set(counters.map((c) => c.event))];
  const engineEvents = [
    'player.levelUp',
    'skill.levelUp',
    'item.acquired',
    'item.sold',
    'item.consumed',
    'time.dayTick',
    'time.hourTick',
  ];
  const eventsSubscribed = [...new Set([...counterEvents, ...engineEvents])].map((event) => ({
    event,
    handler: event === 'time.dayTick' ? 'onDayTick' : event === 'time.hourTick' ? 'onHourTick' : 'onGameDataEvent',
  }));
  return {
    id: 'quests',
    title: 'M15 Квесты и ачивки',
    version: '1.0.0',
    stateKey: 'quests',
    publicApi: [
      // ядро API (карточка §6)
      'quests.list',
      'quests.claim',
      'quests.rerollDaily',
      'quests.chainProgress',
      // app-шов (прецедент shop.ensureStock): холодная загрузка/пропущенный день
      'quests.ensureDay',
      // app-шов гейтов (M15.2 · N10): флаги/ачивки для чужих gateExtras
      'quests.gateExtras',
      // dev-витрины §4.6 (консоль — интерфейс фаз 0–5)
      'quests.roll',
      'quests.complete',
      'quests.unlockAch',
      'quests.flags',
    ],
    eventsPublished: ['quest.progress', 'quest.completed', 'quest.reminder', 'achievement.unlocked'],
    eventsSubscribed,
    modifierProviders: ['questFlagsProvider'],
    statsCounters: [],
  };
}
