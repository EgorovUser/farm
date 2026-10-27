/**
 * Типы и помощники runtime self-checks (02-BUSES §13 в браузерной среде).
 * Это НЕ тест-раннер: это диагностика ядра, доступная из debug-консоли.
 */

export interface CheckResult {
  name: string;
  passed: boolean;
  expected?: string;
  actual?: string;
}

export interface CheckGroup {
  name: string;
  results: CheckResult[];
  passed: boolean;
}

export function check(
  name: string,
  fn: () => boolean,
  detail?: { expected?: unknown; actual?: unknown },
): CheckResult {
  try {
    const passed = fn();
    return {
      name,
      passed,
      expected: detail?.expected !== undefined ? String(detail.expected) : undefined,
      actual: detail?.actual !== undefined ? String(detail.actual) : undefined,
    };
  } catch (e) {
    return { name, passed: false, expected: 'без исключения', actual: String(e) };
  }
}

export function group(name: string, results: CheckResult[]): CheckGroup {
  return { name, results, passed: results.every((r) => r.passed) };
}

export function near(actual: number, expected: number, tolerance: number): boolean {
  return Math.abs(actual - expected) <= tolerance;
}
