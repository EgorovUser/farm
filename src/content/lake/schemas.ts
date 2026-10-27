/**
 * Zod-схемы контента озера (03-DATA §11: битый контент = отказ с путём поля).
 * Данные: content/balance/lake.ts (LAKE_TABLE) + content/lake/upgrades.ts
 * (LAKE_UPGRADES). Регистрация — content-registration.ts под именами
 * 'lake', 'lake.upgrades'.
 *
 * lakeRequirements на дефах рыб — схемы content/fishing/schemas.ts
 * (аддитивное опциональное поле pondFishSchema/riverFishSchema, [M08.1 · F3]).
 *
 * [M08.2 · F10/F11/F13] аддитивные формы: окна мутации + кап бонуса,
 * тёплая группа (период-фактор ≤ 1), кулдаун лаборатории, улучшения ×7
 * (уникальные id, цены ≥ 1, эффект-формы по типам).
 */
import { z } from 'zod';

const defIdSchema = z.string().regex(/^[a-z0-9_]+$/, 'defId должен быть snake_case');

const lakeUpgradeEffectSchema = z.discriminatedUnion('t', [
  z.object({ t: z.literal('aerator'), driftPerDay: z.number().finite().min(-100).max(0) }).strict(),
  z.object({ t: z.literal('heater'), tempPlus: z.number().finite().min(1).max(100) }).strict(),
  z.object({ t: z.literal('autofeeder') }).strict(),
  z.object({
    t: z.literal('incubator'),
    mods: z
      .array(
        z
          .object({
            stat: z.string().min(1),
            op: z.enum(['flat', 'inc', 'more', 'override', 'cap']),
            value: z.number().finite(),
            tag: z.string().min(1),
            label: z.string().min(1),
          })
          .strict(),
      )
      .min(1),
  }).strict(),
  z.object({ t: z.literal('deepWater'), addSlots: z.number().int().min(1).max(16) }).strict(),
  z.object({ t: z.literal('laboratory') }).strict(),
  z.object({ t: z.literal('lake2') }).strict(),
]);

export const lakeUpgradesSchema = z
  .array(
    z
      .object({
        id: defIdSchema,
        name: z.string().min(1),
        description: z.string().min(1),
        cost: z.object({ currency: z.literal('gold'), qty: z.number().int().min(1) }).strict(),
        effect: lakeUpgradeEffectSchema,
      })
      .strict(),
  )
  .min(1);

export const lakeTableSchema = z
  .object({
    slots: z.object({ base: z.number().int().min(1).max(32) }).strict(),
    water: z
      .object({
        temperatureStart: z.number().finite().min(0).max(100),
        cleanlinessStart: z.number().finite().min(0).max(100),
        min: z.number().finite().min(0).max(100),
        max: z.number().finite().min(0).max(100),
        cleanlinessDriftPerDay: z.number().finite().min(-100).max(0),
      })
      .strict(),
    care: z
      .object({
        cleanAmount: z.number().finite().min(1).max(100),
        hungryHours: z.number().finite().min(0.1),
        harvestQualityValue: z.number().finite().min(0).max(100),
      })
      .strict(),
    breeding: z
      .object({
        periodHoursByRarity: z.record(
          z.string().regex(/^[a-z]+$/),
          z.number().finite().min(0.1),
        ),
        fallbackPeriodHours: z.number().finite().min(0.1),
        mutation: z
          .object({
            plus1From: z.number().finite().min(0).max(1),
            plus2From: z.number().finite().min(0).max(1),
            // [M08.2 · F11] кап суммы бонусов к весу +1 (X ≤ 40, вес ≤ 50)
            plusBonusCap: z.number().finite().min(0).max(100),
          })
          .strict()
          .refine((m) => m.plus1From < m.plus2From, {
            message: 'окна мутации: plus1From < plus2From (89/10/1)',
          }),
        // [M08.2 · F11] тёплая группа (Подогреватель): период-фактор ≤ 1
        warmBreeding: z
          .object({
            threshold: z.number().finite().min(0).max(100),
            warmSpeciesTempMin: z.number().finite().min(0).max(100),
            periodFactor: z.number().finite().min(0).max(1),
          })
          .strict(),
      })
      .strict(),
    // [M08.2 · F13] Лаборатория: кулдаун > 0
    research: z.object({ cooldownHours: z.number().finite().min(0.1) }).strict(),
    roe: z.object({ matureHours: z.number().finite().min(0.1) }).strict(),
    sickness: z
      .object({
        badConditionsChance: z.number().finite().min(0).max(1),
        goodConditionsChance: z.number().finite().min(0).max(1),
      })
      .strict()
      .refine((s) => s.badConditionsChance >= s.goodConditionsChance, {
        message: 'болезни: шанс при плохих условиях ≥ шанса при хороших',
      }),
    neutralRequirements: z
      .object({
        tempMin: z.number().finite().min(0).max(100),
        tempMax: z.number().finite().min(0).max(100),
        cleanlinessMin: z.number().finite().min(0).max(100),
      })
      .strict()
      .refine((r) => r.tempMin <= r.tempMax, {
        message: 'нейтральные требования: tempMin ≤ tempMax',
      }),
    buy: z.object({ feedCurrency: z.string().regex(/^[a-z]+$/) }).strict(),
  })
  .strict();
