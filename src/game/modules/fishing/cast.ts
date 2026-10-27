/**
 * CastService (M07.1 + M07.2, карточка §2/§5, брифы F6 + F11–F14) — ловля.
 *
 * Заброс: энергия 4 (action.fishing.cast.energyCost, базы M01) + расход
 * наживки ровно 1 (TransactionService eventId 'fish.cast' — атомарно:
 * нет наживки → откат, событий нет) + прочность удочки −1 (inventory.wear,
 * D35; при 0 «сломана» — блок с причиной, НЕ исчезает; ремонт — M09).
 *
 * ПОРЯДОК (удача наживки жива во время роллов): роллы (baitProvider активен)
 * → проба вместимости (D23, прецедент магазина — ДО оплаты) → снятие
 * наживки (D30: экипированный стек защищён от defId-изъятия) → транзакция
 * (кост: наживка; грант: валюта сундука) → выдача улова (inventory.acquire,
 * источник 'fishing') → износ удочки → возврат наживки в слот (авто-
 * пополнение из рюкзака) → альбом/статы → события → [M07.2] резолв
 * события-мини с выбором (F14) / «Клада» карты (F13).
 *
 * [M07.2 · F12] локации: пруд (старт) / река — гейт навык Рыболовство
 * (порог — данные FISHING_TABLE.locations); пул рыб — по локации (fishOf).
 * [M07.2 · F13] вылов Карты сокровищ → событие «Клад»: «Открыть сейчас»
 * (дефолт; ролл из TREASURE_MAP_TABLE, стрим fish:treasure:<iid>, карта
 * расходуется) / «Спрятать» (карта остаётся предметом).
 * [M07.2 · F14] события-мини: опции с исходами (skillXp/gold/none);
 * до фазы 6 — авто-резолв ДЕФОЛТНОЙ (первой) опции; dev fish.choice
 * подменяет выбор одноразово (пробы).
 *
 * [DECISION · расход наживки] слот — селектор и расходник: unequip →
 * транзакция из рюкзака → re-equip; точечное iid-изъятие из экипированного
 * стека — право M02-сеанса (D30-шов, M07-OBS-1).
 */
import type { EventBus } from '@/kernel/bus/event-bus/event-bus';
import type { RngBus } from '@/kernel/bus/rng-bus/rng-bus';
import type { StatBus } from '@/kernel/bus/stat-bus/stat-bus';
import type { TransactionService } from '@/kernel/services/transaction/transaction-service';
import type { TimeService } from '@/kernel/time/time-service';
import type { SaveDirector } from '@/kernel/save/save-director';
import type { StatId, ID, CurrencyId, QualityTier, Rarity } from '@/shared/types/ids';
import type { Result } from '@/shared/types/result';
import { err, ok } from '@/shared/types/result';
import type {
  DropCategoryDef,
  FishDef,
  TrashDef,
  ChestEntryDef,
  FishingEventDef,
  TreasureMapEntryDef,
  TreasureMapEventDef,
} from '@/content/fishing/fish';
import type { RodShopDef } from '@/content/fishing/rods';
import type { FishingTable } from '@/content/balance/fishing';
import type { FishState } from './state';
import { noteCast } from './state';
import { applyBiteSpeed, buildCastPlan, fishConditionsMet, gateTextForFish, statOf } from './logic/rolls';
import { resolveEventChoice, resolveTreasureMap, type ChoiceReceipt, type TreasureReceipt, type EventResolveDeps } from './logic/event-resolve';
import { performLootExchange } from './logic/exchange';
import { checkGear } from './logic/precheck';
import type { EquippedEntryView } from './logic/bait-provider';

