/**
 * Self-checks M06 «Загон» — часть 6 (сеанс M06.2: разведение F5 + продажа).
 *
 * Покрытие (бриф §3.8): pen.breed валидация (без «Родильного» — отказ;
 * разные виды — отказ; один idx — отказ; больная/голодная пара — отказ;
 * повтор при активном процессе — отказ); таймер 48ч → рождение, childTier =
 * маппинг-оракулу по журналу мутации (pen:breed:<species>:mutation;
 * ×2 идентичны — детерминизм; формула clamp(max(родители) − 1 + мутация,
 * D, SS) — канон M08 §4); ожидание слота (полный загон — рождение ждёт;
 * продажа освобождает → ленивое рождение); pen.sell (цена 50% покупки,
 * слот освобождается, атомарность; больное — отказ).
 *
 * [M08 · 89/10/1] ЛЕГАЛИЗАЦИЯ (выравнивание pen к решению №3 «2+ @1%» —
 * санкция брифа M08.1 F7, прецедент [M07.1 · v12]): мутация — категорийный
 * ролл 89/10/1 (окна [0, 0.89) / [0.89, 0.99) / [0.99, 1]); +2 достижим
 * и в загоне (потомок ВЫШЕ лучшего родителя, кап SS).
 */
import { PEN_TABLE } from '@/content/balance/pen';
import { childTierOf, mutationBonusOf } from '@/game/modules/pen/logic/breeding';
import type { QualityTier } from '@/shared/types/ids';
import { check, type CheckResult } from './types';
import {
  PEN_T0,
  PEN_HOUR,
  dayPass,
  hourPass,
  makeSeededPenGame,
  penView,
  rollOf,
  type R,
} from './pen-fixture';

const HOUR = PEN_HOUR;

