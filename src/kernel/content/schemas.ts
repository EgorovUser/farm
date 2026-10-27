/**
 * Zod-схемы контента (01-CORE §3: «контент — данные, данные — проверяемы»).
 * Битый контент = отказ загрузки с указанием таблицы/поля (03-DATA §11).
 *
 * [DECISION] Condition и Modifier внутри контента валидируются по внешней форме
 * (наличие обязательных верхних полей) — полная рекурсивная схема не даёт
 * защиты сверх оценщика, который безопасно обрабатывает неизвестное (П5).
 */
import { z } from 'zod';

const statIdSchema = z.string().min(1);
const tagSchema = z.string().min(1);

const raritySchema = z.enum(['common', 'uncommon', 'rare', 'epic', 'legendary', 'mythic']);
const qualityTierSchema = z.enum(['D', 'C', 'B', 'A', 'S', 'SS']);

/**
 * [DECISION] Схемы описывают ФОРМУ контента; приведение к доменным типам
 * выполняет ContentRegistry.get<T>() — conditions/mods внутри проверяются
 * оценщиком безопасно (неизвестное → false, П5).
 */
export const basesTableSchema = z.object({
  bases: z.record(statIdSchema, z.number().finite()),
  meta: z.record(
    statIdSchema,
    z.object({
      // [FIX-0.1 E] 'none' — без округления (дробные регены M01)
      round: z.enum(['round', 'floor', 'ceil', 'none']).optional(),
      min: z.number().finite().optional(),
    }),
  ),
});

const useEffectSchema = z.object({
  t: z.enum(['grantEnergy', 'grantHp', 'modifier']),
  value: z.number().finite().optional(),
  mod: z.unknown().optional(),
});

const conditionShapeSchema = z.object({ t: z.string().min(1) }).passthrough();

export const itemDefSchema = z
  .object({
    id: z.string().regex(/^[a-z0-9_]+$/, 'id должен быть snake_case'),
    name: z.string().min(1),
    itemType: z.enum([
      'tool',
      'weapon',
      'armor',
      'shield',
      'rod',
      'consumable',
      'seed',
      'bait',
      'fish',
      'treasure',
      'component',
    ]),
    subType: z.string().optional(),
    rarity: raritySchema,
    basePrice: z.number().finite().min(0),
    baseStats: z.record(statIdSchema, z.number().finite()).optional(),
    modSlots: z
      .object({
        budgetBase: z.number().finite().min(0),
        tags: z.array(tagSchema),
      })
      .optional(),
    stackable: z.boolean().optional(),
    maxStack: z.number().int().min(1).optional(),
    durabilityMax: z.number().int().min(1).optional(),
    useAction: z.object({ effects: z.array(useEffectSchema) }).optional(),
    requirements: z.array(conditionShapeSchema).optional(),
    unlock: conditionShapeSchema.optional(),
  })
  .strict();

export const itemsSchema = z.array(itemDefSchema);

const rollTableSchema = z.object({
  id: z.string().min(1),
  luckStat: statIdSchema.optional(),
  entries: z
    .array(
      z.object({
        id: z.string().min(1),
        weight: z.number().finite().min(0),
        lucky: z.boolean().optional(),
      }),
    )
    .min(1),
});

export const rollTablesSchema = z.array(rollTableSchema);

export const economySchema = z.object({
  sellRatePercent: z.number().finite().min(0).max(100),
  maxTotalDiscountPercent: z.number().finite().min(0).max(100),
  minPriceFactor: z.number().finite().min(0).max(1),
  globalGroupCapPercent: z.number().finite().min(0).max(100),
  localGroupCapPercent: z.number().finite().min(0).max(100),
  rarityPriceMult: z.record(raritySchema, z.number().finite().min(0)),
  qualityPriceMult: z.record(qualityTierSchema, z.number().finite().min(0)),
});

export const timeSchema = z.object({
  tickMs: z.number().int().min(100),
  autosaveMs: z.number().int().min(1000),
  catchupHourCap: z.number().int().min(1),
  catchupDayCap: z.number().int().min(1),
});

export const rngSchema = z.object({
  rollLogCap: z.number().int().min(10),
});

/** Форматирование ошибок zod: таблица.поле.путь — сообщение */
export function formatZodIssues(error: z.ZodError): string[] {
  return error.issues.map((issue) => {
    const path = issue.path.length > 0 ? issue.path.join('.') : '<корень>';
    return `${path}: ${issue.message}`;
  });
}
