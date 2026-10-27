/**
 * Команды модуля M09 «Крафт» (карточка §6; регистрация — console.ts).
 * craft.list [станция] — витрина рецептов с замками гейтов (П6),
 * craft.recipe <id> — деталь рецепта (входы/выход/время/энергия/гейт),
 * craft.queue [станция] — очереди и готовый буфер, craft.queue add <id> —
 * постановка партии (канон карточки §6; синоним craft.make <id> [−1..+1]),
 * craft.stations/craft.buy — станции и улучшения, craft.collect/craft.cancel —
 * сбор/отмена, craft.repair <iid> — ремонт на наковальне (10% базы + набор).
 */
import type { CommandRegistry, CommandContext } from './console-types';
import type { Game } from '@/game/bootstrap';
import type { RecipeDef } from '@/content/craft/recipes';
import { RARITY_LABELS_RU } from '@/shared/types/ids';

type R<T> = { ok: true; value: T } | { ok: false; error: string };

interface RecipeRow extends RecipeDef {
  locked: boolean;
}

interface StationRow {
  id: string;
  name: string;
  built: boolean;
  costGold: number;
  unlockText: string | null;
  queueLength: number;
  upgrades: Array<{
    id: string;
    name: string;
    costGold: number;
    bought: boolean;
    queueBonus: number;
    unlockText: string | null;
    effectText: string;
  }>;
}

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

/** человекочитаемая строка входа/выхода: имя (id) ×qty · редкость/валюта */
function ioLabel(ctx: CommandContext, defId: string, qty: number, kind?: 'item' | 'currency'): string {
  if (kind === 'currency') return `${defId} ×${qty} (валюта)`;
  const def = (ctx.game as Game).content.tryItem(defId);
  return `${def?.name ?? defId} (${defId}) ×${qty}${def ? ` · ${RARITY_LABELS_RU[def.rarity]}` : ''}`;
}

