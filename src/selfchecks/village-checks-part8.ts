/**
 * Self-checks M16.3 «Деревня» — часть 8: БИРЖА — репутация, тренды в
 * ценах, уникальные товары, потребитель Рынка, roundtrip (бриф
 * G4–G7/G9/G10): очки → уровень → village.reputationChanged РОВНО ×1
 * (не на каждое начисление), тренды/премия в расшифровке PriceBus (тег
 * trade; изоляция — без тега модов НЕТ), покупка уникального товара с
 * гейтом репутации, Рынок 5/8/10 — потребитель цен биржи (контраст
 * ДО/ПОСЛЕ постройки), roundtrip байт-в-байт + ленивость + пост-wipe.
 */
import { VILLAGE_TRADE, premiumWithTrend, trendPoolOf } from '@/content/village/trade';
import { ITEMS } from '@/content/items/items';
import { pushHistory, rerollTradeDay } from '@/game/modules/village/trade';
import type { VillageState } from '@/game/modules/village/state';
import { check, type CheckResult } from './types';
import {
  VILLAGE_T0,
  dayTickAt,
  fulfillToday,
  giveItems,
  goldOf,
  hourTickAt,
  localDateISO,
  makeSeededVillageGame,
  makeVillageGame,
  openVillageGate,
  raiseVillageToLevel,
  readVillageSlice,
  repEventsOf,
  tradeOf,
  type R,
  type VillageFixture,
} from './village-fixture';

function itemDefOf(defId: string): { id: string; basePrice: number; rarity: 'common' | 'uncommon' | 'rare' | 'epic' | 'legendary' } {
  return ITEMS.find((d) => d.id === defId) as { id: string; basePrice: number; rarity: 'common' | 'uncommon' | 'rare' | 'epic' | 'legendary' };
}

