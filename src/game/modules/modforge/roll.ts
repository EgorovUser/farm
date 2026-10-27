/**
 * Движок ривен-роллов M03 §5 — ЧИСТАЯ функция: реестр типов, бюджет, форма и
 * rng передаются снаружи (детерминизм по сиду: один сид → один ролл).
 * Движок не знает, КОМУ роллит (кирка/карточка заточки/трейт — П5): новый
 * тип характеристики = строка реестра, ноль кода (приёмка §10).
 *
 * [DECISION · M03.2] порядок: дебаф определяется ПЕРВЫМ (§5 шаг 5 перенесён
 * вперёд) — его рефанд расширяет бюджет бафов. Иначе §10-оракул («с дебафом
 * сумма бафов в среднем выше на refundRate−1») и пример §4 («дебаф вернёт
 * бюджет и усилит бафы») невыполнимы: бафы, роллящиеся ДО рефанда, в него
 * не помещаются. Шаг 6 (перегон слабейшего бафа вниз) оставлен предохранителем
 * округлений сетки 0.1/round2 — в честной арифметике не срабатывает.
 *
 * КОНТРАКТ ПОТРЕБЛЕНИЯ rng (детерминизм, ровно в этом порядке):
 *   1) nPos — 1 вызов (всегда);
 *   2) решение о дебафе — 1 вызов (если negChance > 0 и есть кандидаты с минусом);
 *   3) значение дебафа — 1 вызов (если дебаф выбран);
 *   4) каждый выбор типа бафа — 1 вызов (взвешенно по costWeight, без повторов);
 *   5) значение каждого бафа — 1 вызов (целевая стоимость в остатке, кривая типа).
 *
 * [DECISION · M03.2] минимальное значение бафа — 0.1: nPos выбранных типов —
 * обязательство (канон §4 «common → ровно 1 баф»), поэтому цель меньше
 * стоимости минимума даёт МИНИМАЛЬНЫЙ баф (стоимость ~0.01), а не пустой ролл;
 * если даже 0.1 не лезет в остаток (бюджет исчерпан до копейки) — баф
 * сбрасывается (штатно, инвариант §3 важнее количества).
 */
import type { ModTypeDef } from '@/content/mods/registry';
import type { ModForgeTable } from '@/content/balance/modforge';
import type { ID, Tag } from '@/shared/types/ids';
import type { RolledModEntry } from '@/shared/types/rolled-mod';
import { rollRange, weightedPick, type RangeCurve } from '@/shared/utils/rng';
import { costNegative, costPositive, fitPositiveValue, negativeRefund, spentBudget, type CostCurve } from './cost';

/** форма ролла (§4): кол-во бафов и шанс дебафа */
export interface RollShape {
  positives: [number, number];
  negChance: number;
}

export interface RollForRequest {
  budget: number;
  scopeTags: Tag[];
  shape: RollShape;
  /** реестр типов (можно расширить фикстурой — приёмка §10) */
  mods: readonly ModTypeDef[];
  rng: () => number;
  /** маркер происхождения (по умолчанию 'initial'; 'forge' + уровень — M10) */
  from?: 'initial' | 'forge';
  forgeLevel?: number;
}

export interface RollCostLine {
  type: ID;
  value: number;
  cost: number;
}

export interface RollOutcome {
  rolls: RolledModEntry[];
  detail: {
    budget: number;
    refund: number;
    /** потрачено: Σ положительных стоимостей − рефанд (≤ budget, §3) */
    spent: number;
    costs: RollCostLine[];
    positiveCount: number;
    negativeCount: number;
    candidates: number;
  };
}

/** кривая типа → кривая распределения целевой стоимости (02-BUSES §6 rollRange) */
const CURVE_MAP: Record<NonNullable<ModTypeDef['curve']>, RangeCurve> = {
  linear: 'uniform',
  soft: 'triangular',
  steep: 'power',
};

/** Кандидаты по скоупу (§5 шаг 1): пересечение тегов; ПУСТОЙ запрос-скоуп =
 *  все строки (debug-канон `mods roll <rarity>` без тега). */
export function candidatesFor(mods: readonly ModTypeDef[], scopeTags: readonly Tag[]): ModTypeDef[] {
  if (scopeTags.length === 0) return [...mods];
  return mods.filter((m) => m.scopeTags.some((t) => scopeTags.includes(t)));
}

/** округление значения к сетке 0.1 (движок §5) */
function round1(x: number): number {
  return Math.round(x * 10) / 10;
}

interface DraftEntry {
  mod: ModTypeDef;
  value: number;
  cost: number;
}

/**
 * Алгоритм §5. Пустой результат (нет кандидатов / бюджет ≤ 0 без рефанда) —
 * штатный случай (П5), НЕ ошибка: политику отказов определяет потребитель.
 */
