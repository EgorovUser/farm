/**
 * Живой реестр игры — агрегатор для команды `registry` и self-группы «Реестр»
 * (сеанс REG-1: «динамический авто-расширяемый список — команд/шин/сервисов/
 * модулей M01–M15/контента — чтобы не заносить вручную»).
 *
 * ЧИСТАЯ функция от живых рантайм-реестров (паттерн resolveFight M12.1):
 * ни одной ручной таблицы-списка. Новый модуль/команда/сервис/таблица
 * появляются в обзоре САМИ в момент регистрации:
 *  - модули — ModuleRegistry.list() (манифест = единственная декларация,
 *    01-CORE §9; title с M-номером декларируется при рождении модуля);
 *  - шины — живая интроспекция Фазы 0 (eventNames/subscriberCount/
 *    listStats/providerIds/tableIds); состав четырёх шин — замороженный
 *    контракт 02-BUSES (растёт наполнение, не набор);
 *  - сервисы — собственные поля инстанса Game (Object.entries — новый
 *    сервис ядра виден без правок здесь);
 *  - команды — реестр консоли (те же данные, что в help/подсказках);
 *  - контент — ContentRegistry.tableNames() (03-DATA §11).
 *
 * Сортировка модулей — по title (M01…M15 лексикографически), фолбэк — id.
 */
import type { Game } from '@/game/bootstrap';
import type { ConsoleCommand } from './console-types';

/** Строка раздела «Модули»: всё — из манифеста, ничего не дублируется */
export interface RegistryModuleRow {
  id: string;
  /** manifest.title (M-номер по ROADMAP), фолбэк — id */
  title: string;
  version: string;
  active: boolean;
  stateKey: string;
  apiCount: number;
  published: string[];
  subscribedCount: number;
  providers: string[];
  priceProviders: string[];
  executors: string[];
  counters: string[];
}

export interface RegistryOverview {
  modules: RegistryModuleRow[];
  /** уникальные имена событий, декларированные манифестами (агрегат) */
  manifestEvents: string[];
  buses: {
    /** имена событий с ≥1 живой подпиской + общее число подписок */
    eventBus: { subscribedEventNames: string[]; subscriptionsTotal: number };
    statBus: { stats: number; providers: string[] };
    priceBus: { providers: string[] };
    rngBus: { tables: string[] };
  };
  /** объектные поля инстанса Game: ключ + имя класса (авто-расширение) */
  services: Array<{ key: string; className: string }>;
  commands: { total: number; groups: Array<{ prefix: string; count: number }> };
  content: { tables: string[] };
}

/** Сортировка витрин: title с M-номером лексикографически, фолбэк — id */
export function byManifestTitle(
  a: { manifest: { title?: string; id: string } },
  b: { manifest: { title?: string; id: string } },
): number {
  return (a.manifest.title ?? a.manifest.id).localeCompare(b.manifest.title ?? b.manifest.id);
}

export function buildRegistryOverview(game: Game, commands: readonly ConsoleCommand[]): RegistryOverview {
  const mounted = [...game.modules.list()].sort(byManifestTitle);
  const modules: RegistryModuleRow[] = mounted.map((m) => ({
    id: m.manifest.id,
    title: m.manifest.title ?? m.manifest.id,
    version: m.manifest.version,
    active: m.active,
    stateKey: m.manifest.stateKey,
    apiCount: (m.manifest.publicApi ?? []).length,
    published: [...(m.manifest.eventsPublished ?? [])].sort(),
    subscribedCount: (m.manifest.eventsSubscribed ?? []).length,
    providers: [...(m.manifest.modifierProviders ?? [])],
    priceProviders: [...(m.manifest.priceModifierProviders ?? [])],
    executors: [...(m.manifest.taskExecutors ?? [])],
    counters: [...(m.manifest.statsCounters ?? [])],
  }));

  const manifestEvents = [...new Set(modules.flatMap((m) => m.published))].sort();

  const buses = {
    eventBus: {
      subscribedEventNames: [...game.bus.eventNames()],
      subscriptionsTotal: game.bus.subscriberCount(),
    },
    statBus: {
      stats: game.statBus.listStats().length,
      providers: [...game.statBus.providerIds()].sort(),
    },
    priceBus: { providers: [...game.priceBus.providerIds()].sort() },
    rngBus: { tables: [...game.rngBus.tableIds()].sort() },
  };

  // Сервисы/координаторы — собственные объектные поля инстанса Game: функции
  // (init/dispose/…) отсеиваются, класс назван конструктором. Новое поле
  // bootstrap появляется здесь без правок этого файла.
  const services = Object.entries(game).filter(
    ([, v]) =>
      v !== null &&
      typeof v === 'object' &&
      typeof (v as object).constructor?.name === 'string' &&
      (v as object).constructor.name !== 'Object',
  );

  // Команды — группировка по префиксу до первой точки (без точки — ядро);
  // источник тот же реестр, что у help/подсказок ввода.
  const groupCounts = new Map<string, number>();
  for (const c of commands) {
    const prefix = c.name.includes('.') ? c.name.split('.')[0] : '(ядро)';
    groupCounts.set(prefix, (groupCounts.get(prefix) ?? 0) + 1);
  }
  const commandGroups = [...groupCounts.entries()]
    .map(([prefix, count]) => ({ prefix, count }))
    .sort((a, b) => b.count - a.count || a.prefix.localeCompare(b.prefix));

  return {
    modules,
    manifestEvents,
    buses,
    services: services.map(([key, v]) => ({ key, className: (v as object).constructor.name })),
    commands: { total: commands.length, groups: commandGroups },
    content: { tables: game.content.tableNames() },
  };
}
