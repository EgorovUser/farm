/**
 * Команды модификаторов: mod add/list/remove/clear (02-BUSES §12).
 * [FIX-0.1 C] mod add принимает суффикс-ключи [prio=N] [group=X] [tag=T] —
 * ручные пробы priority/stackGroup/тегов из консоли (MISS-5 аудита).
 */
import type { CommandRegistry } from './console-types';
import { OP_LABELS_RU } from '@/content/locale/ru';
import type { Op } from '@/shared/types/ids';
import type { Modifier } from '@/kernel/bus/stat-bus/modifier';
import { formatDuration, parseDurationToMs } from '@/shared/utils/format';

export function registerModCommands(registry: CommandRegistry): void {
  registry.register({
    name: 'mod add',
    usage: 'mod add <stat> <flat|inc|more|override|cap> <value> [срок 10m|2h|1d] [prio=N] [group=X] [tag=T,...]',
    description: 'выдать временный баф через BuffService (ядро модификаторов)',
    run(args, ctx) {
      const [stat, op, valueRaw] = args;
      if (!stat || !op || !valueRaw) {
        return ctx.printErr('формат: mod add player.energy.max flat 20 10m [prio=10] [group=g1] [tag=fishing]');
      }
      const ops: Op[] = ['flat', 'inc', 'more', 'override', 'cap'];
      if (!ops.includes(op as Op)) return ctx.printErr(`операция должна быть одной из: ${ops.join(', ')}`);
      const value = Number(valueRaw);
      if (!Number.isFinite(value)) return ctx.printErr('value должно быть числом');

      // [FIX-0.1 C] суффикс-ключи [prio=N] [group=X] [tag=T]; срок — как раньше
      let durationRaw = '';
      let duration: Modifier['duration'] | undefined;
      let tags: string[] | undefined;
      let priority: number | undefined;
      let stackGroup: string | undefined;
      for (const token of args.slice(3)) {
        let m = /^\[prio=(-?\d+)\]$/.exec(token);
        if (m) {
          priority = Number(m[1]);
          continue;
        }
        m = /^\[group=([A-Za-z0-9_:.-]+)\]$/.exec(token);
        if (m) {
          stackGroup = m[1];
          continue;
        }
        m = /^\[tag=([A-Za-z0-9_,:.-]+)\]$/.exec(token);
        if (m) {
          tags = [...(tags ?? []), ...m[1].split(',')];
          continue;
        }
        if (duration === undefined && parseDurationToMs(token) !== null) {
          const ms = parseDurationToMs(token);
          if (ms === null) return ctx.printErr('срок не разобран, примеры: 45s, 10m, 2h, 1d');
          durationRaw = token;
          duration = { kind: 'seconds', value: Math.round(ms / 1000) };
          continue;
        }
        if (token.includes('+')) {
          tags = [...(tags ?? []), ...token.split('+')];
          continue;
        }
        return ctx.printErr(`аргумент "${token}" не разобран — ключи: [prio=N] [group=X] [tag=T], срок: 10m/2h/1d`);
      }

      const now = ctx.game.time.now();
      const mod: Modifier = {
        id: `debug.${stat}.${op}.${Math.random().toString(36).slice(2, 7)}`,
        source: { kind: 'buff', refId: 'debug.console' },
        stat,
        op: op as Op,
        value,
        label: 'debug-баф из консоли',
      };
      if (tags) mod.tags = tags;
      if (priority !== undefined) mod.priority = priority;
      if (stackGroup) mod.stackGroup = stackGroup;
      if (duration) mod.duration = duration;
      const r = ctx.game.buffs.add(mod, now);
      if (!r.ok) return ctx.printErr(r.error);
      const keys = [
        durationRaw ? `на ${durationRaw}` : 'бессрочно',
        priority !== undefined ? `prio ${priority}` : '',
        stackGroup ? `группа ${stackGroup}` : '',
        tags?.length ? `теги [${tags.join(',')}]` : '',
      ]
        .filter(Boolean)
        .join(', ');
      ctx.printOk(`баф ${r.value} выдан: ${stat} ${op} ${value} (${keys})`);
      ctx.refresh();
    },
  });

  registry.register({
    name: 'mod list',
    usage: 'mod list',
    description: 'активные бафы BuffService',
    run(_args, ctx) {
      const list = ctx.game.buffs.list();
      if (list.length === 0) return ctx.print('активных бафов нет');
      ctx.printTitle(`Активные бафы (${list.length})`);
      for (const e of list) {
        // [FIX-0.1 G] runs-бафы без expiresAt — «до конца забега», не «бессрочно»
        const left =
          e.mod.duration?.kind === 'runs'
            ? 'до конца забега'
            : e.mod.expiresAt
              ? `осталось ${formatDuration(e.mod.expiresAt - ctx.game.time.now())}`
              : 'бессрочно';
        const tags = e.mod.tags?.length ? ` теги:[${e.mod.tags.join(',')}]` : '';
        const keys = [
          e.mod.priority !== undefined ? `prio ${e.mod.priority}` : '',
          e.mod.stackGroup ? `группа ${e.mod.stackGroup}` : '',
        ]
          .filter(Boolean)
          .join(' · ');
        ctx.print(
          `  ${e.mod.id.padEnd(40)} ${e.mod.stat} ${e.mod.op} ${e.mod.value}  ${left}${keys ? ` · ${keys}` : ''}${tags}`,
        );
      }
    },
  });

  registry.register({
    name: 'mod remove',
    usage: 'mod remove <id>',
    description: 'снять баф по id',
    run(args, ctx) {
      const id = args[0];
      if (!id) return ctx.printErr('укажите id бафа (см. mod list)');
      if (ctx.game.buffs.remove(id)) {
        ctx.printOk(`баф ${id} снят`);
        ctx.refresh();
      } else {
        ctx.printErr(`баф ${id} не найден`);
      }
    },
  });

  registry.register({
    name: 'mod clear',
    usage: 'mod clear',
    description: 'снять все бафы',
    run(_args, ctx) {
      const n = ctx.game.buffs.list().length;
      ctx.game.buffs.clear();
      ctx.printOk(`снято бафов: ${n}`);
      ctx.refresh();
    },
  });
}
