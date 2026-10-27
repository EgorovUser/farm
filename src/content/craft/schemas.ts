/**
 * Zod-схемы контента крафта (03-DATA §11: битый контент = отказ с путём поля).
 * Данные: content/craft/recipes.ts + stations.ts + content/balance/craft.ts.
 * Регистрация — content-registration.ts под именами 'craft.recipes',
 * 'craft.stations', 'craft'.
 *
 * Ссылочная целостность (входы/выходы существуют как предмет ИЛИ валюта,
 * рецепты ссылаются на известные станции, id уникальны) — self-check'ом
 * группы M09 (реестр валидирует форму, связи — чеки; прецедент M03-групп).
 */
import { z } from 'zod';
import { STATIONS } from './stations';

const conditionShapeSchema = z.object({ t: z.string().min(1) }).passthrough();

const stationIds = STATIONS.map((s) => s.id) as [string, ...string[]];

const defIdSchema = z.string().regex(/^[a-z0-9_:]+$/, 'defId должен быть snake_case (валюты с двоеточием: ingot:bronze)');

/** форма модификатора эффектов станций/рецептов (канон 02-BUSES §2) */
const effectShapeSchema = z
  .object({
    id: z.string().min(1),
    source: z.object({ kind: z.enum(['item', 'passive', 'buff', 'skill', 'shop', 'worker', 'helper', 'village', 'upgrade', 'debuff', 'event']), refId: z.string().min(1) }).strict(),
    stat: z.string().min(1),
    op: z.enum(['flat', 'inc', 'more', 'override', 'cap']),
    value: z.number().finite(),
    stackGroup: z.string().min(1).optional(),
    label: z.string().optional(),
  })
  .strict();

const ioSchema = z.object({ defId: defIdSchema, qty: z.number().int().min(1) }).strict();

export const craftRecipesSchema = z
  .array(
    z
      .object({
        id: z.string().regex(/^[a-z0-9_]+$/),
        station: z.enum(stationIds),
        inputs: z.array(ioSchema).min(1),
        output: ioSchema,
        energyCost: z.number().finite().min(0).optional(),
        craftSeconds: z.number().int().min(0),
        unlock: conditionShapeSchema.optional(),
        effects: z.array(effectShapeSchema).optional(),
      })
      .strict(),
  )
  .min(1)
  .refine((rows) => new Set(rows.map((r) => r.id)).size === rows.length, {
    message: 'id рецептов должны быть уникальны',
  });

const upgradeSchema = z
  .object({
    id: z.string().regex(/^[a-z0-9_]+$/),
    name: z.string().min(1),
    costGold: z.number().finite().min(0),
    queueBonus: z.number().int().min(0),
    effects: z.array(effectShapeSchema),
    unlock: conditionShapeSchema.optional(),
  })
  .strict();

export const craftStationsSchema = z
  .array(
    z
      .object({
        id: z.enum(stationIds),
        name: z.string().min(1),
        costGold: z.number().finite().min(0),
        unlock: conditionShapeSchema.optional(),
        effects: z.array(effectShapeSchema),
        upgrades: z.array(upgradeSchema),
      })
      .strict(),
  )
  .min(1)
  .refine((rows) => new Set(rows.map((s) => s.id)).size === rows.length, {
    message: 'id станций должны быть уникальны',
  })
  .refine(
    (rows) =>
      new Set(rows.flatMap((s) => s.upgrades.map((u) => u.id))).size ===
      rows.reduce((n, s) => n + s.upgrades.length, 0),
    { message: 'id улучшений должны быть уникальны глобально (покупка по одному id)' },
  )
  .refine((rows) => rows.some((s) => s.costGold === 0), {
    message: 'ровно одна станция должна быть стартовой (costGold 0)',
  })
  .refine((rows) => rows.filter((s) => s.costGold === 0).length === 1, {
    message: 'стартовая станция (costGold 0) должна быть одна',
  });

export const craftTableSchema = z
  .object({
    quality: z
      .object({
        inputWeight: z.number().finite().min(0).max(1),
        skillWeight: z.number().finite().min(0).max(1),
        skillTierPerLevels: z.number().int().min(1),
        skillTierCap: z.number().finite().min(0).max(5),
        neutralInputTier: z.number().finite().min(0).max(5),
        maxMinigameAdj: z.number().finite().min(0).max(3),
      })
      .strict(),
    queue: z
      .object({
        readyCap: z.number().int().min(1),
        pauseOnReadyCap: z.boolean(),
        // [FIX-PHASE-2 · 4.4] клэмп-минимум времени партии (сек) при потреблении
        // craft.speedPercent (ОБЯЗАТЕЛЬНОЕ поле — очередь читает его в sweep)
        minBatchSeconds: z.number().int().min(1),
      })
      .strict(),
    cancel: z
      .object({
        refundShare: z.number().finite().min(0).max(1),
        refundEnergy: z.literal(false),
      })
      .strict(),
    // [FIX-PHASE-2 · 4.7 · SALV-1] доля материалов рецепта при разборе
    salvage: z
      .object({
        share: z.number().finite().min(0).max(1),
      })
      .strict(),
    repair: z
      .object({
        goldPercent: z.number().finite().min(0).max(100),
        kits: z.number().int().min(0),
      })
      .strict(),
  })
  .strict();
