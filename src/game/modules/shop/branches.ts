/**
 * Ветки улучшений магазина §3 (M04.2): покупка уровней за золото —
 * TransactionService (стоимости из balance/shop.ts branches), эффекты —
 * данные/модификаторы, не код (карточка §3): supplies/ties/luxury уже
 * публикуются ShopBranchProvider'ом в StatBus, assortment/permanent
 * расширяют пул кандидатов и закрепляют строки в ротации (rotation.ts).
 *
 * [DECISION · M04.2] эффекты покупок — со СЛЕДУЮЩЕГО завоза (снапшот дня,
 * [DECISION] M04.1: пересоздание стока за прокачку = переролл скидок);
 * сегодняшний сток не меняется, демо — shop.reroll (debug).
 *
 * [DECISION · M04.2] домен закрепления «Постоянного заказа» — доступный пул
 * availablePool() (открытые полки + выборы «Ассортимента»): закрепление не
 * обходит ветку «Категории» (полка закрыта — заказать нельзя, как и роллить).
 *
 * Уровень ветви: assortment/permanent = число выборов (массивы), прочие —
 * счётчики. Цена уровня n (1-based) = ceil(costBase × growth^(n−1)).
 */
import type { EventBus } from '@/kernel/bus/event-bus/event-bus';
import type { TransactionService } from '@/kernel/services/transaction/transaction-service';
import type { ShopTable } from '@/content/balance/shop';
import type { ID } from '@/shared/types/ids';
import { err, ok, type Result } from '@/shared/types/result';
import type { ShopBranches, ShopState } from './state';
import { availablePool, type RotationDeps } from './rotation';

export type ShopBranchKey = 'assortment' | 'permanent' | 'supplies' | 'ties' | 'categories' | 'luxury';

export const SHOP_BRANCH_KEYS: readonly ShopBranchKey[] = [
  'assortment',
  'permanent',
  'supplies',
  'ties',
  'categories',
  'luxury',
];

/** текст эффекта (данные для UI/debug, П6) */
export const SHOP_BRANCH_EFFECTS: Record<ShopBranchKey, string> = {
  assortment: 'добавить предмет в пул завоза (каталог «что привозить»)',
  permanent: 'закрепить 1 предмет в стоке навсегда',
  supplies: '+1 к максимуму количества роллящихся позиций',
  ties: '+2% к шансу выпадения скидки (не к размеру)',
  categories: 'открыть следующую полку ассортимента',
  luxury: '+1 гарантированный предмет rare+ в каждом завозе',
};

export interface BranchViewRow {
  key: ShopBranchKey;
  level: number;
  maxLevel: number;
  /** цена следующего уровня; null — ветка максимальна */
  nextCost: number | null;
  effect: string;
  /** текущие выборы (assortment/permanent) */
  picks: ID[];
  /** для «Категории»: следующая полка unlockOrder (null — всё открыто) */
  nextShelf: string | null;
}

export interface BranchReceipt {
  branch: ShopBranchKey;
  /** новый уровень (после покупки) */
  level: number;
  cost: number;
  /** выбранный предмет (assortment/permanent) */
  pick?: ID;
  nextCost: number | null;
}

export interface BranchDeps {
  table: ShopTable;
  rotationDeps: RotationDeps;
  transaction: TransactionService;
  /** эффекты веток — статы shop.roll.* (StatBus): кэш живёт до конца тика
   *  или invalidate.stat (02-BUSES §5) — покупка уровня инвалидирует */
  bus: EventBus;
  getState(): ShopState;
  setState(s: ShopState): void;
  markDirty(): void;
}

/** уровень ветви по состоянию (assortment/permanent — длины массивов) */
export function branchLevel(b: ShopBranches, key: ShopBranchKey): number {
  switch (key) {
    case 'assortment':
      return b.assortmentPicks.length;
    case 'permanent':
      return b.pinned.length;
    case 'supplies':
      return b.supplies;
    case 'ties':
      return b.ties;
    case 'categories':
      return b.categories;
    case 'luxury':
      return b.luxury;
  }
}

export class BranchService {
  private readonly deps: BranchDeps;

  constructor(deps: BranchDeps) {
    this.deps = deps;
  }

  /** цена уровня n (1-based): ceil(costBase × growth^(n−1)) */
  costOf(key: ShopBranchKey, level: number): number {
    const { costBase, costGrowth } = this.deps.table.branches[key];
    return Math.ceil(costBase * Math.pow(costGrowth, Math.max(0, level) - 1));
  }

  private nextShelf(level: number): string | null {
    const order = this.deps.table.categories.unlockOrder;
    return level < order.length ? order[level] : null;
  }

