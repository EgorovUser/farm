/**
 * Команды модуля M07 «Рыбалка» (карточка §6 + бриф §3.6): fish.state —
 * витрина (локация/снасть/статы/альбом/резолвы), fish.tables — таблицы
 * дропа с итоговыми шансами (П6), fish.cast [pond] — заброс, fish.buy <id> —
 * покупка удочки/наживки, fish.force <fishId> — dev-форс результата.
 */
import type { CommandRegistry, CommandContext } from './console-types';

type R<T> = { ok: true; value: T } | { ok: false; error: string };

interface StateView {
  now: number;
  location: string;
  rod: { defId: string; name: string; tier: number; durability: string; broken: boolean } | null;
  bait: { defId: string; name: string; stack: number; mods: Array<{ label: string; stat: string; value: number }> } | null;
  stats: { casts: number; caught: number };
  album: Array<{ defId: string; name: string; rarity: string; count: number }>;
  albumSpecies: number;
  albumTotal: number;
  shop: {
    rods: Array<{ defId: string; name: string; tier: number; price: number; owned: number }>;
    baits: Array<{ defId: string; name: string; price: number; owned: number; mods: string[] }>;
  };
  resolve: {
    luckRare: number;
    luckEvent: number;
    treasureWeight: number;
    biteSpeed: number;
    zonePercent: number;
    rarityWeights: Array<{ rarity: string; weight: number; chancePercent: number }>;
  };
}

interface TablesView {
  location: string;
  categories: Array<{ id: string; name: string; weight: number; lucky: boolean; chancePercent: number }>;
  fish: Array<{ id: string; name: string; category: string; rarity: string; weight: number; biteSeconds: string; sizeGrams: string; gated: boolean }>;
  rarities: Array<{ rarity: string; weight: number; chancePercent: number; lucky: boolean }>;
  trash: Array<{ id: string; name: string; weight: number }>;
  chest: Array<{ id: string; kind: string; defId: string; weight: number; qty: string; lucky: boolean }>;
  events: Array<{ id: string; name: string; text: string; weight: number }>;
}

interface CastReceiptView {
  location: string;
  category: string;
  defId: string | null;
  name: string;
  rarity: string | null;
  quality: { tier: string; value: number } | null;
  weightGrams: number | null;
  qty: number | null;
  bite: { rolledSeconds: number; waitSeconds: number };
  rod: { defId: string; name: string; current: number; max: number; broken: boolean };
  bait: { defId: string; name: string; reequipped: boolean };
  grant: { id: string; qty: number } | null;
  eventText: string | null;
  choice: { eventId: string; eventName: string; optionId: string; label: string; outcome: string; granted: string | null } | null;
  treasure: { choice: string; reward: { kind: string; defId: string; qty: number } | null } | null;
}

const pct = (v: number): string => `${v.toFixed(1)}%`;

function printCast(ctx: CommandContext, r: CastReceiptView): void {
  const catNames: Record<string, string> = {
    trash: 'мусор',
    small: 'мелкая рыба',
    medium: 'средняя рыба',
    rare: 'редкая рыба',
    treasure: 'сокровище',
    event: 'событие',
  };
  ctx.printTitle(`Заброс (${r.location}) · ${catNames[r.category] ?? r.category}`);
  const parts: string[] = [`${r.name} (${r.defId ?? '—'})`];
  if (r.rarity) parts.push(`редкость ${r.rarity}`);
  if (r.quality) parts.push(`качество ${r.quality.tier} ${Math.round(r.quality.value)}`);
  if (r.weightGrams !== null) parts.push(`вес ${r.weightGrams} г`);
  if (r.qty !== null && (r.category === 'treasure' || r.qty > 1)) parts.push(`×${r.qty}`);
  ctx.printOk(`  улов: ${parts.join(' · ')}`);
  ctx.print(
    `  клёв: ролл ${r.bite.rolledSeconds.toFixed(1)} с → ожидание ${r.bite.waitSeconds.toFixed(1)} с · удочка ${r.rod.name}: прочность ${r.rod.current}/${r.rod.max}${r.rod.broken ? ' · СЛОМАНА (ремонт — наковальня M09)' : ''} · наживка ${r.bait.name}: ${r.bait.reequipped ? 'в слоте' : 'КОНЧИЛАСЬ (слот пуст)'}`,
  );
  if (r.grant !== null) ctx.printOk(`  сокровище: ${r.grant.id} +${r.grant.qty}`);
  if (r.eventText !== null) ctx.print(`  событие: ${r.eventText}`);
  if (r.choice !== null) {
    ctx.printOk(`  выбор: «${r.choice.label}» → ${r.choice.outcome}${r.choice.granted !== null ? ` (${r.choice.granted})` : ''}`);
  }
  if (r.treasure !== null) {
    if (r.treasure.choice === 'stash') {
      ctx.printOk('  «Клад»: карта спрятана — предмет в инвентаре (трофей/продажа)');
    } else {
      const rw = r.treasure.reward;
      ctx.printOk(`  «Клад»: карта вскрыта → ${rw ? `${rw.defId} ×${rw.qty} (${rw.kind}, журнал fish:treasure:*)` : 'награды нет (инвентарь полон?)'}`);
    }
  }
  ctx.print('  события: cast.completed опубликован' + (r.rarity ? ' · fish.caught опубликован (XP +8, альбом тикает)' : ''));
}

