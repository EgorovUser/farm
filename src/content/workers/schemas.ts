/**
 * Zod-схемы контента M11 (03-DATA §11: битый контент = отказ загрузки
 * с путём поля). Схема таблицы описывает инварианты брифа F2–F7.
 */
import { z } from 'zod';

export const workerObjectSchema = z.object({
  id: z.enum(['field', 'field2', 'lake', 'lake2', 'pen', 'animals2']),
  name: z.string().min(1),
  system: z.enum(['farm', 'lake', 'pen']),
  profession: z.enum(['farmer', 'fishkeeper', 'herdsman']),
  probe: z.enum(['always', 'farmTab', 'lake2', 'pen2']),
  tabId: z.string().optional(),
});

export const workersTableSchema = z
  .object({
    board: z.object({ size: z.number().int().min(1).max(10) }),
    salaryByStars: z.object({
      1: z.number().int().min(1),
      2: z.number().int().min(1),
      3: z.number().int().min(1),
      4: z.number().int().min(1),
      5: z.number().int().min(1),
    }),
    salaryCareStep: z.number().min(0).max(1),
    checkPeriodHours: z.tuple([z.literal(2), z.literal(4), z.literal(6)]),
    toolChance: z.number().min(0).max(1),
    toolByProfession: z.object({
      farmer: z.object({ slot: z.string().min(1), minTier: z.enum(['D', 'C', 'B', 'A', 'S', 'SS']) }),
      fishkeeper: z.object({ slot: z.string().min(1), minTier: z.enum(['D', 'C', 'B', 'A', 'S', 'SS']) }),
      herdsman: z.object({ slot: z.string().min(1), minTier: z.enum(['D', 'C', 'B', 'A', 'S', 'SS']) }),
    }),
    mood: z.object({
      start: z.number().min(0).max(100),
      min: z.number().min(0),
      max: z.number().max(100),
      rollDelta: z.number().int().min(1).max(100),
      paydayOnTime: z.number().int(),
      paydayDelay: z.number().int().max(0),
      dirtyObject: z.number().int().max(0),
      bonus: z.number().int().min(1),
    }),
    dirty: z.object({
      lakeCleanlinessBelow: z.number().min(0).max(100),
      farmWeedsAtLeast: z.number().int().min(1).max(3),
      penHappinessBelow: z.number().min(0).max(100),
    }),
    sickness: z.object({
      chance: z.number().min(0).max(1),
      sickFactor: z.number().min(0).max(1),
      minDays: z.number().int().min(1),
      maxDays: z.number().int().min(1),
    }),
    payday: z.object({ forecast: z.boolean() }),
    moodFire: z.object({
      moodBelow: z.number().min(1).max(100),
      daysInRow: z.number().int().min(1),
      chance: z.number().min(0).max(1),
    }),
    bonus: z.object({
      salaryMult: z.number().min(1),
      cooldownDays: z.number().int().min(1),
    }),
    // [M11.2 · F11] шанс успеха — сетка/множители (карточка §3)
    success: z.object({
      baseByStars: z.object({
        1: z.number().min(0).max(1),
        2: z.number().min(0).max(1),
        3: z.number().min(0).max(1),
        4: z.number().min(0).max(1),
        5: z.number().min(0).max(1),
      }),
      careStep: z.number().min(0).max(0.5),
      moodFactorMin: z.number().min(0).max(2),
      moodFactorSpan: z.number().min(0).max(2),
      sickEfficiency: z.number().min(0).max(1),
      toolPenaltyFactor: z.number().min(0).max(1),
    }),
    // [M11.2 · F15] Праздничный день (данные механики; владение — улучшение)
    holiday: z.object({
      everyDays: z.number().int().min(2).max(30),
      remainder: z.number().int().min(0),
      moodBonus: z.number().int().min(1).max(100),
    }),
    // [M11.2 · F10] приоритет задач директора (данные)
    taskBySystem: z.object({
      farm: z.array(z.string().regex(/^[a-z.]+$/)).min(1),
      lake: z.array(z.string().regex(/^[a-z.]+$/)).min(1),
      pen: z.array(z.string().regex(/^[a-z.]+$/)).min(1),
    }),
  })
  .refine((t) => t.sickness.minDays <= t.sickness.maxDays, {
    message: 'sickness.minDays ≤ maxDays (карточка §4: 1–3 дня)',
  })
  .refine((t) => t.mood.min <= t.mood.max, { message: 'mood.min ≤ mood.max' });

// --- [M11.2 · F15] улучшения качества жизни ×5 (карточка §5)
const workerUpgradeEffectSchema = z.discriminatedUnion('t', [
  z.object({ t: z.literal('house'), moodCapBonus: z.number().int().min(1).max(50) }).strict(),
  z
    .object({
      t: z.literal('canteen'),
      moodPerDay: z.number().int().min(1).max(50),
      foodPerWorker: z.number().int().min(1).max(10),
      foodWhitelist: z.array(z.string().regex(/^[a-z0-9_]+$/)).min(1),
    })
    .strict(),
  z.object({ t: z.literal('bath'), sickFactor: z.number().min(0).max(1) }).strict(),
  z.object({ t: z.literal('holiday') }).strict(),
  z.object({ t: z.literal('toolCase') }).strict(),
]);

export const workersUpgradesSchema = z
  .array(
    z
      .object({
        id: z.string().regex(/^[a-z0-9_]+$/),
        name: z.string().min(1),
        description: z.string().min(1),
        cost: z.object({ currency: z.literal('gold'), qty: z.number().int().min(1) }).strict(),
        effect: workerUpgradeEffectSchema,
      })
      .strict(),
  )
  .min(1)
  .refine((rows) => new Set(rows.map((u) => u.id)).size === rows.length, {
    message: 'id улучшений работников должны быть уникальны',
  });
