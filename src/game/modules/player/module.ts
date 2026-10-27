/**
 * PlayerModule (M01) — «тело игрока»: энергия, HP, XP/уровень, навыки.
 * Единственный владелец мутируемого состояния тела; кошелёк — физически
 * в kernel.wallet (Фаза 0, заморожен), M01 владеет семантикой: каталог
 * валют sources/sinks и инвариант «никто не пишет в кошелёк напрямую» —
 * все операции через TransactionService (карточка §4, ратифицировано
 * аудитом Фазы 0 + FIX-0.1).
 *
 * DEBT-8 (ратифицировано): самоподключение в activate() — легальная
 * конвенция до появления авто-монтажа координаторами.
 */
import type { GameModule, ModuleContext } from '@/game/module-registry';
import { createPlayerManifest } from './manifest';
import { defaultPlayerState, playerSaveSlice, type PlayerState } from './state';
import { PlayerEnergy } from './energy';
import { PlayerHp } from './hp';
import { PlayerRegen } from './regen';
import { PlayerProgress } from './progress';
import { SkillEngine } from './skills';
import { CountersEngine } from './counters';
import { LevelBonusProvider, SkillProvider } from './providers';
import type { PlayerTable } from '@/content/player/progression';
import type { SkillDef } from '@/content/player/skills';
import type { CounterDef } from '@/content/player/counters';
import type { EnergySnapshot } from './energy';
import type { HpCheck } from './hp';
import type { ProgressSnapshot } from './progress';
import type { SkillSnapshot } from './skills';
import type { Result } from '@/shared/types/result';
import type { StatId } from '@/shared/types/ids';

export interface PlayerSnapshot {
  energy: EnergySnapshot;
  hp: HpCheck;
  progress: ProgressSnapshot;
  skills: SkillSnapshot[];
}

export class PlayerModule implements GameModule {
  readonly manifest: GameModule['manifest'];

  private state!: PlayerState;
  private energy!: PlayerEnergy;
  private hp!: PlayerHp;
  private progress!: PlayerProgress;
  private skills!: SkillEngine;
  private unsubs: Array<() => void> = [];
  private providerIds: string[] = [];
  private attachedStatBus: { unregisterProvider(id: string): void } | null = null;
  private table!: PlayerTable;
  private skillDefs!: readonly SkillDef[];

  /** публичный API для других модулей — только через ModuleRegistry (П4) */
  api: Record<string, (...args: unknown[]) => unknown> = {};

  constructor(table: PlayerTable, skills: readonly SkillDef[], counters: readonly CounterDef[]) {
    this.table = table;
    this.skillDefs = skills;
    this.manifest = createPlayerManifest(table, skills, counters);
    this.countersTable = counters;
  }

  private countersTable: readonly CounterDef[];

