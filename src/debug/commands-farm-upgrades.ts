/**
 * Команды улучшений фермы M05.3 (G1/G2; регистрация — console.ts; перенос
 * farm.crops сюда — wc-гигиена 01 §6 при таб-параметрах commands-farm.ts).
 *
 * farm.upgrades — витрина покупок (карточка §7: доступные/купленные, цены/
 * гейты/эффекты — П6 «замки видны с условием»); farm.upgrade <id> — покупка
 * (TransactionService, золото; отказы с причиной); farm.crops — каталог
 * культур с гейтами и вкладками.
 */
import type { CommandRegistry, CommandContext } from './console-types';

type R<T> = { ok: true; value: T } | { ok: false; error: string };

interface UpgradeRow {
  id: string;
  name: string;
  description: string;
  cost: { currency: string; qty: number };
  gateText: string | null;
  purchased: boolean;
  effectText: string;
}

export function registerFarmUpgradeCommands(registry: CommandRegistry): void {
  registry.register({
    name: 'farm.upgrades',
    usage: 'farm.upgrades',
    description: 'улучшения фермы: доступные/купленные, цены, гейты, эффекты (П6)',
    run(_args, ctx: CommandContext) {
      const api = ctx.game.modules.get('farm')?.api;
      if (!api) return ctx.printErr('модуль фермы не активен');
      const v = api['farm.upgrades']() as { rows: UpgradeRow[]; purchased: number; total: number };
      ctx.printTitle(`Улучшения фермы · куплено ${v.purchased} из ${v.total}`);
      for (const r of v.rows) {
        const mark = r.purchased ? '✓' : r.gateText ? '🔒' : '·';
        const state = r.purchased ? 'куплено' : r.gateText ? r.gateText : `${r.cost.qty} ${r.cost.currency}`;
        ctx.print(`  ${mark} ${r.id.padEnd(16)} ${r.name} — ${state}`);
        ctx.print(`      ${r.description}`);
        ctx.print(`      эффект: ${r.effectText}`);
      }
      ctx.print('покупка: farm.upgrade <id> (золото — TransactionService; гейты уровня)');
      ctx.refresh();
    },
  });

  registry.register({
    name: 'farm.upgrade',
    usage: 'farm.upgrade <id>',
    description: 'купить улучшение фермы (вкладка/эффект; TransactionService)',
    run(args, ctx) {
      const api = ctx.game.modules.get('farm')?.api;
      if (!api) return ctx.printErr('модуль фермы не активен');
      const id = args[0];
      if (!id) return ctx.printErr('укажите улучшение: farm.upgrade tab_mushroom (список — farm.upgrades)');
      const r = api['farm.upgrade'](id) as R<{ id: string; name: string }>;
      if (!r.ok) return ctx.printErr(r.error);
      ctx.printOk(`куплено: ${r.value.name} (${r.value.id}) — транзакция farm.upgrade`);
      ctx.refresh();
    },
  });

  registry.register({
    name: 'farm.crops',
    usage: 'farm.crops',
    description: 'каталог культур: время роста, семя, урожай, вкладки, гейты (П6)',
    run(_args, ctx) {
      const crops = ctx.game.content.get<Array<{ id: string; name: string; growHours: number; seedDef: string; yields: Array<{ defId: string; minQty: number; maxQty: number }>; replantable?: boolean; allowedTabs: string[]; unlock?: unknown }>>('farm.crops');
      ctx.printTitle(`Культуры · ${crops.length}`);
      for (const c of crops) {
        const yields = c.yields.map((y) => `${y.defId} ×${y.minQty}..${y.maxQty}`).join(', ');
        const tabs = c.allowedTabs.join('/');
        const extra = [c.replantable ? 'replantable' : null, c.unlock ? `🔒 ${JSON.stringify(c.unlock)}` : null]
          .filter(Boolean)
          .join(' · ');
        ctx.print(`  ${c.id.padEnd(11)} ${c.name} · ${c.growHours}ч · семя ${c.seedDef} → ${yields} · вкладка ${tabs}${extra ? ` · ${extra}` : ''}`);
      }
      ctx.print('посадка: farm.plant <crop> <tile> [tab] (семя из инвентаря; гейты — в данных)');
    },
  });
}
