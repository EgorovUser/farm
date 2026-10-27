/**
 * Self-checks M06 «Загон» — часть 4 (сеанс M06.2: болезни F1 + лекарство F2).
 *
 * Покрытие (бриф §3.8): шанс-оракул = журналу роллов (детерминизм ×2 —
 * фикс-сид saveId); уход-штрафы (+1 п.п. за hungryDays/dirtyDays) — точная
 * арифметика формулы; payload pen.animalSick { animalIdx, speciesId, dayIndex }
 * точен; needs-гейт больной (health 40 < 50 → НЕ производит, таймер стоит);
 * лечение лекарством (TransactionService pen.heal: предмет списан, health 100,
 * иммунитет 48ч, энергия 0); самолечение временем 48ч; выздоровление
 * возобновляет продукцию ленивым каскадом; иммунитет блокирует повтор (чистая
 * функция, шанс ~1); «Тёплый загон» −50% машинной серией 200 роллов (фикс-LCG,
 * частота вдвое ниже); счётчик pen.sick.days тикает событием.
 */
import { PEN_TABLE } from '@/content/balance/pen';
import { PEN_UPGRADES } from '@/content/pen/upgrades';
import { sickPass, recoverPass, sickChanceOf } from '@/game/modules/pen/logic/sickness';
import type { PenState } from '@/game/modules/pen/state';
import { check, type CheckResult } from './types';
import {
  PEN_T0,
  PEN_DAY,
  PEN_HOUR,
  animalAt,
  dayPass,
  hourPass,
  makeSeededPenGame,
  penView,
  rollOf,
  type R,
} from './pen-fixture';

const HOUR = PEN_HOUR;

