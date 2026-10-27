/**
 * Zod-схемы контента M01 (03-DATA §11: битый контент = отказ с путём поля).
 * Модификаторы валидируются по внешней форме — как в kernel/content/schemas
 * ([DECISION] Фазы 0: полная рекурсия не даёт защиты сверх оценщика, П5).
 */
import { z } from 'zod';

const xpEventRuleSchema = z
  .object({
    event: z.string().min(1),
    xp: z.number().finite().min(0).optional(),
    xpKey: z.string().min(1).optional(),
  })
  .strict()
  .refine((r) => r.xp !== undefined || r.xpKey !== undefined, { message: 'нужно xp или xpKey' });

export const playerTableSchema = z
  .object({
    level: z
      .object({
        xpBase: z.number().finite().min(1),
        growthPercent: z.number().finite().min(0),
        maxLevel: z.number().int().min(1),
      })
      .strict(),
    // [FIX-M01 · DEBT-19] кривая навыка — данные (50 × 1.2^L), не литералы модуля
    skillXpBase: z.number().finite().min(1),
    skillXpGrowth: z.number().finite().min(1),
    levelBonus: z
      .object({
        energyMaxPerLevel: z.number().finite().min(0),
        hpMaxPerLevel: z.number().finite().min(0),
      })
      .strict(),
    xpEvents: z.array(xpEventRuleSchema),
  })
  .strict();

const skillModSchema = z
  .object({
    stat: z.string().min(1),
    op: z.enum(['flat', 'inc', 'more', 'override', 'cap']),
    value: z.number().finite(),
    label: z.string().optional(),
  })
  .strict();

export const skillsTableSchema = z.array(
  z
    .object({
      id: z.string().regex(/^[a-z0-9_]+$/, 'id навыка должен быть snake_case'),
      name: z.string().min(1),
      perLevel: z.array(skillModSchema),
      thresholds: z.array(
        z
          .object({
            level: z.number().int().min(1),
            note: z.string().optional(),
            mods: z.array(skillModSchema),
          })
          .strict(),
      ),
      xpEvents: z.array(xpEventRuleSchema),
    })
    .strict(),
);

export const countersTableSchema = z.array(
  z
    .object({
      id: z.string().regex(/^[a-z0-9_.]+$/),
      event: z.string().min(1),
      filter: z.record(z.string(), z.union([z.string(), z.number(), z.boolean()])).optional(),
      valueKey: z.string().min(1).optional(),
    })
    .strict(),
);

export const currencyInfoSchema = z.record(
  z.string().min(1),
  z
    .object({
      sources: z.array(z.string()),
      sinks: z.array(z.string()),
    })
    .strict(),
);
