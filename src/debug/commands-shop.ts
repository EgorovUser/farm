/**
 * Команды модуля M04 «Магазин» (карточка §6; регистрация — console.ts).
 * shop.stock — витрина дня с замками гейтов (П6: «гейты показываем»),
 * shop.buy — производственная покупка (сток/гейты/атомарность/C4-роллы),
 * shop.reroll — пересоздание завоза дня (демо детерминизма), shop.levelup —
 * debug-уровень (живой рост — покупками). [M04.2] shop.branch — ветви §3:
 * без аргументов витрина (уровни/цены/эффекты/каталог), с именем — покупка
 * уровня за золото; assortment/permanent требуют выбор предмета.
 */
import type { CommandRegistry } from './console-types';
import type { ShopTable } from '@/content/balance/shop';
import type { ShopPoolEntry } from '@/content/shopPool';
import type { ItemDef } from '@/content/items/items';
import type { Condition } from '@/shared/types/requirement';
import { checkCondition } from '@/shared/utils/condition-check';
import { RARITY_LABELS_RU } from '@/shared/types/ids';

type R<T> = { ok: true; value: T } | { ok: false; error: string };

interface StockEntry {
  id: string;
  kind: 'item' | 'currency';
  qty: number;
  discount?: number;
  base: boolean;
  pinned?: boolean;
}

interface Stock {
  dateISO: string;
  entries: StockEntry[];
}

