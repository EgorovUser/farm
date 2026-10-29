/**
 * Контент M17 «Профиль-заглушка» (бриф G4): состав выборки счётчиков
 * ядра для витрины профиля — ДАННЫЕ (id счётчика + подпись). Новый
 * счётчик в витрине = строка здесь, код не трогается (П1/П6).
 * Остальные поля профиля (уровень/XP, золото, ачивки, навыки, титул,
 * статус гейта деревни, репутация) — живые чтения deps (view.ts).
 */
import type { SocialProfileTable } from './types';

export const SOCIAL_PROFILE: SocialProfileTable = {
  counters: [
    { id: 'harvest.total', label: 'урожая собрано' },
    { id: 'fish.total', label: 'рыб поймано' },
    { id: 'craft.batches', label: 'партий крафта' },
    { id: 'forge.attempts', label: 'попыток заточки' },
    { id: 'mine.runs', label: 'забегов в шахте' },
    { id: 'mine.bosses.total', label: 'боссов повержено' },
    { id: 'shop.purchases', label: 'покупок в магазине' },
    { id: 'sell.gold', label: 'золота с продаж' },
    { id: 'trade.count', label: 'сделок биржи' },
    { id: 'achievements.unlocked.count', label: 'ачивок открыто' },
  ],
};
