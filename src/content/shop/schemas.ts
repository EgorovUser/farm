/**
 * Zod-схемы контента магазина (03-DATA §11: битый контент = отказ с путём поля).
 * Данные: content/shopPool.ts (пул ротации) + content/balance/shop.ts (баланс).
 * Регистрация — content-registration.ts под именами 'shop.pool' и 'shop'.
 */
import { z } from 'zod';

const conditionShapeSchema = z.object({ t: z.string().min(1) }).passthrough();

const categorySchema = z.enum([
  'seeds',
  'food',
  'potions',
  'tools',
  'gear',
  'materials',
  'baits',
  'building',
  'rarities',
]);

export const shopPoolSchema = z
  .array(
    z
      .object({
        id: z.string().regex(/^[a-z0-9_:]+$/, 'id должен быть snake_case (валюты с двоеточием: ingot:iron)'),
        kind: z.enum(['item', 'currency']),
        weight: z.number().finite().min(0),
        category: categorySchema,
        unlock: conditionShapeSchema.optional(),
      })
      .strict(),
  )
  .min(1)
  .refine((pool) => new Set(pool.map((e) => e.id)).size === pool.length, {
    message: 'id строк пула должны быть уникальны (без дублей с базовым ассортиментом)',
  });

const branchCostsSchema = z
  .object({
    maxLevel: z.number().int().min(1),
    costBase: z.number().finite().min(0),
    costGrowth: z.number().finite().gte(1),
  })
  .strict();

const baseGoodSchema = z
  .object({
    id: z.string().regex(/^[a-z0-9_:]+$/),
    kind: z.enum(['item', 'currency']),
    qty: z.number().int().min(1),
  })
  .strict();

export const shopTableSchema = z
  .object({
    discount: z
      .object({ minPercent: z.number().finite().min(0), maxPercent: z.number().finite().min(0) })
      .strict()
      .refine((d) => d.minPercent <= d.maxPercent, { message: 'minPercent ≤ maxPercent' }),
    level: z
      .object({
        xpPerPurchase: z.number().finite().min(0),
        xpBase: z.number().finite().min(1),
        xpGrowth: z.number().finite().gte(1),
      })
      .strict(),
    levelDiscount: z
      .object({
        perLevels: z.number().int().min(1),
        percentPerStep: z.number().finite().min(0),
        capPercent: z.number().finite().min(0),
      })
      .strict(),
    pinnedQty: z.number().int().min(1),
    categories: z.object({ unlockOrder: z.array(categorySchema).min(1) }).strict(),
    branches: z.object({
      assortment: branchCostsSchema,
      permanent: branchCostsSchema,
      supplies: branchCostsSchema,
      ties: branchCostsSchema,
      categories: branchCostsSchema,
      luxury: branchCostsSchema,
    }),
    assortmentCatalog: z.array(
      z
        .object({
          id: z.string().regex(/^[a-z0-9_]+$/),
          weight: z.number().finite().min(0),
        })
        .strict(),
    ),
    currencyGoods: z.record(z.string().regex(/^[a-z0-9_:]+$/), z.number().finite().min(0)),
    baseGoods: z.array(baseGoodSchema).min(1),
  })
  .strict();