export function registerCraftCommands(registry: CommandRegistry): void {
  registry.register({
    name: 'craft.list',
    usage: 'craft.list [станция]',
    description: 'рецепты крафта: входы → выход, время, замки гейтов (П6)',
    run(args, ctx) {
      const api = ctx.game.modules.get('craft')?.api;
      if (!api) return ctx.printErr('модуль крафта не активен');
      const station = args[0];
      const rows = api['craft.list'](station) as unknown as RecipeRow[];
      if (rows.length === 0) {
        return ctx.printErr(station ? `станция "${station}" не известна или рецептов нет` : 'рецептов нет');
      }
      const stations = api['craft.stations']() as unknown as StationRow[];
      const built = new Map(stations.filter((s) => s.built).map((s) => [s.id, s.name]));
      ctx.printTitle(`Рецепты крафта · ${rows.length}${station ? ` · станция ${station}` : ''}`);
      let last = '';
      for (const r of rows) {
        if (r.station !== last) {
          last = r.station;
          const st = stations.find((s) => s.id === r.station);
          const mark = built.has(r.station) ? '' : ' 🔒 станция не построена';
          ctx.print(`${st?.name ?? r.station} (${r.station}) · очередь ${st?.queueLength ?? '?'}${mark}:`);
        }
        const inputs = r.inputs.map((i) => `${i.defId}×${i.qty}`).join(' + ');
        const lock = r.locked ? ' 🔒' : '';
        const unlock = r.locked && r.unlock ? ` — ${r.unlock.t === 'playerLevel' ? `Откроется: уровень ${r.unlock.level}` : `гейт ${r.unlock.t}`}` : '';
        ctx.print(`  ${r.id.padEnd(18)} ${inputs} → ${r.output.defId}×${r.output.qty} · ${r.craftSeconds}с${lock}${unlock}`);
      }
      ctx.print('деталь: craft.recipe <id> · постановка: craft.queue add <id> · станции: craft.stations');
    },
  });

  registry.register({
    name: 'craft.recipe',
    usage: 'craft.recipe <id>',
    description: 'деталь рецепта: входы/выход, время, энергия, гейт, эффекты',
    run(args, ctx) {
      const api = ctx.game.modules.get('craft')?.api;
      if (!api) return ctx.printErr('модуль крафта не активен');
      const id = args[0];
      const r = api['craft.recipe'](id) as R<RecipeDef>;
      if (!r.ok) return ctx.printErr(r.error);
      const rows = api['craft.list'](r.value.station) as unknown as RecipeRow[];
      const row = rows.find((x) => x.id === r.value.id);
      ctx.printTitle(`Рецепт ${r.value.id}`);
      ctx.print(`станция: ${r.value.station} · время партии: ${r.value.craftSeconds}с`);
      ctx.print('входы:');
      for (const i of r.value.inputs) ctx.print(`  · ${ioLabel(ctx, i.defId, i.qty)}`);
      ctx.print(`выход: ${ioLabel(ctx, r.value.output.defId, r.value.output.qty)}`);
      const locked = row?.locked ?? false;
      if (r.value.unlock) {
        ctx.print(`гейт: ${locked ? '🔒 ' : '✓ '}${r.value.unlock.t === 'playerLevel' ? `уровень ${r.value.unlock.level}` : r.value.unlock.t}`);
      }
      if (r.value.effects && r.value.effects.length > 0) {
        ctx.print(`эффекты: ${r.value.effects.map((e) => e.label ?? `${e.op} ${e.value} на ${e.stat}`).join('; ')}`);
      }
      ctx.print('запуск: craft.queue add ' + r.value.id);
    },
  });

  registry.register({
    name: 'craft.stations',
    usage: 'craft.stations',
    description: 'станции крафта: постройка/улучшения за золото, длины очередей',
    run(_args, ctx) {
      const api = ctx.game.modules.get('craft')?.api;
      if (!api) return ctx.printErr('модуль крафта не активен');
      const rows = api['craft.stations']() as unknown as StationRow[];
      ctx.printTitle(`Станции крафта · золото: ${ctx.game.wallet.get('gold')}`);
      for (const s of rows) {
        const status = s.built ? `построена · очередь ${s.queueLength}` : `${s.costGold} зол.`;
        const lock = !s.built && s.unlockText ? ` 🔒 ${s.unlockText}` : '';
        ctx.print(`  ${s.name} (${s.id}) — ${status}${lock}`);
        for (const u of s.upgrades) {
          const uStatus = u.bought ? 'куплено' : `${u.costGold} зол.`;
          const uLock = !u.bought && u.unlockText ? ` 🔒 ${u.unlockText}` : '';
          const queue = u.queueBonus > 0 ? ` · очередь +${u.queueBonus}` : '';
          const eff = u.effectText ? ` · ${u.effectText}` : '';
          ctx.print(`      ${u.name} (${u.id}) — ${uStatus}${queue}${eff}${uLock}`);
        }
      }
      ctx.print('покупка: craft.buy <id станции|улучшения>');
    },
  });

  registry.register({
    name: 'craft.buy',
    usage: 'craft.buy <станция|улучшение>',
    description: 'построить станцию или купить улучшение за золото (TransactionService)',
    run(args, ctx) {
      const api = ctx.game.modules.get('craft')?.api;
      if (!api) return ctx.printErr('модуль крафта не активен');
      const id = args[0];
      if (!id) return ctx.printErr('укажите id: craft.buy smelter (витрина — craft.stations)');
      const r = api['craft.buy'](id) as R<{ kind: string; id: string; name: string; cost: number }>;
      if (!r.ok) return ctx.printErr(r.error);
      const what = r.value.kind === 'station' ? 'станция построена' : 'улучшение куплено';
      ctx.printOk(`${what}: «${r.value.name}» за ${r.value.cost} золота`);
      ctx.refresh();
    },
  });
}
