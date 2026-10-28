/**
 * Витрины M13.1 (бриф R8): `mine run` — слой/колонка/3 карты колонки
 * (скрытость честно)/факелы/runBag слоты+содержимое/статус слоя/чекпойнт/
 * HP/«Насыщенность»; `mine gen` — оракул расклада (сид); сток крота и зелья
 * рюкзака — списки для mine pick. Тексты честные, шансы числом (П6);
 * нул-лут НЕ печатает невыданное (урок AUDIT-M12-OBS-4).
 */
import type { MineLayerDef } from '@/content/mine/layers';
import { CARDS_PER_COLUMN, columnOfCard, COLUMNS, BOSS_CARD_INDEX } from './generator';
import type { RunCtx } from './run';
import { bagSlotsOf } from './bag';
import { cardTitle } from './torch';
import { potionsInBag } from './resolve';
import { traderStockView } from './pick';
import { helperLevelOf } from './helpers-hire';
import type { MineRunState, RunCard } from './state';

export interface RunView {
  header: string;
  lines: string[];
}

const STATUS_RU: Record<string, string> = {
  cold: 'холодный',
  dark: 'тёмный',
  poison: 'ядовитый',
  hot: 'жаркий',
};

/** витрина активного забега (без забега — честное «забега нет») */
export function buildRunView(x: RunCtx): RunView {
  const run = x.getState().run;
  if (run === undefined) {
    return {
      header: 'Забег шахты (mine.run)',
      lines: ['забега нет — начните новый: mine enter <слой> (прогресс колонок между забегами НЕ сохраняется — рогалик)'],
    };
  }
  const layerDef = x.layers.find((l) => l.layer === run.layer);
  const lines: string[] = [];
  lines.push(`забег №${run.runNumber} · слой ${run.layer} · колонка ${run.column}/${COLUMNS} · сид ${run.seed}`);
  if (run.status !== null) {
    lines.push(`статус слоя: ${STATUS_RU[run.status] ?? run.status} (тег ctx status:${run.status})`);
  } else {
    lines.push('статус слоя: обычный (без тега)');
  }
  lines.push(`«Насыщенность шахты»: ${run.firstOfDay ? 'ДА — первый забег дня, руда +10% (inc на mine.oreYield)' : 'нет (сегодня уже спускались)'}`);
  lines.push(`HP: ${x.deps.playerHp().current}/${x.deps.playerHp().max} (зеркало run.hp ${run.hp} — истина M01)`);
  lines.push(`факелы: ${run.torches} (mine torch [i] — вскрыть скрытую; режимы — данными)`);
  if (run.campfire) lines.push('чекпойнт КОСТЁР: при смерти −5% вместо −20%');
  if (run.altarMods.length > 0) {
    lines.push(`бафы алтарей: ${run.altarMods.map((m) => `${m.label} (${m.stat} ${m.op} ${m.value})`).join(' · ')} — duration: runs`);
  }
  // карты текущей колонки (скрытость честно)
  const from = (run.column - 1) * CARDS_PER_COLUMN;
  const to = run.column >= 5 ? run.cards.length : from + CARDS_PER_COLUMN;
  const cards = run.cards.slice(from, to);
  const alive = cards.filter((c) => c.destroyed !== true);
  if (run.column >= 5) {
    lines.push(`ФИНАЛ: ${alive.map((c) => cardTitle(c)).join(' · ')} — mine pick 1`);
  } else {
    const labels = cards.map((c, i) => {
      if (c.destroyed === true) return `${i + 1}:✖засыпана`;
      const title = c.hidden && c.revealed !== true ? '?? (скрыта — факел?' : cardTitle(c);
      return `${i + 1}: ${title}${c.hidden && c.revealed !== true ? ')' : ''}`;
    });
    lines.push(`колонка ${run.column} (выбор из ${alive.length}): ${labels.join(' | ')}`);
  }
  // runBag: слоты + содержимое
  const cap = bagSlotsOf(x, x.getState());
  const bag =
    run.runBag.length === 0
      ? 'пусто'
      : run.runBag.map((e) => `${e.defId} ×${e.qty}${e.quality !== undefined ? ` (${e.quality.tier})` : ''}`).join(' + ');
  lines.push(`runBag: ${run.runBag.length}/${cap} слотов · ${bag} (выдача: лестница/босс 100% · смерть −${run.campfire ? 5 : 20}%`);
  // [M13.2 · R2/R8] состав помощников забега поимённо: HP/статус/репутация-уровень
  if (run.helpers.length === 0) {
    lines.push('помощники: в забеге никого (наём — mine helpers; состав фиксируется на старте)');
  } else {
    const roster = run.helpers.map((rh) => {
      const inst = (x.getState().helpers ?? []).find((h) => h.instanceId === rh.instanceId);
      const p = inst !== undefined ? x.profileOf(inst.defId) : null;
      if (inst === undefined || p === null) return `${rh.instanceId} (?)`;
      const level = helperLevelOf(inst.reputation, x.helpersTable);
      const revive = rh.status.includes('revive:used') ? ' · перк воскрешения ИСПОЛЬЗОВАН' : '';
      return `${p.name} (${p.classId}) — HP ${inst.hp} · репутация ${inst.reputation} (ур. ${level})${revive}`;
    });
    lines.push(`помощники (${run.helpers.length}): ${roster.join(' · ')}`);
    lines.push(`золото мобов забега: ${run.mobGold}з (база доли ${x.helpersTable.sharePoolPercent}% по вкладу · вклад игрока ${run.contrib['player'] ?? 0})`);
  }
  // режимы
  // [FIX-M13 · P1] витрина режима честна: свиток/зелья доступны всегда
  if (run.pendingCollapse) lines.push('РЕЖИМ ОБВАЛА: mine pick <1..3> — какую карту следующей колонки засыпать (свиток mine pick 0 и зелья p<N> доступны всегда; босс не засыпается)');
  if (run.traderOpen) {
    const stock = traderStockView(x, run);
    lines.push(`РЕЖИМ КРОТА: ${stock.map((s, i) => `${i + 1}: ${s.defId} ×${s.qty} — ${s.price}з`).join(' | ')} · 0: уйти`);
  }
  const potions = potionsInBag(x);
  if (potions.length > 0) {
    lines.push(`зелья в рюкзаке: ${potions.map((p, i) => `p${i + 1}: ${p.name} (${p.stat} ${p.value})`).join(' · ')} — mine pick p<N>`);
  }
  const scrolls = x.runEffects.filter((r) => x.deps.itemCount(r.defId) > 0);
  if (scrolls.length > 0) lines.push(`свиток выхода в рюкзаке — mine pick 0: добровольный выход 100%`);
  return { header: `Забег шахты (mine.run) — слой ${run.layer}`, lines };
}