export interface CastReceipt {
  location: string;
  category: 'trash' | 'small' | 'medium' | 'rare' | 'treasure' | 'event';
  defId: ID | null;
  name: string;
  /** редкость улова (только рыба) */
  rarity: Rarity | null;
  /** качество экземпляра из acquire-канона (предметные результаты) */
  quality: { tier: QualityTier; value: number } | null;
  /** физический вес рыбы, граммы */
  weightGrams: number | null;
  /** количество выданного (сундук: предметы/золото) */
  qty: number | null;
  /** окно клёва: ролл и итог с модификатором скорости, сек */
  bite: { rolledSeconds: number; waitSeconds: number };
  /** прочность удочки после заброса */
  rod: { defId: ID; name: string; current: number; max: number; broken: boolean };
  /** наживка: вернулась в слот (false — стек кончился) */
  bait: { defId: ID; name: string; reequipped: boolean };
  /** грант сундука (валютная запись: золото/уголь/гвозди) */
  grant: { id: string; qty: number } | null;
  /** текст события-мини (категория «событие») */
  eventText: string | null;
  /** [M07.2 · F14] резолв выбора события-мини */
  choice: ChoiceReceipt | null;
  /** [M07.2 · F13] резолв «Клада» (вылов карты) */
  treasure: TreasureReceipt | null;
}

export type ForceSpec = { kind: 'fish' | 'chest' | 'event'; id: string } | null;

export interface CastDeps {
  bus: EventBus;
  rngBus: RngBus;
  statBus: StatBus;
  transaction: TransactionService;
  time: TimeService;
  save: SaveDirector;
  table: FishingTable;
  categories: readonly DropCategoryDef[];
  trash: readonly TrashDef[];
  chest: readonly ChestEntryDef[];
  events: readonly FishingEventDef[];
  rods: readonly RodShopDef[];
  /** [M07.2 · F12] пул рыб локации (пруд/река) */
  fishOf(location: string): readonly FishDef[];
  /** [M07.2 · F13] таблица наград карты + событие «Клад» */
  treasureMap: readonly TreasureMapEntryDef[];
  treasureEvent: TreasureMapEventDef;
  /** app-слой: inventory.equipped() (П4) */
  equippedView(): Array<EquippedEntryView>;
  /** app-слой: inventory.acquire (D23; после пробы — гарантирован) */
  acquire(defId: ID, qty: number, source: string): Result<{ quality: { tier: QualityTier; value: number }; iids?: ID[] }>;
  /** app-слой: inventory.canAcquire — проба вместимости до списания */
  probeCapacity(defId: ID, qty: number): Result<{ fits: boolean; free: number; newEntries: number }>;
  /** app-слой: inventory.unequip / inventory.equip (П4) */
  unequip(slot: ID): Result<unknown>;
  equip(iid: ID, slot: ID): Result<unknown>;
  /** app-слой: первая запись defId в рюкзаке (авто-пополнение слота наживки) */
  findEntryByDef(defId: ID): ID | null;
  /** app-слой: inventory.remove (расход карты при «Открыть») */
  removeItem(defId: ID, qty: number, source: string): Result<unknown>;
  /** app-слой: inventory.wear (D35) */
  wear(iid: ID, n: number): Result<{ current: number; max: number; broken: boolean }>;
  /** app-слой: skills.addXp (исход skillXp событий F14) */
  grantSkillXp(skill: ID, amount: number, source: string): void;
  /** app-слой: dev fish.choice — одноразовая подмена выбора (пробы) */
  popChoice(): string | null;
  /** app-слой: предмет-деф по defId (content) */
  tryItem(defId: ID): { name: string; rarity: Rarity } | undefined;
  /** уровень/ачивки/навыки игрока — player.ctxExtras + quests.gateExtras (П4) */
  gateExtras(): Record<string, unknown>;
  withEnergy(stat: StatId, action: () => Result<unknown>, reason?: string): Result<unknown>;
  getState(): FishState;
  setState(s: FishState): void;
}

export class CastService {
  private readonly d: CastDeps;

  constructor(deps: CastDeps) {
    this.d = deps;
  }

