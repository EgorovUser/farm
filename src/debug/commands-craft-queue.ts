/**
 * Команды модуля M09 «Крафт», часть 2 (карточка §6): операции очереди —
 * craft.queue add <id> (канон постановки), craft.make <id> [−1..+1],
 * craft.queue [станция] (витрина очередей/готового буфера), craft.collect,
 * craft.cancel, craft.repair. Витрины рецептов/станций — commands-craft.ts.
 */
import type { CommandRegistry } from './console-types';

type R<T> = { ok: true; value: T } | { ok: false; error: string };

interface QueueRow {
  station: string;
  queueLength: number;
  batches: Array<{ id: string; recipeId: string; started: boolean; endsAt: number | null }>;
  ready: number;
}

interface ReadyRow {
  id: string;
  recipeId: string;
  station: string;
  completedAt: number;
  quality: { tier: string; value: number };
}

/** [M10.1 · MEL-E AUDIT-M09] причина «endsAt === null» — ДВЕ разных ситуации:
 *  (а) истинная пауза капа — готовый буфер станции полон (ready ≥ readyCap);
 *  (б) партия стоит в очереди ЗА работающей (старт цепочкой после неё).
 *  Механика/состояние не меняются — различается только текст (П6). */
function queueWaitText(
  api: Record<string, (...args: unknown[]) => unknown>,
  ctx: { game: { content: { get<T>(key: string): T }; time: { now(): number } } },
  station: string,
): string {
  const table = ctx.game.content.get<{ queue: { readyCap: number } }>('craft');
  const readyCap = table?.queue.readyCap ?? 6;
  const ready = (api['craft.ready']() as ReadyRow[]).filter((r) => r.station === station).length;
  if (ready >= readyCap) {
    return 'станция на паузе — готовый буфер полон (craft.collect)';
  }
  const rows = api['craft.queue'](station) as QueueRow[];
  const now = ctx.game.time.now();
  const running = rows[0]?.batches.find((b) => b.started && b.endsAt !== null && b.endsAt > now);
  return running
    ? `встала в очередь за работающей партией ${running.id} (старт после её завершения)`
    : 'встала в очередь (старт при ближайшем досчёте)';
}

