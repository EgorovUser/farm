/**
 * Команды модуля M10 «Заточка» (карточка §6 + брифы M10.1 §4.7 / M10.2 §4.5):
 * attempt-цикл, витрины (stats/info — числа на стол, П6; разложение шанса —
 * сумма компонентов = итогу, гигиена §1.1), dev-форс, покупка станка/круга,
 * карточки уровней (§5): ручной выбор/отказ + переключатель auto.
 */
import type { CommandRegistry } from './console-types';

type R<T> = { ok: true; value: T } | { ok: false; error: string };

interface Breakdown {
  base: number;
  pity: number;
  circle: number;
  decline: number;
  chance: number;
  capped: boolean;
}

interface CardsReceipt {
  iid: string;
  level: number;
  restored: boolean;
  offered: boolean;
  /** [MEL-F · гигиена M15.1] auto-режим: предложения в памяти НЕТ */
  auto?: boolean;
  chosen: Array<{ type: string; value: number }> | null;
  reason?: string;
}

interface AttemptReceipt {
  iid: string;
  defId: string;
  level: number;
  outcome: 'success' | 'fail' | 'rollback';
  toLevel: number;
  breakdown: Breakdown;
  rollbackChance: number;
  cost: { ingots: number; gold: number };
  pityFails: number;
  cards: CardsReceipt | null;
  frozen: boolean | null;
}

interface StatsView {
  iid: string;
  defId: string;
  level: number;
  levelMax: number;
  pityFails: number;
  breakdown: Breakdown;
  declineBonus: number;
  frozenLevels: number[];
  rollbackChance: number;
  cost: { ingots: number; gold: number };
  whetstone: boolean;
  anvil: boolean;
}

interface InfoRow {
  level: number;
  cost: { ingots: number; gold: number };
  baseSuccess: number;
  pity0: number;
  pity5: number;
  rollback: number;
}

interface RollEntry {
  type: string;
  value: number;
}

const pct = (v: number): string => `${(v * 100).toFixed(0).padStart(3)}%`;

/** [гигиена §1.1] разложение: сумма компонентов = итогу (кап — явно) */
function breakdownText(b: Breakdown): string {
  const sum = b.base + b.pity + b.circle + b.decline;
  const parts = [`база ${pct(b.base)}`, `жалость ${pct(b.pity)}`];
  if (b.circle !== 0) parts.push(`круг ${pct(b.circle)}`);
  if (b.decline !== 0) parts.push(`отказ ${pct(b.decline)}`);
  const cap = b.capped ? ` (кап ${pct(0.95)}: сумма ${pct(sum)})` : '';
  return `${pct(b.chance)} = ${parts.join(' + ')}${cap}`;
}

/** карточная строка: типы модов партии с плюсом к шансу/дебафом */
function cardText(rolls: RollEntry[]): string {
  return rolls.map((r) => `${r.type} ${r.value > 0 ? '+' : ''}${r.value}`).join(', ');
}

