/**
 * Zod-схемы контента M02 (03-DATA §11: битый контент = отказ с путём поля).
 * Данные живут в content/balance/inventory.ts (D19: «база 20 и кап 60 — там»),
 * схема — здесь, по образцу content/player/schemas.ts.
 */
import { z } from 'zod';
import { QUALITY_TIERS } from '@/shared/types/ids';

const itemTypeSchema = z.enum([
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
]);

const qualityWeightsSchema = z
  .record(z.enum(QUALITY_TIERS), z.number().finite().min(0))
  .refine((w) => QUALITY_TIERS.every((t) => typeof w[t] === 'number'), {
    message: 'нужны веса всех шести тиров D..SS',
  })
  .refine((w) => QUALITY_TIERS.some((t) => w[t] > 0), {
    message: 'хотя бы один вес должен быть положительным',
  });

const equipmentSlotSchema = z
  .object({
    id: z.string().regex(/^[a-z0-9_]+$/),
    name: z.string().min(1),
    types: z.array(itemTypeSchema).min(1),
    // опциональный белый список subType (слот «Кирка» — только pickaxe)
    subTypes: z.array(z.string().min(1)).min(1).optional(),
  })
  .strict();

export const inventoryTableSchema = z
  .object({
    slotsCap: z.number().int().min(1),
    qualityWeights: qualityWeightsSchema,
    // zod 4: partialRecord — дефолты заданы не для всех типов (явный maxStack в def
    // перекрывает; отсутствующий тип → 1 в логике)
    stackDefaults: z.partialRecord(itemTypeSchema, z.number().int().min(1)),
    tabs: z
      .array(
        z
          .object({
            id: z.string().regex(/^[a-z0-9_]+$/),
            name: z.string().min(1),
            types: z.array(itemTypeSchema).min(1),
          })
          .strict(),
      )
      .min(1),
    // [M02.2] слоты экипировки из данных (карточка §2): id уникальны
    equipmentSlots: z
      .array(equipmentSlotSchema)
      .min(1)
      .refine((slots) => new Set(slots.map((s) => s.id)).size === slots.length, {
        message: 'id слотов экипировки должны быть уникальны',
      }),
  })
  .strict();
