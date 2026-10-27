/**
 * Раннер runtime self-checks — критерий приёмки Фазы 0 (02-BUSES §13).
 * Запуск: debug-команда `selftest`. Все проверки изолированы от живой игры.
 */
import { runProviderChecks, runStatAggregationChecks } from './stat-checks';
import { runPityChecks, runRngChecks } from './rng-pity-checks';
import { runTaskRegistryChecks, runTransactionChecks } from './transaction-task-checks';
import { runCatchUpChecks, runSaveChecks } from './time-save-checks';
import { runPriceChecks } from './price-checks';
import { runContentChecks } from './content-checks';
import type { CheckGroup } from './types';

export type { CheckGroup, CheckResult } from './types';

export async function runAllSelfChecks(): Promise<CheckGroup[]> {
  return [
    runStatAggregationChecks(),
    runProviderChecks(),
    runPityChecks(),
    runRngChecks(),
    runTransactionChecks(),
    runCatchUpChecks(),
    await runSaveChecks(),
    runTaskRegistryChecks(),
    runPriceChecks(),
    runContentChecks(),
  ];
}

export function summarize(groups: CheckGroup[]): { total: number; passed: number; failed: number } {
  const all = groups.flatMap((g) => g.results);
  return {
    total: all.length,
    passed: all.filter((r) => r.passed).length,
    failed: all.filter((r) => !r.passed).length,
  };
}
