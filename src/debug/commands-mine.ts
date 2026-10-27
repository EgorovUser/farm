/**
 * Команды модуля M12+M13 «Шахта» (бриф F8 + SESSION-M12.2 G7 + SESSION-M13
 * R7/R10): mine state / mob / fight / elite / enter / boss (M12) + ×7
 * подкоманд забега (M13.1) + ровно ×3 помощников (M13.2): helpers /
 * helpers hire <i> / helpers fire <i>. Регистрация — console.ts после workers.
 * Слой по умолчанию 1; fight/elite — песочница БЕЗ вход-гейтов (канон
 * M12.1: гейты = mine.enter/boss); --seed — фикс-сид для воспроизведения.
 * HP-сетап боёв — существующий dev hp set / give (НЕ дублируется);
 * бафы для босс-проб — штатный Buff-канал ядра (mod add combat.attack ...).
 */
import type { CommandRegistry, CommandContext } from './console-types';

type R<T> = { ok: true; value: T } | { ok: false; error: string };

interface FightRoundView {
  header: string;
  rounds: string[];
  outcome: string;
  hp: { player: number; start: number; max: number };
  loot: { gold: number; ore?: { defId: string; qty: number }; item?: { defId: string; qty: number }; wear?: string } | null;
}

interface BossRoundView extends FightRoundView {
  loot: {
    gold: number;
    ore: { defId: string; qty: number };
    trophy: string;
    aPlus: { defId: string; tier: string; granted: boolean };
    wear?: string;
  } | null;
}

interface MobDefView {
  id: string;
  name: string;
  hpBase: number;
  atk: number;
  def: number;
  speed: number;
  evade: number;
  selfBuff: string | null;
  miniBoss: boolean;
  pattern: string;
  tags: string[];
  gold: string;
  eliteMods: string[];
  hpByLayer: string[];
}

interface EnterView {
  header: string;
  lines: string[];
}

interface RunViewShape {
  header: string;
  lines: string[];
}

function printRun(ctx: CommandContext, v: RunViewShape): void {
  ctx.printTitle(v.header);
  for (const line of v.lines) {
    ctx.print(`  ${line}`);
  }
}

function printFight(ctx: CommandContext, v: FightRoundView): void {
  ctx.printTitle(v.header);
  for (const line of v.rounds) {
    ctx.print(`  ${line}`);
  }
  ctx.printOk(v.outcome);
}

function printMob(ctx: CommandContext, m: MobDefView): void {
  ctx.printTitle(`Моб: ${m.name} (${m.id})${m.miniBoss ? ' — МИНИ-БОСС' : ''}`);
  ctx.print(`  HP базы ${m.hpBase} · атака ${m.atk} · защита ${m.def} · скорость ${m.speed} · уклонение ${m.evade}%`);
  ctx.print(`  паттерн атак (цикл, 50/50 в паре): ${m.pattern}`);
  if (m.selfBuff !== null) ctx.print(`  само-баф: ${m.selfBuff}`);
  ctx.print(`  теги: ${m.tags.join(', ')}`);
  ctx.print(`  расклад: золото ${m.gold} + руда слоя + шанс предмета (M12.2)`);
  ctx.print(`  элиты: ${m.eliteMods.length > 0 ? m.eliteMods.join(', ') : '—'}`);
  ctx.print(`  HP по слоям (×1.6^(n−1)): ${m.hpByLayer.join(' · ')}`);
}

