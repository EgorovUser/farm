/**
 * Команды модуля M05 «Ферма» (карточка §7; регистрация — console.ts).
 * farm.state — витрина вкладок/тайлов с FSM-состояниями, таймерами,
 * сорняками и сухостью (П6), farm.plow/plant/water/fertilize/weed/harvest —
 * переходы цикла (гейты и энергии — в модуле; отказы с причиной),
 * farm.grow <tileIdx> — dev-форс готовности (быстрые пробы; полив-гейт
 * остаётся честным — форсается только время). Каталог культур и покупки
 * улучшений — commands-farm-upgrades.ts (wc-распил M05.3).
 *
 * [M05.2 · §3.3] farm.weed <tileIdx> / farm.weed all — прополка (карточка
 * §7); farm.weed spawn <tile> [stage] — dev-форс зарастания БЕЗ publicApi
 * (бриф: манифест не трогать): временный override-100 шанса с ТЕГОМ тайла
 * (BuffService — мод-путь) + publication hourTick ×stage + снятие мода;
 * гарантированно зарастает только целевой тайл (шанс других — как обычно).
 *
 * [M05.3 · G1] таб-параметр: farm.plant <crop> <tile> [tab] — вкладки
 * улучшений («Грибница»/«Виноградник»/«Теплица»/«Второе поле») несут свои
 * сетки тайлов; по умолчанию — «Поле» (field).
 */
import type { CommandRegistry } from './console-types';

type R<T> = { ok: true; value: T } | { ok: false; error: string };

interface TileView {
  index: number;
  state: string;
  cropId?: string;
  plantedAt?: number;
  grownAt?: number;
  wateredUntil?: number;
  weeds: number;
  fertilized?: boolean;
  harvestsLeft?: number;
  fruitingUntil?: number;
  watered: boolean;
  wet: boolean;
  remainingMs: number | null;
}

interface StateView {
  now: number;
  tabs: Array<{ id: string; kind: string; tiles: TileView[] }>;
  upgrades: string[];
}

const STATE_RU: Record<string, string> = {
  empty: '· пусто',
  plowed: 'вспахан',
  growing: 'растёт',
  ready: 'ГОТОВ',
};

function fmtRemaining(ms: number | null): string {
  if (ms === null) return '';
  const s = Math.ceil(ms / 1000);
  if (s <= 0) return ' · пора (ждёт полива/сбора)';
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  return h > 0 ? ` · осталось ${h}ч ${m}м` : ` · осталось ${m}м ${s % 60}с`;
}

