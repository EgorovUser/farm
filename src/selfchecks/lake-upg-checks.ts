/**
 * Self-checks M08 «Озеро» — часть 2a (сеанс M08.2: улучшения F10–F13).
 * Оракулы руками (без ожиданий). Расщепление по 01 §6 (группа растёт).
 *
 * Покрытие (бриф §2.3): витрина улучшений ×7 (цены = данным поимённо);
 * покупка/повторная покупка/кошелёк (tx lake.upgrade); Подогреватель (вода
 * 15 → 25, тёплая группа период ×0.75 — Линь 36ч → 27ч; холодолюбивая
 * Форель — блок с гейт-причиной текстом); Инкубатор (окна +1 = 0.79 —
 * маппинг 0.80 → +1 с ним / +0 без; кап X = 40 → 0.49; +2 НЕ инфлируется;
 * кросс-окно без бонуса = pen; ЖИВОЙ резолв шины с тегом lake:0 = 10);
 * Аэратор (дрейф −2/день с ним / −5 без — dayPass-серии); Автокормушка
 * (расход ровно ×N, eventId lake.feed; нехватка — не кормит/событий нет;
 * порядок dayTick — кормление ДО разведения: сытая пара образуется тем же
 * тиком); Лаборатория (отказ без покупки; кулдаун 24ч; плюс1 ремап [0.89,1]
 * → бонус ≥ 1; плюс2 — гарантированный +2, потребление следующей икрой,
 * mode снимается; форс НЕ инфлируется Инкубатором — сценарий X=40 + plus2).
 */
import { LAKE_TABLE } from '@/content/balance/lake';
import { LAKE_UPGRADES } from '@/content/lake/upgrades';
import { POND_FISH } from '@/content/fishing/fish';
import { windowsWithBonus, mutationBonusOf, researchRemap, formPairsPass, warmFactorOf } from '@/game/modules/lake/logic/breeding';
import { mutationBonusOf as penMutationBonusOf } from '@/game/modules/pen/logic/breeding';
import { requirementsMet, requirementsText } from '@/game/modules/lake/logic/water';
import { lakeTagOf } from '@/game/modules/lake/logic/upgrades-provider';
import { check, type CheckResult } from './types';
import {
  LAKE_T0,
  LAKE_DAY,
  LAKE_HOUR,
  dayPass,
  eventsOf,
  giveFish,
  hourPass,
  lakeView,
  lastRollOf,
  makeSeededLakeGame,
  type R,
} from './lake-fixture';

const HOUR = LAKE_HOUR;

/** цены ×7 поимённо (бриф F10 [DECISION-сетка]) */
const PRICE_GRID: Record<string, number> = {
  upg_aerator: 150,
  upg_heater: 200,
  upg_autofeeder: 250,
  upg_incubator: 400,
  upg_deep_water: 500,
  upg_laboratory: 600,
  upg_lake2: 1200,
};

