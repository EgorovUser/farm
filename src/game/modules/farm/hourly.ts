/**
 * FarmHourly (M05.3, wc-распил 01 §6 — module.ts превысил 300 при G2):
 * часовой обработчик фермы целиком — подписка time.hourTick по манифесту.
 *
 * Порядок прохода: ленивый sweep (готовность/сухость по payload.now —
 * catchUp-проходы переоценивают на часовых границах) → сорняки
 * (hourWeedsPass: шанс resolve с тегами тайла+'farm', бросок именованным
 * стримом — П6; вкладки immuneTabKinds пропускаются) → каденс спринклеров
 * (исполнение ЧЕРЕЗ TaskRegistry — карточка §6; перезагрузка восстанавливает
 * исполнителя здесь же, до прогона).
 */
import type { EventBus } from '@/kernel/bus/event-bus/event-bus';
import type { RngBus } from '@/kernel/bus/rng-bus/rng-bus';
import type { StatBus } from '@/kernel/bus/stat-bus/stat-bus';
import type { TaskRegistry } from '@/kernel/services/task-registry/task-registry';
import type { TaskContext, TaskResultInfo } from '@/kernel/services/task-registry/task-registry';
import type { TimeService } from '@/kernel/time/time-service';
import type { SaveDirector } from '@/kernel/save/save-director';
import type { Result } from '@/shared/types/result';
import type { CropDef } from '@/content/farm/crops';
import type { FarmUpgradeDef } from '@/content/farm/upgrades';
import type { FarmTable } from '@/content/balance/farm';
import type { FarmState } from './state';
import { hourWeedsPass, tileTagOf, type WeedAppearance } from './logic/weeds';
import { sprinklerPass } from './logic/upgrades-provider';

/** payload time.hourTick (ядро: живой тик и catchUp-проходы) */
interface HourTickPayload {
  hourIndex?: number;
  now?: number;
  catchUp?: boolean;
}

export interface SprinklerTaskDeps {
  tasks: TaskRegistry;
  time: TimeService;
  save: SaveDirector;
  table: FarmTable;
  getState(): FarmState;
  setState(s: FarmState): void;
}

/** регистрация исполнителя farm.sprinkler (идемпотентна): вызывается при
 *  покупке «Спринклеров» (module.onApplied) и при восстановлении после
 *  перезагрузки (часовая ветка) — одна точка правды */
export function registerSprinklerTask(d: SprinklerTaskDeps): void {
  if (d.tasks.has('farm.sprinkler')) return;
  d.tasks.register('farm.sprinkler', {
    label: 'автополив (спринклеры)',
    run: (taskCtx: TaskContext): Result<TaskResultInfo> => {
      const at = typeof taskCtx.now === 'number' ? taskCtx.now : d.time.now();
      const r = sprinklerPass(d.getState(), at, d.table.water.windowHours * 3_600_000);
      d.setState({ ...r.state, sprinklerAt: at });
      d.save.markDirty();
      return { ok: true, value: { message: `спринклеры полили тайлов: ${r.watered}` } };
    },
  });
}

export interface FarmHourlyDeps {
  bus: EventBus;
  statBus: StatBus;
  rngBus: RngBus;
  tasks: TaskRegistry;
  time: TimeService;
  save: SaveDirector;
  table: FarmTable;
  crops: Map<string, CropDef>;
  upgradesDefs: FarmUpgradeDef[];
  /** покупки (G2): каденс спринклеров жив только при купленном улучшении */
  upgrades: { has(id: string): boolean };
  /** ленивая переоценка (готовность/сухость) — действия */
  sweep(now?: number): unknown;
  getState(): FarmState;
  setState(s: FarmState): void;
}

export function makeFarmHourly(deps: FarmHourlyDeps): { off(): void } {
  const { bus, statBus, rngBus, tasks, time, save, table, crops } = deps;

  const onHourTick = (payload: HourTickPayload): void => {
    const now = typeof payload?.now === 'number' ? payload.now : time.now();
    deps.sweep(now); // готовность/сухость — до роллов (порядок учёта)
    const r = hourWeedsPass(deps.getState(), now, {
      rng: {
        // rollRange(0,1) логируется с source=стрима — П6 (nextFloat молчит)
        roll01: (streamId) => rngBus.rollRange(0, 1, 'uniform', streamId),
      },
      chance: {
        // теги: тайл (таргетность) + модульный 'farm' — гербицидные моды
        // (улучшение «Гербициды» G2) вешаются на модульный тег (П5)
        of: (tabId, tileIdx) =>
          statBus.resolve({
            stat: 'farm.weeds.chancePercent',
            ctx: { ...time.ctx('player'), tags: [tileTagOf(tabId, tileIdx), 'farm'] },
          }),
      },
      crops,
      table,
    });
    if (r.appeared.length > 0) {
      deps.setState(r.state);
      save.markDirty();
      for (const a of r.appeared) bus.publish('farm.weedsAppeared', a satisfies WeedAppearance);
      bus.publish('invalidate.stat', {}); // кэш скоростей устарел
    }
    // --- [M05.3 · G2] каденс спринклеров: часовая ветка — будильник
    //     (интервал из данных улучшения), исполнение — ЧЕРЕЗ TaskRegistry
    const sprinklerDef = deps.upgradesDefs.find((u) => u.effect.t === 'sprinkler');
    if (sprinklerDef && sprinklerDef.effect.t === 'sprinkler' && deps.upgrades.has(sprinklerDef.id)) {
      const intervalMs = sprinklerDef.effect.intervalHours * 3_600_000;
      const last = deps.getState().sprinklerAt;
      if (last === undefined || now - last >= intervalMs) {
        registerSprinklerTask({ tasks, time, save, table, getState: deps.getState, setState: deps.setState });
        tasks.runTask('farm.sprinkler', { now });
      }
    }
  };

  const off = bus.subscribe('time.hourTick', onHourTick as (p: unknown) => void);
  return { off };
}
