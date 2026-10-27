/**
 * Zod-схемы контента M15 (03-DATA §11: битый контент = отказ с путём поля).
 * Форма — здесь; ссылочная целостность (предметы/валюты наград, счётчики
 * условий против конфига M01) — self-check'ом группы M15 (прецедент M09/M10:
 * «реестр валидирует форму, связи — чеки»).
 */
import { z } from 'zod';
import type { Condition } from '@/shared/types/requirement';

const ID_RE = /^[a-z0-9_]+$/;
const FLAG_RE = /^[a-z0-9_.:]+$/;
const qty = z.number().int().min(1);

/** Условие (03-DATA §2 + [M15] counterAtLeast) — рекурсивно, data-only */
const conditionSchema: z.ZodType<Condition> = z.lazy(() =>
  z.discriminatedUnion('t', [
    z.object({ t: z.literal('ctxTag'), tag: z.string().min(1) }).strict(),
    z.object({ t: z.literal('statAtLeast'), stat: z.string().min(1), value: z.number().finite() }).strict(),
    z.object({ t: z.literal('statAtMost'), stat: z.string().min(1), value: z.number().finite() }).strict(),
    z.object({ t: z.literal('flag'), flag: z.string().min(1) }).strict(),
    z.object({ t: z.literal('skill'), skill: z.string().regex(ID_RE), level: z.number().int().min(1) }).strict(),
    z.object({ t: z.literal('playerLevel'), level: z.number().int().min(1) }).strict(),
    z.object({ t: z.literal('achievement'), id: z.string().regex(ID_RE) }).strict(),
    z.object({ t: z.literal('hasItem'), defId: z.string().regex(ID_RE), qty: qty.optional() }).strict(),
    z.object({ t: z.literal('counterAtLeast'), counter: z.string().regex(/^[a-z0-9_.]+$/), value: z.number().int().min(1) }).strict(),
    z.object({ t: z.literal('not'), c: conditionSchema }).strict(),
    z.object({ t: z.literal('all'), cs: z.array(conditionSchema).min(1) }).strict(),
    z.object({ t: z.literal('any'), cs: z.array(conditionSchema).min(1) }).strict(),
  ]),
);

/** Награда (канон 03-DATA §9) */
const rewardSchema = z.discriminatedUnion('t', [
  // валюты кошелька: gold/planks/nails/... (каталог — content/player/currencies)
  z.object({ t: z.literal('currency'), id: z.string().regex(/^[a-z0-9_:]+$/), qty }).strict(),
  z.object({ t: z.literal('item'), defId: z.string().regex(ID_RE), qty }).strict(),
  z.object({ t: z.literal('passivePoint'), qty }).strict(),
  z.object({ t: z.literal('flag'), flag: z.string().regex(FLAG_RE) }).strict(),
  z.object({ t: z.literal('xp'), qty }).strict(),
]);

const stepSchema = z
  .object({
    id: z.string().regex(ID_RE),
    description: z.string().min(1),
    condition: conditionSchema,
    rewards: z.array(rewardSchema),
  })
  .strict();

const questDefSchema = z
  .object({
    id: z.string().regex(ID_RE),
    kind: z.enum(['daily', 'weekly', 'chain']),
    name: z.string().min(1),
    steps: z.array(stepSchema).min(1),
    nextChain: z.string().regex(ID_RE).optional(),
    unlock: conditionSchema.optional(),
    ceremony: z.string().min(1).optional(),
  })
  .strict()
  // [M15.1 · границы фазы 2] daily/weekly-пул — одношаговые «сделай X»
  // (мультишаговые — жанр weekly-цепочек и chain по карточке §3; M15.2 расширит)
  .refine((q) => q.kind !== 'daily' || q.steps.length === 1, {
    message: 'daily-шаблон — ровно один шаг (мультишаг — weekly/chain)',
  });

export const questsDailySchema = z
  .array(questDefSchema)
  .refine((pool) => pool.every((q) => q.kind === 'daily'), { message: 'пул daily: kind всех шаблонов — daily' });

export const questsWeeklySchema = z
  .array(questDefSchema)
  .refine((pool) => pool.every((q) => q.kind === 'weekly'), { message: 'пул weekly: kind всех шаблонов — weekly' });

export const questsChainsSchema = z
  .array(questDefSchema)
  .refine((pool) => pool.every((q) => q.kind === 'chain'), { message: 'пул chains: kind всех шаблонов — chain' });

export const achievementsSchema = z.array(
  z
    .object({
      id: z.string().regex(ID_RE),
      name: z.string().min(1),
      condition: conditionSchema,
      rewards: z.array(rewardSchema).optional(),
      unlockFlags: z.array(z.string().regex(FLAG_RE)).optional(),
      hidden: z.boolean().optional(),
    })
    .strict(),
);

/** Баланс движка (content/balance/quests.ts) */
export const questsTableSchema = z
  .object({
    daily: z.object({ count: z.number().int().min(1).max(12), rerollsPerDay: z.number().int().min(0).max(10) }).strict(),
    weekly: z.object({ count: z.number().int().min(1).max(12) }).strict(),
    reminderHour: z.number().int().min(0).max(23),
    sanity: z
      .object({
        maxRollIds: z.number().int().min(1),
        maxBaseline: z.number().int().min(1),
        maxProgress: z.number().int().min(1),
        maxCompleted: z.number().int().min(1),
        maxChains: z.number().int().min(1),
        maxAchievements: z.number().int().min(1),
        maxFlags: z.number().int().min(1),
        maxGranted: z.number().int().min(1),
      })
      .strict(),
    flagModifiers: z.array(
      z
        .object({
          flag: z.string().regex(FLAG_RE),
          stat: z.string().min(1),
          op: z.enum(['flat', 'inc', 'more']),
          value: z.number().finite(),
        })
        .strict(),
    ),
  })
  .strict();
