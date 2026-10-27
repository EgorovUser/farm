/**
 * Прокачка магазина §3: XP за каждую покупку (событие shop.purchased —
 * «квесты/ачивки/уровень магазина слушают», карточка §5) + кривая уровня.
 * Уровень — целое поле среза (дёшевое чтение провайдерами), событие
 * shop.levelUp каталогом НЕ предусмотрено (§6: только purchased/rotated).
 * shop.levelup — debug-API (карточка §6), живой рост — только покупками.
 */
import type { ShopTable } from '@/content/balance/shop';
import type { ShopState } from './state';

export interface ProgressionDeps {
  table: ShopTable;
  getState(): ShopState;
  setState(s: ShopState): void;
  markDirty(): void;
  /** уровень изменился — скидка уровня новая: кэш цен сбросить (invalidate.price) */
  invalidate?(): void;
}

export class ShopProgression {
  private readonly deps: ProgressionDeps;

  constructor(deps: ProgressionDeps) {
    this.deps = deps;
  }

  /** XP до следующего уровня: xpBase × xpGrowth^(L−1) (данные) */
  xpToNext(level: number): number {
    const { xpBase, xpGrowth } = this.deps.table.level;
    return Math.round(xpBase * Math.pow(xpGrowth, level - 1));
  }

  /** Начислить XP (живой путь — слушатель shop.purchased); возвращает уровень */
  addXp(qty: number): number {
    const state = this.deps.getState();
    let { xp, level } = state;
    xp += qty;
    let guard = 0;
    while (xp >= this.xpToNext(level) && guard < 10000) {
      xp -= this.xpToNext(level);
      level += 1;
      guard += 1;
    }
    if (level !== state.level || xp !== state.xp) {
      this.deps.setState({ ...state, xp, level });
      this.deps.markDirty();
      if (level !== state.level) this.deps.invalidate?.();
    }
    return level;
  }

  /** debug (карточка §6 shop.levelup): +n уровней без XP-петли */
  addLevels(n: number): number {
    const state = this.deps.getState();
    const level = Math.max(1, state.level + Math.floor(n));
    this.deps.setState({ ...state, level, xp: 0 });
    this.deps.markDirty();
    this.deps.invalidate?.();
    return level;
  }
}
