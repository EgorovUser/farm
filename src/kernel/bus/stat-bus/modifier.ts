/**
 * Модель модификатора — канонический контракт (02-BUSES §2, копия в 03-DATA §3).
 *
 * [РАСШИРЕНИЕ] Поля сверх ТЗ: `expiresAt` (абсолютный конец действия), `capDir`
 * (направление капа), `label` (подпись для UI/debug), `StatMeta.round/min` в шине.
 * Подробные обоснования — в [DECISION]-блоках ниже и в worklog Фазы 0.
 *
 * [DECISION] Расширение против ТЗ: добавлено поле `expiresAt?: number` (абсолютная
 * дата, epoch ms) рядом с декларативным `duration`. Причина: принцип абсолютных
 * таймеров (01-CORE §8/02-BUSES §8) — «на 10 минут» не вычислимо без точки старта.
 * duration остаётся описанием для UI, expiresAt — истиной для шины.
 *
 * [DECISION] Расширение против ТЗ: `capDir?: 'max' | 'min'` для операции cap —
 * в ТЗ «ограничение сверху ИЛИ снизу», но не сказано, как различать. По умолчанию 'max'.
 */
import type { Condition } from '@/shared/types/requirement';
import type { ID, Op, StatId, Tag } from '@/shared/types/ids';

export type ModifierSourceKind =
  | 'item'
  | 'passive'
  | 'buff'
  | 'skill'
  | 'shop'
  | 'worker'
  | 'helper'
  | 'village'
  | 'upgrade'
  | 'debuff'
  | 'event';

export interface ModifierSource {
  kind: ModifierSourceKind;
  refId: string;
}

export interface ModifierDuration {
  kind: 'ticks' | 'seconds' | 'days' | 'runs';
  value: number;
}

export interface Modifier {
  /** 'passive.node42' | 'forge.card@12' | 'buff.pie7' */
  id: string;
  source: ModifierSource;
  /** 'player.energy.max', 'farm.growthSpeed' */
  stat: StatId;
  op: Op;
  /** для cap value = граница */
  value: number;
  /** контекст-теги: ['fishing','night','layer:3'] — ВСЕ должны быть в ctx (AND) */
  tags?: Tag[];
  /** когда действует (синтаксис 03-DATA §2) */
  conditions?: Condition[];
  /** в группе берётся max, остальные игнорируются */
  stackGroup?: string;
  /** для override: побеждает max(priority) */
  priority?: number;
  /** иначе постоянно */
  duration?: ModifierDuration;
  /** [DECISION] абсолютный конец действия; отсутствует = бессрочно */
  expiresAt?: number;
  /** подпись для UI/debug, кто выдал */
  label?: string;
}

export interface ResolveCtx {
  player: ID;
  now: number;
  location?: Tag;
  tags?: Tag[];
  extra?: Record<string, unknown>;
}

export interface ModifierProvider {
  id: ID;
  provide(stat: StatId, ctx: ResolveCtx): Modifier[];
}

/** Правило округления стата (02-BUSES §3 шаг 5) */
export type { Rounding } from '@/shared/utils/math';
