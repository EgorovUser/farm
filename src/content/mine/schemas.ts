/**
 * Zod-схемы контента M12 (03-DATA §11: битый контент = отказ загрузки
 * с путём поля). Инварианты карточки M12 §3–§4 + брифа SESSION-M12.1 F5.
 */
import { z } from 'zod';

const dirSchema = z.enum(['top', 'mid', 'bottom']);

export const mineMobSchema = z
  .object({
    id: z.string().regex(/^[a-z0-9_]+$/),
    name: z.string().min(1),
    hpBase: z.number().int().min(1),
    atk: z.number().int().min(0),
    def: z.number().int().min(0),
    speed: z.number().int().min(1),
    attackDirs: z.array(z.tuple([dirSchema, dirSchema])).min(1),
    evade: z.number().min(0).max(100).optional(),
    selfBuff: z
      .object({ perRound: z.number().int().min(1), capBonus: z.number().int().min(1) })
      .strict()
      .optional(),
    miniBoss: z.boolean().optional(),
    tags: z.array(z.string().min(1)).min(1),
    gold: z.tuple([z.number().int().min(0), z.number().int().min(0)]),
    drops: z.array(
      z.object({
        defId: z.string().regex(/^[a-z0-9_]+$/),
        weight: z.number().int().min(1),
        qty: z.tuple([z.number().int().min(1), z.number().int().min(1)]),
      }),
    ),
    eliteMods: z.array(z.enum(['venomous', 'armored', 'swarm'])).optional(),
  })
  .strict()
  .refine((m) => m.gold[0] <= m.gold[1], { message: 'gold: min ≤ max' });

export const mineMobsSchema = z
  .array(mineMobSchema)
  .min(1)
  .refine((rows) => new Set(rows.map((m) => m.id)).size === rows.length, {
    message: 'id мобов должны быть уникальны',
  });

export const eliteModsSchema = z
  .array(
    z
      .object({
        id: z.enum(['venomous', 'armored', 'swarm']),
        name: z.string().min(1),
        description: z.string().min(1),
      })
      .strict(),
  )
  .min(1)
  .refine((rows) => new Set(rows.map((m) => m.id)).size === rows.length, {
    message: 'id элитных модификаторов должны быть уникальны',
  });

export const mineTableSchema = z
  .object({
    layer: z.object({ hpScale: z.number().min(1) }).strict(),
    damage: z.object({ divisor: z.number().int().min(1), min: z.number().int().min(1) }).strict(),
    crit: z.object({ multiplier: z.number().min(1) }).strict(),
    block: z
      .object({
        sensePerTier: z.number().min(0),
        tierNumbers: z.object({
          D: z.number().int().min(1),
          C: z.number().int().min(1),
          B: z.number().int().min(1),
          A: z.number().int().min(1),
          S: z.number().int().min(1),
          SS: z.number().int().min(1),
        }),
      })
      .strict(),
    rounds: z.object({ cap: z.number().int().min(10) }).strict(),
    boss: z.object({ hpScale: z.number().min(1) }).strict(),
    elite: z
      .object({
        venomous: z.object({ dot: z.number().int().min(1) }).strict(),
        armored: z.object({ defBonus: z.number().int().min(1) }).strict(),
        swarm: z
          .object({ targets: z.number().int().min(2), hpFactor: z.number().min(0).max(1) })
          .strict(),
      })
      .strict(),
  })
  .strict();

// ---------------------------------------------------------------- [M12.2] боссы

const bossFreezeSchema = z
  .object({
    onTurn: z.number().int().min(1),
    everyTurns: z.number().int().min(1),
    turns: z.number().int().min(1),
  })
  .strict();

const bossSkipDoubleSchema = z.object({ everyTurns: z.number().int().min(1) }).strict();

const bossSummonSchema = z
  .object({
    mobId: z.string().regex(/^[a-z0-9_]+$/),
    elite: z.enum(['venomous', 'armored', 'swarm']),
    atHpBelow: z.number().min(0).max(1),
    max: z.number().int().min(1),
  })
  .strict();

