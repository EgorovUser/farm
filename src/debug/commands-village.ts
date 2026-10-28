/**
 * Команды модуля M16 «Деревня» (карточка §6 + бриф §0 [DECISION-имена];
 * регистрация — console.ts): village.state (гейт/уровень/жители/налог),
 * village.need <id|all>, village.supply <id> <item> [qty] (TransactionService),
 * village.help (дневная помощь), village.force (dev: форс дня деревни —
 * переролль потребностей + сбор налога; помечен dev, прецедент lake.force).
 */
import type { CommandRegistry, CommandContext } from './console-types';

type R<T> = { ok: true; value: T } | { ok: false; error: string };

interface VillagerRow {
  id: string;
  name: string;
  profession: string;
  happiness: number;
  grumbleDays: number;
  grumbler: boolean;
  need: { item: string; qty: number; kind: 'daily' | 'weekly'; satisfied: boolean } | null;
  lastSatisfied: string | null;
}

interface StateView {
  unlocked: boolean;
  gateLines: string[];
  level: number;
  levelMax: number;
  xp: number;
  xpToNext: number | null;
  tax: {
    expectedGold: number;
    level: number;
    avgHappiness: number;
    grumblers: number;
    mods: Array<{ id: string; value: number }>;
  };
  villagers: VillagerRow[];
  villagersLocked: Array<{ id: string; name: string; profession: string; unlockLine: string }>;
  help: { usedToday: boolean; perDay: number };
}

function printState(ctx: CommandContext, v: StateView): void {
  if (!v.unlocked) {
    ctx.printTitle('Деревня (village.state)');
    ctx.printErr('  деревня заперта: уровень 30 + ачивка «Мастер хутора»');
    for (const line of v.gateLines) ctx.print(`  — ${line}`);
    return;
  }
  ctx.printTitle('Деревня (village.state)');
  ctx.print(
    `  уровень: ${v.level}/${v.levelMax} · XP: ${v.xp}${v.xpToNext !== null ? ` (до следующего ${v.xpToNext})` : ' (МАКС)'}`,
  );
  const t = v.tax;
  ctx.print(
    `  налог (ожидание дня): ${t.expectedGold}з = база × моды шины · уровень ${t.level} · среднее счастье ${t.avgHappiness} · ворчуны ${t.grumblers}`,
  );
  for (const m of t.mods) {
    ctx.print(`    модификатор ${m.id}: ${m.value >= 0 ? '+' : ''}${Math.round(m.value * 10) / 10}%`);
  }
  ctx.print(`  жители (${v.villagers.length} в деревне):`);
  for (const r of v.villagers) {
    const need =
      r.need === null
        ? 'потребности нет'
        : r.need.satisfied
          ? `доволен (${r.need.item} ×${r.need.qty} — ${r.need.kind})`
          : `просит ${r.need.item} ×${r.need.qty} (${r.need.kind})`;
    ctx.print(
      `    ${r.name} (${r.profession}) — счастье ${r.happiness}/100${r.grumbler ? ` · ВОРЧУН (${r.grumbleDays} дн.)` : ''} · ${need}`,
    );
  }
  if (v.villagersLocked.length > 0) {
    ctx.print(`  ждут открытия (${v.villagersLocked.length}):`);
    for (const r of v.villagersLocked) {
      ctx.print(`    ${r.name} (${r.profession}) — ${r.unlockLine}`);
    }
  }
  ctx.print(`  помощь: ${v.help.usedToday ? 'уже была сегодня' : 'доступна (village help)'} · ${v.help.perDay}/день`);
}

export function registerVillageCommands(registry: CommandRegistry): void {
  registry.register({
    name: 'village.state',
    usage: 'village.state',
    description: 'деревня: гейт/уровень/XP/жители/счастье/налог-строка (П6: числа на стол)',
    run(_args, ctx) {
      const api = ctx.game.modules.get('village')?.api;
      if (!api) return ctx.printErr('модуль деревни не активен');
      printState(ctx, api['village.state']() as StateView);
    },
  });

  registry.register({
    name: 'village.need',
    usage: 'village.need <villagerId|all>',
    description: 'потребности жителей: кто что просит сегодня (daily/weekly)',
    run(args, ctx) {
      const api = ctx.game.modules.get('village')?.api;
      if (!api) return ctx.printErr('модуль деревни не активен');
      const id = args[0] ?? 'all';
      const rows = api['village.need'](id) as Array<{ id: string; name: string; profession: string; line: string }>;
      if (rows.length === 0) {
        return ctx.printErr(
          id === 'all'
            ? 'жителей в деревне нет — деревня заперта? (village state)'
            : `житель не найден: ${id} (village state — реестр)`,
        );
      }
      ctx.printTitle(`Потребности деревни (village.need ${id})`);
      for (const r of rows) ctx.print(`  ${r.name} (${r.profession}) — ${r.line}`);
    },
  });

  registry.register({
    name: 'village.supply',
    usage: 'village.supply <villagerId> <itemId> [qty]',
    description: 'поставка жителю (TransactionService: списал предмет → XP деревне + счастье + шанс подарка)',
    run(args, ctx) {
      const api = ctx.game.modules.get('village')?.api;
      if (!api) return ctx.printErr('модуль деревни не активен');
      const [vid, item, qty] = args;
      if (vid === undefined || item === undefined) {
        return ctx.printErr('формат: village supply <villagerId> <itemId> [qty] (потребности — village need all)');
      }
      const r = api['village.supply'](vid, item, qty !== undefined ? Number(qty) : undefined) as R<{
        header: string;
        lines: string[];
      }>;
      if (!r.ok) return ctx.printErr(r.error);
      ctx.printOk(`  ${r.value.header}`);
      for (const line of r.value.lines) ctx.print(`    ${line}`);
      ctx.refresh();
    },
  });

  registry.register({
    name: 'village.help',
    usage: 'village.help',
    description: 'дневная помощь: 1 случайный житель бесплатно выполняет задачу (TaskRegistry)',
    run(_args, ctx) {
      const api = ctx.game.modules.get('village')?.api;
      if (!api) return ctx.printErr('модуль деревни не активен');
      const r = api['village.help']() as R<{
        note: string;
        villagerName: string;
        taskType: string;
        done: number;
        attempts: number;
      }>;
      if (!r.ok) return ctx.printErr(r.error);
      ctx.printOk(`  ${r.value.note}`);
      ctx.refresh();
    },
  });

  registry.register({
    name: 'village.force',
    usage: 'village.force',
    description: 'dev: форс дня деревни — переролль потребностей + сбор налога (условия НЕ проверяются — это форс)',
    run(_args, ctx) {
      const api = ctx.game.modules.get('village')?.api;
      if (!api) return ctx.printErr('модуль деревни не активен');
      const v = api['village.force']() as { header: string; lines: string[] };
      ctx.printTitle(v.header);
      for (const line of v.lines) ctx.print(`  ${line}`);
      ctx.refresh();
    },
  });
}
