/**
 * bootstrap — сборка ядра в запускаемое состояние (01-CORE §5, слой app).
 * Порядок важен: контент → шины → сервисы → сейв → координаторы.
 * Ядро не знает ни одной игры: все числа — из content/.
 */
import { Clock, DebugClock } from '@/kernel/di/clock';
import { EventBus } from '@/kernel/bus/event-bus/event-bus';
import { StatBus } from '@/kernel/bus/stat-bus/stat-bus';
import { PriceBus } from '@/kernel/bus/price-bus/price-bus';
import { RngBus } from '@/kernel/bus/rng-bus/rng-bus';
import { RollLog } from '@/kernel/bus/rng-bus/roll-log';
import { BuffService } from '@/kernel/services/buff/buff-service';
import { WalletService } from '@/kernel/services/wallet/wallet-service';
import { SimpleStash } from '@/kernel/services/item-stash/simple-stash';
import { PityService } from '@/kernel/services/pity/pity-service';
import { StatsService } from '@/kernel/services/stats/stats-service';
import { TaskRegistry } from '@/kernel/services/task-registry/task-registry';
import { TransactionService } from '@/kernel/services/transaction/transaction-service';
import { TimeService } from '@/kernel/time/time-service';
import { OfflineCatchup, type OfflineReport } from '@/kernel/time/offline-catchup';
import { SaveDirector } from '@/kernel/save/save-director';
import { createStorage, type SaveStorage } from '@/kernel/save/storage-drivers';
import { ContentRegistry } from '@/kernel/content/content-registry';
import { dailySeed } from '@/shared/utils/rng';
import { QUALITY_TIERS } from '@/shared/types/ids';
import { registerContent } from './content-registration';
// [M02] таблица качества — производная от balance/inventory.ts (веса тиров)
import { INVENTORY_TABLE } from '@/content/balance/inventory';
import { GameDirector } from './game-director';
import { ModuleRegistry, type ModuleContext } from './module-registry';
// [M04.1] монтаж модулей (регистрация + активация + колбэки app-слоя) —
// module-wiring.ts (01 §6: bootstrap превысил 300 строк при касании M04.1)
import { wireGameModules } from './module-wiring';
import { SeedSync } from './seed-sync';
import { advanceGameTime, initGame, wireFocusReconcile, type FocusReconciler } from './game-init';

export interface Game {
  clock: Clock;
  bus: EventBus;
  content: ContentRegistry;
  statBus: StatBus;
  priceBus: PriceBus;
  rngBus: RngBus;
  buffs: BuffService;
  wallet: WalletService;
  stash: SimpleStash;
  pity: PityService;
  stats: StatsService;
  tasks: TaskRegistry;
  transaction: TransactionService;
  time: TimeService;
  catchUp: (from: number, to: number) => OfflineReport;
  /** debug: сдвинуть отладочные часы и прогнать оффлайн-досчёт */
  advanceTime(ms: number): { advancedMs: number; report: OfflineReport | null };
  /** [FIX-0.1 D] пересев под текущую дату часов (после капнутого досчёта) */
  syncSeedToClock(): void;
  save: SaveDirector;
  modules: ModuleRegistry;
  director: GameDirector;
  init(): Promise<{ fresh: boolean; offlineReport: OfflineReport | null }>;
  dispose(): void;
}