export function rollFor(req: RollForRequest, table: Pick<ModForgeTable, 'negativeRefund' | 'positiveExponent' | 'negativeExponent'>): RollOutcome {
  const curve: CostCurve = {
    positiveExponent: table.positiveExponent,
    negativeExponent: table.negativeExponent,
  };
  const rng = req.rng;
  const candidates = candidatesFor(req.mods, req.scopeTags);
  const buffPool = candidates.filter((m) => m.maxPositive > 0);
  const negPool = candidates.filter((m) => m.maxNegative < 0);

  // --- шаг 2: nPos (клэмп по наличию кандидатов — ниже, при выборе)
  const [minP, maxP] = req.shape.positives;
  const nPosWanted = minP + Math.floor(rng() * (Math.max(minP, maxP) - minP + 1));

  // --- шаг 5 (ПЕРВЫМ, [DECISION]): дебаф — тип взвешенно по costWeight,
  //     значение свободно по кривой типа; рефанд = |cost| × refundRate
  let negMod: ModTypeDef | null = null;
  let negValue = 0;
  let refund = 0;
  if (negPool.length > 0 && req.shape.negChance > 0 && rng() < req.shape.negChance) {
    const pick = weightedPick(
      negPool.map((m) => ({ id: m.id, weight: m.costWeight })),
      rng,
    );
    negMod = pick ? (negPool.find((m) => m.id === pick.id) ?? null) : null;
    if (negMod) {
      const mag = rollRange(0, -negMod.maxNegative, rng, CURVE_MAP[negMod.curve ?? 'linear']);
      negValue = -round1(mag);
      if (negValue >= 0) {
        negMod = null; // нулевых дебафов не бывает (округление к 0)
      } else {
        refund = negativeRefund(table.negativeRefund, costNegative(curve, negMod, negValue));
      }
    }
  }

  // --- шаг 3: nPos РАЗНЫХ типов бафов, взвешенно по costWeight, без типа дебафа
  const available = buffPool.filter((m) => m !== negMod);
  const picked: ModTypeDef[] = [];
  const want = Math.min(nPosWanted, available.length);
  for (let i = 0; i < want; i++) {
    const rest = available.filter((m) => !picked.includes(m));
    const pick = weightedPick(
      rest.map((m) => ({ id: m.id, weight: m.costWeight })),
      rng,
    );
    if (!pick) break;
    const mod = rest.find((m) => m.id === pick.id);
    if (!mod) break;
    picked.push(mod);
  }

  // --- шаг 4: значение каждого бафа — целевая стоимость в остатке бюджета
  //     (кривая типа), затем обращение cost(v) бинарным поиском по сетке 0.1;
  //     крошечная цель — минимальный баф 0.1 ([DECISION], см. шапку)
  let remaining = req.budget + refund;
  const drafts: DraftEntry[] = [];
  for (const mod of picked) {
    const target = rollRange(0, remaining, rng, CURVE_MAP[mod.curve ?? 'linear']);
    let value = round1(fitPositiveValue(curve, mod, target));
    if (value <= 0 && target > 0 && costPositive(curve, mod, 0.1) <= remaining) {
      value = 0.1;
    }
    if (value <= 0) continue; // бюджет исчерпан до копейки — ролл фиксируется (§4)
    const cost = costPositive(curve, mod, value);
    remaining -= cost;
    drafts.push({ mod, value, cost });
  }

  // --- шаг 6: инвариант §3 (Σpos − refund ≤ budget) — перегон слабейшего
  //     бафа вниз, НЕ пересборка. Предохранитель округлений (см. шапку).
  enforceBudget(curve, drafts, refund, req.budget);

  // --- сборка: дебаф первым, бафы в порядке выбора (стабильная форма);
  //     [MISS-2 · M15.2] дебаф-запись несёт тот же маркер forgeLevel, что бафы
  //     (rolls-port требует его для ВСЕХ записей from:'forge' — иначе партия
  //     отвергается целиком и карточка теряется при живом уровне)
  const from: RolledModEntry['from'] = req.from === 'forge' ? 'forge' : 'initial';
  const rolls: RolledModEntry[] = [];
  const costs: RollCostLine[] = [];
  if (negMod && negValue < 0) {
    rolls.push(
      from === 'forge' && req.forgeLevel !== undefined
        ? { type: negMod.id, value: negValue, from, forgeLevel: req.forgeLevel }
        : { type: negMod.id, value: negValue, from },
    );
    costs.push({ type: negMod.id, value: negValue, cost: costNegative(curve, negMod, negValue) });
  }
  for (const d of drafts) {
    rolls.push(
      from === 'forge' && req.forgeLevel !== undefined
        ? { type: d.mod.id, value: d.value, from, forgeLevel: req.forgeLevel }
        : { type: d.mod.id, value: d.value, from },
    );
    costs.push({ type: d.mod.id, value: d.value, cost: d.cost });
  }

  return {
    rolls,
    detail: {
      budget: req.budget,
      refund,
      spent: spentBudget(
        table.negativeRefund,
        drafts.map((d) => d.cost),
        negMod && negValue < 0 ? [costNegative(curve, negMod, negValue)] : [],
      ),
      costs,
      positiveCount: drafts.length,
      negativeCount: negMod && negValue < 0 ? 1 : 0,
      candidates: candidates.length,
    },
  };
}

/** §5 шаг 6: перегон слабейшего бафа вниз пока spent ≤ budget (без пересборки) */
function enforceBudget(curve: CostCurve, drafts: DraftEntry[], refund: number, budget: number): void {
  const spent = () => round2(spentBudget(1, drafts.map((d) => d.cost), [-refund]));
  let guard = 0;
  while (spent() > budget + 1e-9 && drafts.length > 0 && guard++ < 200) {
    let idx = 0;
    for (let i = 1; i < drafts.length; i++) {
      if (drafts[i].cost < drafts[idx].cost) idx = i;
    }
    const d = drafts[idx];
    const excess = spent() - budget;
    const newTarget = Math.max(0, d.cost - excess - 0.01);
    const value = round1(fitPositiveValue(curve, d.mod, newTarget));
    if (value <= 0) {
      drafts.splice(idx, 1);
      continue;
    }
    d.value = value;
    d.cost = costPositive(curve, d.mod, value);
  }
}

function round2(x: number): number {
  return Math.round(x * 100) / 100;
}
