/**
 * Коллекция runBag M13.1 (распил run.ts по wc-гигиене, прецедент FIX-M12):
 * слоты (базово 8 + «Вагонёт» +4 — данные upgrades.ts), качество при сборе —
 * КАНАЛ M12 (те же таблицы/стримы inventory.quality, что порт D17), стакинг
 * defId+quality как в инвентаре (Task 70: runBag[].quality?), руда — доход
 * mine.oreYield (ривены кирок flat + «Насыщенность» flat +10 — один стат).
 */
import type { QualityTier } from '@/shared/types/ids';
import type { MineLayerDef } from '@/content/mine/layers';
import type { MineUpgradeDef } from '@/content/mine/upgrades';
import type { MineRunState, MineState } from './state';
import type { RunCtx } from './run';

/** слоты runBag: базово (данные) + «Вагонёт» (+N) */
export function bagSlotsOf(x: RunCtx, state: MineState): number {
  let slots = 8; // MINE_RUN_BAG_BASE_SLOTS (данные upgrades.ts)
  const cart = x.upgradeDefs.find((u) => u.effect.t === 'bagSlots');
  if (cart !== undefined && state.upgrades?.[cart.id] === true) {
    slots += (cart.effect as { bagSlots: number }).bagSlots;
  }
  return slots;
}

/** качество при сборе — КАНАЛ M12 (те же таблицы/стримы, что порт D17) */
export function rollQuality(x: RunCtx): { tier: QualityTier; value: number } {
  const ctx = { ...x.time.ctx('player') };
  const tier = x.rngBus.rollTable('inventory.quality', ctx);
  const value = x.rngBus.rollRange(0, 100, 'uniform', 'inventory.quality.value', ctx);
  const TIERS: QualityTier[] = ['D', 'C', 'B', 'A', 'S', 'SS'];
  return { tier: (TIERS.includes(tier as QualityTier) ? tier : 'D') as QualityTier, value };
}

/** собрать добычу в runBag: стакинг defId+quality; переполнение слотов —
 *  честная утрата (возврат — что не влезло; cozy: золото всегда в кошелёк) */
export function collectToBag(
  x: RunCtx,
  run: MineRunState,
  defId: string,
  qty: number,
  quality?: { tier: QualityTier; value: number },
): { collected: number; lost: number } {
  if (qty < 1) return { collected: 0, lost: 0 };
  const cap = bagSlotsOf(x, x.getState());
  let left = qty;
  if (quality !== undefined) {
    const stack = run.runBag.find((e) => e.defId === defId && e.quality !== undefined && e.quality.tier === quality.tier && e.quality.value === quality.value);
    if (stack !== undefined) {
      stack.qty += left;
      left = 0;
    }
  } else {
    const stack = run.runBag.find((e) => e.defId === defId && e.quality === undefined);
    if (stack !== undefined) {
      stack.qty += left;
      left = 0;
    }
  }
  let lost = 0;
  while (left > 0) {
    if (run.runBag.length >= cap) {
      lost = left;
      break;
    }
    run.runBag.push({ defId, qty: left, ...(quality !== undefined ? { quality } : {}) });
    left = 0;
  }
  return { collected: qty - lost, lost };
}

/** руда забега: доход mine.oreYield (ривены кирок + «Насыщенность») и качество каналом M12 */
export function collectOre(
  x: RunCtx,
  run: MineRunState,
  layerDef: MineLayerDef,
  baseQty: number,
  mult: number,
): { collected: number; lost: number; qty: number } {
  const ctx = { ...x.time.ctx('player'), tags: ['mine', `layer:${run.layer}`, ...(run.status !== null ? [`status:${run.status}`] : [])] };
  const yieldPct = x.statBus.resolve({ stat: 'mine.oreYield', ctx });
  const qty = Math.max(0, Math.round(baseQty * mult * (1 + yieldPct / 100)));
  const quality = rollQuality(x);
  const r = collectToBag(x, run, layerDef.ore.defId, qty, quality);
  return { ...r, qty };
}

export type { MineUpgradeDef };