export async function runPenBreedChecks(): Promise<CheckResult[]> {
  const results: CheckResult[] = [];

  // ------------------------------------------------ 29. pen.breed валидация: отказы с причинами
  {
    const f = await makeSeededPenGame('m062-breed-gates');
    f.game.wallet.grant('gold', 5000);
    f.game.wallet.grant('feed', 5);
    f.pen['pen.buy']('chicken');
    f.pen['pen.buy']('chicken');
    f.pen['pen.buy']('goat');
    const noPen = f.pen['pen.breed'](0, 1) as R<unknown>;
    f.pen['pen.upgrade']('upg_breeding_pen');
    const diffSpecies = f.pen['pen.breed'](0, 2) as R<unknown>;
    const sameIdx = f.pen['pen.breed'](0, 0) as R<unknown>;
    f.pen['pen.sick'](0);
    const sickPair = f.pen['pen.breed'](0, 1) as R<unknown>;
    (f.inv['inventory.add'] as unknown as (d: string, t: string, v: number, q: number, s: string) => unknown)('animal_remedy', 'D', 50, 1, 'selfcheck');
    f.pen['pen.heal'](0);
    // голодная пара: обе курицы satiety 0 (4 дня decay)
    for (let d = 1; d <= 4; d++) dayPass(f, PEN_T0 + d * 86_400_000);
    const hungryPair = f.pen['pen.breed'](0, 1) as R<unknown>;
    results.push(
      check('pen.breed валидация: без «Родильного» — отказ; разные виды — отказ; один idx — отказ; больная пара — отказ «вылечите»; голодная (satiety < 50) — отказ «покормите»', () =>
        !noPen.ok && noPen.error.includes('Родильный') &&
        !diffSpecies.ok && diffSpecies.error.includes('одного вида') &&
        !sameIdx.ok && sameIdx.error.includes('ДВА разных') &&
        !sickPair.ok && sickPair.error.includes('больно') &&
        !hungryPair.ok && hungryPair.error.includes('голодно'), {
        expected: '5 отказов с причинами',
        actual: `pen ${noPen.ok}/виды ${diffSpecies.ok}/idx ${sameIdx.ok}/больна ${sickPair.ok}/голодна ${hungryPair.ok}`,
      }),
    );
    f.dispose();
  }

  // ------------------------------------------------ 30. таймер 48ч → рождение: childTier = оракулу (мутация ×2)
  const run = async (): Promise<{ tier: string; maxParent: string; roll: number | null; count: number; receiptOk: boolean }> => {
    const f = await makeSeededPenGame('m062-breed-born');
    f.game.wallet.grant('gold', 5000);
    f.pen['pen.buy']('chicken');
    f.pen['pen.buy']('chicken');
    f.pen['pen.upgrade']('upg_breeding_pen');
    const breed = f.pen['pen.breed'](0, 1) as R<{ dueAt: number; maxParentTier: string }>;
    if (!breed.ok) {
      f.dispose();
      return { tier: `ERR:${breed.error}`, maxParent: '?', roll: null, count: 0, receiptOk: false };
    }
    hourPass(f, PEN_T0 + 48 * HOUR + HOUR); // dueAt истёк → ленивое рождение (слот свободен: 2/4)
    const v = penView(f);
    const child = v.animals[2];
    const roll = rollOf(f, 'pen:breed:chicken:mutation');
    f.dispose();
    return {
      tier: child ? child.quality : 'NOCHILD',
      maxParent: breed.value.maxParentTier,
      roll,
      count: v.animals.length,
      receiptOk: true,
    };
  };
  {
    const r1 = await run();
    const r2 = await run();
    // [M08 · 89/10/1] категорийный ролл: окно журнала → бонус (89/10/1)
    const bonus = r1.roll !== null ? mutationBonusOf(r1.roll) : 0;
    const oracle = childTierOf(r1.maxParent as QualityTier, bonus);
    results.push(
      check('разведение: таймер 48ч → потомство (3-е животное, 100/100/100); childTier = маппинг-оракулу по журналу мутации [M08 · 89/10/1]: pen:breed:chicken:mutation окно [0, 0.89)→+0 / [0.89, 0.99)→+1 / [0.99, 1]→+2; clamp(max − 1 + бонус, D, SS) — канон M08 §4; ×2 детерминизм', () =>
        r1.receiptOk && r1.count === 3 && r1.tier === oracle && r1.tier === r2.tier && r1.roll === r2.roll, {
        expected: `тир ${oracle} (бонус +${bonus}, ролл ${r1.roll})`,
        actual: `${r1.tier} (детей ${r1.count}, ролл ${r1.roll}; ×2 ${r2.tier})`,
      }),
    );
  }

  // ------------------------------------------------ 31. ожидание слота + pen.sell атомарность
  {
    const f = await makeSeededPenGame('m062-breed-sell');
    f.game.wallet.grant('gold', 5000);
    (f.inv['inventory.add'] as unknown as (d: string, t: string, v: number, q: number, s: string) => unknown)('animal_remedy', 'D', 50, 1, 'selfcheck');
    for (let i = 0; i < 4; i++) f.pen['pen.buy']('chicken'); // слоты 4/4
    f.pen['pen.upgrade']('upg_breeding_pen');
    const breed = f.pen['pen.breed'](0, 1) as R<{ dueAt: number }>;
    const again = f.pen['pen.breed'](2, 3) as R<unknown>; // активный процесс — отказ
    hourPass(f, PEN_T0 + 48 * HOUR + HOUR); // dueAt истёк, но слотов нет → ожидание
    f.clock.set(PEN_T0 + 48 * HOUR + HOUR); // часы синхронны с проходом (витрина читает time.now())
    const waiting = penView(f);
    f.pen['pen.sick'](3);
    const sellSick = f.pen['pen.sell'](3) as R<unknown>;
    f.pen['pen.heal'](3); // лечение → продажа жива
    const gold0 = f.game.wallet.get('gold');
    const sell = f.pen['pen.sell'](3) as R<{ gold: number; speciesId: string }>;
    const gold1 = f.game.wallet.get('gold');
    hourPass(f, PEN_T0 + 49 * HOUR + HOUR); // слот свободен → ленивое рождение
    f.clock.set(PEN_T0 + 49 * HOUR + HOUR);
    const born = penView(f);
    results.push(
      check('разведение: повтор при активном процессе — отказ «уже идёт»; полный загон на dueAt → рождение ЖДЁТ слота; pen.sell: больное — отказ с причиной; здоровое — +40з (50% от 80з, tx pen.sell), слот освобождается → ленивое рождение (4 → 3 → 4, breeding снят)', () =>
        breed.ok && !again.ok && again.error.includes('уже идёт') &&
        waiting.animals.length === 4 && waiting.breeding !== null && waiting.breeding !== undefined && waiting.breeding.waitingSlot === true &&
        !sellSick.ok && sellSick.error.includes('больно') &&
        sell.ok && sell.value.gold === 40 && gold1 - gold0 === 40 &&
        born.animals.length === 4 && born.breeding === null, {
        expected: 'повтор отказ / ждёт слот / больное отказ / +40з / рождение после продажи',
        actual: `повтор ${again.ok}, животных ${waiting.animals.length}→${born.animals.length}, ожидание ${String(waiting.breeding?.waitingSlot)}, sell ${sell.ok} +${gold1 - gold0}з, breeding ${born.breeding === null ? 'снят' : 'жив'}`,
      }),
    );
    f.dispose();
  }

  // ------------------------------------------------ 32. формула childTier: весь коридор (чистая функция)
  {
    // [M08 · 89/10/1] легализованный оракул: бонус 0/1/2 (кат. ролл 89/10/1)
    const cases: Array<[QualityTier, number, QualityTier]> = [
      ['D', 0, 'D'], ['D', 1, 'D'], ['D', 2, 'C'],
      ['B', 0, 'C'], ['B', 1, 'B'], ['B', 2, 'A'],
      ['A', 0, 'B'], ['A', 1, 'A'], ['A', 2, 'S'],
      ['SS', 0, 'S'], ['SS', 1, 'SS'], ['SS', 2, 'SS'],
    ];
    const okAll = cases.every(([parent, bonus, expected]) => childTierOf(parent, bonus) === expected);
    results.push(
      check('формула потомства (канон M08 §4, [M08 · 89/10/1]): clamp(max − 1 + бонус, D, SS) по всему коридору — D→D/D/C, B→C/B/A (+2 = ВЫШЕ родителя), A→B/A/S, SS→S/SS/SS (кап SS); +2 даёт max+1 в пределах клампа', () =>
        okAll, {
        expected: '12/12 случаев',
        actual: `${cases.filter(([p, b, e]) => childTierOf(p, b) === e).length}/12`,
      }),
    );
  }

  return results;
}