  /** перейти в локацию ([DECISION F12] — команда fish.location; гейт навыка) */
  setLocation(loc: string): Result<{ location: string }> {
    if (loc !== 'pond' && loc !== 'river') {
      return err(`неизвестная локация «${loc}» (доступны: pond, river)`);
    }
    if (loc === 'river') {
      const skill = Number(this.d.gateExtras()['skill:fishing'] ?? 0);
      const need = this.d.table.locations.riverSkillLevel;
      if (skill < need) {
        return err(`река закрыта: нужен навык Рыболовство ${need} (сейчас ${skill}) — растёт с уловом fish.caught`);
      }
    }
    const s = this.d.getState();
    this.d.setState({ ...s, location: loc });
    this.d.save.markDirty();
    return ok({ location: loc });
  }

  /** заброс; force — dev fish.force: рыба / chest:<id> / event:<id> */
  cast(location?: string, forceSpec?: string): Result<CastReceipt> {
    const state = this.d.getState();
    const loc = location ?? state.location;
    if (loc !== 'pond' && loc !== 'river') {
      return err(`неизвестная локация «${loc}» (доступны: pond, river)`);
    }
    if (loc === 'river') {
      // [F12] гейт локации — и для разового cast river, и для срез-локации
      const skill = Number(this.d.gateExtras()['skill:fishing'] ?? 0);
      const need = this.d.table.locations.riverSkillLevel;
      if (skill < need) {
        return err(`река закрыта: нужен навык Рыболовство ${need} (сейчас ${skill}) — растёт с уловом fish.caught`);
      }
    }
    const fish = this.d.fishOf(loc);
    const force = parseForce(forceSpec, fish, this.d.chest, this.d.events);
    if (forceSpec !== undefined && forceSpec !== '' && force === null) {
      const pool = fish.map((f) => f.id).join(', ');
      return err(
        `«${forceSpec}» не в пуле ${loc === 'river' ? 'реки' : 'пруда'} и не chest:/event:-форс (рыбы: ${pool}; сундук: chest:<id>; событие: event:<id>)`,
      );
    }
    // снасть: слоты + честные отказы (logic/precheck — П6 причины)
    const gear = checkGear({ equippedView: () => this.d.equippedView(), tryItem: this.d.tryItem });
    if (!gear.ok) return err(gear.error);

    const act = (): Result<CastReceipt> => this.runAct(loc, fish, force, gear.value.rodView, gear.value.baitView);
    return this.d.withEnergy('action.fishing.cast.energyCost', act, 'заброс удочки') as Result<CastReceipt>;
  }