  activate(ctx: ModuleContext): void {
    const { bus, statBus, time, save, content } = ctx;

    // --- состояние: дефолт по базам шины (провайдеры модуля ещё не подключены)
    this.state = defaultPlayerState({
      energyMax: statBus.resolve({ stat: 'player.energy.max', ctx: time.ctx('player') }),
      hpMax: statBus.resolve({ stat: 'player.hp.max', ctx: time.ctx('player') }),
      skillIds: this.skillDefs.map((s) => s.id),
    });
    save.registerSlice('player', playerSaveSlice(() => this.state, (s) => (this.state = s)));

    // --- сервисы тела
    const shared = { bus, statBus, ctx: () => time.ctx('player'), getState: () => this.state, markDirty: () => save.markDirty() };
    this.energy = new PlayerEnergy(shared);
    this.hp = new PlayerHp(shared);
    this.progress = new PlayerProgress({ bus, table: this.table, getState: () => this.state, markDirty: () => save.markDirty() });
    // [FIX-M01 · DEBT-19] кривая навыка — из таблицы прогрессии (реестр контента)
    this.skills = new SkillEngine({
      bus,
      table: this.skillDefs,
      xpCurve: { base: this.table.skillXpBase, growth: this.table.skillXpGrowth },
      getState: () => this.state,
      markDirty: () => save.markDirty(),
    });
    const regen = new PlayerRegen({ bus, statBus, ctx: () => time.ctx('player'), energy: this.energy, hp: this.hp, tickMs: content.time().tickMs });
    const counters = new CountersEngine({ bus, stats: ctx.stats, table: this.countersTable });

    // --- провайдеры модификаторов (карточка §7)
    const skillProvider = new SkillProvider({ table: this.skillDefs, levelOf: (id) => this.skills.levelOf(id) });
    const levelProvider = new LevelBonusProvider({ table: this.table, playerLevel: () => this.state.level });
    statBus.registerProvider(skillProvider);
    statBus.registerProvider(levelProvider);
    this.providerIds = [skillProvider.id, levelProvider.id];
    this.attachedStatBus = statBus;

    // --- подписки (DEBT-8: самоподключение)
    this.unsubs = [regen.wire(), this.progress.wire(), this.skills.wire(), counters.wire()];

    this.api = {
      'player.snapshot': (): PlayerSnapshot => ({
        energy: this.energy.snapshot(),
        hp: this.hp.check(),
        progress: this.progress.snapshot(),
        skills: this.skills.list(),
      }),
      'player.spendEnergy': (stat: unknown, reason?: unknown): Result<unknown> =>
        this.energy.spend(stat as StatId, typeof reason === 'string' ? reason : undefined),
      'player.withEnergy': (stat: unknown, action: unknown, reason?: unknown): Result<unknown> =>
        this.energy.withEnergy(stat as StatId, action as () => Result<unknown>, typeof reason === 'string' ? reason : undefined),
      'player.grantEnergy': (amount: unknown, source: unknown): number =>
        this.energy.grant(Number(amount) || 0, typeof source === 'string' ? source : 'api'),
      // [M02.3 · D33] грант HP — зеркально grantEnergy (тот же атомарный путь
      // сервиса hp.heal: клэмп на капе, не отказ; событие player.hpChanged
      // с reason от вызывающего — use-пайплайн M02 шлёт 'item.use')
      'player.grantHp': (amount: unknown, reason: unknown): HpCheck =>
        this.hp.heal(Number(amount) || 0, typeof reason === 'string' ? reason : 'api'),
      'player.setEnergy': (amount: unknown): EnergySnapshot => {
        this.energy.set(Number(amount) || 0);
        return this.energy.snapshot();
      },
      'player.setHp': (amount: unknown): HpCheck => {
        this.hp.set(Number(amount) || 0);
        return this.hp.check();
      },
      'player.energyCost': (stat: unknown): number => this.energy.costOf(stat as StatId),
      'player.checkHp': (): HpCheck => this.hp.check(),
      'player.damageHp': (amount: unknown, source: unknown): HpCheck =>
        this.hp.damage(Number(amount) || 0, typeof source === 'string' ? source : 'api'),
      'player.healHp': (amount: unknown, source: unknown): HpCheck =>
        this.hp.heal(Number(amount) || 0, typeof source === 'string' ? source : 'api'),
      'player.addXp': (amount: unknown, source: unknown): unknown =>
        this.progress.addXp(Number(amount) || 0, typeof source === 'string' ? source : 'api'),
      'player.ctxExtras': (): Record<string, unknown> => ({
        'player:level': this.state.level,
        ...this.skills.ctxExtras(),
      }),
      'skills.get': (id: unknown): SkillSnapshot | null => this.skills.get(String(id)),
      'skills.list': (): SkillSnapshot[] => this.skills.list(),
      'skills.addXp': (id: unknown, amount: unknown, source: unknown): unknown =>
        this.skills.addXp(String(id), Number(amount) || 0, typeof source === 'string' ? source : 'api'),
    };
  }

  deactivate(): void {
    for (const off of this.unsubs) off();
    this.unsubs = [];
    if (this.attachedStatBus) {
      for (const id of this.providerIds) this.attachedStatBus.unregisterProvider(id);
      this.attachedStatBus = null;
    }
    this.providerIds = [];
    this.api = {};
  }
}
