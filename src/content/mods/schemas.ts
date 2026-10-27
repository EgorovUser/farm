/**
 * Zod-схемы контента mods (03-DATA §11: битый контент = отказ с путём поля).
 * Данные — content/mods/registry.ts (шов M03 §2), регистрация в bootstrap
 * под именем 'mods'.
 */
import { z } from 'zod';

const modTypeDefSchema = z
  .object({
    id: z.string().regex(/^[a-z0-9_]+$/),
    stat: z.string().min(1),
    scopeTags: z.array(z.string().min(1)).min(1),
    maxPositive: z.number().finite(),
    maxNegative: z.number().finite(),
    costWeight: z.number().finite().positive(),
    curve: z.enum(['linear', 'soft', 'steep']).optional(),
  })
  .strict()
  .refine((m) => m.maxNegative <= 0 && m.maxPositive >= 0, {
    message: 'maxNegative должен быть ≤ 0, maxPositive ≥ 0',
  });

export const modTypesSchema = z
  .array(modTypeDefSchema)
  .min(1)
  .refine((mods) => new Set(mods.map((m) => m.id)).size === mods.length, {
    message: 'id типов модов должны быть уникальны',
  });

// --- [M03.1] баланс модфорджа (content/balance/modforge.ts, бриф §3–§4/§6)
const raritySchema = z.enum(['common', 'uncommon', 'rare', 'epic', 'legendary', 'mythic']);

const modForgeRarityRowSchema = z
  .object({
    budget: z.number().finite().min(0),
    positives: z.tuple([z.number().int().min(0), z.number().int().min(0)]),
    negChance: z.number().finite().min(0).max(1),
  })
  .strict()
  .refine((r) => r.positives[0] <= r.positives[1], {
    message: 'positives[0] должен быть ≤ positives[1]',
  });

// [M04.1 · C5] строка бюджета трейта (карточка M03 §4): работник perStar × звёзды,
// помощник — бюджет по редкости (fromRarity → byRarity)
const traitBudgetRuleSchema = z
  .object({
    budget: z.union([
      z.object({ kind: z.literal('perStar'), perStar: z.number().finite().min(0) }).strict(),
      z.object({ kind: z.literal('fromRarity') }).strict(),
    ]),
    positives: z.tuple([z.number().int().min(0), z.number().int().min(0)]),
    negChance: z.number().finite().min(0).max(1),
  })
  .strict()
  .refine((r) => r.positives[0] <= r.positives[1], {
    message: 'positives[0] должен быть ≤ positives[1]',
  });

export const modforgeTableSchema = z
  .object({
    byRarity: z.record(raritySchema, modForgeRarityRowSchema),
    negativeRefund: z.number().finite().min(1),
    forgeBudgetPerLevel: z.number().finite().min(0),
    positiveExponent: z.number().finite().gt(1),
    negativeExponent: z.number().finite().gt(0).lt(1),
    // [C2 · M04.2] база реролла — по редкости предмета (полный набор 6 ключей)
    reroll: z
      .object({
        baseCostByRarity: z.record(raritySchema, z.number().finite().min(0)),
        growth: z.number().finite().gte(1),
        capMult: z.number().finite().gte(1),
      })
      .strict(),
    traitBudgets: z
      .object({
        worker: traitBudgetRuleSchema,
        helper: traitBudgetRuleSchema,
      })
      .strict(),
  })
  .strict();
