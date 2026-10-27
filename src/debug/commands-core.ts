/**
 * Команды ядра: help, clear, resolve, stats.list, events, modules, selftest, demo.
 * (02-BUSES §12; mod-команды — в commands-mods.ts)
 */
import type { CommandRegistry } from './console-types';
import { OP_LABELS_RU } from '@/content/locale/ru';
import { runAllSelfChecks, summarize } from '@/selfchecks/runner';
import { parseResolveKeys } from './resolve-keys';
import { byManifestTitle } from './registry-overview';

export function registerCoreCommands(registry: CommandRegistry): void {
  registry.register({
    name: 'help',
    usage: 'help [фильтр]',
    description: 'список команд консоли отладки',
    run(args, ctx) {
      const commands = registry.list().filter((c) => !args[0] || c.name.includes(args[0]) || c.description.includes(args[0]));
      ctx.printTitle(`Команды (${commands.length})`);
      for (const c of commands) {
        ctx.print(`  ${c.usage.padEnd(42)} ${c.description}`);
      }
    },
  });

  registry.register({
    name: 'clear',
    usage: 'clear',
    description: 'очистить консоль',
    run(_args, ctx) {
      ctx.clear();
    },
  });

  registry.register({
    name: 'resolve',
    usage: 'resolve <stat> [tag=t1,t2] [lvl=N] [skill:id=N] [flag=f] [item:defId=N] [ach:id]',
    description: 'полная трассировка стата: база → моды → итог (П6)',
    run(args, ctx) {
      const stat = args[0];
      if (!stat) return ctx.printErr('укажите стат: resolve player.energy.max [tag=fishing] [lvl=5]');
      // [M01 · MISS-4] живые пробы условий: resolve принимает теги и ключи ctx
      // (уровень/навыки/флаги/предметы/ачивки). База extra — реальные значения
      // игрока (player.ctxExtras через ModuleRegistry, П4: не прямой импорт).
      // [FIX-M01 · MISS-7] разбор ключей — чистая функция resolve-keys.ts
      // (покрыта self-проверками); ручные ключи перекрывают ctxExtras.
      const playerExtras = (ctx.game.modules.call('player', 'player.ctxExtras') ?? {}) as Record<string, unknown>;
      const keys = parseResolveKeys(args.slice(1));
      if (!keys.ok) return ctx.printErr(keys.error);
      const tags = keys.value.tags;
      const extra: Record<string, unknown> = { ...playerExtras, ...keys.value.extra };
      const trace = ctx.game.statBus.resolveTrace({ stat, ctx: ctx.game.time.ctx('player', tags, extra) });
      ctx.printTitle(`${stat} = ${trace.final}`);
      ctx.print(`  база: ${trace.base}`);
      if (tags.length > 0) ctx.print(`  теги ctx: [${tags.join(',')}]`);
      ctx.print(`  ctx: уровень ${String(extra['player:level'] ?? 0)}`);
      if (trace.mods.length === 0) {
        ctx.print('  модификаторы: нет');
      } else {
        ctx.print('  модификаторы:');
        for (const m of trace.mods) {
          const label = OP_LABELS_RU[m.op] ?? m.op;
          const mark = m.applied ? '✓' : '✗';
          ctx.print(`    ${mark} ${m.id.padEnd(28)} ${label.padEnd(18)} ${m.value}  [${m.source}]${m.reason ? ` — ${m.reason}` : ''}`);
        }
      }
      if (trace.steps.length > 1) {
        ctx.print('  шаги:');
        for (const s of trace.steps) ctx.print(`    → ${s.label}: ${Number(s.value.toFixed(4))}`);
      }
    },
  });

  registry.register({
    name: 'stats.list',
    usage: 'stats.list',
    description: 'каталог статов: база и текущий резолв',
    run(_args, ctx) {
      const stats = ctx.game.statBus.listStats();
      ctx.printTitle(`Каталог статов (${stats.length})`);
      for (const stat of stats) {
        const trace = ctx.game.statBus.resolveTrace({ stat, ctx: ctx.game.time.ctx('player') });
        // [FIX-0.1 E] «*изменён» = модификаторы изменили значение; чистое округление
        // базы (0.5 → 1 при round) — не изменение, метку не ставим
        const changed = trace.mods.length > 0 && trace.final !== trace.base;
        ctx.print(
          `  ${stat.padEnd(30)} база ${String(trace.base).padStart(6)}  →  ${String(trace.final).padStart(6)}${changed ? '  *изменён' : ''}`,
        );
      }
    },
  });

  registry.register({
    name: 'events',
    usage: 'events [n] | events ticks on|off',
    description: 'последние события EventBus (живая лента)',
    run(args, ctx) {
      // [FIX-0.1 B] переключатель отображения минутных тиков (фильтр только UI-слоя:
      // подписчики EventBus — очистка кэшей шин и пр. — minuteTick получают как раньше)
      if (args[0] === 'ticks') {
        const mode = args[1];
        if (mode !== 'on' && mode !== 'off') {
          return ctx.printErr('формат: events ticks on | events ticks off');
        }
        ctx.setTickFilter(mode === 'on');
        ctx.printOk(
          `минутные тики в ленте: ${mode === 'on' ? 'видны' : 'скрыты'} (подписчики шины не затронуты — фильтр отображения)`,
        );
        ctx.refresh();
        return;
      }
      const n = Math.min(Number(args[0]) || 12, 50);
      const showTicks = ctx.getTickFilter();
      const recent = ctx.game.bus
        .recentEvents()
        .filter((e) => showTicks || e.name !== 'time.minuteTick')
        .slice(-n)
        .reverse();
      if (recent.length === 0) return ctx.print('событий пока не было');
      ctx.printTitle(`Последние события (${recent.length})${showTicks ? '' : ' — минутные тики скрыты (events ticks on)'}`);
      for (const e of recent) {
        const payload = JSON.stringify(e.payload);
        // [OBS-4 AUDIT-M10 · гигиена M15.1] лимит 90 → 200: payload modforge.rolled
        // с target стал виден живьём (аудит M10 проверял его чеками + кодом)
        const short = payload.length > 200 ? `${payload.slice(0, 200)}…` : payload;
        ctx.print(`  ${new Date(e.at).toLocaleTimeString('ru-RU')}  ${e.name.padEnd(22)} ${short}`);
      }
    },
  });

  registry.register({
    name: 'modules',
    usage: 'modules',
    description: 'смонтированные модули M01–M15 (живой реестр, список растёт сам)',
    run(_args, ctx) {
      const list = [...ctx.game.modules.list()].sort(byManifestTitle);
      if (list.length === 0) {
        return ctx.print('модулей пока нет — Фаза 0 строит только ядро (M01 появится в фазе 1)');
      }
      ctx.printTitle(`Модули (${list.length})`);
      for (const m of list) {
        // [REG-1] title манифеста — M-номер по ROADMAP, декларируется при
        // рождении модуля (детали/шины/сервисы/контент — команда registry)
        ctx.print(
          `  ${(m.manifest.title ?? m.manifest.id).padEnd(20)} ${m.manifest.id.padEnd(10)} v${m.manifest.version}  [${m.active ? 'активен' : 'выключен'}]  срез: ${m.manifest.stateKey}`,
        );
      }
    },
  });

  registry.register({
    name: 'selftest',
    usage: 'selftest',
    description: 'runtime-проверки: ядро + модули (группы 02-BUSES §13, карточки модулей, FIX)',
    run(_args, ctx) {
      ctx.printTitle('Self-checks ядра и модулей (02-BUSES §13) — запускаю…');
      void runAllSelfChecks().then((groups) => {
        const s = summarize(groups);
        for (const g of groups) {
          ctx.print(`  ${g.passed ? '✓' : '✗'} ${g.name}: ${g.results.filter((r) => r.passed).length}/${g.results.length}`);
          for (const r of g.results) {
            if (!r.passed) {
              ctx.printErr(`      ✗ ${r.name}${r.expected ? ` (ожидалось: ${r.expected}, факт: ${r.actual})` : ''}`);
            }
          }
        }
        if (s.failed === 0) {
          // [Фаза 3 · дебаг-обновление] безымянная формулировка: группы растут
          // с каждым модулем — перечисление фаз в строке итога устаревало
          ctx.printOk(`ИТОГ: ${s.passed}/${s.total} проверок зелёные — ядро, модули и правки FIX в норме`);
        } else {
          ctx.printErr(`ИТОГ: ${s.failed} красных из ${s.total} — чинить до продолжения`);
        }
        ctx.refresh();
      });
    },
  });

  registerDemoCommand(registry);
}

