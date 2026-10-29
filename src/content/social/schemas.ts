/**
 * Zod-схемы контента M17 «Соц-заглушки» (03-DATA §11: битый контент =
 * отказ загрузки с путём поля). Форма — здесь; ссылочная целостность
 * (счётчики профиля существуют в конфиге M01 §6) — self-чек группы
 * «M17 Соц» (прецедент village: «реестр валидирует форму, связи — чеки»).
 */
import { z } from 'zod';

const ID_RE = /^[a-z0-9_]+$/;
const PLACEHOLDER_RE = /\{[a-z][a-zA-Z0-9]*\}/;

export const socialNewsTableSchema = z
  .object({
    notesPerDay: z
      .object({ min: z.number().int().min(1), max: z.number().int().min(1) })
      .refine((v) => v.min <= v.max, 'min ≤ max'),
    templates: z
      .array(
        z
          .object({
            id: z.string().regex(ID_RE),
            kind: z.enum([
              'village-level',
              'tax',
              'villager-request',
              'villager-grumbler',
              'villager-happy',
              'building-built',
              'building-construction',
              'trade-trend',
              'trade-deal',
              'raid-warning',
              'raid-quiet',
              'raid-result',
              'villagers-waiting',
            ]),
            text: z.string().min(1),
            weight: z.number().int().min(1),
          })
          .strict(),
      )
      .min(1),
  })
  .strict()
  .refine(
    (t) => t.templates.some((x) => x.kind === 'village-level') && t.templates.some((x) => x.kind === 'tax'),
    'голова сводки обязательна: по шаблону категорий village-level и tax',
  );

export const socialMailTableSchema = z
  .object({
    lettersPerDay: z
      .object({ min: z.number().int().min(0), max: z.number().int().min(0) })
      .refine((v) => v.min <= v.max, 'min ≤ max'),
    countWeights: z.tuple([z.number().int().min(1), z.number().int().min(1), z.number().int().min(1)]),
    templates: z
      .array(
        z
          .object({
            id: z.string().regex(ID_RE),
            kind: z.enum(['request', 'thanks', 'raid-warning', 'trend-boast']),
            authorFallback: z.string().min(1).optional(),
            subject: z.string().min(1),
            body: z.string().min(1).refine((b) => PLACEHOLDER_RE.test(b) || b.length > 10, 'тело письма осмысленно'),
            weight: z.number().int().min(1),
          })
          .strict(),
      )
      .min(1),
  })
  .strict()
  .refine(
    (t) =>
      t.templates.filter((x) => x.kind === 'raid-warning').every((x) => (x.authorFallback ?? '').length > 0),
    'письма предвестника рейда пишутся от authorFallback («староста»)',
  );

export const socialProfileTableSchema = z
  .object({
    counters: z
      .array(
        z
          .object({
            id: z.string().regex(/^[a-z0-9_.]+$/),
            label: z.string().min(1),
          })
          .strict(),
      )
      .min(1),
  })
  .strict();
