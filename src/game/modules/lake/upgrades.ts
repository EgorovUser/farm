/**
 * LakeUpgrades (M08.2): улучшения ×7 (F10) + Лаборатория (F13) + второе
 * озеро (F14) — покупка/витрина/направление мутации/переключение.
 *
 * Покупка: TransactionService eventId 'lake.upgrade' (золото −цена, БЕЗ
 * энергии — прецеденты pen.upgrade/farm.upgrade; НЕ товары M04, пул 60 жив).
 * Владение ПЕР-ОЗЕРО (upgrades: string[] в группе; повторная покупка —
 * честный отказ). Спец-эффекты покупки: Подогреватель — вода +10 (кап 100,
 * навсегда [DECISION: без выкл.]); «Второе озеро» — создаёт группу lake2
 * (старты — те же данные 15/70, слоты по базе) и открывает lake.switch.
 *
 * Лаборатория: lake.research <plus1|plus2> — кулдаун cooldownHours от
 * применения (usedAt), форс хранится до потребления следующей икрой озера
 * (механика — logic/breeding.completePairsPass); отказы: не куплена /
 * перезаряжается / форс уже заряжен. dev: сброс кулдауна (lake.force
 * research 0).
 *
 * [M11 · lake:research] P2 MISS-1 (AUDIT-M08): КАЖДОЕ применение
 * lake.research пишет ролл-маркер стрима lake:research в журнал RngBus
 * (прецедент lake:autofeed F12 — наблюдаемость: у research нет ни
 * транзакции, ни шинного события).
 *
 * Изоляция: транзакции — только TransactionService; контент — чтение
 * реестра 'lake.upgrades' (передан депами; данные, П4 п.6).
 */
import type { TransactionService } from '@/kernel/services/transaction/transaction-service';
import type { RngBus } from '@/kernel/bus/rng-bus/rng-bus';
import type { TimeService } from '@/kernel/time/time-service';
import type { SaveDirector } from '@/kernel/save/save-director';
import type { ID, QualityTier } from '@/shared/types/ids';
import type { Result } from '@/shared/types/result';
import { err, ok } from '@/shared/types/result';
import type { LakeTable } from '@/content/balance/lake';
import type { LakeUpgradeDef } from '@/content/lake/upgrades';
import type { LakeGroup, LakeState } from './state';
import {
  activeLakeOf,
  canonicalLakeState,
  defaultLakeGroup,
  groupOf,
  setActiveLake,
  withGroup,
} from './state';

export interface LakeUpgradesDeps {
  transaction: TransactionService;
  rngBus: RngBus;
  time: TimeService;
  save: SaveDirector;
  table: LakeTable;
  upgradesDefs: LakeUpgradeDef[];
  getState(): LakeState;
  setState(s: LakeState): void;
  /** ленивая переоценка (икра/пары) до/после действий */
  sweep(): void;
}

export interface UpgradeReceipt {
  id: ID;
  name: string;
  price: number;
  lakeIdx: number;
}

export interface UpgradeRow {
  id: ID;
  name: string;
  price: number;
  bought: boolean;
  description: string;
}

export class LakeUpgrades {
  private readonly d: LakeUpgradesDeps;

  constructor(deps: LakeUpgradesDeps) {
    this.d = deps;
  }

  /** F10: покупка улучшения активного озера (спец: heater — вода +10;
   *  lake2 — создаёт второе озеро) */
  upgrade(id: string): Result<UpgradeReceipt> {
    this.d.sweep();
    const def = this.d.upgradesDefs.find((u) => u.id === id);
    if (!def) return err(`улучшение «${id}» не найдено (lake.upgrade — витрина)`);
    const state = this.d.getState();
    const idx = activeLakeOf(state);
    const group = groupOf(state, idx);
    if (def.effect.t === 'lake2') {
      if (state.lake2 !== undefined) {
        return err(`«${def.name}» уже куплено — второе озеро построено (lake.switch 1)`);
      }
    } else if ((group.upgrades ?? []).includes(def.id)) {
      return err(`«${def.name}» уже куплено (озеро №${idx + 1})`);
    }
    const pay = this.d.transaction.transact({
      costs: [{ t: 'currency', id: 'gold', qty: def.cost.qty }],
      eventId: 'lake.upgrade',
      reason: `покупка улучшения «${def.name}» (озеро №${idx + 1})`,
    });
    if (!pay.ok) return err(pay.error);
    let next: LakeState;
    if (def.effect.t === 'lake2') {
      // [F14] второе озеро: старты — те же данные (15/70, слоты базы)
      next = canonicalLakeState({ ...state, lake2: defaultLakeGroup() });
    } else {
      const g: LakeGroup = {
        ...group,
        upgrades: [...(group.upgrades ?? []), def.id],
      };
      if (def.effect.t === 'heater') {
        // [F11] Подогреватель: температура +10 (кап 100) НАВСЕГДА
        g.water = {
          temperature: Math.min(this.d.table.water.max, g.water.temperature + def.effect.tempPlus),
          cleanliness: g.water.cleanliness,
        };
      }
      next = withGroup(state, idx, g);
    }
    this.d.setState(next);
    this.d.save.markDirty();
    return ok({ id: def.id, name: def.name, price: def.cost.qty, lakeIdx: idx });
  }

