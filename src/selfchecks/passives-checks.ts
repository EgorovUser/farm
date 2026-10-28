/**
 * Группа «M14 Пассивки» (бриф SESSION-M14 F8 + SESSION-M14.2 G8) — оркестратор:
 * части 1–4 (passives-checks-part1..4; прецедент распила mine-run-parts по
 * wc-гигиене 01 §6). Групп 48 → 49 (M14.1); M14.2 — часть 2 В СУЩЕСТВУЮЩУЮ
 * группу (прецедент FIX-M13): 19 + Δ10 = 29; оракулы руками; чужой код в пробах
 * НЕ участвует (keystones — resolve ДО/ПОСЛЕ по брифу §5).
 */
import { group, type CheckGroup } from './types';
import { runPassivesPart1 } from './passives-checks-part1';
import { runPassivesPart2 } from './passives-checks-part2';
import { runPassivesPart3 } from './passives-checks-part3';
import { runPassivesPart4 } from './passives-checks-part4';

export async function runPassivesChecks(): Promise<CheckGroup> {
  const results = [
    ...(await runPassivesPart1()),
    ...(await runPassivesPart2()),
    ...(await runPassivesPart3()),
    ...(await runPassivesPart4()),
  ];
  return group('M14 Пассивки', results);
}
