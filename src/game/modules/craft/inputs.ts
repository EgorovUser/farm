/**
 * Разрешение входов/выходов рецептов и снапшот качества потребляемых входов.
 *
 * defId входа/выхода — предмет ИЛИ валюта кошелька (03-DATA §1). Разрешение
 * рода: каталог валют → иначе реестр предметов; ни там ни там — валидная
 * ошибка контента ([DECISION] M09; коллизий id нет: валюты с двоеточием
 * предметами не бывают, feed/fertilizer/... предметами не являются).
 *
 * avgInputTier: средневзвешенное (по qty) значение тира ПРЕДМЕТНЫХ входов,
 * которые БУДУТ потреблены — зеркально политике изъятия M02 (D25 худшие
 * вперёд, экипированные исключены; прямой импорт M02 запрещён — П4 — политика
 * воспроизведена здесь и зафиксирована чеком). Валюты качества не имеют и в
 * среднее НЕ входят; предметных входов нет — нейтральный тир из данных
 * ([DECISION] M09: «качество входных ингредиентов влияет» — без разбавления).
 */
import type { Cost } from '@/kernel/services/transaction/transaction-service';
import type { CurrencyId, ID, QualityTier } from '@/shared/types/ids';
import { QUALITY_TIERS } from '@/shared/types/ids';
import type { Result } from '@/shared/types/result';
import { err, ok } from '@/shared/types/result';
import type { RecipeDef } from '@/content/craft/recipes';
import type { CraftTable } from '@/content/balance/craft';
import { tierValue } from './quality';

export interface RecipeIOLine {
  defId: ID;
  qty: number;
  kind: 'item' | 'currency';
}

export interface RecipeIO {
  inputs: RecipeIOLine[];
  output: RecipeIOLine;
}

export interface InputPlan {
  /** позиции для TransactionService (предметы + валюты) */
  costs: Cost[];
  /** снапшот среднего тира предметных входов (шкала 0..5) */
  avgInputTier: number;
}

/** минимальная форма записи инвентаря, нужная плану (без импорта M02, П4) */
export interface InventoryEntryLike {
  iid: ID;
  defId: ID;
  qty: number;
  quality: { tier: QualityTier; value: number };
}

export interface RecipeIODeps {
  isCurrency(defId: ID): boolean;
  tryItem(defId: ID): { id: ID; modSlots?: unknown } | undefined;
}

/** Разрешить род всех defId рецепта; неизвестное — валидная ошибка (П5) */
export function resolveRecipeIO(recipe: RecipeDef, deps: RecipeIODeps): Result<RecipeIO> {
  const line = (defId: ID, qty: number): Result<RecipeIOLine> => {
    if (deps.isCurrency(defId)) return ok({ defId, qty, kind: 'currency' });
    if (deps.tryItem(defId)) return ok({ defId, qty, kind: 'item' });
    return err(`рецепт ${recipe.id}: "${defId}" не найден ни в валютах, ни в предметах (content)`);
  };
  const inputs: RecipeIOLine[] = [];
  for (const i of recipe.inputs) {
    const r = line(i.defId, i.qty);
    if (!r.ok) return r;
    inputs.push(r.value);
  }
  const out = line(recipe.output.defId, recipe.output.qty);
  if (!out.ok) return out;
  return ok({ inputs, output: out.value });
}

/** Зеркало D25 (M02 logic.ts): сортировка кандидатов «худшие вперёд» */
function worstFirst(entries: InventoryEntryLike[]): InventoryEntryLike[] {
  const rank = (tier: QualityTier): number => QUALITY_TIERS.indexOf(tier);
  return [...entries].sort((a, b) => {
    const d = rank(a.quality.tier) - rank(b.quality.tier);
    return d !== 0 ? d : a.quality.value - b.quality.value;
  });
}

export interface PlanInputsDeps extends RecipeIODeps {
  table: CraftTable;
  /** рюкзак инвентаря (inventory.list — экипированные уже исключены, D30) */
  listItems(): InventoryEntryLike[];
  /** количество валюты в кошельке (для чистого сообщения до транзакции) */
  walletGet(id: ID): number;
}

/**
 * План потребления: доступность всех входов + снапшот avgInputTier.
 * Недостаток — валидный отказ с раскладом (до списания энергии/входов).
 */
export function planInputs(io: RecipeIO, deps: PlanInputsDeps): Result<InputPlan> {
  const costs: Cost[] = [];
  let tierSum = 0;
  let tierQty = 0;

  for (const line of io.inputs) {
    if (line.kind === 'currency') {
      const have = deps.walletGet(line.defId);
      if (have < line.qty) {
        return err(`не хватает ${line.defId}: есть ${have}, нужно ${line.qty}`);
      }
      // род гарантирует isCurrency(): id входит в каталог CurrencyId
      costs.push({ t: 'currency', id: line.defId as CurrencyId, qty: line.qty });
      continue;
    }
    const candidates = deps.listItems().filter((e) => e.defId === line.defId);
    const have = candidates.reduce((s, e) => s + e.qty, 0);
    if (have < line.qty) {
      return err(`не хватает предметов ${line.defId}: есть ${have}, нужно ${line.qty}`);
    }
    costs.push({ t: 'item', defId: line.defId, qty: line.qty });
    // какие записи будут изъяты — худшие вперёд (зеркало D25)
    let rest = line.qty;
    for (const entry of worstFirst(candidates)) {
      if (rest <= 0) break;
      const take = Math.min(entry.qty, rest);
      tierSum += take * tierValue(entry.quality.tier, entry.quality.value);
      tierQty += take;
      rest -= take;
    }
  }

  const avgInputTier = tierQty > 0 ? tierSum / tierQty : deps.table.quality.neutralInputTier;
  return ok({ costs, avgInputTier });
}
