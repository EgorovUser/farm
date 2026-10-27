/**
 * Команды модуля M11 «Работники» (карточка §6 + бриф F9; регистрация —
 * console.ts после lake): workers <board|list|hire|fire|bonus> — витрины и
 * действия; dev: mood set <idx> <0..100> (форс настроения серий увольнения)
 * и payday force (расчётный день немедленно).
 */
import type { CommandRegistry, CommandContext } from './console-types';

type R<T> = { ok: true; value: T } | { ok: false; error: string };

interface TraitTextView {
  name: string;
  text: string;
}

interface BoardRow {
  idx: number;
  defId: string;
  name: string;
  professionName: string;
  stars: number;
  salaryPerDay: number;
  checkPeriodHours: number;
  care: number;
  traits: TraitTextView[];
  tool: string | null;
}

interface ListRow {
  idx: number;
  name: string;
  professionName: string;
  stars: number;
  salaryPerDay: number;
  checkPeriodHours: number;
  objectName: string;
  mood: number;
  sick: boolean;
  sickUntil: number | null;
  bonusCooldownMs: number | null;
  traits: TraitTextView[];
  lastAction: { at: number; taskId: string; success: boolean } | null;
}

interface WorkersViewShape {
  list: ListRow[];
  objects: Array<{ id: string; name: string; worker: string | null }>;
  limit: { hired: number; objects: number };
  salaryPerDay: number;
  moodCap: number;
}

interface UpgradeRow {
  id: string;
  name: string;
  price: number;
  bought: boolean;
  description: string;
}

function fmtDays(ms: number): string {
  const totalH = Math.ceil(ms / 3_600_000);
  const d = Math.floor(totalH / 24);
  const h = totalH % 24;
  return `${d}д ${h}ч`;
}

function printBoard(ctx: CommandContext, dateISO: string, rows: BoardRow[]): void {
  ctx.printTitle(`Доска работников на ${dateISO} (5 профилей/день · workers hire <i>)`);
  for (const w of rows) {
    const traits = w.traits.length > 0 ? w.traits.map((t) => `${t.name} (${t.text})`).join(', ') : 'нет';
    const tool = w.tool !== null ? ` · инструмент: ${w.tool}` : '';
    ctx.print(
      `  [${w.idx}] ${w.name} · ${w.professionName} · ${'★'.repeat(w.stars)}${'☆'.repeat(5 - w.stars)} · ${w.salaryPerDay}з/день · проверки ${w.checkPeriodHours}ч · уход ${w.care}${tool}`,
    );
    ctx.print(`      трейты: ${traits}`);
  }
}

function printList(ctx: CommandContext, v: WorkersViewShape, now: number): void {
  ctx.printTitle(
    `Работники: ${v.limit.hired}/${v.limit.objects} (лимит = объектам) · зарплаты ${v.salaryPerDay}з/день`,
  );
  if (v.list.length === 0) {
    ctx.print('  никого не нанято — доска: workers board');
  }
  for (const w of v.list) {
    const sick = w.sick
      ? ` · БОЛЕН (ещё ${fmtDays(Math.max(0, (w.sickUntil ?? 0) - now))}, эффективность 50%)`
      : '';
    const bonus =
      w.bonusCooldownMs !== null ? ` · премия через ${fmtDays(w.bonusCooldownMs)}` : ' · премия доступна';
    const last =
      w.lastAction !== null
      ? ` · последняя работа: ${w.lastAction.taskId} (${w.lastAction.success ? 'успех' : 'отказ'})`
      : '';
    ctx.print(
      `  [${w.idx}] ${w.name} · ${w.professionName} · ${'★'.repeat(w.stars)}${'☆'.repeat(5 - w.stars)} · ${w.salaryPerDay}з/день · ${w.checkPeriodHours}ч · ${w.objectName} · настроение ${w.mood}/${v.moodCap}${sick}${bonus}${last}`,
    );
    if (w.traits.length > 0) {
      ctx.print(`      трейты: ${w.traits.map((t) => `${t.name} (${t.text})`).join(', ')}`);
    }
  }
  ctx.print(`  объекты (${v.objects.length}):`);
  for (const o of v.objects) {
    ctx.print(`    ${o.worker !== null ? `[x] ${o.worker}` : '[ ] свободно'} — ${o.name}`);
  }
}

