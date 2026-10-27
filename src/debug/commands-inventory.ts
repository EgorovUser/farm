/**
 * Команды модуля M02 «Инвентарь» (02-BUSES §12; регистрация — console.ts).
 * M02.1: inv list / inv info / inv clear. give переключён на acquire в
 * commands-economy.ts (D23).
 * M02.2: inv equip/unequip (D30/D21), dev-штампы inv mod / inv dur (§2.6),
 * экипировка — секцией в inv info.
 * M02.3: действия над предметом — inv use (D32) / inv sell (D34) /
 * inv wear (D35, износ-геймплей для проб; авто-износ — M05+).
 */
import type { CommandRegistry, CommandContext } from './console-types';
import type { Game } from '@/game/bootstrap';
import type { ItemInstance } from '@/game/modules/inventory/state';
import type { InventoryInfo } from '@/game/modules/inventory/store';
import type { EquipmentSlotDef } from '@/content/balance/inventory';

function invApi(game: Game): Record<string, (...args: unknown[]) => unknown> | null {
  return game.modules.get('inventory')?.api ?? null;
}

type EquipResult = { ok: true; value: { defId: string; iid: string; slot: string } } | { ok: false; error: string };

function describeEntry(game: Game, it: ItemInstance): string {
  const def = game.content.tryItem(it.defId);
  const q = `качество ${it.quality.tier} ${it.quality.value.toFixed(1)}`;
  const dur = it.durability ? ` · прочность ${it.durability.current}/${it.durability.max}` : '';
  const worn = it.durability && it.durability.current <= 0 ? ' · СЛОМАН (ремонт — M09)' : '';
  const mods = it.rolledMods.length > 0 ? ` · моды: ${it.rolledMods.map((m) => `${m.type} ${m.value > 0 ? '+' : ''}${m.value}`).join(', ')}` : '';
  return `${String(it.qty).padStart(5)}  ${def?.name ?? '???'} (${it.defId}) · ${q}${dur}${worn}${mods} · ${it.iid}`;
}

/** Секция экипировки для inv info: слоты из данных, занятые — с деталями записи */
function printEquipment(ctx: CommandContext, game: Game): void {
  const api = invApi(game);
  if (!api) return;
  const slots = game.content.get<{ equipmentSlots: EquipmentSlotDef[] }>('inventory').equipmentSlots;
  const equipped = (api['inventory.equipped']() as Array<{
    slot: string;
    slotName: string;
    entry: ItemInstance;
  }>).map((e) => [e.slot, e] as const);
  const bySlot = new Map(equipped);
  ctx.print('  экипировка (слоты из данных):');
  for (const s of slots) {
    const e = bySlot.get(s.id);
    if (!e) {
      ctx.print(`    ${s.id.padEnd(12)} ${s.name.padEnd(18)} — пусто`);
      continue;
    }
    const def = game.content.tryItem(e.entry.defId);
    const q = `качество ${e.entry.quality.tier} ${e.entry.quality.value.toFixed(1)}`;
    const dur = e.entry.durability ? ` · прочность ${e.entry.durability.current}/${e.entry.durability.max}` : '';
    const broken = e.entry.durability && e.entry.durability.current <= 0 ? ' · СЛОМАН (ремонт — M09)' : '';
    const mods = e.entry.rolledMods.length > 0 ? ` · моды: ${e.entry.rolledMods.map((m) => `${m.type} ${m.value > 0 ? '+' : ''}${m.value}`).join(', ')}` : '';
    ctx.print(`    ${s.id.padEnd(12)} ${s.name.padEnd(18)} ${def?.name ?? '???'} ×${e.entry.qty} (${e.entry.iid}) · ${q}${dur}${broken}${mods}`);
  }
}

function runInvList(args: string[], ctx: CommandContext): void {
  const api = invApi(ctx.game);
  if (!api) return ctx.printErr('модуль инвентаря не активен');
  const tabId = args[0];
  const info = api['inventory.info']() as InventoryInfo;
  const items = api['inventory.list'](tabId) as ItemInstance[];
  ctx.printTitle(`Инвентарь — слоты ${info.used}/${info.capacity} (свободно ${info.free})`);
  if (tabId) {
    const tab = info.tabs.find((t) => t.id === tabId || t.name.toLowerCase() === tabId.toLowerCase());
    if (!tab) {
      return ctx.printErr(`вкладка "${tabId}" не найдена: ${info.tabs.map((t) => t.id).join(', ')}`);
    }
  }
  if (items.length === 0) {
    ctx.print(tabId ? 'вкладка пуста' : 'инвентарь пуст — give turnip 5');
    return;
  }
  for (const it of items) ctx.print(`  ${describeEntry(ctx.game, it)}`);
}

