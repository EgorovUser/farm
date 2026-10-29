/**
 * Команды модуля M17 «Соц-заглушки» (бриф G1/G3 + карточка §6: имена —
 * язык проб брифа, «social board» и т.д.; регистрация — console.ts).
 * Витрины текстовые (UI-визитка — замок M18); честные ответы текстом:
 * гейт — условиями, пустые пулы — отказ-строкой.
 *  - social board            доска новостей деревни (замок до гейта);
 *  - social mail             письма дня с бейджем «не прочитано»;
 *  - social mail read        пометить прочитанным (идемпотентно);
 *  - social profile          визитка игрока (живёт ДО гейта деревни);
 *  - social force            dev: реролл витрин дня (mailReadDay НЕ трогает).
 */
import type { CommandRegistry, CommandContext } from './console-types';

type R<T> = { ok: true; value: T } | { ok: false; error: string };

interface BoardView {
  day: string;
  locked: boolean;
  gateLines: string[];
  notes: Array<{ id: string; kind: string; text: string }>;
  rerolls: number;
}

interface MailView {
  day: string;
  locked: boolean;
  gateLines: string[];
  letters: Array<{ id: string; kind: string; author: string; subject: string; body: string }>;
  unread: number;
  mailReadDay: string | null;
}

interface ProfileView {
  day: string;
  title: string;
  player: { level: number; xp: number; xpNeed: number };
  gold: number;
  achievements: { unlocked: number; pool: number };
  counters: Array<{ id: string; label: string; value: number }>;
  skills: Array<{ id: string; name: string; level: number }>;
  village: { unlocked: boolean; gateLines: string[] };
  reputation: Array<{ partnerId: string; partnerName: string; levelName: string; points: number }>;
}

function printGate(ctx: CommandContext, gateLines: string[], what: string): void {
  ctx.printErr(`деревня заперта — ${what}`);
  for (const line of gateLines) ctx.print(`  — ${line}`);
}

export function registerSocialCommands(registry: CommandRegistry): void {
  registry.register({
    name: 'social board',
    usage: 'social board',
    description: 'соц: доска новостей деревни (детерминированная проекция дня)',
    run(_args, ctx) {
      const api = ctx.game.modules.get('social')?.api;
      if (!api) return ctx.printErr('модуль соц-заглушек не активен');
      const v = api['social.board']() as BoardView;
      ctx.printTitle(`Доска новостей деревни · ${v.day}${v.rerolls > 0 ? ` · reroll #${v.rerolls}` : ''}`);
      if (v.locked) {
        printGate(ctx, v.gateLines, 'новостей нет');
        return;
      }
      if (v.notes.length === 0) return ctx.print('  новостей нет');
      for (const n of v.notes) ctx.print(`  • ${n.text}`);
      ctx.print(`  заметок: ${v.notes.length} (детерминизм: та же дата + то же состояние → та же доска)`);
    },
  });

  registry.register({
    name: 'social mail',
    usage: 'social mail [read]',
    description: 'соц: письма дня (read — пометить прочитанным, идемпотентно)',
    run(args, ctx) {
      const api = ctx.game.modules.get('social')?.api;
      if (!api) return ctx.printErr('модуль соц-заглушек не активен');
      const isRead = args[0] === 'read';
      if (args[0] !== undefined && !isRead) {
        return ctx.printErr('формат: social mail [read]');
      }
      const v = api['social.mail'](isRead ? 'read' : undefined) as MailView;
      ctx.printTitle(`Письма дня · ${v.day}`);
      if (v.locked) {
        printGate(ctx, v.gateLines, 'писем нет');
        return;
      }
      if (isRead) {
        ctx.printOk(`письма дня помечены прочитанными (mailReadDay = ${v.day}); повтор — идемпотентен`);
      }
      if (v.letters.length === 0) {
        ctx.print('  писем нет — почтовый голубь отдыхает');
        return;
      }
      for (const [i, l] of v.letters.entries()) {
        const badge = i < v.unread ? ' ✉ не прочитано' : '';
        ctx.print(`  ${i + 1}. ${l.author} — «${l.subject}»${badge}`);
        ctx.print(`     ${l.body}`);
      }
      ctx.print(`  писем: ${v.letters.length} · не прочитано: ${v.unread} · прочитано дней: ${v.mailReadDay ?? '—'}`);
    },
  });

  registry.register({
    name: 'social profile',
    usage: 'social profile',
    description: 'соц: визитка игрока (титул/уровень/золото/ачивки/счётчики/репутация)',
    run(_args, ctx) {
      const api = ctx.game.modules.get('social')?.api;
      if (!api) return ctx.printErr('модуль соц-заглушек не активен');
      const v = api['social.profile']() as ProfileView;
      ctx.printTitle(`Визитка игрока · ${v.day}`);
      ctx.print(`  титул: ${v.title} (по максимальной репутации партнёров биржи)`);
      ctx.print(
        `  уровень: ${v.player.level} · XP ${v.player.xp}/${v.player.xpNeed} · золото: ${v.gold}`,
      );
      ctx.print(`  ачивки: ${v.achievements.unlocked}/${v.achievements.pool}`);
      if (v.counters.length > 0) {
        ctx.print('  счётчики ядра:');
        for (const c of v.counters) ctx.print(`    ${c.label}: ${c.value} (${c.id})`);
      }
      if (v.skills.length > 0) {
        ctx.print('  навыки:');
        const top = [...v.skills].sort((a, b) => b.level - a.level).slice(0, 5);
        for (const s of top) ctx.print(`    ${s.name}: ${s.level}`);
        if (v.skills.length > top.length) ctx.print(`    … всего ${v.skills.length}`);
      }
      if (!v.village.unlocked) {
        ctx.print('  деревня: заперта —');
        for (const line of v.village.gateLines) ctx.print(`    — ${line}`);
      } else {
        ctx.print('  деревня: открыта');
        if (v.reputation.length > 0) {
          ctx.print('  репутация партнёров:');
          for (const r of v.reputation) ctx.print(`    ${r.partnerName}: ${r.levelName} (${r.points} очков)`);
        }
      }
    },
  });

  registry.register({
    name: 'social force',
    usage: 'social force',
    description: 'dev: переролл соц-витрин дня (сид-суффикс #N; mailReadDay НЕ трогает)',
    run(_args, ctx) {
      const api = ctx.game.modules.get('social')?.api;
      if (!api) return ctx.printErr('модуль соц-заглушек не активен');
      const r = api['social.force']() as R<{ header: string; lines: string[] }>;
      if (!r.ok) return ctx.printErr(r.error);
      ctx.printTitle(r.value.header);
      for (const line of r.value.lines) ctx.print(`  ${line}`);
    },
  });
}
