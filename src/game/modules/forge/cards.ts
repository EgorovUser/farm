/**
 * Карточки уровней заточки (карточка M10 §5, бриф M10.2 §4.3):
 *
 * При успехе (forge.success → forge.levelUp) — modforge.rollFor ×3: бюджет
 * forgeBudgetPerLevel × новый уровень (канон 4, D36-дельта M03.2), теги
 * ['card:forge'], from 'forge' + forgeLevel, именованный стрим (детерминизм,
 * seq из среза), target { kind: 'item', refId: iid } (R4 — предмет у игрока).
 *
 * AUTO-РЕЖИМ до фазы 6 (карточка §7): levelUp завершается auto-выбором
 * «лучшей» карточки — [DECISION · M10.2] максимум Σ value (дебафы уже со
 * знаком минус) СОВМЕСТИМОЙ партии: ни один type не конфликтует с текущими
 * forge-модами предмета (RollsPort запрещает дубликаты (type, from)).
 * Совместимых нет / все партии пустые — уровень без карточки (журналируется
 * в receipt; повторного предложения нет — уровень уже взят).
 *
 * ОТКАЗ (R7): declineBonus[iid] += cards.declineBonus (0.02) — персистентное
 * опциональное поле среза v8, потребляется и обнуляется следующей попыткой.
 *
 * ЗАМОРОЗКА (карточка §4): откат L→L−1 изымает forge-моды уровня L из
 * rolledMods в frozenCards[iid][L]; повторное достижение L восстанавливает
 * ту же партию (append, байт-в-байт; НЕ роллится заново). Откат уровня,
 * взятого отказом, — замораживать нечего [DECISION · M10.2]; повторное
 * достижение предлагает свежие карточки.
 *
 * События: forge.levelUp {iid, defId, level, restored, offered};
 * forge.cardChosen {iid, defId, level, card, declined, budget, restored}.
 * Ручное предложение (forge auto off) — память сессии, НЕ срез [DECISION]:
 * F5 в ручном режиме оставляет уровень «без карточки» (auto — default).
 */
import type { EventBus } from '@/kernel/bus/event-bus/event-bus';
import type { ID, Rarity, Tag } from '@/shared/types/ids';
import type { Result } from '@/shared/types/result';
import { err, ok } from '@/shared/types/result';
import type { RolledModEntry } from '@/shared/types/rolled-mod';
import type { ForgeTable } from '@/content/balance/forging';
import type { ForgeState } from './state';

/** минимальная форма исхода rollFor (модуль M03 — по app-каналу, П4) */
export interface CardRollOutcome {
  rolls: RolledModEntry[];
  detail: { budget: number; refund: number; spent: number };
}

export interface CardOffer {
  iid: ID;
  defId: ID;
  level: number;
  /** три варианта карточки (роллы + счёт) */
  cards: Array<{ rolls: RolledModEntry[]; score: number }>;
  budget: number;
  at: number;
}

export interface LevelUpReceipt {
  iid: ID;
  level: number;
  /** замороженная карточка восстановлена (не роллилась) */
  restored: boolean;
  /** предложено 3 карточки (false — восстановление или нет совместимых) */
  offered: boolean;
  /** auto-выбранная карточка (manual — null, ждёт forge card) */
  chosen: RolledModEntry[] | null;
  /** причина отсутствия выбора */
  reason?: string;
  /** [MEL-F · гигиена M15.1] режим ветки offered: auto-успех совместимых не
   *  нашёл — предложения в памяти НЕТ (vitрина различает тексты) */
  auto?: boolean;
}

export interface CardsDeps {
  table: ForgeTable;
  bus: EventBus;
  now(): number;
  getState(): ForgeState;
  setState(s: ForgeState): void;
  markDirty(): void;
  /** бюджет карточки уровня L = budgetPerLevel × L (канон M03:
   *  modforge.forgeBudgetPerLevel = 4, D36-дельта M03.2 — П6: не литерал) */
  budgetPerLevel: number;
  /** app-канал (П4): modforge.rollFor — {budget, scopeTags, rarity, from, forgeLevel, streamKey, target} */
  rollFor(req: Record<string, unknown>): Result<CardRollOutcome>;
  /** app-канал (П4): inventory.setRolls — атомарная партия (append = текущие + новые) */
  applyRolls(iid: ID, rolls: RolledModEntry[]): Result<unknown>;
  /** текущие rolledMods предмета (inventory.list, полный профиль) */
  rollsOf(iid: ID): RolledModEntry[];
  /** auto-режим (default true; forge auto off — ручной debug-режим) */
  autoMode(): boolean;
}

