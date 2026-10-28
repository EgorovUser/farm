/**
 * Группа «M16 Деревня» (бриф SESSION-M16.1 G9) — оркестратор: части 1–2
 * (village-checks-part1/2; прецедент распила passives-checks по wc-гигиене
 * 01 §6). Групп 49 → 50 (НОВАЯ группа — прецедент M12 44 → 45 / M14 48 → 49);
 * Δ ≥ 10 чеков, оракулы руками; срез читается из файла сейва (честная
 * истина); изоляция — поведенчески (тест-двойник mine.assist) + rg ×3
 * сеансно копипастой в отчёт.
 */
import { group, type CheckGroup } from './types';
import { runVillagePart1 } from './village-checks-part1';
import { runVillagePart2 } from './village-checks-part2';

export async function runVillageChecks(): Promise<CheckGroup> {
  const results = [...(await runVillagePart1()), ...(await runVillagePart2())];
  return group('M16 Деревня', results);
}
