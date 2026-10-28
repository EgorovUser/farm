/**
 * Команды модуля M14 «Пассивки» (бриф F7, 02-BUSES §12): passives points /
 * tree / alloc <id> / refund <id|all> / canreach <id> / reset (dev).
 * Регистрация — console.ts после mine. Доступ — только через ModuleRegistry
 * (П4). canreach — витрина publicApi passives.canReach (F3).
 */
import type { CommandRegistry, CommandContext } from './console-types';

type R<T> = { ok: true; value: T } | { ok: false; error: string };

interface ViewShape {
  header: string;
  lines: string[];
}

function printView(ctx: CommandContext, r: R<ViewShape>): void {
  if (!r.ok) {
    ctx.printErr(r.error);
    return;
  }
  ctx.printTitle(r.value.header);
  for (const line of r.value.lines) {
    ctx.print(`  ${line}`);
  }
}

export function registerPassivesCommands(registry: CommandRegistry): void {
  registry.register({
    name: 'passives',
    usage: 'passives <points|tree|alloc|refund|canreach|reset> [аргументы]',
    description:
      'дерево пассивок: очки (ретро/уровни/боссы/ачивки) / текстовая витрина дерева / выделение узла / респек (узел|all) / достижимость BFS / dev-сброс (карточка M14 §5, бриф F7)',
    run(args, ctx) {
      const api = ctx.game.modules.get('passives')?.api;
      if (!api) return ctx.printErr('модуль пассивок не активен');
      const sub = args[0];
      if (sub === 'points' || sub === undefined) {
        printView(ctx, { ok: true, value: api['passives.state']() as ViewShape });
        return;
      }
      if (sub === 'tree') {
        const v = api['passives.tree']() as ViewShape;
        printView(ctx, { ok: true, value: v });
        return;
      }
      if (sub === 'alloc') {
        if (args[1] === undefined) {
          return ctx.printErr('укажите узел: passives alloc <id> (реестр — passives tree)');
        }
        printView(ctx, api['passives.alloc'](args[1]) as R<ViewShape>);
        ctx.refresh();
        return;
      }
      if (sub === 'refund') {
        if (args[1] === undefined) {
          return ctx.printErr('укажите узел или all: passives refund <id|all> (платно, золото)');
        }
        printView(ctx, api['passives.refund'](args[1]) as R<ViewShape>);
        ctx.refresh();
        return;
      }
      if (sub === 'canreach') {
        if (args[1] === undefined) {
          return ctx.printErr('укажите узел: passives canreach <id> (BFS от выделенных)');
        }
        printView(ctx, api['passives.canReach'](args[1]) as R<ViewShape>);
        return;
      }
      if (sub === 'reset') {
        printView(ctx, { ok: true, value: api['passives.reset']() as ViewShape });
        ctx.refresh();
        return;
      }
      return ctx.printErr('подкоманда: points | tree | alloc <id> | refund <id|all> | canreach <id> | reset');
    },
  });
}