export function registerCraftQueueCommands(registry: CommandRegistry): void {
  registry.register({
    name: 'craft.queue add',
    usage: 'craft.queue add <id рецепта>',
    description: 'поставить партию в очередь (энергия + входы — атомарно; синоним craft.make)',
    run(args, ctx) {
      const api = ctx.game.modules.get('craft')?.api;
      if (!api) return ctx.printErr('модуль крафта не активен');
      const id = args[0];
      if (!id) return ctx.printErr('укажите рецепт: craft.queue add wb_planks (витрина — craft.list)');
      const r = api['craft.make'](id) as R<{
        batchId: string;
        recipeId: string;
        station: string;
        endsAt: number | null;
        energyCost: number;
      }>;
      if (!r.ok) return ctx.printErr(r.error);
      const when = r.value.endsAt !== null
        ? `готово в ${new Date(r.value.endsAt).toLocaleTimeString('ru-RU')}`
        : queueWaitText(api, ctx, r.value.station);
      ctx.printOk(`партия ${r.value.batchId} встала в очередь «${r.value.station}» (энергия −${r.value.energyCost}) · ${when}`);
      ctx.refresh();
    },
  });

  registry.register({
    name: 'craft.make',
    usage: 'craft.make <id> [−1..+1]',
    description: 'поставить партию (как craft.queue add) с поправкой мини-игры (auto = 0)',
    run(args, ctx) {
      const api = ctx.game.modules.get('craft')?.api;
      if (!api) return ctx.printErr('модуль крафта не активен');
      const id = args[0];
      if (!id) return ctx.printErr('укажите рецепт: craft.make wb_planks (витрина — craft.list)');
      const adj = Number(args[1]) || 0;
      const r = api['craft.make'](id, adj) as R<{
        batchId: string;
        recipeId: string;
        station: string;
        endsAt: number | null;
        energyCost: number;
      }>;
      if (!r.ok) return ctx.printErr(r.error);
      const when = r.value.endsAt !== null
        ? `готово в ${new Date(r.value.endsAt).toLocaleTimeString('ru-RU')}`
        : queueWaitText(api, ctx, r.value.station);
      ctx.printOk(`партия ${r.value.batchId} в очереди «${r.value.station}» (энергия −${r.value.energyCost}${adj !== 0 ? `, мини-игра ${adj > 0 ? '+' : ''}${adj}` : ''}) · ${when}`);
      ctx.refresh();
    },
  });

  registry.register({
    name: 'craft.queue',
    usage: 'craft.queue [станция]',
    description: 'очереди станций и готовый буфер (сбор — craft.collect)',
    run(args, ctx) {
      const api = ctx.game.modules.get('craft')?.api;
      if (!api) return ctx.printErr('модуль крафта не активен');
      const rows = api['craft.queue'](args[0]) as unknown as QueueRow[];
      const ready = api['craft.ready']() as unknown as ReadyRow[];
      const now = ctx.game.time.now();
      if (rows.length === 0 && ready.length === 0) {
        ctx.print('очереди пусты · готового буфера нет (craft.list — рецепты)');
        return;
      }
      ctx.printTitle(`Очереди крафта · готово к сбору: ${ready.length}`);
      for (const row of rows) {
        ctx.print(`${row.station} · очередь ${row.batches.length}/${row.queueLength} · готово ${row.ready}:`);
        for (const b of row.batches) {
          const left = b.endsAt !== null ? Math.max(0, Math.ceil((b.endsAt - now) / 1000)) : null;
          const state = b.started ? (left !== null && left > 0 ? `осталось ${left}с` : 'завершается') : 'ожидает';
          ctx.print(`  ${b.id.padEnd(10)} ${b.recipeId.padEnd(18)} ${state}`);
        }
      }
      if (ready.length > 0) {
        ctx.print('Готовый буфер:');
        for (const r of ready) {
          ctx.print(`  ${r.id.padEnd(10)} ${r.recipeId.padEnd(18)} качество ${r.quality.tier} (${r.quality.value})`);
        }
      }
      ctx.print('сбор: craft.collect [batchId] · отмена: craft.cancel <batchId>');
    },
  });

  registry.register({
    name: 'craft.collect',
    usage: 'craft.collect [batchId]',
    description: 'собрать готовые партии (выдача с качеством; gear — с ривен-роллами)',
    run(args, ctx) {
      const api = ctx.game.modules.get('craft')?.api;
      if (!api) return ctx.printErr('модуль крафта не активен');
      const r = api['craft.collect'](args[0]) as R<{
        collected: Array<{ batchId: string; defId: string; qty: number; quality: { tier: string; value: number }; iids?: string[] }>;
        skipped: Array<{ batchId: string; reason: string }>;
      }>;
      if (!r.ok) return ctx.printErr(r.error);
      for (const c of r.value.collected) {
        const name = ctx.game.content.tryItem(c.defId)?.name ?? c.defId;
        const iids = c.iids && c.iids.length > 0 ? ` · записи: ${c.iids.join(', ')}` : '';
        ctx.printOk(`собрано: ${name} ×${c.qty} (качество ${c.quality.tier}, ${c.quality.value})${iids}`);
      }
      for (const s of r.value.skipped) {
        ctx.printWarn(`партия ${s.batchId} пропущена: ${s.reason}`);
      }
      ctx.refresh();
    },
  });

  registry.register({
    name: 'craft.cancel',
    usage: 'craft.cancel <batchId>',
    description: 'отменить партию: возврат входов за вычетом 10% (эргия не возвращается)',
    run(args, ctx) {
      const api = ctx.game.modules.get('craft')?.api;
      if (!api) return ctx.printErr('модуль крафта не активен');
      const id = args[0];
      if (!id) return ctx.printErr('укажите партию: craft.cancel craft:1 (витрина — craft.queue)');
      const r = api['craft.cancel'](id) as R<{ batchId: string; recipeId: string; refunds: Array<{ defId: string; qty: number }> }>;
      if (!r.ok) return ctx.printErr(r.error);
      const refunds = r.value.refunds.length > 0
        ? r.value.refunds.map((x) => `${x.defId}×${x.qty}`).join(', ')
        : 'нечего возвращать (10% съела мелочь)';
      ctx.printOk(`партия ${r.value.batchId} (${r.value.recipeId}) отменена · возврат: ${refunds}`);
      ctx.refresh();
    },
  });

  registry.register({
    name: 'craft.repair',
    usage: 'craft.repair <iid>',
    description: 'ремонт на наковальне: 10% базовой цены + ремонтный набор',
    run(args, ctx) {
      const api = ctx.game.modules.get('craft')?.api;
      if (!api) return ctx.printErr('модуль крафта не активен');
      const iid = args[0];
      if (!iid) return ctx.printErr('укажите предмет: craft.repair iron_pickaxe#1 (витрина — inv list)');
      const r = api['craft.repair'](iid) as R<{
        iid: string;
        defId: string;
        goldCost: number;
        kits: number;
        durability: { current: number; max: number };
      }>;
      if (!r.ok) return ctx.printErr(r.error);
      const name = ctx.game.content.tryItem(r.value.defId)?.name ?? r.value.defId;
      ctx.printOk(
        `отремонтировано: ${name} — прочность ${r.value.durability.current}/${r.value.durability.max} (−${r.value.goldCost} золота, −${r.value.kits} ремнабор)`,
      );
      ctx.refresh();
    },
  });
}