/** счёт карточки: Σ value (дебафы со знаком минус) — [DECISION] */
export function cardScore(rolls: RolledModEntry[]): number {
  return rolls.reduce((s, r) => s + (Number.isFinite(r.value) ? r.value : 0), 0);
}

/** совместимость партии с текущими модами: дубликат (type, forge) запрещён портом */
export function cardCompatible(card: RolledModEntry[], current: RolledModEntry[]): boolean {
  const forgeTypes = new Set(current.filter((r) => r.from === 'forge').map((r) => r.type));
  return card.length > 0 && card.every((r) => !forgeTypes.has(r.type));
}

export function createCardsService(deps: CardsDeps) {
  /** активные ручные предложения (память сессии) */
  const offers = new Map<ID, CardOffer>();

  function nextSeq(): number {
    const s = deps.getState();
    const seq = s.seq + 1;
    deps.setState({ ...s, seq });
    deps.markDirty();
    return seq;
  }

  /** изъять forge-моды уровня L из партии (заморозка при откате) */
  function splitLevelRolls(rolls: RolledModEntry[], level: number): { rest: RolledModEntry[]; taken: RolledModEntry[] } {
    const rest: RolledModEntry[] = [];
    const taken: RolledModEntry[] = [];
    for (const r of rolls) {
      if (r.from === 'forge' && r.forgeLevel === level) taken.push(r);
      else rest.push(r);
    }
    return { rest, taken };
  }

  /** откат L→L−1: заморозить карточку уровня L (изъять из rolledMods) */
  function freezeOnRollback(iid: ID, fromLevel: number): boolean {
    const current = deps.rollsOf(iid);
    const { rest, taken } = splitLevelRolls(current, fromLevel);
    if (taken.length === 0) return false; // отказ/без карточки — замораживать нечего
    const apply = deps.applyRolls(iid, rest);
    if (!apply.ok) return false; // fail-closed: заморозка не состоялась, карточка осталась
    const s = deps.getState();
    const frozenCards = { ...s.frozenCards, [iid]: { ...(s.frozenCards[iid] ?? {}), [fromLevel]: taken } };
    deps.setState({ ...s, frozenCards });
    deps.markDirty();
    return true;
  }

  /** восстановление замороженной карточки при повторном достижении уровня */
  function restoreFrozen(iid: ID, defId: ID, level: number): Result<LevelUpReceipt> {
    const s = deps.getState();
    const frozen = s.frozenCards[iid]?.[level];
    if (!Array.isArray(frozen) || frozen.length === 0) return err('нет замороженной карточки этого уровня');
    const card = frozen as RolledModEntry[];
    const current = deps.rollsOf(iid);
    if (!cardCompatible(card, current)) {
      // конфликт типов (не должен случаться при корректном изъятии) — fail-closed
      return err('замороженная карточка конфликтует с текущими модами');
    }
    const apply = deps.applyRolls(iid, [...current, ...card]);
    if (!apply.ok) return err(apply.error);
    const next = deps.getState();
    const perIid = { ...(next.frozenCards[iid] ?? {}) };
    delete perIid[level];
    const frozenCards = { ...next.frozenCards, [iid]: perIid };
    if (Object.keys(perIid).length === 0) delete frozenCards[iid];
    deps.setState({ ...next, frozenCards });
    deps.markDirty();
    deps.bus.publish('forge.cardChosen', { iid, defId, level, card, declined: false, budget: 0, restored: true });
    return ok({ iid, level, restored: true, offered: false, chosen: card });
  }

  /** успех: уровень взят — предложение карточек (auto/ручной) */
  function onLevelUp(iid: ID, defId: ID, rarity: Rarity, level: number): Result<LevelUpReceipt> {
    // (1) замороженная карточка уровня — восстановить, не роллить
    const frozen = deps.getState().frozenCards[iid]?.[level];
    if (Array.isArray(frozen) && frozen.length > 0) {
      const r = restoreFrozen(iid, defId, level);
      if (r.ok) {
        deps.bus.publish('forge.levelUp', { iid, defId, level, restored: true, offered: false });
        return r;
      }
      // конфликт восстановления — падаем ниже к обычному предложению (журнал в reason)
    }

    // (2) rollFor ×3: бюджет budgetPerLevel × уровень (канон M03: 4), теги
    //     card:forge, target = предмет (R4)
    const budget = Math.max(0, Math.floor(deps.budgetPerLevel)) * level;
    const cards: Array<{ rolls: RolledModEntry[]; score: number }> = [];
    for (let i = 0; i < 3; i++) {
      const seq = nextSeq();
      const r = deps.rollFor({
        budget,
        scopeTags: ['card:forge'] as Tag[],
        rarity,
        from: 'forge',
        forgeLevel: level,
        streamKey: `forge:card:${iid}:${seq}`,
        target: { kind: 'item', refId: iid },
      });
      if (r.ok) cards.push({ rolls: r.value.rolls, score: cardScore(r.value.rolls) });
    }
    if (cards.length === 0) {
      deps.bus.publish('forge.levelUp', { iid, defId, level, restored: false, offered: false });
      return ok({ iid, level, restored: false, offered: false, chosen: null, reason: 'карточные роллы недоступны (канал M03)' });
    }

    deps.bus.publish('forge.levelUp', { iid, defId, level, restored: false, offered: true });

    // (3) auto-режим: лучшая совместимая; manual — предложение в память
    if (deps.autoMode()) {
      return autoChoose(iid, defId, level, cards, budget);
    }
    offers.set(iid, { iid, defId, level, cards, budget, at: deps.now() });
    return ok({ iid, level, restored: false, offered: true, chosen: null, auto: false, reason: 'ручной режим: forge card <1..3 | decline>' });
  }

  function autoChoose(iid: ID, defId: ID, level: number, cards: Array<{ rolls: RolledModEntry[]; score: number }>, budget: number): Result<LevelUpReceipt> {
    const current = deps.rollsOf(iid);
    const compatible = cards.filter((c) => cardCompatible(c.rolls, current));
    if (compatible.length === 0) {
      return ok({ iid, level, restored: false, offered: true, chosen: null, auto: true, reason: 'все карточки конфликтуют с текущими модами предмета' });
    }
    let best = compatible[0];
    for (const c of compatible) if (c.score > best.score) best = c;
    const apply = deps.applyRolls(iid, [...current, ...best.rolls]);
    if (!apply.ok) {
      return ok({ iid, level, restored: false, offered: true, chosen: null, auto: true, reason: `карточка не применена: ${apply.error}` });
    }
    deps.bus.publish('forge.cardChosen', { iid, defId, level, card: best.rolls, declined: false, budget, restored: false });
    return ok({ iid, level, restored: false, offered: true, auto: true, chosen: best.rolls });
  }

  /** ручной выбор (forge card <N>): append выбранной */
  function choose(iid: ID, n: number): Result<LevelUpReceipt> {
    const offer = offers.get(iid);
    if (!offer) return err(`у предмета "${iid}" нет активного предложения (forge auto on — выбор автоматический)`);
    const idx = n - 1;
    if (!(idx >= 0 && idx < offer.cards.length)) {
      return err(`номер карточки 1..${offer.cards.length}`);
    }
    const card = offer.cards[idx];
    const current = deps.rollsOf(iid);
    if (!cardCompatible(card.rolls, current)) {
      return err('карточка конфликтует с текущими модами предмета (дубликат типа)');
    }
    const apply = deps.applyRolls(iid, [...current, ...card.rolls]);
    if (!apply.ok) return err(apply.error);
    offers.delete(iid);
    deps.bus.publish('forge.cardChosen', { iid, level: offer.level, card: card.rolls, declined: false, budget: offer.budget, restored: false });
    return ok({ iid, level: offer.level, restored: false, offered: true, chosen: card.rolls });
  }

  /** отказ (forge card decline): одноразовый +2% к следующей попытке (R7) */
  function decline(iid: ID): Result<{ iid: ID; bonus: number }> {
    const offer = offers.get(iid);
    if (!offer) return err(`у предмета "${iid}" нет активного предложения (forge auto on — выбор автоматический)`);
    offers.delete(iid);
    const s = deps.getState();
    const bonus = s.declineBonus?.[iid] ?? 0;
    const declineBonus = { ...(s.declineBonus ?? {}), [iid]: bonus + deps.table.cards.declineBonus };
    deps.setState({ ...s, declineBonus });
    deps.markDirty();
    deps.bus.publish('forge.cardChosen', { iid, defId: offer.defId, level: offer.level, card: null, declined: true, budget: offer.budget, restored: false });
    return ok({ iid, bonus: declineBonus[iid] });
  }

  /** потребить declineBonus следующей попыткой (attempt.ts) */
  function consumeDecline(iid: ID): number {
    const s = deps.getState();
    const v = s.declineBonus?.[iid] ?? 0;
    if (v > 0) {
      const declineBonus = { ...(s.declineBonus ?? {}) };
      delete declineBonus[iid];
      deps.setState({ ...s, declineBonus });
      deps.markDirty();
    }
    return v;
  }

  return { onLevelUp, freezeOnRollback, choose, decline, consumeDecline, offers };
}

export type CardsService = ReturnType<typeof createCardsService>;
