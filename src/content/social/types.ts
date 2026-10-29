/**
 * Типы контента M17 «Соц-заглушки» (03-DATA-стиль): витринные шаблоны
 * доски новостей / писем дня / состава профиля. Всё — ДАННЫЕ (П1):
 * логика — обобщённые функции в modules/social/logic.ts, заполняющие
 * плейсхолдеры {name} {item} {qty} … значениями живого состояния.
 */
import type { ID } from '@/shared/types/ids';

/** категория факта live-состояния для заметки доски (бриф G2) */
export type SocialNewsKind =
  | 'village-level'
  | 'tax'
  | 'villager-request'
  | 'villager-grumbler'
  | 'villager-happy'
  | 'building-built'
  | 'building-construction'
  | 'trade-trend'
  | 'trade-deal'
  | 'raid-warning'
  | 'raid-quiet'
  | 'raid-result'
  | 'villagers-waiting';

/** шаблон заметки: строка с плейсхолдерами; вес — в выборе дня */
export interface SocialNewsTemplate {
  id: ID;
  kind: SocialNewsKind;
  text: string;
  weight: number;
}

export interface SocialNewsTable {
  /** заметок в день (бриф G2 «3–5»): голова сводки (уровень+налог) — всегда */
  notesPerDay: { min: number; max: number };
  templates: SocialNewsTemplate[];
}

/** тип письма дня (бриф G3: просит / благодарит / предупреждает / хвастает) */
export type SocialMailKind = 'request' | 'thanks' | 'raid-warning' | 'trend-boast';

/** шаблон письма: subject/body с плейсхолдерами; authorFallback — для типов
 *  без живого автора (предвестник рейда пишет «староста») */
export interface SocialMailTemplate {
  id: ID;
  kind: SocialMailKind;
  authorFallback?: string;
  subject: string;
  body: string;
  weight: number;
}

export interface SocialMailTable {
  /** писем в день (бриф G3 «0–2») + веса распределения количества [0,1,2] */
  lettersPerDay: { min: number; max: number };
  countWeights: [number, number, number];
  templates: SocialMailTemplate[];
}

/** состав профиля: выборка счётчиков ядра — ДАННЫЕ (бриф G4) */
export interface SocialProfileCounter {
  id: ID;
  label: string;
}

export interface SocialProfileTable {
  counters: SocialProfileCounter[];
}
