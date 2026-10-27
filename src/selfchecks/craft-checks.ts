/**
 * Self-checks M09 «Крафт», часть 1 (приёмка §7): контент и валидации,
 * формула качества §4 (сетка входов/навыка/мини-игры), станции §2 (покупка,
 * гейты, длины очередей через шину), кап наковальни «как cap-модификатор»
 * (интеграционный тест с M10 БЕЗ импортов — только шина) и ремонт.
 * Очередь/сбор/экономика — craft-queue-checks.ts (расщепление 01 §6).
 */
import { check, group, type CheckGroup, type CheckResult } from './types';
import { CRAFT_TABLE } from '@/content/balance/craft';
import { RECIPES } from '@/content/craft/recipes';
import { STATIONS } from '@/content/craft/stations';
import { CRAFT_ITEMS } from '@/content/items/catalog-craft';
import { resolveRecipeIO } from '@/game/modules/craft/inputs';
import {
  outputQuality,
  qualityFromValue,
  skillTierOf,
  tierValue,
} from '@/game/modules/craft/quality';
import type { CurrencyInfo } from '@/content/player/currencies';
import type { ItemDef } from '@/content/items/items';
import {
  addXp,
  advance,
  giveItem,
  grantCurrency,
  makeCraftGame,
  make,
  makeSeededCraftGame,
  backpack,
  countItem,
  type R,
} from './craft-fixture';

