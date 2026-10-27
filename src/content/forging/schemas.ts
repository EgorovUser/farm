/**
 * Zod-схемы контента заточки (03-DATA §11: битый контент = отказ с путём поля).
 * Данные: content/balance/forging.ts (FORGE_TABLE + FORGE_BASES_TABLE).
 * Регистрация — content-registration.ts под именем 'forge'.
 *
 * Ссылочная целостность (капы станций против баз, гейты) — self-check'ом
 * группы M10 (реестр валидирует форму, связи — чеки; прецедент M09).
 */
import { z } from 'zod';

const chance = z.number().finite().min(0).max(1);

export const forgeTableSchema = z
  .object({
    baseSuccess: z
      .object({
        base: chance,
        decayPerLevel: z.number().finite().min(0).max(1),
        min: chance,
      })
      .strict()
      .refine((v) => v.min <= v.base, { message: 'baseSuccess.min должен быть ≤ base' }),
    pityStepPerFail: chance,
    successCap: chance,
    rollback: z
      .object({
        base: chance,
        stepPerLevel: z.number().finite().min(0).max(1),
        cap: chance,
      })
      .strict()
      .refine((v) => v.base <= v.cap, { message: 'rollback.base должен быть ≤ cap' }),
    statScalePerLevel: z.number().finite().min(0).max(10),
    tierStepLevels: z.number().int().min(1),
    costs: z
      .object({
        ingotsBase: z.number().int().min(0),
        ingotsPerStep: z.number().int().min(0),
        ingotsStepLevels: z.number().int().min(1),
        goldBase: z.number().int().min(0),
        goldPerLevel: z.number().int().min(0),
      })
      .strict(),
    whetstone: z
      .object({
        costGold: z.number().int().min(1),
        unlockPlayerLevel: z.number().int().min(1),
      })
      .strict(),
    whetstoneCircle: z
      .object({
        costGold: z.number().int().min(1),
        unlockPlayerLevel: z.number().int().min(1),
        bonusInc: z.number().finite().min(0).max(100),
      })
      .strict(),
    cards: z
      .object({
        declineBonus: chance,
      })
      .strict(),
  })
  .strict();
