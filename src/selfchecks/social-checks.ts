/**
 * Self-checks M17 «Соц» — оркестратор группы (бриф G6): часть 1 (замок/
 * детерминизм/факты/письма/read/force) + часть 2 (титулы/нейтральность/
 * roundtrip/реестр/манифест/профиль). 14 чеков — Δ канона 837 → 851,
 * групп 50 → 51.
 */
import { group, type CheckGroup } from './types';
import { runSocialPart1 } from './social-checks-part1';
import { runSocialPart2 } from './social-checks-part2';

export async function runSocialChecks(): Promise<CheckGroup> {
  return group('M17 Соц', [...(await runSocialPart1()), ...(await runSocialPart2())]);
}
