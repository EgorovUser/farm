/**
 * Резолвер карт M13.1 (бриф R3, карточка §2): mine.pick — универсальный
 * «выбор» забега [DECISION]: 1..3 — карта текущей колонки; 0 — свиток выхода
 * (run-эффект из данных MINE_RUN_EFFECTS); p<N> — выпить зелье из рюкзака
 * (BUF-1: штатный Buff-канал ядра, потребление в забеге). Режимы: обвал
 * (pendingCollapse — выбор карты к утрате), крот (traderOpen — покупка стока).
 *
 * Разрешение карты — обёртка ПУБЛИКУЕТ mine.cardResolved {kind, cardId,
 * column, исход, лут?} и применяет транзакции; бои — движок M12 resolveFight
 * (паттерн M12.1 F3), лут боя → runBag (НЕ в инвентарь), золото — сразу в
 * кошелёк (TransactionService eventId mine.lootRun). Тексты честные,
 * нул-лут НЕ печатает невыданное (урок AUDIT-M12-OBS-4).
 */
import type { Result } from '@/shared/types/result';
import { err, ok } from '@/shared/types/result';
import type { Modifier } from '@/kernel/bus/stat-bus/modifier';
import type { MineLayerDef } from '@/content/mine/layers';
import type { MineCardsPayloads, MineRunEffectItem } from '@/content/mine/cards';
import type { ItemDef } from '@/content/items/items';
import { runMobFight, runBossFight } from './fight-run';
import { resolveCollapse, resolveSpring, resolveCampfire, resolveAltar, resolveCamp } from './resolve-cards';
import { BOSS_CARD_INDEX, columnOfCard, CARDS_PER_COLUMN } from './generator';
import { rollOre, rollItem } from './loot';
import { endRun, type RunCtx } from './run';
import { collectOre, collectToBag, rollQuality } from './bag';
import type { MineRunState, RunCard } from './state';

export interface CardResolution {
  header: string;
  lines: string[];
}

/** зелья в рюкзаке — по каталогу + itemCount (П5: любые consumable с 'modifier') */
export function potionsInBag(x: RunCtx): Array<{ defId: string; name: string; stat: string; value: number; qty: number }> {
  const items = x.items;
  const out: Array<{ defId: string; name: string; stat: string; value: number; qty: number }> = [];
  for (const def of items) {
    if (def.itemType !== 'consumable' || def.useAction === undefined) continue;
    const modEffect = def.useAction.effects.find((ef) => ef.t === 'modifier');
    if (modEffect === undefined) continue;
    const mod = modEffect.mod as Modifier | undefined;
    if (mod === undefined || typeof mod.stat !== 'string') continue;
    const qty = x.deps.itemCount(def.id);
    if (qty < 1) continue;
    out.push({ defId: def.id, name: def.name, stat: mod.stat, value: Number(mod.value) || 0, qty });
  }
  return out;
}

/** колонка N: живые (не уничтоженные) карты */
function columnCards(run: MineRunState, column: number): RunCard[] {
  const from = (Math.min(column, 5) - 1) * CARDS_PER_COLUMN;
  const to = column >= 5 ? run.cards.length : from + CARDS_PER_COLUMN;
  return run.cards.slice(from, to).filter((c) => c.destroyed !== true);
}

/** урон карты (обвал/ловушка): смерть — подписка M13.1 (deaths+cozy+конец) */
export function applyRunDamage(x: RunCtx, run: MineRunState, amount: number, reason: string): void {
  x.deps.damageHp(amount, reason);
  run.hp = Math.max(1, x.deps.playerHp().current);
}

/** золото сразу в кошелёк (R4: eventId mine.lootRun) */
export function grantRunGold(x: RunCtx, gold: number, reason: string): boolean {
  if (gold < 1) return true;
  const t = x.transaction.transact({
    grants: [{ t: 'currency', id: 'gold', qty: gold }],
    eventId: 'mine.lootRun',
    reason,
  });
  return t.ok;
}

/** реген «Оборудования лагеря»: 1 HP / 3 разрешённые карты (через канал M01) */
export function campRegen(x: RunCtx, run: MineRunState): string | null {
  const gear = x.upgradeDefs.find((u) => u.effect.t === 'campgear');
  if (gear === undefined || x.getState().upgrades?.[gear.id] !== true) return null;
  const eff = gear.effect as { perCards: number; hp: number };
  if (run.cardsResolved % eff.perCards !== 0 || run.cardsResolved < eff.perCards) return null;
  const before = x.deps.playerHp().current;
  if (before >= x.deps.playerHp().max) return null;
  x.deps.healHp(eff.hp, 'mine.run:camp');
  run.hp = x.deps.playerHp().current;
  return `оборудование лагеря: +${eff.hp} HP (карта №${run.cardsResolved})`;
}

// ------------------------------------------------------------------ резолверы

function resolveEmpty(x: RunCtx, run: MineRunState, card: RunCard): CardResolution {
  const p = card.payload as MineCardsPayloads['empty'];
  x.deps.addXp(p.xp, 'mine.cardResolved');
  const regen = campRegen(x, run);
  return { header: 'Пустая пещера', lines: [`тишина и камень · +${p.xp} XP (канал M01)`, ...(regen !== null ? [regen] : [])] };
}

