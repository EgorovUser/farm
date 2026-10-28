/**
 * Жизненный цикл забега M13.1 (бриф R1/R4, карточка §3): старт (сид
 * hash(saveId, layer, runNumber) — детерминизм), идемпотентная смерть
 * (манифест-подписка player.hpChanged → конец 'death', cozy HP := 1,
 * deaths+1 — РОВНО один раз: sandbox-обёртки M12 уходят под run-гард),
 * выдача runBag (лестница/босс 100% · смерть −20% · костёр −5%) с
 * D23-пробой ПО СУММЕ новых стеков (канон FIX-M12 lootFits: инвариант
 * used ≤ capacity ВСЕГДА; нехватка — честная частичная выдача с поимённой
 * витриной утрат), «Насыщенность» (первый забег дня +10% руды через
 * inc на mine.oreYield — модификатор дня по данным).
 */
import type { StatsService } from '@/kernel/services/stats/stats-service';
import type { TimeService } from '@/kernel/time/time-service';
import type { PriceBus } from '@/kernel/bus/price-bus/price-bus';
import type { StatBus } from '@/kernel/bus/stat-bus/stat-bus';
import type { QualityTier } from '@/shared/types/ids';
import type { Result } from '@/shared/types/result';
import type { Requirement } from '@/shared/types/requirement';
import { err, ok } from '@/shared/types/result';
import type { MineLayerDef } from '@/content/mine/layers';
import type { MineCardDef, MineLayerStatusDef, MineRunEffectItem } from '@/content/mine/cards';
import type { MineUpgradeDef } from '@/content/mine/upgrades';
import type { MineTable } from '@/content/mine/table';
import type { ItemDef } from '@/content/items/items';
import type {
  HelperClassDef,
  HelperFearDef,
  HelperProfile,
  MineHelpersTable,
} from '@/content/mine/helpers';
import type { BattleCtx } from './battles';
import type { MineRunState, MineState } from './state';
import type { HelperSettleRow } from './helpers-pay';
import { settleHelpers } from './helpers-pay';
import { reviveMedicOf } from './helpers-fight';
import { rollDeathLosses } from './run-parts';
import { generateLayer, runSeedOf } from './generator';
import { bagSlotsOf, collectToBag, rollQuality, collectOre } from './bag';
import { makeSeededRoll } from './logic/seed';

export interface RunCtx extends BattleCtx {
  cards: MineCardDef[];
  statuses: MineLayerStatusDef[];
  upgradeDefs: MineUpgradeDef[];
  items: ItemDef[];
  runEffects: MineRunEffectItem[];
  priceBus: PriceBus;
  stats: StatsService;
  time: TimeService;
  evaluate(req: Requirement): boolean;
  // --- [M13.2] помощники (брифы R1–R7)
  helperClasses: HelperClassDef[];
  helpersTable: MineHelpersTable;
  helperFears: HelperFearDef[];
  /** профиль по defId — перепосчёт из детерминированной доски дня найма */
  profileOf(defId: string): HelperProfile | null;
}

export interface PayoutEntry {
  defId: string;
  qty: number;
  tier?: string;
}

export interface RunEndOutcome {
  reason: 'exit' | 'boss' | 'death';
  granted: PayoutEntry[];
  lost: PayoutEntry[];
  lostByCapacity: PayoutEntry[];
  lossPercent: number;
  /** [M13.2 · R5] зарплатная ведомость помощников (доля/зарплата/репутация) */
  helperLines: string[];
  helperRows: HelperSettleRow[];
}

