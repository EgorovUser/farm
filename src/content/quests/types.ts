/**
 * КОНТЕНТ M15 «Квесты, ачивки, гейты» — типы (канон 03-DATA §9 «Прогрессии»).
 * QuestDef / AchievementDef / Reward — дословно по карточке; name — [M15]
 * аддитивное поле (03-DATA §12: расширяться можно, переименовывать нельзя):
 * событиям quest.completed / achievement.unlocked нужны имена для тостов и
 * журнала (02-BUSES §4, N2). ceremony — данные церемониального экрана (§4).
 */
import type { Condition } from '@/shared/types/requirement';
import type { CurrencyId, ID } from '@/shared/types/ids';

/** Награда (канон 03-DATA §9) */
export type Reward =
  | { t: 'currency'; id: CurrencyId; qty: number }
  | { t: 'item'; defId: ID; qty: number }
  | { t: 'passivePoint'; qty: number }
  | { t: 'flag'; flag: string }
  | { t: 'xp'; qty: number };

/** Шаг квеста/цепочки: условие + награды (канон 03-DATA §9) */
export interface QuestStepDef {
  id: ID;
  description: string;
  condition: Condition;
  rewards: Reward[];
}

/** Квест (канон 03-DATA §9 + name/ceremony — аддитивно, см. шапку) */
export interface QuestDef {
  id: ID;
  kind: 'daily' | 'weekly' | 'chain';
  name: string;
  steps: QuestStepDef[];
  /** следующая цепочка сюжетного продолжения (§4 карточки) */
  nextChain?: ID;
  /** гейт выдачи квеста в ролл/список (Requirement = Condition) */
  unlock?: Condition;
  /** цепочка: церемониальный текст завершения (данные для UI-экрана, фаза 6) */
  ceremony?: string;
}

/** Ачивка (канон 03-DATA §9): счётчики → награды → unlockFlags-гейты */
export interface AchievementDef {
  id: ID;
  name: string;
  condition: Condition;
  rewards?: Reward[];
  /** флаги, на которые смотрят гейты M04/M07/M12/M16 (производятся при unlock) */
  unlockFlags?: string[];
  /** hidden: до unlock не видна в списках (пасхалки, §5 карточки) */
  hidden?: boolean;
}
