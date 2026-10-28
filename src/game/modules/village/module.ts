/**
 * VillageModule (M16.1) — гейт + жители/потребности/счастье/налоги/
 * подарки/помощь (карточка M16 §2–§3; брифы G1–G8). Изоляция (01 §5–§7):
 * модуль НЕ импортирует чужие модули — все каналы колбэками app-слоя
 * (deps.ts, паттерн PassivesModule/MineModule).
 *
 * Жизненный цикл (G1): ДО гейта срез не инициализируется (post-wipe
 * тишина — save() → undefined); гейт — Requirement из данных (уровень 30 +
 * флаг ачивки «Мастер хутора»); ПОСЛЕ — ленивая материализация: стартовые
 * жители + ролл их потребностей на сегодня (БЕЗ налога — первый сбор на
 * следующем дневном проходе). День-пас идемпотентен маркерами need.day:
 * повторный dayTick/catchUp того же дня налог НЕ задваивает (G1/G6).
 *
 * Налог (G6): resolve('village.tax.gold') ЧЕРЕЗ ШИНУ (моды провайдера),
 * начисление — TransactionService eventId 'village.tax', событие
 * village.taxCollected (ровно ×1 — каталог 02 §4, строка Task 84).
 * Помощь (G8): village-helper — runTask СУЩЕСТВУЮЩИХ типов (help.ts).
 */
import type { GameModule, ModuleContext } from '@/game/module-registry';
import type {
  VillagerDef,
  VillageGiftsTable,
  VillageHelpTable,
  VillageNeedsTable,
  VillageTable,
  VillageTaxTable,
} from '@/content/village/types';
import { checkCondition } from '@/shared/utils/condition-check';
import { createVillageManifest } from './manifest';
import { defaultVillageState, villageSaveSlice, type VillageState } from './state';
import {
  dayPass,
  giftEntryByRoll,
  needSatisfied,
  rollNeedFor,
  taxInfoOf,
} from './logic';
import { makeVillageProvider, VILLAGE_PROVIDER_ID } from './provider';
import { buildNeedsView, buildVillageStateView } from './view';
import { runVillageHelp, type HelpReceipt } from './help';
import type { VillageModuleDeps } from './deps';
import type { Result } from '@/shared/types/result';
import { err, ok } from '@/shared/types/result';
import type { CurrencyId } from '@/shared/types/ids';

export interface SupplyReceipt {
  header: string;
  lines: string[];
}

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
    this.bus = bus;
    this.transaction = transaction;
    this.statBus = statBus;
    this.time = time;
    this.rngBus = rngBus;
    this.content = content;
    this.tasksRef = tasks;
    this.markDirty = () => save.markDirty();

    save.registerSlice('village', villageSaveSlice(() => this.state, (s) => { this.state = s; }, this.defs));

    statBus.registerProvider(
      makeVillageProvider(() => this.state, this.defs, this.table!, this.taxTable!),
    );

    // подписка манифеста: time.dayTick (налог/ролл потребностей/ворчание;
    // catchUp публикует те же границы — идемпотентность маркерами need.day)
    const offDay = bus.subscribe('time.dayTick', (p) => {
      const payload = p as { dateISO?: string; now?: number };
      const now = typeof payload?.now === 'number' ? payload.now : time.now();
      this.onDayTick(typeof payload?.dateISO === 'string' ? payload.dateISO : time.localDateISO(now));
    });
    this.detachBus = () => {
      offDay();
      statBus.unregisterProvider(VILLAGE_PROVIDER_ID);
    };

    this.api = {
      'village.state': () => this.stateView(),
      'village.need': (id: unknown) => this.needsView(id === undefined ? 'all' : String(id)),
      'village.supply': (id: unknown, item: unknown, qty?: unknown): Result<SupplyReceipt> =>
        this.supply(id === undefined ? '' : String(id), item === undefined ? '' : String(item), qty === undefined ? undefined : Number(qty)),
      'village.help': (): Result<HelpReceipt> => this.help(),
      // dev (бриф §0: форс дня деревни — переролль потребностей + сбор налога;
      // помечен dev, прецеденты lake.force/passives.reset — условия НЕ проверяются)
      'village.force': (): SupplyReceipt => this.forceDay(),
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

  /** ConditionCtx гейтов (гейт модуля + unlock-гейты жителей): stat —
   *  StatBus провайдера (village.level — override), остальное — deps */
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

  private unlockPass = (def: VillagerDef): boolean =>
    def.unlock === undefined || checkCondition(def.unlock, this.gateCtx());

  private today(): string {
    return this.time!.localDateISO(this.time!.now());
  }

  private resolveTax(): number {
    return this.statBus!.resolve({ stat: 'village.tax.gold', ctx: this.time!.ctx('player') });
  }

  /** материализация: гейт прошёл → открытие + стартовые жители + ролл их
   *  потребностей на сегодня (налог НЕ собирается — первый сбор завтра) */
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

  /** присоединение жителей, чей гейт прошёл (уровень деревни вырос) */
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
      // налог: резолв ПОСЛЕ применения состояния — провайдер читает НОВЫЙ день
      const gold = Math.max(0, this.resolveTax());
      if (gold > 0) {
        const tx = this.transaction!.transact({
          grants: [{ t: 'currency', id: 'gold', qty: gold }],
          eventId: 'village.tax',
          reason: `налог деревни за ${dateISO} (уровень/счастье/ворчуны — шина)`,
        });
        if (tx.ok) {
          // событие ×1 манифеста (каталог 02 §4 — строка Task 84)
          this.bus!.publish('village.taxCollected', {
            dateISO,
            gold,
            level: taxInfoOf(this.state, this.defs, this.table!, this.taxTable!).level,
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

  // ------------------------------------------------------------ витрины

  private stateView() {
    this.ensureOpen();
    this.ensureVillagers();
    return buildVillageStateView(this.state, this.defs, this.table!, this.taxTable!, {
      playerLevel: () => this.deps.playerLevel(),
      hasFlag: (f) => this.deps.hasFlag(f),
      resolveTax: () => this.resolveTax(),
      dateISO: () => this.today(),
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

  /** имя предмета/валюты потребности: каталог items → имя; иначе — id как есть
   *  (валюты кошелька — П5 «неизвестное — рядовой случай») */
  private itemName(defId: string): string {
    const items = this.content!.get<Array<{ id: string; name: string }>>('items');
    return items.find((d) => d.id === defId)?.name ?? defId;
  }

  // ------------------------------------------------------------ поставка (G3)

  private supply(villagerId: string, itemId: string, qtyArg?: number): Result<SupplyReceipt> {
    if (!this.ensureOpen()) return err('деревня заперта: уровень 30 + ачивка «Мастер хутора» (village state)');
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
    // XP деревне + счастье (G3)
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
    this.ensureVillagers(); // уровень мог вырасти — присоединение новых
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
    if (!this.ensureOpen()) return err('деревня заперта: уровень 30 + ачивка «Мастер хутора» (village state)');
    const today = this.today();
    if (this.state.helpLastDay === today) {
      return err('помощь уже была сегодня (раз в день; снова — после смены дня)');
    }
    const live = this.defs.filter((d) => this.state.villagers[d.id] !== undefined);
    const r = runVillageHelp(live, this.helpTable!, {
      views: this.deps.views,
      hasTask: (type) => this.tasksRef !== null && this.tasksRef.has(type),
      runTask: (type, params, workerId) =>
        this.tasksRef!.runTask(type, { now: this.time!.now(), workerId, params }) as Result<unknown>,
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
            level: taxInfoOf(this.state, this.defs, this.table!, this.taxTable!).level,
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