export function registerWorkersCommands(registry: CommandRegistry): void {
  registry.register({
    name: 'workers',
    usage: 'workers <board|list|hire|fire|bonus|upgrades|upgrade|last> [аргументы]',
    description: 'работники: доска/нанятые/найм/увольнение/премия/улучшения ×5/последние действия (карточка M11 §6)',
    run(args, ctx) {
      const api = ctx.game.modules.get('workers')?.api;
      if (!api) return ctx.printErr('модуль работников не активен');
      const sub = args[0];
      if (sub === 'board') {
        const v = api['workers.board']() as { dateISO: string; rows: BoardRow[] };
        printBoard(ctx, v.dateISO, v.rows);
        return;
      }
      if (sub === 'list') {
        const v = api['workers.list']() as WorkersViewShape;
        printList(ctx, v, ctx.game.time.now());
        return;
      }
      if (sub === 'hire') {
        if (args[1] === undefined) return ctx.printErr('укажите индекс доски: workers hire <i> (workers board)');
        const r = api['workers.hire'](args[1]) as R<{
          name: string;
          professionName?: string;
          profession: string;
          object: string;
          salaryPerDay: number;
        }>;
        if (!r.ok) return ctx.printErr(r.error);
        ctx.printOk(
          `нанят: ${r.value.name} (${r.value.profession}) → объект ${r.value.object}; зарплата ${r.value.salaryPerDay}з/день (наём бесплатен — расходы с расчётного дня; событие worker.hired)`,
        );
        return;
      }
      if (sub === 'fire') {
        if (args[1] === undefined) return ctx.printErr('укажите номер: workers fire <idx> (workers list)');
        const r = api['workers.fire'](args[1]) as R<{ defId: string; name: string }>;
        if (!r.ok) return ctx.printErr(r.error);
        ctx.printOk(`уволен: ${r.value.name} (объект освобождён; событие worker.fired)`);
        return;
      }
      if (sub === 'bonus') {
        if (args[1] === undefined) return ctx.printErr('укажите номер: workers bonus <idx> (workers list)');
        const r = api['workers.bonus'](args[1]) as R<{ cost: number; mood: number }>;
        if (!r.ok) return ctx.printErr(r.error);
        // [FIX-M11 · FX2] знаменатель — из витрины moodCap (Домик → 105),
        // не литерал «/100» (унификация с витриной списка «N/кап»)
        const cap = (api['workers.list']() as WorkersViewShape).moodCap;
        ctx.printOk(
          `премия выдана: −${r.value.cost}з (×1.5 дневной ЗП, транзакция worker.bonus) · настроение ${r.value.mood}/${cap} (+10)`,
        );
        return;
      }
      if (sub === 'upgrades' || sub === 'upgrade') {
        if (sub === 'upgrades' || args[1] === undefined) {
          const rows = api['workers.upgrades']() as { rows: UpgradeRow[] };
          ctx.printTitle(`Улучшения работников (${rows.rows.filter((u) => u.bought).length}/5) · workers upgrade <id>`);
          for (const u of rows.rows) {
            ctx.print(`  ${u.bought ? '[x]' : '[ ]'} ${u.name} (${u.id}) · ${u.price}з — ${u.description}`);
          }
          return;
        }
        const r = api['workers.upgrades'](args[1]) as R<{ name: string; price: number }>;
        if (!r.ok) return ctx.printErr(r.error);
        ctx.printOk(`  куплено: «${r.value.name}» за ${r.value.price}з (транзакция worker.upgrade, без энергии)`);
        return;
      }
      if (sub === 'last') {
        const rows = api['workers.last']() as Array<{ defId: string; name: string; at: number; taskId: string; success: boolean }>;
        ctx.printTitle('Последние действия работников (workers.last)');
        if (rows.length === 0) ctx.print('  никого не нанято — доска: workers board');
        for (const w of rows) {
          ctx.print(
            w.at > 0
              ? `  ${w.name} · ${w.taskId} — ${w.success ? 'успех' : 'отказ'} · ${new Date(w.at).toLocaleTimeString('ru-RU')}`
              : `  ${w.name} · ещё не действовал`,
          );
        }
        return;
      }
      ctx.printErr('workers board | list | hire <i> | fire <idx> | bonus <idx> | upgrades | upgrade <id> | last');
    },
  });

  registry.register({
    name: 'mood',
    usage: 'mood set <idx> <0..100>',
    description: 'dev: установить настроение работника (форс серий увольжения — карточка §6)',
    run(args, ctx) {
      const api = ctx.game.modules.get('workers')?.api;
      if (!api) return ctx.printErr('модуль работников не активен');
      if (args[0] !== 'set' || args[1] === undefined || args[2] === undefined) {
        return ctx.printErr('укажите: mood set <idx> <0..100>');
      }
      const r = api['workers.dev']('mood', args[1], args[2]) as R<{ idx: number; mood: number }>;
      if (!r.ok) return ctx.printErr(r.error);
      // [FIX-M11 · FX2 · сопутствующая проводка] знаменатель — из витрины
      // moodCap (как в ответе bonus): валидация §2.2 принимает 101–105 при
      // Домике — литерал «/100» стал бы самопротиворечием «103/100»
      const cap = (api['workers.list']() as WorkersViewShape).moodCap;
      ctx.printOk(`настроение работника №${r.value.idx}: ${r.value.mood}/${cap}`);
    },
  });

  registry.register({
    name: 'payday',
    usage: 'payday force',
    description: 'dev: расчётный день немедленно (Σ зарплат worker.payday; нехватка — увольнение)',
    run(args, ctx) {
      const api = ctx.game.modules.get('workers')?.api;
      if (!api) return ctx.printErr('модуль работников не активен');
      if (args[0] !== 'force') return ctx.printErr('укажите: payday force');
      const r = api['workers.dev']('payday') as R<{ fired: number }>;
      if (!r.ok) return ctx.printErr(r.error);
      ctx.printOk(
        `расчётный день проведён (уволено по нехватке/настроению: ${r.value.fired}; лента — события worker.payday / worker.fired)`,
      );
    },
  });

  // [M11.2 · F17] dev: тик работника вне расписания — живые пробы actionDone
  registry.register({
    name: 'workertick',
    usage: 'workertick force <idx>',
    description: 'dev: тик работника немедленно (вне расписания; событие worker.actionDone)',
    run(args, ctx) {
      const api = ctx.game.modules.get('workers')?.api;
      if (!api) return ctx.printErr('модуль работников не активен');
      if (args[0] !== 'force' || args[1] === undefined) {
        return ctx.printErr('укажите: workertick force <idx> (workers list — витрина)');
      }
      const r = api['workers.dev']('tick', args[1]) as R<{ defId: string }>;
      if (!r.ok) return ctx.printErr(r.error);
      const last = api['workers.last']() as Array<{ defId: string; name: string; at: number; taskId: string; success: boolean }>;
      const w = last.find((x) => x.defId === r.value.defId);
      const before = w?.at ?? 0;
      const atNow = ctx.game.time.now();
      const acted = (w?.at ?? 0) > 0 && w!.at >= atNow - 2000; // запись свежая (этот вызов)
      ctx.printOk(
        acted
          ? `тик выполнен: ${w?.name} · ${w?.taskId} — ${w?.success ? 'успех' : 'отказ'} (worker.actionDone в ленте)`
          : `тик вызван, но МОЛЧАЛ (праздник / провал шанса / нет целей — действие не выполнялось, lastAction: ${w?.at ? `${w?.taskId} от ${new Date(w.at).toLocaleTimeString('ru-RU')}` : 'нет'})`,
      );
      void before;
    },
  });
}
