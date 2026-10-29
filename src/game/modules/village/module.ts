/**
 * VillageModule (M16) — Деревня. M16.1: гейт + жители/потребности/
 * счастье/налоги/подарки/помощь. M16.2 (карточка §3–§4): здания (9 ×
 * уровни 1–3, транзакция village.build + таймеры часов реального
 * времени), снаряжение жителей (village.equip, снапшот качества/заточки),
 * рейды (еженедельная ночь, предвестник ровно за 24 ч, расчёт защиты vs
 * порог, кража ≤ 20% склада, village.raidLoss) + события raid-пары.
 *
 * Изоляция (01 §5–§7): модуль НЕ импортирует чужие модули — все каналы
 * колбэками app-слоя (deps.ts). Подписки времени: dayTick (налог/ролл/
 * ворчание) + hourTick (таймеры построек, окно рейда; catchUp публикует
 * те же границы — идемпотентность маркерами construction/need.day/
 * raid.week/lastResult.week).
 */
import type { GameModule, ModuleContext } from '@/game/module-registry';
import type {
  VillageBuildingDef,
  VillageRaidTable,
  VillagerDef,
  VillageGiftsTable,
  VillageHelpTable,
  VillageNeedsTable,
  VillageTable,
  VillageTaxTable,
} from '@/content/village/types';
import { checkCondition } from '@/shared/utils/condition-check';
import { createVillageManifest } from './manifest';
import { defaultVillageState, villageSaveSlice, type VillageEquipState, type VillageState } from './state';
import {
  dayPass,
  giftEntryByRoll,
  needSatisfied,
  rollNeedFor,
  taxInfoOf,
} from './logic';
import { makeVillageProvider, VILLAGE_PROVIDER_ID } from './provider';
import { buildNeedsView, buildVillageStateView } from './view';
import { buildRaidView, buildBuildingsView } from './view-m162';
import { runVillageHelp, type HelpReceipt } from './help';
import type { VillageModuleDeps } from './deps';
import type { Result } from '@/shared/types/result';
import { err, ok } from '@/shared/types/result';
import type { CurrencyId } from '@/shared/types/ids';
import { QUALITY_TIERS } from '@/shared/types/ids';
import type { QualityTier } from '@/shared/types/ids';
import {
  applyBuildStart,
  buildingDefenseOf,
  buildingLevelOf,
  completeConstructions,
  happinessAuraOf,
  houseBonusOf,
  planBuild,
  warehouseProtectionOf,
  type BuildPlan,
  type CompletedBuild,
} from './buildings';
import {
  nextRaidAfter,
  raidAtOfWeek,
  raidDefenseOf,
  raidWeekKeyOf,
  raidWindowAction,
  resolveRaidOutcome,
  warningAtOf,
  type RaidOutcome,
} from './raid';

export interface SupplyReceipt {
  header: string;
  lines: string[];
}

const GATE_MSG = 'деревня заперта: уровень 30 + ачивка «Мастер хутора» (village state)';
const MS_HOUR = 3_600_000;

export class VillageModule implements GameModule {
  readonly manifest = createVillageManifest();
  api: Record<string, (...args: unknown[]) => unknown> = {};
  private state: VillageState = defaultVillageState();
  private readonly deps: VillageModuleDeps;
  private defs: VillagerDef[] = [];
  private pools: VillageNeedsTable | null = null;
  private table: VillageTable | null = null;
  private taxTable: VillageTaxTable | null = null;
  private gifts: VillageGiftsTable | null = null;
  private helpTable: VillageHelpTable | null = null;
  private buildingDefs: VillageBuildingDef[] = [];
  private raidTable: VillageRaidTable | null = null;
  private markDirty: () => void = () => {};
  private bus: ModuleContext['bus'] | null = null;
  private transaction: ModuleContext['transaction'] | null = null;
  private statBus: ModuleContext['statBus'] | null = null;
  private time: ModuleContext['time'] | null = null;
  private rngBus: ModuleContext['rngBus'] | null = null;
  private content: ModuleContext['content'] | null = null;
  private tasksRef: ModuleContext['tasks'] | null = null;
  private detachBus: (() => void) | null = null;

  constructor(deps: VillageModuleDeps) {
    this.deps = deps;
  }