export async function runCraftChecks(): Promise<CheckGroup> {
  const results: CheckResult[] = [];

  // ---------------------------------------------------------- контент §2/§3
  results.push(
    // [FIX-PHASE-2 · 4.2] [DECISION] оракул обновлён ПОИМЁННО: 30 → 33 —
    // наковальня куёт топоры и удочку по букве карточки M09 §2
    // (av_axe/av_steel_axe/av_rod — «инструменты: кирки, топоры, удочки»)
    check('контент: 33 рецепта (30 + топоры/удочка наковальни), 7 станций, у стартовой очереди база 2', () =>
      RECIPES.length === 33 && STATIONS.length === 7 &&
      STATIONS.filter((s) => s.costGold === 0).length === 1 &&
      STATIONS.find((s) => s.costGold === 0)?.id === 'workbench'),
  );
  results.push(
    check('контент: все входы/выходы разрешимы (предмет ИЛИ валюта кошелька)', () => {
      const game = makeCraftGame();
      const currencies = game.game.content.get<Record<string, CurrencyInfo>>('player.currencies');
      const all = game.game.content.get<ItemDef[]>('items');
      const deps = {
        isCurrency: (id: string) => id in currencies,
        tryItem: (id: string) => all.find((d) => d.id === id),
      };
      const okAll = RECIPES.every((r) => resolveRecipeIO(r, deps).ok);
      game.dispose();
      return okAll;
    }),
  );
  results.push(
    check('контент: цепочка глубины 4 (руда → слиток → пластина → кирка) и брёвна → доски → гвозди', () => {
      const byId = new Map(RECIPES.map((r) => [r.id, r] as const));
      const sm = byId.get('sm_iron');
      const av = byId.get('av_plate');
      const pk = byId.get('av_pickaxe');
      const wb1 = byId.get('wb_planks');
      const wb2 = byId.get('wb_nails');
      return (
        sm !== undefined && av !== undefined && pk !== undefined && wb1 !== undefined && wb2 !== undefined &&
        sm.output.defId === 'iron_ingot' && av.inputs.some((i) => i.defId === 'iron_ingot') &&
        av.output.defId === 'iron_plate' && pk.inputs.some((i) => i.defId === 'iron_plate') &&
        pk.output.defId === 'iron_pickaxe' &&
        wb1.inputs[0].defId === 'logs' && wb1.output.defId === 'planks' &&
        wb2.inputs[0].defId === 'planks' && wb2.output.defId === 'nails'
      );
    }),
  );
  results.push(
    check('контент: 14 новых предметов в каталоге; выход кирки несёт modSlots (C4-канал)', () => {
      const ids = new Set(CRAFT_ITEMS.map((d) => d.id));
      const need = ['plow', 'wool', 'egg', 'iron_plate', 'backpack', 'warm_scarf', 'woven_banner',
        'omelet', 'fish_soup', 'spiced_stew', 'battle_draught', 'growth_elixir', 'luck_elixir', 'animal_remedy'];
      return (
        CRAFT_ITEMS.length === 14 && need.every((id) => ids.has(id))
      );
    }),
  );

  // ------------------------------------------------ формула качества §4 (сетка)
  const q = (avgInputTier: number, skillLevel: number, qualityBonus: number, minigameAdj = 0) =>
    outputQuality({ avgInputTier, skillLevel, qualityBonus, minigameAdj }, CRAFT_TABLE);
  results.push(
    check('формула §4: сетка входов/навыка (D-входы+нулевой навык → D; SS → A)', () => {
      const a = q(0, 0, 100);
      const b = q(5, 0, 100);
      const c = q(1, 0, 100);
      const d = q(3, 10, 100);
      const e = q(5, 25, 100);
      const f = q(2, 5, 100);
      return (
        a.tier === 'D' && a.value === 0 &&
        b.tier === 'A' && b.value === 50 &&
        c.tier === 'C' && c.value === 50 &&
        d.tier === 'B' && d.value === 30 &&
        e.tier === 'SS' && e.value === 50 &&
        f.tier === 'C' && f.value === 40
      );
    }, { expected: 'D/0, A/50, C/50, B/30, SS/50, C/40', actual: `${q(0, 0, 100).tier}/${q(0, 0, 100).value}, ${q(5, 0, 100).tier}/${q(5, 0, 100).value}, ${q(1, 0, 100).tier}/${q(1, 0, 100).value}, ${q(3, 10, 100).tier}/${q(3, 10, 100).value}, ${q(5, 25, 100).tier}/${q(5, 25, 100).value}, ${q(2, 5, 100).tier}/${q(2, 5, 100).value}` }),
  );
  results.push(
    check('формула §4: мини-игра ±1 (auto 0) и клэмп поправки', () => {
      const plus = q(2, 5, 100, 1);
      const minus = q(2, 5, 100, -1);
      const clamp = q(2, 5, 100, 5);
      return plus.tier === 'B' && plus.value === 40 && minus.tier === 'D' && minus.value === 40 && clamp.tier === 'B';
    }),
  );
  results.push(
    check('формула §4: тир навыка = уровень/5 с капом 5; перк qualityBonus +5% → +0.05 тира', () =>
      skillTierOf(0, CRAFT_TABLE) === 0 && skillTierOf(5, CRAFT_TABLE) === 1 &&
      skillTierOf(24, CRAFT_TABLE) === 4.8 && skillTierOf(25, CRAFT_TABLE) === 5 &&
      skillTierOf(100, CRAFT_TABLE) === 5 &&
      q(2, 5, 105).value === 45),
  );
  results.push(
    check('формула §4: tierValue/qualityFromValue — границы и клэмпы шкалы', () =>
      tierValue('D', 50) === 0.5 && tierValue('A', 0) === 3 && tierValue('SS', 100) === 6 &&
      qualityFromValue(-1).tier === 'D' && qualityFromValue(7).tier === 'SS' &&
      qualityFromValue(2.6).tier === 'A' && qualityFromValue(2.6).value === 60),
  );

  // ------------------------------------- живое качество: входы влияняют (§4)
  const fA = await makeSeededCraftGame('m09-quality-a');
  grantCurrency(fA, 'planks', 2);
  giveItem(fA, 'iron_ingot', 'D', 0);
  const mA = make(fA, 'wb_shovel');
  const fB = await makeSeededCraftGame('m09-quality-b');
  grantCurrency(fB, 'planks', 2);
  giveItem(fB, 'iron_ingot', 'SS', 0);
  const mB = make(fB, 'wb_shovel');
  advance(fA, 91_000);
  advance(fB, 91_000);
  const readyA = (fA.craft['craft.ready']() as Array<{ quality: { tier: string; value: number } }>)[0];
  const readyB = (fB.craft['craft.ready']() as Array<{ quality: { tier: string; value: number } }>)[0];
  results.push(
    check('живое качество: D-слиток → лопата D/0; SS-слиток → лопата A/50 (валюта planks в среднем не участвует)', () =>
      mA.ok && mB.ok && readyA.quality.tier === 'D' && readyA.quality.value === 0 &&
      readyB.quality.tier === 'A' && readyB.quality.value === 50,
      { expected: 'D/0 и A/50', actual: `${readyA?.quality.tier}/${readyA?.quality.value} и ${readyB?.quality.tier}/${readyB?.quality.value}` }),
  );
  fA.dispose();
  fB.dispose();

  // ------------------------------------------------------ станции §2 (гейты)
  const f1 = await makeSeededCraftGame('m09-stations');
  const stationsView1 = f1.craft['craft.stations']() as Array<{
    id: string; built: boolean; costGold: number; unlockText: string | null; queueLength: number;
  }>;
  results.push(
    check('станции: витрина 7, верстак построен, очередь верстака = 2 (стат)', () =>
      stationsView1.length === 7 &&
      stationsView1.find((s) => s.id === 'workbench')?.built === true &&
      stationsView1.find((s) => s.id === 'workbench')?.queueLength === 2),
  );
  const buyEarly = f1.craft['craft.buy']('smelter') as R<unknown>;
  results.push(
    check('станции: гейт покупки (уровень 1 → отказ с условием)', () =>
      !buyEarly.ok && buyEarly.error.includes('Откроется: уровень 3')),
  );
  addXp(f1, 600); // уровень 5
  grantCurrency(f1, 'gold', 2000);
  const buySmelter = f1.craft['craft.buy']('smelter') as R<unknown>;
  const buySmelterAgain = f1.craft['craft.buy']('smelter') as R<unknown>;
  const buyUnknown = f1.craft['craft.buy']('nonsense') as R<unknown>;
  results.push(
    check('станции: покупка за золото (smelter 300); дубль и мусор — отказы', () =>
      buySmelter.ok && f1.game.wallet.get('gold') === 1700 && !buySmelterAgain.ok && !buyUnknown.ok),
  );
  const queueBefore = f1.game.statBus.resolve({ stat: 'craft.queue.length.workbench', ctx: f1.game.time.ctx('player') });
  const buyBig = f1.craft['craft.buy']('big_workbench') as R<unknown>;
  const queueAfter = f1.game.statBus.resolve({ stat: 'craft.queue.length.workbench', ctx: f1.game.time.ctx('player') });
  results.push(
    check('улучшение: big_workbench +2 к очереди немедленно (invalidate.stat, шина)', () =>
      buyBig.ok && queueBefore === 2 && queueAfter === 4 && f1.game.wallet.get('gold') === 1350),
  );

  // ------------------------------ кап наковальни: «потолок M10 как cap» (§6/§7)
  // [R1 · M10.1] легализованная лестница карточки M10 §3: база 60 → наковальня
  // cap 20 → «Второй молот» cap 40 → мифрил cap 60 (стек-группа max; прежние
  // 20/10/15 были временными — карточки M10 не было во входах M09)
  const capNone = f1.game.statBus.resolve({ stat: 'forge.sharpen.levelMax', ctx: f1.game.time.ctx('player') });
  const buyAnvil = f1.craft['craft.buy']('anvil') as R<unknown>;
  const capAnvil = f1.game.statBus.resolve({ stat: 'forge.sharpen.levelMax', ctx: f1.game.time.ctx('player') });
  const buySecondEarly = f1.craft['craft.buy']('second_hammer') as R<unknown>;
  const buyMithrilEarly = f1.craft['craft.buy']('mithril_anvil') as R<unknown>;
  addXp(f1, 20_000); // уровень ≥ 12
  grantCurrency(f1, 'gold', 2000); // молот 600 + мифрил 1200: остатка не хватает
  const buySecond = f1.craft['craft.buy']('second_hammer') as R<unknown>;
  const capSecond = f1.game.statBus.resolve({ stat: 'forge.sharpen.levelMax', ctx: f1.game.time.ctx('player') });
  const buyMithril = f1.craft['craft.buy']('mithril_anvil') as R<unknown>;
  const capMithril = f1.game.statBus.resolve({ stat: 'forge.sharpen.levelMax', ctx: f1.game.time.ctx('player') });
  results.push(
    check('наковальня: потолок заточки — cap-модификатором через шину (60 → 20 → молот 40 → мифрил 60; стек-группа max); гейты молота ур.8/мифрила ур.12', () =>
      capNone === 60 && buyAnvil.ok && capAnvil === 20 &&
      !buySecondEarly.ok && !buyMithrilEarly.ok &&
      buySecond.ok && capSecond === 40 && buyMithril.ok && capMithril === 60,
    { expected: '60 → 20 → 40 → 60', actual: `${capNone} → ${capAnvil} → ${capSecond} → ${capMithril}` }),
  );

  // ------------------------------------------------------ валидации запуска
  const f2 = await makeSeededCraftGame('m09-validation');
  const mkUnknown = make(f2, 'nonsense_recipe');
  results.push(
    check('валидация: неизвестный рецепт — валидная ошибка', () =>
      !mkUnknown.ok && mkUnknown.error.includes('неизвестный рецепт')),
  );
  const mkNoStation = make(f2, 'sm_iron');
  results.push(
    check('валидация: станция не построена — отказ с подсказкой покупки', () =>
      !mkNoStation.ok && mkNoStation.error.includes('требует станцию')),
  );
  giveItem(f2, 'iron_ingot', 'D', 0, 2);
  grantCurrency(f2, 'planks', 3);
  grantCurrency(f2, 'nails', 4);
  const mkGated = make(f2, 'wb_plow');
  results.push(
    check('валидация: гейт-рецепт не крафтится (wb_plow: уровень 4), входы и энергия целы', () => {
      const snap = f2.player['player.snapshot']() as { energy: { current: number } };
      return (
        !mkGated.ok && mkGated.error.includes('Откроется: уровень 4') &&
        countItem(f2, 'iron_ingot') === 2 && f2.game.wallet.get('planks') === 3 &&
        f2.game.wallet.get('nails') === 4 && snap.energy.current === 100
      );
    }),
  );
  grantCurrency(f2, 'logs', 3);
  f2.player['player.setEnergy'](0);
  const mkNoEnergy = make(f2, 'wb_planks');
  results.push(
    check('валидация: нет энергии — отказ, входы целы (энергия не списана)', () =>
      !mkNoEnergy.ok && mkNoEnergy.error.includes('не хватает энергии') &&
      f2.game.wallet.get('logs') === 3),
  );
  f2.player['player.setEnergy'](100);
  f2.dispose();

  // ------------------------------------------------------ ремонт (§2, M02 §4)
  const f3 = await makeSeededCraftGame('m09-repair');
  giveItem(f3, 'shovel', 'D', 50);
  giveItem(f3, 'repair_kit', 'D', 50, 1);
  const shovelIid = backpack(f3).find((i) => i.defId === 'shovel')?.iid ?? '';
  f3.inv['inventory.dur'](shovelIid, 10);
  const repairNoAnvil = f3.craft['craft.repair'](shovelIid) as R<unknown>;
  results.push(
    check('ремонт: без наковальни — отказ', () => !repairNoAnvil.ok && repairNoAnvil.error.includes('наковальню')),
  );
  addXp(f3, 600);
  grantCurrency(f3, 'gold', 600);
  f3.craft['craft.buy']('anvil');
  const goldBefore = f3.game.wallet.get('gold');
  const repairR = f3.craft['craft.repair'](shovelIid) as R<{ goldCost: number; kits: number; durability: { current: number; max: number } }>;
  const after = backpack(f3).find((i) => i.defId === 'shovel');
  results.push(
    check('ремонт: 10% базы (ceil(45×10%)=5 золота) + 1 набор → прочность 60/60', () =>
      repairR.ok && repairR.value.goldCost === 5 && repairR.value.kits === 1 &&
      goldBefore - f3.game.wallet.get('gold') === 5 &&
      countItem(f3, 'repair_kit') === 0 &&
      after?.durability?.current === 60 && after?.durability?.max === 60),
  );
  const repairFull = f3.craft['craft.repair'](shovelIid) as R<unknown>;
  results.push(
    check('ремонт: целое durability → отказ «не требуется»', () => !repairFull.ok && repairFull.error.includes('не требуется')),
  );
  f3.dispose();

  return group('M09 · Крафт: контент, формула качества и станции (§2/§4)', results);
}
