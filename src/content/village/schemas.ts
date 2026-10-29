/**
 * Zod-схемы контента деревни (03-DATA §11: битый контент = отказ с путём
 * поля). Форма — здесь; ссылочная целостность (defId потребностей/подарков
 * существуют как предметы ИЛИ валюты; типы помощи зарегистрированы в
 * TaskRegistry ИЛИ контракт-слоты) — self-check'ом группы M16 (прецедент
 * fishing/pen: «реестр валидирует форму, связи — чеки»).
 */
import { z } from 'zod';
import type { Condition } from '@/shared/types/requirement';

const ID_RE = /^[a-z0-9_]+$/;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const CURRENCY_OR_ITEM_RE = /^[a-z0-9_:]+$/;

const conditionSchema: z.ZodType<Condition> = z.lazy(() =>
  z.discriminatedUnion('t', [
    z.object({ t: z.literal('ctxTag'), tag: z.string().min(1) }).strict(),
    z.object({ t: z.literal('statAtLeast'), stat: z.string().min(1), value: z.number().finite() }).strict(),
    z.object({ t: z.literal('statAtMost'), stat: z.string().min(1), value: z.number().finite() }).strict(),
    z.object({ t: z.literal('flag'), flag: z.string().min(1) }).strict(),
    z.object({ t: z.literal('skill'), skill: z.string().regex(ID_RE), level: z.number().int().min(1) }).strict(),
    z.object({ t: z.literal('playerLevel'), level: z.number().int().min(1) }).strict(),
    z.object({ t: z.literal('achievement'), id: z.string().regex(ID_RE) }).strict(),
    z.object({ t: z.literal('hasItem'), defId: z.string().regex(ID_RE), qty: z.number().int().min(1).optional() }).strict(),
    z.object({ t: z.literal('counterAtLeast'), counter: z.string().regex(/^[a-z0-9_.]+$/), value: z.number().int().min(1) }).strict(),
    z.object({ t: z.literal('not'), c: conditionSchema }).strict(),
    z.object({ t: z.literal('all'), cs: z.array(conditionSchema).min(1) }).strict(),
    z.object({ t: z.literal('any'), cs: z.array(conditionSchema).min(1) }).strict(),
  ]),
);

const needDefSchema = z.object({ defId: z.string().regex(ID_RE), qty: z.number().int().min(1) }).strict();

export const villagersSchema = z
  .array(
    z
      .object({
        id: z.string().regex(ID_RE),
        name: z.string().min(1),
        profession: z.string().min(1),
        needs: z
          .object({
            daily: z.array(needDefSchema).min(1, 'у жителя должен быть хоть один daily-кандидат (маркер дня)'),
            weekly: z.array(needDefSchema).optional(),
          })
          .strict(),
        unlock: conditionSchema.optional(),
      })
      .strict(),
  )
  .min(10, 'карточка M16 §2: 10–20 персонажей')
  .max(20, 'карточка M16 §2: 10–20 персонажей');

const needPoolEntry = z
  .object({
    defId: z.string().regex(ID_RE),
    weight: z.number().int().min(1),
    cat: z.enum(['food', 'materials', 'goods', 'fish']),
  })
  .strict();

export const villageNeedsSchema = z
  .object({ daily: z.array(needPoolEntry).min(1), weekly: z.array(needPoolEntry).min(1) })
  .strict();

export const villageTaxSchema = z
  .object({
    baseGold: z.number().int().min(1),
    perLevelPercent: z.number().min(0).max(1000),
    happinessSwingPercent: z.number().min(0).max(100),
    happinessPivot: z.number().min(0).max(100),
    grumblerPenaltyPercent: z.number().min(0).max(100),
  })
  .strict();

const giftEntry = z
  .object({
    t: z.literal('currency').or(z.literal('item')),
    id: z.string().regex(CURRENCY_OR_ITEM_RE),
    qtyMin: z.number().int().min(1),
    qtyMax: z.number().int().min(1),
    weight: z.number().int().min(1),
    tier: z.enum(['D', 'C', 'B', 'A', 'S', 'SS']).optional(),
    value: z.number().min(0).max(100).optional(),
  })
  .strict()
  .refine((e) => e.qtyMax >= e.qtyMin, { message: 'qtyMax ≥ qtyMin' });