  activate(ctx: ModuleContext): void {
    const { save, content, statBus, bus, transaction, time, rngBus, tasks } = ctx;
    this.defs = content.get<VillagerDef[]>('village.villagers');
    this.pools = content.get<VillageNeedsTable>('village.needs');
    this.table = content.get<VillageTable>('village');
    this.taxTable = content.get<VillageTaxTable>('village.tax');
    this.gifts = content.get<VillageGiftsTable>('village.gifts');
    this.helpTable = content.get<VillageHelpTable>('village.help');
    this.buildingDefs = content.get<VillageBuildingDef[]>('village.buildings');
    this.raidTable = content.get<VillageRaidTable>('village.raid');
    this.bus = bus;
    this.transaction = transaction;
    this.statBus = statBus;
    this.time = time;
    this.rngBus = rngBus;
    this.content = content;
    this.tasksRef = tasks;
    this.markDirty = () => save.markDirty();

    save.registerSlice(
      'village',
      villageSaveSlice(() => this.state, (s) => { this.state = s; }, this.defs, this.buildingDefs),
    );

    statBus.registerProvider(
      makeVillageProvider(() => this.state, this.defs, this.table!, this.taxTable!, this.buildingDefs),
    );

    // подписки манифеста: time-события (dayTick жив M16.1 + hourTick M16.2:
    // таймеры построек и окно рейда; catchUp публикует те же границы)
    const offDay = bus.subscribe('time.dayTick', (p) => {
      const payload = p as { dateISO?: string; now?: number };
      const now = typeof payload?.now === 'number' ? payload.now : time.now();
      this.onDayTick(typeof payload?.dateISO === 'string' ? payload.dateISO : time.localDateISO(now));
    });
    const offHour = bus.subscribe('time.hourTick', (p) => {
      const payload = p as { now?: number };
      this.onHourTick(typeof payload?.now === 'number' ? payload.now : time.now());
    });
    this.detachBus = () => {
      offDay();
      offHour();
      statBus.unregisterProvider(VILLAGE_PROVIDER_ID);
    };

    this.api = {
      'village.state': () => this.stateView(),
      'village.need': (id: unknown) => this.needsView(id === undefined ? 'all' : String(id)),
      'village.supply': (id: unknown, item: unknown, qty?: unknown): Result<SupplyReceipt> =>
        this.supply(id === undefined ? '' : String(id), item === undefined ? '' : String(item), qty === undefined ? undefined : Number(qty)),
      'village.help': (): Result<HelpReceipt> => this.help(),
      // dev (форс дня — прецедент lake.force/passives.reset; условия НЕ проверяются)
      'village.force': (): SupplyReceipt => this.forceDay(),
      // --- M16.2
      'village.build': (id: unknown): Result<SupplyReceipt> | unknown =>
        id === undefined || id === '' ? this.buildingsView() : this.build(String(id)),
      'village.equip': (id: unknown, item: unknown): Result<SupplyReceipt> =>
        this.equip(id === undefined ? '' : String(id), item === undefined ? '' : String(item)),
      'village.raid': () => this.raidView(),
      // dev: форс окна рейда «предвестник → ночь» по стадиям (см. forceRaid)
      'village.raid.force': (): Result<SupplyReceipt> => this.forceRaid(),
    };
  }

  deactivate(): void {
    if (this.detachBus !== null) this.detachBus();
    this.detachBus = null;
  }

  getState(): VillageState {
    return this.state;
  }

  // ------------------------------------------------------------ гейт и день

  private gateCtx() {
    return {
      tags: [] as string[],
      stat: (stat: string) => this.statBus!.resolve({ stat, ctx: this.time!.ctx('player') }),
      hasFlag: (flag: string) => this.deps.hasFlag(flag),
      skillLevel: (skill: string) => this.deps.skillLevel(skill),
      playerLevel: this.deps.playerLevel(),
      itemCount: (defId: string) => this.deps.itemCount(defId),
      hasAchievement: (id: string) => this.deps.hasAchievement(id),
    };
  }

  private gatePasses(): boolean {
    return checkCondition(this.table!.gate, this.gateCtx());
  }

  /** unlock-гейт жителя: уровень деревни + [M16.2 · DECISION M162-дом]
   *  скидка Дома («следующий из 12 доступен уровнем ниже» за каждый уровень) */
  private unlockPass = (def: VillagerDef): boolean => {
    if (def.unlock === undefined) return true;
    const c = def.unlock;
    if (c.t === 'statAtLeast' && c.stat === 'village.level') {
      const eff = this.villageLevel() + houseBonusOf(this.state, this.buildingDefs);
      return eff >= c.value;
    }
    return checkCondition(def.unlock, this.gateCtx());
  };

  private today(): string {
    return this.time!.localDateISO(this.time!.now());
  }

  private now(): number {
    return this.time!.now();
  }

  private villageLevel(): number {
    return taxInfoOf(this.state, this.defs, this.table!, this.taxTable!).level;
  }

  private resolveTax(): number {
    return this.statBus!.resolve({ stat: 'village.tax.gold', ctx: this.time!.ctx('player') });
  }

  /** ленивое завершение стройок (абсолютные таймеры: finishAt в прошлом = READY) */
  private ensureConstructions(now = this.now()): CompletedBuild[] {
    if (this.state.construction === undefined) return [];
    const r = completeConstructions(this.state, this.buildingDefs, now);
    if (r.completed.length > 0) {
      this.state = r.state;
      this.markDirty();
      this.bus!.publish('invalidate.stat', {});
      this.ensureVillagers(); // XP постройки мог поднять уровень — новые жители
    }
    return r.completed;
  }

