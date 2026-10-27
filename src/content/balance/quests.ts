/**
 * БАЛАНС M15 «Квесты, ачивки, гейты» (карточка §3; числа — только здесь, П6).
 * Размеры роллов/пределы — стартовые (тюнюется); содержательный контент —
 * в content/quests/*, это только параметры движка.
 */
import type { StatId } from '@/shared/types/ids';

export interface QuestsTable {
  daily: {
    /** сколько квестов роллится в 00:00 (карточка §3: 3) */
    count: number;
    /** бесплатных замен в день (карточка §3: 1) */
    rerollsPerDay: number;
  };
  weekly: {
    /** сколько weekly-цепочек роллится на неделю (карточка §3: 3; пул меньше —
     *  роллится сколько есть, П5; полный пул — M15.2) */
    count: number;
  };
  /** час локального времени: напоминание о невзятых наградах (карточка §3: 22:00) */
  reminderHour: number;
  /** санитарные пределы среза (П5: битое — дефолт без падения) */
  sanity: {
    maxRollIds: number;
    maxBaseline: number;
    maxProgress: number;
    maxCompleted: number;
    maxChains: number;
    maxAchievements: number;
    maxFlags: number;
    maxGranted: number;
  };
  /** questFlagsProvider (§6 карточки): флаги, которые САМИ модифицируют стат —
   *  редко; обычно флаги читают гейты-оценщики. Пусто в M15.1: провайдер живой,
   *  данные добавятся с реальными потребностями (П1: строка = эффект). */
  flagModifiers: Array<{ flag: string; stat: StatId; op: 'flat' | 'inc' | 'more'; value: number }>;
}

export const QUESTS_TABLE: QuestsTable = {
  daily: { count: 3, rerollsPerDay: 1 },
  weekly: { count: 3 },
  reminderHour: 22,
  sanity: {
    maxRollIds: 16,
    maxBaseline: 300,
    maxProgress: 128,
    maxCompleted: 128,
    maxChains: 32,
    maxAchievements: 256,
    maxFlags: 256,
    maxGranted: 512,
  },
  flagModifiers: [],
};
