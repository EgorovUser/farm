/**
 * Команды модуля M03 «Модфордж» (бриф §9; регистрация — console.ts).
 * M03.1: mods list (реестр + бюджеты, П6: шансы/числа — на стол) и
 * mods cost (формулы §3 живьём). M03.2: mods roll — демо-ролл бюджета
 * редкости движком §5 (без тега — все кандидаты). Реролл — сеанс M03.3.
 *
 * НЕ путать с `mod` (единственное число) — команды StatBus-бафов ядра.
 * [C2 · M04.2] база реролла — по редкости предмета (вывод mods list).
 */
import type { CommandRegistry } from './console-types';
import type { ModTypeDef } from '@/content/mods/registry';
import type { ModForgeTable } from '@/content/balance/modforge';
import { costOf, negativeRefund } from '@/game/modules/modforge/cost';

const RARITY_ORDER = ['common', 'uncommon', 'rare', 'epic', 'legendary', 'mythic'] as const;

interface RollReceipt {
  rolls: Array<{ type: string; value: number; from: string }>;
  detail: {
    budget: number;
    refund: number;
    spent: number;
    costs: Array<{ type: string; value: number; cost: number }>;
    positiveCount: number;
    negativeCount: number;
    candidates: number;
  };
}

export function registerModForgeCommands(registry: CommandRegistry): void {
  registry.register({
    name: 'mods list',
    usage: 'mods list',
    description: 'реестр ривен-характеристик + бюджеты/шансы по редкости (M03)',
    run(_args, ctx) {
      const mods = ctx.game.content.get<ModTypeDef[]>('mods');
      const table = ctx.game.content.get<ModForgeTable>('modforge');
      ctx.printTitle(`Реестр ривен-характеристик (${mods.length})`);
      for (const m of mods) {
        const range = `+${m.maxPositive} / ${m.maxNegative}`;
        ctx.print(
          `  ${m.id.padEnd(13)} ${m.stat.padEnd(20)} ${range.padEnd(13)} вес ${String(m.costWeight).padEnd(5)} ${(m.curve ?? 'linear').padEnd(7)} [${m.scopeTags.join(',')}]`,
        );
      }
      ctx.print('Бюджеты по редкости (§4):');
      for (const r of RARITY_ORDER) {
        const row = table.byRarity[r];
        ctx.print(
          `  ${r.padEnd(10)} бюджет ${String(row.budget).padEnd(4)} бафов ${row.positives[0]}..${row.positives[1]} · шанс дебафа ${(row.negChance * 100).toFixed(0)}%`,
        );
      }
      // [M04.1 · C5] строки трейтов §4 — на стол (подтверждение C5 фрагментом mods list)
      const w = table.traitBudgets.worker;
      const h = table.traitBudgets.helper;
      ctx.print('Бюджеты трейтов (§4, потребители M11/M13):');
      ctx.print(
        `  работник   бюджет ${w.budget.kind === 'perStar' ? `${w.budget.perStar} × звёзды` : '?'} · бафов ${w.positives[0]}..${w.positives[1]} · шанс дебафа ${(w.negChance * 100).toFixed(0)}%`,
      );
      ctx.print(
        `  помощник   бюджет по редкости (byRarity) · бафов ${h.positives[0]}..${h.positives[1]} · шанс дебафа ${(h.negChance * 100).toFixed(0)}%`,
      );
      const rr = table.reroll;
      const bases = RARITY_ORDER.map((r) => `${r} ${rr.baseCostByRarity[r]}`).join(' · ');
      ctx.print(
        `рефанд дебафа ×${table.negativeRefund} · карточка заточки: ${table.forgeBudgetPerLevel} × уровень (M10) · реролл [C2 · M04.2]: база по редкости — ${bases} золота · ×${rr.growth}/попытка · кап ×${rr.capMult} базы`,
      );
    },
  });

  registry.register({
    name: 'mods roll',
    usage: 'mods roll <rarity> [scopeTag] — без тега роллятся все типы',
    description: 'демо-ролл бюджета редкости движком §5 (событие modforge.rolled в ленте)',
    run(args, ctx) {
      const [rarityRaw, tag] = args;
      if (!rarityRaw) {
        return ctx.printErr(`формат: mods roll rare weapon · редкости: ${RARITY_ORDER.join(', ')}`);
      }
      if (!RARITY_ORDER.includes(rarityRaw as (typeof RARITY_ORDER)[number])) {
        return ctx.printErr(`неизвестная редкость: ${rarityRaw} (${RARITY_ORDER.join(', ')})`);
      }
      const mf = ctx.game.modules.get('modforge')?.api;
      if (!mf) return ctx.printErr('модуль модфорджа не активен');
      const table = ctx.game.content.get<ModForgeTable>('modforge');
      const row = table.byRarity[rarityRaw as (typeof RARITY_ORDER)[number]];
      const scopeTags = tag ? [tag] : [];
      const r = mf['modforge.rollFor']({
        budget: row.budget,
        scopeTags,
        rarity: rarityRaw,
      }) as { ok: true; value: RollReceipt } | { ok: false; error: string };
      if (!r.ok) return ctx.printErr(r.error);
      const d = r.value.detail;
      ctx.printTitle(
        `Ролл ${rarityRaw} · бюджет ${d.budget} · бафов ${row.positives[0]}..${row.positives[1]} · шанс дебафа ${(row.negChance * 100).toFixed(0)}% · кандидатов ${d.candidates}${tag ? ` · scope [${tag}]` : ' · scope [все]'}`,
      );
      if (r.value.rolls.length === 0) {
        return ctx.printWarn('ролл пуст: нет кандидатов для скоупа (mods list — теги применимости)');
      }
      for (const c of d.costs) {
        const sign = c.value > 0 ? '+' : '';
        const negMark = c.value < 0 ? ' (дебаф · рефанд)' : '';
        ctx.print(`  • ${c.type.padEnd(13)} ${sign}${c.value}${negMark} — стоимость ${c.cost}`);
      }
      ctx.print(
        `потрачено ${d.spent} / ${d.budget}${d.refund > 0 ? ` (рефанд дебафа +${d.refund})` : ''} ✓ — инвариант §3 держится`,
      );
    },
  });

  registry.register({
    name: 'mods reroll',
    usage: 'mods reroll <iid> · mods reroll view [iid] · mods reroll choose <iid> <new|keep>',
    description: 'реролл-цикл §6: платный вариант рядом со старым + выбор игрока (сброс инфляции)',
    run(args, ctx) {
      const [sub, a, b] = args;
      const mf = ctx.game.modules.get('modforge')?.api;
      if (!mf) return ctx.printErr('модуль модфорджа не активен');

      // --- mods reroll view [iid]: состояние циклов (попытки/цена/pending)
      if (sub === 'view') {
        const view = mf['modforge.rerollView'](a) as
          | Array<{ iid: string; attempts: number; nextCost: number; pending: unknown[] | null }>
          | { iid: string; attempts: number; nextCost: number; pending: unknown[] | null }
          | null;
        const list = Array.isArray(view) ? view : view ? [view] : [];
        if (a && list.length === 0) return ctx.printErr(`у предмета "${a}" нет реролл-цикла (виден только после первого реролла)`);
        if (list.length === 0) return ctx.print('активных реролл-циклов нет — mods reroll <iid> из inv list');
        ctx.printTitle(`Реролл-циклы (${list.length})`);
        for (const v of list) {
          const pending = v.pending && v.pending.length > 0 ? ' · есть ожидающий вариант' : '';
          ctx.print(`  ${v.iid} — попыток ${v.attempts} · следующая цена ${v.nextCost}${pending}`);
        }
        return;
      }

      // --- mods reroll choose <iid> <new|keep>
      if (sub === 'choose') {
        if (!a || (b !== 'new' && b !== 'keep')) {
          return ctx.printErr('формат: mods reroll choose <iid> new|keep');
        }
        const r = mf['modforge.choose'](a, b) as { ok: true; value: { applied: boolean } } | { ok: false; error: string };
        if (!r.ok) return ctx.printErr(r.error);
        ctx.printOk(
          r.value.applied
            ? 'вариант применён: стартовые роллы заменены, карточки заточки (forge) сохранены · инфляция сброшена'
            : 'остались на старых роллах · инфляция сброшена',
        );
        ctx.refresh();
        return;
      }

      // --- mods reroll <iid>: платный ролл варианта
      if (!sub) {
        return ctx.printErr('формат: mods reroll <iid> (iid — из inv list) · view/choose — подкоманды');
      }
      const r = mf['modforge.reroll'](sub) as
        | { ok: true; value: { defId: string; cost: number; attempts: number; nextCost: number; variant: Array<{ type: string; value: number }> } }
        | { ok: false; error: string };
      if (!r.ok) return ctx.printErr(r.error);
      const v = r.value;
      ctx.printTitle(`Реролл ${v.defId} · попытка ${v.attempts} · уплачено ${v.cost} золота`);
      if (v.variant.length === 0) {
        ctx.printWarn('вариант пуст (нет кандидатов скоупа) — деньги списаны, choose keep вернёт старые роллы');
      }
      for (const m of v.variant) {
        const sign = m.value > 0 ? '+' : '';
        ctx.print(`  • ${m.type.padEnd(13)} ${sign}${m.value}`);
      }
      ctx.print(`следующая цена (если продолжить): ${v.nextCost} · выбор: mods reroll choose ${sub} new|keep`);
      ctx.refresh();
    },
  });

  registry.register({
    name: 'mods cost',
    usage: 'mods cost <type> <value>',
    description: 'стоимость значения по формулам §3 (дебаф — со знаком минус)',
    run(args, ctx) {
      const [typeRaw, valueRaw] = args;
      if (!typeRaw || !valueRaw) {
        return ctx.printErr('формат: mods cost atk_power 15 (дебаф: mods cost atk_power -5)');
      }
      const mods = ctx.game.content.get<ModTypeDef[]>('mods');
      const mod = mods.find((m) => m.id === typeRaw);
      if (!mod) {
        return ctx.printErr(`неизвестный тип: ${typeRaw} (реестр: ${mods.map((m) => m.id).join(', ')})`);
      }
      const value = Number(valueRaw);
      if (!Number.isFinite(value)) return ctx.printErr('значение должно быть числом');
      const table = ctx.game.content.get<ModForgeTable>('modforge');
      const curve = { positiveExponent: table.positiveExponent, negativeExponent: table.negativeExponent };
      const cost = costOf(curve, mod, value);
      const sign = value < 0 ? '' : '+';
      const bounds = `[${mod.maxNegative}..${mod.maxPositive}]`;
      if (value < 0 && mod.maxNegative < 0) {
        const refund = negativeRefund(table.negativeRefund, cost);
        ctx.printOk(
          `${mod.id} ${sign}${value}: стоимость ${cost} (вес ${mod.costWeight}, кривая ${mod.curve ?? 'linear'}, границы ${bounds}) · рефанд ×${table.negativeRefund} = +${refund} к бюджету`,
        );
      } else {
        ctx.printOk(
          `${mod.id} ${sign}${value}: стоимость ${cost} (вес ${mod.costWeight}, кривая ${mod.curve ?? 'linear'}, границы ${bounds})`,
        );
      }
    },
  });
}