  private runAct(
    loc: string,
    fish: readonly FishDef[],
    force: ForceSpec,
    rodView: EquippedEntryView,
    baitView: EquippedEntryView,
  ): Result<CastReceipt> {
    // --- 1. контексты и роллы (наживка ещё в слоте — её моды в резолвах)
    const ctx = this.d.time.ctx('player');
    const extra = this.d.gateExtras();
    const devChoice = this.d.popChoice();
    const rodTier = this.d.rods.find((r) => r.defId === rodView.entry.defId)?.tier ?? 0;
    const ctxInfo = {
      baitDefId: baitView.entry.defId,
      rodTier,
      playerLevel: Number(extra['player:level'] ?? 0),
      hasAchievement: (id: string) => Boolean(extra[`achievement:${id}`]),
    };
    const biteSpeed = statOf(this.d.statBus, ctx, 'fishing.bite.speed');
    // [M07.2 · F11] dev-форс гейт-рыбы УВАЖАЕТ conditions: «принудить» не
    // ломает гейты (бриф: force Золотого карпа без условий → отказ с
    // причиной; прецедент pen.sick — форс не обходит гейты домена)
    if (force?.kind === 'fish') {
      const fd = fish.find((f) => f.id === force.id);
      if (fd !== undefined && fd.conditions !== undefined && !fishConditionsMet(fd, ctxInfo)) {
        return err(
          `гейт-рыба «${fd.name}» (${fd.id}) не доступна при текущей снасти: ${gateTextForFish(fd, this.gateNames(), ctxInfo)}`,
        );
      }
    }
    const plan = buildCastPlan({
      rngBus: this.d.rngBus,
      statBus: this.d.statBus,
      ctx,
      table: this.d.table,
      categories: this.d.categories,
      fish,
      trash: this.d.trash,
      chest: this.d.chest,
      events: this.d.events,
      location: loc,
      ctxInfo,
      force,
    });
    // П5: категория рыбы с пустым eligible-пулом (все виды под гейтами) —
    // честный отказ ДО списаний (роллы в журнале — преролл-прецедент магазина)
    if (
      force?.kind !== 'fish' &&
      (plan.category === 'small' || plan.category === 'medium' || plan.category === 'rare') &&
      plan.fish === null
    ) {
      return err(
        `в водоёме нет доступной рыбы категории «${plan.category}» при текущей снасти (гейт-условия — fish.tables)`,
      );
    }

    // --- 2. предмет результата + проба вместимости (канон D23)
    let resultDefId: ID | null = null;
    let resultQty = 1;
    if (plan.fish) resultDefId = plan.fish.id;
    else if (plan.trash) resultDefId = plan.trash.id;
    else if (plan.chest && plan.chest.kind === 'item') {
      resultDefId = plan.chest.defId;
      resultQty = plan.chestQty ?? 1;
    }
    if (resultDefId !== null) {
      const probe = this.d.probeCapacity(resultDefId, resultQty);
      if (!probe.ok) return err(probe.error);
      if (!probe.value.fits) {
        return err(
          `инвентарь полон: свободно слотов ${probe.value.free}, нужно ${probe.value.newEntries} — улова негде хранить`,
        );
      }
    }
    const grantQty = plan.chest && plan.chest.kind === 'currency' ? (plan.chestQty ?? 1) : null;

    // --- 3–6. обмен снасти на улов (logic/exchange — расщепление 01 §6):
    //     расход наживки атомарно → acquire улова → износ удочки → re-equip
    const ex = performLootExchange(
      {
        transaction: this.d.transaction,
        acquire: (defId2, qty2, src) => this.d.acquire(defId2, qty2, src),
        unequip: (slot) => this.d.unequip(slot),
        equip: (iid, slot) => this.d.equip(iid, slot),
        findEntryByDef: (defId2) => this.d.findEntryByDef(defId2),
        wear: (iid, n) => this.d.wear(iid, n),
      },
      { loc, rodView, baitView, resultDefId, resultQty, chest: plan.chest, chestQty: grantQty },
    );
    if (!ex.ok) return err(ex.error);
    const { quality, lootIid, rod: rodWear, baitInSlot } = ex.value;
    const rodMax = rodWear.max;
    const rodCurrent = rodWear.current;

    // --- 7. альбом/статы + события
    const fishId = plan.fish?.id ?? null;
    this.d.setState(noteCast(this.d.getState(), fishId));
    this.d.save.markDirty();

    const name =
      plan.fish?.name ?? plan.trash?.name ?? plan.event?.name ??
      (plan.chest ? (plan.chest.kind === 'currency' ? plan.chest.defId : (this.d.tryItem(plan.chest.defId)?.name ?? plan.chest.defId)) : '—');
    this.d.bus.publish('cast.completed', {
      category: plan.category,
      defId: plan.fish?.id ?? plan.trash?.id ?? plan.event?.id ?? plan.chest?.defId ?? null,
      ...(plan.weightGrams !== null ? { weightGrams: plan.weightGrams } : {}),
      ...(quality !== null ? { quality } : {}),
      ...(grantQty !== null ? { qty: grantQty } : {}),
    });
    if (plan.fish && plan.rarity !== null) {
      this.d.bus.publish('fish.caught', {
        defId: plan.fish.id,
        rarity: plan.rarity,
        quality: quality ?? { tier: 'D', value: 50 },
        qty: 1,
        ...(plan.weightGrams !== null ? { weightGrams: plan.weightGrams } : {}),
      });
    }

    // --- 8. [M07.2 · F14] событие-мини с выбором (авто-резолв дефолта
    //     до фазы 6; dev fish.choice подменяет одноразово)
    let choice: ChoiceReceipt | null = null;
    if (plan.event !== null) {
      choice = resolveEventChoice(this.eventDeps(), plan.event, devChoice);
    }

    // --- 9. [M07.2 · F13] вылов Карты сокровищ → «Клад» с выбором
    let treasure: TreasureReceipt | null = null;
    if (plan.chest !== null && plan.chest.defId === 'treasure_map' && resultDefId === 'treasure_map') {
      treasure = resolveTreasureMap(this.eventDeps(), lootIid, devChoice);
    }

    const rodDefName = this.d.tryItem(rodView.entry.defId)?.name ?? rodView.entry.defId;
    return ok({
      location: loc,
      category: plan.category,
      defId: plan.fish?.id ?? plan.trash?.id ?? plan.event?.id ?? (plan.chest?.defId ?? null),
      name,
      rarity: plan.rarity,
      quality,
      weightGrams: plan.weightGrams,
      qty: resultDefId !== null ? resultQty : grantQty,
      bite: {
        rolledSeconds: plan.biteRolledSeconds,
        waitSeconds: applyBiteSpeed(this.d.table, plan.biteRolledSeconds, biteSpeed),
      },
      rod: {
        defId: rodView.entry.defId,
        name: rodDefName,
        current: rodCurrent,
        max: rodMax,
        broken: rodCurrent <= 0,
      },
      bait: { defId: baitView.entry.defId, name: this.d.tryItem(baitView.entry.defId)?.name ?? baitView.entry.defId, reequipped: baitInSlot },
      grant: grantQty !== null && plan.chest ? { id: plan.chest.defId, qty: grantQty } : null,
      eventText: plan.event?.text ?? null,
      choice,
      treasure,
    });
  }