export function registerFishingCommands(registry: CommandRegistry): void {
  registry.register({
    name: 'fish.state',
    usage: 'fish.state',
    description: 'рыбалка: локация, снасть в слотах, статы, альбом, удочки/наживки (П6)',
    run(_args, ctx) {
      const api = ctx.game.modules.get('fishing')?.api;
      if (!api) return ctx.printErr('модуль рыбалки не активен');
      const v = api['fish.state']() as StateView;
      ctx.printTitle(`Рыбалка · локация: ${v.location === 'pond' ? 'пруд' : v.location} · забросов ${v.stats.casts} · поймано ${v.stats.caught}`);
      if (!v.rod) {
        ctx.printWarn('  удочка НЕ надета — fish.buy bamboo_rod → inv equip <iid> rod');
      } else {
        const tier = v.rod.tier > 0 ? ` · тир лестницы ${v.rod.tier}/6` : ' · вне лестницы (без рыболовных статов)';
        ctx.print(`  удочка: ${v.rod.name} (${v.rod.defId}) · прочность ${v.rod.durability}${tier}${v.rod.broken ? ' · СЛОМАНА' : ''}`);
      }
      if (!v.bait) {
        ctx.printWarn('  наживка НЕ надета — fish.buy worm_bait → inv equip <iid> bait');
      } else {
        ctx.print(`  наживка: ${v.bait.name} ×${v.bait.stack} (${v.bait.defId}) — селектор и расходник заброса`);
        for (const m of v.bait.mods) ctx.print(`    мод: ${m.label} (${m.stat} ${m.value > 0 ? '+' : ''}${m.value})`);
      }
      ctx.print(
        `  удачи: rare ${v.resolve.luckRare} · event ${v.resolve.luckEvent} · сокровищная тяга ${v.resolve.treasureWeight} · клёв ${v.resolve.biteSpeed} · зона подсечки ${v.resolve.zonePercent}%`,
      );
      ctx.print(
        `  веса редкости: ${v.resolve.rarityWeights.map((w) => `${w.rarity} ${w.weight.toFixed(1)} (${pct(w.chancePercent)})`).join(' · ')}`,
      );
      if (v.album.length === 0) {
        ctx.print('  альбом пуст — виды открываются первым уловом (fish.cast)');
      } else {
        ctx.print(`  альбом: видов ${v.albumSpecies} · рыб всего ${v.albumTotal}`);
        for (const a of v.album) ctx.print(`    ${a.name} (${a.defId}) · ${a.rarity} · ×${a.count}`);
      }
      ctx.print('  магазин рыболова (fish.buy):');
      for (const r of v.shop.rods) {
        ctx.print(`    [rod] ${r.name} (${r.defId}) · тир ${r.tier}/6 · ${r.price} з · у игрока ${r.owned}`);
      }
      for (const b of v.shop.baits) {
        ctx.print(`    [bait] ${b.name} (${b.defId}) · ${b.price} з · у игрока ${b.owned}${b.mods.length > 0 ? ` · ${b.mods.join(', ')}` : ''}`);
      }
    },
  });

  registry.register({
    name: 'fish.tables',
    usage: 'fish.tables',
    description: 'таблицы дропа рыбалки: категории/рыбы/редкости/мусор/сундук/события + итоговые шансы (П6)',
    run(_args, ctx) {
      const api = ctx.game.modules.get('fishing')?.api;
      if (!api) return ctx.printErr('модуль рыбалки не активен');
      const v = api['fish.tables']() as TablesView;
      ctx.printTitle(`Таблицы дропа · ${v.location === 'pond' ? 'пруд' : v.location} (шансы — под текущей снастью)`);
      ctx.print('  категории первого ролла (lucky — тянут удачу, 02 §6):');
      for (const c of v.categories) {
        ctx.print(`    ${c.name} (${c.id}) · вес ${c.weight}${c.lucky ? ' · lucky' : ''} · ${pct(c.chancePercent)}`);
      }
      ctx.print('  рыбы (вес — внутри категории; гейт-условия — M07.2):');
      for (const f of v.fish) {
        ctx.print(`    ${f.name} (${f.id}) · ${f.category} · вид ${f.rarity} · вес ${f.weight} · клёв ${f.biteSeconds} · ${f.sizeGrams}${f.gated ? ' · есть условия' : ''}`);
      }
      ctx.print('  редкости улова (базы fishing.weight.*, lucky rare+):');
      for (const r of v.rarities) {
        ctx.print(`    ${r.rarity} · вес ${r.weight.toFixed(1)}${r.lucky ? ' · lucky' : ''} · ${pct(r.chancePercent)}`);
      }
      ctx.print('  мусор:');
      for (const t of v.trash) ctx.print(`    ${t.name} (${t.id}) · вес ${t.weight}`);
      ctx.print('  сундук (сокровище; карты сокровищ — M07.2):');
      for (const c of v.chest) {
        ctx.print(`    ${c.defId} · ${c.kind} ×${c.qty} · вес ${c.weight}${c.lucky ? ' · lucky' : ''}`);
      }
      ctx.print('  события-мини (выбор — M07.2, до фазы 6 auto):');
      for (const e of v.events) ctx.print(`    ${e.name} (${e.id}) · вес ${e.weight} · «${e.text}»`);
    },
  });

  registry.register({
    name: 'fish.cast',
    usage: 'fish.cast [pond]',
    description: 'заброс: энергия 4 + наживка ×1 + прочность удочки −1 (клёв/авто-подсечка до фазы 6)',
    run(args, ctx) {
      const api = ctx.game.modules.get('fishing')?.api;
      if (!api) return ctx.printErr('модуль рыбалки не активен');
      const r = api['fish.cast'](args[0]) as R<CastReceiptView>;
      if (!r.ok) return ctx.printErr(r.error);
      printCast(ctx, r.value);
    },
  });

  registry.register({
    name: 'fish.buy',
    usage: 'fish.buy <id> [qty]',
    description: 'покупка удочки/наживки у рыболова (наживки — стаком; удочке — ривен-роллы fish:rod:*)',
    run(args, ctx) {
      const api = ctx.game.modules.get('fishing')?.api;
      if (!api) return ctx.printErr('модуль рыбалки не активен');
      if (!args[0]) return ctx.printErr('укажите id: удочки bamboo_rod…flow_rod / наживки worm_bait…legendary_bait (fish.state — каталог)');
      const qty = args[1] !== undefined ? Number(args[1]) : 1;
      const r = api['fish.buy'](args[0], qty) as R<{
        kind: string;
        defId: string;
        name: string;
        price: number;
        qty: number;
        iid: string;
        rolls: Array<{ type: string; value: number }>;
      }>;
      if (!r.ok) return ctx.printErr(r.error);
      const v = r.value;
      ctx.printOk(`куплено: ${v.name} (${v.defId})${v.qty > 1 ? ` ×${v.qty}` : ''} за ${v.price * v.qty} з · запись ${v.iid} · инвентарь: fish.buy → inv equip ${v.iid} ${v.kind === 'rod' ? 'rod' : 'bait'}`);
      if (v.rolls.length > 0) {
        ctx.print(`  ривен-роллы (журнал fish:rod:${v.defId}): ${v.rolls.map((m) => `${m.type} ${m.value > 0 ? '+' : ''}${m.value}`).join(' · ')}`);
      }
    },
  });

  registry.register({
    name: 'fish.force',
    usage: 'fish.force <fishId | chest:<id> | event:<id>>',
    description: 'dev: заброс с принудительным результатом (рыба/сундук-запись/событие; косты честны; гейты игнорируются)',
    run(args, ctx) {
      const api = ctx.game.modules.get('fishing')?.api;
      if (!api) return ctx.printErr('модуль рыбалки не активен');
      if (!args[0]) return ctx.printErr('укажите: crucian…sturgeon / golden_carp… / chest:treasure_map / event:evt_mermaid,evt_bottle');
      const r = api['fish.force'](args[0]) as R<CastReceiptView>;
      if (!r.ok) return ctx.printErr(r.error);
      printCast(ctx, r.value);
    },
  });

  registry.register({
    name: 'fish.location',
    usage: 'fish.location [pond|river]',
    description: 'локация ловли: витрина / переход (река — навык Рыболовство 10, канон M01 §5)',
    run(args, ctx) {
      const api = ctx.game.modules.get('fishing')?.api;
      if (!api) return ctx.printErr('модуль рыбалки не активен');
      if (!args[0]) {
        const v = api['fish.location']() as { location: string };
        return ctx.print(`локация ловли: ${v.location === 'pond' ? 'пруд' : v.location} (переход: fish.location pond|river)`);
      }
      const r = api['fish.location'](args[0]) as R<{ location: string }>;
      if (!r.ok) return ctx.printErr(r.error);
      ctx.printOk(`локация ловли: ${r.value.location === 'pond' ? 'пруд' : r.value.location} (гейт навыка пройден; срез обновлён)`);
    },
  });

  registry.register({
    name: 'fish.choice',
    usage: 'fish.choice <open|stash|release|sell|read|discard>',
    description: 'dev: одноразовая подмена выбора события-мини/«Клада» (до фазы 6 авто-резолв дефолта)',
    run(args, ctx) {
      const api = ctx.game.modules.get('fishing')?.api;
      if (!api) return ctx.printErr('модуль рыбалки не активен');
      if (!args[0]) return ctx.printErr('укажите опцию: open|stash (Клад) / release|sell (Русалка) / read|discard (Бутылка)');
      const r = api['fish.choice'](args[0]) as { set: string | null };
      ctx.printOk(`dev-выбор следующего события: «${r.set}» (сбросится после применения)`);
    },
  });

  registry.register({
    name: 'fish.album',
    usage: 'fish.album',
    description: 'альбом-коллекция: все виды по локациям, поймано, гейт-причины заблокированных (П6)',
    run(_args, ctx) {
      const api = ctx.game.modules.get('fishing')?.api;
      if (!api) return ctx.printErr('модуль рыбалки не активен');
      const v = api['fish.album']() as {
        totals: { pond: { caught: number; total: number }; river: { caught: number; total: number } };
        river: { skillLevel: number; unlocked: boolean };
        species: Array<{ defId: string; name: string; location: string; rarity: string; caught: number; unlocked: boolean; gateText: string | null }>;
      };
      ctx.printTitle(
        `Альбом рыболова · пруд ${v.totals.pond.caught}/${v.totals.pond.total} · река ${v.totals.river.caught}/${v.totals.river.total} (гейты показываем)`,
      );
      ctx.print(
        `  река: ${v.river.unlocked ? 'ОТКРЫТА' : `закрыта — нужен навык Рыболовство ${v.river.skillLevel} (растёт с уловом)`}`,
      );
      for (const s of v.species) {
        const status = s.unlocked ? `×${s.caught}` : 'не поймана';
        const gate = !s.unlocked && s.gateText ? ` · 🔒 ${s.gateText}` : '';
        ctx.print(`    [${s.location}] ${s.name} (${s.defId}) · ${s.rarity} · ${status}${gate}`);
      }
    },
  });
}
