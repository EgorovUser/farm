/**
 * Команды модуля M15 «Квесты, ачивки» (бриф §4.6 + карточка §6; канон имён
 * 02-BUSES §12 — пробелы, не точки): quests roll/list/complete/claim/reroll,
 * ach unlock, flags list. Витрины — числа на стол (П6): прогресс N/K,
 * награды, claim-статусы.
 */
import type { CommandRegistry } from './console-types';
import { CURRENCY_LABELS_RU } from '@/content/locale/ru';

type R<T> = { ok: true; value: T } | { ok: false; error: string };

interface QuestRowView {
  id: string;
  kind: string;
  name: string;
  description: string;
  step: number;
  stepsTotal: number;
  progress: number;
  goal: number;
  completed: boolean;
  claimed: boolean;
  claimable: boolean;
  rewards: Array<{ t: string; id?: string; defId?: string; qty?: number; flag?: string }>;
  finished: boolean;
  locked?: boolean;
  unlockText?: string;
}

interface AchRowView {
  id: string;
  name: string;
  unlocked: boolean;
  claimed: boolean;
  hidden: boolean;
  rewards: Array<{ t: string; id?: string; defId?: string; qty?: number; flag?: string }>;
}

function rewardsText(rewards: Array<{ t: string; id?: string; defId?: string; qty?: number; flag?: string }>): string {
  if (rewards.length === 0) return '—';
  return rewards
    .map((r) => {
      switch (r.t) {
        case 'currency':
          return `${r.qty} ${CURRENCY_LABELS_RU[r.id ?? ''] ?? r.id}`;
        case 'item':
          return `${r.defId} ×${r.qty}`;
        case 'passivePoint':
          return `+${r.qty} очко пассивки (M14)`;
        case 'flag':
          return `флаг ${r.flag}`;
        case 'xp':
          return `${r.qty} XP`;
        default:
          return r.t;
      }
    })
    .join(', ');
}

function questRowText(q: QuestRowView): string {
  const status = q.finished
    ? '✓ завершён'
    : q.locked
      ? '🔒'
      : q.claimable
        ? '→ ЗАБРАТЬ (quests claim)'
        : q.claimed
          ? '✓ забрано'
          : '';
  const multi = q.stepsTotal > 1 ? ` · шаг ${q.step}/${q.stepsTotal}` : '';
  return `  ${q.id.padEnd(22)} «${q.name}»${multi} · ${q.progress}/${q.goal}${status ? ` · ${status}` : ''}`;
}