export const mineBossSchema = z
  .object({
    id: z.string().regex(/^[a-z0-9_]+$/),
    name: z.string().min(1),
    hpBase: z.number().int().min(1),
    atk: z.number().int().min(0),
    def: z.number().int().min(0),
    speed: z.number().int().min(1),
    attackDirs: z.array(z.tuple([dirSchema, dirSchema])).min(1),
    tags: z.array(z.string().min(1)).min(1),
    drops: z.array(
      z.object({
        defId: z.string().regex(/^[a-z0-9_]+$/),
        weight: z.number().int().min(1),
        qty: z.tuple([z.number().int().min(1), z.number().int().min(1)]),
      }),
    ),
    boss: z.literal(true),
    gold: z.tuple([z.number().int().min(0), z.number().int().min(0)]),
    aPlus: z.array(z.string().regex(/^[a-z0-9_]+$/)).min(1),
    freeze: bossFreezeSchema.optional(),
    skipDouble: bossSkipDoubleSchema.optional(),
    summon: bossSummonSchema.optional(),
  })
  .strict()
  .refine((b) => b.gold[0] <= b.gold[1], { message: 'gold: min ≤ max' });

export const mineBossesSchema = z
  .array(mineBossSchema)
  .min(1)
  .refine((rows) => new Set(rows.map((b) => b.id)).size === rows.length, {
    message: 'id боссов должны быть уникальны',
  });

// ---------------------------------------------------------------- [M12.2] слои

export const mineLayerSchema = z
  .object({
    layer: z.number().int().min(1),
    ore: z
      .object({
        defId: z.string().regex(/^[a-z0-9_]+$/),
        qty: z.tuple([z.number().int().min(1), z.number().int().min(1)]),
      })
      .strict(),
    itemChance: z.number().min(0).max(100),
    items: z
      .array(
        z.object({
          defId: z.string().regex(/^[a-z0-9_]+$/),
          weight: z.number().int().min(1),
          qty: z.tuple([z.number().int().min(1), z.number().int().min(1)]),
        }),
      )
      .min(1),
    pickGate: z
      .object({ minTier: z.number().int().min(1).max(6), label: z.string().min(1) })
      .strict(),
    /** гейт слоя — канон G3: ачивка предыдущего слоя (полная форма Condition
     *  шире, но данные M12.2 используют ровно этот вариант; refine ниже
     *  сверяет id с шаблоном ach_mine_boss_<n−1>) */
    unlock: z.object({ t: z.literal('achievement'), id: z.string().regex(/^[a-z0-9_]+$/) }).strict().optional(),
    bossId: z.string().regex(/^[a-z0-9_]+$/),
    trophy: z.string().regex(/^[a-z0-9_]+$/),
  })
  .strict();

export const mineLayersSchema = z
  .array(mineLayerSchema)
  .min(1)
  .refine((rows) => rows.every((r, i) => r.layer === i + 1), {
    message: 'слои нумеруются подряд от 1',
  })
  .refine(
    (rows) => {
      // гейт ачивки слоя n ссылается на босса слоя n−1 (канон G3)
      for (const r of rows) {
        if (r.unlock === undefined) continue;
        const u = r.unlock as { t?: string; id?: string };
        if (u.t !== 'achievement') return false;
        const prev = rows[r.layer - 2];
        if (prev === undefined || u.id !== `ach_mine_boss_${r.layer - 1}`) return false;
      }
      return true;
    },
    { message: 'unlock слоя n = ачивка ach_mine_boss_<n−1> (G3)' },
  );

// ============================================================ [M13.1] карты забега
// Карточка M13 §2 ×12 kinds + факел/статусы/крот/насыщенность (бриф R2–R5).
// Пейлоады — ДАННЫЕ: схема проверяет форму по kind (P5: неизвестный kind =
// отказ загрузки с путём поля, «молчаливого NaN» нет).

const mineCardKindSchema = z.enum([
  'empty',
  'oreVein',
  'chest',
  'collapse',
  'mob',
  'boss',
  'altar',
  'spring',
  'campfire',
  'trader',
  'camp',
  'exit',
]);

const altarOfferSchema = z
  .object({
    label: z.string().min(1),
    price: z
      .object({
        gold: z.number().int().min(1).optional(),
        hp: z.number().int().min(1).optional(),
        item: z.object({ defId: z.string().regex(/^[a-z0-9_]+$/), qty: z.number().int().min(1) }).strict().optional(),
      })
      .strict(),
    mod: z
      .object({
        stat: z.string().min(1),
        op: z.enum(['flat', 'inc', 'more']),
        value: z.number().finite(),
        label: z.string().min(1),
      })
      .strict(),
  })
  .strict();

