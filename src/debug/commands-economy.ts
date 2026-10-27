/**
 * Экономические команды: price, buy, sell, give, wallet, stash, debug.price.
 */
import type { CommandRegistry } from './console-types';
import type { PriceCtx, PriceModifierProvider, PriceMod, PriceModKind } from '@/kernel/bus/price-bus/price-bus';
import type { Game } from '@/game/bootstrap';
import { CURRENCY_LABELS_RU } from '@/content/locale/ru';
import { RARITY_LABELS_RU } from '@/shared/types/ids';
import { QUALITY_TIERS, type CurrencyId, type QualityTier } from '@/shared/types/ids';

function priceCtx(game: Game): PriceCtx {
  return { buyer: 'player', now: game.time.now() };
}

/** debug-провайдер цен: позволяет вручную проверить капы и наценки */
class DebugPriceProvider implements PriceModifierProvider {
  readonly id = 'debug.price';
  private mods: { id: string; label: string; kind: PriceModKind; value: number; defId?: string }[] = [];

  set(mod: { kind: PriceModKind; value: number; defId?: string }): void {
    const label = `debug ${mod.kind} ${mod.value}%${mod.defId ? ` на ${mod.defId}` : ''}`;
    this.mods = [...this.mods.filter((m) => m.kind !== mod.kind || m.defId !== mod.defId), { id: `debug.${mod.kind}.${mod.defId ?? 'all'}`, label, ...mod }];
  }

  clear(): void {
    this.mods = [];
  }

  list(): string[] {
    return this.mods.map((m) => m.label);
  }

  provide(defId: string): PriceMod[] {
    return this.mods.filter((m) => !m.defId || m.defId === defId).map(({ id, label, kind, value }) => ({ id, label, kind, value }));
  }
}

let debugPriceProvider: DebugPriceProvider | null = null;

function ensureProvider(game: Game): DebugPriceProvider {
  if (!debugPriceProvider) debugPriceProvider = new DebugPriceProvider();
  if (!game.priceBus.providerIds().includes(debugPriceProvider.id)) {
    game.priceBus.registerProvider(debugPriceProvider);
  }
  return debugPriceProvider;
}

