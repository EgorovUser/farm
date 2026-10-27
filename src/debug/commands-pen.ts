/**
 * Команды модуля M06 «Загон» — часть 1 (карточка §6; регистрация — console.ts;
 * часть 2 M06.2 — commands-pen2.ts). pen.state — витрина животных/склад/
 * overflow-отчёт/болезни/навоз/разведение (П6), pen.buy <species> [pen] —
 * покупка, pen.collect [species|all] [pen] — сбор, pen.animals — каталог с
 * замками, pen.feed/clean/pet <idx> [pen] — уход, pen.produce — dev-форс.
 */
import type { CommandRegistry } from './console-types';

type R<T> = { ok: true; value: T } | { ok: false; error: string };

interface AnimalRow {
  idx: number;
  pen: number;
  speciesId: string;
  name: string;
  quality: string;
  happiness: number;
  satiety: number;
  health: number;
  cleanliness: number;
  fedToday: boolean;
  pettedToday: boolean;
  hungryDays: number;
  dirtyDays: number;
  nextProduceAt: number | null;
  remainingMs: number | null;
  producing: boolean;
  sick: boolean;
  healRemainingMs: number | null;
  immuneRemainingMs: number | null;
}

interface PenView {
  now: number;
  slots: { used: number; base: number };
  animals: AnimalRow[];
  stock: Array<{ defId: string; qty: number; cap: number }>;
  overflow: Record<string, number>;
  reputationReady: boolean;
  pen2: { slots: { used: number; base: number }; animals: AnimalRow[]; stock: Array<{ defId: string; qty: number; cap: number }>; overflow: Record<string, number> } | null;
  manure: { manure: number; cap: number };
  breeding: { pen: number; speciesId: string; maxParentTier: string; remainingMs: number; waitingSlot: boolean } | null;
  upgrades: Record<string, number>;
}

function fmtRemaining(ms: number | null): string {
  if (ms === null) return '';
  const s = Math.ceil(ms / 1000);
  if (s <= 0) return ' · пора!';
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  return h > 0 ? ` · через ${h}ч ${m}м` : ` · через ${m}м ${s % 60}с`;
}

function fmtMs(ms: number): string {
  const s = Math.ceil(ms / 1000);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  return h > 0 ? `${h}ч ${m}м` : `${m}м`;
}

