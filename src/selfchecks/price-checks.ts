/**
 * Self-checks PriceBus (02-BUSES §5 + 04-DISCOUNTS §4, §7).
 * Капы групп, перемножение групп, пол 10% базы, sellRate ≤ 100%,
 * монте-карло по случайным комбинациям источников.
 */
import { PriceBus, type PriceCtx, type PriceModifierProvider, type PricedItemDef } from '@/kernel/bus/price-bus/price-bus';
import { ECONOMY_TABLE } from '@/content/balance/economy';
import { check, group, type CheckGroup, type CheckResult } from './types';

const ctx: PriceCtx = { buyer: 'selfcheck', now: 1_700_000_000_000 };

function providerOf(id: string, mods: Parameters<PriceModifierProvider['provide']>[1] extends never ? never : Awaited<ReturnType<PriceModifierProvider['provide']>>): PriceModifierProvider {
  return { id, provide: () => mods };
}

const turnip: PricedItemDef = { id: 'turnip', basePrice: 8, rarity: 'common', itemType: 'component' };
const ore: PricedItemDef = { id: 'iron_ore', basePrice: 3, rarity: 'common', itemType: 'component' };
const penny: PricedItemDef = { id: 'penny', basePrice: 1, rarity: 'common' };

export function runPriceChecks(): CheckGroup {
  const results: CheckResult[] = [];

  // чистая цена
  let bus = new PriceBus(ECONOMY_TABLE);
  results.push(check('репка (common, 8): buy = 8', () => bus.buyPrice(turnip, { ctx }).final === 8));

  // качество входит в base множителем
  const q = bus.buyPrice(turnip, { qualityTier: 'B', ctx });
  results.push(check('качество B ×1.35: base = 10.8', () => q.base === 10.8 && q.final === 11));

  // редкость входит в base множителем
  const ingot: PricedItemDef = { id: 'iron_ingot', basePrice: 12, rarity: 'uncommon', itemType: 'component' };
  results.push(check('редкость uncommon ×1.5: base = 18', () => bus.buyPrice(ingot, { ctx }).base === 18));

  // скупка 40%
  results.push(check('sellRate 40%: репка = 3', () => bus.sellPrice(turnip, { ctx }).final === 3));

  // наценка до скидок
  bus = new PriceBus(ECONOMY_TABLE);
  bus.registerProvider(providerOf('markup.night', [{ id: 'm1', label: 'ночная наценка', kind: 'markup', value: 20 }]));
  results.push(check('наценка +20%: 8 → 10', () => bus.buyPrice(turnip, { ctx }).final === 10));

  // глобальная и локальная скидки перемножаются между группами
  bus = new PriceBus(ECONOMY_TABLE);
  bus.registerProvider(
    providerOf('fair.week', [{ id: 'g1', label: 'ярмарка недели', kind: 'discountGlobal', value: 10 }]),
  );
  bus.registerProvider(providerOf('ach.client', [{ id: 'l1', label: 'постоянный клиент', kind: 'discountLocal', value: 5 }]));
  // 8 × 0.9 × 0.95 = 6.84 → 7
  results.push(check('группы перемножаются: 8×0.9×0.95 = 7', () => bus.buyPrice(turnip, { ctx }).final === 7));

  // кап внутри глобальной группы: 50+30=80 → 60
  bus = new PriceBus(ECONOMY_TABLE);
  bus.registerProvider(
    providerOf('global.bulk', [
      { id: 'g1', label: 'акция', kind: 'discountGlobal', value: 50 },
      { id: 'g2', label: 'репутация', kind: 'discountGlobal', value: 30 },
    ]),
  );
  const capped = bus.buyPrice(turnip, { ctx });
  results.push(check('кап глобальной группы 60%: сработал', () => capped.globalCapped && capped.globalSumPercent === 60));
  results.push(check('8 × 0.4 = 3', () => capped.final === 3));

  // кап локальной группы 40%
  bus = new PriceBus(ECONOMY_TABLE);
  bus.registerProvider(
    providerOf('local.bulk', [
      { id: 'l1', label: 'купон', kind: 'discountLocal', value: 30 },
      { id: 'l2', label: 'уровень магазина', kind: 'discountLocal', value: 30 },
    ]),
  );
  const localCapped = bus.buyPrice(turnip, { ctx });
  results.push(check('кап локальной группы 40%: сработал', () => localCapped.localCapped && localCapped.localSumPercent === 40));

  // пол 10% базы: даже экстремальные скидки не делают бесплатно
  bus = new PriceBus(ECONOMY_TABLE);
  bus.registerProvider(
    providerOf('max.discount', [
      { id: 'g', label: 'глобальная мега', kind: 'discountGlobal', value: 60 },
      { id: 'l', label: 'локальная мега', kind: 'discountLocal', value: 40 },
    ]),
  );
  const floored = bus.buyPrice(penny, { ctx });
  // 1 × 0.4 × 0.6 = 0.24 → round 0 → пол ceil(1×0.1) = 1
  results.push(
    check('пол цены: предмет за 1 монету не становится бесплатным', () => floored.final === 1 && floored.floorApplied, {
      expected: '1 (пол)',
      actual: String(floored.final),
    }),
  );

  // sellBonus поднимает ставку, но не выше 100% базы
  bus = new PriceBus(ECONOMY_TABLE);
  bus.registerProvider(providerOf('sell.bonus', [{ id: 's1', label: 'навык торга', kind: 'sellBonus', value: 50 }]));
  results.push(check('sellBonus +50%: 8 × 0.6 = 5', () => bus.sellPrice(turnip, { ctx }).final === 5));
  bus.registerProvider(providerOf('sell.mega', [{ id: 's2', label: 'гроссмейстер торга', kind: 'sellBonus', value: 300 }]));
  results.push(check('sellBonus не выше 100% базы: sell = 8', () => bus.sellPrice(turnip, { ctx }).final === 8));

  // скупка не зависит от скидок дня
  bus = new PriceBus(ECONOMY_TABLE);
  bus.registerProvider(providerOf('day.sale', [{ id: 'g', label: 'распродажа', kind: 'discountGlobal', value: 50 }]));
  results.push(check('sell не зависит от дневных скидок', () => bus.sellPrice(ore, { ctx }).final === 1));

  // снятие провайдера
  bus.unregisterProvider('day.sale');
  results.push(check('unregister провайдера цен работает', () => bus.providerIds().length === 0));

  // монте-карло: случайные комбинации всегда в пределах инвариантов
  // [FIX-0.1 F] пороги читаются ИЗ КОНФИГА (раньше хардкод 0.099)
  const rnd = mulberry(42);
  const maxTotal = ECONOMY_TABLE.maxTotalDiscountPercent;
  const minKeep = 1 - maxTotal / 100;
  let invariantOk = true;
  let detail = '';
  for (let i = 0; i < 500; i++) {
    const mcBus = new PriceBus(ECONOMY_TABLE);
    const def: PricedItemDef = { id: 'mc', basePrice: Math.floor(rnd() * 1000) + 1, rarity: 'common' };
    const mods = [] as Awaited<ReturnType<PriceModifierProvider['provide']>>;
    const count = Math.floor(rnd() * 3);
    for (let k = 0; k < count; k++) mods.push({ id: `m${k}`, label: 'наценка', kind: 'markup', value: Math.floor(rnd() * 50) });
    const gCount = Math.floor(rnd() * 4);
    for (let k = 0; k < gCount; k++) mods.push({ id: `g${k}`, label: 'глобальная', kind: 'discountGlobal', value: Math.floor(rnd() * 80) + 1 });
    const lCount = Math.floor(rnd() * 4);
    for (let k = 0; k < lCount; k++) mods.push({ id: `l${k}`, label: 'локальная', kind: 'discountLocal', value: Math.floor(rnd() * 80) + 1 });
    mcBus.registerProvider(providerOf('mc', mods));

    const buy = mcBus.buyPrice(def, { ctx });
    const floor = Math.ceil(def.basePrice * ECONOMY_TABLE.minPriceFactor);
    if (buy.final < floor) {
      invariantOk = false;
      detail = `buy ${buy.final} < floor ${floor}`;
      break;
    }
    // эффективная скидка — из breakdown, против конфига (не хардкод)
    if (buy.totalDiscountPercent > maxTotal + 1e-9) {
      invariantOk = false;
      detail = `скидка ${buy.totalDiscountPercent.toFixed(2)}% > ${maxTotal}%`;
      break;
    }
    // цена не ниже (1 − maxTotal) от цены-с-наценкой (допуск округления ±0.5)
    const withMarkup = def.basePrice * (1 + buy.markupSumPercent / 100);
    if (buy.final + 0.5 < withMarkup * minKeep) {
      invariantOk = false;
      detail = `buy ${buy.final} глубже ${maxTotal}% от ${withMarkup}`;
      break;
    }
    const sell = mcBus.sellPrice(def, { ctx });
    if (sell.final > def.basePrice) {
      invariantOk = false;
      detail = `sell ${sell.final} > base ${def.basePrice}`;
      break;
    }
  }
  results.push(
    check('монте-карло 500 комбинаций: инварианты цен целы (пороги из конфига)', () => invariantOk, { expected: 'без нарушений', actual: detail || 'ок' }),
  );

  // [FIX-0.1 F] прямой оракул клэмпа: капы групп 80/70 → сырая скидка 94% → клэмп 90%
  bus = new PriceBus({ ...ECONOMY_TABLE, globalGroupCapPercent: 80, localGroupCapPercent: 70 });
  bus.registerProvider(
    providerOf('clamp.oracle', [
      { id: 'g80', label: 'глобальная мега', kind: 'discountGlobal', value: 80 },
      { id: 'l70', label: 'локальная мега', kind: 'discountLocal', value: 70 },
    ]),
  );
  const clamped = bus.buyPrice({ id: 'clamp', basePrice: 100, rarity: 'common' }, { ctx });
  // 100 × 0.2 × 0.3 = 6 без клэмпа; с клэмпом: 100 × 0.1 = 10
  results.push(
    check('клэмп 90%: 80+70 → эффективная скидка ровно 90%, цена 10 (было бы 6)', () =>
      clamped.final === 10 && clamped.totalDiscountCapped && Math.abs(clamped.totalDiscountPercent - 90) < 1e-9, {
      expected: 'final 10, total 90%, capped',
      actual: `final ${clamped.final}, total ${clamped.totalDiscountPercent.toFixed(2)}%, capped ${clamped.totalDiscountCapped}`,
    }),
  );

  // [FIX-0.1 F] монте-карло с временными капами 80/70 в данных: клэмп ловит 94%
  const mcEconomy = { ...ECONOMY_TABLE, globalGroupCapPercent: 80, localGroupCapPercent: 70 };
  const rnd2 = mulberry(7);
  let clampOk = true;
  let clampDetail = '';
  let clampHits = 0;
  for (let i = 0; i < 500; i++) {
    const mcBus = new PriceBus(mcEconomy);
    const def: PricedItemDef = { id: 'mc2', basePrice: Math.floor(rnd2() * 1000) + 1, rarity: 'common' };
    const mods = [] as Awaited<ReturnType<PriceModifierProvider['provide']>>;
    const gCount = 1 + Math.floor(rnd2() * 3);
    for (let k = 0; k < gCount; k++) mods.push({ id: `g${k}`, label: 'глобальная', kind: 'discountGlobal', value: Math.floor(rnd2() * 95) + 1 });
    const lCount = 1 + Math.floor(rnd2() * 3);
    for (let k = 0; k < lCount; k++) mods.push({ id: `l${k}`, label: 'локальная', kind: 'discountLocal', value: Math.floor(rnd2() * 95) + 1 });
    const mCount = Math.floor(rnd2() * 2);
    for (let k = 0; k < mCount; k++) mods.push({ id: `m${k}`, label: 'наценка', kind: 'markup', value: Math.floor(rnd2() * 40) });
    mcBus.registerProvider(providerOf('mc2', mods));

    const buy = mcBus.buyPrice(def, { ctx });
    if (buy.totalDiscountPercent > maxTotal + 1e-9) {
      clampOk = false;
      clampDetail = `скидка ${buy.totalDiscountPercent.toFixed(2)}% > ${maxTotal}%`;
      break;
    }
    if (buy.totalDiscountCapped) clampHits++;
    const floor = Math.ceil(def.basePrice * mcEconomy.minPriceFactor);
    if (buy.final < floor) {
      clampOk = false;
      clampDetail = `buy ${buy.final} < floor ${floor}`;
      break;
    }
  }
  results.push(
    check('монте-карло 80/70 (500): суммарная скидка ≤ 90% и цена ≥ floor', () => clampOk, { expected: 'без нарушений', actual: clampDetail || 'ок' }),
  );
  results.push(
    check('монте-карло 80/70: клэмп срабатывал и виден в breakdown', () => clampHits > 0, { expected: '> 0 раз', actual: `${clampHits} раз` }),
  );

  return group('PriceBus · скидки и инварианты (04-DISCOUNTS §7)', results);
}

function mulberry(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
