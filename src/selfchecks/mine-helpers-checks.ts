/**
 * Группа «M13 Помощники» (бриф R9, карточка M13 §6) — оркестратор: части 1–4
 * (mine-helpers-checks-part1..4; прецедент mine-run-checks M13.1 + распил
 * по wc-гигиене). Групп 47 → 48; Δ = части 1–4 (≥ 12).
 */
import { group, type CheckGroup, type CheckResult } from './types';
import { runMineHelpersPart1 } from './mine-helpers-checks-part1';
import { runMineHelpersPart2 } from './mine-helpers-checks-part2';
import { runMineHelpersPart3 } from './mine-helpers-checks-part3';
import { runMineHelpersPart4 } from './mine-helpers-checks-part4';

export async function runMineHelpersChecks(): Promise<CheckGroup> {
  const results: CheckResult[] = [];
  results.push(...(await runMineHelpersPart1()));
  results.push(...(await runMineHelpersPart2()));
  results.push(...(await runMineHelpersPart3()));
  results.push(...(await runMineHelpersPart4()));
  return group('M13 Помощники (наёмники забегов, часть 2)', results);
}
