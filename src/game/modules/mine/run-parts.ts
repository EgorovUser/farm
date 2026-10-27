/**
 * Распил run.ts по wc-гигиене M13.2 (прецедент FIX-M12 battles/loot): скоуп
 * статов/гейра ЗАБЕГА (M13.1 — теги слоя/статуса; перенесён из module.ts) и
 * детерминированный выбор утрат смерти (стрим mine:run:loss:*).
 */
import type { StatBus } from '@/kernel/bus/stat-bus/stat-bus';
import type { TimeService } from '@/kernel/time/time-service';
import type { QualityTier } from '@/shared/types/ids';
import type { MineTable } from '@/content/mine/table';
import type { BattleCtx } from './battles';
import type { FightGear } from './logic/fight';
import type { MineRunState, MineState } from './state';
import { makeSeededRoll } from './logic/seed';
import type { RunCtx } from './run';

/** скоуп статов/гейра ЗАБЕГА: теги mine/layer/status в резолвах боёв забега
 *  (эффекты статусов — conditions ctxTag; M13.1 R2) */
export function makeRunStatScope(
  deps: BattleCtx['deps'],
  table: MineTable,
  statBus: StatBus,
  time: TimeService,
  getState: () => MineState,
): { runTags: () => string[]; runStatCtx: () => { player: string; now: number; tags: string[] }; runGearOf: () => FightGear } {
  const runTags = (): string[] => {
    const run = getState().run;
    return run === undefined
      ? []
      : ['mine', `layer:${run.layer}`, ...(run.status !== null ? [`status:${run.status}`] : [])];
  };
  const runStatCtx = () => ({ ...time.ctx('player'), tags: runTags() });
  const runGearOf = (): FightGear => {
    const c = runStatCtx();
    const shield = deps.shieldView();
    const sense = shield.hasShield
      ? table.block.sensePerTier *
          Math.max(0, (shield.tier !== null ? table.block.tierNumbers[shield.tier] : 1) - 1)
      : 0;
    return {
      hasShield: shield.hasShield,
      blockSensePct: sense,
      fatedPct: statBus.resolve({ stat: 'combat.prophetic', ctx: c }),
      critPct: statBus.resolve({ stat: 'mine.crit', ctx: c }),
      damagePct: statBus.resolve({ stat: 'mine.damage', ctx: c }),
    };
  };
  return { runTags, runStatCtx, runGearOf };
}

/** детерминированный выбор утрат смерти: квота round(Σqty × pct/100),
 *  частичное перемешивание по сиду забега (стрим mine:run:loss:*) */
export function rollDeathLosses(
  x: RunCtx,
  run: MineRunState,
  lossPercent: number,
): Array<{ defId: string; qty: number; quality?: { tier: QualityTier; value: number } }> {
  const total = run.runBag.reduce((s, e) => s + e.qty, 0);
  const nLost = Math.round((total * lossPercent) / 100);
  if (nLost < 1 || total < 1) return [];
  // единицы: [entryIndex, unitIndex] — частичный Фишер-Йейтс по сиду забега
  const units: Array<[number, number]> = [];
  run.runBag.forEach((e, i) => {
    for (let u = 0; u < e.qty; u++) units.push([i, u]);
  });
  const roll = makeSeededRoll(run.seed >>> 0, x.rngBus.rollLog(), () => x.time.now());
  for (let i = 0; i < nLost; i++) {
    const j = i + Math.floor(roll(`mine:run:loss:pick:${i}`) * (units.length - i));
    const t = units[i]!;
    units[i] = units[j]!;
    units[j] = t;
  }
  const lostPerEntry = new Map<number, number>();
  for (let i = 0; i < nLost; i++) {
    const entryIdx = units[i]![0];
    lostPerEntry.set(entryIdx, (lostPerEntry.get(entryIdx) ?? 0) + 1);
  }
  const out: Array<{ defId: string; qty: number; quality?: { tier: QualityTier; value: number } }> = [];
  for (const [idx, q] of lostPerEntry) {
    const e = run.runBag[idx]!;
    out.push({ defId: e.defId, qty: q, ...(e.quality !== undefined ? { quality: e.quality } : {}) });
    e.qty -= q;
  }
  run.runBag = run.runBag.filter((e) => e.qty > 0);
  return out;
}
