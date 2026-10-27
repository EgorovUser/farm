/**
 * Найм/увольнение/премия (M11.1, брифы F3–F4; карточка §2/§4).
 *
 * ОБЪЕКТЫ (F3): реестр строится ИЗ ЖИВОГО СОСТОЯНИЯ (купленные
 * улучшения/срезы через витрины publicApi — [DECISION-архитектура]:
 * workers читает ТОЛЬКО живые витрины, НЕ импортирует модули систем —
 * изоляция rg ×3 сохраняется), данными content/workers (WORKER_OBJECTS,
 * максимум 6): базовые — ферма/озеро/загон; копии — «Второе поле» /
 * «Второе озеро» / «Второй загон».
 *
 * ЛИМИТ найма = количеству объектов (карточка §2; в чистой игре 3);
 * соответствие профессии типу объекта [DECISION]: farmer → field|field2,
 * fishkeeper → lake|lake2, herdsman → pen|animals2; 1 работник = 1 объект
 * (два на один объект — отказ); наём — БЕЗ энергии и БЕЗ стоимости
 * ([DECISION]: расходы начинаются с расчётного дня); профиль
 * ЗАМОРАЖИВАЕТСЯ при найме (доска следующего дня не меняет нанятого).
 *
 * Премия (F4): ×1.5 дневной ЗП (TransactionService eventId worker.bonus),
 * +10 настроения, кулдаун 7 дней от последней.
 */
import type { EventBus } from '@/kernel/bus/event-bus/event-bus';
import type { TransactionService } from '@/kernel/services/transaction/transaction-service';
import type { TimeService } from '@/kernel/time/time-service';
import type { SaveDirector } from '@/kernel/save/save-director';
import type { Result } from '@/shared/types/result';
import { err, ok } from '@/shared/types/result';
import type { WorkerObjectDef, WorkersTable } from '@/content/workers/table';
import type { WorkerInstance, WorkersState } from './state';
import { canonicalWorker, isSick, moodCapOf } from './state';
import { withMood } from './logic/day';
import type { WorkerProfile } from './logic/board';

/** признаки живого состояния систем (витрины publicApi через app-слой).
 *  [M11.2 · F10] расширение полей для ЦЕЛЕПОДБОРА директора: тайлы вкладок
 *  (state/weeds/wet — первая подходящая цель farm.*), активность озёр
 *  (работник действует ТОЛЬКО на СВОЁ активное озеро — без switch),
 *  животные загонов (fedToday/pettedToday/cleanliness — цели pen.*).
 *  weedsMax/avgHappiness сохранены (dirtyProbe F4 M11.1 — совместимость). */
export interface SystemViews {
  /** вкладки фермы: id + максимальная стадия сорняков + тайлы для директора */
  farmTabs(): Array<{
    id: string;
    kind: string;
    weedsMax: number;
    tiles: Array<{ index: number; state: string; weeds: number; wet: boolean }>;
  }>;
  /** озёра по индексам (0-based; длина = сколько озёр живо; active — витрина) */
  lakes(): Array<{ cleanliness: number; active: boolean }>;
  /** загоны по индексам (0-based; длина = сколько загонов живо) */
  pens(): Array<{
    avgHappiness: number | null;
    animals: Array<{ fedToday: boolean; pettedToday: boolean; cleanliness: number }>;
  }>;
}

/** реестр ЖИВЫХ объектов из витрин (F3: данными, НЕ хардкодом) */
export function liveObjects(views: SystemViews, defs: WorkerObjectDef[]): WorkerObjectDef[] {
  const tabs = views.farmTabs();
  const lakes = views.lakes();
  const pens = views.pens();
  return defs.filter((o) => {
    switch (o.probe) {
      case 'always':
        return true;
      case 'farmTab':
        return o.tabId !== undefined && tabs.some((t) => t.id === o.tabId);
      case 'lake2':
        return lakes.length >= 2;
      case 'pen2':
        return pens.length >= 2;
    }
  });
}

export interface HireDeps {
  bus: EventBus;
  transaction: TransactionService;
  time: TimeService;
  save: SaveDirector;
  table: WorkersTable;
  objectsDefs: WorkerObjectDef[];
  views: SystemViews;
  getState(): WorkersState;
  setState(s: WorkersState): void;
}

export class WorkersHire {
  private readonly d: HireDeps;

  constructor(deps: HireDeps) {
    this.d = deps;
  }

  /** живые объекты (внешним: витрина/лимит) */
  objects(): WorkerObjectDef[] {
    return liveObjects(this.d.views, this.d.objectsDefs);
  }