export const villageGiftsSchema = z
  .object({
    chanceBasePercent: z.number().min(0).max(100),
    chanceHappinessBonusPercent: z.number().min(0).max(100),
    chanceHappinessMalusPercent: z.number().min(0).max(100),
    happinessPivot: z.number().min(0).max(100),
    table: z.array(giftEntry).min(1),
  })
  .strict();

const helpTask = z
  .object({
    type: z.string().regex(/^[a-z]+\.[a-zA-Z0-9_.]+$/, 'тип задачи TaskRegistry (namespace.verb)'),
    label: z.string().min(1),
    repeats: z.number().int().min(1).max(10),
    contractOnly: z.boolean().optional(),
  })
  .strict();

export const villageHelpSchema = z
  .object({ perDay: z.number().int().min(1).max(1), tasks: z.array(helpTask).min(1) })
  .strict();

export const villageTableSchema = z
  .object({
    gate: conditionSchema,
    happiness: z
      .object({
        start: z.number().int().min(0).max(100),
        max: z.number().int().min(1).max(100),
        gainOnSatisfy: z.number().int().min(1).max(100),
        dropPerGrumbleDay: z.number().int().min(1).max(100),
        grumbleThreshold: z.number().int().min(1).max(30),
      })
      .strict(),
    level: z
      .object({
        min: z.literal(1),
        max: z.number().int().min(2).max(50),
        baseXp: z.number().int().min(1),
        growth: z.number().min(1.01).max(3),
      })
      .strict(),
    xp: z
      .object({ perDailyNeed: z.number().int().min(1), perWeeklyNeed: z.number().int().min(1) })
      .strict(),
  })
  .strict();

export const villageBasesSchema = z
  .object({
    bases: z
      .object({
        'village.tax.gold': z.number().int().min(1),
        'village.level': z.literal(1),
        'village.repair.discountPercent': z.literal(0),
        'village.market.discountPercent': z.literal(0),
      })
      .strict(),
    meta: z
      .object({
        'village.tax.gold': z.object({ min: z.number().optional(), round: z.enum(['round', 'floor', 'ceil', 'none']).optional() }).strict(),
        'village.level': z.object({ min: z.number().optional(), round: z.enum(['round', 'floor', 'ceil', 'none']).optional() }).strict(),
        'village.repair.discountPercent': z.object({ min: z.number().optional(), round: z.enum(['round', 'floor', 'ceil', 'none']).optional() }).strict(),
        'village.market.discountPercent': z.object({ min: z.number().optional(), round: z.enum(['round', 'floor', 'ceil', 'none']).optional() }).strict(),
      })
      .strict(),
  })
  .strict();

/** dateISO-маркеры (день/неделя) — форма для срезовых полей */
export const villageDateSchema = z.string().regex(DATE_RE);

// ---------------------------------------------------------------- [M16.2]

const costEntry = z
  .object({
    t: z.literal('currency').or(z.literal('item')),
    id: z.string().regex(ID_RE),
    qty: z.number().int().min(1).max(999),
  })
  .strict();

const buildingLevel = z
  .object({
    costGold: z.number().int().min(0).max(100_000),
    items: z.array(costEntry).max(6),
    hours: z.number().int().min(1).max(72),
    effect: z.number().int().min(0).max(100),
    xp: z.number().int().min(1).max(1000),
  })
  .strict();

const buildingKind = z.enum(['house', 'warehouse', 'forge', 'market', 'defense', 'happiness']);

/** карточка §3 — РОВНО 9 зданий; гейт открытия — уровень деревни */
export const villageBuildingsSchema = z
  .array(
    z
      .object({
        id: z.string().regex(ID_RE),
        name: z.string().min(1),
        desc: z.string().min(1),
        kind: buildingKind,
        unlock: z.object({ t: z.literal('statAtLeast'), stat: z.literal('village.level'), value: z.number().int().min(1).max(50) }).strict(),
        levels: z.tuple([buildingLevel, buildingLevel, buildingLevel]),
      })
      .strict(),
  )
  .length(9, 'карточка M16 §3: ровно 9 зданий');

