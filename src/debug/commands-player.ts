/**
 * Команды модуля M01 (карточка §7): xp add, energy set, skills list, stats show.
 * Доступ к модулю — только через ModuleRegistry (П4: «не прямой импорт!»);
 * исключение — type-only импорт снапшота для типизации вывода.
 * [РАСШИРЕНИЕ] hp set — живая проба смерти (карточка §3: M01 репортит тег death).
 */
import type { CommandRegistry } from './console-types';
import type { Game } from '@/game/bootstrap';
import type { PlayerSnapshot } from '@/game/modules/player/module';

type Api = Record<string, (...args: unknown[]) => unknown>;

function api(game: Game): Api | null {
  return game.modules.get('player')?.api ?? null;
}

function snapshot(game: Game): PlayerSnapshot | null {
  const a = api(game);
  if (!a) return null;
  return a['player.snapshot']() as PlayerSnapshot;
}

export function registerPlayerCommands(registry: CommandRegistry): void {
  registry.register({
    name: 'player',
    usage: 'player',
    description: 'сводка игрока: энергия, HP, XP/уровень, навыки (M01)',
    run(_args, ctx) {
      const snap = snapshot(ctx.game);
      if (!snap) return ctx.printErr('модуль player не активен');
      const { energy, hp, progress, skills } = snap;
      ctx.printTitle(`Игрок · уровень ${progress.level}${progress.level >= progress.maxLevel ? ' (макс)' : ''}`);
      ctx.print(`  энергия:  ${energy.current} / ${energy.max} (реген ${energy.regenPerMinute.toFixed(2)}/мин)`);
      ctx.print(`  HP:       ${hp.current} / ${hp.max}${hp.alive ? '' : ' — МЁРТВ (ждёт решения M13)'}`);
      ctx.print(`  XP:       ${progress.xp} / ${progress.xpNeed}`);
      ctx.print(`  навыки:   ${skills.filter((s) => s.level > 0).length} из ${skills.length} качаются`);
    },
  });

  registry.register({
    name: 'xp',
    usage: 'xp | xp add <n>',
    description: 'XP игрока; начислить (M01 §4)',
    run(args, ctx) {
      const a = api(ctx.game);
      const snap = snapshot(ctx.game);
      if (!a || !snap) return ctx.printErr('модуль player не активен');
      if (args[0] === 'add') {
        const n = Number(args[1]);
        if (!Number.isFinite(n) || n <= 0) return ctx.printErr('формат: xp add 150');
        const r = a['player.addXp'](n, 'debug.xp') as { gained: number; levelsUp: number };
        const after = snapshot(ctx.game) ?? snap;
        ctx.printOk(`+${r.gained} XP → уровень ${after.progress.level}${r.levelsUp > 0 ? ` (ПОДНЯТ ×${r.levelsUp}!)` : ''}, XP ${after.progress.xp}/${after.progress.xpNeed}`);
        ctx.refresh();
        return;
      }
      const p = snap.progress;
      ctx.printTitle('XP / уровень');
      ctx.print(`  уровень: ${p.level} из ${p.maxLevel}`);
      ctx.print(`  XP:      ${p.xp} / ${p.xpNeed} (кривая 100 × 1.15^L из content/player/progression.ts)`);
    },
  });

  registry.register({
    name: 'energy',
    usage: 'energy | energy set <n>',
    description: 'энергия игрока; установить (M01 §2)',
    run(args, ctx) {
      const a = api(ctx.game);
      const snap = snapshot(ctx.game);
      if (!a || !snap) return ctx.printErr('модуль player не активен');
      if (args[0] === 'set') {
        const n = Number(args[1]);
        if (!Number.isFinite(n) || n < 0) return ctx.printErr('формат: energy set 50');
        const r = a['player.setEnergy'](n) as { current: number; max: number };
        ctx.printOk(`энергия установлена: ${r.current} (клэмп 0..${r.max})`);
        ctx.refresh();
        return;
      }
      const e = snap.energy;
      ctx.printTitle('Энергия (M01 §2)');
      ctx.print(`  текущая:  ${e.current} / ${e.max}`);
      ctx.print(`  реген:    ${e.regenPerMinute.toFixed(4)} за игровую минуту (1 ед / 3 мин, оффлайн тоже, не выше капа)`);
      ctx.print('  стоимости действий: resolve action.farm.plow.energyCost (полный список — stats.list)');
    },
  });

  registry.register({
    // [FIX-M01 · MISS-6] debug-команда списания по стату стоимости (SESSION-M01
    // §3.7): резолв ТЕКУЩЕЙ стоимости через шину — модификаторы применяются
    // («Спартанец» M14 ополовинит цену без ведома модуля), списание — каноническим
    // путём (та же внутренняя функция, что у withEnergy), reason = 'debug.spend'.
    name: 'energy spend',
    usage: 'energy spend <statId>',
    description: 'списать энергию по стоимости действия (живая проба §8; инструмент приёмки M02)',
    run(args, ctx) {
      const a = api(ctx.game);
      if (!a) return ctx.printErr('модуль player не активен');
      const statId = args[0];
      if (!statId) {
        return ctx.printErr('формат: energy spend action.farm.plow.energyCost (полный список — stats.list)');
      }
      let cost: number;
      try {
        cost = a['player.energyCost'](statId) as number;
      } catch (e) {
        // неизвестный стат — отказ тем же resolve-путём (каталог баз, П2)
        return ctx.printErr(`стат "${statId}" не резолвится: ${e instanceof Error ? e.message : String(e)} — каталог: stats.list`);
      }
      if (!(cost > 0)) {
        return ctx.printErr(`стат "${statId}" резолвится в ${cost} — списывать нечего`);
      }
      const r = a['player.spendEnergy'](statId, 'debug.spend') as
        | { ok: true; value: { cost: number; current: number; max: number } }
        | { ok: false; error: string };
      if (!r.ok) {
        return ctx.printErr(`${r.error} — энергия цела, событий нет`);
      }
      ctx.printOk(`списано ${r.value.cost} (${statId} = ${cost} через шину) → энергия ${r.value.current} / ${r.value.max}`);
      ctx.refresh();
    },
  });

  registry.register({
    name: 'hp',
    usage: 'hp | hp set <n>',
    description: 'HP игрока; установить — 0 репортит смерть тегом death',
    run(args, ctx) {
      const a = api(ctx.game);
      const snap = snapshot(ctx.game);
      if (!a || !snap) return ctx.printErr('модуль player не активен');
      if (args[0] === 'set') {
        const n = Number(args[1]);
        if (!Number.isFinite(n) || n < 0) return ctx.printErr('формат: hp set 10');
        const r = a['player.setHp'](n) as { current: number; max: number; alive: boolean };
        ctx.printOk(`HP установлен: ${r.current} / ${r.max}${r.alive ? '' : ' — событие player.hpChanged с тегом death (см. events)'}`);
        ctx.refresh();
        return;
      }
      const h = snap.hp;
      ctx.printTitle('HP (M01 §3)');
      ctx.print(`  текущее: ${h.current} / ${h.max}${h.alive ? '' : ' — МЁРТВ'}`);
      ctx.print('  реген: 1 / 5 мин вне шахты (в шахте M13 заглушит модификатором регена)');
    },
  });

  registry.register({
    name: 'skills list',
    usage: 'skills list',
    description: 'навыки от использования (M01 §5)',
    run(_args, ctx) {
      const snap = snapshot(ctx.game);
      if (!snap) return ctx.printErr('модуль player не активен');
      ctx.printTitle(`Навыки (${snap.skills.length}) — растут от событий`);
      for (const s of snap.skills) {
        ctx.print(`  ${s.name.padEnd(16)} ур.${String(s.level).padStart(2)}  ${String(s.xp).padStart(4)}/${s.xpNeed}`);
      }
      ctx.print('  кривая: skillXpBase × skillXpGrowth^ур из content/player/progression.ts; перки — провайдер player.skills в StatBus');
    },
  });

  registry.register({
    name: 'stats show',
    usage: 'stats show [префикс]',
    description: 'счётчики ядра: конфиг M01 + демонстрационные (§6)',
    run(args, ctx) {
      const prefix = args[0];
      const rows = ctx.game.stats.snapshot().filter((s) => !prefix || s.id.startsWith(prefix));
      const m01 = new Set(ctx.game.modules.get('player')?.manifest.statsCounters ?? []);
      if (rows.length === 0) return ctx.print('счётчиков нет — они растут от событий (farm.*, forge.*, mine.*, …)');
      ctx.printTitle(`Счётчики ядра (${rows.length})`);
      for (const s of rows) {
        ctx.print(`  ${m01.has(s.id) ? '·' : ' '} ${s.id.padEnd(36)} ${s.value}`);
      }
      ctx.print('  · — из конфига M01 (content/player/counters.ts); без точки — демонстрационные kernel.*');
    },
  });
}