  private ensureOpen(): boolean {
    if (this.state.unlocked) return true;
    if (!this.gatePasses()) return false;
    const dateISO = this.today();
    const villagers: VillageState['villagers'] = {};
    for (const def of this.defs) {
      if (!this.unlockPass(def)) continue;
      const base = { happiness: this.table!.happiness.start, grumbleDays: 0 };
      const need = rollNeedFor(this.deps.saveId(), def, base, this.pools!, dateISO);
      villagers[def.id] = { ...base, ...(need !== undefined ? { need } : {}) };
    }
    this.state = { ...this.state, unlocked: true, villagers };
    this.markDirty();
    this.bus!.publish('invalidate.stat', {});
    return true;
  }

  /** присоединение жителей, чей гейт прошёл (уровень деревни/скидка Дома) */
  private ensureVillagers(): string[] {
    if (!this.state.unlocked) return [];
    const dateISO = this.today();
    const villagers = { ...this.state.villagers };
    const joined: string[] = [];
    for (const def of this.defs) {
      if (villagers[def.id] !== undefined || !this.unlockPass(def)) continue;
      const base = { happiness: this.table!.happiness.start, grumbleDays: 0 };
      const need = rollNeedFor(this.deps.saveId(), def, base, this.pools!, dateISO);
      villagers[def.id] = { ...base, ...(need !== undefined ? { need } : {}) };
      joined.push(def.id);
    }
    if (joined.length > 0) {
      this.state = { ...this.state, villagers };
      this.markDirty();
      this.bus!.publish('invalidate.stat', {});
    }
    return joined;
  }

  private onDayTick(dateISO: string): void {
    if (!this.ensureOpen()) return; // заперто — срез НЕ инициализируется
    this.ensureVillagers();
    const pass = dayPass(this.state, this.defs, this.unlockPass, {
      saveId: () => this.deps.saveId(),
      pools: this.pools!,
      table: this.table!,
    }, dateISO);
    this.state = pass.state;
    if (pass.taxGold !== 0) {
      const gold = Math.max(0, this.resolveTax());
      if (gold > 0) {
        const tx = this.transaction!.transact({
          grants: [{ t: 'currency', id: 'gold', qty: gold }],
          eventId: 'village.tax',
          reason: `налог деревни за ${dateISO} (уровень/счастье/ворчуны — шина)`,
        });
        if (tx.ok) {
          this.bus!.publish('village.taxCollected', {
            dateISO,
            gold,
            level: this.villageLevel(),
            grumblers: pass.grumblersAfter.length,
          });
        }
      }
    }
    if (pass.processed) {
      this.markDirty();
      this.bus!.publish('invalidate.stat', {});
    }
  }

  // ------------------------------------------------------------ hourTick (M16.2)

  private onHourTick(now: number): void {
    if (!this.state.unlocked) return; // до гейта — тишина среза
    this.ensureConstructions(now);
    this.raidWindowTick(now);
  }

  /** окно рейда: предвестник ровно за 24 ч / разрешение в ночь (маркеры) */
  private raidWindowTick(now: number): void {
    const action = raidWindowAction(this.state, this.raidTable!, now);
    if (action.t === 'quiet') return;
    if (action.t === 'warn') {
      this.applyWarning(action.week, action.raidAt, action.warningAt, action.leadHours);
      return;
    }
    this.applyRaidResolution(action.week, action.raidAt, now);
  }

  private applyWarning(week: string, raidAt: number, warningAt: number, leadHours: number): void {
    this.state = {
      ...this.state,
      raid: { week, warned: true, ...(this.state.raid?.lastResult !== undefined ? { lastResult: this.state.raid.lastResult } : {}) },
    };
    this.markDirty();
    // событие ×1 манифеста (каталог 02 §4 — строка Task 84)
    this.bus!.publish('village.raidWarning', { week, raidAt, warningAt, leadHours, at: warningAt });
  }

