/**
 * Группа «M16 Деревня» (брифы SESSION-M16.1 G9 + SESSION-M16.2 G8 +
 * SESSION-M16.3 G9) — оркестратор: части 1–8 (village-checks-part1..8;
 * прецедент распила passives-checks по wc-гигиене 01 §6: новые файлы
 * ≤ 300 строк). M16.1: группа НОВАЯ 49 → 50, Δ14; M16.2: расширение
 * 14 → 26 (Δ12); M16.3: расширение 26 → 36 (Δ10 ≥ 10 в СУЩЕСТВУЮЩУЮ
 * группу — прецедент M14.2/M16.2; НОВОЙ группы НЕТ, групп остаётся 50).
 * Порядок чеков 1–36 стабилен (канон). Оракулы руками; срез читается
 * из файла сейва (честная истина); изоляция — поведенчески + rg ×3
 * сеансно копипастой в отчёт.
 */
import { group, type CheckGroup } from './types';
import { runVillagePart1 } from './village-checks-part1';
import { runVillagePart2 } from './village-checks-part2';
import { runVillagePart3 } from './village-checks-part3';
import { runVillagePart4 } from './village-checks-part4';
import { runVillagePart5 } from './village-checks-part5';
import { runVillagePart6 } from './village-checks-part6';
import { runVillagePart7 } from './village-checks-part7';
import { runVillagePart8 } from './village-checks-part8';

export async function runVillageChecks(): Promise<CheckGroup> {
  const results = [
    ...(await runVillagePart1()),
    ...(await runVillagePart2()),
    ...(await runVillagePart3()),
    ...(await runVillagePart4()),
    ...(await runVillagePart5()),
    ...(await runVillagePart6()),
    ...(await runVillagePart7()),
    ...(await runVillagePart8()),
  ];
  return group('M16 Деревня', results);
}
