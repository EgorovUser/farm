/**
 * Zod-схемы контента M14 «Дерево пассивик» (03-DATA §11: битый контент =
 * отказ загрузки с путём поля; паттерн content/mine/schemas.ts).
 *
 * [F6 · валидация связности] superRefine дерева: каждый узел достижим из
 * старт-узлов BFS по рёбрам — висячие узлы и недостижимые кластеры = ОШИБКА
 * ЗАГРУЗКИ (карточка §6). Проверки чистые (функция данных) — воспроизводятся
 * в self-группе «M14 Пассивки» фикстурой с висячим узлом.
 */
import { z } from 'zod';
import type { PassivesPointsTable, PassivesRespecTable, PassivesTree } from './types';

const opSchema = z.enum(['flat', 'inc', 'more', 'override', 'cap']);

export const passiveNodeModSchema = z
  .object({
    stat: z.string().min(1),
    op: opSchema,
    value: z.number().finite(),
    priority: z.number().int().min(0).max(1000).optional(),
    label: z.string().min(1).optional(),
  })
  .strict();

export const passiveNodeSchema = z
  .object({
    id: z.string().regex(/^[a-z][a-z0-9_]*$/, 'id узла: snake_case'),
    name: z.string().min(1),
    kind: z.enum(['small', 'notable', 'keystone']),
    cluster: z.enum(['core', 'farm', 'fish', 'mine', 'economy', 'animals']),
    cost: z.number().int().min(0).max(10),
    mods: z.array(passiveNodeModSchema),
    links: z.array(z.string().min(1)),
    pos: z.object({ x: z.number().finite(), y: z.number().finite() }).strict(),
    note: z.string().min(1).optional(),
  })
  .strict()
  .refine((n) => n.kind !== 'keystone' || n.mods.length >= 2, {
    message: 'keystone — комбинация модификаторов (карточка §3: минимум два)',
  });

/** BFS достижимости от старт-узлов по объединению рёбер (граф неориентированный) */
export function reachableFromStart(tree: {
  startNodes: string[];
  nodes: Array<{ id: string; links: string[] }>;
}): Set<string> {
  const adjacency = new Map<string, Set<string>>();
  for (const n of tree.nodes) {
    const set = adjacency.get(n.id) ?? new Set<string>();
    for (const to of n.links) {
      set.add(to);
      const other = adjacency.get(to) ?? new Set<string>();
      other.add(n.id);
      adjacency.set(to, other);
    }
    adjacency.set(n.id, set);
  }
  const seen = new Set<string>();
  const queue = [...tree.startNodes];
  while (queue.length > 0) {
    const cur = queue.shift()!;
    if (seen.has(cur)) continue;
    seen.add(cur);
    for (const next of adjacency.get(cur) ?? []) {
      if (!seen.has(next)) queue.push(next);
    }
  }
  return seen;
}

export const passivesTreeSchema: z.ZodType<PassivesTree> = z
  .object({
    startNodes: z.array(z.string().min(1)).min(1),
    nodes: z.array(passiveNodeSchema).min(1),
  })
  .strict()
  .superRefine((tree, ctx) => {
    const ids = new Set(tree.nodes.map((n) => n.id));
    if (ids.size !== tree.nodes.length) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'id узлов должны быть уникальны' });
    }
    // рёбра указывают на существующие узлы
    for (const n of tree.nodes) {
      for (const to of n.links) {
        if (!ids.has(to)) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: `узел "${n.id}": ребро к несуществующему "${to}"`,
          });
        }
      }
    }
    // старт-узлы существуют
    for (const s of tree.startNodes) {
      if (!ids.has(s)) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, message: `старт-узел "${s}" не найден среди узлов` });
      }
    }
    // старт-узлы бесплатны и без модификаторов (якорь, не выбор); прочие
    // узлы обязаны иметь хотя бы один модификатор
    for (const n of tree.nodes) {
      if (tree.startNodes.includes(n.id)) {
        if (n.cost !== 0 || n.mods.length > 0) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: `старт-узел "${n.id}": cost 0 и без модификаторов (якорь достижимости)`,
          });
        }
      } else if (n.mods.length === 0) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: `узел "${n.id}" вне старта обязан иметь модификаторы`,
        });
      }
    }
    // [F6] достижимость: висячие узлы/недостижимые кластеры = ошибка загрузки
    const reachable = reachableFromStart(tree);
    for (const n of tree.nodes) {
      if (!reachable.has(n.id)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: `узел "${n.id}" недостижим из старта (висячий узел/кластер — карточка §6)`,
        });
      }
    }
  });

export const passivesPointsSchema: z.ZodType<PassivesPointsTable> = z
  .object({
    perLevel: z.number().int().min(1).max(3),
    perBoss: z.number().int().min(1).max(10),
    largeAchievements: z
      .array(
        z
          .object({ id: z.string().min(1), points: z.number().int().min(1).max(3) })
          .strict(),
      )
      .min(1),
    bossAchievements: z.array(z.string().min(1)).min(1),
  })
  .strict()
  .superRefine((t, ctx) => {
    const largeIds = new Set(t.largeAchievements.map((a) => a.id));
    if (largeIds.size !== t.largeAchievements.length) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'id «крупных» ачивок должны быть уникальны' });
    }
    const bossSet = new Set(t.bossAchievements);
    if (bossSet.size !== t.bossAchievements.length) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'id боссовых ачивок должны быть уникальны' });
    }
    // «крупная» и «боссовая» — разные каналы (двойной счёт исключён, бриф §0)
    for (const b of t.bossAchievements) {
      if (largeIds.has(b)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: `ачивка "${b}" не может быть и «крупной», и боссовой (двойной счёт)`,
        });
      }
    }
  });

export const passivesRespecSchema: z.ZodType<PassivesRespecTable> = z
  .object({
    baseCost: z.number().int().min(1).max(100000),
    growthMult: z.number().min(1).max(10),
  })
  .strict();