export function registerForgeCommands(registry: CommandRegistry): void {
  registry.register({
    name: 'forge attempt',
    usage: 'forge attempt <iid>',
    description: 'попытка заточки (слиток + золото; исход — шансы §4; успех — карточки §5)',
    run(args, ctx) {
      const api = ctx.game.modules.get('forge')?.api;
      if (!api) return ctx.printErr('модуль заточки не активен');
      const iid = args[0];
      if (!iid) return ctx.printErr('укажите предмет: forge attempt iron_sword#1 (inv list)');
      const r = api['forge.attempt'](iid) as R<AttemptReceipt>;
      if (!r.ok) return ctx.printErr(r.error);
      const v = r.value;
      const name = ctx.game.content.tryItem(v.defId)?.name ?? v.defId;
      const outcomeText =
        v.outcome === 'success'
          ? `УСПЕХ: L${v.level} → L${v.toLevel}`
          : v.outcome === 'rollback'
            ? `ПРОВАЛ С ОТКАТОМ: L${v.level} → L${v.toLevel}`
            : 'провал (без отката)';
      ctx.printOk(
        `${name}: ${outcomeText} · шанс ${breakdownText(v.breakdown)}, откат ${pct(v.rollbackChance)} · потрачено: ${v.cost.ingots} слиток/слитка + ${v.cost.gold} золота`,
      );
      if (v.outcome !== 'success') {
        ctx.print(`жалость: ${v.pityFails + 1} провал(а) подряд — следующая попытка с бонусом`);
      }
      if (v.frozen === true) {
        ctx.print(`карточка уровня ${v.level} заморожена (frozenCards) — повторное достижение восстановит её`);
      }
      if (v.cards) {
        if (v.cards.restored) {
          ctx.printOk(`карточка уровня ${v.cards.level} ВОССТАНОВЛЕНА из заморозки: ${cardText(v.cards.chosen ?? [])}`);
        } else if (v.cards.chosen && v.cards.chosen.length > 0) {
          ctx.printOk(`карточка уровня ${v.cards.level} (auto): ${cardText(v.cards.chosen)}`);
        } else if (v.cards.offered && v.cards.auto !== true) {
          ctx.print(`уровень ${v.cards.level}: предложение ждёт выбора — forge card <1..3|decline>${v.cards.reason ? ` (${v.cards.reason})` : ''}`);
        } else if (v.cards.reason) {
          // [MEL-F · гигиена M15.1] AUTO-режим: все карточки несовместимы — предложения
          // в памяти НЕТ, «предложение ждёт выбора» описывало несуществующее состояние
          ctx.printWarn(`уровень ${v.cards.level} без карточки: ${v.cards.reason} (auto-режим — предложения нет)`);
        }
      }
      ctx.refresh();
    },
  });

  registry.register({
    name: 'forge stats',
    usage: 'forge stats <iid>',
    description: 'витрина заточки предмета: уровень/эффективный тир/statScale/потолок/pity/заморозка',
    run(args, ctx) {
      const api = ctx.game.modules.get('forge')?.api;
      if (!api) return ctx.printErr('модуль заточки не активен');
      const iid = args[0];
      if (!iid) return ctx.printErr('укажите предмет: forge stats iron_sword#1 (inv list)');
      const r = api['forge.stats'](iid) as R<StatsView>;
      if (!r.ok) return ctx.printErr(r.error);
      const v = r.value;
      const def = ctx.game.content.tryItem(v.defId);
      const name = def?.name ?? v.defId;
      const items = (ctx.game.modules.get('inventory')?.api['inventory.list']?.() ?? []) as Array<{
        iid: string;
        quality: { tier: string; value: number };
        rolledMods?: RollEntry[];
      }>;
      const rec = items.find((i) => i.iid === iid);
      const eff = api['forge.effectiveTier'](iid, rec?.quality.tier) as string;
      const scale = api['forge.statScale'](iid) as number;
      ctx.printTitle(`Заточка · ${name} (${iid})`);
      ctx.print(`уровень:      ${v.level}/${v.levelMax} (потолок станции)`);
      ctx.print(`качество:     ${rec ? `${rec.quality.tier}/${Math.round(rec.quality.value)}` : '—'} → эффективный тир ${eff}`);
      ctx.print(`статы:        ${rec?.rolledMods?.length ? rec.rolledMods.map((m) => `${m.type} ${m.value > 0 ? '+' : ''}${m.value}`).join(', ') : 'без модов'}`);
      ctx.print(`statScale:    ×${scale.toFixed(2)} (к базовым статам при экипировке)`);
      ctx.print(`шанс успеха:  ${breakdownText(v.breakdown)} (провалов подряд: ${v.pityFails})`);
      ctx.print(`шанс отката:  ${pct(v.rollbackChance)} (при провале; от попыток не зависит)`);
      ctx.print(`попытка:      ${v.cost.ingots} слиток/слитка + ${v.cost.gold} золота`);
      if (v.frozenLevels.length > 0) {
        ctx.print(`заморожены:   уровни ${v.frozenLevels.join(', ')} (откат не выжигает карточки)`);
      }
      if (v.declineBonus > 0) {
        ctx.print(`бонус отказа: +${pct(v.declineBonus)} к следующей попытке (одноразовый)`);
      }
      const offers = api['forge.offers']() as Array<{ iid: string; level: number; cards: number }>;
      const mine = offers.find((o) => o.iid === iid);
      if (mine) {
        ctx.print(`предложение:  уровень ${mine.level}, ${mine.cards} карточки — forge card <1..3|decline>`);
      }
      ctx.print(`станок:       ${v.whetstone ? 'построен' : 'НЕТ (forge buy whetstone)'} · наковальня: ${v.anvil ? 'построена' : 'НЕТ (craft.buy anvil)'}`);
    },
  });

  registry.register({
    name: 'forge info',
    usage: 'forge.info',
    description: 'таблица шансов заточки L0..потолок (база/жалость/итог/откат — числа на стол)',
    run(_args, ctx) {
      const api = ctx.game.modules.get('forge')?.api;
      if (!api) return ctx.printErr('модуль заточки не активен');
      const rows = api['forge.info']() as InfoRow[];
      ctx.printTitle(`Заточка · таблица шансов (потолок L${rows.length - 1})`);
      ctx.print('  L   стоимость      база   +0 пров.  +5 пров.  откат');
      for (const r of rows) {
        ctx.print(
          `  ${String(r.level).padStart(3)}  ${r.cost.ingots} слит. + ${String(r.cost.gold).padStart(3)} зол.   ${pct(r.baseSuccess)}   ${pct(r.pity0)}    ${pct(r.pity5)}   ${pct(r.rollback)}`,
        );
      }
    },
  });

  registry.register({
    name: 'forge buy',
    usage: 'forge.buy <whetstone|whetstone_circle>',
    description: 'купить «Точильный станок» / «Точильный круг» (улучшения дома)',
    run(args, ctx) {
      const api = ctx.game.modules.get('forge')?.api;
      if (!api) return ctx.printErr('модуль заточки не активен');
      const id = args[0];
      if (!id) return ctx.printErr('укажите: forge.buy whetstone | whetstone_circle');
      const r = api['forge.buy'](id) as R<{ id: string; name: string; cost: number }>;
      if (!r.ok) return ctx.printErr(r.error);
      ctx.printOk(`построено: «${r.value.name}» за ${r.value.cost} золота`);
      ctx.refresh();
    },
  });

  registry.register({
    name: 'forge force',
    usage: 'forge force <success|fail|rollback|off>',
    description: 'dev: принудительный исход следующих попыток (детерминизм-пробы)',
    run(args, ctx) {
      const api = ctx.game.modules.get('forge')?.api;
      if (!api) return ctx.printErr('модуль заточки не активен');
      const r = api['forge.force'](args[0] ?? 'off') as R<string>;
      if (!r.ok) return ctx.printErr(r.error);
      ctx.printOk(r.value);
    },
  });

  registry.register({
    name: 'forge card',
    usage: 'forge card <1..3|decline> [iid]',
    description: 'выбор/отказ карточки при активном предложении (forge auto off)',
    run(args, ctx) {
      const api = ctx.game.modules.get('forge')?.api;
      if (!api) return ctx.printErr('модуль заточки не активен');
      const pick = args[0];
      if (!pick) {
        const offers = api['forge.offers']() as Array<{ iid: string; level: number; cards: number }>;
        if (offers.length === 0) return ctx.printErr('активных предложений нет (успех в auto-режиме выбирает сразу; forge auto off — ручной)');
        ctx.printTitle('Активные предложения карточек');
        for (const o of offers) {
          ctx.print(`  ${o.iid} · уровень ${o.level} · ${o.cards} карточки — forge card <1..3|decline> ${o.iid}`);
        }
        return;
      }
      const r = api['forge.card'](pick, args[1]) as R<CardsReceipt & { declined?: boolean; bonus?: number }>;
      if (!r.ok) return ctx.printErr(r.error);
      if ((r.value as { declined?: boolean }).declined === true) {
        ctx.printOk(`отказ: бонус следующей попытке +${pct((r.value as { bonus: number }).bonus)} (одноразовый, R7)`);
      } else if (r.value.restored) {
        ctx.printOk(`карточка уровня ${r.value.level} восстановлена из заморозки: ${cardText(r.value.chosen ?? [])}`);
      } else {
        ctx.printOk(`выбрана карточка уровня ${r.value.level}: ${cardText(r.value.chosen ?? [])}`);
      }
      ctx.refresh();
    },
  });

  registry.register({
    name: 'forge auto',
    usage: 'forge auto <on|off>',
    description: 'режим карточек: auto (default — лучшая совместимая сразу) / ручной (предложение ждёт)',
    run(args, ctx) {
      const api = ctx.game.modules.get('forge')?.api;
      if (!api) return ctx.printErr('модуль заточки не активен');
      const r = api['forge.auto'](args[0] ?? 'on') as R<string>;
      if (!r.ok) return ctx.printErr(r.error);
      ctx.printOk(r.value);
    },
  });
}
