/**
 * Манифест M03 (01-CORE §9): единственное место точек интеграции модуля.
 * Зависимости — ТОЛЬКО ядро (карточка §9: RngBus, реестр данных); потребители
 * (M02/M10/M11/M13) зовут rollFor через ModuleRegistry (П4).
 *
 * [M02-шов D36] inventory.setRolls и реролл-API появятся в M03.3 — версия
 * манифеста будет поднята вместе с ними (манифест = факту).
 *
 * Событие modforge.rolled — каталог ядра 02-BUSES §4 [ДОБАВЛЕНО 2026-10-23]:
 * публикуется на каждый ролл через публичный API (движок-rollFor чист и
 * событий не шлёт — «шансы/роллы честно видны» строятся на ленте, П6).
 *
 * [M03.3] API += реролл-цикл §6: 'modforge.reroll' (платный ролл варианта),
 * 'modforge.choose' (выбор игрока, сброс инфляции), 'modforge.rerollView'
 * (состояние циклов), 'modforge.rerollCost' (цена по попыткам). Доступ
 * к предмету — колбэки app-слоя на inventory.setRolls/list (П4). Версия
 * 1.0.0 → 1.1.0 (манифест = факту).
 *
 * [M04.1] 1.1.0 → 1.2.0 (аддитивно, C4/C6 · AUDIT-M03): 'modforge.rollItem'
 * принимает опциональный streamKey — именованный стрим RngBus на выдаче
 * (магазин передаёт shop:issue:<seq>); колбэк saveId — основа сида реролла
 * (C6: hash(saveId, iid, attempts), стабилен ВСЕГДА, не от дня).
 *
 * [M04.2 · C2] 1.2.0 → 1.3.0 (СМЕНА СИГНАТУРЫ): 'modforge.rerollCost'
 * теперь (rarity, attempts) — база цены по редкости предмета (бриф-вариант
 * 10/20/40/80/150 + mythic 300, кап ×10 базы); плоская база 10 ратифицирована
 * аудитом только на фазу 1 (пересмотр C2 при живом золотом цикле M04).
 */
import type { ModuleManifest } from '@/game/module-registry';

export function createModForgeManifest(): ModuleManifest {
  return {
    id: 'modforge',
    title: 'M03 Модфордж',
    version: '1.3.0',
    stateKey: 'modforge',
    publicApi: [
      'modforge.rollFor',
      'modforge.rollItem',
      'modforge.costOf',
      // --- M03.3: реролл-цикл §6
      'modforge.reroll',
      'modforge.choose',
      'modforge.rerollView',
      'modforge.rerollCost',
    ],
    eventsPublished: ['modforge.rolled'],
    eventsSubscribed: [],
    statsCounters: [],
  };
}
