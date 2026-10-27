/** Математические помощники ядра. Никакой магии в логике — только тут. */

/** [FIX-0.1 P3] Технические константы времени — единственное место определения
 *  (DEBT-10: литералы 3_600_000/86_400_000 дублировались по шести файлам) */
export const MS_HOUR = 3_600_000;
export const MS_DAY = 86_400_000;

export function clamp(v: number, min: number, max: number): number {
  return v < min ? min : v > max ? max : v;
}

export function sum(values: readonly number[]): number {
  return values.reduce((a, b) => a + b, 0);
}

export type Rounding = 'round' | 'floor' | 'ceil' | 'none';

export function roundBy(v: number, mode: Rounding = 'round'): number {
  switch (mode) {
    case 'floor':
      return Math.floor(v);
    case 'ceil':
      return Math.ceil(v);
    // [FIX-0.1 E] 'none' — без округления: для дробных баз (реген 0.5/тик в M01),
    // где Math.round искажал бы значение (0.5 → 1, 0.2 → 0)
    case 'none':
      return v;
    case 'round':
    default:
      return Math.round(v);
  }
}

/** Стабильная сериализация для ключей кэша (порядок ключей фиксирован) */
export function stableKey(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value) ?? 'null';
  if (Array.isArray(value)) return `[${value.map(stableKey).join(',')}]`;
  const obj = value as Record<string, unknown>;
  const keys = Object.keys(obj).sort();
  return `{${keys.map((k) => `${JSON.stringify(k)}:${stableKey(obj[k])}`).join(',')}}`;
}

/** Мини-хи-квадрат для monte-carlo self-checks (без внешних библиотек) */
export function chiSquare(observed: readonly number[], expected: readonly number[]): number {
  let chi = 0;
  for (let i = 0; i < observed.length; i++) {
    const e = expected[i];
    if (e <= 0) continue;
    chi += ((observed[i] - e) ** 2) / e;
  }
  return chi;
}