  /** разрешение рейда: расчёт → кража (TransactionService) → событие → маркеры */
  private applyRaidResolution(week: string, raidAt: number, now: number): RaidOutcome {
    const outcome = resolveRaidOutcome(this.state, this.defs, this.raidTable!, {
      villageLevel: this.villageLevel(),
      walletGold: this.deps.walletGold(),
      buildingDefense: buildingDefenseOf(this.state, this.buildingDefs),
      warehouseProtection: warehouseProtectionOf(this.state, this.buildingDefs),
      itemTypeOf: (defId) => this.itemTypeOf(defId),
      itemName: (defId) => this.itemName(defId),
      now,
      raidAt,
    });
    if (!outcome.success && outcome.stolenGold > 0) {
      // кража — честная транзакция списания (журнал: валюта по данным)
      const tx = this.transaction!.transact({
        costs: [{ t: 'currency', id: 'gold', qty: outcome.stolenGold }],
        eventId: 'village.raidLoss',
        reason: `рейд гоблинов ${outcome.dateISO}: кража ${outcome.stolenPercent}% склада (защита ${outcome.defense}/${outcome.threshold})`,
      });
      if (!tx.ok) {
        // кошелёк не осилил списание (внешние причины) — событие всё равно
        // честно: stolen = фактически списанное (0)
        outcome.stolenGold = 0;
      }
    }
    if (outcome.success) {
      // победа: +строка счастья каждому жителю (данные)
      const bonus = this.raidTable!.winHappinessBonus;
      const villagers = Object.fromEntries(
        Object.entries(this.state.villagers).map(([id, v]) => [
          id,
          { ...v, happiness: Math.min(this.table!.happiness.max, v.happiness + bonus) },
        ]),
      );
      this.state = { ...this.state, villagers };
    }
    this.state = {
      ...this.state,
      raid: {
        week,
        warned: true,
        lastResult: { success: outcome.success, stolen: outcome.stolenGold, dateISO: outcome.dateISO, week },
      },
    };
    this.markDirty();
    this.bus!.publish('village.raidResolved', {
      success: outcome.success,
      stolen: outcome.stolenGold,
      defense: outcome.defense,
      threshold: outcome.threshold,
      stolenPercent: outcome.stolenPercent,
      week,
    });
    this.bus!.publish('invalidate.stat', {});
    return outcome;
  }

  // ------------------------------------------------------------ витрины

  private stateView() {
    this.ensureOpen();
    this.ensureVillagers();
    return buildVillageStateView(this.state, this.defs, this.table!, this.taxTable!, {
      playerLevel: () => this.deps.playerLevel(),
      hasFlag: (f) => this.deps.hasFlag(f),
      resolveTax: () => this.resolveTax(),
      dateISO: () => this.today(),
      // [M16.2] счастье-аура построек — в раскладку налог-строки (шину уже
      // даёт провайдер; до фикса мод был невидим в витрине village.state)
      aura: () => happinessAuraOf(this.state, this.buildingDefs),
    });
  }

  private needsView(id: string) {
    this.ensureOpen();
    this.ensureVillagers();
    const rows = buildNeedsView(this.state, this.defs, {
      itemName: (defId) => this.itemName(defId),
    });
    return id === 'all' ? rows : rows.filter((r) => r.id === id || r.name === id);
  }

  /** имя предмета/валюты: каталог items → имя; иначе — id как есть */
  private itemName(defId: string): string {
    const items = this.content!.get<Array<{ id: string; name: string }>>('items');
    return items.find((d) => d.id === defId)?.name ?? defId;
  }

  /** тип предмета (каталог items; неизвестный — 'other', П5) */
  private itemTypeOf(defId: string): string {
    const items = this.content!.get<Array<{ id: string; itemType: string }>>('items');
    return items.find((d) => d.id === defId)?.itemType ?? 'other';
  }

  private raidView() {
    this.ensureOpen();
    this.ensureVillagers();
    this.ensureConstructions();
    return buildRaidView(this.state, this.defs, this.raidTable!, {
      now: () => this.now(),
      villageLevel: () => this.villageLevel(),
      walletGold: () => this.deps.walletGold(),
      buildingDefense: () => buildingDefenseOf(this.state, this.buildingDefs),
      warehouseProtection: () => warehouseProtectionOf(this.state, this.buildingDefs),
      itemTypeOf: (defId: string) => this.itemTypeOf(defId),
      itemName: (defId: string) => this.itemName(defId),
    });
  }

  private buildingsView() {
    this.ensureOpen();
    this.ensureConstructions();
    return buildBuildingsView(this.state, this.buildingDefs, {
      now: () => this.now(),
      villageLevel: () => this.villageLevel(),
      repairDiscount: () => this.statBus!.resolve({ stat: 'village.repair.discountPercent', ctx: this.time!.ctx('player') }),
      marketDiscount: () => this.statBus!.resolve({ stat: 'village.market.discountPercent', ctx: this.time!.ctx('player') }),
      houseBonus: () => houseBonusOf(this.state, this.buildingDefs),
      aura: () => taxInfoOf(this.state, this.defs, this.table!, this.taxTable!, happinessAuraOf(this.state, this.buildingDefs)).aura,
    });
  }

  // ------------------------------------------------------------ постройка (G2)

