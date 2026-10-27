/**
 * WorkersModule (M11.1 + M11.2) — каркас и монтаж (карточка M11, брифы
 * SESSION-M11 F1–F9 / SESSION-M11.2 F10–F17).
 *
 * Изоляция (01 §5–§7): модуль НЕ импортирует модули систем — чтение
 * живого состояния farm/lake/pen ТОЛЬКО через витрины publicApi
 * ([DECISION-архитектура]: app-слой передаёт колбэки views); трейты —
 * через ЖИВОЙ ривен-конструктор M03 (rollTraits → modforge.rollFor);
 * золото/еда — ТОЛЬКО TransactionService (баланс — колбэк gold()).
 *
 * [F10] hourTick: тик работника по checkPeriodHours 2|4|6ч от фазы
 * hiredAt; WorkersDirector (logic/director.ts) — план задач назначенной
 * системы по приоритету данных, перебор до первого ok через
 * ctx.tasks.runTask (02 §10). [DECISION-энергии]: вызов БЕЗ энергии
 * игрока — временный override-0 провайдер на action.*.energyCost
 * (StatBus, П3-канал; прецедент pen.autofeeder «механизм, не труд»).
 * [F12] actionDone публикует обёртка ПОСЛЕ runTask — {defId, system,
 * action, object, success} — ТОЛЬКО для онлайн-тиков.
 * [F13] catchUp (payload.catchUp=true): эффекты вызовов БЕЗ ленты
 * actionDone (витрина lastAction обновляется); mood/болезни — по канону
 * dayPass (dayTick-часть), тик повторных роллов не делает.
 * [F14] провайдер worker.traits — трейты назначенного на ЕГО систему.
 * [F15] улучшения ×5 (WorkersUpgrades): Домик кап 105 / Столовая еда
 * item-costs / Баня sickFactor 0.5 / Праздник (тики молчат, +15) / Шкаф.
 */
import type { GameModule, ModuleContext } from '@/game/module-registry';
import type { ID, QualityTier, StatId } from '@/shared/types/ids';
import type { Result } from '@/shared/types/result';
import { err } from '@/shared/types/result';
import type { WorkersTable, WorkerObjectDef, WorkerProfession } from '@/content/workers/table';
import { WORKER_NAMES } from '@/content/workers/table';
import type { WorkerUpgradeDef } from '@/content/workers/upgrades';
import type { ModForgeTable } from '@/content/balance/modforge';
import { createWorkersManifest } from './manifest';
import { defaultWorkersState, workersSaveSlice, type WorkersState, type WorkerInstance } from './state';
import { rollBoard, type WorkerProfile, type RollTraits } from './logic/board';
import { dayPass, type DirtyProbe } from './logic/day';
import { makeWorkersTraitsProvider, WORKER_TRAITS_PROVIDER_ID } from './logic/provider';
import { makeWorkersHourly } from './hourly';
import { WorkersHire, type SystemViews } from './hire';
import { buildWorkersView, type WorkersView } from './view';
import { WorkersDev } from './dev';
import { WorkersUpgrades } from './upgrades';

export interface WorkersModuleDeps {
  /** витрины живых систем (app-слой → ModuleRegistry → farm/lake/pen) */
  views: SystemViews;
  /** живой ривен-конструктор M03 (app-слой → modforge.rollFor) */
  rollTraits: RollTraits;
  /** золотой баланс (wallet-сервис ядра; расчётный день F6) */
  gold(): number;
  /** [M11.2 · F10 · DECISION-энергии] энергетически нейтральный вызов:
   *  резерв до капа → run() → восстановление исходного значения игрока
   *  («механизм, не труд» — прецедент pen.autofeeder M06.2; override-0
   *  через StatBus НЕ проходит: у action.*.energyCost meta.min = 1 —
   *  канон M01 «бесплатных действий нет»; потому пара grant/set через
   *  публичный API игрока — app-слой wiring, П4 п.5) */
  withWorkerEnergy(run: () => Result<unknown>): Result<unknown>;
}

interface TimeTickPayload {
  now?: number;
  dateISO?: string;
  catchUp?: boolean;
}

export class WorkersModule implements GameModule {
  readonly manifest = createWorkersManifest();
  api: Record<string, (...args: unknown[]) => unknown> = {};
  private state: WorkersState = defaultWorkersState();
  private readonly moduleDeps: WorkersModuleDeps;
  private detach: (() => void) | null = null;
  /** кэш доски (saveId:дата → профили): повторные витрины без роллов */
  private boardCache: { key: string; profiles: WorkerProfile[] } | null = null;