export async function runLakeUpgChecks(): Promise<CheckResult[]> {
  const results: CheckResult[] = [];

  // ------------------------------------------------ 20. F10: витрина ×7 + покупка + повтор
  {
    const f = await makeSeededLakeGame('m082-upgrades-shop');
    f.game.wallet.grant('gold', 5000);
    const view0 = f.lake['lake.upgrade']() as { rows: Array<{ id: string; price: number; bought: boolean; name: string }> };
    const buy = f.lake['lake.upgrade']('upg_aerator') as R<{ name: string; price: number }>;
    const again = f.lake['lake.upgrade']('upg_aerator') as R<unknown>;
    const bogus = f.lake['lake.upgrade']('upg_nonsense') as R<unknown>;
    const view1 = f.lake['lake.upgrade']() as { rows: Array<{ id: string; bought: boolean }> };
    results.push(
      check('улучшения F10: витрина ×7 поимённо (Аэратор 150/Подогреватель 200/Автокормушка 250/Инкубатор 400/«Глубоководье» 500/Лаборатория 600/«Второе озеро» 1200 = данным); покупка Аэратора — кошелёк −150 (tx lake.upgrade), витрина bought; повторная покупка — честный отказ; неизвестный id — отказ', () =>
        view0.rows.length === 7 &&
        LAKE_UPGRADES.every((u) => view0.rows.find((r) => r.id === u.id)?.price === PRICE_GRID[u.id]) &&
        buy.ok && buy.value.price === 150 && f.game.wallet.get('gold') === 4850 &&
        !again.ok && again.error.includes('уже куплено') &&
        !bogus.ok && bogus.error.includes('не найдено') &&
        view1.rows.find((r) => r.id === 'upg_aerator')?.bought === true, {
        expected: '×7 / −150з / отказы живы / bought',
        actual: `витрина ${view0.rows.length}; buy ${buy.ok}; gold ${f.game.wallet.get('gold')}; повтор ${again.ok}; bogus ${bogus.ok}`,
      }),
    );
    f.dispose();
  }

  // ------------------------------------------------ 21. F11: Подогреватель — вода + тёплая группа + холодный блок
  {
    const f = await makeSeededLakeGame('m082-heater');
    f.game.wallet.grant('gold', 1000);
    const before = lakeView(f).water.temperature;
    const buy = f.lake['lake.upgrade']('upg_heater') as R<unknown>;
    const after = lakeView(f).water.temperature;
    // Линь {10–35} uncommon 36ч: вода 25 ≥ 20 (threshold) и tempMin 10 ≥ 10 → ×0.75 → 27ч
    const tench = POND_FISH.find((p) => p.id === 'tench')!;
    const warm = warmFactorOf(tench.lakeRequirements, { temperature: after, cleanliness: 70 }, LAKE_TABLE);
    const synthTench = {
      slots: [
        { fishId: 'tench', quality: 'C' as const, fedAt: LAKE_T0, sick: false, bornAt: LAKE_T0 },
        { fishId: 'tench', quality: 'C' as const, fedAt: LAKE_T0, sick: false, bornAt: LAKE_T0 },
      ],
      water: { temperature: after, cleanliness: 70 },
      roe: [],
      stats: { released: 2, bred: 0, harvested: 0 },
    };
    const formed = formPairsPass(synthTench, { now: LAKE_T0, table: LAKE_TABLE, fishOf: (id) => (id === 'tench' ? tench : undefined) });
    // Форель {0–20}: 25 > tempMax → условия-блок, гейт-причина текстом
    const trout = { id: 'trout', name: 'Форель', rarity: 'rare', lakeRequirements: { tempMin: 0, tempMax: 20, cleanlinessMin: 30 } };
    const troutOk = requirementsMet(trout.lakeRequirements!, { temperature: after, cleanliness: 70 });
    const troutText = requirementsText(trout.lakeRequirements!, { temperature: after, cleanliness: 70 });
    results.push(
      check('Подогреватель F11: покупка — вода 15 → 25 (кап 100, навсегда); тёплая группа (правило ДАННЫМИ warmBreeding: вода ≥ 20 + tempMin ≥ 10) — период Линя 36ч × 0.75 = 27ч (dueAt = +27ч); холодолюбивая Форель {0–20} — условия-блок (икры нет) с гейт-причиной ТЕКСТОМ «температура 0–20 (сейчас 25 — жарко)» — био-конфликт §5, блок сильнее карточного «inc −25%» [DECISION-интерпретация]', () =>
        before === 15 && buy.ok && after === 25 &&
        warm === 0.75 && formed.formed.length === 1 &&
        Math.abs(formed.formed[0]!.dueAt - (LAKE_T0 + 27 * HOUR)) < 1 &&
        !troutOk && troutText !== null && troutText.includes('жарко'), {
        expected: '15→25; ×0.75 → +27ч; Форель блок «жарко»',
        actual: `${before}→${after}; warm ${warm}; dueAt +${(formed.formed[0] ? (formed.formed[0].dueAt - LAKE_T0) / HOUR : 0)}ч; Форель ${troutOk} (${troutText})`,
      }),
    );
    f.dispose();
  }

  // ------------------------------------------------ 22. F11: Инкубатор — окна/кап/+2/кросс (юнит-оракулы)
  {
    const w10 = windowsWithBonus(LAKE_TABLE, 10);
    const w40 = windowsWithBonus(LAKE_TABLE, 40);
    const base = { plus1From: 0.89, plus2From: 0.99 };
    results.push(
      check('Инкубатор F11: окно +1 = 0.79 при X=10 (маппинг 0.80 → +1 с ним / +0 без бонуса); кап X=40 → plus1From 0.49 (0.50 → +1); +2 НЕ инфлируется (0.985 при X=40 → +1, plus2From 0.99 неподвижен); кросс-окно без бонуса = pen (0.89/0.99 — ЕДИНАЯ формула)', () =>
        Math.abs(w10.plus1From - 0.79) < 1e-9 && w10.plus2From === 0.99 &&
        mutationBonusOf(0.80, w10) === 1 && mutationBonusOf(0.80, base) === 0 &&
        Math.abs(w40.plus1From - 0.49) < 1e-9 && mutationBonusOf(0.50, w40) === 1 &&
        mutationBonusOf(0.985, w40) === 1 &&
        base.plus1From === 0.89 && penMutationBonusOf(0.889) === 0 && penMutationBonusOf(0.89) === 1, {
        expected: '0.79/0.49; +2 = 1% всегда; кросс = pen',
        actual: `w10 ${w10.plus1From.toFixed(2)}/w40 ${w40.plus1From.toFixed(2)}; 0.80→${mutationBonusOf(0.80, w10)}/база→${mutationBonusOf(0.80, base)}; 0.985@40→${mutationBonusOf(0.985, w40)}`,
      }),
    );
  }

  // ------------------------------------------------ 23. F11: Инкубатор ЖИВОЙ резолв шины (провайдер, тег озера)
  {
    const f = await makeSeededLakeGame('m082-incubator-live');
    f.game.wallet.grant('gold', 1000);
    const before = f.game.statBus.resolve({ stat: 'lake.mutation.plus1Bonus', ctx: { ...f.game.time.ctx('player'), tags: [lakeTagOf(0)] } });
    f.lake['lake.upgrade']('upg_incubator') as R<unknown>;
    f.game.statBus.clearCache(); // кэш резолва — до конца тика (02 §3)
    const after = f.game.statBus.resolve({ stat: 'lake.mutation.plus1Bonus', ctx: { ...f.game.time.ctx('player'), tags: [lakeTagOf(0)] } });
    const noTag = f.game.statBus.resolve({ stat: 'lake.mutation.plus1Bonus', ctx: f.game.time.ctx('player') });
    results.push(
      check('Инкубатор F11 — ЖИВОЙ путь шины: провайдер lake.upgrades (манифест 1.1.0) даёт flat +10 к lake.mutation.plus1Bonus ТОЛЬКО в контексте озера (тег lake:0): до 0 → после 10; без тега — 0 (эффекты локальны озеру, пер-озёрность F14); кап X ≤ 40 — cap-мод провайдера (данные plusBonusCap)', () =>
        before === 0 && after === 10 && noTag === 0 && LAKE_TABLE.breeding.mutation.plusBonusCap === 40, {
        expected: '0 → 10 (тег lake:0); без тега 0; кап 40',
        actual: `${before} → ${after}; без тега ${noTag}`,
      }),
    );
    f.dispose();
  }

  // ------------------------------------------------ 24. F11: Аэратор — дрейф −2/день (dayPass-серии)
  {
    const withA = await makeSeededLakeGame('m082-aerator-on');
    withA.game.wallet.grant('gold', 500);
    withA.lake['lake.upgrade']('upg_aerator') as R<unknown>;
    const c0 = lakeView(withA).water.cleanliness;
    dayPass(withA, LAKE_T0 + LAKE_DAY);
    dayPass(withA, LAKE_T0 + 2 * LAKE_DAY);
    const c2 = lakeView(withA).water.cleanliness;
    withA.dispose();
    const without = await makeSeededLakeGame('m082-aerator-off');
    const d0 = lakeView(without).water.cleanliness;
    dayPass(without, LAKE_T0 + LAKE_DAY);
    dayPass(without, LAKE_T0 + 2 * LAKE_DAY);
    const d2 = lakeView(without).water.cleanliness;
    results.push(
      check('Аэратор F11: дрейф чистоты −2/день с ним (70 → 68 → 66 за 2 dayTick); без — −5/день (70 → 65 → 60): «замедляет по формуле данных» (карточка §7, эффект данных −2)', () =>
        c0 === 70 && c2 === 66 && d0 === 70 && d2 === 60, {
        expected: 'с Аэратором 66; без 60',
        actual: `${c0} → ${c2} (с); ${d0} → ${d2} (без)`,
      }),
    );
    without.dispose();
  }

  return results;
}
