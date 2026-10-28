/**
 * Резолверы ДАННЫХ карт M13.1 (распил resolve.ts по wc-гигиене): обвал,
 * алтарь, родник, костёр, лагерь — читают пейлоады карточки обобщённо (П5).
 */
import type { MineLayerDef } from '@/content/mine/layers';
import type { MineCardsPayloads } from '@/content/mine/cards';
import { rollItem } from './loot';
import { collectToBag, rollQuality } from './bag';
import { applyRunDamage, grantRunGold, campRegen } from './resolve';
import type { RunCtx } from './run';
import type { CardResolution } from './resolve';
import type { MineRunState, RunCard } from './state';

export function resolveCollapse(x: RunCtx, run: MineRunState, card: RunCard): CardResolution {
  const p = card.payload as MineCardsPayloads['collapse'];
  const key = `${run.runId}:collapse`;
  const dmg = Math.floor(x.rngBus.rollRange(0, 1, 'uniform', `mine:run:collapse:${key}`) * (p.damage[1] - p.damage[0] + 1)) + p.damage[0];
  applyRunDamage(x, run, dmg, `mine.run:collapse:${run.runId}`);
  const lines = [`ОБВАЛ! −${dmg} HP`];
  if (x.getState().run === undefined) {
    lines.push('смерть — забег завершён (подписка M13.1)');
    return { header: 'Обвал', lines };
  }
  // [FIX-M13 · P1 / DECISION FIX13-1(а)] гейт засыпания по ЦЕЛИ: здесь
  // run.column — ПРЕ-сдвиговая колонка разрешения N; следующая колонка N+1.
  // Обвал на колонке 4 → следующая колонка 5 = финал с картой-боссом: ЦЕЛЬ
  // неприкосновенна, засыпать нечего — обвал закрывается честной витриной
  // БЕЗ установки pendingCollapse (ранее мёртвый гейт >= 5 пропускал обвал
  // колонки 4 → вечный перехват входов — AUDIT-M13-BLOCKER-1)
  if (run.column >= 4) {
    lines.push('обвал отыгран — засыпать нечего: следующая колонка — финал с боссом (босса уничтожить нельзя)');
  } else {
    run.pendingCollapse = true;
    lines.push(`обвал грозит СЛЕДУЮЩЕЙ колонке (колонка ${run.column + 1}): mine pick <1..3> — какую карту засыпать (свиток 0 и зелья p<N> доступны всегда)`);
  }
  return { header: 'Обвал', lines };
}

export function resolveSpring(x: RunCtx, run: MineRunState, card: RunCard): CardResolution {
  const p = card.payload as MineCardsPayloads['spring'];
  const hp = x.deps.playerHp();
  const heal = Math.max(1, Math.floor((hp.current * p.healPercent) / 100));
  x.deps.healHp(heal, `mine.run:spring:${run.runId}`);
  run.hp = x.deps.playerHp().current;
  const lines = [`родник: +${p.healPercent}% от текущего HP → +${heal} (канал лечения M01)`];
  const regen = campRegen(x, run);
  if (regen !== null) lines.push(regen);
  return { header: 'Родник', lines };
}

export function resolveCampfire(run: MineRunState): CardResolution {
  run.campfire = true;
  return { header: 'Костёр', lines: ['ЧЕКПОЙНТ: при смерти потеря −5% вместо −20% (карточка §3)'] };
}

