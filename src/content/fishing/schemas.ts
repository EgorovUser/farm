/**
 * Zod-схемы контента рыбалки (03-DATA §11: битый контент = отказ с путём поля).
 * Данные: content/fishing/{fish,rods,baits}.ts + content/balance/fishing.ts.
 * Регистрация — content-registration.ts под именами 'fishing.fish',
 * 'fishing.trash', 'fishing.chest', 'fishing.events', 'fishing.rods',
 * 'fishing.baits', 'fishing'.
 *
 * Ссылочная целостность (defId рыб/мусора/наживок/удочек существуют как
 * предметы; lucky-статы — существующие базы) — self-check'ом группы M07
 * (реестр валидирует форму, связи — чеки; прецедент pen-схем M06).
 */
import { z } from 'zod';

const defIdSchema = z.string().regex(/^[a-z0-9_]+$/, 'defId должен быть snake_case');
const statIdSchema = z.string().regex(/^[a-z][a-z0-9.]*$/, 'stat должен быть точечным id');
const skillIdSchema = z.string().regex(/^[a-z0-9_]+$/, 'skill id');

const luckStatSchema = z.enum([
  'fishing.luck.rare',
  'fishing.treasure.weight',
  'fishing.luck.event',
  'fishing.luck.trash',
  'fishing.luck.small',
  'fishing.luck.medium',
]);

const range2 = z.tuple([z.number().finite(), z.number().finite()]);

export const dropCategoriesSchema = z
  .array(
    z
      .object({
        id: z.enum(['trash', 'small', 'medium', 'rare', 'treasure', 'event']),
        name: z.string().min(1),
        weight: z.number().finite().min(0),
        lucky: z.boolean().optional(),
        luckStat: luckStatSchema,
      })
      .strict(),
  )
  .min(1);

const fishConditionsSchema = z
  .object({
    bait: defIdSchema.optional(),
    rodTierAtLeast: z.number().int().min(1).max(6).optional(),
    playerLevel: z.number().int().min(1).optional(),
    achievement: defIdSchema.optional(),
  })
  .strict()
  .optional();

const fishRowSchema = z
  .object({
    id: defIdSchema,
    name: z.string().min(1),
    category: z.enum(['small', 'medium', 'rare']),
    weight: z.number().finite().min(0),
    rarity: z.enum(['common', 'uncommon', 'rare', 'epic', 'legendary', 'mythic']),
    biteSeconds: range2,
    sizeGrams: range2,
    conditions: fishConditionsSchema,
    // [M08.1 · F3] требования содержания в озере (канон 03-DATA §6 FishDef;
    //  аддитивно-опционально: вид без записи — нейтрален)
    lakeRequirements: z
      .object({
        tempMin: z.number().finite().min(0).max(100),
        tempMax: z.number().finite().min(0).max(100),
        cleanlinessMin: z.number().finite().min(0).max(100),
      })
      .strict()
      .refine((r) => r.tempMin <= r.tempMax, {
        message: 'lakeRequirements: tempMin ≤ tempMax',
      })
      .optional(),
  })
  .strict();

export const pondFishSchema = z.array(fishRowSchema).min(1);

// [M07.2 · F12] река: та же форма строк (гейт-рыбы F11 — с conditions)
export const riverFishSchema = z.array(fishRowSchema).min(1);

export const trashSchema = z
  .array(
    z
      .object({
        id: defIdSchema,
        name: z.string().min(1),
        weight: z.number().finite().min(0),
      })
      .strict(),
  )
  .min(1);

export const chestSchema = z
  .array(
    z
      .object({
        id: defIdSchema,
        kind: z.enum(['item', 'currency']),
        defId: defIdSchema,
        weight: z.number().finite().min(0),
        lucky: z.boolean().optional(),
        qty: z.tuple([z.number().int().min(1), z.number().int().min(1)]),
      })
      .strict(),
  )
  .min(1);

export const fishingEventsSchema = z
  .array(
    z
      .object({
        id: defIdSchema,
        name: z.string().min(1),
        text: z.string().min(1),
        weight: z.number().finite().min(0),
        // [M07.2 · F14] опции ×2 с исходами (авто-резолв дефолта до фазы 6)
        options: z
          .array(
            z
              .object({
                id: defIdSchema,
                label: z.string().min(1),
                outcome: z.discriminatedUnion('t', [
                  z.object({ t: z.literal('skillXp'), skill: skillIdSchema, amount: z.number().int().min(1) }).strict(),
                  z.object({ t: z.literal('gold'), qty: z.number().int().min(1) }).strict(),
                  z.object({ t: z.literal('none') }).strict(),
                ]),
              })
              .strict(),
          )
          .min(1),
      })
      .strict(),
  )
  .min(1);

// [M07.2 · F13] таблица наград вскрытия карты сокровищ
export const treasureMapSchema = z
  .array(
    z
      .object({
        id: defIdSchema,
        kind: z.enum(['currency', 'item']),
        defId: defIdSchema,
        weight: z.number().finite().min(0),
        qty: z.tuple([z.number().int().min(1), z.number().int().min(1)]),
      })
      .strict(),
  )
  .min(1);

// [M07.2 · F13] событие-мини «Клад» (вылов карты → выбор)
export const treasureMapEventSchema = z
  .object({
    id: defIdSchema,
    name: z.string().min(1),
    text: z.string().min(1),
    options: z
      .array(
        z
          .object({
            id: defIdSchema,
            label: z.string().min(1),
            outcome: z.discriminatedUnion('t', [
              z.object({ t: z.literal('treasureRoll') }).strict(),
              z.object({ t: z.literal('none') }).strict(),
            ]),
          })
          .strict(),
      )
      .min(1),
  })
  .strict();

export const rodsSchema = z
  .array(
    z
      .object({
        defId: defIdSchema,
        name: z.string().min(1),
        tier: z.number().int().min(1).max(6),
        price: z.number().int().min(1),
      })
      .strict(),
  )
  .min(1);

export const baitsSchema = z
  .array(
    z
      .object({
        defId: defIdSchema,
        name: z.string().min(1),
        price: z.number().int().min(1),
        mods: z
          .array(
            z
              .object({
                stat: statIdSchema,
                value: z.number().finite(),
                label: z.string().min(1),
              })
              .strict(),
          )
          .default([]),
      })
      .strict(),
  )
  .min(1);

export const fishingTableSchema = z
  .object({
    bite: z.object({ defaultSeconds: range2 }).strict(),
    biteSpeed: z.object({ minWaitSeconds: z.number().finite().min(0.1) }).strict(),
    log: z.object({ lastCasts: z.number().int().min(1).max(100) }).strict(),
    // [M07.2 · F12] гейт реки — навык (число в данных, П6)
    locations: z.object({ riverSkillLevel: z.number().int().min(1).max(99) }).strict(),
  })
  .strict();
