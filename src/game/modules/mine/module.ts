/**
 * MineModule (M12.1 + M12.2 + M13.1 + M13.2) — каркас и монтаж (карточки
 * M12/M13, брифы SESSION-M12.1 F2–F8 / SESSION-M12.2 G1–G7 / SESSION-M13
 * R1–R10). Изоляция (01 §5–§7): модуль НЕ импортирует чужие модули — все
 * каналы приходят колбэками app-слоя (deps.ts). Боевые сценарии — battles.ts,
 * забег — run/generator/resolve/fight-run/pick/torch/upgrades/view-run,
 * помощники — helpers-board/hire/fight/battle/pay (M13.2), провайдеры —
 * providers.ts (runBuff + кротовая наценка).
 *
 * [M13.2] доска наёмников: детерминизм dailySeed(saveId, dateISO) с кэшем
 * в памяти (прецедент workers boardOf); профиль нанятого перепосчитывается
 * из доски дня найма (defId hpr_<дата>_<i>); трейты — deps.rollTraits
 * (живой ривен-конструктор M03 по реестру, П4). Вход mine.enter — гейты
 * M12.2 + энергия + СТАРТ ЗАБЕГА (состав helpers — на старте, R2).
 */
import type { GameModule, ModuleContext } from '@/game/module-registry';
import type { EliteModDef, MineMobDef } from '@/content/mine/mobs';
import type { MineBossDef } from '@/content/mine/bosses';
import type { MineLayerDef } from '@/content/mine/layers';
import type { MineTable } from '@/content/mine/table';
import type { MineCardDef, MineLayerStatusDef, MineRunEffectItem } from '@/content/mine/cards';
import type { MineUpgradeDef } from '@/content/mine/upgrades';
import type { ItemDef } from '@/content/items/items';
import type { ModTypeDef } from '@/content/mods/registry';
import type { HelperClassDef, HelperFearDef, HelperProfile, MineHelpersTable } from '@/content/mine/helpers';
import type { BasesTable } from '@/content/balance/bases';
import { createMineManifest } from './manifest';
import { defaultMineState, mineSaveSlice, type MineState } from './state';
import type { FightGear } from './logic/fight';
import { createEvaluate, createLayerOf, createLayerGate } from './gates';
import { createBattles } from './battles';
import { buildMobView, buildStateView, type MobView, type MineStateView } from './view';
import { onHpChanged, type RunCtx } from './run';
import { makeRunStatScope } from './run-parts';
import { pickCard } from './pick';
import { applyTorch } from './torch';
import { upgradesView, buyUpgrade } from './upgrades';
import { buildRunView, type RunView } from './view-run';
import { makeEnterRun, makeGenOracle, makeRevealAll } from './module-parts';
import { makeHelpersMount } from './helpers-mount';
import { helpersBoardView, hireHelper, fireHelper, type HelpersView } from './helpers-hire';
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
    // --- [M13.2] контент помощников + реестр ривен-типов (трейты доски);
    //     реестр валидируется при старте — битый контент = отказ загрузки (П5)
    const helperClasses = content.get<HelperClassDef[]>('mine.helpers');
    const helpersTable = content.get<MineHelpersTable>('mine.helpers.table');
    const helperFears = content.get<HelperFearDef[]>('mine.helpers.fears');
    const modTypes = content.get<ModTypeDef[]>('mods');
    const basesTable = content.get<BasesTable>('bases');
    const baseOf = (stat: string): number =>
      basesTable !== undefined && typeof basesTable.bases[stat] === 'number' ? basesTable.bases[stat]! : 0;

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

    // статы/гир боёв ЗАБЕГА — с тегами слоя/статуса (эффекты статусов — ctxTag);
    // [M13.2] скоуп перенесён в run-parts.ts (распил по wc-гигиене)
    const { runStatCtx, runGearOf } = makeRunStatScope(this.deps, table, statBus, time, () => this.state);

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

    // [M13.2] монтаж доски наёмников — helpers-mount.ts (распил по wc)
    const { boardOf, profileOf, helpersDeps } = makeHelpersMount({
      deps: this.deps,
      content,
      statBus,
      time,
      save,
      transaction: ctx.transaction,
      bus,
      upgradeDefs,
      helperClasses,
      helpersTable,
      helperFears,
      getState: () => this.state,
      setState: (s) => {
        this.state = s;
      },
      markDirty: () => save.markDirty(),
    });

    // контекст забега: те же шины/сервисы + контент карт/улучшений/помощников
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
      helperClasses,
      helpersTable,
      helperFears,
      profileOf,
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

    // провайдеры (манифест): runBuff ×1 (алтари/статусы/насыщенность/Освещение
    // + [M13.2] модификаторы профилей наёмников — conditions-канал) + кротовая
    // наценка (priceModifierProviders)
    statBus.registerProvider(
      makeRunBuffProvider(
        () => this.state,
        upgradeDefs,
        statuses,
        modTypes,
        helperClasses,
        profileOf,
        baseOf,
      ),
    );
    priceBus.registerProvider(makeMineTraderProvider(cards));

    // подписка смерти (манифест eventsSubscribed): идемпотентный death-обработчик
    bus.subscribe('player.hpChanged', (payload) => onHpChanged(runCtx, payload));

    // [M13.2] замыкания api-точек — фабрики module-parts.ts (распил по wc)
    const enterRun = makeEnterRun(runCtx, layerOf, layerGate, this.deps, () => this.state, layers.length);
    const genOracle = makeGenOracle(
      this.deps,
      cards,
      statuses,
      mobs,
      statBus,
      ctx.rngBus,
      time,
      layerOf,
      ctx.stats,
    );
    const revealAll = makeRevealAll(() => this.state, save);

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
      // --- [M13.2 · R10] ×3: доска+состав / наём / увольнение
      'mine.helpers': (): HelpersView => helpersBoardView(helpersDeps),
      'mine.helpers.hire': (i: unknown): Result<HelpersView> => hireHelper(helpersDeps, i),
      'mine.helpers.fire': (i: unknown): Result<HelpersView> => fireHelper(helpersDeps, i),
    };
  }

  getState(): MineState {
    return this.state;
  }
}
