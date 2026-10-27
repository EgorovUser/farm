/**
 * InventoryModule (M02) — «Инвентарь, экипировка, качество предметов».
 * M02.1: каркас + подмена ItemPort (D17) + хранение + сейв v4 (D18).
 * M02.2: equip/unequip (D21/D30) + гейты требований (карточка §3) +
 * equipmentProvider (карточка §5, D22/D31) + dev-штампы.
 * M02.3: действия над предметом — use (D32) / sell (D34) / wear (D35).
 *
 * ШВЫ (D36 — только документация, кода вызовов НЕТ):
 *  - заточка → M10: будущий вызов ModuleRegistry.get('forging') из app-слоя
 *    (предмет хранит sharpeningLevel и frozenCards — поля готовы с M02.1);
 *  - разобрать → M09: вернуть 25% ресурсов рецепта (рецепты — контент M09);
 *  - подарить → M16: флаг тега `giftable` в ItemDef (вкладка отношений);
 *  - [MEL-2 · AUDIT-M02] planPlacement сливает гранты в ЭКИПИРОВАННУЮ запись
 *    при точном совпадении defId+quality (tier И value) — владельцам M03/M09
 *    учитывать при явных качествах (addWithQuality: миграции/крафт/фикстуры);
 *    фильтр equipped в слияниях — отдельное спека-решение (детали: logic.ts).
 *
 * [M03.3] RollsPort (rolls-port.ts) — ПРОИЗВОДСТВЕННЫЙ канал записи ривен-
 * роллов (карточка §1: «генерирует M03, здесь — хранение и применение»):
 * реролл-цикл M03 и будущие M09/M10 применяют партии через
 * 'inventory.setRolls' (атомарная валидация, fail-closed).
 *
 * DEBT-8 (ратифицировано): самоподключение в activate() — легальная конвенция
 * до авто-монтажа координаторами.
 */
import type { GameModule, ModuleContext } from '@/game/module-registry';
import type { InventoryTable } from '@/content/balance/inventory';
import type { ItemDef } from '@/content/items/items';
import type { ModTypeDef } from '@/content/mods/registry';
import type { RecipeDef } from '@/content/craft/recipes';
import type { CraftTable } from '@/content/balance/craft';
import { createInventoryManifest } from './manifest';
import { inventorySaveSlice } from './state';
import { InventoryStore, type AcquireReceipt } from './store';
import { EquipService, type EquipReceipt } from './equipment';
import { EquipmentProvider } from './provider';
import { DevStamps, type DurReceipt, type StampReceipt } from './devstamps';
import { RollsPort, type SetRollsReceipt } from './rolls-port';
import { UseService, type UseReceipt } from './use';
import { SellService, type SellReceipt } from './sell';
import { SalvageService, type SalvageReceipt } from './salvage';
import { WearService, type WearReceipt } from './wear';
import type { ID, QualityTier } from '@/shared/types/ids';
import { QUALITY_TIERS } from '@/shared/types/ids';
import type { Result } from '@/shared/types/result';
import type { ItemInstance } from './state';

export interface InventoryModuleDeps {
  /** Гейт-контекст требований (§2.4): уровень/навыки игрока. Callback Caller —
   *  app-слой (bootstrap) через ModuleRegistry: player.ctxExtras() — публичный
   *  API M01, прямой импорт модулей запрещён (П4). По умолчанию пусто (гейты
   *  playerLevel/skill дают 0 → требования блокируют, прочие условия работают). */
  gateExtras?(): Record<string, unknown>;
  /** D33-канал эффектов useAction: app-слой (bootstrap) вайрит
   *  player.grantEnergy/grantHp через ModuleRegistry (П4). Без вайринга use
   *  расходника с эффектами отказывает ДО транзакции — предмет не теряется
   *  (fail-closed); в живой игре и selftest канал подключён всегда. */
  applyUseEffect?(t: 'grantEnergy' | 'grantHp', value: number, reason: string): void;
  /** [M10.1 · шов §4.5] множитель базы от заточки — forge.statScale через
   *  ModuleRegistry (П4, прецедент D38/C4). Дефолт 1 — инвариант прежнего
   *  поведения (провайдер не масштабирует). */
  statScaleOf?(iid: ID): number;
  /** [M10.1 · шов §4.5] эффективный тир заточки (R2) для цены продажи —
   *  forge.effectiveTier через ModuleRegistry. Дефолт — тир записи. */
  effectiveTierOf?(iid: ID, tier: QualityTier): QualityTier;
}

export class InventoryModule implements GameModule {
  readonly manifest: GameModule['manifest'] = createInventoryManifest();