/** рейд: предвестник РОВНО за 24 ч; капа кражи ≤ 20% (cozy-инвариант §4) */
export const villageRaidSchema = z
  .object({
    weekday: z.number().int().min(1).max(7),
    hour: z.number().int().min(20).max(23, 'рейд — НОЧЬЮ (час 20..23)'),
    warningLeadHours: z.literal(24, 'предвестник РОВНО за 24 ч'),
    threshold: z.object({ base: z.number().int().min(1).max(1000), perVillageLevel: z.number().int().min(0).max(100) }).strict(),
    defense: z
      .object({
        typeBase: z.record(z.string(), z.number().min(0).max(100)),
        tierStep: z.number().min(0).max(20),
        valueFactor: z.number().min(0).max(1),
        sharpenStep: z.number().min(0).max(10),
        equippableTypes: z.array(z.string().min(1)).min(1),
      })
      .strict(),
    stolen: z
      .object({
        basePercent: z.number().min(0).max(20),
        perDeficitPoint: z.number().min(0).max(20),
        capPercent: z.number().min(1).max(20, 'КАПА cozy: кража ≤ 20% склада дня'),
        currencies: z.tuple([z.literal('gold')]),
      })
      .strict(),
    winHappinessBonus: z.number().int().min(1).max(20),
  })
  .strict();

// ---------------------------------------------------------------- [M16.3] биржа

const tradeGood = z
  .object({
    defId: z.string().regex(ID_RE),
    requiredLevel: z.number().int().min(0).max(3, 'индекс шкалы репутации 0..3'),
  })
  .strict();

const tradePartner = z
  .object({
    id: z.string().regex(ID_RE),
    name: z.string().min(1),
    desc: z.string().min(1),
    requests: z.array(z.string().regex(ID_RE)).min(2).max(6),
    goods: z.array(tradeGood).min(1).max(4),
    startPoints: z.number().int().min(0).max(999),
    contractMinLevel: z.number().int().min(0).max(3),
  })
  .strict();

/** биржа: 5–7 партнёров; «Друг деревни» −5% (04 §2.1); изобилие −15%
 *  (04 §2.1); дефицит — markup (04 §4.3); история — кольцевой буфер */
export const villageTradeSchema = z
  .object({
    reputation: z
      .object({
        levels: z
          .array(z.object({ id: z.string().regex(ID_RE), name: z.string().min(1), minPoints: z.number().int().min(0) }).strict())
          .length(4, 'шкала репутации — 4 ступени (бриф G1)'),
        pointsPerContract: z.number().int().min(1).max(20),
        friendDiscountPercent: z.literal(5, '04-DISCOUNTS §2.1: «Друг деревни» −5%'),
      })
      .strict(),
    contracts: z
      .object({
        qtyMin: z.number().int().min(1).max(10),
        qtyMax: z.number().int().min(1).max(10),
        premiums: z.array(z.number().int().min(10).max(200)).min(3, 'тиры премий — ≥3 (взвешенный ролл)'),
      })
      .strict()
      .refine((c) => c.qtyMax >= c.qtyMin, { message: 'qtyMax ≥ qtyMin' }),
    trends: z
      .object({
        perDay: z.number().int().min(1).max(5),
        abundancePercent: z.literal(15, '04-DISCOUNTS §2.1: изобилие −15%'),
        deficitMarkupPercent: z.number().int().min(1).max(50),
        contractSwingPercent: z.number().int().min(0).max(50),
        historyCap: z.number().int().min(10).max(200),
      })
      .strict(),
    partners: z.array(tradePartner).min(5, 'бриф G1: 5–7 партнёров').max(7, 'бриф G1: 5–7 партнёров'),
  })
  .strict()
  .refine(
    (t) => {
      // уникальный товар принадлежит РОВНО ОДНОМУ партнёру (форма;
      // ссылочная целостность defId — self-check группы M16, прецедент)
      const all = t.partners.flatMap((p) => p.goods.map((g) => g.defId));
      return new Set(all).size === all.length;
    },
    { message: 'уникальный товар — ровно у одного партнёра' },
  );