export function resolveAltar(x: RunCtx, run: MineRunState, card: RunCard): CardResolution {
  const p = card.payload as MineCardsPayloads['altar'];
  const pick = Math.floor(x.rngBus.rollRange(0, 1, 'uniform', `mine:run:altar:${run.runId}`) * p.offers.length);
  const offer = p.offers[Math.min(p.offers.length - 1, pick)]!;
  const lines = [`алтарь: «${offer.label}»`];
  // жертва: ровно один способ (данные); непосильная — честный noop [DECISION]
  if (offer.price.gold !== undefined) {
    const t = x.transaction.transact({
      costs: [{ t: 'currency', id: 'gold', qty: offer.price.gold }],
      eventId: 'mine.altar',
      reason: `жертва алтаря (забег ${run.runId})`,
    });
    if (!t.ok) {
      lines.push(`жертва невозможна (${t.error}) — алтарь погас`);
      return { header: 'Алтарь', lines };
    }
    lines.push(`жертва: ${offer.price.gold}з (mine.altar)`);
  } else if (offer.price.hp !== undefined) {
    if (x.deps.playerHp().current <= offer.price.hp) {
      lines.push(`жертва невозможна (HP ${x.deps.playerHp().current} ≤ ${offer.price.hp}) — алтарь погас`);
      return { header: 'Алтарь', lines };
    }
    applyRunDamage(x, run, offer.price.hp, `mine.run:altar:${run.runId}`);
    lines.push(`жертва: −${offer.price.hp} HP`);
  } else if (offer.price.item !== undefined) {
    const t = x.transaction.transact({
      costs: [{ t: 'item', defId: offer.price.item.defId, qty: offer.price.item.qty }],
      eventId: 'mine.altar',
      reason: `жертва алтаря (забег ${run.runId})`,
    });
    if (!t.ok) {
      lines.push(`жертва невозможна (${t.error}) — алтарь погас`);
      return { header: 'Алтарь', lines };
    }
    lines.push(`жертва: ${offer.price.item.defId} ×${offer.price.item.qty} (mine.altar)`);
  }
  run.altarMods.push({
    id: `mine.altar.${run.runNumber}.${run.cardsResolved}`,
    stat: offer.mod.stat,
    op: offer.mod.op,
    value: offer.mod.value,
    label: offer.mod.label,
  });
  x.bus.publish('invalidate.stat', { stats: [offer.mod.stat] });
  lines.push(`баф забега: ${offer.mod.label} — ${offer.mod.stat} ${offer.mod.op} +${offer.mod.value} (duration: runs — до конца забега)`);
  const regen = campRegen(x, run);
  if (regen !== null && x.getState().run !== undefined) lines.push(regen);
  return { header: 'Алтарь', lines };
}

export function resolveCamp(x: RunCtx, run: MineRunState, card: RunCard, layerDef: MineLayerDef): CardResolution {
  const p = card.payload as MineCardsPayloads['camp'];
  const key = `${run.runId}:camp`;
  const roll = (id: string) => x.rngBus.rollRange(0, 1, 'uniform', id);
  const total = p.finds.reduce((s, f) => s + f.weight, 0);
  let pick = roll(`mine:run:camp:find:${key}`) * total;
  let find = p.finds[p.finds.length - 1]!;
  for (const f of p.finds) {
    pick -= f.weight;
    if (pick < 0) {
      find = f;
      break;
    }
  }
  const lines: string[] = [];
  if (find.kind === 'torches') {
    run.torches += find.torches ?? 1;
    lines.push(`находка: факел ×${find.torches ?? 1} (run.torches → ${run.torches})`);
  } else if (find.kind === 'gold') {
    const gold = Math.floor(roll(`mine:run:camp:gold:${key}`) * ((find.gold ?? [5, 15])[1] - (find.gold ?? [5, 15])[0] + 1)) + (find.gold ?? [5, 15])[0];
    grantRunGold(x, gold, `лагерь (забег ${run.runId})`);
    lines.push(`находка: ${gold}з → кошелёк (mine.lootRun)`);
  } else {
    const item = rollItem(layerDef, key, roll);
    if (item !== null) {
      const q = rollQuality(x);
      const r = collectToBag(x, run, item.defId, item.qty, q);
      lines.push(`находка: ${item.defId} ×${item.qty} (${q.tier}) → runBag${r.lost > 0 ? ` — ${r.lost} НЕ влезло` : ''}`);
    } else {
      lines.push('находка: пусто (шанс предмета не сработал)');
    }
  }
  const ev = p.events[Math.floor(roll(`mine:run:camp:event:${key}`) * p.events.length)] ?? p.events[0]!;
  const choice = ev.choices[Math.min(ev.choices.length - 1, ev.autoPick)]!;
  lines.push(`событие: ${ev.text}`);
  lines.push(`выбор (auto до фазы 6): «${choice.label}»`);
  if (choice.effect.heal !== undefined) {
    x.deps.healHp(choice.effect.heal, `mine.run:camp:${run.runId}`);
    run.hp = x.deps.playerHp().current;
    lines.push(`→ +${choice.effect.heal} HP (канал M01)`);
  }
  if (choice.effect.gold !== undefined) {
    const gold = Math.floor(roll(`mine:run:camp:evgold:${key}`) * (choice.effect.gold[1] - choice.effect.gold[0] + 1)) + choice.effect.gold[0];
    grantRunGold(x, gold, `лагерь-событие (забег ${run.runId})`);
    lines.push(`→ ${gold}з → кошелёк`);
  }
  if (choice.effect.torches !== undefined) {
    run.torches += choice.effect.torches;
    lines.push(`→ факел ×${choice.effect.torches} (run.torches → ${run.torches})`);
  }
  const regen = campRegen(x, run);
  if (regen !== null && x.getState().run !== undefined) lines.push(regen);
  return { header: 'Заброшенный лагерь', lines };
}

