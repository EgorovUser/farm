/**
 * Общие правила контента M01 (переиспользуются progression.ts и skills.ts).
 * Держим отдельно, чтобы файлы данных оставались данными (01-CORE §6).
 */
import type { ID, Op, StatId } from '@/shared/types/ids';

/** Правило «событие → сколько XP»: фиксированное число или ключ из пейлоада */
export interface XpEventRule {
  event: string;
  /** фиксированное количество XP */
  xp?: number;
  /** ключ числового поля пейлоада (квесты: 50–500 — количество в данных квеста) */
  xpKey?: string;
}

/** Модификатор в данных навыка — та же форма, что Modifier шины (02-BUSES §2) */
export interface SkillModDef {
  stat: StatId;
  op: Op;
  value: number;
  label?: string;
}
