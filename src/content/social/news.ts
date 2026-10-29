/**
 * Контент M17 «Доска новостей деревни» (бриф G2): шаблоны заметок по
 * категориям фактов live-состояния. Плейсхолдеры заполняет логика
 * (modules/social/logic.ts) значениями витрин village; выбор заметок
 * дня — dailySeed-поток «social-board» (НЕ пересекается с существующими
 * сидами: village-needs / village-raid / ротация магазина / контракты).
 */
import type { SocialNewsTable } from './types';

export const SOCIAL_NEWS: SocialNewsTable = {
  notesPerDay: { min: 3, max: 5 },
  templates: [
    // --- голова сводки (первые две заметки дня — всегда, бриф G2 «сводка»)
    { id: 'news_level_1', kind: 'village-level', weight: 100, text: 'Деревня живёт: уровень {level} из {levelMax}, опыт {xp}' },
    { id: 'news_level_2', kind: 'village-level', weight: 60, text: 'Сводка дня: деревня уровня {level}, опыт {xp}' },
    { id: 'news_tax_1', kind: 'tax', weight: 100, text: 'Налог дня: в казну ждут {gold}з (среднее счастье {avg}, ворчунов {grumblers})' },
    { id: 'news_tax_2', kind: 'tax', weight: 60, text: 'Казначей считает: налог дня — {gold}з' },
    // --- жители
    { id: 'news_request_1', kind: 'villager-request', weight: 70, text: '{name} просит: {item} ×{qty}' },
    { id: 'news_request_2', kind: 'villager-request', weight: 40, text: 'Объявление от {name}: нужна помощь — {item} ×{qty}' },
    { id: 'news_grumbler_1', kind: 'villager-grumbler', weight: 90, text: '{name} ворчит {days}-й день подряд — счастье {happiness}/100' },
    { id: 'news_grumbler_2', kind: 'villager-grumbler', weight: 50, text: 'Слухи у колодца: {name} недоволен ({days} дн.)' },
    { id: 'news_happy_1', kind: 'villager-happy', weight: 45, text: '{name} доволен ({happiness}/100): {item} доставлен сегодня' },
    { id: 'news_happy_2', kind: 'villager-happy', weight: 25, text: '{name} улыбается: день задался ({happiness}/100)' },
    // --- постройки
    { id: 'news_built_1', kind: 'building-built', weight: 55, text: 'Постройка «{building}»: уровень {level}' },
    { id: 'news_constr_1', kind: 'building-construction', weight: 80, text: 'Стройка: «{building}» — готовность через {hours} ч' },
    // --- биржа
    { id: 'news_trend_1', kind: 'trade-trend', weight: 65, text: 'Биржа: {item} — {trend}' },
    { id: 'news_deal_1', kind: 'trade-deal', weight: 75, text: 'Сделка дня: {partner} забрал {item} ×{qty}' },
    // --- рейд
    { id: 'news_raidwarn_1', kind: 'raid-warning', weight: 95, text: 'Разведка видела огни у частокола — рейд близко' },
    { id: 'news_raidquiet_1', kind: 'raid-quiet', weight: 35, text: 'Тихо у частокола: следующий рейд — {weekday} в {hour}:00 (через {hours} ч)' },
    { id: 'news_raidresult_1', kind: 'raid-result', weight: 85, text: 'Итог рейда недели: {result}' },
    // --- очередь жителей
    { id: 'news_waiting_1', kind: 'villagers-waiting', weight: 30, text: 'У ворот ждут открытия: {count} будущих жителей' },
  ],
};
