/**
 * mine.pick — универсальная команда выбора забега [DECISION M13.1]:
 *   mine pick <1..3> — карта текущей колонки (скрытая разыгрывается вслепую);
 *   mine pick 0      — свиток выхода (run-эффект из данных; нет свитка — отказ);
 *   mine pick p<N>   — выпить зелье №N из витрины (BUF-1: kernel.buff);
 *   режим крота      — покупка стока (mine pick <i>) / уход (mine pick 0);
 *   режим обвала     — какую карту следующей колонки засыпать.
 * Разрешение публикует mine.cardResolved {kind, cardId, column, исход, лут?}
 * и двигает колонку. Смерть внутри карты — подписка M13.1 (забег уже завершён:
 * колонка не двигается, витрина честна).
 */
import type { Result } from '@/shared/types/result';
import { err, ok } from '@/shared/types/result';
import type { Modifier } from '@/kernel/bus/stat-bus/modifier';
import type { MineCardsPayloads, MineRunEffectItem } from '@/content/mine/cards';
import type { ItemDef } from '@/content/items/items';
import { CARDS_PER_COLUMN } from './generator';
import { endRun, type RunCtx } from './run';
import { resolveCard, potionsInBag, type CardResolution } from './resolve';
import { runMobFight, runBossFight } from './fight-run';
import type { MineRunState, RunCard } from './state';

/** витрина стока крота (цены — PriceBus с наценкой по данным, ctx-тег крота) */
export function traderStockView(
  x: RunCtx,
  run: MineRunState,
): Array<{ defId: string; label: string; qty: number; price: number; base: number }> {
  const card = run.cards.find((c) => c.kind === 'trader' && c.resolved === true);
  const p = (card?.payload ?? null) as MineCardsPayloads['trader'] | null;
  if (p === null) return [];
  const out: Array<{ defId: string; label: string; qty: number; price: number; base: number }> = [];
  for (const s of p.stock) {
    const def = x.items.find((d) => d.id === s.defId);
    if (def === undefined) continue;
    const breakdown = x.priceBus.buyPrice(def, {
      qualityTier: null,
      ctx: { buyer: 'player', now: x.time.now(), tags: [p.priceTag] },
    });
    out.push({ defId: s.defId, label: s.label, qty: s.qty, price: breakdown.final, base: breakdown.base });
  }
  return out;
}

/** покупка крота: D23-проба Σ newEntries ≤ free (канон FIX-M12) → оплата →
 *  доставка acquire (ролл качества, кап соблюдён); факелы → run.torches */
function traderBuy(x: RunCtx, run: MineRunState, index: number): Result<CardResolution> {
  const stock = traderStockView(x, run);
  const entry = stock[index - 1];
  if (entry === undefined) {
    return err(`нет позиции №${index} в стоке крота (1..${stock.length}; mine pick 0 — уйти)`);
  }
  const card = run.cards.find((c) => c.kind === 'trader' && c.resolved === true);
  const p = (card?.payload ?? null) as MineCardsPayloads['trader'] | null;
  const def = x.items.find((d) => d.id === entry.defId);
  if (p === null || def === undefined) return err('сток крота недоступен');
  const isTorch = def.subType === 'torch';
  const isScroll = x.runEffects.some((r) => r.defId === entry.defId);
  if (!isTorch) {
    // зелья/свиток → основной инвентарь: D23-проба по СУММЕ новых стеков
    const probe = x.deps.canAcquire(entry.defId, entry.qty);
    if (!probe.ok || probe.value.newEntries > probe.value.free) {
      return err(`инвентарь полон: ${entry.defId} ×${entry.qty} не влезет (свободно слотов ${probe.ok ? probe.value.free : 0}) — крот разводит лапами`);
    }
  }
  const t = x.transaction.transact({
    costs: [{ t: 'currency', id: 'gold', qty: entry.price * entry.qty }],
    eventId: 'mine.trader',
    reason: `покупка у крота: ${def.name} ×${entry.qty} (наценка ${p.markupPercent}% по данным)`,
  });
  if (!t.ok) return err(t.error);
  const lines = [`${def.name} ×${entry.qty} — ${entry.price * entry.qty}з (${entry.price}з/шт = база ${entry.base} + кротовая наценка ${p.markupPercent}%, PriceBus)`];
  if (isTorch) {
    run.torches += entry.qty;
    lines.push(`факелы → run.torches (+${entry.qty} → ${run.torches})`);
  } else {
    const r = x.deps.acquireItem(entry.defId, entry.qty, 'mine.trader');
    if (!r.ok) return err(`оплата прошла, но доставка не удалась: ${r.error}`);
    lines.push(`${entry.defId} ×${entry.qty} → основной инвентарь (D23-проба пройдена, acquire)`);
  }
  if (isScroll) lines.push('свиток в рюкзаке: mine pick 0 в забеге — добровольный выход 100%');
  x.markDirty();
  return ok({ header: 'Торговец-крот', lines });
}