export function registerMineCommands(registry: CommandRegistry): void {
  registry.register({
    name: 'mine',
    usage:
      'mine <state|mob|fight|elite|enter|boss|run|pick|gen|reveal|torch|upgrades|helpers> [аргументы] [--seed S]',
    description:
      'шахта: статы среза / витрина моба / автобой / элита / вход-забег / босс / витрина забега / выбор карты / оракул генерации / debug-вскрытие / факел / улучшения / доска наёмников+состав (карточки M12 §6 + M13 §5)',
    run(args, ctx) {
      const api = ctx.game.modules.get('mine')?.api;
      if (!api) return ctx.printErr('модуль шахты не активен');
      const sub = args[0];
      if (sub === 'state') {
        const v = api['mine.state']() as { fights: number; kills: number; bossKills: number; deaths: number };
        ctx.printTitle('Шахта — статы среза (mine.state)');
        ctx.print(
          `  боёв ${v.fights} · убито мобов ${v.kills} · боссов ${v.bossKills} · смертей ${v.deaths}`,
        );
        return;
      }
      if (sub === 'mob') {
        if (args[1] === undefined) return ctx.printErr('укажите моба: mine mob <id> (реестр: content/mine/mobs.ts)');
        const r = api['mine.mob'](args[1]) as R<MobDefView>;
        if (!r.ok) return ctx.printErr(r.error);
        printMob(ctx, r.value);
        return;
      }
      if (sub === 'enter') {
        if (args[1] === undefined) {
          return ctx.printErr('укажите слой: mine enter <1..9> — гейты кирки/ачивки + энергия 20 + СТАРТ ЗАБЕГА (G4 + R1)');
        }
        const r = api['mine.enter'](args[1]) as R<EnterView>;
        if (!r.ok) return ctx.printErr(r.error);
        ctx.printTitle(r.value.header);
        for (const line of r.value.lines) {
          ctx.print(`  ${line}`);
        }
        ctx.printOk('спуск состоялся — забег начат (бой на раунды энергии не тратит [DECISION §0])');
        ctx.refresh();
        return;
      }
      // --- [M13.1 · R7] ×7 подкоманд забега
      if (sub === 'run') {
        const v = api['mine.run']() as RunViewShape;
        printRun(ctx, v);
        return;
      }
      if (sub === 'pick') {
        if (args[1] === undefined) {
          return ctx.printErr('укажите выбор: mine pick <1..3> (карта) · mine pick 0 (свиток выхода) · mine pick p<N> (зелье)');
        }
        const r = api['mine.pick'](args[1]) as R<RunViewShape>;
        if (!r.ok) return ctx.printErr(r.error);
        printRun(ctx, r.value);
        ctx.refresh();
        return;
      }
      if (sub === 'gen') {
        const rest = args.slice(1);
        let seed: string | undefined;
        const si = rest.indexOf('--seed');
        if (si >= 0) {
          seed = rest[si + 1];
          rest.splice(si, 2);
        }
        if (rest[0] === undefined) {
          return ctx.printErr('укажите слой: mine gen <слой> [--seed S] — оракул расклада (12 карт + босс + скрытость)');
        }
        const r = api['mine.gen'](rest[0], seed) as R<RunViewShape>;
        if (!r.ok) return ctx.printErr(r.error);
        printRun(ctx, r.value);
        return;
      }
      if (sub === 'reveal') {
        const r = api['mine.reveal']() as R<RunViewShape>;
        if (!r.ok) return ctx.printErr(r.error);
        printRun(ctx, r.value);
        ctx.refresh();
        return;
      }
      if (sub === 'torch') {
        const r = api['mine.torch'](args[1]) as R<RunViewShape>;
        if (!r.ok) return ctx.printErr(r.error);
        printRun(ctx, r.value);
        ctx.refresh();
        return;
      }
      if (sub === 'upgrades') {
        if (args[1] === 'buy') {
          if (args[2] === undefined) {
            return ctx.printErr('укажите id: mine upgrades.buy <mine_cart|mine_lighting|mine_campgear|mine_lift|mine_barracks|mine_squad>');
          }
          const r = api['mine.upgrades.buy'](args[2]) as R<RunViewShape>;
          if (!r.ok) return ctx.printErr(r.error);
          printRun(ctx, r.value);
          ctx.refresh();
          return;
        }
        const v = api['mine.upgrades']() as RunViewShape;
        printRun(ctx, v);
        return;
      }
      // --- [M13.2 · R10] ×3 подкоманды помощников: доска+состав/наём/увольнение
      if (sub === 'helpers') {
        if (args[1] === 'hire') {
          const r = api['mine.helpers.hire'](args[2]) as R<RunViewShape>;
          if (!r.ok) return ctx.printErr(r.error);
          printRun(ctx, r.value);
          ctx.refresh();
          return;
        }
        if (args[1] === 'fire') {
          const r = api['mine.helpers.fire'](args[2]) as R<RunViewShape>;
          if (!r.ok) return ctx.printErr(r.error);
          printRun(ctx, r.value);
          ctx.refresh();
          return;
        }
        const v = api['mine.helpers']() as RunViewShape;
        printRun(ctx, v);
        return;
      }
      if (sub === 'fight' || sub === 'elite' || sub === 'boss') {
        const rest = args.slice(1);
        let seed: string | undefined;
        const si = rest.indexOf('--seed');
        if (si >= 0) {
          seed = rest[si + 1];
          rest.splice(si, 2);
        }
        if (sub === 'boss') {
          if (rest[0] === undefined) {
            return ctx.printErr('укажите слой: mine boss <слой> [--seed S] — гейты слоя, босс-фазы витриной');
          }
          const r = api['mine.boss'](rest[0], seed) as R<BossRoundView>;
          if (!r.ok) return ctx.printErr(r.error);
          printFight(ctx, r.value);
          ctx.refresh();
          return;
        }
        if (rest[0] === undefined) {
          return ctx.printErr(
            sub === 'fight'
              ? 'укажите моба: mine fight <mobId> [слой] [--seed S]'
              : 'укажите: mine elite <mobId> <venomous|armored|swarm> [слой] [--seed S]',
          );
        }
        const r =
          sub === 'fight'
            ? (api['mine.fight'](rest[0], rest[1], seed) as R<FightRoundView>)
            : (api['mine.elite'](rest[0], rest[1], rest[2], seed) as R<FightRoundView>);
        if (!r.ok) return ctx.printErr(r.error);
        printFight(ctx, r.value);
        ctx.refresh();
        return;
      }
      ctx.printErr(
        'mine state | mine mob <id> | mine fight <mobId> [слой] [--seed S] | mine elite <mobId> <мод> [слой] [--seed S] | mine enter <слой> | mine boss <слой> [--seed S] | mine run | mine pick <1..3|0|p<N>> | mine gen <слой> [--seed S] | mine reveal | mine torch [i] | mine upgrades [buy <id>] | mine helpers [hire <i> | fire <i>]',
      );
    },
  });
}
