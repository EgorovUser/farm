/**
 * Self-checks M06 «Загон» — часть 2: продукция + сбор (сеанс M06.1;
 * расщепление 01 §6 — pen-checks.ts превысил 300 при 16 чеках:
 * покупка/уход/decay — pen-checks, миграция/раундтрип/«Грибник»/манифест —
 * pen-migration-checks).
 *
 * Оракулы: каскад nextProduceAt и склад-cap 3 сбора per вид (переполнение —
 * в overflow-отчёт среза); produceNeeds гейтит оба поля (чистая функция —
 * health-гейт до болезней M06.2); качество продукта — маппинг-оракул по
 * журналу роллов (фактор счастья, стрим pen:collect:<defId>); событие
 * pen.produceCollected — полный payload F7; сбор по виду + детерминизм ×2.
 */
import { ANIMALS } from '@/content/pen/animals';
import { PEN_TABLE } from '@/content/balance/pen';
import { needsMet } from '@/game/modules/pen/logic/produce';
import { QUALITY_TIERS } from '@/shared/types/ids';
import { check, type CheckResult } from './types';
import {
  PEN_T0,
  PEN_DAY,
  PEN_HOUR,
  dayPass,
  hourPass,
  makeSeededPenGame,
  penView,
  rollOf,
  type R,
} from './pen-fixture';
import { runPenMigrationChecks } from './pen-migration-checks';
import { runPenSickChecks } from './pen-sick-checks';
import { runPenUpgradesChecks } from './pen-upgrades-checks';
import { runPenBreedChecks } from './pen-breed-checks';

const HOUR = PEN_HOUR;

interface EnergyEvent { cost: number; stat: string }

function energySpentOf(events: Array<{ name: string; payload: Record<string, unknown> }>): EnergyEvent[] {
  return events
    .filter((e) => e.name === 'player.energySpent')
    .map((e) => ({ cost: Number(e.payload.cost), stat: String(e.payload.stat) }));
}