/** старт забега: генерация + счётчик + «Насыщенность» + событие (R1/R2) */
export function startRun(
  x: RunCtx,
  layerDef: MineLayerDef,
): Result<{ run: MineRunState; liftApplied: boolean; liftNote: string | null }> {
  const state = x.getState();
  if (state.run !== undefined) {
    return err('забег уже идёт — сначала завершите его (лестница/босс/свиток; mine run покажет состояние)');
  }
  const today = x.time.localDateISO(x.time.now());
  const firstOfDay = state.lastRunDay !== today;
  // runNumber = счётчик mine.runs + 1: счётчик тикает по runEnded (объявление
  // фазы 0 — НЕ переобъявляется); новый забег = (N+1)-й по счёту [DECISION R1]
  const runNumber = x.stats.get('mine.runs') + 1;
  const saveId = x.deps.saveId();
  const seed = runSeedOf(saveId, layerDef.layer, runNumber);
  const layout = generateLayer(
    { cards: x.cards, statuses: x.statuses, mobs: x.mobs, statBus: x.statBus, rngBus: x.rngBus, time: x.time },
    layerDef.layer,
    seed,
    layerDef,
    { ...x.time.ctx('player'), tags: ['mine', `layer:${layerDef.layer}`] },
  );

  // Лифт: старт с колонки 4 — только повторные забеги слоя (R6)
  let column = 1;
  let liftApplied = false;
  let liftNote: string | null = null;
  const lift = x.upgradeDefs.find((u) => u.effect.t === 'lift');
  if (lift !== undefined && state.upgrades?.[lift.id] === true) {
    const startColumn = (lift.effect as { startColumn: number }).startColumn;
    const achOk = x.evaluate({ t: 'achievement', id: `ach_mine_boss_${layerDef.layer}` });
    if (achOk) {
      column = startColumn;
      liftApplied = true;
    } else {
      liftNote = `лифт не действует: нужна ачивка ach_mine_boss_${layerDef.layer} (победа над боссом этого слоя) — старт с колонки 1`;
    }
  }

  // [M13.2 · R2] состав забега = все нанятые на момент старта [DECISION]:
  // статус-теги экземпляров в забеге ('revive:used' — идемпотентный флаг R6)
  const roster = (state.helpers ?? []).map((h) => ({ instanceId: h.instanceId, status: [] as string[] }));

  const run: MineRunState = {
    runId: `${saveId}-L${layerDef.layer}-R${runNumber}`,
    layer: layerDef.layer,
    column,
    cards: layout.cards,
    runBag: [],
    torches: 0,
    hp: Math.max(1, x.deps.playerHp().current),
    helpers: roster,
    runNumber,
    seed,
    status: layout.status,
    firstOfDay,
    campfire: false,
    cardsResolved: 0,
    altarMods: [],
    pendingCollapse: false,
    traderOpen: false,
    contrib: {},
    mobGold: 0,
    turns: {},
    notes: [],
  };
  const next: MineState = { ...state, run, lastRunDay: today };
  x.setState(next);
  x.markDirty();
  // провайдер сменил выдачу (насыщенность/статус/алтари будущих карт) — кэш шины
  x.bus.publish('invalidate.stat', {});
  x.bus.publish('mine.runStarted', {
    runId: run.runId,
    layer: run.layer,
    column: run.column,
    status: run.status,
    saturation: firstOfDay,
    runNumber,
    helpers: roster.map((r) => {
      const inst = (state.helpers ?? []).find((h) => h.instanceId === r.instanceId);
      const p = inst !== undefined ? x.profileOf(inst.defId) : null;
      return {
        instanceId: r.instanceId,
        defId: inst?.defId ?? '?',
        classId: p?.classId ?? '?',
        name: p?.name ?? '?',
      };
    }),
  });
  return ok({ run, liftApplied, liftNote });
}

/**
 * Детерминированный выбор утрат смерти — run-parts.ts (распил по wc-гигиене
 * M13.2): квота round(Σqty × pct/100), стрим mine:run:loss:*
 */

/**
 * Конец забега: судьба смерти (карточка §3) + выдача ОДНОЙ грант-операцией
 * с D23-пробой по СУММЕ новых стеков (lootFits-канон FIX-M12 — инвариант
 * used ≤ capacity ВСЕГДА; качество — каналом точного тира, как A+ босса
 * M12.2 [DECISION]). Активен guard: повторный вызов — честный отказ.
 */