export function createGame(
  clock: Clock = new DebugClock(),
  storage: SaveStorage = createStorage(),
): Game {
  // --- контент (валидация при старте: битый = отказ с указанием таблицы)
  const content = new ContentRegistry();
  registerContent(content);

  // --- шины
  const bus = new EventBus();
  const statBus = new StatBus(content);
  const buffs = new BuffService(bus);
  statBus.registerProvider(buffs);
  const priceBus = new PriceBus(content.economy());

  // --- сейв (saveId нужен сиду рандома — создаём до RngBus)
  const timeConfig = content.time();
  // [M05.1 · F2 · MEL-B] прод-подключение каналов выгрузки ЯВНО (DI, без
  // неявных фолбэков в ядре — изоляция self-checkов): pagehide слушается на
  // window (реальная выгрузка диспатчит событие туда), panic-снимок пишет
  // синхронно в localStorage (переживает unload там, где IndexedDB-транзакция
  // из pagehide не выживает — живой факт приёмки). panic подключается ТОЛЬКО
  // к персистентному драйверу (indexeddb/localstorage): чеки на MemoryStorage
  // не должны видеть реальный localStorage живой страницы (roundtrip-фикстуры
  // ловили «свежий» panic-снимок живой игры — 6 красных браузерного selftest);
  // в headless оба канала не задаются
  const hasWindow = typeof window !== 'undefined';
  const persistent = storage.kind === 'indexeddb' || storage.kind === 'localstorage';
  const save = new SaveDirector({
    storage,
    bus,
    now: () => clock.now(),
    contentVersion: content.contentVersion,
    autosaveMs: timeConfig.autosaveMs,
    ...(hasWindow ? { pagehideTarget: window } : {}),
    ...(hasWindow && persistent && window.localStorage ? { panicStore: window.localStorage } : {}),
  });

  // --- время (нужно до RngBus: сид дня считается по локальной дате часов)
  const time = new TimeService(clock, bus, timeConfig);
  const catchUpService = new OfflineCatchup(bus, timeConfig);

  const rollLog = new RollLog(content.rng().rollLogCap);
  // [M02] таблица тиров качества — производная от balance/inventory.ts
  // (единственный источник весов, П2), монтируется в RngBus: ролл логируется,
  // шансы видны через chances() (П6). В rollTables контента не дублируется.
  const rollTables = new Map(content.rollTables().map((t) => [t.id, t] as const));
  rollTables.set('inventory.quality', {
    id: 'inventory.quality',
    entries: QUALITY_TIERS.map((tier) => ({ id: tier, weight: INVENTORY_TABLE.qualityWeights[tier] })),
  });
  // [FIX-0.1 D] сид шины = dailySeed(saveId + дата), не hash(saveId) навсегда:
  // ротации дня (магазин/доска/биржа/daily-квесты) привязаны к дате (02-BUSES §6)
  const rngBus = new RngBus({
    seed: dailySeed(save.getSaveId(), time.localDateISO(clock.now())),
    statBus,
    tables: rollTables,
    log: rollLog,
  });

  // --- сервисы
  const wallet = new WalletService();
  const stash = new SimpleStash();
  const pity = new PityService();
  const stats = new StatsService();
  const tasks = new TaskRegistry();
  const transaction = new TransactionService({
    wallet,
    items: stash,
    bus,
    now: () => clock.now(),
  });

  // --- срезы сейва ядра
  save.registerSlice('kernel.wallet', {
    save: () => wallet.saveState(),
    load: (d) => wallet.loadState(d),
  });
  save.registerSlice('kernel.stash', {
    save: () => stash.saveState(),
    load: (d) => stash.loadState(d),
  });
  save.registerSlice('kernel.pity', {
    save: () => pity.saveState(),
    load: (d) => pity.loadState(d),
  });
  save.registerSlice('kernel.stats', {
    save: () => stats.saveState(),
    load: (d) => stats.loadState(d),
  });
  save.registerSlice('kernel.buff', {
    save: () => buffs.saveState(),
    load: (d) => buffs.loadState(d),
  });
  // [FIX-0.1 H] смещение отладочных часов в сейве: `time +5h` + баф 10м + F5
  // раньше давали «осталось 605ч» (offset терялся, expiresAt остаётся сдвинутым)
  save.registerSlice('kernel.clock', {
    save: () => ({ offsetMs: clock instanceof DebugClock ? clock.offset : 0 }),
    load: (d) => {
      if (clock instanceof DebugClock && d && typeof d === 'object') {
        const offset = (d as { offsetMs?: unknown }).offsetMs;
        if (typeof offset === 'number' && Number.isFinite(offset)) clock.setOffset(offset);
      }
    },
  });

  // --- кэши шин: до конца тика или invalidate (02-BUSES §3)
  bus.subscribe('invalidate.stat', () => statBus.clearCache());
  bus.subscribe('time.minuteTick', () => statBus.clearCache());
  bus.subscribe('invalidate.price', () => priceBus.clearCache());

  // --- демонстрационные счётчики ядра (счётчики живут на событиях)
  bus.subscribe('wallet.transaction', () => stats.bump('kernel.transactions.total'));
  bus.subscribe('time.hourTick', () => stats.bump('kernel.time.hours'));
  bus.subscribe('time.dayTick', () => stats.bump('kernel.time.days'));

  // --- истёкшие бафы убираются на тике
  const offTickSweep = time.onTick(() => buffs.sweep(time.now()));

  // [FIX-M01 · D13б] reconcile при возврате вкладки (монтаж — в init-цепочке,
  // после initGame; снятие — в dispose)
  let focusReconcile: FocusReconciler | null = null;

  // [FIX-0.1 D] смена дня → пересев рандома. Подписка ЖИВЁТ в app-слое (bootstrap),
  // НЕ в ядре. [M01] логика пересева — SeedSync (game/seed-sync.ts, DEBT-15)
  const seedSync = new SeedSync({
    setSeed: (seed) => rngBus.setSeed(seed),
    saveId: () => save.getSaveId(),
    dateISO: (now) => time.localDateISO(now),
    now: () => clock.now(),
  });
  bus.subscribe('time.dayTick', (p) => seedSync.onDayTick((p as { dateISO?: string }).dateISO));

  // --- координаторы
  const modules = new ModuleRegistry();
  const moduleContext: ModuleContext = {
    bus,
    statBus,
    priceBus,
    rngBus,
    pity,
    stats,
    tasks,
    transaction,
    time,
    content,
    save,
  };
  const director = new GameDirector(modules, moduleContext);

  // --- модули M01–M09: регистрация + активация + колбэки app-слоя (П4)
  wireGameModules(director, modules, content, save, wallet);

  const game: Game = {
    clock,
    bus,
    content,
    statBus,
    priceBus,
    rngBus,
    buffs,
    wallet,
    stash,
    pity,
    stats,
    tasks,
    transaction,
    time,
    catchUp: (from, to) => catchUpService.run(from, to),
    advanceTime: (ms) => advanceGameTime(game, ms),
    syncSeedToClock: () => seedSync.syncToClock(),
    save,
    modules,
    director,
    init: () =>
      initGame(game)
        .then((r) => {
          // [FIX-M01 · D13б] reconcile при возврате вкладки — монтируется ПОСЛЕ
          // initGame (watermark = момент, до которого всё обработано холодным
          // досчётом). ??= — повторный init не дублирует подписку.
          focusReconcile ??= wireFocusReconcile(game);
          return r;
        })
        .finally(() => {
          time.start();
          save.startAutosave();
        }),
    dispose: () => {
      focusReconcile?.dispose();
      focusReconcile = null;
      offTickSweep();
      time.stop();
      save.stopAutosave();
      void save.save();
    },
  };
  return game;
}

