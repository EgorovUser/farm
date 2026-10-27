/**
 * ShopModule (M04) — «Магазин с ежедневной ротацией» (фаза 2).
 * M04.1: ротация §2 (детерминизм dailySeed, скидки завоза 5–50% в PriceBus,
 * количество 1..5, люкс, постоянные заказы, базовый ассортимент) + покупка §5
 * (гейты §4, атомарность, C4-роллы при выдаче) + прокачка §3 (XP/уровень,
 * ветви в состоянии) + провайдеры §6.
 * M04.2: ветви §3 — покупка уровней за золото (BranchService: стоимости из
 * branches, эффекты — со следующего завоза [DECISION], скупка — reuse M02).
 *
 * Каналы app-слоя (прецеденты D33/D38, П4 — модуль никого не импортирует):
 * deliverItem → inventory.acquire; probeCapacity → inventory.canAcquire;
 * rollItem → modforge.rollItem (именованный стрим shop:issue:N); applyRolls →
 * inventory.setRolls; gateExtras → player.ctxExtras; saveId — сид ротации.
 *
 * Ротация: dayTick (§2 «пересчёт при первом dayTick») + ленивый ensureStock
 * (холодная загрузка/пропущенный день — сток гарантирован при любом доступе;
 * идемпотентно: та же дата — пропуск). Событие shop.rotated — на каждой
 * ротации (время старта завоза — таймер UI).
 *
 * DEBT-8 (ратифицировано): самоподключение в activate() — легальная конвенция
 * до авто-монтажа координаторами.
 */
import type { GameModule, ModuleContext } from '@/game/module-registry';
import type { ShopTable } from '@/content/balance/shop';
import type { ShopPoolEntry } from '@/content/shopPool';
import type { ItemDef } from '@/content/items/items';
import type { ID } from '@/shared/types/ids';
import type { Result } from '@/shared/types/result';
import { err } from '@/shared/types/result';
import type { RolledModEntry } from '@/shared/types/rolled-mod';
import { createShopManifest } from './manifest';
import { defaultShopState, shopSaveSlice, type ShopState } from './state';
import { rotateStock, type RotationDeps } from './rotation';
import { PurchaseService, type BuyReceipt, type DeliverReceipt } from './purchase';
import { ShopProgression } from './progression';
import { BranchService, type BranchReceipt, type BranchViewRow } from './branches';
import { ShopBranchProvider, ShopLevelProvider, ShopStockProvider } from './providers';

/** колбэки app-слоя: выдача/роллы/гейты (bootstrap вайрит через ModuleRegistry) */
export interface ShopModuleDeps {
  /** inventory.acquire (D23; source='shop.buy') */
  deliverItem?(defId: ID, qty: number, source: string): Result<DeliverReceipt>;
  /** inventory.canAcquire — проба вместимости до оплаты (D23-канон) */
  probeCapacity?(defId: ID, qty: number): Result<{ fits: boolean; free: number; newEntries: number }>;
  /** modforge.rollItem(defId, streamKey) — стартовые роллы покупки (C4) */
  rollItem?(defId: ID, streamKey: string): Result<{ rolls: RolledModEntry[] }>;
  /** inventory.setRolls — применение партии роллов (C4) */
  applyRolls?(iid: ID, rolls: RolledModEntry[]): Result<unknown>;
  /** player.ctxExtras — уровень/навыки для гейтов §4 (прецедент M02.2) */
  gateExtras?(): Record<string, unknown>;
  /** счётчик предметов для hasItem-условий гейтов (inventory.count) */
  itemCount?(defId: ID): number;
  /** saveId сейва — основа детерминизма ротации (карточка §2) */
  saveId?(): string;
}

export class ShopModule implements GameModule {
  readonly manifest: GameModule['manifest'] = createShopManifest();

  private state: ShopState = defaultShopState();
  private readonly moduleDeps: ShopModuleDeps;
  private issueCounter = 0;
  private purchase: PurchaseService | null = null;
  private progression: ShopProgression | null = null;
  private branchService: BranchService | null = null;
  private rotationDeps: RotationDeps | null = null;
  private unsubs: Array<() => void> = [];
  private attachedPriceBus: { unregisterProvider(id: string): void } | null = null;
  private attachedStatBus: { unregisterProvider(id: string): void } | null = null;

  /** публичный API для других модулей — только через ModuleRegistry (П4) */
  api: Record<string, (...args: unknown[]) => unknown> = {};

  constructor(deps: ShopModuleDeps = {}) {
    this.moduleDeps = deps;
  }