export function endRun(x: RunCtx, reason: 'exit' | 'boss' | 'death'): Result<RunEndOutcome> {
  const state = x.getState();
  const run = state.run;
  if (run === undefined) {
    return err('забега нет — нечего завершать');
  }
  const lossPercent = reason === 'death' ? (run.campfire ? 5 : 20) : 0;
  const lost = lossPercent > 0 ? rollDeathLosses(x, run, lossPercent) : [];

  const granted: PayoutEntry[] = [];
  const lostByCapacity: PayoutEntry[] = [];
  for (const entry of run.runBag) {
    const probe = x.deps.canAcquire(entry.defId, entry.qty);
    if (probe.ok && probe.value.newEntries <= probe.value.free) {
      const tier = (entry.quality?.tier ?? 'D') as QualityTier;
      const value = entry.quality?.value ?? 0;
      const r = x.deps.addItemQ(entry.defId, tier, value, entry.qty, 'mine.lootRun');
      if (r.ok) {
        granted.push({ defId: entry.defId, qty: entry.qty, ...(entry.quality !== undefined ? { tier: entry.quality.tier } : {}) });
      } else {
        lostByCapacity.push({ defId: entry.defId, qty: entry.qty });
      }
    } else {
      lostByCapacity.push({ defId: entry.defId, qty: entry.qty });
    }
  }

  // очистка runs-бафов штатного Buff-канала (API владельца — канон 02 §2):
  // зелья крота помечены id-префиксом mine.potion. (mod.tags — контекст-фильтр)
  for (const b of x.deps.listBuffs()) {
    if (b.mod.id.startsWith('mine.potion.')) x.deps.removeBuff(b.mod.id);
  }

  // [M13.2 · R5/R6] расчёт помощников ЗАБЕГА: доля с золота мобов по вкладу →
  // зарплата/день → репутация/уровни → HP до max; нехватка зарплаты — уход
  const settle = settleHelpers(x, run, reason);

  x.setState({
    ...state,
    run: undefined,
    ...(settle.helpers !== undefined ? { helpers: settle.helpers } : {}),
  });
  x.markDirty();
  // runs-бафы сняты, контейнер закрыт — кэш резолвов пересчитать (прецедент craft)
  x.bus.publish('invalidate.stat', {});
  x.bus.publish('mine.runEnded', {
    runId: run.runId,
    layer: run.layer,
    reason,
    granted,
    lost,
    lostByCapacity,
    helpers: settle.rows,
  });
  return ok({ reason, granted, lost, lostByCapacity, lossPercent, helperLines: settle.lines, helperRows: settle.rows });
}

/**
 * Идемпотентная смерть (R4): player.hpChanged(died) при активном забеге →
 * deaths+1 (срез) + cozy HP := 1 (канон M12.1 F7) + конец 'death' (−20%,
 * костёр −5%). Guard: забега нет → тихо (судьба вне забега — не M13).
 *
 * [M13.2 · R6] ПЕРК 50+ медика — ДО завершения по смерти (cozy-канал НЕ
 * дублируется): воскресить игрока 1 раз за забег с N% HP; идемпотентный
 * флаг 'revive:used' в run.helpers[].status; вторая смерть — финал 'death'.
 */
export function onHpChanged(x: RunCtx, payload: unknown): void {
  const p = payload as { died?: boolean; tags?: string[] };
  if (p?.died !== true && !(p?.tags ?? []).includes('death')) return;
  const state = x.getState();
  const run = state.run;
  if (run === undefined) return; // guard идемпотентности
  const medic = reviveMedicOf(x, run);
  if (medic !== null) {
    const entry = run.helpers.find((h) => h.instanceId === medic.instance.instanceId);
    const perk = medic.classDef.perk50;
    if (entry !== undefined && perk !== undefined && perk.t === 'revive') {
      entry.status = [...entry.status, 'revive:used'];
      const hp = x.deps.playerHp();
      const reviveHp = Math.max(1, Math.ceil((hp.max * perk.hpPercent) / 100));
      x.deps.healHp(reviveHp, `mine.helper.perk:revive:${medic.profile.name}`);
      run.hp = x.deps.playerHp().current;
      run.notes.push(
        `ПЕРК 50+ «Воскрешение»: ${medic.profile.name} возвращает игрока с ${reviveHp} HP (1 раз за забег, репутация ${medic.instance.reputation})`,
      );
      x.markDirty();
      return; // забег ПРОДОЛЖАЕТСЯ — смерти/deaths не было
    }
  }
  const stats = { ...state.stats, deaths: state.stats.deaths + 1 };
  x.setState({ ...state, stats });
  x.deps.healHp(1, 'mine.run:cozy');
  const ended = endRun(x, 'death'); // витрина утрат — поимённо в событии mine.runEnded (lost)
  // [FIX-M13 · OBS-8] ведомость расчёта при завершении СМЕРТЬЮ — витрина
  // «последний расчёт» в mine helpers: у подписки player.hpChanged нет
  // канала вывода (аудит: «транзакции/события живут» — они без изменений);
  // при exit/boss ведомость печатает разрешение карты как раньше
  if (ended.ok && ended.value.helperLines.length > 0) {
    x.setState({ ...x.getState(), lastDeathSettle: ended.value.helperLines });
    x.markDirty();
  }
}