  /** F3: найм из доски — профиль замораживается, объект первый свободный
   *  нужной профессии; БЕЗ энергии и БЕЗ стоимости [DECISION] */
  hire(profile: WorkerProfile): Result<WorkerInstance> {
    const state = this.d.getState();
    const objects = this.objects();
    const taken = new Set(state.hired.map((w) => w.object));
    if (state.hired.some((w) => w.defId === profile.defId)) {
      return err(`${profile.name} уже нанят (workers list — витрина)`);
    }
    if (state.hired.length >= objects.length) {
      return err(
        `лимит найма: ${state.hired.length}/${objects.length} (объектов ${objects.length} — увольте работника или постройте копию)`,
      );
    }
    const free = objects.find((o) => o.profession === profile.profession && !taken.has(o.id));
    if (!free) {
      return err(
        `для профессии «${profile.profession}» нет свободного объекта (${objects
          .filter((o) => o.profession === profile.profession)
          .map((o) => o.name)
          .join(', ') || 'нет объектов этого типа'}) — увольте или постройте копию`,
      );
    }
    const instance: WorkerInstance = canonicalWorker({
      defId: profile.defId,
      name: profile.name,
      profession: profile.profession,
      stars: profile.stars,
      salaryPerDay: profile.salaryPerDay,
      checkPeriodHours: profile.checkPeriodHours,
      care: profile.care,
      traits: profile.traits,
      ...(profile.toolRequirement !== undefined ? { toolRequirement: profile.toolRequirement } : {}),
      object: free.id,
      mood: this.d.table.mood.start,
      hiredAt: this.d.time.now(),
    });
    // [M11.2] spread от исходного state — аддитивные поля (upgrades)
    // сохраняются (баг state-loss: найм после покупки улучшений стирал
    // владение — найден живой пробой Столовой)
    this.d.setState({ ...state, v: 1, hired: [...state.hired, instance] });
    this.d.save.markDirty();
    this.d.bus.publish('worker.hired', {
      defId: instance.defId,
      name: instance.name,
      profession: instance.profession,
      stars: instance.stars,
      object: instance.object,
    });
    return ok(instance);
  }

  /** F3: увольнение (работники не взаимозаменяемы без увольнения) */
  fire(idx: number): Result<{ defId: string; name: string }> {
    const state = this.d.getState();
    const w = state.hired[idx];
    if (!w) return err(`работник №${idx} не найден (workers list — витрина)`);
    this.d.setState({ ...state, v: 1, hired: state.hired.filter((_, i) => i !== idx) });
    this.d.save.markDirty();
    this.d.bus.publish('worker.fired', { defId: w.defId, name: w.name, reason: 'manual' });
    return ok({ defId: w.defId, name: w.name });
  }

  /** F4: премия — ×1.5 дневной ЗП (worker.bonus), +10 настроения,
   *  кулдаун cooldownDays от последней */
  bonus(idx: number): Result<{ cost: number; mood: number }> {
    const state = this.d.getState();
    const w = state.hired[idx];
    if (!w) return err(`работник №${idx} не найден (workers list — витрина)`);
    const now = this.d.time.now();
    const cooldownMs = this.d.table.bonus.cooldownDays * 86_400_000;
    if (w.lastBonusAt !== undefined && now < w.lastBonusAt + cooldownMs) {
      const leftH = Math.ceil((w.lastBonusAt + cooldownMs - now) / 3_600_000);
      const dLeft = Math.floor(leftH / 24);
      const hLeft = leftH % 24;
      return err(`премия ${w.name} недавно выдавалась — кулдаун ${dLeft}д ${hLeft}ч (раз в ${this.d.table.bonus.cooldownDays} дней)`);
    }
    const cost = Math.round(w.salaryPerDay * this.d.table.bonus.salaryMult);
    const pay = this.d.transaction.transact({
      costs: [{ t: 'currency', id: 'gold', qty: cost }],
      eventId: 'worker.bonus',
      reason: `премия работнику ${w.name}`,
    });
    if (!pay.ok) return err(pay.error);
    // [FIX-M11 · FX2] премия — с капом из ДАННЫХ (единая точка moodCapOf):
    // с Домиком mood 96 + 10 → 105 (не обрезается на 100)
    const next = withMood(
      { ...w, lastBonusAt: now },
      this.d.table.mood.bonus,
      this.d.table,
      moodCapOf(state, this.d.table),
    );
    this.d.setState({
      ...state,
      v: 1,
      hired: state.hired.map((x, i) => (i === idx ? next : x)),
    });
    this.d.save.markDirty();
    return ok({ cost, mood: next.mood });
  }

  /** витрина занятости: объект → работник (для list) */
  busyObjects(): Record<string, string> {
    const out: Record<string, string> = {};
    for (const w of this.d.getState().hired) out[w.object] = w.name;
    return out;
  }

  /** больной ли сейчас (ленивая дата) — витрине */
  sickOf(w: WorkerInstance): boolean {
    return isSick(w, this.d.time.now());
  }
}