/** оракул расклада: mine gen <layer> [--seed S] — построчно 12 карт + босс */
export function buildGenView(
  cards: RunCard[],
  layerDef: MineLayerDef,
  seed: number,
  status: string | null,
  openInfo: { hiddenChance: number; luck: number },
): RunView {
  const lines: string[] = [];
  lines.push(`сид ${seed} · доля скрытых ${openInfo.hiddenChance}% (mine.hiddenChance; lucky-вес × (1 + mine.luck.hidden ${openInfo.luck}/100))`);
  if (status !== null) lines.push(`статус слоя: ${STATUS_RU[status] ?? status} (тег status:${status})`);
  for (let c = 1; c <= COLUMNS; c++) {
    const from = (c - 1) * CARDS_PER_COLUMN;
    const row = cards
      .slice(from, from + CARDS_PER_COLUMN)
      .map((card, i) => `${i + 1}: ${cardTitle(card)}${card.hidden ? ' [скрыта]' : ' [открыта]'}`)
      .join(' | ');
    lines.push(`колонка ${c}: ${row}`);
  }
  lines.push(`финал: ${cardTitle(cards[BOSS_CARD_INDEX]!)} (в колонки не роллится — вес 0)`);
  return { header: `Оракул генерации: слой ${layerDef.layer} (mine.gen)`, lines };
}

/** витрина входа-с-забегом (расширение EnterView M12.2 — строки забега) */
export function runStartLines(
  run: MineRunState,
  liftApplied: boolean,
  liftNote: string | null,
): string[] {
  const lines = [
    `ЗАБЕГ НАЧАТ: №${run.runNumber} · сид ${run.seed} = hash(saveId, layer, runNumber) — воспроизводим`,
    `колонка ${run.column}/4 · карт 12 + финальный босс · ${run.cards.filter((c) => c.hidden).length} скрытых (40% базой, lucky-вес mine.luck.hidden)`,
  ];
  if (run.status !== null) {
    lines.push(`статус слоя: ${STATUS_RU[run.status] ?? run.status} (тег status:${run.status})`);
  }
  lines.push(
    run.firstOfDay
      ? '«Насыщенность шахты»: первый забег дня — руда +10% (inc на mine.oreYield)'
      : '«Насыщенность шахты»: сегодня уже спускались — без бонуса',
  );
  if (liftApplied) lines.push('ЛИФТ: старт с колонки 4 (ачивка босса слоя есть)');
  if (liftNote !== null) lines.push(liftNote);
  return lines;
}

export { columnOfCard };