  /** витрина ветвей (UI/debug, П6 — числа на стол) */
  view(): BranchViewRow[] {
    const branches = this.deps.getState().branches;
    return SHOP_BRANCH_KEYS.map((key) => {
      const level = branchLevel(branches, key);
      const maxLevel = this.deps.table.branches[key].maxLevel;
      return {
        key,
        level,
        maxLevel,
        nextCost: level < maxLevel ? this.costOf(key, level + 1) : null,
        effect: SHOP_BRANCH_EFFECTS[key],
        picks:
          key === 'assortment'
            ? [...branches.assortmentPicks]
            : key === 'permanent'
              ? [...branches.pinned]
              : [],
        nextShelf: key === 'categories' ? this.nextShelf(level) : null,
      };
    });
  }

  /** Покупка следующего уровня ветви; pick — выбор для assortment/permanent */
  buy(name: string, pick?: string): Result<BranchReceipt> {
    const key = SHOP_BRANCH_KEYS.find((k) => k === name);
    if (!key) {
      return err(`неизвестная ветка «${name}» (доступно: ${SHOP_BRANCH_KEYS.join(', ')})`);
    }
    const state = this.deps.getState();
    const level = branchLevel(state.branches, key);
    const maxLevel = this.deps.table.branches[key].maxLevel;
    if (level >= maxLevel) {
      return err(`ветка «${key}» уже максимальна (уровень ${level}/${maxLevel})`);
    }

    // --- выборы: ассортимент — каталог «что привозить», заказ — доступный пул
    let chosen: ID | undefined;
    if (key === 'assortment') {
      if (!pick) {
        return err('укажите предмет из каталога: shop.branch assortment <id> (каталог — shop.branch)');
      }
      const row = this.deps.table.assortmentCatalog.find((c) => c.id === pick);
      if (!row) {
        return err(`«${pick}» не входит в каталог «что привозить» (${this.deps.table.assortmentCatalog.map((c) => c.id).join(', ')})`);
      }
      if (state.branches.assortmentPicks.includes(pick)) {
        return err(`«${pick}» уже выбран (уровень ${level}/${maxLevel})`);
      }
      chosen = pick;
    } else if (key === 'permanent') {
      if (!pick) {
        return err('укажите предмет из пула магазина: shop.branch permanent <id> (витрина — shop.stock)');
      }
      const poolIds = availablePool(this.deps.rotationDeps).map((e) => e.id);
      if (!poolIds.includes(pick)) {
        const order = this.deps.table.categories.unlockOrder;
        return err(`«${pick}» вне доступного пула (закрытая полка? порядок: ${order.join(', ')})`);
      }
      if (state.branches.pinned.includes(pick)) {
        return err(`«${pick}» уже закреплён (уровень ${level}/${maxLevel})`);
      }
      chosen = pick;
    }

    // --- оплата (TransactionService: нет золота — отказ, состояние не тронуто)
    const cost = this.costOf(key, level + 1);
    const pay = this.deps.transaction.transact({
      costs: [{ t: 'currency', id: 'gold', qty: cost }],
      grants: [],
      eventId: 'shop.branch',
      reason: `ветка «${key}» уровень ${level + 1}${chosen ? ` (${chosen})` : ''}`,
    });
    if (!pay.ok) return err(pay.error);

    // --- применение (уровень +1; эффекты — со следующего завоза, [DECISION])
    const b = state.branches;
    const branches: ShopBranches =
      key === 'assortment'
        ? { ...b, assortmentPicks: [...b.assortmentPicks, chosen!] }
        : key === 'permanent'
          ? { ...b, pinned: [...b.pinned, chosen!] }
          : key === 'supplies'
            ? { ...b, supplies: b.supplies + 1 }
            : key === 'ties'
              ? { ...b, ties: b.ties + 1 }
              : key === 'categories'
                ? { ...b, categories: b.categories + 1 }
                : { ...b, luxury: b.luxury + 1 };
    this.deps.setState({ ...state, branches });
    this.deps.markDirty();
    // статы веток (shop.roll.discountChance/qtyMax/luxuryCount) изменились —
    // кэш StatBus живёт до конца тика: инвалидируем (прецедент skills.levelUp)
    this.deps.bus.publish('invalidate.stat', {});

    const nextLevel = level + 1;
    return ok({
      branch: key,
      level: nextLevel,
      cost,
      ...(chosen !== undefined ? { pick: chosen } : {}),
      nextCost: nextLevel < maxLevel ? this.costOf(key, nextLevel + 1) : null,
    });
  }
}