export async function runPenProdChecks(): Promise<CheckResult[]> {
  const results: CheckResult[] = [];

  // ------------------------------------------------ 8. продукция: hourTick + каскад + cap 3 + overflow
  {
    const f = await makeSeededPenGame('m061-pen-produce');
    f.game.wallet.grant('gold', 200);
    f.pen['pen.buy']('chicken'); // next = T0+6ч
    hourPass(f, PEN_T0 + 6 * HOUR); // яйцо 1, next = T0+12ч
    const s1 = penView(f);
    hourPass(f, PEN_T0 + 12 * HOUR); // яйцо 2
    hourPass(f, PEN_T0 + 18 * HOUR); // яйцо 3 (cap 3 × qty 1)
    hourPass(f, PEN_T0 + 24 * HOUR); // цикл 4: склад полон → overflow 1
    const s2 = penView(f);
    const egg = s2.stock.find((s) => s.defId === 'egg');
    results.push(
      check('продукция: hourTick-проходы → яйцо на складе каждый цикл; nextProduceAt каскадом += 6ч; склад cap 3 сбора (3×1); переполнение НЕ копится — уходит в overflow-отчёт', () =>
        s1.stock.find((s) => s.defId === 'egg')?.qty === 1 &&
        s2.animals[0]!.nextProduceAt === PEN_T0 + 30 * HOUR &&
        egg?.qty === 3 && egg?.cap === 3 &&
        s2.overflow['egg'] === 1, {
        expected: 'T0+6ч → 1; каскад до T0+30ч; stock 3/3; overflow 1',
        actual: `T0+6ч ${s1.stock.find((s) => s.defId === 'egg')?.qty}; next ${s2.animals[0]!.nextProduceAt !== null ? (s2.animals[0]!.nextProduceAt - PEN_T0) / HOUR + 'ч' : '?'}; stock ${egg?.qty}/${egg?.cap}; overflow ${s2.overflow['egg']}`,
      }),
    );
    f.dispose();
  }

  // ------------------------------------------------ 9. produceNeeds: голодная не производит (оба поля)
  {
    const f = await makeSeededPenGame('m061-pen-needs');
    f.game.wallet.grant('gold', 80);
    f.pen['pen.buy']('chicken');
    // 2 дня decay: satiety 50 → НЕ производит (порог > 50), таймер стоит
    dayPass(f, PEN_T0 + PEN_DAY);
    dayPass(f, PEN_T0 + 2 * PEN_DAY);
    hourPass(f, PEN_T0 + 48 * HOUR + HOUR);
    const v = penView(f);
    const chicken = ANIMALS.find((a) => a.id === 'chicken')!;
    // чистая функция: оба поля гейтят (health-гейт — болезни M06.2, покрытие формой)
    const sickBlocked = !needsMet(
      { speciesId: 'chicken', quality: 'D', happiness: 100, satiety: 100, health: 50 },
      chicken,
    );
    const satietyBlocked = !needsMet(
      { speciesId: 'chicken', quality: 'D', happiness: 100, satiety: 50, health: 100 },
      chicken,
    );
    results.push(
      check('produceNeeds: satiety 50 → живой проход НЕ доставляет (таймер стоит); чистая функция гейтит ОБА поля (satiety ≤ 50 и health ≤ 50)', () =>
        v.animals[0]!.satiety === 50 && !v.animals[0]!.producing &&
        v.stock.length === 0 && v.animals[0]!.nextProduceAt === PEN_T0 + 6 * HOUR &&
        sickBlocked && satietyBlocked, {
        expected: '50 сытости → склад пуст, таймер T0+6ч; needsMet false ×2',
        actual: `satiety ${v.animals[0]!.satiety}, stock ${v.stock.length}, next +${v.animals[0]!.nextProduceAt !== null ? (v.animals[0]!.nextProduceAt - PEN_T0) / HOUR : '?'}ч; sick ${sickBlocked} / satiety ${satietyBlocked}`,
      }),
    );
    f.dispose();
  }

  // ------------------------------------------------ 10. каскад оффлайн + общий продукт (молоко: cap 6)
  {
    const f = await makeSeededPenGame('m061-pen-cascade');
    f.game.wallet.grant('gold', 600);
    f.pen['pen.buy']('goat'); // milk ×1, 8ч
    f.pen['pen.buy']('cow'); // milk ×2, 8ч
    // 32ч оффлайн одним ленивым обращением (канон 02 §8 (1): абсолютные даты)
    const v = penView(f); // now = T0: каскада нет
    void v;
    f.clock.set(PEN_T0 + 32 * HOUR);
    const after = penView(f); // ленивая переоценка к now
    const milk = after.stock.find((s) => s.defId === 'milk');
    // коза: циклы 8,16,24,32 → 4; корова: 8,16,24,32 → 4×2=8; cap = 3×2=6
    // бегущий склад: коза доставляет 3 (8/16/24), 32-й цикл через корову...
    // арифметика: оба каскада видят бегущее заполнение — итог ≤ cap 6
    results.push(
      check('каскад оффлайн (ленивая переоценка к now): общий продукт молоко (коза ×1 + корова ×2) не переполняет cap 6 = 3 сбора × макс qty вида; лишнее — в overflow', () =>
        milk !== undefined && milk.qty <= 6 && milk.cap === 6 &&
        (milk.qty + (after.overflow['milk'] ?? 0)) === 12, {
        expected: 'молоко ≤ 6 (cap), доставлено+потеряно = 4×1 + 4×2 = 12',
        actual: `stock ${milk?.qty}/${milk?.cap}, overflow ${after.overflow['milk'] ?? 0}`,
      }),
    );
    f.dispose();
  }

  // ------------------------------------------------ 11. сбор: инвентарь + событие + качество + энергии
  {
    const f = await makeSeededPenGame('m061-pen-collect');
    f.game.wallet.grant('gold', 80);
    f.pen['pen.buy']('chicken');
    f.clock.set(PEN_T0 + 20 * HOUR);
    penView(f); // sweep: 3 яйца (cap), next = T0+24ч... каскад 6/12/18 → 3 шт, next T0+24ч
    const r = f.pen['pen.collect']() as R<{ lines: Array<{ defId: string; qty: number; quality: { tier: string; value: number } }> }>;
    const acquired = f.events.filter((e) => e.name === 'item.acquired' && e.payload.defId === 'egg');
    const collected = f.events.filter((e) => e.name === 'pen.produceCollected');
    const spent = energySpentOf(f.events);
    const inv = (f.inv['inventory.list'] as unknown as () => Array<{ defId: string; qty: number }>)()
      .filter((i) => i.defId === 'egg')
      .reduce((s: number, i: { qty: number }) => s + i.qty, 0);
    const after = penView(f);
    const roll = rollOf(f, 'pen:collect:egg');
    // счастье 100 → фактор 1.3: веса D..SS × 1.3^i (маппинг-оракул по журналу)
    const weights = QUALITY_TIERS.map((t, i) => (PEN_TABLE.produce.qualityWeights[t] ?? 0) * Math.pow(1.3, i));
    const total = weights.reduce((a, b) => a + b, 0);
    let expectedTier = 'D';
    if (roll !== null) {
      const x = roll * total;
      let acc = 0;
      for (let i = 0; i < QUALITY_TIERS.length; i++) {
        acc += weights[i];
        if (x < acc) { expectedTier = QUALITY_TIERS[i]; break; }
      }
    }
    results.push(
      check('сбор: pen.collect → инвентарь egg ×3 (источник «загон» pen.grown), pen.produceCollected { defId, qty, quality } точным payload, энергия −2, склад пуст; качество = маппинг-оракулу (фактор счастья 1.3)', () =>
        r.ok && inv === 3 && acquired.length === 1 && acquired[0]!.payload.source === 'pen.grown' &&
        collected.length === 1 && JSON.stringify(collected[0]!.payload) === JSON.stringify(r.ok ? { defId: 'egg', qty: 3, quality: r.value.lines[0]!.quality } : null) &&
        spent.some((s) => s.stat === 'action.pen.collect.energyCost' && s.cost === 2) &&
        after.stock.length === 0 &&
        roll !== null && r.ok && r.value.lines[0]!.quality.tier === expectedTier, {
        expected: `egg ×3 pen.grown, payload точен, −2э, тир ${expectedTier} (фактор 1.3)`,
        actual: `inv ${inv}, acquired ${acquired.length}, collected ${collected.length}, тир ${r.ok ? r.value.lines[0]!.quality.tier : '?'} (ролл ${roll})`,
      }),
    );
    f.dispose();
  }

  // ------------------------------------------------ 12. сбор: вид-адресный + детерминизм качества ×2
  {
    const f1 = await makeSeededPenGame('m061-pen-qdet');
    f1.game.wallet.grant('gold', 300);
    f1.pen['pen.buy']('chicken');
    f1.pen['pen.buy']('goat');
    f1.clock.set(PEN_T0 + 30 * HOUR);
    penView(f1);
    const r1 = f1.pen['pen.collect']('chicken') as R<{ lines: Array<{ defId: string; qty: number; quality: { tier: string; value: number } }> }>;
    const f2 = await makeSeededPenGame('m061-pen-qdet');
    f2.game.wallet.grant('gold', 300);
    f2.pen['pen.buy']('chicken');
    f2.pen['pen.buy']('goat');
    f2.clock.set(PEN_T0 + 30 * HOUR);
    penView(f2);
    const r2 = f2.pen['pen.collect']('chicken') as R<{ lines: Array<{ defId: string; qty: number; quality: { tier: string; value: number } }> }>;
    // вид-адресный сбор: только яйцо; молоко остаётся на складе
    const milkLeft = penView(f1).stock.find((s) => s.defId === 'milk');
    const identical = r1.ok && r2.ok && JSON.stringify(r1.value.lines) === JSON.stringify(r2.value.lines);
    results.push(
      check('сбор по виду: pen.collect chicken → только egg (молоко на складе); качество детерминировано по сиду ×2 (стрим pen:collect:egg)', () =>
        r1.ok && r1.value.lines.length === 1 && r1.value.lines[0]!.defId === 'egg' &&
        milkLeft !== undefined && milkLeft.qty > 0 &&
        identical, {
        expected: 'egg только; milk > 0; ×2 идентичны',
        actual: `lines ${r1.ok ? JSON.stringify(r1.value.lines) : '?'}; milk ${milkLeft?.qty}; identical ${String(identical)}`,
      }),
    );
    f1.dispose();
    f2.dispose();
  }

  return [...results, ...(await runPenMigrationChecks()), ...(await runPenSickChecks()), ...(await runPenUpgradesChecks()), ...(await runPenBreedChecks())];
}
