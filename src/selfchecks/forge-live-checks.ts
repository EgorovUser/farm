/**
 * Self-checks M10.1 «Заточка», живые пробы (бриф §4.8): attempt-цикл (гейты/
 * исходы/pity/события), шов statScale M02, эффективный тир в цене, потолок
 * live (R1), сейв v8, детерминизм. Собирается forge-checks.ts в ОДНУ группу
 * «M10 · Заточка» (расщепление 01 §6 — файл превысил 300 строк).
 */
import { check, type CheckResult } from './types';
import { MemoryStorage } from '@/kernel/save/storage-drivers';
import {
  addXp,
  attempt,
  autoCards,
  backpack,
  buyForgeSetup,
  firstIid,
  force,
  giveItem,
  grantGold,
  makeForgeGame,
  makeSeededForgeGame,
  type ForgeFixture,
  type R,
} from './forge-fixture';

/** покупка наковальни через api craft (гейт попытки §4.4) */
export function buyAnvil(f: ForgeFixture): R<unknown> {
  return f.game.modules.get('craft')?.api['craft.buy']('anvil') as R<unknown>;
}

export async function runForgeLiveChecks(): Promise<CheckResult[]> {
  const results: CheckResult[] = [];

  // ------------------------------------------- живой attempt-цикл (гейты/исходы/pity)
  const f1 = await makeSeededForgeGame('m10-cycle');
  const swordIid = (giveItem(f1, 'iron_sword', 'D', 0), firstIid(f1, 'iron_sword'));
  const noStation = attempt(f1, swordIid);
  results.push(
    check('гейты: без станка — отказ; не-точимый тип — отказ; мусорный iid — отказ', () => {
      const omelet = (giveItem(f1, 'omelet', 'D', 0), firstIid(f1, 'omelet'));
      const badType = attempt(f1, omelet);
      const garbage = attempt(f1, 'nope#9');
      return (
        !noStation.ok && noStation.error.includes('Точильный станок') &&
        !badType.ok && badType.error.includes('не точатся') &&
        !garbage.ok && garbage.error.includes('не найден')
      );
    }),
  );
  addXp(f1, 600); // уровень 5 — гейт наковальни
  grantGold(f1, 2000);
  f1.inv['inventory.add']('iron_ingot', 'D', 0, 50, 'selfcheck.m10');
  buyForgeSetup(f1); // станок (круг ур.7 при ур.5 — отказ, допустимо)
  const stillNoAnvil = attempt(f1, swordIid);
  results.push(
    check('гейты: станок куплен, наковальни нет — отказ с подсказкой покупки', () =>
      !stillNoAnvil.ok && stillNoAnvil.error.includes('наковальню')),
  );
  const buyAnvil1 = buyAnvil(f1);
  force(f1, 'success');
  const a1 = attempt(f1, swordIid);
  const a2 = attempt(f1, swordIid);
  results.push(
    check('живой цикл: успех +1 уровень (L0→L1→L2), транзакция 1 слиток + 10 золота, события success', () =>
      (buyAnvil1 as { ok: boolean }).ok &&
      a1.ok && a1.value.outcome === 'success' && a1.value.toLevel === 1 &&
      a2.ok && a2.value.toLevel === 2 &&
      a1.value.cost.ingots === 1 && a1.value.cost.gold === 10 &&
      f1.events.some((e) => e.name === 'forge.success' && e.payload.level === 2)),
  );
  force(f1, 'fail');
  const a3 = attempt(f1, swordIid);
  const pityAfterFail = f1.game.pity.get('player', `forge:${swordIid}`);
  force(f1, 'rollback');
  const a4 = attempt(f1, swordIid);
  const pityAfterRollback = f1.game.pity.get('player', `forge:${swordIid}`);
  results.push(
    check('pity: провал → bump (1); откат → bump (2, НЕ сброс); откат L2 → L1; событие rollback {fromLevel, toLevel}', () =>
      a3.ok && a3.value.outcome === 'fail' && a3.value.toLevel === 2 &&
      a4.ok && a4.value.outcome === 'rollback' && a4.value.toLevel === 1 &&
      pityAfterFail === 1 && pityAfterRollback === 2 &&
      f1.events.some((e) => e.name === 'forge.rollback' && e.payload.fromLevel === 2 && e.payload.toLevel === 1)),
  );
  force(f1, 'success');
  const a5 = attempt(f1, swordIid);
  results.push(
    check('pity: успех → reset (0); качество предмета НЕ мутировано (П2: D/0 в записи)', () => {
      const rec = backpack(f1).find((i) => i.iid === swordIid);
      return (
        a5.ok && a5.value.outcome === 'success' &&
        f1.game.pity.get('player', `forge:${swordIid}`) === 0 &&
        rec?.quality.tier === 'D' && rec?.quality.value === 0
      );
    }),
  );
  // [MISS-1 · гигиена M15.1] откат НА L0: «−1 уровень, не ниже 0» (карточка M10 §4)
  giveItem(f1, 'iron_sword', 'D', 0);
  const swordL0 = backpack(f1).filter((i) => i.defId === 'iron_sword').at(-1)?.iid ?? '';
  force(f1, 'rollback');
  const aL0 = attempt(f1, swordL0);
  const statsL0 = f1.forge['forge.stats'](swordL0) as R<{ level: number }>;
  results.push(
    check('откат НА L0: не ниже нуля — toLevel 0, событие forge.rollback {fromLevel: 0, toLevel: 0}, уровень 0', () =>
      aL0.ok && aL0.value.outcome === 'rollback' && aL0.value.toLevel === 0 &&
      f1.events.some((e) => e.name === 'forge.rollback' && e.payload.fromLevel === 0 && e.payload.toLevel === 0) &&
      statsL0.ok && statsL0.value.level === 0),
  );
  results.push(
    // [M10.2] легализация: payload шансов — breakdown (сумма компонентов = итогу,
    // гигиена §1.1); поля baseSuccess/pityBonus заменены композитом
    check('событие forge.attempt: полные данные шансов (breakdown: base/pity/circle/decline = итог; rollback/стоимость/исход)', () => {
      const e = f1.events.find((ev) => ev.name === 'forge.attempt' && ev.payload.level === 2);
      if (e === undefined) return false;
      const b = e.payload.breakdown as { base: number; pity: number; circle: number; decline: number; chance: number } | undefined;
      return (
        b !== undefined &&
        typeof b.base === 'number' &&
        typeof b.pity === 'number' &&
        typeof b.circle === 'number' &&
        typeof b.decline === 'number' &&
        typeof b.chance === 'number' &&
        // [гигиена §1.1] сумма компонентов = итогу (клэмп капа 0.95 — явно)
        Math.min(0.95, b.base + b.pity + b.circle + b.decline) === b.chance &&
        typeof e.payload.rollbackChance === 'number' &&
        typeof e.payload.cost === 'object' &&
        typeof e.payload.outcome === 'string' &&
        e.payload.iid === swordIid
      );
    }),
  );

  // ------------------------------------------- шов statScale M02 (§4.5)
  // [M10.2] изоляция: авто-карточки легитимно меняют статы — тест statScale
  // гонится в ручном режиме (успехи оставляют предложения, rolledMods чисты)
  const f2 = await makeSeededForgeGame('m10-statscale');
  giveItem(f2, 'iron_sword', 'D', 0);
  const s2 = firstIid(f2, 'iron_sword');
  addXp(f2, 600);
  grantGold(f2, 2000);
  f2.inv['inventory.add']('iron_ingot', 'D', 0, 50, 'selfcheck.m10');
  buyForgeSetup(f2);
  buyAnvil(f2);
  autoCards(f2, 'off');
  const bare = f2.game.statBus.resolve({ stat: 'combat.attack', ctx: f2.game.time.ctx('player') });
  f2.inv['inventory.equip'](s2, 'weapon');
  const beforeSharpen = f2.game.statBus.resolve({ stat: 'combat.attack', ctx: f2.game.time.ctx('player') });
  f2.inv['inventory.unequip']('weapon');
  force(f2, 'success');
  for (let i = 0; i < 10; i++) attempt(f2, s2); // L10 → statScale 1.5
  force(f2, 'off');
  f2.inv['inventory.equip'](s2, 'weapon');
  const afterSharpen = f2.game.statBus.resolve({ stat: 'combat.attack', ctx: f2.game.time.ctx('player') });
  const def = f2.game.content.get<Array<{ id: string; baseStats?: Record<string, number> }>>('items').find((d) => d.id === 'iron_sword');
  results.push(
    check('шов §4.5: statScale применён к БАЗЕ (combat.attack +12 → +18 при L10); база шаблона не мутирована (П2)', () =>
      beforeSharpen === bare + 12 &&
      afterSharpen === bare + 18 &&
      def?.baseStats?.['combat.attack'] === 12,
    { expected: `+12 → +18 (база ${bare})`, actual: `+${beforeSharpen - bare} → +${afterSharpen - bare}` }),
  );

  // ------------------------------------------- эффективный тир в цене продажи (§4.5)
  const f3 = await makeSeededForgeGame('m10-price');
  giveItem(f3, 'iron_sword', 'D', 0);
  const s3 = firstIid(f3, 'iron_sword');
  addXp(f3, 600);
  grantGold(f3, 3000);
  f3.inv['inventory.add']('iron_ingot', 'D', 0, 50, 'selfcheck.m10');
  buyForgeSetup(f3);
  buyAnvil(f3);
  const goldBefore = f3.game.wallet.get('gold');
  const sellPlain = f3.inv['inventory.sell']('iron_sword', 1) as R<{ gold: number }>;
  giveItem(f3, 'iron_sword', 'D', 0);
  const s3b = firstIid(f3, 'iron_sword');
  force(f3, 'success');
  let attemptsGold = 0;
  for (let i = 0; i < 10; i++) {
    const r = attempt(f3, s3b); // L0..L9 → стоимость золота 10+5L
    if (r.ok) attemptsGold += r.value.cost.gold;
  }
  force(f3, 'off');
  const sellSharpened = f3.inv['inventory.sell']('iron_sword', 1) as R<{ gold: number }>;
  results.push(
    check('цена §4.5: эффективный тир в продаже — D → 59 зол., D+L10 (эфф. C) → 84 зол. (шинный множитель)', () =>
      sellPlain.ok && sellPlain.value.gold === 59 &&
      sellSharpened.ok && sellSharpened.value.gold === 84 &&
      f3.game.wallet.get('gold') === goldBefore + 59 + 84 - attemptsGold,
    { expected: '59 и 84', actual: `${sellPlain.ok ? sellPlain.value.gold : '—'} и ${sellSharpened.ok ? sellSharpened.value.gold : '—'}` }),
  );

  // ------------------------------------------- потолок live: гейт на потолке (R1)
  const f4 = await makeSeededForgeGame('m10-cap');
  giveItem(f4, 'shovel', 'D', 0);
  const sh4 = firstIid(f4, 'shovel');
  addXp(f4, 600);
  grantGold(f4, 5000);
  f4.inv['inventory.add']('iron_ingot', 'D', 0, 200, 'selfcheck.m10');
  buyForgeSetup(f4);
  buyAnvil(f4);
  force(f4, 'success');
  for (let i = 0; i < 20; i++) attempt(f4, sh4); // L20 = потолок наковальни
  const ingotsBefore = backpack(f4).filter((i) => i.defId === 'iron_ingot').reduce((s, i) => s + i.qty, 0);
  const goldBefore4 = f4.game.wallet.get('gold');
  const atCap = attempt(f4, sh4);
  results.push(
    check('потолок R1 live: L20/20 — валидный отказ, материалы НЕ списаны; resolve levelMax = 20 (наковальня)', () =>
      f4.game.statBus.resolve({ stat: 'forge.sharpen.levelMax', ctx: f4.game.time.ctx('player') }) === 20 &&
      !atCap.ok && atCap.error.includes('потолок') &&
      backpack(f4).filter((i) => i.defId === 'iron_ingot').reduce((s, i) => s + i.qty, 0) === ingotsBefore &&
      f4.game.wallet.get('gold') === goldBefore4),
  );
  addXp(f4, 2500); // гейт молота ур.8
  const buyHammer = f4.game.modules.get('craft')?.api['craft.buy']('second_hammer') as R<unknown>;
  force(f4, 'success');
  const overCap = attempt(f4, sh4);
  results.push(
    check('потолок R1 live: «Второй молот» → потолок 40, попытка снова возможна (L21)', () =>
      (buyHammer as { ok: boolean }).ok &&
      f4.game.statBus.resolve({ stat: 'forge.sharpen.levelMax', ctx: f4.game.time.ctx('player') }) === 40 &&
      overCap.ok && overCap.value.toLevel === 21),
  );

  // ------------------------------------------- сейв v8: раундтрип уровня/pity/станции
  const storage = new MemoryStorage();
  const f7 = await makeSeededForgeGame('m10-save', storage);
  giveItem(f7, 'iron_sword', 'D', 0);
  const s7 = firstIid(f7, 'iron_sword');
  addXp(f7, 600);
  grantGold(f7, 2000);
  f7.inv['inventory.add']('iron_ingot', 'D', 0, 50, 'selfcheck.m10');
  buyForgeSetup(f7);
  buyAnvil(f7);
  force(f7, 'success');
  attempt(f7, s7);
  attempt(f7, s7);
  force(f7, 'fail');
  attempt(f7, s7); // pity 1
  force(f7, 'off');
  f7.dispose(); // сохраняет
  const f8 = makeForgeGame(storage);
  await f8.game.init();
  const levelAfter = f8.forge['forge.levelOf'](s7) as number;
  const statsAfter = f8.forge['forge.stats'](s7) as R<{ level: number; levelMax: number; pityFails: number; whetstone: boolean; breakdown: { chance: number } }>;
  results.push(
    check('сейв v12: уровень/pity/станок переживают dispose/load (L2, pity 1, шансы из шины)', () => // [M05.1 · v10 → M06.1 · v11 → M07.1 · v12]
      f8.game.save.info().saveVersion === 15 && // [M11 · v14 → M12.1 · v15]
      f8.game.save.info().slices.includes('forge') &&
      levelAfter === 2 &&
      statsAfter.ok && statsAfter.value.pityFails === 1 && statsAfter.value.whetstone === true &&
      statsAfter.value.breakdown.chance > 0),
  );
  f8.dispose();

  // ------------------------------------------- детерминизм попытки (§4.4)
  const runOnce = async (saveId: string) => {
    const f = await makeSeededForgeGame(saveId);
    giveItem(f, 'iron_sword', 'D', 0);
    const iid = firstIid(f, 'iron_sword');
    addXp(f, 600);
    grantGold(f, 2000);
    f.inv['inventory.add']('iron_ingot', 'D', 0, 10, 'selfcheck.m10');
    buyForgeSetup(f);
    buyAnvil(f);
    const r = attempt(f, iid); // естественный ролл: стрим forge:attempt:1
    const draws = f.events.find((e) => e.name === 'forge.attempt')?.payload.draws as number[] | null;
    f.dispose();
    return { outcome: r.ok ? r.value.outcome : 'err', draws };
  };
  const d1 = await runOnce('m10-det');
  const d2 = await runOnce('m10-det');
  results.push(
    check('детерминизм §4.4: одинаковое (состояние, данные, сид) → одинаковый исход и роллы', () =>
      d1.outcome === d2.outcome &&
      Array.isArray(d1.draws) && Array.isArray(d2.draws) &&
      d1.draws[0] === d2.draws[0] && d1.draws[1] === d2.draws[1]),
  );

  f1.dispose();
  f2.dispose();
  f3.dispose();
  f4.dispose();
  return results;
}
