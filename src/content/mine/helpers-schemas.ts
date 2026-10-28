/**
 * Zod-схемы контента M13.2 «Помощники» (03-DATA §11; распил mine/schemas.ts
 * по wc-гигиене — прецедент FIX-M12): классы ×5 (HelperDef 03-DATA §7, канон
 * Task 70: atk/hp/speed), страхи-Condition (универсальный каталог 03 §2 —
 * рекурсивная схема), таблица модуля (все коэффициенты — П6).
 */
import { z } from 'zod';
import type { Condition } from '@/shared/types/requirement';

// ============================================================ [M13.2] помощники
// Карточка M13 §4 + брифы R1–R7: классы ×5 (HelperDef 03-DATA §7, канон
// Task 70: atk/hp/speed), страхи-Condition (универсальный каталог 03 §2 —
// рекурсивная схема), таблица модуля (все коэффициенты — П6).

const helperConditionSchema: z.ZodType<Condition> = z.lazy(() =>
  z.union([
    z.object({ t: z.literal('ctxTag'), tag: z.string().min(1) }).strict(),
    z.object({ t: z.literal('statAtLeast'), stat: z.string().min(1), value: z.number().finite() }).strict(),
    z.object({ t: z.literal('statAtMost'), stat: z.string().min(1), value: z.number().finite() }).strict(),
    z.object({ t: z.literal('flag'), flag: z.string().min(1) }).strict(),
    z.object({ t: z.literal('skill'), skill: z.string().min(1), level: z.number().int().min(0) }).strict(),
    z.object({ t: z.literal('playerLevel'), level: z.number().int().min(0) }).strict(),
    z.object({ t: z.literal('achievement'), id: z.string().min(1) }).strict(),
    z.object({ t: z.literal('hasItem'), defId: z.string().min(1), qty: z.number().int().min(1).optional() }).strict(),
    z.object({ t: z.literal('counterAtLeast'), counter: z.string().min(1), value: z.number().int().min(0) }).strict(),
    z.object({ t: z.literal('not'), c: helperConditionSchema }).strict(),
    z.object({ t: z.literal('all'), cs: z.array(helperConditionSchema).min(1) }).strict(),
    z.object({ t: z.literal('any'), cs: z.array(helperConditionSchema).min(1) }).strict(),
  ]),
);

const helperClassSpecialSchema = z.union([
  z.object({ t: z.literal('cover'), redirectPercent: z.number().int().min(1).max(100) }).strict(),
  z.object({ t: z.literal('heal'), everyTurns: z.number().int().min(2), heal: z.number().int().min(1) }).strict(),
  z.object({ t: z.literal('loot'), goldBonusPercent: z.number().int().min(1) }).strict(),
  z.object({ t: z.literal('reveal'), chancePercent: z.number().int().min(1).max(100) }).strict(),
  z.object({ t: z.literal('none') }).strict(),
]);

export const helperClassesSchema = z
  .array(
    z
      .object({
        classId: z.enum(['shieldbearer', 'spearman', 'medic', 'looter', 'scout']),
        name: z.string().min(1),
        role: z.string().min(1),
        atkBase: z.number().int().min(0),
        hpBase: z.number().int().min(1),
        speedBase: z.number().int().min(1),
        salaryFactor: z.number().min(0.5).max(2),
        special: helperClassSpecialSchema,
        perk50: z.object({ t: z.literal('revive'), hpPercent: z.number().int().min(1).max(100) }).strict().optional(),
      })
      .strict(),
  )
  .min(5)
  .refine((rows) => new Set(rows.map((c) => c.classId)).size === rows.length, {
    message: 'classId помощников должны быть уникальны',
  })
  .refine(
    (rows) =>
      // перк 50+ в M13.2-пуле ТОЛЬКО медик (R6); прочие классы — слот пуст
      rows.filter((r) => r.perk50 !== undefined).every((r) => r.classId === 'medic'),
    { message: 'перк 50+ — только медик в пуле M13.2 (R6)' },
  );

const helperFearEffectSchema = z.union([
  z.object({ t: z.literal('standAside') }).strict(),
  z.object({ t: z.literal('efficiency'), percent: z.number().int().min(1).max(100) }).strict(),
  z
    .object({
      t: z.literal('leaveRun'),
      chancePercent: z.number().int().min(1).max(100),
      columns: z.array(z.number().int().min(1).max(5)).min(1),
    })
    .strict(),
  z
    .object({
      t: z.literal('profile'),
      sharePct: z.number().int().min(1),
      goldPct: z.number().int().min(1),
    })
    .strict(),
]);

export const helperFearsSchema = z
  .array(
    z
      .object({
        id: z.string().regex(/^fear_[a-z0-9_]+$/),
        name: z.string().min(1),
        desc: z.string().min(1),
        weight: z.number().int().min(1),
        condition: helperConditionSchema,
        effect: helperFearEffectSchema,
      })
      .strict(),
  )
  .min(1)
  .refine((rows) => new Set(rows.map((f) => f.id)).size === rows.length, {
    message: 'id страхов должны быть уникальны',
  });

export const mineHelpersTableSchema = z
  .object({
    boardSize: z.number().int().min(1).max(5),
    baseSlots: z.number().int().min(1),
    slotCap: z.number().int().min(1),
    names: z.array(z.string().min(1)).min(3),
    fearCounts: z
      .array(z.object({ count: z.number().int().min(0).max(2), weight: z.number().int().min(1) }).strict())
      .min(1),
    sharePoolPercent: z.number().int().min(1).max(100),
    repPerRun: z.tuple([z.number().int().min(1), z.number().int().min(1)]),
    repPerBoss: z.number().int().min(1),
    levelStep: z.number().int().min(1),
    perkRepAtLeast: z.number().int().min(1),
    levelSharePct: z.number().int().max(0),
    levelSalaryPct: z.number().int().max(0),
    shareFloor: z.number().int().min(0),
    salaryFloor: z.number().int().min(0),
    hpRestorePercent: z.number().int().min(1).max(100),
  })
  .strict()
  .refine((t) => t.repPerRun[0] <= t.repPerRun[1], { message: 'repPerRun: min ≤ max' })
  .refine((t) => t.baseSlots <= t.slotCap, { message: 'baseSlots ≤ slotCap (старт 1, кап 3)' });
