/**
 * StatBus — шина характеристик (02-BUSES §3).
 * [РАСШИРЕНИЕ] Сверх §3: resolveTrace (П6), StatMeta { round, min }, защита от циклов.
 * resolve(query):
 *   1. base = baseSource.base(stat)                  // база из данных, НЕ мутируется (П2)
 *   2. mods = провайдеры → фильтр (условия/теги/срок)
 *   3. стек-группы: внутри группы max(value)
 *   4. override: побеждает max(priority); при победе flat/inc/more НЕ применяются
 *      ([DECISION] по примеру из 02-BUSES §3: «замена есть замена» — трассировка
 *      с override 50 даёт 50, а не 77; капы применяются и после override)
 *   5. v += Σflat; v ×= (1 + Σinc/100); v ×= Π(1 + more/100)
 *   6. капы; округление по правилу стата
 *
 * Кэш: до конца тика (time.minuteTick) или invalidate.stat.
 * Чистота: resolve — функция от (данные + состояние провайдеров + ctx).
 */
import { checkCondition } from '@/shared/utils/condition-check';
import { roundBy, stableKey, type Rounding } from '@/shared/utils/math';
import type { ConditionCtx } from '@/shared/types/requirement';
import type { StatId } from '@/shared/types/ids';
import type { Modifier, ModifierProvider, ResolveCtx } from './modifier';

export interface StatMeta {
  round?: Rounding;
  /** жёсткий нижний предел данных (например, энергия не ниже 0) */
  min?: number;
}

export interface BaseSource {
  base(stat: StatId): number;
  meta(stat: StatId): StatMeta;
  listStats(): StatId[];
}

export interface ResolveTraceStep {
  label: string;
  value: number;
}

export interface ResolveTraceModInfo {
  id: string;
  source: string;
  op: string;
  value: number;
  applied: boolean;
  reason?: string;
}

export interface ResolveTrace {
  stat: StatId;
  base: number;
  mods: ResolveTraceModInfo[];
  steps: ResolveTraceStep[];
  final: number;
}

const MAX_CONDITION_DEPTH = 8;

interface CacheEntry {
  value: number;
  trace: ResolveTrace;
}

export class StatBus {
  private readonly baseSource: BaseSource;
  private readonly providers = new Map<string, ModifierProvider>();
  private readonly cache = new Map<string, CacheEntry>();
  private conditionDepth = 0;

  constructor(baseSource: BaseSource) {
    this.baseSource = baseSource;
  }

  registerProvider(provider: ModifierProvider): void {
    this.providers.set(provider.id, provider);
    this.cache.clear();
  }

  unregisterProvider(providerId: string): void {
    if (this.providers.delete(providerId)) this.cache.clear();
  }

  providerIds(): string[] {
    return [...this.providers.keys()].sort();
  }

  listStats(): StatId[] {
    return this.baseSource.listStats();
  }

  hasStat(stat: StatId): boolean {
    try {
      this.baseSource.base(stat);
      return true;
    } catch {
      return false;
    }
  }

  clearCache(): void {
    this.cache.clear();
  }

  resolve(query: { stat: StatId; ctx: ResolveCtx }): number {
    return this.resolveCached(query).value;
  }

  /** Полная трассировка для debug-консоли и честных тултипов (П6) */
  resolveTrace(query: { stat: StatId; ctx: ResolveCtx }): ResolveTrace {
    return this.resolveCached(query).trace;
  }

  // ------------------------------------------------------------------ internals

  private resolveCached(query: { stat: StatId; ctx: ResolveCtx }): CacheEntry {
    const key = `${query.stat}|${stableKey(query.ctx)}`;
    const cached = this.cache.get(key);
    if (cached) return cached;
    const entry = this.compute(query.stat, query.ctx);
    this.cache.set(key, entry);
    return entry;
  }