  /** F10: витрина ×7 (название/цена/куплено/эффект текстом) */
  upgradesView(): { lakeIdx: number; rows: UpgradeRow[] } {
    const state = this.d.getState();
    const idx = activeLakeOf(state);
    const bought = groupOf(state, idx).upgrades ?? [];
    return {
      lakeIdx: idx,
      rows: this.d.upgradesDefs.map((u) => ({
        id: u.id,
        name: u.name,
        price: u.cost.qty,
        bought: bought.includes(u.id) || (u.effect.t === 'lake2' && state.lake2 !== undefined),
        description: u.description,
      })),
    };
  }

  /** F13: направить мутацию (кулдаун cooldownHours от применения; форс
   *  потребляется следующей икрой озера) */
  research(mode: 'plus1' | 'plus2'): Result<{ mode: 'plus1' | 'plus2'; readyInMs: number }> {
    this.d.sweep();
    const state = this.d.getState();
    const idx = activeLakeOf(state);
    const group = groupOf(state, idx);
    if (!(group.upgrades ?? []).includes('upg_laboratory')) {
      return err('лаборатория не построена — купите «Лабораторию» (lake.upgrade upg_laboratory)');
    }
    const now = this.d.time.now();
    const cooldownMs = this.d.table.research.cooldownHours * 3_600_000;
    const r = group.research;
    if (r !== undefined && r.mode !== undefined) {
      return err(`форс уже заряжен (${r.mode}) — ждёт следующую икру озера №${idx + 1}`);
    }
    if (r !== undefined && now < r.usedAt + cooldownMs) {
      const leftMs = r.usedAt + cooldownMs - now;
      const h = Math.floor(leftMs / 3_600_000);
      const m = Math.ceil((leftMs % 3_600_000) / 60_000);
      return err(`лаборатория перезаряжается — ${h}ч ${m}м (кулдаун ${this.d.table.research.cooldownHours}ч)`);
    }
    const g: LakeGroup = { ...group, research: { mode, usedAt: now } };
    this.d.setState(withGroup(state, idx, g));
    this.d.save.markDirty();
    // [M11 · lake:research] P2 MISS-1 (AUDIT-M08): ролл-маркер журнала при
    // КАЖДОМ применении Лаборатории (прецедент lake:autofeed F12) —
    // наблюдаемость: у research нет ни транзакции, ни шинного события
    this.d.rngBus.rollRange(0, 1, 'uniform', 'lake:research');
    return ok({ mode, readyInMs: cooldownMs });
  }

  /** витрина Лаборатории: активный форс + остаток кулдауна */
  researchView(): { built: boolean; mode: 'plus1' | 'plus2' | null; cooldownMs: number } {
    const state = this.d.getState();
    const idx = activeLakeOf(state);
    const group = groupOf(state, idx);
    const built = (group.upgrades ?? []).includes('upg_laboratory');
    const r = group.research;
    const now = this.d.time.now();
    const cooldownMs =
      r !== undefined
        ? Math.max(0, r.usedAt + this.d.table.research.cooldownHours * 3_600_000 - now)
        : 0;
    return { built, mode: r?.mode ?? null, cooldownMs };
  }

  /** F14: переключить активное озеро (витрина/уход/покупки) */
  switchTo(idx: number): Result<{ activeLake: number }> {
    this.d.sweep();
    if (idx !== 0 && idx !== 1) return err('озеро: lake.switch <0|1>');
    const state = this.d.getState();
    if (idx === 1 && state.lake2 === undefined) {
      return err('второго озера нет — купите «Второе озеро» (lake.upgrade upg_lake2)');
    }
    const active = activeLakeOf(state);
    if (active === idx) {
      return err(`озеро №${idx + 1} уже активно`);
    }
    this.d.setState(setActiveLake(state, idx));
    this.d.save.markDirty();
    return ok({ activeLake: idx });
  }

  /** dev: сброс кулдауна Лаборатории (lake.force research 0) */
  devResetResearch(): Result<{ lakeIdx: number }> {
    const state = this.d.getState();
    const idx = activeLakeOf(state);
    const group = groupOf(state, idx);
    if (group.research === undefined) return ok({ lakeIdx: idx });
    const g: LakeGroup = { ...group, research: { ...(group.research.mode !== undefined ? { mode: group.research.mode } : {}), usedAt: 0 } };
    this.d.setState(withGroup(state, idx, g));
    this.d.save.markDirty();
    return ok({ lakeIdx: idx });
  }

  /** [F16] цель для исполнителя lake.treat: первая больная активного озера */
  firstSickSlot(): number {
    const state = this.d.getState();
    return groupOf(state, activeLakeOf(state)).slots.findIndex((s) => s.fishId !== undefined && s.sick);
  }

  /** [F16] цель для исполнителя lake.harvest: первая взрослая (старейшая
   *  по bornAt; «икра/взрослые» карточки §6 — harvest взрослых: икра — не
   *  предмет F8) */
  firstHarvestSlot(): number {
    const state = this.d.getState();
    const slots = groupOf(state, activeLakeOf(state)).slots;
    let best = -1;
    let bestBorn = Number.POSITIVE_INFINITY;
    slots.forEach((s, i) => {
      if (s.fishId === undefined) return;
      const born = s.bornAt ?? 0;
      if (born < bestBorn) {
        bestBorn = born;
        best = i;
      }
    });
    return best;
  }
}

export type { QualityTier };