  activate(ctx: ModuleContext): void {
    const { bus, statBus, priceBus, transaction, time, save, content } = ctx;
    const table = content.get<ShopTable>('shop');
    const pool = content.get<ShopPoolEntry[]>('shop.pool');
    const tryItem = (defId: ID): ItemDef | undefined =>
      content.get<ItemDef[]>('items').find((d) => d.id === defId);

    save.registerSlice(
      'shop',
      shopSaveSlice(
        () => this.state,
        (s) => {
          this.state = s;
        },
      ),
    );

    const rotationDeps: RotationDeps = {
      table,
      pool,
      tryItem,
      statBus,
      ctx: () => time.ctx('player'),
      saveId: () => this.moduleDeps.saveId?.() ?? '',
      getState: () => this.state,
    };
    this.rotationDeps = rotationDeps;

    // --- ротация (§2): dayTick нового дня + событие завоза + invalidate.price
    const rotate = (dateISO: string): void => {
      const stock = rotateStock(rotationDeps, dateISO);
      this.state = { ...this.state, stock };
      save.markDirty();
      bus.publish('shop.rotated', {
        dateISO,
        startedAt: time.now(),
        entries: stock.entries.length,
        base: stock.entries.filter((e) => e.base).length,
        rolled: stock.entries.filter((e) => !e.base && !e.pinned).length,
      });
      bus.publish('invalidate.price', {});
    };
    const ensureStock = (): void => {
      const today = time.localDateISO(time.now());
      if (this.state.stock?.dateISO !== today) rotate(today);
    };
    this.unsubs = [
      bus.subscribe('time.dayTick', (p) => {
        const dateISO = (p as { dateISO?: string }).dateISO ?? time.localDateISO(time.now());
        if (this.state.stock?.dateISO !== dateISO) rotate(dateISO);
      }),
    ];

    // --- прокачка §3: XP за покупку — слушателем события (карточка §5)
    const progression = new ShopProgression({
      table,
      getState: () => this.state,
      setState: (s) => {
        this.state = s;
      },
      markDirty: () => save.markDirty(),
      // уровень изменился → скидка уровня новая → кэш цен сбросить (04-DISCOUNTS §6)
      invalidate: () => bus.publish('invalidate.price', {}),
    });
    this.progression = progression;
    this.unsubs.push(
      bus.subscribe('shop.purchased', () => {
        progression.addXp(table.level.xpPerPurchase);
      }),
    );

    // --- покупка §5 (C4-каналы — колбэки app-слоя)
    const purchase = new PurchaseService({
      table,
      pool,
      tryItem,
      priceBus,
      transaction,
      bus,
      statBus,
      ctx: () => time.ctx('player'),
      priceCtx: () => ({ buyer: 'player', now: time.now() }),
      gateExtras: () => this.moduleDeps.gateExtras?.() ?? {},
      itemCount: (defId) => this.moduleDeps.itemCount?.(defId) ?? 0,
      getState: () => this.state,
      setState: (s) => {
        this.state = s;
      },
      markDirty: () => save.markDirty(),
      ensureStock,
      issueSeq: () => ++this.issueCounter,
      ...(this.moduleDeps.deliverItem ? { deliverItem: this.moduleDeps.deliverItem } : {}),
      ...(this.moduleDeps.probeCapacity ? { probeCapacity: this.moduleDeps.probeCapacity } : {}),
      ...(this.moduleDeps.rollItem ? { rollItem: this.moduleDeps.rollItem } : {}),
      ...(this.moduleDeps.applyRolls ? { applyRolls: this.moduleDeps.applyRolls } : {}),
    });
    this.purchase = purchase;

    // --- ветви §3 (M04.2): покупка уровней за золото; домен закрепления —
    //     доступный пул (availablePool: открытые полки + выборы ассортимента)
    const branchService = new BranchService({
      table,
      rotationDeps,
      transaction,
      bus,
      getState: () => this.state,
      setState: (s) => {
        this.state = s;
      },
      markDirty: () => save.markDirty(),
    });
    this.branchService = branchService;

    // --- провайдеры §6: скидки — PriceBus (04-DISCOUNTS), ветки — StatBus
    const stockProvider = new ShopStockProvider({ getState: () => this.state });
    const levelProvider = new ShopLevelProvider({ table, getState: () => this.state });
    const branchProvider = new ShopBranchProvider({ getState: () => this.state });
    priceBus.registerProvider(stockProvider);
    priceBus.registerProvider(levelProvider);
    statBus.registerProvider(branchProvider);
    this.attachedPriceBus = priceBus;
    this.attachedStatBus = statBus;

    this.api = {
      'shop.ensureStock': (): void => ensureStock(),
      'shop.stock': (): ShopState['stock'] => this.state.stock,
      'shop.buy': (id: unknown, qty?: unknown): Result<BuyReceipt> =>
        purchase.buy(String(id), Number(qty) || 1),
      // debug §6: пересоздать завоз сегодняшнего дня (свежий снапшот ротации:
      // отличие от текущего стока = покупки текущего дня и/или уровень/ветки;
      // на нетронутом стоке того же дня — байт-в-байт, детерминизм dailySeed)
      'shop.reroll': (): { dateISO: string; changed: boolean } => {
        const today = time.localDateISO(time.now());
        const before = JSON.stringify(this.state.stock);
        rotate(today);
        return { dateISO: today, changed: before !== JSON.stringify(this.state.stock) };
      },
      // debug §6: уровень магазина (живой рост — только покупками)
      'shop.levelup': (n?: unknown): number => progression.addLevels(Number(n) || 1),
      'shop.view': (): Record<string, unknown> => ({
        level: this.state.level,
        xp: this.state.xp,
        xpToNext: progression.xpToNext(this.state.level),
        branches: { ...this.state.branches },
        levelDiscountPercent: levelProvider.currentPercent(),
        dateISO: this.state.stock?.dateISO ?? null,
      }),
      // --- M04.2: ветви §3 — витрина и покупка уровней за золото
      'shop.branch.view': (): BranchViewRow[] => branchService.view(),
      'shop.branch.buy': (name: unknown, pick?: unknown): Result<BranchReceipt> => {
        if (typeof name !== 'string' || !name) {
          return err('укажите ветку: shop.branch.buy <имя> [выбор] (витрина — shop.branch)');
        }
        return branchService.buy(name, typeof pick === 'string' && pick ? pick : undefined);
      },
    };
  }

  deactivate(): void {
    for (const off of this.unsubs) off();
    this.unsubs = [];
    this.attachedPriceBus?.unregisterProvider('shop.stock');
    this.attachedPriceBus?.unregisterProvider('shop.level');
    this.attachedStatBus?.unregisterProvider('shop.branches');
    this.attachedPriceBus = null;
    this.attachedStatBus = null;
    this.purchase = null;
    this.progression = null;
    this.branchService = null;
    this.rotationDeps = null;
    this.api = {};
  }
}
