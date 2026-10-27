/**
 * Команды модуля M08 «Озеро» (карточка §6 + брифы §3.7/§2.4; регистрация —
 * console.ts). M08.1: lake.state (витрина — commands-lake-view.ts), lake.release,
 * lake.feed/treat/clean/harvest, lake.buy feed, lake.pair/lake.force.
 * [M08.2]: lake.upgrade [id] — витрина ×7/покупка; lake.switch <0|1>;
 * lake.research <plus1|plus2> (Лаборатория); lake.force research 0 — сброс
 * кулдауна.
 */
import type { CommandRegistry, CommandContext } from './console-types';
import { printLakeState } from './commands-lake-view';

type R<T> = { ok: true; value: T } | { ok: false; error: string };

interface UpgradeRow {
  id: string;
  name: string;
  price: number;
  bought: boolean;
  description: string;
}

function fmtRemaining(ms: number): string {
  const s = Math.ceil(ms / 1000);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  return h > 0 ? `${h}ч ${m}м` : `${m}м ${s % 60}с`;
}

export function registerLakeCommands(registry: CommandRegistry): void {
  registry.register({
    name: 'lake.state',
    usage: 'lake.state',
    description: 'озеро: активное озеро, вода, рыбы, пары/икра, улучшения, лаборатория, статы (П6)',
    run(_args, ctx) {
      const api = ctx.game.modules.get('lake')?.api;
      if (!api) return ctx.printErr('модуль озера не активен');
      printLakeState(ctx, api);
    },
  });

  registry.register({
    name: 'lake.upgrade',
    usage: 'lake.upgrade [id]',
    description: 'улучшения озера: витрина ×7 / покупка (Аэратор/Подогреватель/Автокормушка/Инкубатор/Глубоководье/Лаборатория/Второе озеро)',
    run(args, ctx) {
      const api = ctx.game.modules.get('lake')?.api;
      if (!api) return ctx.printErr('модуль озера не активен');
      if (args[0] === undefined) {
        const v = api['lake.upgrade']() as { lakeIdx: number; rows: UpgradeRow[] };
        ctx.printTitle(`Улучшения озера №${v.lakeIdx + 1} (lake.upgrade <id>)`);
        for (const u of v.rows) {
          ctx.print(
            `  ${u.bought ? '[x]' : '[ ]'} ${u.name} (${u.id}) · ${u.price}з — ${u.description}`,
          );
        }
        return;
      }
      const r = api['lake.upgrade'](args[0]) as R<{ name: string; price: number; lakeIdx: number }>;
      if (!r.ok) return ctx.printErr(r.error);
      ctx.printOk(`  куплено: «${r.value.name}» за ${r.value.price}з (озеро №${r.value.lakeIdx + 1}; транзакция lake.upgrade)`);
    },
  });

  registry.register({
    name: 'lake.switch',
    usage: 'lake.switch <0|1>',
    description: 'переключить активное озеро (после покупки «Второго озера»)',
    run(args, ctx) {
      const api = ctx.game.modules.get('lake')?.api;
      if (!api) return ctx.printErr('модуль озера не активен');
      if (args[0] === undefined) return ctx.printErr('укажите озеро: lake.switch <0|1>');
      const r = api['lake.switch'](args[0]) as R<{ activeLake: number }>;
      if (!r.ok) return ctx.printErr(r.error);
      ctx.printOk(`  активное озеро: №${r.value.activeLake + 1} (витрина/уход/покупки — на нём; тики идут по обоим)`);
    },
  });

  registry.register({
    name: 'lake.research',
    usage: 'lake.research <plus1|plus2>',
    description: 'Лаборатория: направить следующую мутацию (plus1 — 10/11 к +1; plus2 — гарант +2)',
    run(args, ctx) {
      const api = ctx.game.modules.get('lake')?.api;
      if (!api) return ctx.printErr('модуль озера не активен');
      if (args[0] === undefined) return ctx.printErr('укажите режим: lake.research <plus1|plus2>');
      const r = api['lake.research'](args[0]) as R<{ mode: string; readyInMs: number }>;
      if (!r.ok) return ctx.printErr(r.error);
      const hint = r.value.mode === 'plus2'
        ? 'следующая икра — РЕДКАЯ +2 гарантирована (потомок ВЫШЕ лучшего родителя, кап SS)'
        : 'следующая икра: 10/11 → +1, 1/11 → +2 (окно [0.89, 1] по базовым границам)';
      ctx.printOk(`  форс ${r.value.mode} заряжен · ${hint} (перезарядка ${fmtRemaining(r.value.readyInMs)})`);
    },
  });

  registry.register({
    name: 'lake.release',
    usage: 'lake.release <iid>',
    description: 'выпустить пойманную рыбу из рюкзака в свободный слот (качество переносится)',
    run(args, ctx) {
      const api = ctx.game.modules.get('lake')?.api;
      if (!api) return ctx.printErr('модуль озера не активен');
      if (!args[0]) return ctx.printErr('укажите iid рыбы: lake.release <iid> (iid — в inv list)');
      const r = api['lake.release'](args[0]) as R<{ slotIdx: number; fishId: string; quality: string }>;
      if (!r.ok) return ctx.printErr(r.error);
      ctx.printOk(`  выпущена: ${r.value.fishId} → слот ${r.value.slotIdx} · тир ${r.value.quality} (запись израсходована, сыта сейчас)`);
    },
  });

  registry.register({
    name: 'lake.feed',
    usage: 'lake.feed',
    description: 'накормить ВСЕХ голодных активного озера (Корм ×N атомарно, энергия 2)',
    run(_args, ctx) {
      const api = ctx.game.modules.get('lake')?.api;
      if (!api) return ctx.printErr('модуль озера не активен');
      const r = api['lake.feed']() as R<{ fed: number; consumed: number }>;
      if (!r.ok) return ctx.printErr(r.error);
      ctx.printOk(`  накормлено ${r.value.fed} · Корма израсходовано ${r.value.consumed} (транзакция lake.feed, энергия 2)`);
    },
  });

  registry.register({
    name: 'lake.treat',
    usage: 'lake.treat <slot>',
    description: 'вылечить больную рыбу (Лекарство для животных ×1)',
    run(args, ctx) {
      const api = ctx.game.modules.get('lake')?.api;
      if (!api) return ctx.printErr('модуль озера не активен');
      if (args[0] === undefined) return ctx.printErr('укажите слот: lake.treat <slot>');
      const r = api['lake.treat'](Number(args[0])) as R<{ slotIdx: number; fishId: string }>;
      if (!r.ok) return ctx.printErr(r.error);
      ctx.printOk(`  вылечена: ${r.value.fishId} (слот ${r.value.slotIdx}) — animal_remedy ×1 израсходована`);
    },
  });

  registry.register({
    name: 'lake.clean',
    usage: 'lake.clean',
    description: '«Сачок»: +15 чистоты (кап 100), энергия 3',
    run(_args, ctx) {
      const api = ctx.game.modules.get('lake')?.api;
      if (!api) return ctx.printErr('модуль озера не активен');
      const r = api['lake.clean']() as R<{ cleanliness: number }>;
      if (!r.ok) return ctx.printErr(r.error);
      ctx.printOk(`  сачок прошёл: чистота ${r.value.cleanliness}/100 (энергия 3)`);
    },
  });

  registry.register({
    name: 'lake.harvest',
    usage: 'lake.harvest <slot>',
    description: 'собрать взрослую рыбу в инвентарь (источник lake, качество переносится)',
    run(args, ctx) {
      const api = ctx.game.modules.get('lake')?.api;
      if (!api) return ctx.printErr('модуль озера не активен');
      if (args[0] === undefined) return ctx.printErr('укажите слот: lake.harvest <slot>');
      const r = api['lake.harvest'](Number(args[0])) as R<{ slotIdx: number; fishId: string; quality: string }>;
      if (!r.ok) return ctx.printErr(r.error);
      ctx.printOk(`  собрана: ${r.value.fishId} (слот ${r.value.slotIdx}) → инвентарь, тир ${r.value.quality} (продажа — sell ${r.value.fishId} 1)`);
    },
  });

  registry.register({
    name: 'lake.buy',
    usage: 'lake.buy feed [qty]',
    description: 'купить Корм (прямой канал озера, без энергии; цена — shop.currencyGoods)',
    run(args, ctx) {
      const api = ctx.game.modules.get('lake')?.api;
      if (!api) return ctx.printErr('модуль озера не активен');
      const what = args[0] ?? 'feed';
      const qty = args[1] !== undefined ? Number(args[1]) : 1;
      const r = api['lake.buy'](what, qty) as R<{ qty: number; pricePerUnit: number }>;
      if (!r.ok) return ctx.printErr(r.error);
      ctx.printOk(`  куплено: Корм ×${r.value.qty} за ${r.value.pricePerUnit * r.value.qty}з (${r.value.pricePerUnit}з/шт, транзакция lake.buy)`);
    },
  });

  registry.register({
    name: 'lake.pair',
    usage: 'lake.pair <slotA> <slotB>',
    description: 'dev: форс-пара двух слотов одного вида активного озера (условия НЕ проверяются)',
    run(args, ctx) {
      const api = ctx.game.modules.get('lake')?.api;
      if (!api) return ctx.printErr('модуль озера не активен');
      if (args[0] === undefined || args[1] === undefined) {
        return ctx.printErr('укажите два слота: lake.pair <slotA> <slotB>');
      }
      const r = api['lake.pair'](Number(args[0]), Number(args[1])) as R<{ fishId: string; dueAt: number; maxParentTier: string }>;
      if (!r.ok) return ctx.printErr(r.error);
      ctx.printOk(`  пара ${r.value.fishId} идёт: икра через ${fmtRemaining(Math.max(0, r.value.dueAt - ctx.game.time.now()))} · тиры родителей ≤ ${r.value.maxParentTier}`);
    },
  });

  registry.register({
    name: 'lake.force',
    usage: 'lake.force sick <slot> | roe <A> <B> | research 0',
    description: 'dev: форс болезни слота / икры немедленно / сброс кулдауна Лаборатории',
    run(args, ctx) {
      const api = ctx.game.modules.get('lake')?.api;
      if (!api) return ctx.printErr('модуль озера не активен');
      const what = args[0];
      if (what === 'sick') {
        if (args[1] === undefined) return ctx.printErr('укажите слот: lake.force sick <slot>');
        const r = api['lake.force']('sick', args[1]) as R<{ slotIdx: number; fishId: string }>;
        if (!r.ok) return ctx.printErr(r.error);
        ctx.printOk(`  болезнь форсирована: ${r.value.fishId} (слот ${r.value.slotIdx}) — lake.fishSick опубликовано`);
        return;
      }
      if (what === 'roe') {
        if (args[1] === undefined || args[2] === undefined) {
          return ctx.printErr('укажите два слота: lake.force roe <slotA> <slotB>');
        }
        const r = api['lake.force']('roe', args[1], args[2]) as R<{ fishId: string; childTier: string; bonus: number; roll: number }>;
        if (!r.ok) return ctx.printErr(r.error);
        const window = r.value.bonus === 2 ? '[0.99, 1] → +2 (РЕДКАЯ — потомок ВЫШЕ лучшего родителя!)' : r.value.bonus === 1 ? '[0.89, 0.99) → +1' : '[0, 0.89) → +0';
        ctx.printOk(`  икра форсирована: ${r.value.fishId} тир ${r.value.childTier} · мутационный ролл ${r.value.roll.toFixed(4)} ${window} · lake.bred опубликовано`);
        return;
      }
      if (what === 'research') {
        const r = api['lake.force']('research', 0) as R<{ lakeIdx: number }>;
        if (!r.ok) return ctx.printErr(r.error);
        ctx.printOk(`  кулдаун Лаборатории сброшен (озеро №${r.value.lakeIdx + 1})`);
        return;
      }
      ctx.printErr('lake.force sick <slot> | roe <slotA> <slotB> | research 0');
    },
  });
}
