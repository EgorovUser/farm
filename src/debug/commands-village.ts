/**
 * Команды модуля M16 «Деревня» (карточка §6 + бриф §0 [DECISION-имена];
 * регистрация — console.ts): village.state (гейт/уровень/жители/налог),
 * village.need <id|all>, village.supply <id> <item> [qty] (TransactionService),
 * village.help (дневная помощь), village.force (dev: форс дня деревни —
 * переролль потребностей + сбор налога; помечен dev, прецедент lake.force).
 * [M16.2] village.build <id|витрина>, village.equip <villagerId> <itemId|off>,
 * village.raid (порог/защита/расписание/маркеры), village.raid.force (dev).
 * [M16.3] village.trade (доска биржи: партнёры/контракты/тренды/репутация/
 * история цен), village.trade.fulfill <partnerId> [item] (TransactionService),
 * village.trade.buy <partnerId> <itemId> [qty] (PriceBus тег trade),
 * village.trade.trend.force (dev: реролл контрактов/трендов дня).
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

  // ------------------------------------------------------------ M16.2

  registry.register({
    name: 'village.build',
    usage: 'village.build [id]',
    description: 'постройки деревни: реестр (без аргумента) / стройка следующего уровня (TransactionService + часы реального времени)',
    run(args, ctx) {
      const api = ctx.game.modules.get('village')?.api;
      if (!api) return ctx.printErr('модуль деревни не активен');
      if (args[0] === undefined || args[0] === '') {
        const v = api['village.build']() as {
          level: number;
          rows: Array<{
            id: string; name: string; desc: string; kind: string; level: number; maxLevel: number;
            status: string; unlockLine: string; builtAt: string | null;
            construction: { finishAt: number; hoursLeft: number } | null;
            next: { level: number; costGold: number; items: Array<{ t: string; id: string; qty: number }>; hours: number; effect: number; xp: number } | null;
            effectNow: number;
          }>;
          effects: { repairDiscount: number; marketDiscount: number; houseBonus: number; aura: number };
        };
        ctx.printTitle(`Постройки деревни (village.build) — уровень деревни ${v.level}`);
        for (const r of v.rows) {
          const status =
            r.status === 'construction'
              ? `СТРОИТСЯ — ${r.construction!.hoursLeft} ч осталось`
              : r.status === 'built'
                ? `построен ${r.level}/${r.maxLevel} (${r.builtAt ?? '—'})`
                : r.status === 'locked'
                  ? `закрыто: ${r.unlockLine}`
                  : 'доступно к стройке';
          ctx.print(`  ${r.name} (${r.id}) · ${r.kind} — ${status}`);
          ctx.print(`    ${r.desc}`);
          if (r.effectNow > 0) ctx.print(`    эффект сейчас: ${r.effectNow} (${r.kind === 'house' ? 'скидка unlock жителей' : r.kind === 'happiness' ? 'аура счастья' : r.kind === 'defense' ? 'защита' : r.kind === 'warehouse' ? '% защиты склада' : 'скидка %'})`);
          if (r.next !== null) {
            const items = r.next.items.length > 0 ? ` + ${r.next.items.map((c) => `${c.id} ×${c.qty}`).join(', ')}` : '';
            ctx.print(`    след. уровень ${r.next.level}: ${r.next.costGold}з${items} · ${r.next.hours} ч · XP +${r.next.xp} · эффект ${r.next.effect}`);
          }
        }
        ctx.print(`  эффекты: Кузница −${v.effects.repairDiscount}% починки · Рынок −${v.effects.marketDiscount}% купцов · Дом-скидка ${v.effects.houseBonus} · аура счастья +${v.effects.aura}`);
        return;
      }
      const r = api['village.build'](args[0]) as R<{ header: string; lines: string[] }>;
      if (!r.ok) return ctx.printErr(r.error);
      ctx.printOk(`  ${r.value.header}`);
      for (const line of r.value.lines) ctx.print(`    ${line}`);
      ctx.refresh();
    },
  });

  registry.register({
    name: 'village.equip',
    usage: 'village.equip <villagerId> <itemId|off>',
    description: 'снарядить жителя оружием/бронёй из рюкзака (TransactionService; снапшот качества/заточки) или снять (off — возврат предмета)',
    run(args, ctx) {
      const api = ctx.game.modules.get('village')?.api;
      if (!api) return ctx.printErr('модуль деревни не активен');
      const [vid, item] = args;
      if (vid === undefined || item === undefined) {
        return ctx.printErr('формат: village equip <villagerId> <itemId|off> (жители — village state; рюкзак — inv list)');
      }
      const r = api['village.equip'](vid, item) as R<{ header: string; lines: string[] }>;
      if (!r.ok) return ctx.printErr(r.error);
      ctx.printOk(`  ${r.value.header}`);
      for (const line of r.value.lines) ctx.print(`    ${line}`);
      ctx.refresh();
    },
  });

  registry.register({
    name: 'village.raid',
    usage: 'village.raid',
    description: 'рейд: порог/суммарная защита/силы жителей/расписание/маркеры окна (числа на стол)',
    run(_args, ctx) {
      const api = ctx.game.modules.get('village')?.api;
      if (!api) return ctx.printErr('модуль деревни не активен');
      const v = api['village.raid']() as {
        threshold: number;
        villageLevel: number;
        defense: { total: number; buildings: number; villagers: Array<{ id: string; name: string; item: string; tier: string; value: number; sharpening: number; strength: number }> };
        warehouseProtection: number;
        walletGold: number;
        schedule: { weekday: string; hour: number; nextAt: number; nextWeek: string; inHours: number; warningAt: number };
        warning: { sent: boolean; week: string | null; leadHours: number; resolvedThisWeek: boolean };
        lastResult: { success: boolean; stolen: number; dateISO: string; week: string } | null;
      };
      const next = new Date(v.schedule.nextAt);
      const warn = new Date(v.schedule.warningAt);
      ctx.printTitle('Рейд гоблинов (village.raid)');
      ctx.print(`  расписание: каждую ${v.schedule.weekday} в ${v.schedule.hour}:00 (ночь); предвестник ровно за 24 ч`);
      ctx.print(`  ближайший рейд: ${next.toLocaleString('ru-RU')} (через ${v.schedule.inHours} ч; неделя ${v.schedule.nextWeek})`);
      ctx.print(`  предвестник ожидается: ${warn.toLocaleString('ru-RU')} — ${v.warning.sent ? 'УЖЕ ОТПРАВЛЕН (разведчик видел огни)' : 'ещё не отправлен'}`);
      ctx.print(`  порог защиты: ${v.threshold} (уровень деревни ${v.villageLevel}) · суммарная защита: ${v.defense.total} (постройки ${v.defense.buildings} + жители ${Math.round((v.defense.total - v.defense.buildings) * 10) / 10})`);
      if (v.defense.villagers.length > 0) {
        ctx.print('  силы жителей:');
        for (const r of v.defense.villagers) {
          ctx.print(`    ${r.name} — ${r.item} (${r.tier}/${Math.round(r.value)}${r.sharpening > 0 ? `, заточка ${r.sharpening}` : ''}) → сила ${r.strength}`);
        }
      } else {
        ctx.print('  силы жителей: никто не снаряжён (village equip <villagerId> <itemId>)');
      }
      ctx.print(`  склад: защита ${v.warehouseProtection}% (Склад) · в кошельке ${v.walletGold}з (кража ≤ 20% склада cozy-капой)`);
      if (v.lastResult !== null) {
        ctx.print(`  прошлый рейд (${v.lastResult.dateISO}, неделя ${v.lastResult.week}): ${v.lastResult.success ? 'ПОБЕДА — кража 0' : `поражение — украдено ${v.lastResult.stolen}з`}`);
      } else {
        ctx.print('  прошлый рейд: ещё не было');
      }
      if (v.warning.resolvedThisWeek) ctx.print('  рейд этой недели уже разрешён (маркер raid.lastResult)');
    },
  });

  registry.register({
    name: 'village.raid.force',
    usage: 'village.raid.force',
    description: 'dev: форс окна рейда по стадиям — предвестник → ночь (после разрешения — отказ маркером; прецедент lake.force)',
    run(_args, ctx) {
      const api = ctx.game.modules.get('village')?.api;
      if (!api) return ctx.printErr('модуль деревни не активен');
      const r = api['village.raid.force']() as R<{ header: string; lines: string[] }>;
      if (!r.ok) return ctx.printErr(r.error);
      ctx.printTitle(r.value.header);
      for (const line of r.value.lines) ctx.print(`  ${line}`);
      ctx.refresh();
    },
  });

  // ------------------------------------------------------------ M16.3 (биржа)

  registry.register({
    name: 'village.trade',
    usage: 'village.trade',
    description: 'биржа: партнёры/контракты дня (премия к ставке)/тренды/репутация/уникальные товары (цены с расшифровкой PriceBus)/история цен',
    run(_args, ctx) {
      const api = ctx.game.modules.get('village')?.api;
      if (!api) return ctx.printErr('модуль деревни не активен');
      const v = api['village.trade']() as {
        day: string;
        contracts: Array<{ partnerId: string; partnerName: string; item: string; qty: number; premiumPercent: number; estimateUnit: number | null; estimateTotal: number | null; fulfilledToday: boolean; gateLine: string | null }>;
        goods: Array<{ partnerId: string; partnerName: string; defId: string; requiredLevelName: string; price: number; applied: string[]; gateLine: string | null }>;
        trends: Array<{ defId: string; kind: 'abundance' | 'deficit'; line: string }>;
        reputation: Array<{ partnerId: string; partnerName: string; points: number; levelName: string; toNext: number | null }>;
        history: Array<{ defId: string; kind: string; unit: number; day: string; qty: number; arrow: string }>;
        marketDiscount: number;
      };
      if (v.contracts.length === 0 && v.goods.length === 0) {
        return ctx.printErr('деревня заперта: биржа закрыта (village state — гейт)');
      }
      ctx.printTitle(`Биржа деревни (village.trade) — день ${v.day}`);
      ctx.print('  контракты дня (исполнение — village trade fulfill <partnerId>):');
      for (const c of v.contracts) {
        const status = c.fulfilledToday ? 'ИСПОЛНЕН' : c.gateLine !== null ? `закрыто: ${c.gateLine}` : 'открыт';
        const est = c.estimateUnit !== null ? `· оценка ${c.estimateUnit}з/ед → ~${c.estimateTotal}з (худший экземпляр рюкзака)` : '· предмета нет в рюкзаке (оценка без качества)';
        ctx.print(`    ${c.partnerName}: ${c.item} ×${c.qty} — премия +${c.premiumPercent}% к ставке скупки ${est}`);
        ctx.print(`      статус: ${status}`);
      }
      ctx.print('  тренды дня (04-DISCOUNTS §2.1/§4.3):');
      if (v.trends.length === 0) {
        ctx.print('    — (ни один товар не трендируется)');
      } else {
        for (const t of v.trends) ctx.print(`    ${t.defId}: ${t.line}`);
      }
      ctx.print('  репутация (очка за контракт — данные биржи; шкала: Чужак → Знакомый → Поставщик → Друг деревни):');
      for (const r of v.reputation) {
        ctx.print(`    ${r.partnerName}: ${r.points} очков — «${r.levelName}»${r.toNext !== null ? ` (до следующего ${r.toNext})` : ' (МАКС)'}`);
      }
      ctx.print('  уникальные товары партнёров (покупка — village trade buy <partnerId> <itemId> [qty]):');
      for (const g of v.goods) {
        const gate = g.gateLine !== null ? ` · ЗАКРЫТО: ${g.gateLine}` : '';
        ctx.print(`    ${g.partnerName}: ${g.defId} — ${g.price}з${gate}`);
        if (g.applied.length > 0) ctx.print(`      расшифровка: ${g.applied.join('; ')}`);
      }
      if (v.history.length > 0) {
        ctx.print('  история цен (последняя сделка по товару; ↑↓ — направление):');
        const ARROW: Record<string, string> = { up: '↑', down: '↓', flat: '=', none: '·' };
        for (const h of v.history) {
          ctx.print(`    ${h.defId} (${h.kind === 'contract' ? 'контракт' : 'покупка'}): ${h.unit}з/ед ×${h.qty} — ${h.day} ${ARROW[h.arrow] ?? '·'}`);
        }
      } else {
        ctx.print('  история цен: сделок ещё не было');
      }
      if (v.marketDiscount > 0) {
        ctx.print(`  Рынок деревни: −${v.marketDiscount}% у купцов (потребитель — цены биржи)`);
      }
    },
  });

  registry.register({
    name: 'village.trade.fulfill',
    usage: 'village.trade.fulfill <partnerId> [item]',
    description: 'исполнить контракт дня партнёра (TransactionService: предмет → золото с премией; +репутация; событие trade.fulfilled)',
    run(args, ctx) {
      const api = ctx.game.modules.get('village')?.api;
      if (!api) return ctx.printErr('модуль деревни не активен');
      const [partner, item] = args;
      if (partner === undefined) {
        return ctx.printErr('формат: village trade fulfill <partnerId> [item] (доска — village trade)');
      }
      const r = api['village.trade.fulfill'](partner, item) as R<{ header: string; lines: string[] }>;
      if (!r.ok) return ctx.printErr(r.error);
      ctx.printOk(`  ${r.value.header}`);
      for (const line of r.value.lines) ctx.print(`    ${line}`);
      ctx.refresh();
    },
  });

  registry.register({
    name: 'village.trade.buy',
    usage: 'village.trade.buy <partnerId> <itemId> [qty]',
    description: 'купить уникальный товар у партнёра (PriceBus тег trade: тренды/репутация/Рынок; гейт — уровень репутации)',
    run(args, ctx) {
      const api = ctx.game.modules.get('village')?.api;
      if (!api) return ctx.printErr('модуль деревни не активен');
      const [partner, item, qty] = args;
      if (partner === undefined || item === undefined) {
        return ctx.printErr('формат: village trade buy <partnerId> <itemId> [qty] (товары — village trade)');
      }
      const r = api['village.trade.buy'](partner, item, qty !== undefined ? Number(qty) : 1) as R<{
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
    name: 'village.trade.trend.force',
    usage: 'village.trade.trend.force',
    description: 'dev: реролл контрактов и трендов дня (сид-суффикс #N; маркеры исполнений НЕ сбрасывает; прецедент village.raid.force)',
    run(_args, ctx) {
      const api = ctx.game.modules.get('village')?.api;
      if (!api) return ctx.printErr('модуль деревни не активен');
      const r = api['village.trade.trend.force']() as R<{ header: string; lines: string[] }>;
      if (!r.ok) return ctx.printErr(r.error);
      ctx.printTitle(r.value.header);
      for (const line of r.value.lines) ctx.print(`  ${line}`);
      ctx.refresh();
    },
  });
}
