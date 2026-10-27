/**
 * Команды модуля M06 «Загон» — часть 2 (сеанс M06.2: болезни/улучшения/
 * разведение/навоз; wc-распил commands-pen.ts по 01 §6). Регистрация —
 * console.ts. pen.sick — dev-форс (заявлен SESSION-M06 §3.8), pen.heal —
 * лечение лекарством, pen.breed/pen.sell — разведение/продажа, pen.upgrade/
 * pen.upgrades — улучшения, pen.manure [take] — буфер навоза.
 */
import type { CommandRegistry } from './console-types';

type R<T> = { ok: true; value: T } | { ok: false; error: string };

export function registerPenCommands2(registry: CommandRegistry): void {
  registry.register({
    name: 'pen.sick',
    usage: 'pen.sick <idx> [pen]',
    description: 'dev: форс болезни (health → 40, sickAt = now; событие pen.animalSick)',
    run(args, ctx) {
      const api = ctx.game.modules.get('pen')?.api;
      if (!api) return ctx.printErr('модуль загона не активен');
      const idx = args[0];
      if (idx === undefined) return ctx.printErr('укажите номер животного: pen.sick 0 (витрина — pen.state)');
      const r = api['pen.sick'](idx, args[1]) as R<{ idx: number; health: number; dayIndex: number }>;
      if (!r.ok) return ctx.printErr(r.error);
      ctx.printOk(`животное №${r.value.idx} заболело (dev-форс): здоровье ${r.value.health}/100, самолечение через 48ч или pen.heal ${r.value.idx}`);
      ctx.refresh();
    },
  });

  registry.register({
    name: 'pen.heal',
    usage: 'pen.heal <idx> [pen]',
    description: 'вылечить животное лекарством (1 «Лекарство для животных», 0 энергии)',
    run(args, ctx) {
      const api = ctx.game.modules.get('pen')?.api;
      if (!api) return ctx.printErr('модуль загона не активен');
      const idx = args[0];
      if (idx === undefined) return ctx.printErr('укажите номер животного: pen.heal 0 (витрина — pen.state)');
      const r = api['pen.heal'](idx, args[1]) as R<{ idx: number; health: number; immuneHours: number }>;
      if (!r.ok) return ctx.printErr(r.error);
      ctx.printOk(`животное №${r.value.idx} вылечено: здоровье ${r.value.health}/100, иммунитет ${r.value.immuneHours}ч`);
      ctx.refresh();
    },
  });

  registry.register({
    name: 'pen.breed',
    usage: 'pen.breed <idx1> <idx2> [pen]',
    description: 'запустить разведение пары одного вида (нужен «Родильный загон»; потомство через 48ч)',
    run(args, ctx) {
      const api = ctx.game.modules.get('pen')?.api;
      if (!api) return ctx.printErr('модуль загона не активен');
      const [a1, a2] = args;
      if (a1 === undefined || a2 === undefined) return ctx.printErr('укажите пару: pen.breed 0 1 (один вид, оба здоровы и сыты)');
      const r = api['pen.breed'](a1, a2, args[2]) as R<{ speciesId: string; dueAt: number; maxParentTier: string }>;
      if (!r.ok) return ctx.printErr(r.error);
      ctx.printOk(`разведение запущено: ${r.value.speciesId} (лучший тир родителей ${r.value.maxParentTier}) → потомство ${new Date(r.value.dueAt).toLocaleString('ru-RU')}`);
      ctx.refresh();
    },
  });

  registry.register({
    name: 'pen.sell',
    usage: 'pen.sell <idx> [pen]',
    description: 'продать животное (50% цены покупки; больное — отказ)',
    run(args, ctx) {
      const api = ctx.game.modules.get('pen')?.api;
      if (!api) return ctx.printErr('модуль загона не активен');
      const idx = args[0];
      if (idx === undefined) return ctx.printErr('укажите номер животного: pen.sell 0 (витрина — pen.state)');
      const r = api['pen.sell'](idx, args[1]) as R<{ idx: number; gold: number; speciesId: string }>;
      if (!r.ok) return ctx.printErr(r.error);
      ctx.printOk(`${r.value.speciesId} №${r.value.idx} продан: +${r.value.gold}з, слот освобождён`);
      ctx.refresh();
    },
  });

  registry.register({
    name: 'pen.upgrade',
    usage: 'pen.upgrade <id>',
    description: 'купить улучшение загона (золото, без энергии; список — pen.upgrades)',
    run(args, ctx) {
      const api = ctx.game.modules.get('pen')?.api;
      if (!api) return ctx.printErr('модуль загона не активен');
      const id = args[0];
      if (!id) return ctx.printErr('укажите id: pen.upgrade upg_barn (список — pen.upgrades)');
      const r = api['pen.upgrade'](id) as R<{ name: string; level: number; maxLevel: number; description: string }>;
      if (!r.ok) return ctx.printErr(r.error);
      ctx.printOk(`${r.value.name} куплен (уровень ${r.value.level}/${r.value.maxLevel}): ${r.value.description}`);
      ctx.refresh();
    },
  });

  registry.register({
    name: 'pen.upgrades',
    usage: 'pen.upgrades',
    description: 'улучшения загона: доступные/купленные, цены, эффекты (П6)',
    run(_args, ctx) {
      const api = ctx.game.modules.get('pen')?.api;
      if (!api) return ctx.printErr('модуль загона не активен');
      const v = api['pen.upgrades']() as {
        rows: Array<{ id: string; name: string; description: string; price: number; level: number; maxLevel: number }>;
      };
      ctx.printTitle(`Улучшения загона · ${v.rows.length}`);
      for (const r of v.rows) {
        const lvl = r.level > 0 ? (r.maxLevel > 1 ? ` · куплен ур. ${r.level}/${r.maxLevel}` : ' · куплен') : '';
        ctx.print(`  ${r.name} (${r.id}) · ${r.price}з · ${r.description}${lvl}`);
      }
      ctx.print('покупка: pen.upgrade <id>');
      ctx.refresh();
    },
  });

  registry.register({
    name: 'pen.manure',
    usage: 'pen.manure [take [qty]]',
    description: 'навоз: буфер загона; take — забрать в инвентарь (компостер фермы принимает)',
    run(args, ctx) {
      const api = ctx.game.modules.get('pen')?.api;
      if (!api) return ctx.printErr('модуль загона не активен');
      const v = api['pen.manure']() as { manure: number; cap: number };
      if (args[0] !== 'take') {
        ctx.printTitle(`Навоз · буфер ${v.manure}/${v.cap}`);
        ctx.print('  каждое кормление +1 навоз; «Симбиоз» превращает в Удобрение на границе дня');
        ctx.print('  ручной обмен: pen.manure take [qty] → предметы «Навоз» в инвентарь (дальше — компостер фермы при прополке)');
        ctx.refresh();
        return;
      }
      const qty = args[1] !== undefined ? Number(args[1]) : undefined;
      const r = api['pen.manure.take'](qty) as R<{ taken: number }>;
      if (!r.ok) return ctx.printErr(r.error);
      ctx.printOk(`Навоз ×${r.value.taken} → инвентарь (живой путь M05: компостер фермы примет при прополке)`);
      ctx.refresh();
    },
  });
}