export async function runVillagePart8(): Promise<CheckResult[]> {
  const results: CheckResult[] = [];

  // 32. репутация: очки за контракты, смена уровня → событие РОВНО ×1
  {
    const f = await makeSeededVillageGame('v163-reputation');
    openVillageGate(f);
    // день 0: Лесная 0→4 (без события) + Зернополье 10→14 (без события:
    // начисление БЕЗ смены уровня событие НЕ публикует)
    const r1 = fulfillToday(f, 'lesnaya_zastava');
    const r2 = fulfillToday(f, 'zernopolye');
    const evs0 = repEventsOf(f);
    // день 1: Лесная 4→8 (без события)
    dayTickAt(f, 1);
    const r3 = fulfillToday(f, 'lesnaya_zastava');
    const evs1 = repEventsOf(f);
    // день 2: Лесная 8→12 — ПОРОГ 10 → уровень 0→1 «Знакомый» → событие ×1
    dayTickAt(f, 2);
    const r4 = fulfillToday(f, 'lesnaya_zastava');
    const evs = repEventsOf(f);
    const slice = await readVillageSlice(f);
    const ok32: boolean =
      (r1.ok && r2.ok && r3.ok && r4.ok) === true &&
      evs0.length === 0 &&
      evs1.length === 0 &&
      evs.length === 1 &&
      evs[0]?.partner === 'lesnaya_zastava' &&
      evs[0]?.from === 0 &&
      evs[0]?.to === 1 &&
      evs[0]?.toName === 'Знакомый' &&
      evs[0]?.points === 12 &&
      slice?.reputation?.lesnaya_zastava?.points === 12 &&
      slice?.reputation?.zernopolye?.points === 14 &&
      // канонический порядок ключей = контент (lesnaya раньше zernopolye)
      Object.keys(slice?.reputation ?? {})[0] === 'lesnaya_zastava' &&
      Object.keys(slice?.reputation ?? {})[1] === 'zernopolye' &&
      tradeOf(f).reputation.find((r) => r.partnerId === 'lesnaya_zastava')!.levelName === 'Знакомый' &&
      tradeOf(f).reputation.find((r) => r.partnerId === 'zernopolye')!.levelName === 'Знакомый';
    results.push(
      check(
        'репутация партнёров (G4, [DECISION M163-репутация]): +4 очка за контракт (Лесная 0→4→8→12 за три дня); начисление БЕЗ смены уровня событие НЕ публикует (дни 0–1 — тишина, включая Зернополье 10→14 со старта «Знакомый»); день 2 — порог 10 перейдён → village.reputationChanged РОВНО ×1 { partner, from: 0, to: 1, toName: «Знакомый», points: 12 } (каталог 02 §4); срез reputation материализован: Лесная 12, Зернополье 14, порядок ключей = контент; витрина показывает уровни живьём',
        () => ok32,
        {
          expected: 'событие ×1 (0→1 на 12 очках); срез 12/14',
          actual: `событий ${evs.length} (from ${String(evs[0]?.from)} to ${String(evs[0]?.to)}); срез ${String(slice?.reputation?.lesnaya_zastava?.points)}/${String(slice?.reputation?.zernopolye?.points)}`,
        },
      ),
    );
    f.dispose();
  }

  // 33. тренды и премия в ценах PriceBus: тег trade — скоуп, изоляция без тега
  {
    const f = await makeSeededVillageGame('v163-trends');
    openVillageGate(f);
    const view = tradeOf(f);
    const trends = view.trends;
    const now = f.clock.now();
    // [M163-ДЕФЕКТ-1 · кэш PriceBus] теги входят в кэш-ключ шины (extra — нет):
    // оракулы зеркалят теговую схему модуля (['trade', 'partner:<id>'(, 'contract')])
    const priceCtx = (partner: string, contract: boolean, tags: string[]) => ({
      buyer: 'player' as const,
      now,
      tags,
      extra: { partner, ...(contract ? { contract: true } : {}) },
    });
    // прямой оракул PriceBus: тренд даёт мод на покупку (с тегом trade)
    let trendModsOk = trends.length >= 0; // пустые тренды — валидный ролл
    for (const t of trends) {
      const bd = f.game.priceBus.buyPrice(itemDefOf(t.defId), { ctx: priceCtx('lesnaya_zastava', false, ['trade', 'partner:lesnaya_zastava']) });
      const mod = bd.applied.find((m) => m.id === `trade.trend.${t.kind}.${t.defId}`);
      trendModsOk =
        trendModsOk &&
        mod !== undefined &&
        mod.value === (t.kind === 'abundance' ? VILLAGE_TRADE.trends.abundancePercent : VILLAGE_TRADE.trends.deficitMarkupPercent) &&
        mod.group === (t.kind === 'abundance' ? 'global' : 'markup');
    }
    // изоляция: БЕЗ тега trade модов биржи НЕТ (цены магазина не трогаем)
    const noTag = f.game.priceBus.buyPrice(itemDefOf('omelet'), { ctx: priceCtx('zernopolye', false, []) });
    const noTagOk = noTag.applied.every((m) => !m.id.startsWith('trade.'));
    // премия контракта — sellBonus к ставке скупки (свинг тренда учтён)
    const c = view.contracts.find((r) => r.partnerId === 'lesnaya_zastava')!;
    const trend = trends.find((t) => t.defId === c.item)?.kind;
    const expectedPremium = premiumWithTrend(c.premiumPercent, trend, VILLAGE_TRADE.trends.contractSwingPercent);
    const sell = f.game.priceBus.sellPrice(itemDefOf(c.item), {
      qualityTier: null,
      ctx: priceCtx('lesnaya_zastava', true, ['trade', 'partner:lesnaya_zastava', 'contract']),
    });
    const premMod = sell.applied.find((m) => m.id === 'trade.contract.lesnaya_zastava');
    // та же скупка БЕЗ контракта — премии НЕТ (другой тег → другой кэш-ключ)
    const sellNoContract = f.game.priceBus.sellPrice(itemDefOf(c.item), {
      qualityTier: null,
      ctx: priceCtx('lesnaya_zastava', false, ['trade', 'partner:lesnaya_zastava']),
    });
    const ok33 =
      trendModsOk &&
      noTagOk &&
      premMod !== undefined &&
      premMod.kind === 'sellBonus' &&
      premMod.value === expectedPremium &&
      sellNoContract.applied.every((m) => m.id !== 'trade.contract.lesnaya_zastava');
    results.push(
      check(
        'тренды и премия в ценах PriceBus (G5, [DECISION M163-тренды] + [M163-ДЕФЕКТ-1 · кэш]): тренд дня даёт мод на покупку ТОЧНО по данным — изобилие discountGlobal −15% (04 §2.1) / дефицит markup +20% (04 §4.3), скоуп = тег trade (БЕЗ тега модов биржи НЕТ — цены магазина не затронуты); премия контракта — sellBonus к ставке скупки ровно premiumWithTrend(премия, тренд, свинг ±10); БЕЗ контрактного тега премии НЕТ (обычная продажа бирже не премиальная); ДЕФЕКТ кэша PriceBus (extra НЕ в ключе — скупка без контракта получала закэшированную премию) закрыт теговой схемой («trade», «partner:id», «contract» — теги ВХОДЯТ в кэш-ключ; ядро заморожено, 16-я заморозка)',
        () => ok33,
        {
          expected: 'тренды в модах; тег-изолировано; премия = оракулу',
          actual: `трендов ${trends.length} (${trends.map((t) => `${t.defId}:${t.kind}`).join(',') || '—'}); премия ${String(premMod?.value)} vs ${expectedPremium}; без тега ${noTagOk ? 'чисто' : 'FAIL'}`,
        },
      ),
    );
    f.dispose();
  }

  // 34. уникальные товары: гейт репутации, покупка живьём, «не продаёт»
  {
    const f = await makeSeededVillageGame('v163-goods');
    openVillageGate(f);
    f.game.wallet.grant('gold', 5000);
    const view = tradeOf(f);
    const omelet = view.goods.find((g) => g.partnerId === 'zernopolye' && g.defId === 'omelet')!;
    const goldBefore = goldOf(f);
    const buy = f.village['village.trade.buy']('zernopolye', 'omelet', 2) as R<unknown>;
    const inv = (f.inv['inventory.list']() as Array<{ defId: string; qty: number }>).filter((e) => e.defId === 'omelet');
    const boughtQty = inv.reduce((s, e) => s + e.qty, 0);
    const slice = await readVillageSlice(f);
    const growGate = f.village['village.trade.buy']('zernopolye', 'growth_elixir') as R<unknown>;
    const battleGate = f.village['village.trade.buy']('gornyy_pereval', 'battle_draught') as R<unknown>;
    const notHis = f.village['village.trade.buy']('zernopolye', 'battle_draught') as R<unknown>;
    const ok34: boolean =
      buy.ok === true &&
      omelet.gateLine === null &&
      goldOf(f) === goldBefore - omelet.price * 2 &&
      boughtQty === 2 &&
      (slice?.trade?.history?.some((h) => h.defId === 'omelet' && h.kind === 'buy' && h.unit === omelet.price && h.qty === 2) ?? false) &&
      !growGate.ok &&
      (growGate as { error: string }).error.includes('нужен уровень репутации') &&
      !battleGate.ok &&
      (battleGate as { error: string }).error.includes('нужен уровень репутации') &&
      !notHis.ok &&
      (notHis as { error: string }).error.includes('не продаёт');
    results.push(
      check(
        'уникальные товары партнёров (G6): покупка village.trade.buy — TransactionService village.trade.buy списал золото РОВНО цена × qty (PriceBus тег trade), выдача каналом inventory.acquire (ролл качества, паттерн магазина C4), история цен пополнилась (buy, unit, qty); гейты репутации текстом «нужен уровень»: Эликсир роста (Поставщик, у Зернополье Знакомый) и Боевой отвар (Знакомый, у Перевала Чужак); «не продаёт» — товар чужого партнёра не купить у другого (уникальность = ровно один продавец)',
        () => ok34,
        {
          expected: 'покупка точна; гейты ×2; не-его товар — отказ',
          actual: `${buy.ok ? 'ok' : 'FAIL'}; ${String(omelet.price)}з ×2, в инвентаре ${boughtQty}; гейты ${!growGate.ok && !battleGate.ok ? 'ok' : 'FAIL'}; чужой ${!notHis.ok ? 'отказ' : 'FAIL'}`,
        },
      ),
    );
    f.dispose();
  }

  // 35. потребитель Рынка: цена ДО/ПОСЛЕ постройки (контраст 5%)
  {
    const f = await makeSeededVillageGame('v163-market');
    openVillageGate(f);
    await raiseVillageToLevel(f, 6, 30); // гейт Рынка — уровень деревни 6
    f.game.wallet.grant('gold', 5000);
    f.game.wallet.grant('planks', 50);
    giveItems(f, 'cloth', 4); // цена L1: 300з + planks 10 + cloth 2
    const before = tradeOf(f);
    const omeletBefore = before.goods.find((g) => g.partnerId === 'zernopolye' && g.defId === 'omelet')!.price;
    const build = f.village['village.build']('market') as R<unknown>;
    hourTickAt(f, f.clock.now() + 11 * 3_600_000); // 10 ч стройки — завершение
    const after = tradeOf(f);
    const omeletAfter = after.goods.find((g) => g.partnerId === 'zernopolye' && g.defId === 'omelet')!.price;
    const applied = after.goods.find((g) => g.partnerId === 'zernopolye' && g.defId === 'omelet')!.applied.join('; ');
    const resolveLine = before.marketDiscount === 0 && after.marketDiscount === 5;
    const priceCut = omeletAfter < omeletBefore && omeletAfter === Math.round(omeletBefore * 0.95);
    const ok35 =
      build.ok &&
      resolveLine &&
      priceCut &&
      applied.includes('Рынок деревни');
    results.push(
      check(
        'потребитель Рынка (G7, [DECISION M163-рынок]): до постройки — resolve village.market.discountPercent = 0, цена омлета у Зернополья базовая; постройка Рынка L1 (гейт уровня 6 — честный XP-путь поставками; TransactionService village.build + 10 ч hourTick) → resolve = 5 И цена ТОЙ ЖЕ сделки ДНЯ ниже ровно на 5% (discountLocal в buyPrice: round(X × 0.95)); расшифровка витрины несёт «Рынок деревни −5%» — ПОВОД M16.2 «резолв-без-потребителя» закрыт: потребитель = цены биржи',
        () => ok35,
        {
          expected: '0 → 5; цена −5% точно; расшифровка с Рынком',
          actual: `resolve ${before.marketDiscount} → ${after.marketDiscount}; цена ${omeletBefore} → ${omeletAfter} (×0.95 = ${Math.round(omeletBefore * 0.95)}); расшифровка ${applied.includes('Рынок деревни') ? 'ok' : 'FAIL'}`,
        },
      ),
    );
    f.dispose();
  }

  // 36. roundtrip + ленивость + история/реролл оракулы + пост-wipe тишина
  {
    const f = await makeSeededVillageGame('v163-round');
    openVillageGate(f);
    const lazy = await readVillageSlice(f); // гейт открыт, биржи не касались
    fulfillToday(f, 'lesnaya_zastava'); // торговля: контракты + репутация + история
    const buy = f.village['village.trade.buy']('zernopolye', 'omelet', 1) as R<unknown>;
    // чистые оракулы буфера/реролла: кап истории + маркеры fulfilled живы
    const mkHistory = (n: number) =>
      Array.from({ length: n }, (_, i) => ({ day: '2026-10-01', defId: 'wool', kind: 'contract' as const, unit: i + 1, qty: 1 }));
    const big: VillageState = {
      v: 1,
      unlocked: true,
      xp: 0,
      villagers: {},
      helpLastDay: null,
      trade: { day: '2026-10-28', contracts: {}, trends: {}, fulfilled: { lesnaya_zastava: '2026-10-28' }, history: mkHistory(60), rerolls: 0 },
    };
    const pushed = pushHistory(big, VILLAGE_TRADE, { day: '2026-10-28', defId: 'truffle', kind: 'contract', unit: 9, qty: 1 });
    const rerolled = rerollTradeDay(big, VILLAGE_TRADE, { saveId: () => 's' }, '2026-10-29');
    const capOk =
      pushed.trade!.history.length === 60 &&
      pushed.trade!.history[0]!.defId === 'wool' &&
      pushed.trade!.history[0]!.unit === 2 && // самая старая вытеснена
      pushed.trade!.history[59]!.defId === 'truffle' &&
      Object.keys(pushed.trade!.fulfilled).length === 1 && // реролл маркеры НЕ трогает
      rerolled.trade!.day === '2026-10-29' &&
      Object.keys(rerolled.trade!.fulfilled).length === 1;
    await f.game.save.save();
    const raw1 = JSON.stringify((JSON.parse((await f.storage.get('main')) as string) as { modules: Record<string, unknown> }).modules['village']);
    f.dispose();
    const f2 = await makeVillageGame(f.storage);
    const raw2 = JSON.stringify((JSON.parse((await f.storage.get('main')) as string) as { modules: Record<string, unknown> }).modules['village']);
    await f2.game.save.save();
    const raw3 = JSON.stringify((JSON.parse((await f.storage.get('main')) as string) as { modules: Record<string, unknown> }).modules['village']);
    const full = await readVillageSlice(f2);
    const silent = await makeSeededVillageGame('v163-silent'); // чистая игра
    const silentSlice = await readVillageSlice(silent);
    const ok36 =
      lazy?.trade === undefined &&
      lazy?.reputation === undefined &&
      buy.ok &&
      capOk &&
      full?.trade?.day === localDateISO(VILLAGE_T0) &&
      full?.trade?.contracts?.lesnaya_zastava !== undefined &&
      full?.trade?.fulfilled?.lesnaya_zastava === full?.trade?.day &&
      full?.trade?.history !== undefined &&
      full?.trade?.history.length >= 2 &&
      full?.reputation?.lesnaya_zastava?.points === 4 &&
      raw1 === raw2 &&
      raw2 === raw3 &&
      silentSlice === undefined;
    results.push(
      check(
        'roundtrip + ленивость (G2/G9): гейт открыт БЕЗ биржи — ключей trade/reputation НЕТ; после контракта+покупки срез несёт trade (day/contracts/trends/fulfilled/history/rerolls) и reputation (points); чистые оракулы: история — кольцевой буфер 60 (push на полном вытесняет старейшую), реролл дня маркеры fulfilled НЕ трогает; сейв → загрузка → повторная запись — срез village байт-в-байт (v1 = v2 = v3, канонический порядок = контент); пост-wipe тишина: чистая игра — ключа village НЕТ',
        () => ok36,
        {
          expected: 'лениво → материализовано → байт-в-байт; кап 60; тишина',
          actual: `lazy ${lazy?.trade === undefined ? 'чист' : 'ЕСТЬ'}; история ${String(full?.trade?.history?.length)}; кап ${capOk ? 'ok' : 'FAIL'}; ${raw1 === raw2 && raw2 === raw3 ? 'roundtrip ok' : 'FAIL'}; wipe ${silentSlice === undefined ? 'тихо' : 'ЕСТЬ КЛЮЧ'}`,
        },
      ),
    );
    f2.dispose();
    silent.dispose();
  }

  return results;
}
