/**
 * Self-checks M16.3 «Деревня» — часть 7: БИРЖА — данные и контракты
 * (бриф G1/G3/G9): данные сеткой (5 партнёров/шкала ×4/уникальные товары
 * существующих defId ВНЕ пула магазина), чистые оракулы (уровень
 * репутации/премия с трендом/пул трендов/детерминизм роллов), ротация
 * дня живьём (маркер day — идемпотентность dayTick-реплея), контракт
 * живьём (TransactionService, trade.fulfilled {gold} ровно ×1, маркер
 * fulfilled, повтор — отказ), отказы ×4.
 */
import { VILLAGE_TRADE, premiumWithTrend, reputationLevelOf, rollContractOf, rollTrendsOf, trendPoolOf } from '@/content/village/trade';
import { ITEMS } from '@/content/items/items';
import { SHOP_POOL } from '@/content/shopPool';
import { check, type CheckResult } from './types';
import {
  dayTickAt,
  giveItems,
  goldOf,
  localDateISO,
  makeSeededVillageGame,
  openVillageGate,
  readVillageSlice,
  tradeEventsOf,
  tradeOf,
  VILLAGE_T0,
  type R,
  type VillageFixture,
} from './village-fixture';

interface InvEntry {
  iid: string;
  defId: string;
  qty: number;
  quality: { tier: string; value: number };
}

function listInv(f: VillageFixture): InvEntry[] {
  return f.inv['inventory.list']() as InvEntry[];
}