export function registerInventoryCommands(registry: CommandRegistry): void {
  registry.register({
    name: 'inv list',
    usage: 'inv list [вкладка]',
    description: 'предметы инвентаря (с качеством), опционально по вкладке',
    run: runInvList,
  });

  registry.register({
    name: 'inv info',
    usage: 'inv info',
    description: 'слоты занято/кап, экипировка, вкладки',
    run(_args, ctx) {
      const api = invApi(ctx.game);
      if (!api) return ctx.printErr('модуль инвентаря не активен');
      const info = api['inventory.info']() as InventoryInfo;
      ctx.printTitle('Инвентарь · сводка');
      ctx.print(`  слоты: ${info.used} занято / ${info.capacity} (кап ${ctx.game.content.get<{ slotsCap: number }>('inventory').slotsCap}, resolve player.inventory.slots = ${info.slotsResolved})`);
      ctx.print(`  свободно: ${info.free} · записей создано: ${info.seq}`);
      printEquipment(ctx, ctx.game);
      ctx.print('  вкладки (из данных):');
      for (const t of info.tabs) {
        ctx.print(`    ${t.name.padEnd(14)} ${String(t.entries).padStart(3)} записей · ${t.qty} шт`);
      }
    },
  });

  registry.register({
    name: 'inv clear',
    usage: 'inv clear',
    description: 'полностью очистить инвентарь (debug; item.*-событий нет, сервисный invalidate.stat — DEBT-25)',
    run(_args, ctx) {
      const api = invApi(ctx.game);
      if (!api) return ctx.printErr('модуль инвентаря не активен');
      const before = (api['inventory.list']() as ItemInstance[]).length;
      api['inventory.clear']?.();
      ctx.printOk(`инвентарь очищен: было ${before} записей`);
      ctx.refresh();
    },
  });

  // ---------------------------------------------------------- M02.2 (бриф §2.6)

  registry.register({
    name: 'inv equip',
    usage: 'inv equip <iid> <слот>',
    description: 'экипировать запись в слот (гейты требований проверяются)',
    run(args, ctx) {
      const api = invApi(ctx.game);
      if (!api) return ctx.printErr('модуль инвентаря не активен');
      const [iid, slot] = args;
      if (!iid || !slot) return ctx.printErr('формат: inv equip <iid> <слот> — слоты: inv info');
      const r = api['inventory.equip'](iid, slot) as EquipResult;
      if (!r.ok) return ctx.printErr(r.error);
      const def = ctx.game.content.tryItem(r.value.defId);
      const slots = ctx.game.content.get<{ equipmentSlots: EquipmentSlotDef[] }>('inventory').equipmentSlots;
      const slotName = slots.find((s) => s.id === r.value.slot)?.name ?? r.value.slot;
      ctx.printOk(`экипировано: ${def?.name ?? r.value.defId} (${r.value.iid}) → «${slotName}»`);
      ctx.refresh();
    },
  });

  registry.register({
    name: 'inv unequip',
    usage: 'inv unequip <слот>',
    description: 'снять из слота (без события, D21; запись возвращается в рюкзак)',
    run(args, ctx) {
      const api = invApi(ctx.game);
      if (!api) return ctx.printErr('модуль инвентаря не активен');
      const slot = args[0];
      if (!slot) return ctx.printErr('формат: inv unequip <слот> — слоты: inv info');
      const r = api['inventory.unequip'](slot) as EquipResult;
      if (!r.ok) return ctx.printErr(r.error);
      const def = ctx.game.content.tryItem(r.value.defId);
      ctx.printOk(`снято: ${def?.name ?? r.value.defId} (${r.value.iid}) ← слот ${r.value.slot}`);
      ctx.refresh();
    },
  });

  registry.register({
    name: 'inv mod',
    usage: 'inv mod <iid> <modType> <значение>',
    description: 'dev-штамп ривен-ролла {from: initial} (генерация — M03)',
    run(args, ctx) {
      const api = invApi(ctx.game);
      if (!api) return ctx.printErr('модуль инвентаря не активен');
      const [iid, modType, valueRaw] = args;
      if (!iid || !modType || valueRaw === undefined) {
        return ctx.printErr('формат: inv mod <iid> <modType> <значение> — реестр: content/mods/registry.ts');
      }
      const value = Number(valueRaw);
      const r = api['inventory.mod'](iid, modType, value) as
        | { ok: true; value: { iid: string; type: string; value: number } }
        | { ok: false; error: string };
      if (!r.ok) return ctx.printErr(r.error);
      ctx.printOk(`штамп мода: ${r.value.type} ${r.value.value > 0 ? '+' : ''}${r.value.value} → ${r.value.iid} (from: initial)`);
      ctx.refresh();
    },
  });

  registry.register({
    name: 'inv dur',
    usage: 'inv dur <iid> <n>',
    description: 'dev-штамп прочности (клэмп 0..max; износ-геймплей — M02.3)',
    run(args, ctx) {
      const api = invApi(ctx.game);
      if (!api) return ctx.printErr('модуль инвентаря не активен');
      const [iid, nRaw] = args;
      if (!iid || nRaw === undefined) return ctx.printErr('формат: inv dur <iid> <n> — 0 = сломан (D22)');
      const n = Number(nRaw);
      const r = api['inventory.dur'](iid, n) as
        | { ok: true; value: { iid: string; current: number; max: number } }
        | { ok: false; error: string };
      if (!r.ok) return ctx.printErr(r.error);
      const broken = r.value.current <= 0 ? ' — СЛОМАН (ремонт — M09)' : '';
      ctx.printOk(`прочность ${r.value.iid}: ${r.value.current}/${r.value.max}${broken}`);
      ctx.refresh();
    },
  });

  // ---------------------------------------------------------- M02.3 (бриф §2.3–§2.5)

  registry.register({
    name: 'inv use',
    usage: 'inv use <iid>',
    description: 'использовать расходник (гейты проверяются; эффекты — через player API)',
    run(args, ctx) {
      const api = invApi(ctx.game);
      if (!api) return ctx.printErr('модуль инвентаря не активен');
      const iid = args[0];
      if (!iid) return ctx.printErr('формат: inv use <iid> — список: inv list');
      const r = api['inventory.use'](iid) as
        | { ok: true; value: { defId: string; iid: string; effects: Array<{ t: string; value: number }> } }
        | { ok: false; error: string };
      if (!r.ok) return ctx.printErr(r.error);
      const def = ctx.game.content.tryItem(r.value.defId);
      const fx = r.value.effects
        .map((e) => `${e.t === 'grantEnergy' ? 'энергия' : 'здоровье'} +${e.value}`)
        .join(', ');
      ctx.printOk(`использовано: ${def?.name ?? r.value.defId} (${r.value.iid})${fx ? ` — ${fx}` : ''}`);
      ctx.refresh();
    },
  });

  registry.register({
    name: 'inv sell',
    usage: 'inv sell <defId> [qty]',
    description: 'продать предметы (PriceBus + TransactionService; худшие вперёд, D25)',
    run(args, ctx) {
      const api = invApi(ctx.game);
      if (!api) return ctx.printErr('модуль инвентаря не активен');
      const [defId, qtyRaw] = args;
      if (!defId) return ctx.printErr('формат: inv sell <defId> [qty] — инвентарь: inv list');
      const qty = qtyRaw === undefined ? 1 : Number(qtyRaw);
      const r = api['inventory.sell'](defId, qty) as
        | {
            ok: true;
            value: {
              defId: string;
              qty: number;
              gold: number;
              chunks: Array<{ tier: string; units: number; unitPrice: number }>;
            };
          }
        | { ok: false; error: string };
      if (!r.ok) return ctx.printErr(r.error);
      const def = ctx.game.content.tryItem(r.value.defId);
      const parts = r.value.chunks
        .map((c) => `${c.tier} ${c.unitPrice}/шт ×${c.units}`)
        .join(' + ');
      ctx.printOk(
        `продано: ${def?.name ?? r.value.defId} ×${r.value.qty} за ${r.value.gold} золота (${parts})`,
      );
      ctx.refresh();
    },
  });

  registry.register({
    name: 'inv salvage',
    usage: 'inv salvage <iid>',
    description: 'разобрать предмет крафта: 25% материалов рецепта (качество/моды/заточка теряются)',
    run(args, ctx) {
      const api = invApi(ctx.game);
      if (!api) return ctx.printErr('модуль инвентаря не активен');
      const iid = args[0];
      if (!iid) return ctx.printErr('формат: inv salvage <iid> — инвентарь: inv list');
      // [FIX-PHASE-2 · 4.7 · SALV-1] карточка M02 §3 «Разобрать»
      const r = api['inventory.salvage'](iid) as
        | { ok: true; value: { iid: string; defId: string; recipeId: string; returned: Array<{ defId: string; qty: number }> } }
        | { ok: false; error: string };
      if (!r.ok) return ctx.printErr(r.error);
      const def = ctx.game.content.tryItem(r.value.defId);
      const parts = r.value.returned.map((l) => `${l.defId} ×${l.qty}`).join(', ');
      ctx.printOk(`разобрано: ${def?.name ?? r.value.defId} (${r.value.recipeId}) — возвращено: ${parts}`);
      ctx.refresh();
    },
  });

  registry.register({
    name: 'inv wear',
    usage: 'inv wear <iid> <n>',
    description: 'износ прочности −n (клэмп 0..max; сломан = модов нет, D22/D35)',
    run(args, ctx) {
      const api = invApi(ctx.game);
      if (!api) return ctx.printErr('модуль инвентаря не активен');
      const [iid, nRaw] = args;
      if (!iid || nRaw === undefined) return ctx.printErr('формат: inv wear <iid> <n> — носители: tool/weapon/armor/shield/rod');
      const n = Number(nRaw);
      const r = api['inventory.wear'](iid, n) as
        | { ok: true; value: { iid: string; before: number; current: number; max: number; broken: boolean } }
        | { ok: false; error: string };
      if (!r.ok) return ctx.printErr(r.error);
      const v = r.value;
      const broken = v.broken ? ' — СЛОМАН (ремонт — M09)' : '';
      ctx.printOk(`износ ${v.iid}: ${v.before} − ${v.before - v.current} → ${v.current}/${v.max}${broken}`);
      ctx.refresh();
    },
  });
}
