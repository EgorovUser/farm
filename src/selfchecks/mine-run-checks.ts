/**
 * Группа «M13 Забег» (бриф R9, карточка M13 §6) — оркестратор: части 1–3
 * (mine-run-part1/2/3; прецедент mine-checks → battle/gate/elite/lootcap).
 * Групп 46 → 47; Δ = части 1+2 (≥12); [FIX-M13] часть 3 (+3: границы
 * обвала 3→4/4→5 + трофей-гейт — предписания AUDIT-M13 P1/P2).
 */
import { group, type CheckGroup, type CheckResult } from './types';
import { runMineRunPart1 } from './mine-run-part1';
import { runMineRunPart2 } from './mine-run-part2';
import { runMineRunPart3 } from './mine-run-part3';

export async function runMineRunChecks(): Promise<CheckGroup> {
  const results: CheckResult[] = [];
  results.push(...(await runMineRunPart1()));
  results.push(...(await runMineRunPart2()));
  results.push(...(await runMineRunPart3()));
  return group('M13 Забег (карточный рогалик, часть 1)', results);
}