  constructor(deps: WorkersModuleDeps) {
    this.moduleDeps = deps;
  }

  activate(ctx: ModuleContext): void {
    const { save, content, time, bus, transaction, rngBus, statBus, tasks } = ctx;
    const table = content.get<WorkersTable>('workers');
    const objectsDefs = content.get<WorkerObjectDef[]>('workers.objects') ?? [];
    const modforge = content.get<ModForgeTable>('modforge');
    const upgradesDefs = content.get<WorkerUpgradeDef[]>('workers.upgrades') ?? [];

    save.registerSlice(
      'workers',
      workersSaveSlice(
        () => this.state,
        (s) => {
          this.state = s;
        },
      ),
    );

    const hire = new WorkersHire({
      bus,
      transaction,
      time,
      save,
      table,
      objectsDefs,
      views: this.moduleDeps.views,
      getState: () => this.state,
      setState: (s) => {
        this.state = s;
      },
    });

    const upgrades = new WorkersUpgrades({
      transaction,
      time,
      save,
      table,
      upgradesDefs,
      getState: () => this.state,
      setState: (s) => {
        this.state = s;
      },
    });

    // [F14] провайдер трейтов назначенного (на ЕГО систему; снятие при
    // увольнении — автоматом: провайдер читает живое состояние)
    statBus.registerProvider(
      makeWorkersTraitsProvider(() => this.state, content.get('mods') ?? []),
    );

    /** доска дня: детерминизм (saveId, dateISO) + кэш в памяти */
    const boardOf = (): WorkerProfile[] => {
      const saveId = save.getSaveId();
      const dateISO = time.localDateISO(time.now());
      const key = `${saveId}:${dateISO}`;
      if (this.boardCache !== null && this.boardCache.key === key) {
        return this.boardCache.profiles;
      }
      const profiles = rollBoard(saveId, dateISO, {
        table,
        modforge,
        names: WORKER_NAMES,
        professions: ['farmer', 'fishkeeper', 'herdsman'] as WorkerProfession[],
        rollTraits: this.moduleDeps.rollTraits,
      });
      this.boardCache = { key, profiles };
      return profiles;
    };

    /** признаки «грязного объекта» из витрин живых систем (F4) */
    const dirtyProbe = (): DirtyProbe => {
      const tabs = this.moduleDeps.views.farmTabs();
      const farmWeeds: Record<string, number> = {};
      for (const t of tabs) farmWeeds[t.id] = t.weedsMax;
      return {
        lakeCleanliness: this.moduleDeps.views.lakes().map((l) => l.cleanliness),
        farmWeeds,
        penHappiness: this.moduleDeps.views.pens().map((p) => p.avgHappiness),
      };
    };

    /** полный дневной проход (F4–F7 + F15-фичи): состояние + события */
    const runDay = (now: number): void => {
      // [F15] Праздник: +15 всем (куплено + календарный день); Столовая:
      // еда списана ЗДЕСЬ (item-costs), бонус — числом в dayPass; Домик/Баня
      const holidayBonus = upgrades.isHolidayActive(now) ? table.holiday.moodBonus : 0;
      const canteenBonus = upgrades.canteenFeedOf();
      const result = dayPass(this.state, now, {
        rngBus,
        table,
        probe: dirtyProbe(),
        gold: this.moduleDeps.gold(),
        paySalaries: (total) =>
          transaction
            .transact({
              costs: [{ t: 'currency', id: 'gold', qty: total }],
              eventId: 'worker.payday',
              reason: `расчётный день: зарплаты ${this.state.hired.length} работникам`,
            })
            .ok,
        ...(upgrades.moodCapOf() !== table.mood.max ? { moodCap: upgrades.moodCapOf() } : {}),
        ...(holidayBonus + canteenBonus > 0 ? { extraMood: holidayBonus + canteenBonus } : {}),
        ...(upgrades.sickFactorOf() !== table.sickness.sickFactor
          ? { sickFactor: upgrades.sickFactorOf() }
          : {}),
      });
      this.state = result.state;
      for (const e of result.events) {
        bus.publish(e.name, e.payload);
      }
      if (this.state.hired.length > 0 || result.events.length > 0) {
        save.markDirty();
      }
    };

    // -------------------------------- [F10–F13] часовые тики — hourly.ts
    //     (расщепление 01 §6: подписка hourTick, тики/директор/энергии/
    //     actionDone-обёртка/catchUp — прецедент lake/hourly.ts M08)
    const hourly = makeWorkersHourly({
      bus,
      rngBus,
      tasks,
      time,
      save,
      table,
      views: this.moduleDeps.views,
      upgrades,
      withWorkerEnergy: (run) => this.moduleDeps.withWorkerEnergy(run),
      getState: () => this.state,
      setState: (s) => {
        this.state = s;
      },
    });

    const dev = new WorkersDev({
      time,
      save,
      table,
      getState: () => this.state,
      setState: (s) => {
        this.state = s;
      },
      forcePayday: () => {
        const before = this.state.hired.length;
        runDay(time.now());
        return { ok: true as const, value: { fired: before - this.state.hired.length } };
      },
    });

    const onDayTick = (payload: TimeTickPayload): void => {
      const now = typeof payload?.now === 'number' ? payload.now : time.now();
      runDay(now);
    };

    const offDay = bus.subscribe('time.dayTick', onDayTick as (p: unknown) => void);
    this.detach = () => {
      offDay();
      hourly.off();
      statBus.unregisterProvider(WORKER_TRAITS_PROVIDER_ID);
    };

    this.api = {
      // --- витрина дня: 5 профилей со всеми полями + трейты текстом (F2/F9)
      'workers.board': (): { dateISO: string; rows: WorkersView['board'] } => {
        const profiles = boardOf();
        const view = buildWorkersView(profiles, this.state.hired, hire.objects(), time.now(), table);
        return { dateISO: time.localDateISO(time.now()), rows: view.board };
      },
      // --- витрина нанятых: занятость/лимит/mood/болезнь/кулдаун премии (F9;
      //     [M11.2 · F15] знаменатель шкалы = капу — Домик 105)
      'workers.list': (): WorkersView => {
        const profiles = boardOf();
        return buildWorkersView(profiles, this.state.hired, hire.objects(), time.now(), table, upgrades.moodCapOf());
      },
      // --- F3: найм из доски (индекс строки витрины)
      'workers.hire': (i: unknown): Result<WorkerInstance> => {
        const idx = Number(i);
        const profiles = boardOf();
        if (!Number.isInteger(idx) || idx < 0 || idx >= profiles.length) {
          return err(`укажите индекс доски 0..${profiles.length - 1} (workers board — витрина)`);
        }
        return hire.hire(profiles[idx] as WorkerProfile);
      },
      // --- F3: увольнение
      'workers.fire': (idx: unknown): Result<{ defId: string; name: string }> => hire.fire(Number(idx)),
      // --- F4: премия
      'workers.bonus': (idx: unknown): Result<{ cost: number; mood: number }> => hire.bonus(Number(idx)),
      // --- [F15] улучшения ×5: витрина / покупка ОДНИМ ключом (прецедент
      //     lake.upgrade [id] M08.2 — манифест ×8)
      'workers.upgrades': (id: unknown) =>
        id === undefined ? { rows: upgrades.view() } : upgrades.buy(String(id)),
      // --- [F17] витрина последних действий (lastAction тиков)
      'workers.last': (): Array<{ defId: string; name: string; at: number; taskId: string; success: boolean }> =>
        this.state.hired.map((w) => ({
          defId: w.defId,
          name: w.name,
          at: w.lastAction?.at ?? 0,
          taskId: w.lastAction?.taskId ?? '—',
          success: w.lastAction?.success ?? false,
        })),
      // --- dev (F9/F17): mood set / payday force / tick force <idx>
      'workers.dev': (what: unknown, a: unknown, b: unknown): Result<unknown> => {
        if (what === 'mood') return dev.moodSet(Number(a), Number(b));
        if (what === 'payday') return dev.paydayForce();
        if (what === 'tick') {
          const idx = Number(a);
          const w = this.state.hired[idx];
          if (!w) return err(`работник №${idx} не найден (workers list — витрина)`);
          hourly.tickForce(w);
          return { ok: true as const, value: { defId: w.defId } };
        }
        return err('workers dev mood <idx> <0..100> | payday | tick <idx>');
      },
    };
  }

  deactivate(): void {
    this.detach?.();
    this.detach = null;
  }

  getState(): WorkersState {
    return this.state;
  }
}

export type { WorkerInstance, ID, QualityTier, StatId };
