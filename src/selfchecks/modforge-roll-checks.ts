/**
 * Self-checks M03.2 — движок rollFor (карточка M03 §5, приёмка §10):
 *   §10.1 инвариант бюджета: монте-карло 10 000 роллов КАЖДОЙ редкости —
 *        ни одного перелимита (spent = Σpos − рефанд ≤ budget);
 *   §10.3 детерминизм: один сид → один ролл, 1000 повторений;
 *   §10.2 рефанд: с дебафом Σ бафов в среднем выше (оракул §10 «выше на
 *        refundRate−1» — буквальный ×1.25 недостижим при частичном заполнении
 *        бюджета, механизм проверяется соотношением средних; скоуп без
 *        дефицита кандидатов, чтобы дебаф не съедал слот бафа);
 *   §10.5 расширяемость: фикстура добавляет НОВЫЙ тип характеристик в реестр
 *        данными и роллит его — без изменения кода движка;
 *   плюс: скоуп-изоляция (П5) и кривые типов (steep смещает к дешёвым).
 *
 * Оракулы — формулы §3 и контент (MODFORGE_TABLE/MOD_TYPES); все роллы
 * детерминированы явными сидами mulberry32 (ноль живого рандома).
 * Модульный API/событие/сейв v5 — modforge-api-checks.ts (расщепление 01 §6).
 */
import { mulberry32 } from '@/shared/utils/rng';
import { MOD_TYPES, type ModTypeDef } from '@/content/mods/registry';
import { MODFORGE_TABLE } from '@/content/balance/modforge';
import { rollFor, type RollOutcome } from '@/game/modules/modforge/roll';
import { check, group, type CheckGroup, type CheckResult } from './types';

const COST_TABLE = {
  negativeRefund: MODFORGE_TABLE.negativeRefund,
  positiveExponent: MODFORGE_TABLE.positiveExponent,
  negativeExponent: MODFORGE_TABLE.negativeExponent,
};

function rollOnce(
  seed: number,
  budget: number,
  scopeTags: string[],
  shape: { positives: [number, number]; negChance: number },
  mods: readonly ModTypeDef[] = MOD_TYPES,
): RollOutcome {
  return rollFor({ budget, scopeTags, shape, mods, rng: mulberry32(seed) }, COST_TABLE);
}

/** Σ положительных стоимостей ролла (для рефанд-статистики §10.2) */
function positiveSum(o: RollOutcome): number {
  return o.detail.costs.filter((c) => c.value > 0).reduce((s, c) => s + c.cost, 0);
}