  private build(id: string): Result<SupplyReceipt> {
    if (!this.ensureOpen()) return err(GATE_MSG);
    this.ensureConstructions(); // ленивое завершение (абсолютные таймеры)
    const plan = planBuild(this.state, this.buildingDefs, id, {
      villageLevel: () => this.villageLevel(),
      now: () => this.now(),
    });
    if (!plan.ok) return err(plan.error);
    const p: BuildPlan = plan.value;
    const costs: Array<{ t: 'currency'; id: CurrencyId; qty: number } | { t: 'item'; defId: string; qty: number }> = [];
    if (p.costGold > 0) costs.push({ t: 'currency', id: 'gold', qty: p.costGold });
    for (const c of p.items) {
      costs.push(c.t === 'currency' ? { t: 'currency', id: c.id as CurrencyId, qty: c.qty } : { t: 'item', defId: c.id, qty: c.qty });
    }
    const tx = this.transaction!.transact({
      costs,
      eventId: 'village.build',
      reason: `стройка: ${p.def.name} ур.${p.level}`,
    });
    if (!tx.ok) return err(`стройка не начата: ${tx.error}`);
    this.state = applyBuildStart(this.state, p.def.id, p.finishAt);
    this.markDirty();
    const hoursLeft = Math.ceil((p.finishAt - this.now()) / MS_HOUR);
    const lines = [
      `списано: ${p.costGold}з${p.items.length > 0 ? ` + ${p.items.map((c) => `${c.id} ×${c.qty}`).join(', ')}` : ''} (TransactionService village.build)`,
      `стройка: ${p.def.name} ур.${p.level}/${p.def.levels.length} — ${p.def.levels[p.level - 1]!.hours} ч реального времени (завершится ~${this.time!.localDateISO(p.finishAt)}; часовые таймеры — час реального времени)`,
      `по завершении: XP деревне +${p.def.levels[p.level - 1]!.xp} · эффект ${effectLineOf(p.def, p.level, houseBonusOf(this.state, this.buildingDefs))}`,
      `таймер: ${hoursLeft} ч осталось (живой час: time +1h — витрины village raid / village build)`,
    ];
    return ok({ header: `Стройка начата: ${p.def.name} ур.${p.level}`, lines });
  }

  // ------------------------------------------------------------ снаряжение (G4)

  private equip(villagerId: string, itemId: string): Result<SupplyReceipt> {
    if (!this.ensureOpen()) return err(GATE_MSG);
    const def = this.defs.find((d) => d.id === villagerId || d.name === villagerId);
    if (def === undefined) return err(`неизвестный житель: ${villagerId} (village state — реестр жителей)`);
    const live = this.state.villagers[def.id];
    if (live === undefined) return err(`${def.name} ещё не в деревне (village state)`);
    if (itemId === 'off' || itemId === 'none' || itemId === 'снять') return this.unequip(def.id, def.name);
    const itemDef = this.content!.get<Array<{ id: string; itemType: string; name: string }>>('items').find((d) => d.id === itemId);
    if (itemDef === undefined) return err(`неизвестный предмет: ${itemId} (inv list — рюкзак)`);
    if (!this.raidTable!.defense.equippableTypes.includes(itemDef.itemType)) {
      return err(`${itemDef.name} — не снаряжение (можно вручать: ${this.raidTable!.defense.equippableTypes.join('/')})`);
    }
    if (this.state.equipped?.[def.id] !== undefined) {
      return err(`у ${def.name} уже есть снаряжение (${this.state.equipped[def.id]!.defId}) — сначала снимите: village equip ${def.id} off`);
    }
    // экземпляр, который ИЗЫМЕТ транзакция: худшие-вперёд (D25 канона M02)
    const candidates = this.deps.listBackpack().filter((e) => e.defId === itemId && e.qty > 0);
    if (candidates.length === 0) return err(`предмета нет в рюкзаке: ${itemId} (inv list; экипированное — сначала снимите)`);
    const worst = [...candidates].sort((a, b) => tierRank(a.tier) - tierRank(b.tier) || a.value - b.value)[0]!;
    const tx = this.transaction!.transact({
      costs: [{ t: 'item', defId: itemId, qty: 1 }],
      eventId: 'village.equip',
      reason: `снаряжение ${def.name}: ${itemId} (${worst.tier}/${Math.round(worst.value)})`,
    });
    if (!tx.ok) return err(`снаряжение не вручено: ${tx.error}`);
    const sharpening = this.deps.forgeLevelOf(worst.iid);
    const equipped: VillageEquipState = {
      defId: itemId,
      tier: (QUALITY_TIERS.includes(worst.tier as QualityTier) ? worst.tier : 'D') as QualityTier,
      value: worst.value,
      sharpening,
    };
    const equippedAll = { ...(this.state.equipped ?? {}) };
    equippedAll[def.id] = equipped;
    this.state = { ...this.state, equipped: equippedAll };
    this.markDirty();
    this.bus!.publish('invalidate.stat', {});
    const strength = raidDefenseOf(this.state, this.defs, this.raidTable!, 0, {
      itemTypeOf: (d) => this.itemTypeOf(d),
      itemName: (d) => this.itemName(d),
    }).villagers.find((r) => r.id === def.id)!.strength;
    return ok({
      header: `Снаряжение ${def.name}: ${this.itemName(itemId)}`,
      lines: [
        `списан предмет: ${itemId} (${equipped.tier}/${Math.round(equipped.value)}${sharpening > 0 ? `, заточка ${sharpening}` : ''}) — TransactionService village.equip`,
        `сила защиты жителя: +${strength} (f(тип ${itemDef.itemType}, качество, forgeLevel) — данные raid.ts)`,
        `витрина сил и порог — village.raid; снятие: village equip ${def.id} off (возврат предмета)`,
      ],
    });
  }