export function registerShopCommands(registry: CommandRegistry): void {
  registry.register({
    name: 'shop.stock',
    usage: 'shop.stock',
    description: 'сегодняшний завоз: базовый ассортимент + 30% пула, скидки, замки гейтов (П6)',
    run(_args, ctx) {
      const api = ctx.game.modules.get('shop')?.api;
      if (!api) return ctx.printErr('модуль магазина не активен');
      api['shop.ensureStock']();
      const stock = api['shop.stock']() as Stock;
      const table = ctx.game.content.get<ShopTable>('shop');
      const pool = ctx.game.content.get<ShopPoolEntry[]>('shop.pool');
      const view = api['shop.view']() as {
        level: number;
        xp: number;
        xpToNext: number;
        levelDiscountPercent: number;
        branches: { categories: number };
      };
      const extra = {
        // [M15.2 · N10] витрина гейтов = истина покупательного гейта: тот же
        // шов, что shop/purchase.ts gateCtx (module-wiring: player + quests).
        // Стабы hasFlag/hasAchievement=()=>false были заглушкой M04-эры —
        // до M15 флагов не существовало; теперь 🔒 отражает реальное состояние
        ...(ctx.game.modules.call('player', 'player.ctxExtras') ?? {}),
        ...(ctx.game.modules.call('quests', 'quests.gateExtras') ?? {}),
      } as Record<string, unknown>;
      const playerLevel = Number(extra['player:level'] ?? 0);
      const skillLevel = (s: string): number => Number(extra[`skill:${s}`] ?? 0);
      // полный каталог — через валидированную таблицу (реестровый tryItem отдаёт
      // лишь минимальную форму для индексов; прецедент — InventoryModule M02.1)
      const itemById = new Map(ctx.game.content.get<ItemDef[]>('items').map((d) => [d.id, d] as const));

      ctx.printTitle(`Завоз ${stock.dateISO} · ${stock.entries.length} позиций · магазин ур. ${view.level} (XP ${view.xp}/${view.xpToNext}, скидка уровня −${view.levelDiscountPercent}%)`);
      const base = stock.entries.filter((e) => e.base);
      const rolled = stock.entries.filter((e) => !e.base && !e.pinned);
      const pinned = stock.entries.filter((e) => e.pinned);
      const openShelves = new Set(table.categories.unlockOrder.slice(0, view.branches.categories));

      const label = (e: StockEntry): string => {
        const def: ItemDef | undefined = e.kind === 'item' ? itemById.get(e.id) : undefined;
        const name = def?.name ?? e.id;
        const rarity = def ? ` · ${RARITY_LABELS_RU[def.rarity]}` : '';
        return `${name} (${e.id})${rarity}`;
      };
      const lock = (e: StockEntry): string => {
        if (e.kind !== 'item') return '';
        const def = itemById.get(e.id);
        const row = pool.find((p) => p.id === e.id);
        const unlock: Condition | undefined = row?.unlock ?? def?.unlock;
        if (!unlock) return '';
        if (checkCondition(unlock, {
          tags: [],
          stat: () => 0,
          hasFlag: (flag) => Boolean(extra[`flag:${flag}`]),
          skillLevel,
          playerLevel,
          itemCount: () => 0,
          hasAchievement: (id) => Boolean(extra[`achievement:${id}`]),
        })) return '';
        if (unlock.t === 'playerLevel') return ` 🔒 Откроется: уровень ${unlock.level}`;
        if (unlock.t === 'skill') return ` 🔒 Нужен навык ${unlock.skill} ${unlock.level}`;
        if (unlock.t === 'achievement') return ` 🔒 Откроется после ачивки ${unlock.id}`;
        if (unlock.t === 'flag') return ` 🔒 Не открыто: ${unlock.flag}`;
        return ` 🔒 Условие: ${unlock.t}`;
      };
      const price = (e: StockEntry): string => {
        const priced =
          e.kind === 'item'
            ? itemById.get(e.id)
            : { id: e.id, basePrice: table.currencyGoods[e.id] ?? 0, rarity: 'common' as const };
        if (!priced) return '?';
        const b = ctx.game.priceBus.buyPrice(priced, { ctx: { buyer: 'player', now: ctx.game.time.now() } });
        return `${b.final} зол.`;
      };

      ctx.print(`Базовый ассортимент (${base.length}):`);
      for (const e of base) {
        ctx.print(`  ${String(e.qty).padStart(3)} шт  ${price(e).padEnd(8)} ${label(e)}${lock(e)}`);
      }
      ctx.print(`Ролл 30% пула (${rolled.length} · полки: ${[...openShelves].join(', ') || 'только базовые'}):`);
      for (const e of rolled) {
        const disc = e.discount !== undefined ? ` −${e.discount}%` : '';
        ctx.print(`  ${String(e.qty).padStart(3)} шт  ${price(e).padEnd(8)} ${label(e)}${disc}${lock(e)}`);
      }
      if (pinned.length > 0) {
        ctx.print(`Постоянный заказ (${pinned.length}):`);
        for (const e of pinned) ctx.print(`  ${String(e.qty).padStart(3)} шт  ${price(e).padEnd(8)} ${label(e)}${lock(e)}`);
      }
      ctx.print(`пул: ${pool.length} позиций · закрытые полки: ${table.categories.unlockOrder.filter((c) => !openShelves.has(c)).join(', ') || '—'} (ветка «Категории»)`);
    },
  });

  registry.register({
    name: 'shop.buy',
    usage: 'shop.buy <defId|валюта> [qty]',
    description: 'покупка из стока: PriceBus → TransactionService → item.acquired/shop.purchased (гир — с ривен-роллами)',
    run(args, ctx) {
      const [id, qtyRaw] = args;
      if (!id) return ctx.printErr('укажите товар: shop.buy seed_turnip 5 (витрина — shop.stock)');
      const api = ctx.game.modules.get('shop')?.api;
      if (!api) return ctx.printErr('модуль магазина не активен');
      const qty = Math.max(1, Number(qtyRaw) || 1);
      const r = api['shop.buy'](id, qty) as R<{
        id: string;
        kind: 'item' | 'currency';
        qty: number;
        unitPrice: number;
        total: number;
        discount?: number;
        iids?: string[];
      }>;
      if (!r.ok) return ctx.printErr(r.error);
      const v = r.value;
      const name = v.kind === 'item' ? (ctx.game.content.tryItem(v.id)?.name ?? v.id) : v.id;
      const disc = v.discount !== undefined ? ` (скидка завоза −${v.discount}%)` : '';
      // iid'ы — все новые записи; пометка о роллах — только для gear с modSlots (C4)
      const isGear = v.kind === 'item' &&
        ctx.game.content.get<Array<{ id: string; modSlots?: unknown }>>('items').find((d) => d.id === v.id)?.modSlots !== undefined;
      const iidsNote = v.iids && v.iids.length > 0
        ? ` · новые записи: ${v.iids.join(', ')}${isGear ? ' (ривен-роллы применены)' : ''}`
        : '';
      ctx.printOk(
        `куплено: ${name} ×${v.qty} за ${v.total} золота (цена ${v.unitPrice}${disc})${iidsNote}`,
      );
      ctx.refresh();
    },
  });

  registry.register({
    name: 'shop.reroll',
    usage: 'shop.reroll',
    description: 'пересоздать завоз сегодняшнего дня (демо детерминизма: те же условия — тот же сток)',
    run(_args, ctx) {
      const api = ctx.game.modules.get('shop')?.api;
      if (!api) return ctx.printErr('модуль магазина не активен');
      const r = api['shop.reroll']() as { dateISO: string; changed: boolean };
      ctx.printOk(
        r.changed
          ? `завоз ${r.dateISO} пересоздан (условия дня изменились — уровень/ветки)`
          : `завоз ${r.dateISO} пересоздан байт-в-байт — детерминизм dailySeed держится (shop.stock)`,
      );
      ctx.refresh();
    },
  });

  registry.register({
    name: 'shop.levelup',
    usage: 'shop.levelup [n]',
    description: 'debug: +n уровней магазина (живой рост — покупками; скидка уровня каждые 5 уровней)',
    run(args, ctx) {
      const api = ctx.game.modules.get('shop')?.api;
      if (!api) return ctx.printErr('модуль магазина не активен');
      const level = api['shop.levelup'](Number(args[0]) || 1) as number;
      ctx.printOk(`магазин: уровень ${level} (debug; live-рост — покупки через shop.buy)`);
      ctx.refresh();
    },
  });

  registry.register({
    name: 'shop.branch',
    usage: 'shop.branch [имя] [выбор] · shop.branch assortment <id> · shop.branch permanent <id>',
    description: 'ветви §3: витрина (уровни/цены/эффекты) или покупка уровня за золото (эффект — со следующего завоза)',
    run(args, ctx) {
      const api = ctx.game.modules.get('shop')?.api;
      if (!api) return ctx.printErr('модуль магазина не активен');
      const table = ctx.game.content.get<ShopTable>('shop');
      const [name, pick] = args;

      // --- витрина: уровни, цены следующих уровней, эффекты, каталог, выборы
      if (!name) {
        const rows = api['shop.branch.view']() as Array<{
          key: string;
          level: number;
          maxLevel: number;
          nextCost: number | null;
          effect: string;
          picks: string[];
          nextShelf: string | null;
        }>;
        ctx.printTitle(`Ветви магазина · золото: ${ctx.game.wallet.get('gold')}`);
        for (const r of rows) {
          const cost = r.nextCost !== null ? `след. уровень ${r.nextCost} зол.` : 'МАКС';
          const shelf = r.nextShelf !== null ? ` · следующая полка: ${r.nextShelf}` : '';
          const picks = r.picks.length > 0 ? ` · выборы: ${r.picks.join(', ')}` : '';
          ctx.print(`  ${r.key.padEnd(11)} ${r.level}/${r.maxLevel} · ${cost} · ${r.effect}${shelf}${picks}`);
        }
        ctx.print(`каталог «что привозить» (assortment): ${table.assortmentCatalog.map((c) => `${c.id} (вес ${c.weight})`).join(', ')}`);
        ctx.print('покупка: shop.branch <имя> [выбор] · эффект — со следующего завоза (00:00), демо — shop.reroll');
        return;
      }

      // --- покупка уровня за золото (выбор — для assortment/permanent)
      const r = api['shop.branch.buy'](name, pick) as R<{
        branch: string;
        level: number;
        cost: number;
        pick?: string;
        nextCost: number | null;
      }>;
      if (!r.ok) return ctx.printErr(r.error);
      const v = r.value;
      const chosen = v.pick !== undefined ? ` (выбор: ${v.pick})` : '';
      const next = v.nextCost !== null ? `след. уровень ${v.nextCost} зол.` : 'ветка максимальна';
      ctx.printOk(
        `ветка «${v.branch}» уровень ${v.level}${chosen} за ${v.cost} золота · ${next} · подействует со следующего завоза`,
      );
      ctx.refresh();
    },
  });
}
