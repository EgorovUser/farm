/**
 * Zod-схемы контента загона (03-DATA §11: битый контент = отказ с путём поля).
 * Данные: content/pen/animals.ts + content/balance/pen.ts.
 * Регистрация — content-registration.ts под именами 'pen.animals', 'pen'.
 *
 * Ссылочная целостность (produce.defId существуют как предметы, гейты —
 * валидная форма) — self-check'ом группы M06 (реестр валидирует форму,
 * связи — чеки; прецедент farm-схем M05).
 */
import { z } from 'zod';
import { QUALITY_TIERS } from '@/shared/types/ids';

const conditionShapeSchema = z.object({ t: z.string().min(1) }).passthrough();

const defIdSchema = z.string().regex(/^[a-z0-9_]+$/, 'defId должен быть snake_case');

const speciesSchema = z.enum(['chicken', 'goat', 'sheep', 'cow', 'pig', 'bees', 'alpaca']);

export const animalsSchema = z
  .array(
    z
      .object({
        id: speciesSchema,
        name: z.string().min(1),
        price: z.number().int().min(1),
        produce: z
          .object({
            defId: defIdSchema,
            periodHours: z.number().finite().min(0.1),
            qty: z.number().int().min(1),
          })
          .strict(),
        produceNeeds: z
          .object({
            satiety: z.number().finite().min(0).max(100),
            health: z.number().finite().min(0).max(100),
          })
          .strict()
          .optional(),
        unlock: conditionShapeSchema.optional(),
      })
      .strict(),
  )
  .min(1);

export const penTableSchema = z
  .object({
    slots: z.object({ base: z.number().int().min(1).max(32) }).strict(),
    care: z
      .object({
        petHappiness: z.number().finite().min(0).max(100),
        feedSatiety: z.number().finite().min(0).max(100),
        cleanCleanliness: z.number().finite().min(0).max(100),
      })
      .strict(),
    decay: z
      .object({
        satietyPerDay: z.number().finite().min(0).max(100),
        cleanlinessPerDay: z.number().finite().min(0).max(100),
        hungryHappinessPerDay: z.number().finite().min(0).max(100),
        dirtyHappinessPerDay: z.number().finite().min(0).max(100),
      })
      .strict(),
    newborn: z
      .object({
        happiness: z.number().finite().min(0).max(100),
        satiety: z.number().finite().min(0).max(100),
        health: z.number().finite().min(0).max(100),
        cleanliness: z.number().finite().min(0).max(100),
      })
      .strict(),
    // F5: веса тиров покупки — ЧАСТИЧНАЯ запись (D45 C35 B15 A5;
    // S/SS недостижимы покупкой — разведение M06.2; полный Record не нужен)
    buyQualityWeights: z.record(
      z.string().regex(/^[DCBASS]{1,2}$/, 'тир D..SS'),
      z.number().finite().min(0),
    ),
    produce: z
      .object({
        qualityWeights: z.record(
          z.enum(QUALITY_TIERS as [string, ...string[]]),
          z.number().finite().min(0),
        ),
        minFactor: z.number().finite().min(0),
        maxFactor: z.number().finite().min(0),
        qualityTierUpChancePerTier: z.number().finite().min(0).max(1),
        stockCapCollections: z.number().int().min(1).max(64),
      })
      .strict(),
    reputation: z.object({ ready: z.boolean() }).strict(),
    // [M06.2 · F1] болезни: шанс/decay/лечение/иммунитет — данные
    sickness: z
      .object({
        base: z.number().finite().min(0).max(1),
        perHungryDay: z.number().finite().min(0).max(1),
        perDirtyDay: z.number().finite().min(0).max(1),
        sickHealth: z.number().finite().min(0).max(100),
        healthDecayPerDay: z.number().finite().min(0).max(100),
        healHours: z.number().finite().min(0.1),
        immunityHours: z.number().finite().min(0),
      })
      .strict(),
    // [M06.2 · F5] разведение: таймер/порог/мутация/продажа
    breeding: z
      .object({
        periodHours: z.number().finite().min(0.1),
        minSatiety: z.number().finite().min(0).max(100),
        mutationChance: z.number().finite().min(0).max(1),
        sellFactor: z.number().finite().min(0).max(1),
      })
      .strict(),
    // [M06.2 · F4] навоз-цикл: буфер кормлений
    manure: z
      .object({
        perFeeding: z.number().int().min(0),
        cap: z.number().int().min(1),
      })
      .strict(),
  })
  .strict();

/** схема улучшений загона (M06.2 F3: данные + TransactionService) */
const penUpgradeEffectSchema = z.discriminatedUnion('t', [
  z.object({ t: z.literal('slots'), addPerLevel: z.number().int().min(1), maxLevels: z.number().int().min(1) }).strict(),
  z.object({ t: z.literal('autofeeder') }).strict(),
  z.object({ t: z.literal('warm'), sickFactor: z.number().finite().min(0).max(1), appetiteFactor: z.number().finite().min(0).max(1) }).strict(),
  z.object({ t: z.literal('breeding') }).strict(),
  z.object({
    t: z.literal('mods'),
    mods: z.array(
      z.object({
        stat: z.string().min(1),
        op: z.enum(['flat', 'inc', 'more', 'override', 'cap']),
        value: z.number().finite(),
        tag: z.string().min(1),
        label: z.string().min(1),
      }).strict(),
    ).min(1),
  }).strict(),
  z.object({ t: z.literal('pen2') }).strict(),
  z.object({ t: z.literal('symbiosis') }).strict(),
]);

export const penUpgradesSchema = z
  .array(
    z
      .object({
        id: z.string().regex(/^upg_[a-z0-9_]+$/, 'id улучшения загона'),
        name: z.string().min(1),
        description: z.string().min(1),
        cost: z.object({ currency: z.literal('gold'), qty: z.number().int().min(1) }).strict(),
        unlock: conditionShapeSchema.optional(),
        effect: penUpgradeEffectSchema,
      })
      .strict(),
  )
  .min(1);