  /** колбэки резолва событий (logic/event-resolve — чистые функции) */
  private eventDeps(): EventResolveDeps {
    return {
      rngBus: this.d.rngBus,
      transaction: this.d.transaction,
      treasureMap: this.d.treasureMap,
      treasureEvent: this.d.treasureEvent,
      probeCapacity: (defId, qty) => this.d.probeCapacity(defId, qty),
      acquire: (defId, qty, source) => this.d.acquire(defId, qty, source),
      removeItem: (defId, qty, source) => this.d.removeItem(defId, qty, source),
      grantSkillXp: (skill, amount, source) => this.d.grantSkillXp(skill, amount, source),
    };
  }

  /** имена для гейт-текстов (предметы/удочки — из депсов и данных) */
  private gateNames(): { bait: (id: string) => string | undefined; rodTier: (tier: number) => string | undefined; achievement: (id: string) => string | undefined } {
    return {
      bait: (id) => this.d.tryItem(id)?.name,
      rodTier: (tier) => this.d.rods.find((r) => r.tier === tier)?.name,
      achievement: (id) => (this.d.gateExtras()[`achievement:name:${id}`] as string | undefined) ?? undefined,
    };
  }
}

/** парсинг dev-форса: '<fishId>' | 'chest:<id|defId>' | 'event:<id>' */
function parseForce(
  spec: string | undefined,
  fish: readonly FishDef[],
  chest: readonly ChestEntryDef[],
  events: readonly FishingEventDef[],
): ForceSpec {
  if (spec === undefined || spec === '') return null;
  if (spec.startsWith('chest:')) {
    const id = spec.slice('chest:'.length);
    return chest.some((c) => c.id === id || c.defId === id) ? { kind: 'chest', id } : null;
  }
  if (spec.startsWith('event:')) {
    const id = spec.slice('event:'.length);
    return events.some((e) => e.id === id) ? { kind: 'event', id } : null;
  }
  return fish.some((f) => f.id === spec) ? { kind: 'fish', id: spec } : null;
}