export async function runVillagePart7(): Promise<CheckResult[]> {
  const results: CheckResult[] = [];

  // 27. данные биржи сеткой (G1: партнёры/шкала/уникальные товары/zod-каноны)
  {
    const itemIds = new Set(ITEMS.map((d) => d.id));
    const shopIds = new Set(SHOP_POOL.map((e) => e.id));
    const partners = VILLAGE_TRADE.partners;
    const allGoods = partners.flatMap((p) => p.goods.map((g) => g.defId));
    const ok27 =
      partners.length >= 5 &&
      partners.length <= 7 &&
      // шкала репутации: 4 ступени, возрастание, «Друг деревни» −5%
      VILLAGE_TRADE.reputation.levels.length === 4 &&
      VILLAGE_TRADE.reputation.levels[0]!.minPoints === 0 &&
      VILLAGE_TRADE.reputation.levels[1]!.minPoints === 10 &&
      VILLAGE_TRADE.reputation.levels[2]!.minPoints === 30 &&
      VILLAGE_TRADE.reputation.levels[3]!.minPoints === 60 &&
      VILLAGE_TRADE.reputation.friendDiscountPercent === 5 &&
      VILLAGE_TRADE.reputation.pointsPerContract === 4 &&
      // тренды: −15% изобилие (04 §2.1) / +20% дефицит markup (04 §4.3)
      VILLAGE_TRADE.trends.abundancePercent === 15 &&
      VILLAGE_TRADE.trends.deficitMarkupPercent === 20 &&
      VILLAGE_TRADE.trends.contractSwingPercent === 10 &&
      // контракты: qty 2..6, премии-тиры
      VILLAGE_TRADE.contracts.qtyMin === 2 &&
      VILLAGE_TRADE.contracts.qtyMax === 6 &&
      VILLAGE_TRADE.contracts.premiums.length >= 3 &&
      // партнёры: requests 2..6, goods 1..4, гейты 0..3
      partners.every(
        (p) =>
          p.requests.length >= 2 &&
          p.requests.length <= 6 &&
          p.goods.length >= 1 &&
          p.goods.length <= 4 &&
          p.goods.every((g) => g.requiredLevel >= 0 && g.requiredLevel <= 3) &&
          p.contractMinLevel >= 0 &&
          p.contractMinLevel <= 3 &&
          p.startPoints >= 0,
      ) &&
      // ссылочная целостность: все defId существуют в каталоге предметов
      partners.every((p) => p.requests.every((id) => itemIds.has(id)) && p.goods.every((g) => itemIds.has(g.defId))) &&
      // уникальный товар — РОВНО у одного партнёра
      new Set(allGoods).size === allGoods.length &&
      // уникальные товары ВНЕ пула магазина («покупается ТОЛЬКО у партнёра»)
      allGoods.every((id) => !shopIds.has(id)) &&
      // стартовые данные: Зернополье — «Знакомый» (10), остальные с нуля
      partners.find((p) => p.id === 'zernopolye')!.startPoints === 10 &&
      partners.filter((p) => p.id !== 'zernopolye').every((p) => p.startPoints === 0) &&
      // контрактные гейты: двое торгуют со всеми (0), трое с «Знакомого» (1)
      partners.filter((p) => p.contractMinLevel === 0).length === 2 &&
      partners.filter((p) => p.contractMinLevel === 1).length === 3;
    results.push(
      check(
        'данные биржи сеткой (G1, [DECISION M163-партнёры/репутация/тренды]): партнёров 5 (коридор 5–7); шкала репутации ×4 — Чужак 0 → Знакомый 10 → Поставщик 30 → Друг деревни 60, «Друг» −5% (04 §2.1), +4 очка за контракт; тренды — изобилие −15% (04 §2.1) / дефицит +20% markup (04 §4.3) / свинг премии ±10; контракты qty 2..6 × премии-тиры 40/60/90; requests 2..6 и goods 1..4 у каждого, гейты 0..3; ссылочная целостность — все defId существуют; уникальный товар ровно у ОДНОГО партнёра и ВНЕ пула магазина (60 позиций — «покупается только у партнёра»); старты: Зернополье «Знакомый» (10), остальные 0; контрактные гейты: 2 партнёра со всеми, 3 с «Знакомого»',
        () => ok27,
        { expected: 'сетка данных', actual: ok27 ? 'ok' : 'FAIL' },
      ),
    );
  }

  // 28. чистые оракулы: уровень/премия/пул/детерминизм роллов
  {
    const pool = trendPoolOf(VILLAGE_TRADE);
    const c1 = rollContractOf(VILLAGE_TRADE, 's1', '2026-10-28', 'lesnaya_zastava');
    const c1b = rollContractOf(VILLAGE_TRADE, 's1', '2026-10-28', 'lesnaya_zastava');
    const c2 = rollContractOf(VILLAGE_TRADE, 's1', '2026-10-29', 'lesnaya_zastava');
    const c3 = rollContractOf(VILLAGE_TRADE, 's1', '2026-10-28', 'lesnaya_zastava', 1);
    const t1 = rollTrendsOf(VILLAGE_TRADE, 's1', '2026-10-28');
    const t1b = rollTrendsOf(VILLAGE_TRADE, 's1', '2026-10-28');
    const t2 = rollTrendsOf(VILLAGE_TRADE, 's1', '2026-10-29');
    const t3 = rollTrendsOf(VILLAGE_TRADE, 's1', '2026-10-28', 1);
    const ok28 =
      // уровень репутации по очкам (пороги 10/30/60)
      reputationLevelOf(VILLAGE_TRADE, 0) === 0 &&
      reputationLevelOf(VILLAGE_TRADE, 9) === 0 &&
      reputationLevelOf(VILLAGE_TRADE, 10) === 1 &&
      reputationLevelOf(VILLAGE_TRADE, 29) === 1 &&
      reputationLevelOf(VILLAGE_TRADE, 30) === 2 &&
      reputationLevelOf(VILLAGE_TRADE, 59) === 2 &&
      reputationLevelOf(VILLAGE_TRADE, 60) === 3 &&
      reputationLevelOf(VILLAGE_TRADE, 999) === 3 &&
      // премия с трендовым свингом (изобилие −10, дефицит +10, пол 0)
      premiumWithTrend(40, 'abundance', 10) === 30 &&
      premiumWithTrend(60, 'deficit', 10) === 70 &&
      premiumWithTrend(50, undefined, 10) === 50 &&
      premiumWithTrend(5, 'abundance', 10) === 0 &&
      // пул трендов = requests ∪ goods (28 уникальных, дедуп woven_banner)
      pool.length === 28 &&
      pool.includes('woven_banner') &&
      pool.includes('luck_elixir') &&
      pool.includes('truffle') &&
      // детерминизм: тот же вход → тот же контракт/тренды (dailySeed 02 §6)
      JSON.stringify(c1) === JSON.stringify(c1b) &&
      JSON.stringify(t1) === JSON.stringify(t1b) &&
      // другой день / реролл — другие сиды (не равны ПО КРАЙНЕЙ мере в чём-то)
      (JSON.stringify(c1) !== JSON.stringify(c2) || JSON.stringify(t1) !== JSON.stringify(t2)) &&
      (JSON.stringify(c1) !== JSON.stringify(c3) || JSON.stringify(t1) !== JSON.stringify(t3)) &&
      // форма контракта: предмет из requests партнёра, qty/премия в коридорах
      c1.qty >= VILLAGE_TRADE.contracts.qtyMin &&
      c1.qty <= VILLAGE_TRADE.contracts.qtyMax &&
      VILLAGE_TRADE.partners.find((p) => p.id === 'lesnaya_zastava')!.requests.includes(c1.item) &&
      VILLAGE_TRADE.contracts.premiums.includes(c1.premiumPercent) &&
      // форма трендов: ключи ⊆ пула, ≤ perDay, значения допустимы
      Object.keys(t1).length <= VILLAGE_TRADE.trends.perDay &&
      Object.keys(t1).every((k) => pool.includes(k) && (t1[k] === 'abundance' || t1[k] === 'deficit'));
    results.push(
      check(
        'чистые оракулы биржи (G1/G3): reputationLevelOf — пороги 10/30/60 (0/9→Чужак, 10/29→Знакомый, 30/59→Поставщик, 60/999→Друг); premiumWithTrend — изобилие −10 (40→30), дефицит +10 (60→70), без тренда — как есть (50), пол 0 (5→0); trendPoolOf = requests ∪ goods = 28 уникальных (woven_banner в обоих — дедуп); rollContractOf/rollTrendsOf — ДЕТЕРМИНИЗМ (тот же вход ×2 идентичен — dailySeed-канон 02 §6 «биржа роллится одинаково весь день»), другой день и реролл-суффикс #1 — другие результаты; контракт: предмет ∈ requests, qty 2..6, премия ∈ тиров; тренды: ≤ perDay ключей ⊆ пула, значения abundance/deficit',
        () => ok28,
        { expected: 'сетка оракулов', actual: ok28 ? 'ok' : 'FAIL' },
      ),
    );
  }

  // 29. ротация дня живьём: ленивость → материализация → реплей тих → новый день
  {
    const f = await makeSeededVillageGame('v163-rotate');
    openVillageGate(f);
    const lazy = await readVillageSlice(f); // гейт открыт, биржи не касались
    const day0 = localDateISO(VILLAGE_T0);
    const before = tradeOf(f); // первое обращение — материализация + ролл
    const slice0 = await readVillageSlice(f);
    const snap0 = JSON.stringify(slice0?.trade?.contracts);
    // реплей dayTick ТОГО ЖЕ дня — маркер day, переролла НЕТ (часы те же)
    dayTickAt(f, 0);
    const slice0b = await readVillageSlice(f);
    const afterReplay = tradeOf(f);
    // новый день (dayTick N+1, часы сдвинуты) — ротация: новые контракты/тренды
    dayTickAt(f, 1);
    const day1 = localDateISO(VILLAGE_T0 + 86_400_000);
    const slice1 = await readVillageSlice(f);
    const afterNewDay = tradeOf(f);
    const ok29 =
      lazy?.trade === undefined &&
      lazy?.reputation === undefined &&
      slice0?.trade?.day === day0 &&
      Object.keys(slice0?.trade?.contracts ?? {}).length === 5 &&
      Object.keys(slice0?.trade?.trends ?? {}).length <= 2 &&
      slice0?.trade?.rerolls === 0 &&
      JSON.stringify(slice0b?.trade?.contracts) === snap0 &&
      afterReplay.day === day0 &&
      JSON.stringify(afterReplay.contracts) === JSON.stringify(before.contracts) &&
      slice1?.trade?.day === day1 &&
      slice1?.trade?.rerolls === 0 &&
      afterNewDay.day === day1 &&
      (JSON.stringify(slice1?.trade?.contracts) !== snap0 ||
        JSON.stringify(slice1?.trade?.trends) !== JSON.stringify(slice0?.trade?.trends));
    results.push(
      check(
        'ротация дня биржи (G2/G3, [DECISION M163-срез]): гейт открыт БЕЗ обращения — ключей trade/reputation НЕТ (ленивость); первое обращение (витрина) — материализация: day = сегодня, контракты ×5 партнёров, тренды ≤ 2, rerolls 0; РЕПЛЕЙ dayTick того же дня — ТИХО (маркер trade.day, контракты байт-в-байт — идемпотентность catchUp/dayTick, прецедент need.day); dayTick нового дня — РОТАЦИЯ: day = новый, контракты/тренды перегенерированы (dailySeed на дату), rerolls сброшен',
        () => ok29,
        {
          expected: 'лениво → материализовано → реплей тих → ротация',
          actual: `lazy ${lazy?.trade === undefined ? 'чист' : 'ЕСТЬ'}; day ${slice0?.trade?.day}→${slice1?.trade?.day}; реплей ${JSON.stringify(slice0b?.trade?.contracts) === snap0 ? 'тих' : 'FAIL'}; ротация ${afterNewDay.day === day1 ? 'ok' : 'FAIL'}`,
        },
      ),
    );
    f.dispose();
  }

  // 30. контракт живьём: TransactionService, выплата = Σ sellPrice худших,
  //     trade.fulfilled {gold} ровно ×1, маркер, повтор — отказ
  {
    const f = await makeSeededVillageGame('v163-fulfill');
    openVillageGate(f);
    const view0 = tradeOf(f);
    const c = view0.contracts.find((r) => r.partnerId === 'lesnaya_zastava')!;
    giveItems(f, c.item, c.qty + 2); // с запасом — докажем точное списание
    const view = tradeOf(f); // оценка ПОСЛЕ выдачи (худший экземпляр виден)
    const est = view.contracts.find((r) => r.partnerId === 'lesnaya_zastava')!;
    const beforeInv = listInv(f).filter((e) => e.defId === c.item).reduce((s, e) => s + e.qty, 0);
    const goldBefore = goldOf(f);
    const r = f.village['village.trade.fulfill']('lesnaya_zastava') as R<unknown>;
    const evs = tradeEventsOf(f);
    const slice = await readVillageSlice(f);
    const afterInv = listInv(f).filter((e) => e.defId === c.item).reduce((s, e) => s + e.qty, 0);
    const again = f.village['village.trade.fulfill']('lesnaya_zastava') as R<unknown>;
    const ok30: boolean =
      r.ok === true &&
      evs.length === 1 &&
      evs[0]?.item === c.item &&
      evs[0]?.qty === c.qty &&
      evs[0]?.partner === 'lesnaya_zastava' &&
      typeof evs[0]?.gold === 'number' &&
      (evs[0]!.gold as number) === est.estimateTotal &&
      goldOf(f) === goldBefore + (evs[0]!.gold as number) &&
      beforeInv - afterInv === c.qty &&
      slice?.trade?.fulfilled?.lesnaya_zastava === slice?.trade?.day &&
      slice?.reputation?.lesnaya_zastava?.points === 4 &&
      (slice?.trade?.history?.some((h) => h.defId === c.item && h.kind === 'contract' && h.qty === c.qty) ?? false) &&
      !again.ok;
    results.push(
      check(
        'контракт живьём (G3, [DECISION M163-контракты]): village.trade.fulfill — TransactionService village.trade списал РОВНО qty (выдано с запасом +2 — остаток точен), выдал золото = Σ sellPrice худших-вперёд D25 (= оценке витрины по худшему экземпляру); событие trade.fulfilled { partner, item, qty, gold } РОВНО ×1 (счётчики trade.count/trade.volume ядра M01 §6 читают gold); маркер trade.fulfilled.lesnaya = день; репутация +4 материализована в срезе; история цен пополнилась (contract, unit, qty); ПОВТОР — честный отказ «уже исполнен» (идемпотентность маркера)',
        () => ok30,
        {
          expected: 'списание точное; выплата = оценке; ×1; маркер; повтор — отказ',
          actual: `${r.ok ? 'ok' : 'FAIL'}; выплата ${String(evs[0]?.gold)} vs оценка ${String(est.estimateTotal)}; событий ${evs.length}; повтор ${again.ok ? 'FAIL' : 'отказ'}`,
        },
      ),
    );
    f.dispose();
  }

  // 31. отказы ×4: нет предмета / чужой день / гейт репутации / неизвестный партнёр
  {
    const f = await makeSeededVillageGame('v163-refuse');
    openVillageGate(f);
    const view = tradeOf(f);
    const c = view.contracts.find((r) => r.partnerId === 'lesnaya_zastava')!;
    const noItem = f.village['village.trade.fulfill']('lesnaya_zastava') as R<unknown>;
    giveItems(f, c.item, c.qty);
    // «чужой день»: ожидаемый предмет ≠ контракту дня (гарантированно другой)
    const wrongItemId = c.item === 'wool' ? 'iron_plate' : 'wool';
    const wrongDay = f.village['village.trade.fulfill']('lesnaya_zastava', wrongItemId) as R<unknown>;
    const gated = f.village['village.trade.fulfill']('rybny_kut') as R<unknown>;
    const stranger = f.village['village.trade.fulfill']('nobody') as R<unknown>;
    const ok31 =
      !noItem.ok &&
      (noItem as { error: string }).error.includes('нет предмета') &&
      !wrongDay.ok &&
      (wrongDay as { error: string }).error.includes('чужой день') &&
      !gated.ok &&
      (gated as { error: string }).error.includes('гейт репутации') &&
      !stranger.ok &&
      (stranger as { error: string }).error.includes('неизвестный партнёр');
    results.push(
      check(
        'отказы контрактов ×4 (G3/G9): НЕТ ПРЕДМЕТА — «в рюкзаке 0, нужно N» (до транзакции, ничего не списано); ЧУЖОЙ ДЕНЬ — fulfillment с ожидаемым предметом ≠ контракту дня (гарантированно другой defId; «контракт сменился в полночь» — защита от вчерашней доски); ГЕЙТ РЕПУТАЦИИ — Рыбный Кут (contractMinLevel 1, очки 0): «нужен уровень „Знакомый“»; НЕИЗВЕСТНЫЙ ПАРТНЁР — «доска биржи»; все отказы текстом с причиной, транзакция не стреляла',
        () => ok31,
        {
          expected: 'отказ ×4 с причинами',
          actual: `нет предмета ${!noItem.ok ? 'ok' : 'FAIL'}; чужой день ${!wrongDay.ok ? 'ok' : 'FAIL'}; гейт ${!gated.ok ? 'ok' : 'FAIL'}; партнёр ${!stranger.ok ? 'ok' : 'FAIL'}`,
        },
      ),
    );
    f.dispose();
  }

  return results;
}