export function registerEconomyCommands(registry: CommandRegistry): void {
  registry.register({
    name: 'price',
    usage: 'price <defId> [качество D..SS]',
    description: 'полная расшифровка цены покупки и продажи (04-DISCOUNTS §6)',
    run(args, ctx) {
      const defId = args[0];
      if (!defId) return ctx.printErr('укажите предмет: price iron_pickaxe B');
      let item: ReturnType<typeof ctx.game.content.item>;
      try {
        item = ctx.game.content.item(defId);
      } catch {
        return ctx.printErr(`предмет "${defId}" не найден в content/items`);
      }
      const tier = (args[1]?.toUpperCase() ?? '') as QualityTier;
      const quality = QUALITY_TIERS.includes(tier) ? tier : null;
      const pctx = priceCtx(ctx.game);

      const buy = ctx.game.priceBus.buyPrice(item, { qualityTier: quality, ctx: pctx });
      const sell = ctx.game.priceBus.sellPrice(item, { qualityTier: quality, ctx: pctx });

      ctx.printTitle(`${item.name} (${item.id}) — ${RARITY_LABELS_RU[item.rarity]}${quality ? `, качество ${quality}` : ''}`);
      ctx.print(`  basePrice: ${item.basePrice} × редкость ${buy.rarityMult}${quality ? ` × качество ${buy.qualityMult}` : ''} = base ${buy.base}`);
      ctx.print(`  ПОКУПКА: ${buy.final} золота`);
      if (buy.applied.length > 0) {
        for (const m of buy.applied) {
          const sign = m.kind === 'markup' ? '+' : '−';
          ctx.print(`    ${sign}${m.value}% ${m.label} [${m.group}]`);
        }
        ctx.print(`    Σ наценок ${buy.markupSumPercent}%, глобально ${buy.globalSumPercent}%${buy.globalCapped ? ' (кап!)' : ''}, локально ${buy.localSumPercent}%${buy.localCapped ? ' (кап!)' : ''}`);
        ctx.print(`    эффективная скидка ${buy.totalDiscountPercent.toFixed(1)}%${buy.totalDiscountCapped ? ' (КАП ИТОГОВЫЙ!)' : ''}`);
      }
      // [FIX-0.1 F] клэмп maxTotalDiscountPercent виден в расшифровке (04-DISCOUNTS §4.1)
      if (buy.totalDiscountCapped) {
        ctx.printWarn(`    применён клэмп суммарной скидки ${ctx.game.content.economy().maxTotalDiscountPercent}% (maxTotalDiscountPercent)`);
      }
      if (buy.floorApplied) ctx.printWarn('    применён пол 10% базы — бесплатно ничего не бывает');
      ctx.print(`  ПРОДАЖА: ${sell.final} золота (ставка 40%${sell.sellBonusPercent > 0 ? ` + ${sell.sellBonusPercent}% бонус` : ''})`);
    },
  });

  registry.register({
    name: 'buy',
    usage: 'buy <defId> [qty]',
    description: 'купить предметы через PriceBus + TransactionService',
    run(args, ctx) {
      const defId = args[0];
      const qty = Math.max(1, Number(args[1]) || 1);
      if (!defId) return ctx.printErr('укажите предмет: buy seed_turnip 5');
      let item: ReturnType<typeof ctx.game.content.item>;
      try {
        item = ctx.game.content.item(defId);
      } catch {
        return ctx.printErr(`предмет "${defId}" не найден`);
      }
      const breakdown = ctx.game.priceBus.buyPrice(item, { ctx: priceCtx(ctx.game) });
      const total = breakdown.final * qty;
      const r = ctx.game.transaction.transact({
        costs: [{ t: 'currency', id: 'gold', qty: total }],
        grants: [{ t: 'item', defId, qty }],
        eventId: 'debug.buy',
        reason: `покупка ×${qty} по ${breakdown.final}`,
      });
      if (!r.ok) return ctx.printErr(r.error);
      ctx.printOk(`куплено: ${item.name} ×${qty} за ${total} золота (цена ${breakdown.final})`);
      ctx.refresh();
    },
  });

  registry.register({
    name: 'sell',
    usage: 'sell <defId> [qty]',
    description: 'продать предметы магазину (скупка 40%) — делегирует inventory.sell',
    run(args, ctx) {
      const defId = args[0];
      const qty = args[1] === undefined ? 1 : Number(args[1]);
      if (!defId) return ctx.printErr('укажите предмет: sell turnip 2');
      // [OBS-5 M15.1 · FIX-PHASE-2] [DECISION] делегирование канону inventory.sell:
      // старая реализация ходила транзакцией eventId 'debug.sell' БЕЗ item.sold —
      // debug-продажа не двигала sell.items/цепочки M15 (живой контраст AUDIT-M15).
      // Канон продажи один: PriceBus + транзакция + событие item.sold (D34(4)).
      const api = ctx.game.modules.get('inventory')?.api;
      if (!api) return ctx.printErr('модуль инвентаря не активен (инвентарь: inv list)');
      const r = api['inventory.sell'](defId, qty) as
        | { ok: true; value: { defId: string; qty: number; gold: number; chunks: Array<{ tier: string; units: number; unitPrice: number }> } }
        | { ok: false; error: string };
      if (!r.ok) return ctx.printErr(r.error);
      const def = ctx.game.content.tryItem(r.value.defId);
      const parts = r.value.chunks.map((c) => `${c.tier} ${c.unitPrice}/шт ×${c.units}`).join(' + ');
      ctx.printOk(`продано: ${def?.name ?? r.value.defId} ×${r.value.qty} за ${r.value.gold} золота (${parts})`);
      ctx.refresh();
    },
  });

  registry.register({
    name: 'give',
    usage: 'give <валюта|предмет> <qty>',
    description: 'выдать валюту или предмет (debug; предметы — через acquire с роллом качества)',
    run(args, ctx) {
      const id = args[0];
      const qty = Number(args[1]) || 1;
      if (!id) return ctx.printErr('укажите что выдать: give gold 100 или give turnip 5');
      const isCurrency = id in CURRENCY_LABELS_RU;
      if (isCurrency) {
        const r = ctx.game.transaction.transact({
          grants: [{ t: 'currency', id: id as CurrencyId, qty }],
          eventId: 'debug.give',
        });
        if (!r.ok) return ctx.printErr(r.error);
        ctx.printOk(`выдано: ${CURRENCY_LABELS_RU[id]} ×${qty}`);
        ctx.refresh();
        return;
      }
      // [M02 · D23] предметы — через единую точку приобретения: ролл качества
      // по сиду, событие item.acquired с полным payload { defId, quality, qty, source }
      const inv = ctx.game.modules.get('inventory')?.api;
      if (!inv) return ctx.printErr('модуль инвентаря не активен — выдать предмет нельзя');
      const r = inv['inventory.acquire'](id, qty, 'debug.give') as
        | { ok: true; value: { quality: { tier: string; value: number }; entries: number } }
        | { ok: false; error: string };
      if (!r.ok) return ctx.printErr(r.error);
      ctx.printOk(
        `выдано: ${id} ×${qty} — качество ${r.value.quality.tier} ${r.value.quality.value.toFixed(1)} (записей: ${r.value.entries})`,
      );
      ctx.refresh();
    },
  });

  registry.register({
    name: 'wallet',
    usage: 'wallet',
    description: 'кошелёк: валюты и ресурсы',
    run(_args, ctx) {
      const snapshot = ctx.game.wallet.snapshot();
      if (snapshot.length === 0) return ctx.print('кошелёк пуст');
      ctx.printTitle('Кошелёк');
      for (const w of snapshot) {
        ctx.print(`  ${String(w.qty).padStart(8)}  ${w.id.padEnd(14)} ${CURRENCY_LABELS_RU[w.id] ?? ''}`);
      }
    },
  });

  registry.register({
    name: 'stash',
    usage: 'stash',
    description: 'предметы игрока (после M02 — инвентарь; фолбэк — тайник ядра)',
    run(_args, ctx) {
      // [M02 · D17] каноническое хранилище — инвентарь; старая команда не
      // сломана: показывает то же, что inv list. Фолбэк — если модуль не активен.
      const inv = ctx.game.modules.get('inventory')?.api;
      if (inv) {
        const items = inv['inventory.list']() as Array<{
          iid: string;
          defId: string;
          qty: number;
          quality: { tier: string; value: number };
        }>;
        if (items.length === 0) return ctx.print('инвентарь пуст — give turnip 5');
        ctx.printTitle(`Инвентарь (бывш. тайник) — ${items.length} записей`);
        for (const s of items) {
          const item = ctx.game.content.tryItem(s.defId);
          ctx.print(
            `  ${String(s.qty).padStart(6)}  ${s.defId.padEnd(16)} ${item ? item.name : '???'} · ${s.quality.tier} ${s.quality.value.toFixed(1)}`,
          );
        }
        return;
      }
      const snapshot = ctx.game.stash.snapshot();
      if (snapshot.length === 0) return ctx.print('тайник пуст');
      ctx.printTitle('Тайник предметов');
      for (const s of snapshot) {
        const item = ctx.game.content.tryItem(s.defId);
        ctx.print(`  ${String(s.qty).padStart(6)}  ${s.defId.padEnd(16)} ${item ? item.name : '???'}`);
      }
    },
  });

  registry.register({
    name: 'debug.price',
    usage: 'debug.price <markup|global|local|sell> <процент> [defId]',
    description: 'временный источник цены для проверки капов (только debug)',
    run(args, ctx) {
      const [kindRaw, valueRaw, defId] = args;
      const kinds: PriceModKind[] = ['markup', 'discountGlobal', 'discountLocal', 'sellBonus'];
      const kindMap: Record<string, PriceModKind> = {
        markup: 'markup',
        global: 'discountGlobal',
        local: 'discountLocal',
        sell: 'sellBonus',
      };
      if (!kindRaw || !(kindRaw in kindMap)) {
        return ctx.printErr(`вид: markup | global | local | sell. Пример: debug.price global 30`);
      }
      const value = Number(valueRaw);
      if (!Number.isFinite(value) || value <= 0) return ctx.printErr('процент должен быть положительным числом');
      if (defId && !ctx.game.content.tryItem(defId)) return ctx.printErr(`предмет "${defId}" не найден`);
      const provider = ensureProvider(ctx.game);
      provider.set({ kind: kindMap[kindRaw], value, defId });
      ctx.game.priceBus.clearCache();
      ctx.printOk(`источник цены добавлен: ${kindRaw} ${value}%${defId ? ` на ${defId}` : ' на всё'} — проверьте price <defId>`);
      ctx.refresh();
    },
  });

  registry.register({
    name: 'debug.price.clear',
    usage: 'debug.price.clear',
    description: 'убрать debug-источники цен',
    run(_args, ctx) {
      if (debugPriceProvider) debugPriceProvider.clear();
      ctx.game.priceBus.clearCache();
      ctx.printOk('debug-источники цен убраны');
      ctx.refresh();
    },
  });
}