  private unequip(villagerId: string, villagerName: string): Result<SupplyReceipt> {
    const snap = this.state.equipped?.[villagerId];
    if (snap === undefined) return err(`у ${villagerName} нет снаряжения (village raid — витрина сил)`);
    const probe = this.deps.canAcquireItem(snap.defId, 1);
    if (!probe.fits) {
      return err(`инвентарь полон — снять нечего куда: свободно ${probe.free}, нужно записей 1 (D23)`);
    }
    // возврат с ИСХОДНЫМ качеством (прецедент подарков M16.1: транзакционные
    // гранты предметов роллят качество — канал inventory.add с точным тиром)
    const r = this.deps.giveItem(snap.defId, snap.tier, snap.value, 1, 'village.unequip');
    if (!r.ok) return err(`возврат не состоялся: ${r.error}`);
    const equipped = { ...(this.state.equipped ?? {}) };
    delete equipped[villagerId];
    this.state = { ...this.state, ...(Object.keys(equipped).length > 0 ? { equipped } : {}) };
    if (Object.keys(equipped).length === 0) {
      const next = { ...this.state };
      delete next.equipped;
      this.state = next;
    }
    this.markDirty();
    this.bus!.publish('invalidate.stat', {});
    const lines = [
      `возвращён предмет: ${snap.defId} (тир ${snap.tier}/${Math.round(snap.value)}) — канал inventory.add, inv list точен`,
    ];
    if (snap.sharpening > 0) {
      lines.push(`заточка ${snap.sharpening} не переносится при снятии (канал выдачи с заточкой в корпусе отсутствует — M02/M10 чтение; сила защиты учитывала её по снапшоту)`);
    }
    return ok({ header: `Снаряжение снято: ${villagerName}`, lines });
  }

  // ------------------------------------------------------------ форс рейда (G7, dev)

  /** по стадиям: предвестник → ночь; после разрешения — отказ маркером */
  private forceRaid(): Result<SupplyReceipt> {
    if (!this.ensureOpen()) return err(GATE_MSG);
    this.ensureConstructions();
    const now = this.now();
    const week = raidWeekKeyOf(now);
    const raidAt = raidAtOfWeek(now, this.raidTable!);
    if (this.state.raid?.lastResult?.week === week) {
      const next = nextRaidAfter(now, this.raidTable!);
      return err(
        `рейд недели ${week} уже разрешён (маркер raid.lastResult) — следующее окно: неделя ${next.week}, рейд ~${new Date(next.at).toLocaleString('ru-RU')} (или форс после смены недели: time +7d)`,
      );
    }
    if (now < raidAt && !(this.state.raid?.week === week && this.state.raid?.warned === true)) {
      const warningAt = warningAtOf(raidAt, this.raidTable!);
      this.applyWarning(week, raidAt, warningAt, this.raidTable!.warningLeadHours);
      return ok({
        header: `Форс окна рейда (dev): предвестник — неделя ${week}`,
        lines: [
          `«разведчик видел огни» — событие village.raidWarning в ленте`,
          `рейд-ночь: ${new Date(raidAt).toLocaleString('ru-RU')} — ровно через ${this.raidTable!.warningLeadHours} ч (${new Date(warningAt).toLocaleString('ru-RU')})`,
          `повторный форс — разрешение ночи; витрина — village.raid`,
        ],
      });
    }
    const outcome = this.applyRaidResolution(week, raidAt, now);
    const lines = [
      `защита ${outcome.defense} vs порог ${outcome.threshold} (${outcome.defense >= outcome.threshold ? 'ПОБЕДА' : 'поражение'} — расчёт, не лотерея)`,
    ];
    if (outcome.success) {
      lines.push(`кража: 0 · счастье-строка: +${this.raidTable!.winHappinessBonus} каждому жителю (данные)`);
    } else {
      lines.push(
        `кража: ${outcome.stolenPercent}% склада (капа ≤ ${this.raidTable!.stolen.capPercent}%${outcome.warehouseProtection > 0 ? `, Склад −${outcome.warehouseProtection}%` : ''}) → ${outcome.stolenGold}з (TransactionService village.raidLoss)`,
      );
    }
    lines.push(`событие village.raidResolved {success: ${outcome.success}, stolen: ${outcome.stolenGold}} в ленте; витрина — village.raid`);
    return ok({ header: `Форс ночи рейда (dev): неделя ${week}`, lines });
  }

