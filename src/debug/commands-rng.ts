/**
 * Команды рандома и сервисов: roll, roll.range, roll.log, pity, counters, tasks.
 */
import type { CommandRegistry } from './console-types';
import type { RangeCurve } from '@/shared/utils/rng';

export function registerRngCommands(registry: CommandRegistry): void {
  registry.register({
    name: 'roll',
    usage: 'roll <tableId> [n]',
    description: 'ролл из таблицы с удачей + честные шансы (П6)',
    run(args, ctx) {
      const tableId = args[0];
      if (!tableId) {
        const ids = ctx.game.rngBus.tableIds();
        return ctx.printErr(`укажите таблицу: roll demo.loot. Доступны: ${ids.join(', ')}`);
      }
      const table = ctx.game.rngBus.getTable(tableId);
      if (!table) return ctx.printErr(`таблица "${tableId}" не найдена`);

      const chances = ctx.game.rngBus.chances(tableId, ctx.game.time.ctx('player'));
      ctx.printTitle(`Таблица ${tableId}${table.luckStat ? ` (удача: ${table.luckStat})` : ''}`);
      ctx.print('  шансы:');
      for (const c of chances) {
        ctx.print(`    ${c.id.padEnd(16)} вес ${String(c.weight).padStart(4)}  →  ${c.chancePercent.toFixed(1)}%`);
      }

      const n = Math.min(Math.max(1, Number(args[1]) || 1), 100);
      const results: Record<string, number> = {};
      for (let i = 0; i < n; i++) {
        const pick = ctx.game.rngBus.rollTable(tableId, ctx.game.time.ctx('player'));
        if (pick) results[pick] = (results[pick] ?? 0) + 1;
      }
      ctx.print(`  роллы ×${n}: ${Object.entries(results).map(([k, v]) => `${k}×${v}`).join(' · ')}`);
      ctx.refresh();
    },
  });

  registry.register({
    name: 'roll.range',
    usage: 'roll.range <min> <max> [uniform|tri|pow]',
    description: 'ролл диапазона с кривой распределения',
    run(args, ctx) {
      const min = Number(args[0]);
      const max = Number(args[1]);
      if (!Number.isFinite(min) || !Number.isFinite(max) || min >= max) {
        return ctx.printErr('формат: roll.range 10 20 pow');
      }
      const curve = (args[2] === 'tri' ? 'triangular' : args[2] === 'pow' ? 'power' : 'uniform') as RangeCurve;
      const values = Array.from({ length: 5 }, () =>
        ctx.game.rngBus.rollRange(min, max, curve, 'debug.range', ctx.game.time.ctx('player')),
      );
      ctx.printOk(`roll.range ${min}..${max} (${curve}): ${values.map((v) => v.toFixed(1)).join(', ')}`);
    },
  });

  registry.register({
    name: 'roll.log',
    usage: 'roll.log [n]',
    description: 'журнал роллов, влияющих на игрока',
    run(args, ctx) {
      const n = Math.min(Number(args[0]) || 10, 50);
      const entries = ctx.game.rngBus.rollLog().list().slice(-n).reverse();
      if (entries.length === 0) return ctx.print('журнал пуст — сделайте roll');
      ctx.printTitle(`Журнал роллов (последние ${entries.length})`);
      for (const e of entries) {
        ctx.print(
          // [OBS-4 AUDIT-M05.1 · M05.2 §1.3] колонка source: именованные стримы
          // (farm:harvest:*, farm:weeds:*, shop:issue:N…) видны игроку (П6)
          `  ${new Date(e.at).toLocaleTimeString('ru-RU')}  ${e.kind.padEnd(6)} ${e.source.padEnd(22)} ${e.input.padEnd(22)} → ${e.output.padEnd(12)} luck ${e.luck}`,
        );
        if (e.detail) ctx.print(`      ${e.detail}`);
      }
    },
  });

  registry.register({
    name: 'pity',
    usage: 'pity show | pity bump <owner> <key> [шаг] | pity reset <owner> <key>',
    description: 'счётчики жалости (PityService)',
    run(args, ctx) {
      const [sub, owner, key, stepRaw] = args;
      switch (sub) {
        case 'bump': {
          if (!owner || !key) return ctx.printErr('формат: pity bump player forge.fail 1');
          const step = Number(stepRaw) || 1;
          const v = ctx.game.pity.bump(owner, key, step);
          ctx.printOk(`pity[${owner}|${key}] = ${v}`);
          ctx.refresh();
          return;
        }
        case 'reset': {
          if (!owner || !key) return ctx.printErr('формат: pity reset player forge.fail');
          ctx.game.pity.reset(owner, key);
          ctx.printOk(`pity[${owner}|${key}] сброшен`);
          ctx.refresh();
          return;
        }
        case 'show':
        default: {
          const entries = ctx.game.pity.entries();
          if (entries.length === 0) return ctx.print('счётчиков жалости нет');
          ctx.printTitle(`Pity (${entries.length})`);
          for (const e of entries) {
            ctx.print(`  ${e.ownerId.padEnd(16)} ${e.key.padEnd(20)} = ${e.value}`);
          }
        }
      }
    },
  });

  registry.register({
    name: 'counters',
    usage: 'counters [префикс]',
    description: 'счётчики ядра (StatsService)',
    run(args, ctx) {
      const prefix = args[0];
      const snapshot = ctx.game.stats.snapshot().filter((s) => !prefix || s.id.startsWith(prefix));
      if (snapshot.length === 0) return ctx.print('счётчиков нет');
      ctx.printTitle(`Счётчики${prefix ? ` (${prefix}*)` : ''} (${snapshot.length})`);
      for (const s of snapshot) {
        ctx.print(`  ${s.id.padEnd(36)} ${s.value}`);
      }
    },
  });

  registry.register({
    name: 'tasks',
    usage: 'tasks list | tasks run <taskId>',
    description: 'реестр исполнителей (TaskRegistry)',
    run(args, ctx) {
      const [sub, taskId] = args;
      if (sub === 'run') {
        if (!taskId) return ctx.printErr('формат: tasks run farm.water');
        const r = ctx.game.tasks.runTask(taskId, { now: ctx.game.time.now() });
        if (!r.ok) return ctx.printErr(r.error);
        ctx.printOk(`исполнитель "${taskId}" выполнен${r.value?.message ? `: ${String(r.value.message)}` : ''}`);
        ctx.refresh();
        return;
      }
      const list = ctx.game.tasks.list();
      if (list.length === 0) {
        return ctx.print('исполнителей нет — модули фазы 3+ зарегистрируют farm.*, pen.*, lake.*');
      }
      ctx.printTitle(`Реестр задач (${list.length})`);
      for (const t of list) {
        ctx.print(`  ${t.id.padEnd(24)} ${t.label ?? ''}`);
      }
    },
  });
}