function resolveOreVein(x: RunCtx, run: MineRunState, card: RunCard, layerDef: MineLayerDef): CardResolution {
  const p = card.payload as MineCardsPayloads['oreVein'];
  const base = rollOre(layerDef, `${run.runId}:vein`, (id) => x.rngBus.rollRange(0, 1, 'uniform', id));
  const r = collectOre(x, run, layerDef, base, p.qtyMult);
  const lines = [`жила слоя: ${layerDef.ore.defId} ×${r.qty} (тир руды = слою, канал M12) → runBag`];
  if (r.lost > 0) lines.push(`рюкзак забега полон — ${r.lost} осталось в шахте (слоты runBag)`);
  const regen = campRegen(x, run);
  if (regen !== null) lines.push(regen);
  return { header: 'Рудная жила', lines };
}

function resolveChest(x: RunCtx, run: MineRunState, card: RunCard, layerDef: MineLayerDef): CardResolution {
  const p = card.payload as MineCardsPayloads['chest'];
  const key = `${run.runId}:chest`;
  const roll = (id: string) => x.rngBus.rollRange(0, 1, 'uniform', id);
  const gold = Math.floor(roll(`mine:run:chest:gold:${key}`) * (p.gold[1] - p.gold[0] + 1)) + p.gold[0];
  grantRunGold(x, gold, `сундук (забег ${run.runId})`);
  const lines = [`сундук: ${gold}з → кошелёк (mine.lootRun)`];
  for (let i = 0; i < p.itemRolls; i++) {
    const item = rollItem(layerDef, `${key}:${i}`, roll);
    if (item !== null) {
      const q = rollQuality(x);
      const r = collectToBag(x, run, item.defId, item.qty, q);
      lines.push(`${item.defId} ×${item.qty} (${q.tier}) → runBag${r.lost > 0 ? ` — ${r.lost} НЕ влезло (слоты)` : ''}`);
    }
  }
  if (roll(`mine:run:chest:trap:${key}`) * 100 < p.trapChance) {
    const dmg = Math.floor(roll(`mine:run:chest:trapdmg:${key}`) * (p.trapDamage[1] - p.trapDamage[0] + 1)) + p.trapDamage[0];
    applyRunDamage(x, run, dmg, `mine.run:trap:${run.runId}`);
    lines.push(`ЛОВУШКА! −${dmg} HP${x.getState().run === undefined ? ' — смерть (подписка M13.1)' : ''}`);
  }
  const regen = campRegen(x, run);
  if (regen !== null && x.getState().run !== undefined) lines.push(regen);
  return { header: 'Сундук', lines };
}

function resolveExit(x: RunCtx, run: MineRunState): Result<CardResolution> {
  const r = endRun(x, 'exit');
  if (!r.ok) return err(r.error);
  const lines = ['ЛЕСТНИЦА ВВЕРХ — добровольный выход', `выдача 100%: ${r.value.granted.map((g) => `${g.defId} ×${g.qty}${g.tier !== undefined ? ` (${g.tier})` : ''}`).join(' + ') || 'рюкзак забега пуст'}`];
  if (r.value.lostByCapacity.length > 0) {
    lines.push(`НЕ влезло в инвентарь (поимённо): ${r.value.lostByCapacity.map((l) => `${l.defId} ×${l.qty}`).join(', ')} — слоты основного рюкзака`);
  }
  return ok({ header: 'Лестница вверх', lines });
}

// ------------------------------------------------------------------ диспетчер

/**
 * Разрешение карты: чистая координация по kind (данные, П5) → обёртки выше;
 * публикует mine.cardResolved {kind, cardId, column, исход, лут?} (R3) и
 * возвращает витрину. Бои — движок M12 (fight-run.ts); смерть внутри карты
 * завершает забег подпиской (колонку двигает pick).
 */
export function resolveCard(
  x: RunCtx,
  run: MineRunState,
  card: RunCard,
  layerDef: MineLayerDef,
): Result<CardResolution> {
  let r: Result<CardResolution>;
  switch (card.kind) {
    case 'empty':
      r = ok(resolveEmpty(x, run, card));
      break;
    case 'oreVein':
      r = ok(resolveOreVein(x, run, card, layerDef));
      break;
    case 'chest':
      r = ok(resolveChest(x, run, card, layerDef));
      break;
    case 'collapse':
      r = ok(resolveCollapse(x, run, card));
      break;
    case 'mob':
      r = runMobFight(x, run, card, layerDef);
      break;
    case 'boss':
      r = runBossFight(x, run, card, layerDef);
      break;
    case 'altar':
      r = ok(resolveAltar(x, run, card));
      break;
    case 'spring':
      r = ok(resolveSpring(x, run, card));
      break;
    case 'campfire':
      r = ok(resolveCampfire(run));
      break;
    case 'trader':
      r = ok({ header: 'Торговец-крот', lines: ['крот раскладывает товар (сток данными, наценка PriceBus)', 'покупки: mine pick <№> · уйти: mine pick 0'] });
      break;
    case 'camp':
      r = ok(resolveCamp(x, run, card, layerDef));
      break;
    case 'exit':
      r = resolveExit(x, run);
      break;
    default:
      return err(`неизвестный вид карты: ${String(card.kind)} (контент сломан)`);
  }
  if (r.ok) {
    const alive = x.getState().run !== undefined;
    x.bus.publish('mine.cardResolved', {
      kind: card.kind,
      cardId: card.id,
      column: columnOfCard(run.cards.indexOf(card) >= 0 ? run.cards.indexOf(card) : BOSS_CARD_INDEX),
      outcome: r.value.header,
      ...(card.kind === 'mob' || card.kind === 'boss' ? { mobId: card.mobId ?? (card.kind === 'boss' ? String(card.payload) : undefined) } : {}),
      lines: r.value.lines,
      runAlive: alive,
    });
  }
  return r;
}