/** фикс-LCG для машинных серий (прецедент монте-карло M05.3) */
function lcg(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (1664525 * s + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

export async function runPenSickChecks(): Promise<CheckResult[]> {
  const results: CheckResult[] = [];

  // ------------------------------------------------ 17. шанс-оракул = журналу + payload + счётчик
  {
    const f = await makeSeededPenGame('m062-sick-oracle');
    f.game.wallet.grant('gold', 80);
    f.pen['pen.buy']('chicken');
    dayPass(f, PEN_T0 + PEN_DAY); // один дневной проход: шанс = base 0.02
    const v1 = penView(f);
    const a = v1.animals[0]!;
    const roll = rollOf(f, 'pen:sick:chicken');
    const chance = PEN_TABLE.sickness.base;
    const sickEvents = f.events.filter((e) => e.name === 'pen.animalSick');
    results.push(
      check('болезни: шанс-оракул = журналу (pen:sick:chicken; sick ⇔ roll < base 0.02); payload { animalIdx, speciesId, dayIndex } точен; заболевшее: health 40 (ниже needs-гейта 50); счётчик pen.sick.days тикает событием', () =>
        roll !== null &&
        a.sick === (roll < chance) &&
        (a.sick
          ? a.health === PEN_TABLE.sickness.sickHealth && sickEvents.length === 1 &&
            sickEvents[0]!.payload.animalIdx === 0 &&
            sickEvents[0]!.payload.speciesId === 'chicken' &&
            typeof sickEvents[0]!.payload.dayIndex === 'number'
          : sickEvents.length === 0) &&
        f.game.stats.get('pen.sick.days') === (a.sick ? 1 : 0), {
        expected: `sick ⇔ roll ${roll ?? '?'} < 0.02; payload точен; счётчик ${a.sick ? 1 : 0}`,
        actual: `sick ${String(a.sick)}, health ${a.health}, событий ${sickEvents.length}, счётчик ${f.game.stats.get('pen.sick.days')}`,
      }),
    );
    f.dispose();
  }

  // ------------------------------------------------ 18. детерминизм sick-роллов ×2 + штрафы формулы
  {
    const run = async (): Promise<{ sick: boolean; roll: number | null }> => {
      const f = await makeSeededPenGame('m062-sick-det');
      f.game.wallet.grant('gold', 80);
      f.pen['pen.buy']('chicken');
      dayPass(f, PEN_T0 + PEN_DAY);
      const v = penView(f);
      const roll = rollOf(f, 'pen:sick:chicken');
      f.dispose();
      return { sick: v.animals[0]!.sick, roll };
    };
    const r1 = await run();
    const r2 = await run();
    // уход-штрафы: точная арифметика формулы (3 голодных + 2 грязных дня)
    const penalized = sickChanceOf(
      { speciesId: 'chicken', quality: 'D', happiness: 0, satiety: 0, health: 100, hungryDays: 3, dirtyDays: 2 },
      PEN_TABLE,
      1,
    );
    results.push(
      check('детерминизм ×2: одинаковый saveId → одинаковый исход sick-ролла; формула штрафов: (0.02 + 3×0.01 + 2×0.01) = 0.07', () =>
        r1.sick === r2.sick && r1.roll === r2.roll && Math.abs(penalized - 0.07) < 1e-12, {
        expected: 'исходы идентичны; штрафы 0.07',
        actual: `${r1.sick}/${r2.sick} (ролл ${r1.roll}/${r2.roll}); штрафы ${penalized}`,
      }),
    );
  }

  // ------------------------------------------------ 19. needs-гейт больной + лечение лекарством
  {
    const f = await makeSeededPenGame('m062-sick-heal');
    f.game.wallet.grant('gold', 80);
    f.pen['pen.buy']('chicken');
    const sick = f.pen['pen.sick'](0) as R<{ idx: number; health: number }>; // dev-форс
    const gate1 = penView(f);
    hourPass(f, PEN_T0 + 6 * HOUR); // яйцо «должно» прийти — но больная не производит
    const gate2 = penView(f);
    // лекарство: живой деф + рецепт (сверка F2 — прецедент Корма)
    (f.inv['inventory.add'] as unknown as (d: string, t: string, v: number, q: number, s: string) => unknown)('animal_remedy', 'D', 50, 1, 'selfcheck');
    const heal = f.pen['pen.heal'](0) as R<{ idx: number; health: number; immuneHours: number }>;
    const healed = animalAt(f, 0);
    const consumed = f.events.filter((e) => e.name === 'item.consumed' && e.payload.defId === 'animal_remedy');
    const energy = f.events.filter((e) => e.name === 'player.energySpent');
    hourPass(f, PEN_T0 + 7 * HOUR); // выздоровевшая: ленивый каскад навёрстывает
    const resumed = penView(f);
    results.push(
      check('needs-гейт больной: dev-форс → health 40, НЕ производит (таймер стоит, склад пуст после +6ч); лечение pen.heal: лекарство animal_remedy списано (item.consumed, tx pen.heal), health 100, иммунитет 48ч, энергия 0; выздоровление → продукция возобновляется ленивым каскадом (яйцо на складе)', () =>
        sick.ok && sick.value.health === 40 &&
        gate1.animals[0]!.sick && gate1.animals[0]!.health === 40 &&
        gate2.animals[0]!.producing === false && gate2.stock.length === 0 &&
        heal.ok && heal.value.health === 100 &&
        healed.health === 100 && !healed.sick && healed.immuneRemainingMs !== null && healed.immuneRemainingMs > 0 &&
        consumed.length === 1 &&
        !energy.some((e) => String(e.payload.stat).includes('pen.heal')) &&
        resumed.stock.some((s) => s.defId === 'egg' && s.qty >= 1), {
        expected: 'форс 40/гейт жив/лекарство списано/0 энергии/каскад возобновлён',
        actual: `sick ${String(sick.ok)}, gate stock ${gate2.stock.length}, consumed ${consumed.length}, egg ${resumed.stock.find((s) => s.defId === 'egg')?.qty ?? 0}`,
      }),
    );
    f.dispose();
  }

  // ------------------------------------------------ 20. самолечение временем 48ч + иммунитет
  {
    const f = await makeSeededPenGame('m062-sick-time');
    f.game.wallet.grant('gold', 80);
    f.pen['pen.buy']('chicken');
    f.pen['pen.sick'](0);
    dayPass(f, PEN_T0 + 1 * PEN_DAY); // больна день 1: health 40 − 10 = 30
    const day1 = animalAt(f, 0);
    hourPass(f, PEN_T0 + 48 * HOUR + HOUR); // 48ч истекли → выздоровление
    const rec = animalAt(f, 0);
    const devAgain = f.pen['pen.sick'](0) as R<unknown>; // иммунитет: dev-форс отказывает
    results.push(
      check('самолечение временем: больна день 1 → health 30 (decay −10/день пока больна); 48ч → health 100 + иммунитет (dev-повтор — отказ «иммуно»)', () =>
        day1.sick && day1.health === 30 &&
        !rec.sick && rec.health === 100 && rec.immuneRemainingMs !== null && rec.immuneRemainingMs > 0 &&
        !devAgain.ok && String(devAgain.error).includes('иммуно'), {
        expected: '30 → 100, иммунитет жив, повтор — отказ',
        actual: `день1 ${day1.health}, после ${rec.health}, immune ${rec.immuneRemainingMs !== null ? 'да' : 'нет'}, повтор ${devAgain.ok}`,
      }),
    );
    f.dispose();
    // чистые функции: иммунитет блокирует даже шанс ~1; recoverPass форма
    const state: PenState = {
      v: 1,
      animals: [{ speciesId: 'chicken', quality: 'D', happiness: 100, satiety: 0, health: 40, hungryDays: 98, immuneUntil: PEN_T0 + PEN_DAY }],
      stock: {},
      overflow: {},
    };
    const pass = sickPass(state, PEN_T0, PEN_TABLE, 1, () => 0.0001);
    const rec2 = recoverPass(
      { ...state, animals: [{ ...state.animals[0]!, sickAt: PEN_T0 - 49 * HOUR }] },
      PEN_T0,
      PEN_TABLE,
    );
    results.push(
      check('чистые функции: sickPass пропускает иммуноное животное (шанс ~1, ролл 0.0001 → НЕ заболевает); recoverPass: sickAt+49ч < now → health 100 + immuneUntil = now+48ч', () =>
        pass.sickened.length === 0 && pass.state.animals[0]!.sickAt === undefined &&
        rec2.recovered.length === 1 && rec2.state.animals[0]!.health === 100 &&
        rec2.state.animals[0]!.immuneUntil === PEN_T0 + 48 * HOUR, {
        expected: 'иммунитет блокирует; recover → 100/+48ч',
        actual: `sick ${pass.sickened.length}, recovered ${rec2.recovered.length}, health ${rec2.state.animals[0]!.health}`,
      }),
    );
  }

  // ------------------------------------------------ 21. «Тёплый загон» −50% машинной серией
  {
    const warm = PEN_UPGRADES.find((u) => u.effect.t === 'warm')!;
    const factor = warm.effect.t === 'warm' ? warm.effect.sickFactor : 1;
    const N = 200;
    const mk = (hungryDays: number): PenState => ({
      v: 1,
      animals: [{ speciesId: 'chicken', quality: 'D', happiness: 100, satiety: 0, health: 100, hungryDays }],
      stock: {},
      overflow: {},
    });
    const run = (seed: number, sickFactor: number): number => {
      const next = lcg(seed);
      let count = 0;
      for (let i = 0; i < N; i++) {
        const r = sickPass(mk(18), PEN_T0, PEN_TABLE, sickFactor, () => next());
        if (r.sickened.length > 0) count++;
      }
      return count;
    };
    const plain = run(20261025, 1);
    const warmC = run(20261025, factor);
    const chance = sickChanceOf(mk(18).animals[0], PEN_TABLE, 1);
    results.push(
      check(`«Тёплый загон» −50%: машинная серия ${N} роллов (фикс-LCG, шанс с 18 голодными ≈ 0.20): без тёплого заболело ${plain}, с тёплым (×0.5) — ${warmC} — частота вдвое ниже; sickChanceOf: (base + штрафы) × фактор`, () =>
        Math.abs(chance - 0.2) < 1e-9 &&
        plain > warmC && warmC > 0 &&
        Math.abs(warmC - plain / 2) <= 6, {
        expected: `${Math.round(N * 0.2)} → ~${Math.round(N * 0.1)} (±6)`,
        actual: `${plain} → ${warmC} (шанс ${chance})`,
      }),
    );
  }

  return results;
}