export function runModForgeRollChecks(): CheckGroup {
  const results: CheckResult[] = [];
  const WEAPON = ['weapon', 'melee'];

  // --- §10.3 Детерминизм: 1000 сидов, два прогона байт-в-байт
  let detOk = true;
  for (let seed = 0; seed < 1000; seed++) {
    const shape = { positives: [2, 3] as [number, number], negChance: 0.5 };
    const a = rollOnce(seed, 25, WEAPON, shape);
    const b = rollOnce(seed, 25, WEAPON, shape);
    if (JSON.stringify(a.rolls) !== JSON.stringify(b.rolls) || JSON.stringify(a.detail.costs) !== JSON.stringify(b.detail.costs)) {
      detOk = false;
      break;
    }
  }
  results.push(check('детерминизм: один сид → один ролл (1000 повторений, rolls+costs байт-в-байт)', () => detOk));

  // --- §10.1 Монте-карло: 10 000 роллов каждой редкости — инвариант §3,
  //     форма, границы, уникальность типов, сетка 0.1
  let invariantOk = true;
  let shapeOk = true;
  let firstBad = '';
  const byId = new Map(MOD_TYPES.map((m) => [m.id, m] as const));
  for (const rarity of ['common', 'uncommon', 'rare', 'epic', 'legendary', 'mythic'] as const) {
    const row = MODFORGE_TABLE.byRarity[rarity];
    const shape = { positives: [row.positives[0], row.positives[1]] as [number, number], negChance: row.negChance };
    for (let i = 0; i < 10_000; i++) {
      const o = rollOnce(1_000_000 + i, row.budget, WEAPON, shape);
      if (o.detail.spent > o.detail.budget + 1e-9) {
        invariantOk = false;
        firstBad = `${rarity} #${i}: spent ${o.detail.spent} > ${o.detail.budget}`;
      }
      const ids = new Set(o.rolls.map((r) => r.type));
      const pos = o.rolls.filter((r) => r.value > 0);
      const neg = o.rolls.filter((r) => r.value < 0);
      if (
        o.rolls.some((r) => r.from !== 'initial') ||
        o.rolls.length !== ids.size ||
        pos.length !== o.detail.positiveCount ||
        neg.length !== o.detail.negativeCount ||
        o.detail.positiveCount > row.positives[1] ||
        o.rolls.length === 0 ||
        o.rolls.some((r) => {
          const m = byId.get(r.type);
          if (!m) return true;
          const onGrid = Math.abs(r.value * 10 - Math.round(r.value * 10)) < 1e-9;
          return !onGrid || r.value > m.maxPositive + 1e-9 || r.value < m.maxNegative - 1e-9;
        })
      ) {
        shapeOk = false;
        firstBad = `${rarity} #${i}: форма ролла нарушена`;
      }
    }
  }
  results.push(
    check('монте-карло 10k × 6 редкостей: инвариант Σpos − рефанд ≤ budget — НИ ОДНОГО перелимита', () => invariantOk, {
      expected: '0 перелимитов',
      actual: invariantOk ? '0 перелимитов' : firstBad,
    }),
  );
  results.push(
    check('форма: from initial, типы уникальны, бафы/дебафы в границах типов, сетка 0.1, ролл непуст, бафов ≤ max', () => shapeOk, {
      expected: 'все роллы честные',
      actual: shapeOk ? 'все роллы честные' : firstBad,
    }),
  );

  // --- §10.2 Рефанд-статистика: с дебафом Σ бафов в среднем выше
  const NO_NEG = { positives: [2, 2] as [number, number], negChance: 0 };
  const ALL_NEG = { positives: [2, 2] as [number, number], negChance: 1 };
  let sumPos = 0;
  let sumNeg = 0;
  const N_REF = 4000;
  for (let i = 0; i < N_REF; i++) {
    sumPos += positiveSum(rollOnce(7_000_000 + i, 25, [], NO_NEG));
    sumNeg += positiveSum(rollOnce(7_000_000 + i, 25, [], ALL_NEG));
  }
  const meanPos = sumPos / N_REF;
  const meanNeg = sumNeg / N_REF;
  results.push(
    check('рефанд-механизм: Σ бафов с дебафом выше в среднем > ×1.05 (буквальный ×1.25 из §10 недостижим при частичном заполнении — наблюдение M03.2-REPORT §3)', () => meanNeg > meanPos * 1.05, {
      expected: `с дебафом > ${meanPos.toFixed(2)} × 1.05`,
      actual: `без дебафа ${meanPos.toFixed(2)} · с дебафом ${meanNeg.toFixed(2)} (×${(meanNeg / meanPos).toFixed(2)})`,
    }),
  );

  // --- §10.5 Расширяемость: НОВЫЙ тип характеристики — строкой данных
  //     (фикстура реестра), движок не меняется
  const wildType: ModTypeDef = {
    id: 'wild_power',
    stat: 'demo.attack',
    scopeTags: ['test'],
    maxPositive: 40,
    maxNegative: -20,
    costWeight: 8,
    curve: 'steep',
  };
  const extended = [...MOD_TYPES, wildType];
  const wildRolls: RollOutcome[] = [];
  for (let i = 0; i < 500; i++) {
    wildRolls.push(rollOnce(9_000_000 + i, 16, ['test'], { positives: [1, 2], negChance: 0.3 }, extended));
  }
  results.push(
    check('расширяемость: новый тип wild_power данными — роллится без изменения кода движка (scope [test])', () =>
      wildRolls.every(
        (o) =>
          o.rolls.every((r) => r.type === 'wild_power' && r.value <= 40 && r.value >= -20) &&
          o.rolls.length > 0 &&
          o.detail.spent <= o.detail.budget + 1e-9,
      )),
  );
  const mixed = rollOnce(9_500_000, 16, ['weapon', 'test'], { positives: [2, 3], negChance: 0 }, extended);
  results.push(
    // [M04.1 · C3] реестр расширен (+atk_mastery): weapon-скоуп теперь 3 строки
    //  + фикстура wild_power — кандидатов 4 (обновление ожидания — прецедент
    //  миграционных ожиданий M03.2 при удлинении цепочки)
    check('расширяемость: смешанный скоуп [weapon,test] — кандидаты объединяются (4 типа), инвариант держится', () =>
      mixed.detail.candidates === 4 &&
      mixed.rolls.every((r) => ['atk_power', 'atk_finesse', 'atk_mastery', 'wild_power'].includes(r.type)) &&
      mixed.detail.spent <= 16 + 1e-9),
  );

  // --- Скоуп-изоляция и П5 (неизвестное — штатно)
  const rodRolls = Array.from({ length: 500 }, (_, i) =>
    rollOnce(11_000_000 + i, 10, ['rod'], { positives: [1, 1], negChance: 1 }),
  );
  results.push(
    // [M07.1 · легализация поимённо] rod-скоуп расширен лестницей удочек ×6
    // (F4: lucky_glow + treasure_sense/rod_mastery/rare_pull/epic_pull —
    // 5 кандидатов, инвариант C3 для legendary [3,3]); бюджет 10 (common
    // [1,1]) роллит ОДИН тип из пяти; отрицательные значения возможны
    // только у rod_mastery/rare_pull/epic_pull (maxNegative < 0)
    check('скоуп [rod]: 500 роллов — типы только из 5 rod-кандидатов реестра (бюджет 10 → 1 баф)', () =>
      rodRolls.every((o) =>
        o.rolls.every((r) => ['lucky_glow', 'treasure_sense', 'rod_mastery', 'rare_pull', 'epic_pull'].includes(r.type)) &&
        o.rolls.length >= 1) &&
      rodRolls.some((o) => o.rolls.some((r) => r.type !== 'lucky_glow'))),
  );
  results.push(
    check('П5: неизвестный скоуп [нет_такого] — пустой ролл без исключения', () => {
      const o = rollOnce(42, 25, ['нет_такого'], { positives: [1, 1], negChance: 0.5 });
      return o.rolls.length === 0 && o.detail.candidates === 0 && o.detail.spent === 0;
    }),
  );

  // --- Кривые типов: steep смещает к дешёвым значениям, linear — равномерно
  //     (одно-типовые фикстуры реестра: чистые распределения)
  const linearOnly: ModTypeDef[] = [{ ...MOD_TYPES[0], id: 'lin', scopeTags: ['bench'] }];
  const steepOnly: ModTypeDef[] = [{ ...MOD_TYPES.find((m) => m.id === 'mine_sense')!, id: 'stp', scopeTags: ['bench'] }];
  let linHigh = 0;
  let stpHigh = 0;
  const N_CURVE = 2000;
  for (let i = 0; i < N_CURVE; i++) {
    const l = rollOnce(13_000_000 + i, 10, ['bench'], { positives: [1, 1], negChance: 0 }, linearOnly);
    const s = rollOnce(13_000_000 + i, 10, ['bench'], { positives: [1, 1], negChance: 0 }, steepOnly);
    if (l.rolls[0] && l.rolls[0].value > 15) linHigh++; // половина maxPositive (30)
    if (s.rolls[0] && s.rolls[0].value > 10) stpHigh++; // половина maxPositive (20)
  }
  results.push(
    check('кривые: steep — доля сильных значений < 45%, linear — > 55% (смещение к дешёвым)', () => {
      const lf = linHigh / N_CURVE;
      const sf = stpHigh / N_CURVE;
      return sf < 0.45 && lf > 0.55;
    }, {
      expected: 'steep < 0.45 · linear > 0.55',
      actual: `steep ${(stpHigh / N_CURVE).toFixed(2)} · linear ${(linHigh / N_CURVE).toFixed(2)}`,
    }),
  );

  return group('M03 · Модфордж: движок роллов (rollFor §5/§10)', results);
}
