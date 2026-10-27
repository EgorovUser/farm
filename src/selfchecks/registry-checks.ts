/**
 * Self-checks «Реестр» (сеанс REG-1): живой обзор buildRegistryOverview —
 * авто-расширяемые списки (модули M01–M15 / шины / сервисы / команды /
 * контент) БЕЗ ручных таблиц. Инварианты:
 *  - манифест каждого смонтированного модуля декларирует title формата
 *    'M\\d\\d …' (M-номер по ROADMAP 00-README §2) — уникальный, сортировка
 *    витрин по нему тотальна;
 *  - обзор согласован со СВОИМИ живыми источниками (ModuleRegistry,
 *    интроспекция шин Фазы 0, поля инстанса Game, реестр команд консоли,
 *    ContentRegistry) — nothing duplicated by hand;
 *  - команды группируются по префиксу, сумма групп = total.
 *
 * getCommandRegistry подтягивается ДИНАМИЧЕСКИ: статический импорт создал бы
 * цикл runner → registry-checks → console → commands-core → runner
 * (commands-core импортирует runAllSelfChecks для команды selftest).
 */
import { buildRegistryOverview } from '@/debug/registry-overview';
import { makePlayerGame } from './player-fixture';
import { check, group, type CheckGroup, type CheckResult } from './types';

export async function runRegistryChecks(): Promise<CheckGroup> {
  const results: CheckResult[] = [];
  const { getCommandRegistry } = await import('@/debug/console');
  const f = makePlayerGame();
  const commands = getCommandRegistry().list();
  const o = buildRegistryOverview(f.game, commands);

  // 1. title есть у всех манифестов и имеет формат M-номера ROADMAP
  const titles = o.modules.map((m) => m.title);
  results.push(
    check(
      `манифесты всех модулей (${o.modules.length}) декларируют title формата «M\\d\\d имя» (M-номер ROADMAP — в манифесте при рождении, нигде больше)`,
      () => o.modules.every((m) => /^M\d{2} /.test(m.title) && m.title.length > 4),
      { expected: `${o.modules.length} × /^M\\d{2} /`, actual: `${titles.filter((t) => /^M\d{2} /.test(t)).length} × формат` },
    ),
  );

  // 2. уникальность + тотальная сортировка по title (витрины modules/registry)
  const sorted = [...titles].sort((a, b) => a.localeCompare(b));
  results.push(
    check(
      'title уникальны и сортируемы: обзор идёт по возрастанию M-номеров, дублей нет',
      () => new Set(titles).size === titles.length && JSON.stringify(titles) === JSON.stringify(sorted),
      { expected: `${titles.length} уникальных по возрастанию`, actual: `${new Set(titles).size} уникальных` },
    ),
  );

  // 3. разделы непустые и согласованы по размеру с реестром модулей
  const mountedCount = f.game.modules.list().length;
  results.push(
    check(
      `разделы живые: модулей = реестру (${mountedCount}); сервисы ≥ 10, команд = реестру консоли (${commands.length}), контент ≥ 20 таблиц, статов ≥ 50`,
      () =>
        o.modules.length === mountedCount &&
        o.services.length >= 10 &&
        o.commands.total === commands.length &&
        o.content.tables.length >= 20 &&
        o.buses.statBus.stats >= 50,
      {
        expected: `модули ${mountedCount}; команды ${commands.length}`,
        actual: `модули ${o.modules.length}; команды ${o.commands.total}; сервисы ${o.services.length}; таблицы ${o.content.tables.length}; статы ${o.buses.statBus.stats}`,
      },
    ),
  );

  // 4. агрегат событий = манифестам (уникальные имена по всем модулям)
  const manifestEvents = [
    ...new Set(f.game.modules.list().flatMap((m) => [...(m.manifest.eventsPublished ?? [])])),
  ].sort();
  results.push(
    check(
      `события манифестов = агрегату обзора (${manifestEvents.length} уникальных имён; шина: ${o.buses.eventBus.subscribedEventNames.length} имён с живыми подписками, ${o.buses.eventBus.subscriptionsTotal} подписок)`,
      () => JSON.stringify(o.manifestEvents) === JSON.stringify(manifestEvents),
      { expected: `${manifestEvents.length} имён`, actual: `${o.manifestEvents.length} имён` },
    ),
  );

  // 5. шины согласованы с живыми API Фазы 0
  results.push(
    check(
      `шины = живой интроспекции: StatBus статов ${f.game.statBus.listStats().length} / провайдеров ${f.game.statBus.providerIds().length}; RngBus таблиц ${f.game.rngBus.tableIds().length}; PriceBus провайдеров ${f.game.priceBus.providerIds().length}; EventBus имена = eventNames()`,
      () =>
        o.buses.statBus.stats === f.game.statBus.listStats().length &&
        o.buses.statBus.providers.length === f.game.statBus.providerIds().length &&
        JSON.stringify(o.buses.rngBus.tables) === JSON.stringify([...f.game.rngBus.tableIds()].sort()) &&
        o.buses.priceBus.providers.length === f.game.priceBus.providerIds().length &&
        JSON.stringify(o.buses.eventBus.subscribedEventNames) === JSON.stringify(f.game.bus.eventNames()),
      { expected: 'статы/таблицы/имена — байт-в-байт', actual: `статы ${o.buses.statBus.stats}; таблицы ${o.buses.rngBus.tables.length}` },
    ),
  );

  // 6. сервисы = объектные поля инстанса Game; контрактные сервисы 02-BUSES видны
  const serviceKeys = o.services.map((s) => s.key);
  const kernelServices = ['buffs', 'wallet', 'stash', 'pity', 'stats', 'tasks', 'transaction', 'time', 'save', 'content'];
  results.push(
    check(
      `сервисы/координаторы (${o.services.length}) — поля инстанса Game с именами классов; контрактные сервисы 02-BUSES на месте: ${kernelServices.join(', ')}`,
      () =>
        o.services.every((s) => s.className.length > 0) &&
        kernelServices.every((k) => serviceKeys.includes(k)),
      { expected: kernelServices.length + ' контрактных ключей', actual: `${serviceKeys.length} полей` },
    ),
  );

  // 7. команды: сумма групп = total, есть группа ядра, группы отсортированы
  const groupSum = o.commands.groups.reduce((acc, g) => acc + g.count, 0);
  const descSorted = o.commands.groups.every(
    (g, i) => i === 0 || o.commands.groups[i - 1].count >= g.count,
  );
  results.push(
    check(
      `команды (${o.commands.total}): сумма групп = total (${groupSum}), группа «(ядро)» присутствует, группы по убыванию`,
      () => groupSum === o.commands.total && o.commands.groups.some((g) => g.prefix === '(ядро)') && descSorted,
      { expected: `сумма ${o.commands.total}`, actual: `сумма ${groupSum}; групп ${o.commands.groups.length}` },
    ),
  );

  f.dispose();
  return group('Реестр · живой обзор (registry)', results);
}