/** свиток выхода: run-эффект из данных — потребление + конец 'exit' 100% */
function applyScroll(x: RunCtx, run: MineRunState): Result<CardResolution> {
  const effects = x.runEffects as MineRunEffectItem[];
  const owned = effects.find((r) => x.deps.itemCount(r.defId) > 0);
  if (owned === undefined) {
    return err('нет свитка выхода в рюкзаке — ищите лестницу или бейтесь с боссом (крот продаёт свитки)');
  }
  const t = x.transaction.transact({
    costs: [{ t: 'item', defId: owned.defId, qty: 1 }],
    eventId: 'mine.exitScroll',
    reason: 'использование свитка выхода (run-эффект из данных)',
  });
  if (!t.ok) return err(t.error);
  const end = endRun(x, 'exit');
  if (!end.ok) return err(end.error);
  const lines = [
    `свиток выхода прочитан — добровольный выход (100% выдача)`,
    `выдано: ${end.value.granted.map((g) => `${g.defId} ×${g.qty}${g.tier !== undefined ? ` (${g.tier})` : ''}`).join(' + ') || 'рюкзак забега пуст'}`,
  ];
  if (end.value.lostByCapacity.length > 0) {
    lines.push(`НЕ влезло (поимённо): ${end.value.lostByCapacity.map((l) => `${l.defId} ×${l.qty}`).join(', ')}`);
  }
  return ok({ header: 'Свиток выхода', lines });
}

/** зелье: BUF-1 — штатный Buff-канал ядра (kernel.buff, duration runs) */
function drinkPotion(x: RunCtx, run: MineRunState, n: number): Result<CardResolution> {
  const potions = potionsInBag(x);
  const p = potions[n - 1];
  if (p === undefined) {
    return err(`нет зелья №${n} (в рюкзаке ${potions.length}; список — витрина mine run)`);
  }
  const def = x.items.find((d) => d.id === p.defId) as ItemDef | undefined;
  const modEffect = def?.useAction?.effects.find((ef) => ef.t === 'modifier');
  const baseMod = modEffect?.mod as Modifier | undefined;
  if (baseMod === undefined) return err(`у ${p.defId} нет modifier-эффекта (контент сломан)`);
  const t = x.transaction.transact({
    costs: [{ t: 'item', defId: p.defId, qty: 1 }],
    eventId: 'mine.potion',
    reason: `выпито в забеге: ${def?.name ?? p.defId} (BUF-1: потребление в забеге)`,
  });
  if (!t.ok) return err(t.error);
  // БЕЗ mod.tags: tags модификатора — КОНТЕКСТ-ФИЛЬТР шины (не маркер!);
  // очистка runs-бафа при runEnded — по id-префиксу mine.potion. (API владельца)
  const mod: Modifier = {
    ...baseMod,
    id: `mine.potion.${p.defId}.${run.runNumber}`,
  };
  const r = x.deps.addBuff(mod);
  if (!r.ok) return err(r.error);
  const lines = [
    `${def?.name ?? p.defId} выпито: ${mod.stat} ${mod.op} ${mod.value}${mod.op === 'inc' ? '%' : ''} (Buff-канал ядра, duration: runs — до конца забега)`,
  ];
  const after = x.statBus.resolve({ stat: mod.stat, ctx: { ...x.time.ctx('player'), tags: ['mine', `layer:${run.layer}`] } });
  lines.push(`resolve('${mod.stat}') сейчас = ${after}`);
  return ok({ header: 'Зелье', lines });
}

