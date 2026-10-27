/**
 * Команда `registry` — живой реестр игры (сеанс REG-1, запрос спеки:
 * «динамический авто-расширяемый список команд/шин/сервисов/M01–M15/
 * модулей — чтобы не заносить вручную»). Витрина только форматирует
 * агрегатор registry-overview.ts (чистая функция, покрыта self-группой
 * «Реестр»); ни одного ручного списка здесь нет — новые модули/команды/
 * сервисы/таблицы появляются сами.
 */
import type { CommandRegistry, CommandContext } from './console-types';
import { buildRegistryOverview, type RegistryOverview } from './registry-overview';

/** Разделы команды: префикс аргумента → секция (модули|шины|сервисы|команды|контент) */
function sectionOf(arg: string | undefined): 'all' | 'modules' | 'buses' | 'services' | 'commands' | 'content' {
  switch (arg) {
    case undefined:
      return 'all';
    case 'модули':
    case 'модуль':
    case 'modules':
      return 'modules';
    case 'шины':
    case 'шина':
    case 'buses':
      return 'buses';
    case 'сервисы':
    case 'сервис':
    case 'services':
      return 'services';
    case 'команды':
    case 'команда':
    case 'commands':
      return 'commands';
    case 'контент':
    case 'content':
      return 'content';
    default:
      return 'all';
  }
}

/** Строки-«потоки»: элементы по N на строку с отступом (длинные списки читабельны) */
function wrap(items: string[], perLine: number): string[] {
  const lines: string[] = [];
  for (let i = 0; i < items.length; i += perLine) {
    lines.push(items.slice(i, i + perLine).join(' · '));
  }
  return lines;
}

function printModules(o: RegistryOverview, ctx: CommandContext): void {
  ctx.printTitle(`Модули (${o.modules.length}) — манифесты M01–M15, монтаж по ROADMAP`);
  for (const m of o.modules) {
    const active = m.active ? '✓' : '—';
    ctx.print(
      `  ${m.title.padEnd(20)} ${m.id.padEnd(10)} v${m.version.padEnd(6)} ${active}  api ${String(m.apiCount).padStart(3)}  события ${String(m.published.length).padStart(2)}+/${String(m.subscribedCount).padStart(2)}−  провайдеры ${String(m.providers.length + m.priceProviders.length).padStart(2)}  исполнители ${String(m.executors.length).padStart(2)}  срез ${m.stateKey}`,
    );
  }
  ctx.print('  (события X+/Y−: публикаций/подписок манифеста; новый модуль появляется здесь сам)');
}

function printBuses(o: RegistryOverview, ctx: CommandContext): void {
  const eb = o.buses.eventBus;
  ctx.printTitle(`Шины ядра (${o.buses.statBus.stats} статов · ${o.manifestEvents.length} событий манифестов)`);
  ctx.print(`  EventBus   живых подписок ${eb.subscriptionsTotal} по ${eb.subscribedEventNames.length} именам (лента: events)`);
  ctx.print(`  StatBus    статов ${o.buses.statBus.stats} · провайдеров ${o.buses.statBus.providers.length}: ${o.buses.statBus.providers.join(', ') || '—'} (каталог: stats.list)`);
  ctx.print(`  PriceBus   провайдеров цен ${o.buses.priceBus.providers.length}: ${o.buses.priceBus.providers.join(', ') || '—'}`);
  ctx.print(`  RngBus     таблиц роллов ${o.buses.rngBus.tables.length} (журнал: roll log)`);
  ctx.print('  (состав шин — замороженный контракт 02-BUSES; события/провайдеры/таблицы растут сами)');
}

function printServices(o: RegistryOverview, ctx: CommandContext): void {
  ctx.printTitle(`Сервисы и координаторы (${o.services.length} полей инстанса Game)`);
  for (const line of wrap(o.services.map((s) => `${s.key}: ${s.className}`), 4)) {
    ctx.print(`  ${line}`);
  }
  ctx.print('  (перечислены объектные поля Game — новый сервис ядра виден без правок витрины)');
}

function printCommands(o: RegistryOverview, ctx: CommandContext): void {
  ctx.printTitle(`Команды консоли (${o.commands.total}) — полный список: help [фильтр]`);
  const groups = o.commands.groups.map((g) => `${g.prefix} ×${g.count}`);
  for (const line of wrap(groups, 6)) {
    ctx.print(`  ${line}`);
  }
}

function printContent(o: RegistryOverview, ctx: CommandContext): void {
  ctx.printTitle(`Контент-таблицы (${o.content.tables.length}) — реестр 03-DATA §11`);
  for (const line of wrap(o.content.tables, 6)) {
    ctx.print(`  ${line}`);
  }
}

export function registerRegistryCommands(registry: CommandRegistry): void {
  registry.register({
    name: 'registry',
    usage: 'registry [модули|шины|сервисы|команды|контент]',
    description: 'живой реестр: модули M01–M15, шины, сервисы, команды, контент (списки растут сами)',
    run(args, ctx) {
      const section = sectionOf(args[0]);
      if (args[0] !== undefined && section === 'all') {
        return ctx.printErr('раздел не распознан — формат: registry [модули|шины|сервисы|команды|контент]');
      }
      const o = buildRegistryOverview(ctx.game, registry.list());
      if (section === 'all') {
        ctx.printTitle('ЖИВОЙ РЕЕСТР ИГРЫ — все разделы из рантайм-реестров, ничего не ведётся вручную');
      }
      if (section === 'all' || section === 'modules') printModules(o, ctx);
      if (section === 'all' || section === 'buses') printBuses(o, ctx);
      if (section === 'all' || section === 'services') printServices(o, ctx);
      if (section === 'all' || section === 'commands') printCommands(o, ctx);
      if (section === 'all' || section === 'content') printContent(o, ctx);
    },
  });
}
