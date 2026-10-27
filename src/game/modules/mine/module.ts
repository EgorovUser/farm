/**
 * MineModule (M12.1 + M12.2 + M13.1) — каркас и монтаж (карточки M12/M13,
 * брифы SESSION-M12.1 F2–F8 / SESSION-M12.2 G1–G7 / SESSION-M13 R1–R10).
 * Изоляция (01 §5–§7): модуль НЕ импортирует чужие модули — все каналы
 * приходят колбэками app-слоя (deps.ts). Боевые сценарии — battles.ts,
 * забег — run/generator/resolve/fight-run/pick/torch/upgrades/view-run,
 * провайдеры — providers.ts (runBuff + кротовая наценка).
 *
 * [M13.1] вход mine.enter открывает ЗАБЕГ (R1): гейты M12.2 (двойной гейт
 * кирка+ачивка + энергия −20 РОВНО один раз — канон) → генерация слоя →
 * mine.runStarted. Смерть — подписка player.hpChanged (идемпотентно, R4).
 * Статы/гир боёв ЗАБЕГА резолвятся с тегами слоя/статуса (эффекты статусов
 * — conditions ctxTag, данные); песочница M12 — без тегей (канон стабильнее
 * golden-логов).
 */
import type { GameModule, ModuleContext } from '@/game/module-registry';
import type { EliteModDef, MineMobDef } from '@/content/mine/mobs';
import type { MineBossDef } from '@/content/mine/bosses';
import type { MineLayerDef } from '@/content/mine/layers';
import type { MineTable } from '@/content/mine/table';
import type { MineCardDef, MineLayerStatusDef, MineRunEffectItem } from '@/content/mine/cards';
import type { MineUpgradeDef } from '@/content/mine/upgrades';
import type { ItemDef } from '@/content/items/items';
import { createMineManifest } from './manifest';
import { defaultMineState, mineSaveSlice, type MineState } from './state';
import type { FightGear } from './logic/fight';
import { createEvaluate, createLayerOf, createLayerGate } from './gates';
import { createBattles } from './battles';
import { buildMobView, buildStateView, buildEnterView, type MobView, type MineStateView, type EnterView } from './view';
import { generateLayer, runSeedOf } from './generator';
import { startRun, onHpChanged, type RunCtx } from './run';
import { pickCard } from './pick';
import { applyTorch } from './torch';
import { upgradesView, buyUpgrade } from './upgrades';
import { buildRunView, buildGenView, runStartLines, type RunView } from './view-run';
import { makeRunBuffProvider, makeMineTraderProvider, RUN_BUFF_PROVIDER_ID, MINE_TRADER_PROVIDER_ID } from './providers';
import type { Result } from '@/shared/types/result';
import { err, ok } from '@/shared/types/result';
import type { MineModuleDeps } from './deps';

export type { MineModuleDeps, PickaxeView } from './deps';

export class MineModule implements GameModule {
  readonly manifest = createMineManifest();
  api: Record<string, (...args: unknown[]) => unknown> = {};
  private state: MineState = defaultMineState();
  private readonly deps: MineModuleDeps;

  constructor(deps: MineModuleDeps) {
    this.deps = deps;
  }