  // ------------------------------------------------------------ поставка (G3)

  private supply(villagerId: string, itemId: string, qtyArg?: number): Result<SupplyReceipt> {
    if (!this.ensureOpen()) return err(GATE_MSG);
    const def = this.defs.find((d) => d.id === villagerId || d.name === villagerId);
    if (def === undefined) return err(`неизвестный житель: ${villagerId} (village state — реестр жителей)`);
    const live = this.state.villagers[def.id];
    if (live === undefined) return err(`${def.name} ещё не в деревне — ${unlockLine(def)}`);
    if (live.need === undefined) return err(`у ${def.name} сейчас нет потребности`);
    const need = live.need;
    if (needSatisfied(need, live.lastSatisfied)) {
      return err(`потребность ${def.name} уже удовлетворена (${this.today()}) — новая завтра`);
    }
    if (itemId !== need.item) {
      return err(`чужой предмет: ${def.name} просит ${need.item} ×${need.qty}, предложено ${itemId}`);
    }
    const qty = qtyArg === undefined || !Number.isFinite(qtyArg) ? need.qty : Math.floor(qtyArg);
    if (qty < need.qty) {
      return err(`мало: ${def.name} просит ${need.item} ×${need.qty}, предложено ${qty}`);
    }
    const cost = this.isCurrency(itemId)
      ? { t: 'currency' as const, id: itemId as CurrencyId, qty }
      : { t: 'item' as const, defId: itemId, qty };
    const tx = this.transaction!.transact({
      costs: [cost],
      eventId: 'village.supply',
      reason: `поставка ${def.name}: ${itemId} ×${qty}`,
    });
    if (!tx.ok) return err(`поставка не состоялась: ${tx.error}`);
    const xpGain = need.kind === 'weekly' ? this.table!.xp.perWeeklyNeed : this.table!.xp.perDailyNeed;
    const happiness = Math.min(this.table!.happiness.max, live.happiness + this.table!.happiness.gainOnSatisfy);
    this.state = {
      ...this.state,
      xp: this.state.xp + xpGain,
      villagers: {
        ...this.state.villagers,
        [def.id]: { ...live, happiness, lastSatisfied: this.today() },
      },
    };
    this.ensureVillagers();
    this.markDirty();
    this.bus!.publish('invalidate.stat', {});
    const lines = [
      `списано: ${itemId} ×${qty} (TransactionService village.supply)`,
      `XP деревне: +${xpGain} (всего ${this.state.xp}) · счастье ${def.name}: ${live.happiness} → ${happiness}`,
    ];
    const gift = this.rollGift(def.id, happiness);
    if (gift !== null) lines.push(...gift);
    return ok({ header: `Поставка ${def.name}: ${itemId} ×${qty}`, lines });
  }

  /** предмет ИЛИ валюта: нет в каталоге предметов → платёж валютой кошелька */
  private isCurrency(id: string): boolean {
    const items = this.content!.get<Array<{ id: string }>>('items');
    return !items.some((d) => d.id === id);
  }

  // ------------------------------------------------------------ подарки (G7)

  private rollGift(villagerId: string, happiness: number): string[] | null {
    const gifts = this.gifts!;
    const roll01 = (stream: string) => this.rngBus!.rollRange(0, 1, 'uniform', stream);
    const chance = Math.max(0, Math.min(100, chanceOf(gifts, happiness)));
    const roll = roll01('village:gift');
    if (roll * 100 >= chance) return null;
    const pickRoll = roll01('village:gift:pick');
    const qtyRoll = roll01('village:gift:qty');
    const entry = giftEntryByRoll(gifts, pickRoll, qtyRoll);
    if (entry === null) return null;
    if (entry.t === 'currency') {
      const tx = this.transaction!.transact({
        grants: [{ t: 'currency', id: entry.id as CurrencyId, qty: entry.qty }],
        eventId: 'village.gift',
        reason: `подарок деревни (${villagerId})`,
      });
      if (!tx.ok) return [`подарок не вручён: ${tx.error}`];
      return [`подарок деревни: ${entry.id} ×${entry.qty} (шанс ${Math.round(chance * 10) / 10}% при счастье ${happiness} — RngBus village:gift)`];
    }
    const probe = this.deps.canAcquireItem(entry.id, entry.qty);
    if (!probe.fits) {
      return [`подарок (${entry.id} ×${entry.qty}) не поместился — инвентарь полон (D23-поба: свободно ${probe.free})`];
    }
    const r = this.deps.giveItem(entry.id, entry.tier ?? 'C', entry.value ?? 50, entry.qty, 'village.gift');
    if (!r.ok) return [`подарок не вручён: ${r.error}`];
    return [`подарок деревни: ${entry.id} ×${entry.qty}${entry.tier !== undefined ? ` (тир ${entry.tier})` : ''} (шанс ${Math.round(chance * 10) / 10}% при счастье ${happiness} — RngBus village:gift)`];
  }