  private readonly moduleDeps: InventoryModuleDeps;
  private store: InventoryStore | null = null;
  private attachedTransaction: { setItemPort(items: unknown): void } | null = null;
  private attachedStatBus: { unregisterProvider(id: string): void } | null = null;
  private providerId: string | null = null;

  /** публичный API для других модулей — только через ModuleRegistry (П4) */
  api: Record<string, (...args: unknown[]) => unknown> = {};

  constructor(deps: InventoryModuleDeps = {}) {
    this.moduleDeps = deps;
  }

  activate(ctx: ModuleContext): void {
    const { bus, statBus, priceBus, rngBus, time, save, content, transaction } = ctx;
    const table = content.get<InventoryTable>('inventory');
    const mods = content.get<ModTypeDef[]>('mods');
    // полный lookup def'ов — через валидированную таблицу реестра (01 §7 п.6);
    // tryItem() реестра отдаёт лишь минимальную форму для индексов
    const itemsTable = content.get<ItemDef[]>('items');
    const itemById = new Map(itemsTable.map((d) => [d.id, d]));
    const tryItem = (defId: ID): ItemDef | undefined => itemById.get(defId);

    const store = new InventoryStore({
      table,
      tryItem,
      rngBus,
      statBus,
      bus,
      ctx: () => time.ctx('player'),
      markDirty: () => save.markDirty(),
    });
    this.store = store;

    // [D17] подмена реализации ItemPort: ядро предусматривает точку инъекции
    // (setItemPort, «M02 зарегистрирует полноценный инвентарь»). SimpleStash
    // остаётся фолбэком в ядре (код не тронут); после подмены все гранты/списания
    // предметов через TransactionService попадают в инвентарь.
    transaction.setItemPort(store);
    this.attachedTransaction = transaction;

    // [M02.2] экипировка (D30/D21) + dev-штампы (§2.6)
    const gateExtras = this.moduleDeps.gateExtras ?? (() => ({}));
    const equip = new EquipService({
      table,
      tryItem,
      statBus,
      bus,
      ctx: () => time.ctx('player'),
      gateExtras,
      countAll: (defId) => store.count(defId),
      getState: () => store.getState(),
      setState: (s) => store.setState(s),
      markDirty: () => save.markDirty(),
    });
    const stamps = new DevStamps({
      tryItem,
      mods,
      bus,
      getState: () => store.getState(),
      setState: (s) => store.setState(s),
      markDirty: () => save.markDirty(),
    });

    // [M03.3] производственный канал записи ривен-роллов (шов карточки §1:
    // генерация — M03, хранение/применение — M02; П4 — через ModuleRegistry)
    const rollsPort = new RollsPort({
      tryItem,
      mods,
      bus,
      getState: () => store.getState(),
      setState: (s) => store.setState(s),
      markDirty: () => save.markDirty(),
    });

    // [M02.3] действия над предметом: use (D32) / sell (D34) / wear (D35).
    // Гейт-контекст общий с экипировкой (единый оценщик M02.2); канал грантов
    // D33 — колбэк app-слоя (ModuleRegistry → player, П4: не импорт)
    const gate = {
      statBus,
      ctx: () => time.ctx('player'),
      gateExtras,
      countAll: (defId: ID) => store.count(defId),
    };
    const use = new UseService({
      tryItem,
      transaction,
      bus,
      gate,
      ...(this.moduleDeps.applyUseEffect ? { applyUseEffect: this.moduleDeps.applyUseEffect } : {}),
      getState: () => store.getState(),
      markDirty: () => save.markDirty(),
    });
    const sell = new SellService({
      tryItem,
      priceBus,
      transaction,
      bus,
      priceCtx: () => ({ buyer: 'player', now: time.now() }),
      ...(this.moduleDeps.effectiveTierOf ? { effectiveTierOf: this.moduleDeps.effectiveTierOf } : {}),
      getState: () => store.getState(),
      markDirty: () => save.markDirty(),
    });
    // [FIX-PHASE-2 · 4.7 · SALV-1] «Разобрать»: 25% материалов рецепта M09
    // (рецепты — общий реестр контента, П4 п.г; доля — balance/craft.ts)
    const salvage = new SalvageService({
      recipes: () => content.get<RecipeDef[]>('craft.recipes'),
      salvageShare: () => content.get<CraftTable>('craft').salvage.share,
      tryItem,
      transaction,
      bus,
      getState: () => store.getState(),
      setState: (s) => store.setState(s),
      markDirty: () => save.markDirty(),
    });
    const wear = new WearService({
      tryItem,
      bus,
      getState: () => store.getState(),
      setState: (s) => store.setState(s),
      markDirty: () => save.markDirty(),
    });

    // [M02.2] провайдер модификаторов экипировки (карточка §5): регистрация
    // по манифесту modifierProviders (DEBT-8 — самоподключение до авто-монтажа)
    const provider = new EquipmentProvider({
      getState: () => store.getState(),
      tryItem,
      mods,
      ...(this.moduleDeps.statScaleOf ? { statScaleOf: this.moduleDeps.statScaleOf } : {}),
    });
    statBus.registerProvider(provider);
    this.attachedStatBus = statBus;
    this.providerId = provider.id;

    save.registerSlice(
      'inventory',
      inventorySaveSlice(
        () => store.getState(),
        (s) => store.setState(s),
        { tryItem, table },
      ),
    );

    this.api = {
      'inventory.acquire': (defId: unknown, qty: unknown, source: unknown): Result<AcquireReceipt> =>
        store.acquire(String(defId), Number(qty) || 0, typeof source === 'string' ? source : 'api'),
      'inventory.add': (
        defId: unknown,
        tier: unknown,
        value: unknown,
        qty: unknown,
        source: unknown,
      ): Result<AcquireReceipt> =>
        store.addWithQuality(
          String(defId),
          (QUALITY_TIERS.includes(tier as QualityTier) ? tier : 'D') as QualityTier,
          Number(value) || 0,
          Number(qty) || 0,
          typeof source === 'string' ? source : 'api',
        ),
      'inventory.remove': (defId: unknown, qty: unknown, source: unknown): Result<AcquireReceipt> =>
        store.removeWithEvent(String(defId), Number(qty) || 0, typeof source === 'string' ? source : 'api'),
      'inventory.has': (defId: unknown, qty: unknown): boolean =>
        store.has(String(defId), Number(qty) || 1),
      // [M04.1] проба вместимости до покупки (канон D23-решения store.ts:
      // «потребители транзакционных грантов (магазин M04+) обязаны проверять
      // вместимость до покупки через API модуля»); без мутаций и событий
      'inventory.canAcquire': (
        defId: unknown,
        qty: unknown,
      ): Result<{ newEntries: number; free: number; fits: boolean }> =>
        store.probe(String(defId), Number(qty) || 0),
      'inventory.list': (tab?: unknown): ItemInstance[] =>
        store.list(typeof tab === 'string' && tab ? { tab } : undefined),
      'inventory.info': (): ReturnType<InventoryStore['info']> => store.info(),
      'inventory.clear': (): void => store.clear(),
      // --- M02.2
      'inventory.equip': (iid: unknown, slot: unknown): Result<EquipReceipt> =>
        equip.equip(String(iid), String(slot)),
      'inventory.unequip': (slot: unknown): Result<EquipReceipt> => equip.unequip(String(slot)),
      'inventory.equipped': (): ReturnType<EquipService['equippedView']> => equip.equippedView(),
      'inventory.mod': (iid: unknown, type: unknown, value: unknown): Result<StampReceipt> =>
        stamps.stampMod(String(iid), String(type), Number(value)),
      'inventory.dur': (iid: unknown, n: unknown): Result<DurReceipt> =>
        stamps.setDurability(String(iid), Number(n)),
      // --- M03.3: канал записи ривен-роллов (партия, атомарно; детали — rolls-port.ts).
      // Валидация — в порте: не-массив/битая форма — отказ, НЕ коэрцитивная пустая партия
      'inventory.setRolls': (iid: unknown, rolls: unknown): Result<SetRollsReceipt> =>
        rollsPort.setRolls(String(iid), rolls as unknown[]),
      // --- M02.3: действия над предметом (бриф §2.3–§2.5)
      'inventory.use': (iid: unknown): Result<UseReceipt> => use.use(String(iid)),
      'inventory.sell': (defId: unknown, qty: unknown): Result<SellReceipt> =>
        sell.sell(String(defId), Number(qty)),
      'inventory.salvage': (iid: unknown): Result<SalvageReceipt> => salvage.salvage(iid),
      'inventory.wear': (iid: unknown, n: unknown): Result<WearReceipt> =>
        wear.wear(String(iid), Number(n)),
    };
  }

  deactivate(): void {
    // [DECISION] обратной подмены порта нет: ядро не хранит «прошлый» порт,
    // а деактивация модулей в Фазе 1 не исполняется. Фолбэк-путь SimpleStash
    // живёт в bootstrap (срез kernel.stash зарегистрирован всегда).
    if (this.attachedStatBus && this.providerId) {
      this.attachedStatBus.unregisterProvider(this.providerId);
    }
    this.attachedStatBus = null;
    this.providerId = null;
    this.store = null;
    this.attachedTransaction = null;
    this.api = {};
  }
}
