/**
 * Группа «M14 Пассивки» (бриф SESSION-M14 F8; карточка M14 §6) — оркестратор:
 * части 1–2 (passives-checks-part1/part2; прецедент распила mine-run-parts по
 * wc-гигиене 01 §6). Групп 48 → 49; Δ = 19 (≥ 10); оракулы руками; чужой код
 * в пробах НЕ участвует (keystones — resolve ДО/ПОСЛЕ по брифу §5).
 */
import { group, type CheckGroup } from './types';
import { runPassivesPart1 } from './passives-checks-part1';
import { runPassivesPart2 } from './passives-checks-part2';

export async function runPassivesChecks(): Promise<CheckGroup> {
  const results = [
    ...(await runPassivesPart1()),
    ...(await runPassivesPart2()),
  ];
  return group('M14 Пассивки', results);
}