function fmtTime(at: number): string {
  const d = new Date(at);
  const p = (n: number) => String(n).padStart(2, '0');
  return `${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
}

export function registerFarmCommands(registry: CommandRegistry): void {
  registry.register({
    name: 'farm.state',
    usage: 'farm.state',
    description: 'ферма: вкладки и тайлы (FSM-состояния, таймеры, полив/удобрение)',
    run(_args, ctx) {
      const api = ctx.game.modules.get('farm')?.api;
      if (!api) return ctx.printErr('модуль фермы не активен');
      // витрина — не Result: возвращает данные напрямую
      const v = api['farm.state']() as StateView;
      ctx.printTitle(`Ферма · вкладки ${v.tabs.length} · улучшений ${v.upgrades.length} · ${new Date(v.now).toLocaleDateString('ru-RU')}`);
      for (const tab of v.tabs) {
        ctx.print(`Вкладка «${tab.id}» (${tab.kind}) · тайлов ${tab.tiles.length}`);
        for (const t of tab.tiles) {
          const crop = t.cropId ? ` · ${t.cropId}` : '';
          // [M05.2 · F3] влажность/сухость: wet — окно живо; watered — был полит:
          // полит и не wet = СУХОЙ (рост на паузе до повторного полива)
          const water =
            t.state === 'growing'
              ? t.wet
                ? ' · полит'
                : t.watered
                  ? ' · СУХОЙ (рост на паузе!)'
                  : ' · ПОЛИТЬ!'
              : '';
          const fert = t.fertilized ? ' · удобрен' : '';
          const grown = t.state === 'ready' && t.grownAt ? ` · созрел ${fmtTime(t.grownAt)}` : '';
          const planted = t.plantedAt ? ` · посажен ${fmtTime(t.plantedAt)}` : '';
          const weeds = t.weeds > 0 ? ` · сорняки ${t.weeds}` : '';
          // [M05.3 · G5] replantable: счётчик сборов клубники / окно винограда
          const more = t.harvestsLeft !== undefined ? ` · сборов ещё ${t.harvestsLeft}` : '';
          const fruit = t.fruitingUntil !== undefined ? ` · плодоносит до ${fmtTime(t.fruitingUntil)}` : '';
          ctx.print(
            `  [${String(t.index).padStart(2, '0')}] ${STATE_RU[t.state] ?? t.state}${crop}${planted}${grown}${fmtRemaining(t.remainingMs)}${water}${fert}${weeds}${more}${fruit}`,
          );
        }
      }
      ctx.print('действия: farm.plow <tile> [tab] · farm.plant <crop> <tile> [tab] · farm.water <tile> [tab] · farm.fertilize <tile> [tab] · farm.harvest <tile> [tab] · культуры: farm.crops · улучшения: farm.upgrades');
      ctx.refresh();
    },
  });

  registry.register({
    name: 'farm.plow',
    usage: 'farm.plow <tileIdx> [tab]',
    description: 'вспахать пустой тайл (5 энергии; мини-игра «Тайминг» — auto)',
    run(args, ctx) {
      const api = ctx.game.modules.get('farm')?.api;
      if (!api) return ctx.printErr('модуль фермы не активен');
      const idx = args[0];
      if (idx === undefined) return ctx.printErr('укажите тайл: farm.plow 0 (витрина — farm.state)');
      const r = api['farm.plow'](idx, args[1]) as R<{ tab: string; tileIdx: number }>;
      if (!r.ok) return ctx.printErr(r.error);
      ctx.printOk(`тайл ${r.value.tileIdx} вспахан (энергия −${5})`);
      ctx.refresh();
    },
  });

  registry.register({
    name: 'farm.plant',
    usage: 'farm.plant <cropId> <tileIdx> [tab]',
    description: 'посадить культуру во вспаханный тайл (1 энергия; семя из инвентаря)',
    run(args, ctx) {
      const api = ctx.game.modules.get('farm')?.api;
      if (!api) return ctx.printErr('модуль фермы не активен');
      const crop = args[0];
      const idx = args[1];
      if (!crop || idx === undefined) return ctx.printErr('укажите: farm.plant wheat 0 (культуры — farm.crops, тайлы — farm.state)');
      const r = api['farm.plant'](crop, idx, args[2]) as R<{ tab: string; tileIdx: number; cropId: string; grownAt: number }>;
      if (!r.ok) return ctx.printErr(r.error);
      const left = Math.round((r.value.grownAt - Date.now()) / 60000);
      ctx.printOk(`посажено: ${r.value.cropId} в тайл ${r.value.tileIdx} · созреет к ${fmtTime(r.value.grownAt)} (~${Math.max(0, left)}м по игровым часам)`);
      ctx.refresh();
    },
  });

  registry.register({
    name: 'farm.water',
    usage: 'farm.water <tileIdx>',
    description: 'полить растущее (2 энергии; окно влажности 8ч — гейт готовности)',
    run(args, ctx) {
      const api = ctx.game.modules.get('farm')?.api;
      if (!api) return ctx.printErr('модуль фермы не активен');
      const idx = args[0];
      if (idx === undefined) return ctx.printErr('укажите тайл: farm.water 0');
      const r = api['farm.water'](idx, args[1]) as R<{ tab: string; tileIdx: number; wateredUntil: number }>;
      if (!r.ok) return ctx.printErr(r.error);
      ctx.printOk(`тайл ${r.value.tileIdx} полит · влажность до ${fmtTime(r.value.wateredUntil)}`);
      ctx.refresh();
    },
  });

  registry.register({
    name: 'farm.fertilize',
    usage: 'farm.fertilize <tileIdx>',
    description: 'удобрить растущее (Удобрение ×1: +15% скорости, шанс +1 тир качества)',
    run(args, ctx) {
      const api = ctx.game.modules.get('farm')?.api;
      if (!api) return ctx.printErr('модуль фермы не активен');
      const idx = args[0];
      if (idx === undefined) return ctx.printErr('укажите тайл: farm.fertilize 0');
      const r = api['farm.fertilize'](idx, args[1]) as R<{ tab: string; tileIdx: number; grownAt: number; prevGrownAt: number }>;
      if (!r.ok) return ctx.printErr(r.error);
      const saved = Math.max(0, r.value.prevGrownAt - r.value.grownAt);
      ctx.printOk(`тайл ${r.value.tileIdx} удобрен · созреет быстрее на ${Math.round(saved / 1000)}с (к ${fmtTime(r.value.grownAt)})`);
      ctx.refresh();
    },
  });

  registry.register({
    name: 'farm.harvest',
    usage: 'farm.harvest <tileIdx>',
    description: 'собрать готовое (3 энергии; урожай в инвентарь с качеством)',
    run(args, ctx) {
      const api = ctx.game.modules.get('farm')?.api;
      if (!api) return ctx.printErr('модуль фермы не активен');
      const idx = args[0];
      if (idx === undefined) return ctx.printErr('укажите тайл: farm.harvest 0');
      const r = api['farm.harvest'](idx, args[1]) as R<{ tab: string; tileIdx: number; cropId: string; yields: Array<{ defId: string; qty: number; quality: { tier: string; value: number } }>; aftermath: 'empty' | 'again' | 'regrow'; harvestsLeft?: number; fruitingUntil?: number }>;
      if (!r.ok) return ctx.printErr(r.error);
      const parts = r.value.yields.map((y) => {
        const def = ctx.game.content.tryItem(y.defId);
        return `${def?.name ?? y.defId} ×${y.qty} (качество ${y.quality.tier}, ${y.quality.value})`;
      });
      // [M05.3 · G5] послесловие: обычный сбор — EMPTY; клубника снова ГОТОВ
      // (сборов ещё N); виноград — регроу в окне плодоношения
      const tail =
        r.value.aftermath === 'again'
          ? ` · сборов ещё ${r.value.harvestsLeft}`
          : r.value.aftermath === 'regrow'
            ? ` · лоза реграет до ${fmtTime(r.value.fruitingUntil ?? 0)}`
            : ' · тайл свободен';
      ctx.printOk(`собрано: ${parts.join(', ')}${tail}`);
      ctx.refresh();
    },
  });

  registry.register({
    name: 'farm.grow',
    usage: 'farm.grow <tileIdx>',
    description: 'dev: форс времени роста (готовность по часам; полив-гейт честен)',
    run(args, ctx) {
      const api = ctx.game.modules.get('farm')?.api;
      if (!api) return ctx.printErr('модуль фермы не активен');
      const idx = args[0];
      if (idx === undefined) return ctx.printErr('укажите тайл: farm.grow 0');
      const r = api['farm.grow'](idx, args[1]) as R<{ tileIdx: number }>;
      if (!r.ok) return ctx.printErr(r.error);
      ctx.printOk(`время роста тайла ${r.value.tileIdx} истекло (полив-гейт и сбор — как обычно)`);
      ctx.refresh();
    },
  });

  registry.register({
    name: 'farm.weed',
    usage: 'farm.weed <tileIdx> | farm.weed all | farm.weed spawn <tileIdx> [stage]',
    description: 'прополка (1 энергия); all — все заросшие; spawn — dev-форс зарастания',
    run(args, ctx) {
      const api = ctx.game.modules.get('farm')?.api;
      if (!api) return ctx.printErr('модуль фермы не активен');

      // --- dev-форс зарастания: override-100 шанса с тегом ЦЕЛЕВОГО тайла
      //     + публикация hourTick × stage + снятие мода (publicApi не трогаем)
      if (args[0] === 'spawn') {
        const idx = args[1];
        if (idx === undefined) return ctx.printErr('укажите тайл: farm.weed spawn 0 2 [tab]');
        const stage = Math.min(3, Math.max(1, Number(args[2]) || 1));
        // [M05.3] таб-параметр: форс зарастания в любой вкладке (пробы Теплицы)
        const tabId = typeof args[3] === 'string' && args[3].length > 0 ? args[3] : 'field';
        const tag = `farm:tile:${tabId}:${Number(idx)}`;
        const modId = `debug.farm.weeds.spawn.${Date.now()}`;
        const add = ctx.game.buffs.add(
          {
            id: modId,
            source: { kind: 'buff', refId: 'debug.console' },
            stat: 'farm.weeds.chancePercent',
            op: 'override',
            value: 100,
            tags: [tag],
            label: 'dev-форс зарастания (farm.weed spawn)',
          },
          ctx.game.time.now(),
        );
        if (!add.ok) return ctx.printErr(add.error);
        for (let i = 0; i < stage; i++) {
          ctx.game.bus.publish('time.hourTick', {
            hourIndex: Math.floor(ctx.game.time.now() / 3_600_000),
            now: ctx.game.time.now(),
            catchUp: false,
            crossed: 1,
          });
        }
        ctx.game.buffs.remove(modId);
        ctx.printOk(`dev-форс: ${stage} часовых прохода с шансом 100% для тайла ${Number(idx)} вкладки ${tabId} (мод снят)`);
        ctx.refresh();
        return;
      }

      if (args[0] === 'all') {
        const v = api['farm.state']() as StateView;
        const weedy = v.tabs.flatMap((tab) => tab.tiles.filter((t) => t.state === 'growing' && t.weeds > 0).map((t) => ({ ...t, tabId: tab.id })));
        if (weedy.length === 0) return ctx.print('заросших тайлов нет');
        let done = 0;
        let spent = 0;
        for (const t of weedy) {
          const r = api['farm.weed'](t.index, t.tabId) as R<{ prevWeeds: number }>;
          if (r.ok) {
            done++;
            spent += 1;
          } else {
            ctx.printErr(`тайл ${t.tabId}:${t.index}: ${r.error}`);
          }
        }
        ctx.printOk(`прополото тайлов: ${done} (энергия −${spent})`);
        ctx.refresh();
        return;
      }

      const idx = args[0];
      if (idx === undefined) return ctx.printErr('укажите тайл: farm.weed 0 (или all / spawn 0 2)');
      const r = api['farm.weed'](idx, args[1]) as R<{ tab: string; tileIdx: number; prevWeeds: number; composted: boolean }>;
      if (!r.ok) return ctx.printErr(r.error);
      // [M05.3 · G2] Компостер: обмен навоза на удобрение видим в выводе (П6)
      const compost = r.value.composted ? ' · компостер: навоз → удобрение' : '';
      ctx.printOk(`тайл ${r.value.tileIdx} прополот (сорняков было ${r.value.prevWeeds}, энергия −1)${compost}`);
      ctx.refresh();
    },
  });
}
