/**
 * Детерминированный PRNG (02-BUSES §6).
 * - mulberry32 — быстрый, компактный, достаточный для игры;
 * - xoshiro128** — второй движок для «серьёзных» стримов;
 * - hashString / dailySeed — детерминизм ротаций дня.
 * Никаких внешних зависимостей: ядро — чистый TS.
 */

/** Хеш строки → uint32 (FNV-1a 32) */
export function hashString(str: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/** mulberry32: возвращает функцию [0,1) */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return function next(): number {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** xoshiro128** — four-state engine, возвращает [0,1) */
export function xoshiro128ss(seed: number): () => number {
  const s = new Uint32Array(4);
  // рассев состояния splitmix-подобным способом
  let z = seed >>> 0 || 1;
  for (let i = 0; i < 4; i++) {
    z = (z + 0x9e3779b9) | 0;
    let t = Math.imul(z ^ (z >>> 16), 0x21f0aaad);
    t = Math.imul(t ^ (t >>> 15), 0x735a2d97);
    s[i] = (t ^ (t >>> 15)) >>> 0;
  }
  return function next(): number {
    const rotl = (x: number, k: number) => ((x << k) | (x >>> (32 - k))) >>> 0;
    const result = Math.imul(rotl(Math.imul(s[1], 5) >>> 0, 7), 9) >>> 0;
    const t = (s[1] << 9) >>> 0;
    s[2] = (s[2] ^ s[0]) >>> 0;
    s[3] = (s[3] ^ s[1]) >>> 0;
    s[1] = (s[1] ^ s[2]) >>> 0;
    s[0] = (s[0] ^ s[3]) >>> 0;
    s[2] = (s[2] ^ t) >>> 0;
    s[3] = rotl(s[3], 11);
    return result / 4294967296;
  };
}

/** dailySeed = hash(saveId + ':' + dateISO) — детерминизм на сутки (02-BUSES §6) */
export function dailySeed(saveId: string, dateISO: string): number {
  return hashString(`${saveId}:${dateISO}`);
}

/**
 * Взвешенный выбор с удачей.
 * [DECISION] Удача (luck) умножает вес ТОЛЬКО записей с флагом lucky —
 * иначе равный множитель на все веса ничего не меняет. Смысл ТЗ (02-BUSES §6,
 * §13.4: «luck смещает веса в нужную сторону», «удочка тянет fishing.luck.rare»)
 * именно в избирательном смещении редких записей. luck <= -100 обнуляет вес.
 */
export function weightedPick(
  entries: ReadonlyArray<{ id: string; weight: number; lucky?: boolean }>,
  rnd: () => number,
  luck = 0,
): { id: string; total: number; effectiveWeights: number[] } | null {
  if (entries.length === 0) return null;
  const luckMult = Math.max(0, 1 + luck / 100);
  const effectiveWeights = entries.map((e) => Math.max(0, e.weight) * (e.lucky ? luckMult : 1));
  const total = effectiveWeights.reduce((a, b) => a + b, 0);
  if (total <= 0) return null;
  let roll = rnd() * total;
  for (let i = 0; i < entries.length; i++) {
    roll -= effectiveWeights[i];
    if (roll < 0) return { id: entries[i].id, total, effectiveWeights };
  }
  // числовые хвосты — берём последний ненулевой
  for (let i = entries.length - 1; i >= 0; i--) {
    if (effectiveWeights[i] > 0) return { id: entries[i].id, total, effectiveWeights };
  }
  return { id: entries[0].id, total, effectiveWeights };
}

export type RangeCurve = 'uniform' | 'triangular' | 'power';

/** rollRange: равномерно / треугольно (пик в центре) / степенно (смещение к min) */
export function rollRange(
  min: number,
  max: number,
  rnd: () => number,
  curve: RangeCurve = 'uniform',
): number {
  const u = rnd();
  switch (curve) {
    case 'triangular': {
      const mid = (min + max) / 2;
      return u < 0.5 ? min + (u * 2) * (mid - min) : mid + ((u - 0.5) * 2) * (max - mid);
    }
    case 'power':
      return min + Math.pow(u, 2) * (max - min);
    case 'uniform':
    default:
      return min + u * (max - min);
  }
}
