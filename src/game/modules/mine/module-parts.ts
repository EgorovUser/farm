/**
 * Распил module.ts по wc-гигиене M13.2 (прецедент FIX-M12 battles/loot):
 * замыкания api-точек — вход-забег (гейты + энергия + старт), оракул
 * генерации (mine gen --seed), debug-вскрытие (mine reveal all).
 */
import type { Result } from '@/shared/types/result';
import { err, ok } from '@/shared/types/result';
import type { StatsService } from '@/kernel/services/stats/stats-service';
import type { RngBus } from '@/kernel/bus/rng-bus/rng-bus';
import type { StatBus } from '@/kernel/bus/stat-bus/stat-bus';
import type { SaveDirector } from '@/kernel/save/save-director';
import type { MineLayerDef } from '@/content/mine/layers';
import type { MineCardDef, MineLayerStatusDef } from '@/content/mine/cards';
import type { MineMobDef } from '@/content/mine/mobs';
import type { EnterView } from './view';
import { buildEnterView } from './view';
import { buildGenView, runStartLines, type RunView } from './view-run';
import { generateLayer, runSeedOf } from './generator';
import { startRun, type RunCtx } from './run';
import type { MineState } from './state';
import type { MineModuleDeps, PickaxeView } from './deps';

/** вход = гейты M12.2 + энергия + СТАРТ ЗАБЕГА (R1; состав helpers — на старте) */
export function makeEnterRun(
  runCtx: RunCtx,
  layerOf: (raw: unknown) => Result<MineLayerDef>,
  layerGate: (def: MineLayerDef) => Result<{ pick: PickaxeView }>,
  deps: MineModuleDeps,
  getState: () => MineState,
  layersCount: number,
): (layerRaw: unknown) => Result<EnterView> {
  return (layerRaw: unknown): Result<EnterView> => {
    const layerDef = layerOf(layerRaw);
    if (!layerDef.ok) return err(layerDef.error);
    const def = layerDef.value;
    if (getState().run !== undefined) {
      return err('забег уже идёт — сначала завершите его (лестница/босс/свиток; mine run покажет состояние)');
    }
    const gate = layerGate(def);
    if (!gate.ok) return err(gate.error);
    const spent = deps.spendEnterEnergy(`спуск в шахту (слой ${def.layer})`);
    if (!spent.ok) return err(spent.error);
    const started = startRun(runCtx, def);
    if (!started.ok) return err(started.error);
    const base = buildEnterView(def, gate.value.pick, spent.value, layersCount);
    return ok({ header: base.header, lines: [...base.lines, '', ...runStartLines(started.value.run, started.value.liftApplied, started.value.liftNote)] });
  };
}

/** debug-оракул генерации: mine gen <layer> [--seed S] (сид вместо хеша) */
export function makeGenOracle(
  deps: MineModuleDeps,
  cards: MineCardDef[],
  statuses: MineLayerStatusDef[],
  mobs: MineMobDef[],
  statBus: StatBus,
  rngBus: RngBus,
  time: RunCtx['time'],
  layerOf: (raw: unknown) => Result<MineLayerDef>,
  stats: StatsService,
): (layerRaw: unknown, seedRaw: unknown) => Result<RunView> {
  return (layerRaw: unknown, seedRaw: unknown): Result<RunView> => {
    const layerDef = layerOf(layerRaw);
    if (!layerDef.ok) return err(layerDef.error);
    const def = layerDef.value;
    const seed = seedRaw !== undefined && Number.isFinite(Number(seedRaw))
      ? Math.floor(Number(seedRaw))
      : runSeedOf(deps.saveId(), def.layer, stats.get('mine.runs') + 1);
    const layout = generateLayer(
      { cards, statuses, mobs, statBus, rngBus, time },
      def.layer,
      seed,
      def,
      { ...time.ctx('player'), tags: ['mine', `layer:${def.layer}`] },
    );
    return ok(buildGenView(layout.cards, def, layout.seed, layout.status, layout.openInfo));
  };
}

/** debug: mine reveal all — вскрыть все скрытые карты активного забега */
export function makeRevealAll(
  getState: () => MineState,
  save: SaveDirector,
): () => Result<RunView> {
  return (): Result<RunView> => {
    const run = getState().run;
    if (run === undefined) return err('забега нет — нечего вскрывать (debug-команда)');
    let n = 0;
    for (const c of run.cards) {
      if (c.hidden && c.revealed !== true && c.destroyed !== true) {
        c.revealed = true;
        n += 1;
      }
    }
    save.markDirty();
    return ok({ header: 'debug: reveal all', lines: [`вскрыто скрытых карт: ${n} (факелы НЕ потрачены — debug)`] });
  };
}
