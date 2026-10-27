/**
 * Zod-схемы контента фермы (03-DATA §11: битый контент = отказ с путём поля).
 * Данные: content/farm/crops.ts + content/farm/upgrades.ts + content/balance/farm.ts.
 * Регистрация — content-registration.ts под именами 'farm.crops', 'farm.upgrades', 'farm'.
 *
 * Ссылочная целостность (seedDef/yields существуют как предметы, allowedTabs
 * — известные kind вкладок, unlock — валидная форма) — self-check'ом группы
 * M05 (реестр валидирует форму, связи — чеки; прецедент craft-схем M09).
 */
import { z } from 'zod';
import { QUALITY_TIERS } from '@/shared/types/ids';

const conditionShapeSchema = z.object({ t: z.string().min(1) }).passthrough();

const defIdSchema = z.string().regex(/^[a-z0-9_]+$/, 'defId должен быть snake_case');

const tabKindSchema = z.enum(['field', 'mushroom', 'vineyard', 'greenhouse']);

export const cropsSchema = z
  .array(
    z
      .object({
        id: defIdSchema,
        name: z.string().min(1),
        growHours: z.number().finite().min(0.1),
        seedDef: defIdSchema,
        seedPrice: z.number().finite().min(0),
        yields: z
          .array(
            z
              .object({
                defId: defIdSchema,
                minQty: z.number().int().min(1),
                maxQty: z.number().int().min(1),
              })
              .strict(),
          )
          .min(1),
        replantable: z.boolean().optional(),
        // [M05.3 · G5] replantable-числа: сборы клубники / окно винограда
        harvests: z.number().int().min(1).max(10).optional(),
        fruitingDays: z.number().finite().min(0.1).optional(),
        allowedTabs: z.array(tabKindSchema).min(1),
        weedRiskMult: z.number().finite().min(0).optional(),
        // [M05.3 · G2] категория мод улучшений (farm:crop:<category>)
        category: z.enum(['fruit', 'root', 'grain', 'mushroom']).optional(),
        unlock: conditionShapeSchema.optional(),
      })
      .strict(),
  )
  .min(1);

export const farmTableSchema = z
  .object({
    water: z
      .object({
        windowHours: z.number().finite().min(0.1),
      })
      .strict(),
    weeds: z
      .object({
        // [M05.2 · F6] базовый шанс — стат 'farm.weeds.chancePercent' в
        // FARM_BASES_TABLE (мод-путь гербицидов, П3); здесь — только правила
        maxStages: z.number().int().min(1),
        growthPenaltyPercent: z.number().finite().min(0).max(100),
        herbicideReductionPercent: z.number().finite().min(0).max(100),
        // [M05.3 · G1] вкладки без сорняков (карточка §2 «Теплица … без
        // сорняков»): часовой проход такие вкладки пропускает
        immuneTabKinds: z.array(tabKindSchema).max(8),
      })
      .strict(),
    fertilizer: z
      .object({
        speedBonusPercent: z.number().finite().min(0),
        tierUpChance: z.number().finite().min(0).max(1),
      })
      .strict(),
    harvest: z
      .object({
        qualityWeights: z.record(
          z.enum(QUALITY_TIERS as [string, ...string[]]),
          z.number().finite().min(0),
        ),
        minFactor: z.number().finite().min(0),
        maxFactor: z.number().finite().min(0),
      })
      .strict(),
    minigames: z
      .object({
        plow: z.string().min(1),
        plant: z.string().min(1),
        water: z.string().min(1),
        weed: z.string().min(1),
        harvest: z.string().min(1),
      })
      .strict(),
  })
  .strict();

// ------------------------------------------------------------ [M05.3] улучшения фермы

const costSchema = z
  .object({
    // валюта из каталога (content/player/currencies) — ссылочная целостность
    // чеком группы M05 (прецедент reward-схем M15: форма здесь, связи — чеки)
    currency: z.string().regex(/^[a-z0-9_:]+$/),
    qty: z.number().int().min(1),
  })
  .strict();

const upgradeModSchema = z
  .object({
    stat: z.string().min(1),
    op: z.enum(['flat', 'inc', 'more', 'override', 'cap']),
    value: z.number().finite(),
    tag: z.string().min(1),
    label: z.string().min(1),
  })
  .strict();

const upgradeEffectSchema = z.discriminatedUnion('t', [
  z
    .object({
      t: z.literal('openTab'),
      tabId: defIdSchema,
      kind: tabKindSchema,
      tiles: z.number().int().min(1).max(64),
      speedPercent: z.number().finite().min(0).optional(),
    })
    .strict(),
  z.object({ t: z.literal('mods'), mods: z.array(upgradeModSchema).min(1) }).strict(),
  z.object({ t: z.literal('sprinkler'), intervalHours: z.number().finite().min(0.1) }).strict(),
  z
    .object({
      t: z.literal('composter'),
      input: z.object({ item: defIdSchema, qty: z.number().int().min(1) }).strict(),
      output: z.object({ currency: z.string().min(1), qty: z.number().int().min(1) }).strict(),
    })
    .strict(),
  z.object({ t: z.literal('tierBonus'), tabKind: tabKindSchema }).strict(),
]);

export const farmUpgradesSchema = z
  .array(
    z
      .object({
        id: defIdSchema,
        name: z.string().min(1),
        description: z.string().min(1),
        cost: costSchema,
        unlock: conditionShapeSchema,
        effect: upgradeEffectSchema,
      })
      .strict(),
  )
  .min(1);

