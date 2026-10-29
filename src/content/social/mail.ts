/**
 * Контент M17 «Письма дня» (бриф G3): пул шаблонов-заглушек. Авторы —
 * жители/партнёры (живое состояние через deps); текст строится из
 * ТЕКУЩЕГО live-состояния автора (просит / благодарит / предупреждает
 * о рейде / хвастает трендом) + dailySeed-выбор потоком «social-letters».
 * Писем прошлых дней НЕТ (архив — замок M18); вложения-награды ЗАПРЕЩЕНЫ
 * (экономическая нейтральность — замок done-критерия Фазы 5).
 */
import type { SocialMailTable } from './types';

export const SOCIAL_MAIL: SocialMailTable = {
  lettersPerDay: { min: 0, max: 2 },
  countWeights: [20, 55, 25],
  templates: [
    {
      id: 'mail_request_1',
      kind: 'request',
      subject: 'Просьба о помощи',
      body: 'Здравствуй, сосед! Не найдётся ли у тебя {item} ×{qty}? Очень нужно для хозяйства. — {author}',
      weight: 70,
    },
    {
      id: 'mail_request_2',
      kind: 'request',
      subject: 'Нужна твоя помощь',
      body: '{author} пишет: хозяйство ждёт {item} ×{qty}. Не выручишь ли? — {author}',
      weight: 40,
    },
    {
      id: 'mail_thanks_1',
      kind: 'thanks',
      subject: 'Спасибо за посылку',
      body: '{author} передаёт благодарность за {item} — сегодня в доме праздник! Заходи на пирог.',
      weight: 60,
    },
    {
      id: 'mail_thanks_2',
      kind: 'thanks',
      subject: 'Благодарное письмо',
      body: 'Дорогой сосед, {item} пришёлся кстати. {author} счастлива и кланяется. — {author}',
      weight: 35,
    },
    {
      id: 'mail_raid_1',
      kind: 'raid-warning',
      authorFallback: 'староста',
      subject: 'Огни в лесу!',
      body: 'Разведка видела огни у частокола. Проверь защиту деревни — рейд может прийти этой ночью. — {author}',
      weight: 90,
    },
    {
      id: 'mail_raid_2',
      kind: 'raid-warning',
      authorFallback: 'староста',
      subject: 'Тревожные вести',
      body: '{author} просил передать: у частокола неспокойно. Гоблины собираются — готовь стены и оружие. — {author}',
      weight: 55,
    },
    {
      id: 'mail_trend_1',
      kind: 'trend-boast',
      subject: 'Рыночные новости',
      body: '{author} хвастается: на бирже {item} — {trend}! Выгодная сделка близко. — {author}',
      weight: 65,
    },
    {
      id: 'mail_trend_2',
      kind: 'trend-boast',
      subject: 'Торговые слухи',
      body: 'Письмо от {author}: {item} нынче в цене — {trend}! Самое время торговать. — {author}',
      weight: 40,
    },
  ],
};