export function registerPenCommands(registry: CommandRegistry): void {
  registry.register({
    name: 'pen.state',
    usage: 'pen.state',
    description: 'загон: животные (уход/болезни/таймеры), склад, навоз, разведение (П6)',
    run(_args, ctx) {
      const api = ctx.game.modules.get('pen')?.api;
      if (!api) return ctx.printErr('модуль загона не активен');
      const v = api['pen.state']() as PenView;
      ctx.printTitle(
        `Загон · слоты ${v.slots.used}/${v.slots.base} · животных ${v.animals.length} · ${new Date(v.now).toLocaleDateString('ru-RU')}`,
      );
      if (v.animals.length === 0) {
        ctx.print('  загон пуст — животные в животноводстве не заведены (pen.animals — каталог)');
      }
      const printAnimal = (a: AnimalRow): void => {
        const fed = a.fedToday ? ' · кормлен' : '';
        const pet = a.pettedToday ? ' · гладлен' : '';
        const hungry = a.hungryDays > 0 ? ` · голодных дней ${a.hungryDays}` : '';
        const dirty = a.dirtyDays > 0 ? ` · грязных дней ${a.dirtyDays}` : '';
        const sick = a.sick
          ? ` · БОЛЕЕТ (здоровье ${a.health}, самолечение ${fmtMs(a.healRemainingMs ?? 0)} или pen.heal ${a.idx})`
          : '';
        const immune = !a.sick && a.immuneRemainingMs !== null && a.immuneRemainingMs > 0
          ? ` · иммуно ${fmtMs(a.immuneRemainingMs)}`
          : '';
        const prod = a.producing ? '' : ' · НЕ производит (голодна/больна)';
        ctx.print(
          `  [${a.idx}] ${a.name} (${a.speciesId}) · тир ${a.quality} · сч ${a.happiness}/100 · сыт ${a.satiety}/100 · здор ${a.health}/100 · чист ${a.cleanliness}/100${fmtRemaining(a.remainingMs)}${prod}${sick}${immune}${fed}${pet}${hungry}${dirty}`,
        );
      };
      for (const a of v.animals) printAnimal(a);
      if (v.pen2) {
        ctx.print(`Загон 2 · слоты ${v.pen2.slots.used}/${v.pen2.slots.base}:`);
        if (v.pen2.animals.length === 0) ctx.print('  пуст (pen.buy <species> 2)');
        for (const a of v.pen2.animals) printAnimal(a);
      }
      if (v.stock.length > 0) {
        ctx.print(`Склад (cap = 3 сбора × qty вида):`);
        for (const s of v.stock) ctx.print(`  ${s.defId}: ${s.qty}/${s.cap}`);
      } else {
        ctx.print('Склад: пуст');
      }
      if (v.pen2) {
        if (v.pen2.stock.length > 0) {
          ctx.print('Склад загона 2:');
          for (const s of v.pen2.stock) ctx.print(`  ${s.defId}: ${s.qty}/${s.cap}`);
        }
        const lost2 = Object.entries(v.pen2.overflow).filter(([, qty]) => qty > 0);
        if (lost2.length > 0) {
          ctx.printWarn(`Потеряно сверх склада 2: ${lost2.map(([d, q]) => `${d} ×${q}`).join(', ')}`);
        }
      }
      const lost = Object.entries(v.overflow).filter(([, qty]) => qty > 0);
      if (lost.length > 0) {
        ctx.printWarn(`Потеряно сверх склада (offlineReport): ${lost.map(([d, q]) => `${d} ×${q}`).join(', ')}`);
      }
      ctx.print(`Навоз: ${v.manure.manure}/${v.manure.cap} (кормления +1; «Симбиоз» → Удобрение; обмен: pen.manure take)`);
      if (v.breeding) {
        const wait = v.breeding.waitingSlot ? ' · ждёт свободного слота' : '';
        ctx.print(`Разведение: ${v.breeding.speciesId} (загон ${v.breeding.pen}, лучший тир ${v.breeding.maxParentTier}) → потомство ${fmtRemaining(v.breeding.remainingMs)}${wait}`);
      }
      const bought = Object.entries(v.upgrades);
      if (bought.length > 0) {
        ctx.print(`Улучшения: ${bought.map(([id, lvl]) => `${id}${lvl > 1 ? ` ур.${lvl}` : ''}`).join(', ')}`);
      }
      if (!v.reputationReady) ctx.print('Альпака: замок «уровень 20 + репутация деревни (скоро)» — M16');
      ctx.print('действия: pen.buy <species> [pen] · pen.feed/clean/pet/heal/sell <idx> [pen] · pen.collect [species|all] [pen] · pen.breed <i1> <i2> · pen.upgrade <id> · каталог: pen.animals/pen.upgrades');
      ctx.refresh();
    },
  });

  registry.register({
    name: 'pen.animals',
    usage: 'pen.animals',
    description: 'каталог животных: цены, продукция, замки гейтов (П6)',
    run(_args, ctx) {
      const api = ctx.game.modules.get('pen')?.api;
      if (!api) return ctx.printErr('модуль загона не активен');
      const v = api['pen.animals']() as {
        rows: Array<{
          id: string;
          name: string;
          price: number;
          produce: { defId: string; periodHours: number; qty: number };
          gateText: string | null;
          owned: number;
        }>;
      };
      ctx.printTitle(`Животные загона · ${v.rows.length} видов`);
      for (const r of v.rows) {
        const gate = r.gateText ? ` · 🔒 Откроется: ${r.gateText}` : '';
        const owned = r.owned > 0 ? ` · в загонах ×${r.owned}` : '';
        ctx.print(
          `  ${r.name} (${r.id}) · ${r.price}з · ${r.produce.defId} ×${r.produce.qty} каждые ${r.produce.periodHours}ч${gate}${owned}`,
        );
      }
      ctx.refresh();
    },
  });

  registry.register({
    name: 'pen.buy',
    usage: 'pen.buy <species> [pen]',
    description: 'купить животное (золото; качество роллится: D45 C35 B15 A5)',
    run(args, ctx) {
      const api = ctx.game.modules.get('pen')?.api;
      if (!api) return ctx.printErr('модуль загона не активен');
      const species = args[0];
      if (!species) return ctx.printErr('укажите вид: pen.buy chicken (каталог — pen.animals)');
      const r = api['pen.buy'](species, args[1]) as R<{ name: string; quality: { tier: string; value: number }; nextProduceAt: number; slotsUsed: number; slotsBase: number; pen: number }>;
      if (!r.ok) return ctx.printErr(r.error);
      const t = new Date(r.value.nextProduceAt);
      ctx.printOk(
        `${r.value.name} куплен(ы) в загон ${r.value.pen}: качество ${r.value.quality.tier} (${r.value.quality.value}/100) · первая продукция ${t.toLocaleTimeString('ru-RU')} · слоты ${r.value.slotsUsed}/${r.value.slotsBase}`,
      );
      ctx.refresh();
    },
  });

  registry.register({
    name: 'pen.feed',
    usage: 'pen.feed <idx> [pen]',
    description: 'кормить животное (1 Корм, 1 энергия, 1/день; satiety → 100; +1 навоз)',
    run(args, ctx) {
      const api = ctx.game.modules.get('pen')?.api;
      if (!api) return ctx.printErr('модуль загона не активен');
      const idx = args[0];
      if (idx === undefined) return ctx.printErr('укажите номер животного: pen.feed 0 (витрина — pen.state)');
      const r = api['pen.feed'](idx, args[1]) as R<{ idx: number; satiety: number }>;
      if (!r.ok) return ctx.printErr(r.error);
      ctx.printOk(`животное №${r.value.idx} накормлено: сытость ${r.value.satiety}/100`);
      ctx.refresh();
    },
  });

  registry.register({
    name: 'pen.clean',
    usage: 'pen.clean <idx> [pen]',
    description: 'почистить животное (2 энергии; cleanliness → 100)',
    run(args, ctx) {
      const api = ctx.game.modules.get('pen')?.api;
      if (!api) return ctx.printErr('модуль загона не активен');
      const idx = args[0];
      if (idx === undefined) return ctx.printErr('укажите номер животного: pen.clean 0 (витрина — pen.state)');
      const r = api['pen.clean'](idx, args[1]) as R<{ idx: number; cleanliness: number }>;
      if (!r.ok) return ctx.printErr(r.error);
      ctx.printOk(`животное №${r.value.idx} чисто: чистота ${r.value.cleanliness}/100`);
      ctx.refresh();
    },
  });

  registry.register({
    name: 'pen.pet',
    usage: 'pen.pet <idx> [pen]',
    description: 'гладить животное (+5 счастья, 0 энергии, 1/день)',
    run(args, ctx) {
      const api = ctx.game.modules.get('pen')?.api;
      if (!api) return ctx.printErr('модуль загона не активен');
      const idx = args[0];
      if (idx === undefined) return ctx.printErr('укажите номер животного: pen.pet 0 (витрина — pen.state)');
      const r = api['pen.pet'](idx, args[1]) as R<{ idx: number; happiness: number }>;
      if (!r.ok) return ctx.printErr(r.error);
      ctx.printOk(`животное №${r.value.idx} довольно: счастье ${r.value.happiness}/100`);
      ctx.refresh();
    },
  });

  registry.register({
    name: 'pen.collect',
    usage: 'pen.collect [species|all] [pen]',
    description: 'собрать продукцию склада загона в инвентарь (2 энергии; качество роллится)',
    run(args, ctx) {
      const api = ctx.game.modules.get('pen')?.api;
      if (!api) return ctx.printErr('модуль загона не активен');
      const r = api['pen.collect'](args[0], args[1]) as R<{ lines: Array<{ defId: string; qty: number; quality: { tier: string; value: number } }> }>;
      if (!r.ok) return ctx.printErr(r.error);
      for (const line of r.value.lines) {
        ctx.printOk(`${line.defId} ×${line.qty} → инвентарь (качество ${line.quality.tier} ${line.quality.value}/100, источник «загон»)`);
      }
      ctx.refresh();
    },
  });

  registry.register({
    name: 'pen.produce',
    usage: 'pen.produce [species|all]',
    description: 'dev: форс продукции (nextProduceAt = now; needs честны)',
    run(args, ctx) {
      const api = ctx.game.modules.get('pen')?.api;
      if (!api) return ctx.printErr('модуль загона не активен');
      const r = api['pen.produce'](args[0]) as { forced: string };
      ctx.printOk(`dev-форс продукции: ${r.forced} (ближайший проход доставит на склад — pen.state)`);
      ctx.refresh();
    },
  });
}