  // ------------------------------------------------------------ помощь (G8)

  private help(): Result<HelpReceipt> {
    if (!this.ensureOpen()) return err(GATE_MSG);
    const today = this.today();
    if (this.state.helpLastDay === today) {
      return err('помощь уже была сегодня (раз в день; снова — после смены дня)');
    }
    const live = this.defs.filter((d) => this.state.villagers[d.id] !== undefined);
    const r = runVillageHelp(live, this.helpTable!, {
      views: this.deps.views,
      hasTask: (type) => this.tasksRef !== null && this.tasksRef.has(type),
      runTask: (type, params, workerId) =>
        this.tasksRef!.runTask(type, { now: this.now(), workerId, params }) as Result<unknown>,
      roll01: (stream) => this.rngBus!.rollRange(0, 1, 'uniform', stream),
      withVillagerEnergy: (run) => this.deps.withVillagerEnergy(run),
    });
    if (!r.ok) return r;
    this.state = { ...this.state, helpLastDay: today };
    this.markDirty();
    return r;
  }

  // ------------------------------------------------------------ dev (форс дня)

  private forceDay(): SupplyReceipt {
    if (!this.ensureOpen()) {
      return {
        header: 'Деревня заперта (dev-форс не выполнен)',
        lines: ['гейт: уровень 30 + ачивка «Мастер хутора» (village state — условия)'],
      };
    }
    const dateISO = this.today();
    const pass = dayPass(this.state, this.defs, this.unlockPass, {
      saveId: () => this.deps.saveId(),
      pools: this.pools!,
      table: this.table!,
    }, dateISO, true);
    this.state = pass.state;
    let taxLine = 'налог: день уже собран (маркеры need.day — идемпотентность)';
    if (pass.taxGold !== 0) {
      const gold = Math.max(0, this.resolveTax());
      if (gold > 0) {
        const tx = this.transaction!.transact({
          grants: [{ t: 'currency', id: 'gold', qty: gold }],
          eventId: 'village.tax',
          reason: `налог деревни за ${dateISO} (dev-форс дня)`,
        });
        if (tx.ok) {
          this.bus!.publish('village.taxCollected', {
            dateISO,
            gold,
            level: this.villageLevel(),
            grumblers: pass.grumblersAfter.length,
          });
          taxLine = `налог собран: ${gold}з (village.taxCollected · TransactionService village.tax)`;
        } else {
          taxLine = `налог не начислен: ${tx.error}`;
        }
      } else {
        taxLine = 'налог дня: 0з (резолв шины — моды дали ноль)';
      }
    }
    this.markDirty();
    this.bus!.publish('invalidate.stat', {});
    return {
      header: `Форс дня деревни (dev): ${dateISO}`,
      lines: [
        `потребности перекатаны (жителей обработано: ${Object.keys(pass.state.villagers).length})`,
        taxLine,
        'ворчуны после прохода: ' + (pass.grumblersAfter.length > 0 ? pass.grumblersAfter.join(', ') : 'нет'),
      ],
    };
  }
}

function chanceOf(gifts: VillageGiftsTable, happiness: number): number {
  const h = Math.max(0, Math.min(100, happiness));
  if (h >= gifts.happinessPivot) {
    const span = 100 - gifts.happinessPivot;
    return gifts.chanceBasePercent + (gifts.chanceHappinessBonusPercent * (h - gifts.happinessPivot)) / span;
  }
  return gifts.chanceBasePercent - (gifts.chanceHappinessMalusPercent * (gifts.happinessPivot - h)) / gifts.happinessPivot;
}

function unlockLine(def: VillagerDef): string {
  const c = def.unlock;
  if (c === undefined) return 'открыт всегда';
  if (c.t === 'statAtLeast' && c.stat === 'village.level') return `уровень деревни ${c.value}`;
  return 'условие unlock';
}

function tierRank(tier: string): number {
  const i = QUALITY_TIERS.indexOf(tier as QualityTier);
  return i < 0 ? 0 : i;
}

function effectLineOf(def: VillageBuildingDef, level: number, houseBonusNow: number): string {
  const eff = def.levels[level - 1]!.effect;
  switch (def.kind) {
    case 'house':
      return `+${eff} к unlock-скидке жителей (следующий из 12 доступен уровнем ниже; скидка станет ${eff}, сейчас ${houseBonusNow})`;
    case 'warehouse':
      return `защита склада ${eff}% от кражи рейда`;
    case 'forge':
      return `цена починки −${eff}% (полцены на ур.3; источник 04-DISCOUNTS §2.2)`;
    case 'market':
      return `−${eff}% у деревенских купцов (потребитель — биржа M16.3)`;
    case 'defense':
      return `+${eff} к защите деревни от рейда`;
    case 'happiness':
      return `счастье-аура +${eff} к среднему счастью налога`;
    default:
      return String(eff);
  }
}
