/**
 * Сбор готовых партий крафта §5/§6 (карточка M09): выдача выходов игроку.
 *
 * Поток: sweep → для каждой готовей партии: рецепт/IO → валютный выход —
 * транзакцией (eventId craft.collect); предметный — ПРОБА вместимости
 * (D23-канон) → преролл ривенов modSlots-выходов (modforge через app-слой,
 * именованный стрим craft:batch:N — прецедент C4 магазина) → выдача
 * (inventory.addWithQuality, явное качество крафта) → применение роллов к
 * НОВЫМ записям. Постоянные эффекты рецепта (рюкзак +4 слота) append'ятся
 * в grantedEffects с уникальным id на партию. Буфер освободился → финальный
 * sweep немедленно стартует ожидающие (пауза cap'а снимается сбором).
 *
 * Пропуск партии (инвентарь полон и т.п.) — не отказ всего сбора: остальные
 * собираются, пропущенные остаются в буфере с причиной (skipped).
 */
import type { CurrencyId, ID, QualityTier } from '@/shared/types/ids';
import type { Result } from '@/shared/types/result';
import { err, ok } from '@/shared/types/result';
import type { RolledModEntry } from '@/shared/types/rolled-mod';
import type { RecipeDef } from '@/content/craft/recipes';
import { resolveRecipeIO } from './inputs';
import { sweepQueues } from './sweep';
import type { QueueDeps } from './deps';

export interface CollectedLine {
  batchId: ID;
  recipeId: ID;
  defId: ID;
  qty: number;
  quality: { tier: QualityTier; value: number };
  iids?: ID[];
}

export interface CollectReceipt {
  collected: CollectedLine[];
  skipped: Array<{ batchId: ID; reason: string }>;
}

export function collectReady(deps: QueueDeps, batchId?: ID): Result<CollectReceipt> {
  sweepQueues(deps);
  const state = deps.getState();
  const targets = batchId ? state.ready.filter((r) => r.id === batchId) : [...state.ready];
  if (batchId && targets.length === 0) {
    return err(`готовая партия "${batchId}" не найдена (craft.queue — витрина)`);
  }
  const collected: CollectedLine[] = [];
  const skipped: Array<{ batchId: ID; reason: string }> = [];
  const taken = new Set<ID>();

  for (const target of targets) {
    const recipe = deps.recipes.find((r) => r.id === target.recipeId);
    if (!recipe) {
      skipped.push({ batchId: target.id, reason: 'рецепт исчез из контента' });
      taken.add(target.id);
      continue;
    }
    const io = resolveRecipeIO(recipe, deps);
    if (!io.ok) {
      skipped.push({ batchId: target.id, reason: io.error });
      taken.add(target.id);
      continue;
    }
    if (io.value.output.kind === 'currency') {
      const grant = deps.transaction.transact({
        grants: [{ t: 'currency', id: io.value.output.defId as CurrencyId, qty: recipe.output.qty }],
        eventId: 'craft.collect',
        reason: `сбор партии ${target.id}`,
      });
      if (!grant.ok) {
        skipped.push({ batchId: target.id, reason: grant.error });
        continue;
      }
      collected.push({
        batchId: target.id,
        recipeId: recipe.id,
        defId: io.value.output.defId,
        qty: recipe.output.qty,
        quality: target.quality,
      });
      taken.add(target.id);
      continue;
    }
    const line = collectItemBatch(deps, target, recipe, io.value.output.defId);
    if (line.ok) {
      collected.push(line.line);
      taken.add(target.id);
    } else {
      skipped.push({ batchId: target.id, reason: line.reason });
    }
  }

  if (taken.size === 0) {
    return err(skipped[0]?.reason ?? 'нет готовых партий (craft.queue — витрина)');
  }

  // --- постоянные эффекты рецептов собранных партий (рюкзак +4 слота)
  const s = deps.getState();
  let grantedEffects = s.grantedEffects;
  for (const line of collected) {
    const recipe = deps.recipes.find((r) => r.id === line.recipeId);
    if (!recipe?.effects) continue;
    for (const eff of recipe.effects) {
      grantedEffects = [
        ...grantedEffects,
        {
          id: `${eff.id}.${line.batchId}`,
          source: eff.source,
          stat: eff.stat,
          op: eff.op,
          value: eff.value,
          ...(eff.label !== undefined ? { label: eff.label } : {}),
        },
      ];
    }
  }
  deps.setState({
    ...s,
    ready: s.ready.filter((r) => !taken.has(r.id)),
    grantedEffects,
  });
  deps.markDirty();
  if (grantedEffects !== s.grantedEffects) {
    // слоты инвентаря изменились — кэш шин пересчитать (прецедент levelUp)
    deps.bus.publish('invalidate.stat', {});
  }
  // буфер освободился → ожидающие партии стартуют немедленно (станция не
  // простаивает до следующего доступа; в живой игре — minuteTick)
  sweepQueues(deps);
  return ok({ collected, skipped });
}

/** Сбор одной предметной партии: проба → преролл C4 → выдача → роллы */
function collectItemBatch(
  deps: QueueDeps,
  target: { id: ID; quality: { tier: QualityTier; value: number } },
  recipe: RecipeDef,
  defId: ID,
): { ok: true; line: CollectedLine } | { ok: false; reason: string } {
  const def = deps.tryItem(defId);
  if (!def) return { ok: false, reason: `предмет ${defId} неизвестен` };
  const probe = deps.probeCapacity(defId, recipe.output.qty);
  if (!probe.ok) return { ok: false, reason: probe.error };
  if (!probe.value.fits) {
    return {
      ok: false,
      reason: `инвентарь полон: нужно записей ${probe.value.newEntries}, свободно ${probe.value.free}`,
    };
  }
  let rolls: RolledModEntry[] | null = null;
  if (def.modSlots) {
    const rollR = deps.rollItem(defId, `craft:batch:${target.id}`);
    if (!rollR.ok) return { ok: false, reason: rollR.error };
    rolls = rollR.value.rolls;
  }
  const deliver = deps.deliverOutput(defId, target.quality.tier, target.quality.value, recipe.output.qty, 'craft.collect');
  if (!deliver.ok) return { ok: false, reason: deliver.error };
  if (rolls !== null) {
    for (const iid of deliver.value.iids) {
      const applied = deps.applyRolls(iid, rolls);
      if (!applied.ok) {
        return { ok: false, reason: `роллы не применены к ${iid}: ${applied.error} (предмет выдан)` };
      }
    }
  }
  return {
    ok: true,
    line: {
      batchId: target.id,
      recipeId: recipe.id,
      defId,
      qty: recipe.output.qty,
      quality: target.quality,
      iids: deliver.value.iids,
    },
  };
}