  activate(ctx: ModuleContext): void {
    const { save, content, time, statBus, priceBus, bus } = ctx;
    const table = content.get<MineTable>('mine');
    const mobs = content.get<MineMobDef[]>('mine.mobs') ?? [];
    const eliteDefs = content.get<EliteModDef[]>('mine.eliteMods') ?? [];
    const bosses = content.get<MineBossDef[]>('mine.bosses') ?? [];
    const layers = content.get<MineLayerDef[]>('mine.layers') ?? [];
    const cards = content.get<MineCardDef[]>('mine.cards') ?? [];
    const statuses = content.get<MineLayerStatusDef[]>('mine.cards.statuses') ?? [];
    const runEffects = content.get<MineRunEffectItem[]>('mine.cards.runEffects') ?? [];
    const upgradeDefs = content.get<MineUpgradeDef[]>('mine.upgrades') ?? [];
    const items = content.get<ItemDef[]>('items') ?? [];

    save.registerSlice(
      'mine',
      mineSaveSlice(
        () => this.state,
        (s) => {
          this.state = s;
        },
      ),
    );

    const statCtx = () => ({ ...time.ctx('player') });
    const evaluate = createEvaluate(this.deps, statBus, time);
    const layerOf = createLayerOf(layers);
    const layerGate = createLayerGate(this.deps, evaluate);

    const gearOf = (): FightGear => {
      const c = statCtx();
      const shield = this.deps.shieldView();
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

    // статы/гир боёв ЗАБЕГА — с тегами слоя/статуса (эффекты статусов — ctxTag)
    const runTags = (): string[] => {
      const run = this.state.run;
      return run === undefined
        ? []
        : ['mine', `layer:${run.layer}`, ...(run.status !== null ? [`status:${run.status}`] : [])];
    };
    const runStatCtx = () => ({ ...time.ctx('player'), tags: runTags() });
    const runGearOf = (): FightGear => {
      const c = runStatCtx();
      const shield = this.deps.shieldView();
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

    const battles = createBattles({
      deps: this.deps,
      table,
      mobs,
      eliteDefs,
      bosses,
      layers,
      layerOf,
      layerGate,
      statOf: () => ({
        atk: statBus.resolve({ stat: 'combat.attack', ctx: statCtx() }),
        def: statBus.resolve({ stat: 'combat.defense', ctx: statCtx() }),
        speed: statBus.resolve({ stat: 'mine.speed', ctx: statCtx() }),
      }),
      gearOf,
      getState: () => this.state,
      setState: (s) => {
        this.state = s;
      },
      markDirty: () => save.markDirty(),
      bus: ctx.bus,
      transaction: ctx.transaction,
      rngBus: ctx.rngBus,
      statBus,
      time,
      save,
    });

    // [M13.1] контекст забега: те же шины/сервисы + контент карт/улучшений
    const runCtx: RunCtx = {
      deps: this.deps,
      table,
      mobs,
      eliteDefs,
      bosses,
      layers,
      layerOf,
      layerGate,
      cards,
      statuses,
      upgradeDefs,
      items,
      runEffects,
      priceBus,
      stats: ctx.stats,
      time,
      evaluate,
      statOf: () => ({
        atk: statBus.resolve({ stat: 'combat.attack', ctx: runStatCtx() }),
        def: statBus.resolve({ stat: 'combat.defense', ctx: runStatCtx() }),
        speed: statBus.resolve({ stat: 'mine.speed', ctx: runStatCtx() }),
      }),
      gearOf: runGearOf,
      getState: () => this.state,
      setState: (s) => {
        this.state = s;
      },
      markDirty: () => save.markDirty(),
      bus: ctx.bus,
      transaction: ctx.transaction,
      rngBus: ctx.rngBus,
      statBus,
      save,
    };

    // провайдеры (манифест): runBuff ×1 + кротовая наценка (priceModifierProviders)
    statBus.registerProvider(makeRunBuffProvider(() => this.state, upgradeDefs, statuses));
    priceBus.registerProvider(makeMineTraderProvider(cards));

    // подписка смерти (манифест eventsSubscribed): идемпотентный death-обработчик
    bus.subscribe('player.hpChanged', (payload) => onHpChanged(runCtx, payload));

    /** вход = гейты M12.2 + энергия + СТАРТ ЗАБЕГА (R1) */
    const enterRun = (layerRaw: unknown): Result<EnterView> => {
      const layerDef = layerOf(layerRaw);
      if (!layerDef.ok) return err(layerDef.error);
      const def = layerDef.value;
      if (this.state.run !== undefined) {
        return err('забег уже идёт — сначала завершите его (лестница/босс/свиток; mine run покажет состояние)');
      }
      const gate = layerGate(def);
      if (!gate.ok) return err(gate.error);
      const spent = this.deps.spendEnterEnergy(`спуск в шахту (слой ${def.layer})`);
      if (!spent.ok) return err(spent.error);
      const started = startRun(runCtx, def);
      if (!started.ok) return err(started.error);
      const base = buildEnterView(def, gate.value.pick, spent.value, layers.length);
      return ok({ header: base.header, lines: [...base.lines, '', ...runStartLines(started.value.run, started.value.liftApplied, started.value.liftNote)] });
    };

    /** debug-оракул генерации: mine gen <layer> [--seed S] (сид вместо хеша) */
    const genOracle = (layerRaw: unknown, seedRaw: unknown): Result<RunView> => {
      const layerDef = layerOf(layerRaw);
      if (!layerDef.ok) return err(layerDef.error);
      const def = layerDef.value;
      const seed = seedRaw !== undefined && Number.isFinite(Number(seedRaw))
        ? Math.floor(Number(seedRaw))
        : runSeedOf(this.deps.saveId(), def.layer, (ctx.stats.get('mine.runs') + 1));
      const layout = generateLayer(
        { cards, statuses, mobs, statBus, rngBus: ctx.rngBus, time },
        def.layer,
        seed,
        def,
        { ...time.ctx('player'), tags: ['mine', `layer:${def.layer}`] },
      );
      return ok(buildGenView(layout.cards, def, layout.seed, layout.status, layout.openInfo));
    };

    /** debug: mine reveal all — вскрыть все скрытые карты активного забега */
    const revealAll = (): Result<RunView> => {
      const run = this.state.run;
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

    this.api = {
      // --- витрина статов среза (F8)
      'mine.state': (): MineStateView => buildStateView(this.state),
      // --- витрина дефа моба (F8)
      'mine.mob': (id: unknown): Result<MobView> => {
        const mob = mobs.find((m) => m.id === String(id));
        if (mob === undefined) {
          return err(`неизвестный моб: ${String(id)} (реестр: ${mobs.map((m) => m.id).join(', ')})`);
        }
        return ok(buildMobView(mob, eliteDefs, table));
      },
      // --- бой-песочница (F8; слой по умолчанию 1; БЕЗ вход-гейтов)
      'mine.fight': (mobId: unknown, layer: unknown, seed: unknown): Result<unknown> =>
        battles.runFight(String(mobId), layer, null, seed),
      'mine.elite': (mobId: unknown, mod: unknown, layer: unknown, seed: unknown): Result<unknown> =>
        battles.runFight(String(mobId), layer, mod, seed),
      // --- вход = старт забега (R1): двойной гейт + энергия 20 ровно раз
      'mine.enter': (layerRaw: unknown): Result<unknown> => enterRun(layerRaw),
      // --- босс-бой песочницы (G1/G2/G7: гейты слоя без энергии, --seed golden)
      'mine.boss': (layerRaw: unknown, seedRaw: unknown): Result<unknown> =>
        battles.runBoss(layerRaw, seedRaw),
      // --- [M13.1 · R7] ×7: витрина/выбор/оракул/debug/факел/улучшения
      'mine.run': (): RunView => buildRunView(runCtx),
      'mine.pick': (arg: unknown): Result<{ header: string; lines: string[] }> =>
        pickCard(runCtx, arg === undefined ? '' : String(arg)),
      'mine.gen': (layerRaw: unknown, seedRaw: unknown): Result<RunView> => genOracle(layerRaw, seedRaw),
      'mine.reveal': (): Result<RunView> => revealAll(),
      'mine.torch': (arg: unknown): Result<{ header: string; lines: string[] }> =>
        applyTorch(runCtx, arg === undefined ? undefined : String(arg)),
      'mine.upgrades': (): RunView => upgradesView(runCtx),
      'mine.upgrades.buy': (id: unknown): Result<RunView> =>
        buyUpgrade(runCtx, id === undefined ? '' : String(id)),
    };
  }

  getState(): MineState {
    return this.state;
  }
}