function registerDemoCommand(registry: CommandRegistry): void {
  registry.register({
    name: 'demo',
    usage: 'demo',
    description: 'сценарий-экскурсия по ядру: шины, цены, роллы, транзакции',
    run(_args, ctx) {
      ctx.printTitle('ЭКСКУРСИЯ ПО ЯДРУ «КОРНИ И РУДА»');
      ctx.print('1) Статы через шину (П3):');
      const energy = ctx.game.statBus.resolveTrace({ stat: 'player.energy.max', ctx: ctx.game.time.ctx('player') });
      ctx.print(`   player.energy.max = ${energy.final} (база ${energy.base})`);
      ctx.print('   → mod add player.energy.max flat 20');
      ctx.game.buffs.add(
        {
          id: 'demo.energy.flat',
          source: { kind: 'buff', refId: 'demo' },
          stat: 'player.energy.max',
          op: 'flat',
          value: 20,
        },
        ctx.game.time.now(),
      );
      const energy2 = ctx.game.statBus.resolveTrace({ stat: 'player.energy.max', ctx: ctx.game.time.ctx('player') });
      ctx.print(`   player.energy.max = ${energy2.final} (баф применён без единой правки базы)`);
      ctx.print('2) Цены через PriceBus (04-DISCOUNTS):');
      const buy = ctx.game.priceBus.buyPrice(ctx.game.content.item('iron_pickaxe'), {
        ctx: { buyer: 'player', now: ctx.game.time.now() },
      });
      ctx.print(`   железная кирка: base ${buy.base} → buy ${buy.final} золота`);
      const sell = ctx.game.priceBus.sellPrice(ctx.game.content.item('iron_pickaxe'), {
        ctx: { buyer: 'player', now: ctx.game.time.now() },
      });
      ctx.print(`   скупка: sell ${sell.final} золота (40% ставки)`);
      ctx.print('3) Роллы через RngBus с удачей:');
      const chances = ctx.game.rngBus.chances('demo.loot', ctx.game.time.ctx('player'));
      ctx.print(`   таблица demo.loot: ${chances.map((c) => `${c.id} ${c.chancePercent.toFixed(1)}%`).join(' · ')}`);
      ctx.print('   → mod add player.luck flat 100');
      ctx.game.buffs.add(
        { id: 'demo.luck', source: { kind: 'buff', refId: 'demo' }, stat: 'player.luck', op: 'flat', value: 100 },
        ctx.game.time.now(),
      );
      const lucky = ctx.game.rngBus.chances('demo.loot', ctx.game.time.ctx('player'));
      ctx.print(`   с удачей +100: ${lucky.map((c) => `${c.id} ${c.chancePercent.toFixed(1)}%`).join(' · ')}`);
      ctx.print('4) Атомарные транзакции:');
      const t = ctx.game.transaction.transact({
        costs: [{ t: 'currency', id: 'gold', qty: 10 }],
        grants: [{ t: 'item', defId: 'seed_turnip', qty: 3 }],
        eventId: 'demo.shop',
        reason: 'демо-покупка',
      });
      ctx.print(t.ok ? '   купил 3 семени репы за 10 золота — списание и выдача атомарны' : `   отказ: ${t.error}`);
      ctx.print('   само ядро — data-driven: все числа вы только что видели в content/balance/');
      ctx.printOk('Экскурсия завершена. Введите help — список всех команд.');
      ctx.refresh();
    },
  });
}
