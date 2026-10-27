/**
 * QuestsModule (M15) — «Квесты, ачивки, гейты» (карточка §2–§6, бриф M15.1).
 * Один движок на три сущности: daily/weekly роллы по dailySeed, цепочки
 * (шаги открывают системы), ачивки (счётчики → unlockFlags). Прогресс —
 * ТОЛЬКО по событиям шины через счётчики ядра (N3); награды — модель
 * rewards.ts (событийные xp/passivePoint + материальные claim/авто).
 *
 * Каналы app-слоя (прецеденты D33/D38, П4 — модуль никого не импортирует):
 * gateExtras → player.ctxExtras; itemCount → inventory; saveId → сид роллов.
 * Монтаж — ПОСЛЕДНИМ в module-wiring: подписки встают после CountersEngine
 * M01, счётчики подняты до переоценки (см. engine.ts).
 *
 * DEBT-8 (ратифицировано): самоподключение в activate() — легальная конвенция.
 */
import type { GameModule, ModuleContext } from '@/game/module-registry';
import type { CounterDef } from '@/content/player/counters';
import type { QuestsTable } from '@/content/balance/quests';
import type { Result } from '@/shared/types/result';
import { err } from '@/shared/types/result';
import { createQuestsManifest } from './manifest';
import { defaultQuestsState, questsSaveSlice, type QuestsState } from './state';
import { QuestsEngine, type AchievementRow, type QuestRow } from './engine';
import { QuestFlagsProvider } from './provider';
import type { GrantReceipt } from './rewards';

export interface QuestsModuleDeps {
  /** player.ctxExtras — уровень/навыки игрока для условий (П4) */
  gateExtras?(): Record<string, unknown>;
  /** количество defId у игрока ЦЕЛИКОМ (включая экипированное) — гейт hasItem */
  itemCount?(defId: string): number;
  /** saveId сейва — основа детерминизма роллов (карточка §3) */
  saveId?(): string;
}

export class QuestsModule implements GameModule {
  readonly manifest: GameModule['manifest'];

  private state: QuestsState = defaultQuestsState();
  private readonly moduleDeps: QuestsModuleDeps;
  private countersTable: readonly CounterDef[] = [];
  private engine: QuestsEngine | null = null;
  private unsubs: Array<() => void> = [];
  private attachedStatBus: { unregisterProvider(id: string): void } | null = null;

  /** публичный API для других модулей — только через ModuleRegistry (П4) */
  api: Record<string, (...args: unknown[]) => unknown> = {};

  constructor(deps: QuestsModuleDeps = {}, counters: readonly CounterDef[] = []) {
    this.moduleDeps = deps;
    this.countersTable = counters;
    this.manifest = createQuestsManifest(counters);
  }

  activate(ctx: ModuleContext): void {
    const { bus, statBus, stats, transaction, time, content, save } = ctx;
    const table = content.get<QuestsTable>('quests');

    save.registerSlice(
      'quests',
      questsSaveSlice(
        () => this.state,
        (s) => {
          this.state = s;
        },
        table.sanity,
      ),
    );

    const engine = new QuestsEngine({
      bus,
      statBus,
      stats,
      transaction,
      time,
      content,
      rngBus: ctx.rngBus,
      saveId: () => this.moduleDeps.saveId?.() ?? '',
      gateExtras: () => this.moduleDeps.gateExtras?.() ?? {},
      itemCount: (defId) => this.moduleDeps.itemCount?.(defId) ?? 0,
      getState: () => this.state,
      setState: (s) => {
        this.state = s;
      },
      markDirty: () => save.markDirty(),
    });
    this.engine = engine;

    // --- провайдер флагов (карточка §6): эффекты флагов — данные (П1)
    const provider = new QuestFlagsProvider({
      table: () => content.get<QuestsTable>('quests'),
      hasFlag: (flag) => this.state.flags.includes(flag),
    });
    statBus.registerProvider(provider);
    this.attachedStatBus = statBus;

    // --- подписки: события конфига счётчиков (данные) + движковый минимум
    const manifest = this.manifest;
    const offs = (manifest.eventsSubscribed ?? []).map(({ event, handler }) =>
      bus.subscribe(event, (payload) => {
        if (handler === 'onDayTick') {
          engine.onDayTick((payload ?? {}) as { dateISO?: string });
        } else if (handler === 'onHourTick') {
          engine.onHourTick((payload ?? {}) as { now?: number; catchUp?: boolean });
        } else {
          engine.sync(); // событие каталога → счётчики ядра уже подняты (M01 раньше)
        }
      }),
    );
    this.unsubs = offs;

    this.api = {
      // --- API карточки §6
      'quests.list': (type: unknown): unknown => {
        const t = typeof type === 'string' ? type : 'daily';
        if (t === 'ach') return engine.listAchievements(false);
        if (t === 'daily' || t === 'weekly' || t === 'chain') return engine.listQuests(t);
        return err('тип: daily | weekly | chains | ach');
      },
      'quests.claim': (id: unknown): Result<GrantReceipt & { id: string }> => {
        if (typeof id !== 'string' || !id) return err('укажите id: quests claim <id> (quests list)');
        return engine.claim(id);
      },
      'quests.rerollDaily': (id: unknown): Result<{ removed: string; added: string }> => {
        if (typeof id !== 'string' || !id) return err('укажите id: quests reroll <id> (quests list)');
        return engine.rerollDaily(id);
      },
      'quests.chainProgress': (chainId: unknown): Result<QuestRow> => {
        if (typeof chainId !== 'string' || !chainId) return err('укажите id цепочки: quests chain <id> (quests list chains)');
        return engine.chainProgress(chainId);
      },
      // --- app-шов (прецедент shop.ensureStock)
      'quests.ensureDay': (): void => {
        engine.ensureDay();
      },
      // --- app-шов гейтов (N10: чтение флагов/ачивок ПОТРЕБИТЕЛЯМИ через
      //     Requirement-оценщик, не спец-кодом): канал для shop.gateExtras —
      //     ключи 'flag:<имя>' / 'achievement:<id>' (формат потребителей M04)
      'quests.gateExtras': (): Record<string, unknown> => {
        const out: Record<string, unknown> = {};
        for (const f of this.state.flags) out[`flag:${f}`] = true;
        for (const id of this.state.achievements.unlocked) out[`achievement:${id}`] = true;
        return out;
      },
      // --- dev-витрины §4.6
      'quests.roll': (): string => engine.devRoll(),
      'quests.complete': (id: unknown): Result<string> => {
        if (typeof id !== 'string' || !id) return err('укажите id: quests complete <id> (quests list)');
        return engine.devComplete(id);
      },
      'quests.unlockAch': (id: unknown): Result<string> => {
        if (typeof id !== 'string' || !id) return err('укажите id: ach unlock <id> (quests list ach)');
        return engine.devUnlock(id);
      },
      'quests.flags': (): string[] => [...this.state.flags],
    };
  }

  deactivate(): void {
    for (const off of this.unsubs) off();
    this.unsubs = [];
    this.attachedStatBus?.unregisterProvider('questFlagsProvider');
    this.attachedStatBus = null;
    this.engine = null;
    this.api = {};
  }
}