  private compute(stat: StatId, ctx: ResolveCtx): CacheEntry {
    const base = this.baseSource.base(stat);
    const gathered = this.gatherMods(stat, ctx);

    const trace: ResolveTrace = {
      stat,
      base,
      mods: [],
      steps: [{ label: 'база', value: base }],
      final: base,
    };

    let v = base;
    const overrides = gathered.filter((m) => m.mod.op === 'override');

    if (overrides.length > 0) {
      const winner = overrides.reduce((best, m) => {
        const p = m.mod.priority ?? 0;
        const bp = best.mod.priority ?? 0;
        if (p > bp) return m;
        if (p === bp && m.mod.value > best.mod.value) return m;
        return best;
      });
      v = winner.mod.value;
      trace.steps.push({ label: `override [${winner.mod.id}]`, value: v });
      for (const m of gathered) {
        const skipped = m !== winner && m.mod.op !== 'cap';
        trace.mods.push({
          id: m.mod.id,
          source: `${m.mod.source.kind}:${m.mod.source.refId}`,
          op: m.mod.op,
          value: m.mod.value,
          applied: m === winner || m.mod.op === 'cap',
          reason: skipped ? 'переопределён (override)' : undefined,
        });
      }
    } else {
      for (const m of gathered) {
        trace.mods.push({
          id: m.mod.id,
          source: `${m.mod.source.kind}:${m.mod.source.refId}`,
          op: m.mod.op,
          value: m.mod.value,
          applied: true,
        });
      }
      const flats = gathered.filter((m) => m.mod.op === 'flat');
      const incs = gathered.filter((m) => m.mod.op === 'inc');
      const mores = gathered.filter((m) => m.mod.op === 'more');

      if (flats.length > 0) {
        v += flats.reduce((a, m) => a + m.mod.value, 0);
        trace.steps.push({ label: `+ flat ×${flats.length}`, value: v });
      }
      if (incs.length > 0) {
        const total = incs.reduce((a, m) => a + m.mod.value, 0);
        v *= 1 + total / 100;
        trace.steps.push({ label: `× inc ${total > 0 ? '+' : ''}${total}%`, value: v });
      }
      for (const m of mores) {
        v *= 1 + m.mod.value / 100;
        trace.steps.push({ label: `× more ${m.mod.value > 0 ? '+' : ''}${m.mod.value}% [${m.mod.id}]`, value: v });
      }
    }

    // капы — применяются и поверх override
    const caps = gathered.filter((m) => m.mod.op === 'cap');
    if (caps.length > 0) {
      const maxCaps = caps.filter((m) => (m.mod as Modifier & { capDir?: 'max' | 'min' }).capDir !== 'min');
      const minCaps = caps.filter((m) => (m.mod as Modifier & { capDir?: 'max' | 'min' }).capDir === 'min');
      if (maxCaps.length > 0) {
        const bound = Math.min(...maxCaps.map((m) => m.mod.value));
        if (v > bound) {
          v = bound;
          trace.steps.push({ label: `cap ≤ ${bound}`, value: v });
        }
      }
      if (minCaps.length > 0) {
        const bound = Math.max(...minCaps.map((m) => m.mod.value));
        if (v < bound) {
          v = bound;
          trace.steps.push({ label: `cap ≥ ${bound}`, value: v });
        }
      }
    }

    const meta = this.baseSource.meta(stat);
    const rounded = roundBy(v, meta.round ?? 'round');
    const floored = meta.min !== undefined ? Math.max(rounded, meta.min) : rounded;
    if (floored !== v) {
      trace.steps.push({
        label: `округление (${meta.round ?? 'round'}${meta.min !== undefined ? `, min ${meta.min}` : ''})`,
        value: floored,
      });
    }
    trace.final = floored;
    return { value: floored, trace };
  }

  /** Сбор модификаторов от всех провайдеров + фильтры + стек-группы */
  private gatherMods(stat: StatId, ctx: ResolveCtx): Array<{ mod: Modifier; providerId: string }> {
    const collected: Array<{ mod: Modifier; providerId: string }> = [];
    const conditionCtx = this.buildConditionCtx(ctx);

    for (const [providerId, provider] of this.providers) {
      let provided: Modifier[] = [];
      try {
        provided = provider.provide(stat, ctx) ?? [];
      } catch (e) {
        // Провайдер не имеет права ронять шину (П5: неизвестность — рядовой случай)
         
        console.error(`[StatBus] провайдер "${providerId}" упал на stat "${stat}":`, e);
        continue;
      }
      for (const mod of provided) {
        if (mod.stat !== stat) continue;
        if (!this.passesFilters(mod, ctx, conditionCtx)) continue;
        collected.push({ mod, providerId });
      }
    }

    // стек-группы: внутри группы max(value) (02-BUSES §2)
    const groups = new Map<string, { mod: Modifier; providerId: string }>();
    for (const entry of collected) {
      const g = entry.mod.stackGroup;
      if (!g) continue;
      const current = groups.get(g);
      if (!current || entry.mod.value > current.mod.value) groups.set(g, entry);
    }
    // из каждой группы в результат попадает только лучший
    return collected.filter((entry) => {
      const g = entry.mod.stackGroup;
      if (!g) return true;
      return groups.get(g) === entry;
    });
  }

  private passesFilters(mod: Modifier, ctx: ResolveCtx, conditionCtx: ConditionCtx): boolean {
    if (mod.expiresAt !== undefined && mod.expiresAt <= ctx.now) return false;
    if (mod.tags && mod.tags.length > 0) {
      const ctxTags = new Set([...(ctx.tags ?? []), ...(ctx.location ? [ctx.location] : [])]);
      const allPresent = mod.tags.every((t) => ctxTags.has(t));
      if (!allPresent) return false;
    }
    if (mod.conditions && mod.conditions.length > 0) {
      if (!mod.conditions.every((c) => checkCondition(c, conditionCtx))) return false;
    }
    return true;
  }

  private buildConditionCtx(ctx: ResolveCtx): ConditionCtx {
    return {
      tags: ctx.tags ?? [],
      stat: (stat) => this.nestedResolve(stat, ctx),
      hasFlag: (flag) => Boolean(ctx.extra?.[`flag:${flag}`]),
      skillLevel: (skill) => Number(ctx.extra?.[`skill:${skill}`] ?? 0),
      playerLevel: Number(ctx.extra?.['player:level'] ?? 0),
      itemCount: (defId) => Number(ctx.extra?.[`item:${defId}`] ?? 0),
      hasAchievement: (id) => Boolean(ctx.extra?.[`achievement:${id}`]),
    };
  }

  /** Резолв чужого стата из условия — с защитой от циклов */
  private nestedResolve(stat: StatId, ctx: ResolveCtx): number {
    if (this.conditionDepth >= MAX_CONDITION_DEPTH) {
      throw new Error(
        `[StatBus] циклическая зависимость условий на stat "${stat}" (глубина ${MAX_CONDITION_DEPTH})`,
      );
    }
    this.conditionDepth++;
    try {
      return this.resolve({ stat, ctx });
    } finally {
      this.conditionDepth--;
    }
  }
}
