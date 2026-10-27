/**
 * MineModule (M12.1 + M12.2) — каркас и монтаж (карточка M12, брифы
 * SESSION-M12.1 F2–F8 / SESSION-M12.2 G1–G7). Изоляция (01 §5–§7): модуль
 * НЕ импортирует чужие модули — все каналы приходят колбэками app-слоя
 * (deps.ts): щит/кирка — витрины publicApi M02, тир кирки — живой канал
 * заточки M10 §2, гейт ачивки — Requirement-оценщик (прецедент gateExtras),
 * износ — inventory.wear (D35), энергия — player.spendEnergy (стат
 * action.mine.enter.energyCost из bases, фаза 0), золото/предметы — только
 * TransactionService eventId mine.loot/mine.bossLoot (атомарно).
 *
 * Боевые сценарии — battles.ts (распил по wc-гигиене), гейты — gates.ts,
 * лут-роллы — loot.ts, витрины — view.ts. [DECISION §0] бой НЕ тратит
 * энергию на раунды — энергия расходуется РОВНО ОДИН раз при входе
 * (mine.enter); mine.boss валидирует гейты слоя БЕЗ энергии (буква §0
 * «энергия — только вход-гейт mine.enter»; спуск к боссу — контейнер M13).
 */
import type { GameModule, ModuleContext } from '@/game/module-registry';
import type { EliteModDef, MineMobDef } from '@/content/mine/mobs';
import type { MineBossDef } from '@/content/mine/bosses';
import type { MineLayerDef } from '@/content/mine/layers';
import type { MineTable } from '@/content/mine/table';
import { createMineManifest } from './manifest';
import { defaultMineState, mineSaveSlice, type MineState } from './state';
import type { FightGear } from './logic/fight';
import { createEvaluate, createLayerOf, createLayerGate } from './gates';
import { createBattles } from './battles';
import { buildMobView, buildStateView, type MobView, type MineStateView } from './view';
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
    const { save, content, time, statBus } = ctx;
    const table = content.get<MineTable>('mine');
    const mobs = content.get<MineMobDef[]>('mine.mobs') ?? [];
    const eliteDefs = content.get<EliteModDef[]>('mine.eliteMods') ?? [];
    const bosses = content.get<MineBossDef[]>('mine.bosses') ?? [];
    const layers = content.get<MineLayerDef[]>('mine.layers') ?? [];

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

    /** снаряжение/статы боя — всё через шину (П3) + тир щита из витрины M02.
     *  Чутьё = ТИР-ФОРМУЛА F4 (данные MINE_TABLE): 5% × (тир − 1) свыше
     *  честных 1/3; ривен-канал combat.block инертен (D31 inc на flat-базе
     *  щита 4 → 4) — потребление FIX-RIVEN (решение спеки по [QUESTION] №1) */
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
      // --- бой (F8: слой по умолчанию 1; БЕЗ вход-гейтов — гейты кирки/
      //     энергии = mine.enter, M12.2 [DECISION]; --seed — фикс-сид golden)
      'mine.fight': (mobId: unknown, layer: unknown, seed: unknown): Result<unknown> =>
        battles.runFight(String(mobId), layer, null, seed),
      // --- элитный бой (F8: оракулы элит)
      'mine.elite': (mobId: unknown, mod: unknown, layer: unknown, seed: unknown): Result<unknown> =>
        battles.runFight(String(mobId), layer, mod, seed),
      // --- вход в шахту (G4): двойной гейт G3 + энергия 20 ровно один раз
      'mine.enter': (layerRaw: unknown): Result<unknown> => battles.enter(layerRaw),
      // --- босс-бой (G1/G2/G7): гейты слоя без энергии, --seed — golden
      'mine.boss': (layerRaw: unknown, seedRaw: unknown): Result<unknown> =>
        battles.runBoss(layerRaw, seedRaw),
    };
  }

  getState(): MineState {
    return this.state;
  }
}