/** обвал: какую карту следующей колонки засыпать (выбор из оставшихся 2) */
function collapsePick(x: RunCtx, run: MineRunState, index: number): Result<CardResolution> {
  if (run.column >= 5) return err('следующей колонки нет — обвал уже отыгран');
  const from = run.column * CARDS_PER_COLUMN;
  const next = run.cards.slice(from, from + CARDS_PER_COLUMN);
  const card = next[index - 1];
  if (card === undefined || card.destroyed === true) {
    return err(`нет карты №${index} в следующей колонке (1..3)`);
  }
  card.destroyed = true;
  run.pendingCollapse = false;
  x.markDirty();
  return ok({
    header: 'Обвал — карта засыпана',
    lines: [`карта ${index} колонки ${run.column + 1} уничтожена — на развилке останется выбор из оставшихся 2`],
  });
}

/** публичный вход: mine pick <arg> */
export function pickCard(x: RunCtx, argRaw: string): Result<CardResolution> {
  const state = x.getState();
  const run = state.run;
  if (run === undefined) {
    return err('забега нет — начните новый: mine enter <слой> (витрина: mine run)');
  }
  // режим крота: покупки стока / уход
  if (run.traderOpen) {
    if (argRaw === '0') {
      run.traderOpen = false;
      x.markDirty();
      return ok({ header: 'Торговец-крот', lines: ['крот машет лапой — торговая сессия закрыта'] });
    }
    const i = Number(argRaw);
    if (!Number.isInteger(i) || i < 1) {
      return err('в режиме крота: mine pick <№ позиции> — покупка, mine pick 0 — уйти');
    }
    return traderBuy(x, run, i);
  }
  // режим обвала: выбор карты к утрате
  if (run.pendingCollapse) {
    const i = Number(argRaw);
    if (!Number.isInteger(i) || i < 1 || i > 3) {
      return err('обвал требует выбора: mine pick <1..3> — какую карту следующей колонки засыпать');
    }
    return collapsePick(x, run, i);
  }
  // свиток выхода
  if (argRaw === '0') {
    return applyScroll(x, run);
  }
  // зелье
  if (argRaw.startsWith('p')) {
    const n = Number(argRaw.slice(1));
    if (!Number.isInteger(n) || n < 1) return err('формат зелья: mine pick p<N> (список — витрина mine run)');
    return drinkPotion(x, run, n);
  }
  // карта текущей колонки
  const i = Number(argRaw);
  if (!Number.isInteger(i) || i < 1 || i > 3) {
    return err('формат: mine pick <1..3> — карта колонки · mine pick 0 — свиток выхода · mine pick p<N> — зелье');
  }
  const from = (run.column - 1) * CARDS_PER_COLUMN;
  const to = run.column >= 5 ? run.cards.length : from + CARDS_PER_COLUMN;
  const alive = run.cards.slice(from, to).filter((c) => c.destroyed !== true);
  const card = alive[i - 1];
  if (card === undefined) {
    return err(`нет карты №${i} в колонке ${run.column} (живых карт: ${alive.length})`);
  }
  const layerDef = x.layers.find((l) => l.layer === run.layer);
  if (layerDef === undefined) return err(`слой ${run.layer} вне данных шахты`);
  const r = resolveCard(x, run, card, layerDef);
  if (!r.ok) return err(r.error);
  if (x.getState().run !== undefined) {
    card.resolved = true;
    run.cardsResolved += 1;
    if (run.column < 5) run.column += 1;
    if (card.kind === 'trader') run.traderOpen = true;
    x.markDirty();
  }
  return r;
}

/** запуск резолвера карты (вынесен из pick для мест боя/не-боя) */
export { resolveCard } from './resolve';
export { runMobFight, runBossFight } from './fight-run';
export type { CardResolution } from './resolve';
export type { RunCard } from './state';