export function registerQuestsCommands(registry: CommandRegistry): void {
  registry.register({
    name: 'quests list',
    usage: 'quests list [daily|weekly|chains|ach]',
    description: 'квесты дня/недели, цепочки, ачивки: прогресс N/K, награды, claim-статусы',
    run(args, ctx) {
      const api = ctx.game.modules.get('quests')?.api;
      if (!api) return ctx.printErr('модуль квестов не активен');
      const t = args[0] ?? 'daily';
      if (t === 'ach') {
        const rows = api['quests.list']('ach') as AchRowView[];
        const hidden = rows.filter((r) => r.hidden && !r.unlocked).length;
        ctx.printTitle(`Ачивки (${rows.length}${hidden > 0 ? ` · hidden до unlock: ${hidden}` : ''})`);
        for (const a of rows) {
          const status = a.claimed ? '✓ забрано' : a.unlocked ? '→ ЗАБРАТЬ (quests claim)' : '';
          ctx.print(`  ${a.id.padEnd(22)} «${a.name}»${a.hidden ? ' [hidden]' : ''}${status ? ` · ${status}` : ''}`);
          if (a.rewards.length > 0) ctx.print(`  ${''.padEnd(24)} награды: ${rewardsText(a.rewards)}`);
        }
        return;
      }
      const kind = t === 'chains' ? 'chain' : t === 'chain' ? 'chain' : t === 'weekly' ? 'weekly' : t === 'daily' ? 'daily' : null;
      if (!kind) return ctx.printErr('тип: daily | weekly | chains | ach');
      const rows = api['quests.list'](kind) as QuestRowView[];
      const label = kind === 'chain' ? 'Цепочки' : kind === 'weekly' ? 'Квесты недели' : 'Квесты дня';
      if (rows.length === 0) return ctx.print(`${label}: пусто (ролл — quests roll / смена дня time +1d)`);
      ctx.printTitle(`${label} (${rows.length})`);
      for (const q of rows) {
        ctx.print(questRowText(q));
        ctx.print(`  ${''.padEnd(24)} ${q.description}`);
        ctx.print(`  ${''.padEnd(24)} награды: ${rewardsText(q.rewards)}`);
      }
    },
  });

  registry.register({
    name: 'quests claim',
    usage: 'quests claim <id>',
    description: 'забрать награды завершённого квеста/ачивки (идемпотентно)',
    run(args, ctx) {
      const api = ctx.game.modules.get('quests')?.api;
      if (!api) return ctx.printErr('модуль квестов не активен');
      const id = args[0];
      if (!id) return ctx.printErr('укажите id: quests claim <id> (quests list)');
      const r = api['quests.claim'](id) as R<{ granted: unknown[]; flags: string[]; transaction: { grants: Array<{ t: string; id: string; qty: number }> } | null }>;
      if (!r.ok) return ctx.printErr(r.error);
      const tx = r.value.transaction
        ? ` · транзакция: ${r.value.transaction.grants.map((g) => `${g.id} ×${g.qty}`).join(', ')}`
        : ' · транзакция не нужна (без материальных наград)';
      ctx.printOk(`награды «${id}» выданы${tx}${r.value.flags.length > 0 ? ` · флаги: ${r.value.flags.join(', ')}` : ''}`);
      ctx.refresh();
    },
  });

  registry.register({
    name: 'quests reroll',
    usage: 'quests reroll <id>',
    description: 'бесплатная замена квеста дня (1 в день; наследует прогресс дня)',
    run(args, ctx) {
      const api = ctx.game.modules.get('quests')?.api;
      if (!api) return ctx.printErr('модуль квестов не активен');
      const id = args[0];
      if (!id) return ctx.printErr('укажите id: quests reroll <id> (quests list)');
      const r = api['quests.rerollDaily'](id) as R<{ removed: string; added: string }>;
      if (!r.ok) return ctx.printErr(r.error);
      ctx.printOk(`квест заменён: ${r.value.removed} → ${r.value.added} (замена дня израсходована)`);
      ctx.refresh();
    },
  });

  registry.register({
    name: 'quests roll',
    usage: 'quests roll',
    description: 'dev: переброс дня (детерминизм dailySeed; базовая линия = сейчас)',
    run(_args, ctx) {
      const api = ctx.game.modules.get('quests')?.api;
      if (!api) return ctx.printErr('модуль квестов не активен');
      ctx.printOk(api['quests.roll']() as string);
      ctx.refresh();
    },
  });

  registry.register({
    name: 'quests complete',
    usage: 'quests complete <id>',
    description: 'dev: завершить текущий шаг квеста/цепочки (события публикуются)',
    run(args, ctx) {
      const api = ctx.game.modules.get('quests')?.api;
      if (!api) return ctx.printErr('модуль квестов не активен');
      const id = args[0];
      if (!id) return ctx.printErr('укажите id: quests complete <id> (quests list)');
      const r = api['quests.complete'](id) as R<string>;
      if (!r.ok) return ctx.printErr(r.error);
      ctx.printOk(r.value);
      ctx.refresh();
    },
  });

  registry.register({
    name: 'quests chain',
    usage: 'quests chain <id>',
    description: 'прогресс цепочки: текущий шаг, N/K (карточка §6)',
    run(args, ctx) {
      const api = ctx.game.modules.get('quests')?.api;
      if (!api) return ctx.printErr('модуль квестов не активен');
      const id = args[0];
      if (!id) return ctx.printErr('укажите id: quests chain <id> (quests list chains)');
      const r = api['quests.chainProgress'](id) as R<QuestRowView>;
      if (!r.ok) return ctx.printErr(r.error);
      ctx.printTitle(`Цепочка · «${r.value.name}»`);
      ctx.print(questRowText(r.value));
      ctx.print(`  ${''.padEnd(24)} ${r.value.description}`);
      ctx.print(`  ${''.padEnd(24)} награды шага: ${rewardsText(r.value.rewards)}`);
    },
  });

  registry.register({
    name: 'ach unlock',
    usage: 'ach unlock <id>',
    description: 'dev: открыть ачивку (флаги + событие achievement.unlocked)',
    run(args, ctx) {
      const api = ctx.game.modules.get('quests')?.api;
      if (!api) return ctx.printErr('модуль квестов не активен');
      const id = args[0];
      if (!id) return ctx.printErr('укажите id: ach unlock <id> (quests list ach)');
      const r = api['quests.unlockAch'](id) as R<string>;
      if (!r.ok) return ctx.printErr(r.error);
      ctx.printOk(r.value);
      ctx.refresh();
    },
  });

  registry.register({
    name: 'flags list',
    usage: 'flags list',
    description: 'флаги квестов/ачивок (unlockFlags — их читают гейты, M15.2)',
    run(_args, ctx) {
      const api = ctx.game.modules.get('quests')?.api;
      if (!api) return ctx.printErr('модуль квестов не активен');
      const flags = api['quests.flags']() as string[];
      if (flags.length === 0) return ctx.print('флагов пока нет (ачивки/цепочки их производят)');
      ctx.printTitle(`Флаги (${flags.length})`);
      for (const f of flags) ctx.print(`  ${f}`);
    },
  });
}
