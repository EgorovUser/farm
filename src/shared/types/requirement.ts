/**
 * Условия и требования — декларативные, data-only (03-DATA §2).
 * Единый оценщик checkCondition живёт в shared/utils/condition-check.ts
 * и используется ВСЕМИ системами (гейты, блокировки, страхи, требования).
 *
 * [M15 · аддитивное расширение] вариант counterAtLeast + доступ ctx.counter:
 * квесты/ачивки (M15) читают счётчики ядра (M01 §6, N3) — «успешных заточек
 * ≥ M» иначе не выразить. 03-DATA §12: поля интерфейсов расширяются, но не
 * переименовываются; все прежние варианты неизменны. Прецедент — C1.
 */
import type { ID, StatId, Tag } from './ids';

export type Condition =
  | { t: 'ctxTag'; tag: Tag }
  | { t: 'statAtLeast'; stat: StatId; value: number }
  | { t: 'statAtMost'; stat: StatId; value: number }
  | { t: 'flag'; flag: string }
  | { t: 'skill'; skill: ID; level: number }
  | { t: 'playerLevel'; level: number }
  | { t: 'achievement'; id: ID }
  | { t: 'hasItem'; defId: ID; qty?: number }
  | { t: 'counterAtLeast'; counter: string; value: number }
  | { t: 'not'; c: Condition }
  | { t: 'all'; cs: Condition[] }
  | { t: 'any'; cs: Condition[] };

/** Гейты: то же самое, но для «можно ли» */
export type Requirement = Condition;

/** Данные, необходимые оценщику условий. Заполняет вызывающая сторона. */
export interface ConditionCtx {
  tags: Tag[];
  /** Чтение стата — через StatBus (лениво, только если условие попросит) */
  stat: (stat: StatId) => number;
  /** unlockFlag'и ачивок/квестов */
  hasFlag: (flag: string) => boolean;
  /** уровень навыка или 0 */
  skillLevel: (skill: ID) => number;
  /** уровень игрока */
  playerLevel: number;
  /** количество предмета в инвентаре */
  itemCount: (defId: ID) => number;
  /** выданные ачивки */
  hasAchievement: (id: ID) => boolean;
  /** [M15] значение счётчика ядра; опционально — построители чужих контекстов
   *  не обязаны его поставлять (старые вызовы не ломаются), семантика —
   *  «сколько уже набрано» (для daily/weekly M15 — от базовой линии дня) */
  counter?: (id: string) => number;
}