const campEventSchema = z
  .object({
    text: z.string().min(1),
    choices: z
      .array(
        z
          .object({
            label: z.string().min(1),
            effect: z
              .object({
                heal: z.number().int().min(1).optional(),
                gold: z.tuple([z.number().int().min(1), z.number().int().min(1)]).optional(),
                torches: z.number().int().min(1).optional(),
              })
              .strict(),
          })
          .strict(),
      )
      .min(1),
    autoPick: z.number().int().min(0),
  })
  .strict();

export const mineCardsSchema = z
  .array(
    z
      .object({
        id: z.string().regex(/^card_[a-z0-9_]+$/),
        kind: mineCardKindSchema,
        hidden: z.boolean(),
        weight: z.number().int().min(0),
        payload: z.unknown(),
        unlock: z.unknown().optional(),
      })
      .strict(),
  )
  .min(12)
  .refine((rows) => {
    // ×12 поимённо (карточка §2): ровно по одному kind, boss — вес 0
    const kinds = new Set<string>(rows.map((r) => r.kind));
    if (kinds.size !== rows.length) return false;
    const expected: string[] = [
      'empty',
      'oreVein',
      'chest',
      'collapse',
      'mob',
      'boss',
      'altar',
      'spring',
      'campfire',
      'trader',
      'camp',
      'exit',
    ];
    for (const k of expected) if (!kinds.has(k)) return false;
    return rows.find((r) => r.kind === 'boss')?.weight === 0;
  }, { message: 'карты ×12 поимённо, kind boss — вес 0 (в колонки не роллится)' });

export const mineTorchSchema = z
  .object({ mode: z.enum(['direct', 'luck']), base: z.number().int().min(1).max(100) })
  .strict();

export const mineLayerStatusesSchema = z
  .array(
    z
      .object({
        layer: z.number().int().min(1),
        status: z.enum(['cold', 'dark', 'poison', 'hot']).nullable(),
        effect: z
          .object({
            stat: z.string().min(1),
            op: z.enum(['flat', 'inc', 'more']),
            value: z.number().finite(),
            label: z.string().min(1),
          })
          .strict()
          .optional(),
      })
      .strict(),
  )
  .min(1)
  .refine((rows) => rows.every((r, i) => r.layer === i + 1), {
    message: 'статусы нумеруются по слоям подряд от 1',
  });

export const mineRunEffectsSchema = z
  .array(
    z
      .object({
        defId: z.string().regex(/^[a-z0-9_]+$/),
        effect: z.literal('exit'),
        label: z.string().min(1),
      })
      .strict(),
  )
  .min(1);

// ============================================================ [M13.1] улучшения ×4
// Бриф R6 (из ×6 карточки §3; Барак/Отряд — M13.2-замок): Вагонёт/Освещение/
// Оборудование лагеря/Лифт; effect — ДАННЫЕ, код читает обобщённо (П5).

export const mineUpgradesSchema = z
  .array(
    z
      .object({
        id: z.string().regex(/^mine_[a-z0-9_]+$/),
        name: z.string().min(1),
        desc: z.string().min(1),
        costGold: z.number().int().min(1),
        effect: z.union([
          z.object({ t: z.literal('bagSlots'), bagSlots: z.number().int().min(1) }).strict(),
          z.object({ t: z.literal('lighting'), hiddenChanceInc: z.number().int().max(0) }).strict(),
          z.object({ t: z.literal('campgear'), perCards: z.number().int().min(1), hp: z.number().int().min(1) }).strict(),
          z.object({ t: z.literal('lift'), startColumn: z.number().int().min(2).max(4) }).strict(),
        ]),
      })
      .strict(),
  )
  .min(4)
  .refine((rows) => {
    const kinds = new Set(rows.map((r) => r.effect.t));
    return ['bagSlots', 'lighting', 'campgear', 'lift'].every((k) => kinds.has(k as 'bagSlots' | 'lighting' | 'campgear' | 'lift'));
  }, { message: 'улучшения ×4: Вагонёт/Освещение/Оборудование/Лифт (R6)' });
