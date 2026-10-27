/**
 * Attempt-цикл заточки (карточка M10 §2–§4): гейты → транзакция материалов
 * ДО ролла → чистое решение (RngBus, именованный стрим) → применение уровня/
 * pity → события с ПОЛНЫМИ данными шансов (П6: числа на стол).
 *
 * Гейты (§4.4, валидные отказы с текстом): iid существует; тип TOOL/WEAPON/
 * ARMOR/SHIELD (ROD — как tool); «Точильный станок» куплен; наковальня
 * построена (api craft.stations — не импорт); уровень < потолка (resolve
 * forge.sharpen.levelMax); материалы есть (транзакция до ролла).
 *
 * Исходы (§4): успех +1 уровень + pity.reset; провал pity.bump; откат −1
 * (не ниже 0) + pity.bump. Попытка стоит слитки+золото ВСЕГДА (sink;
 * [DECISION] квитанция транзакции — в payload события).
 *
 * События: forge.attempt {iid, defId, level, шансы, стоимость, исход},
 * forge.success {iid, level}, forge.rollback {iid, fromLevel, toLevel}
 * (каталог 02-BUSES §4; forge.levelUp/cardChosen — с M10.2).
 */
import type { ID } from '@/shared/types/ids';
import type { Result } from '@/shared/types/result';
import { err, ok } from '@/shared/types/result';
import { attemptCostOf, type ForgeTable } from '@/content/balance/forging';
import {
  chanceBreakdownOf,
  decideOutcome,
  rollbackChanceOf,
  type ChanceBreakdown,
  type ForgeOutcomeKind,
} from './outcome';
import type { ForgeDeps } from './deps';
import type { ForgeState } from './state';
import type { CardsService, LevelUpReceipt } from './cards';

/** типы, которые точатся (карточка §2; ROD — как tool) */
const SHARPENABLE_TYPES = new Set(['tool', 'weapon', 'armor', 'shield', 'rod']);

export interface AttemptReceipt {
  iid: ID;
  defId: ID;
  /** уровень ДО попытки */
  level: number;
  outcome: ForgeOutcomeKind;
  /** уровень после попытки */
  toLevel: number;
  /** [M10.2 · гигиена §1.1] разложение шанса: сумма компонентов = итогу */
  breakdown: ChanceBreakdown;
  rollbackChance: number;
  cost: { ingots: number; gold: number };
  /** провалов подряд на момент попытки (до применения исхода) */
  pityFails: number;
  /** [M10.2] карточный результат уровня (успех) */
  cards: LevelUpReceipt | null;
  /** [M10.2] заморозка при откате (false — нечего замораживать) */
  frozen: boolean | null;
}

export function createAttemptService(deps: ForgeDeps, cards?: CardsService) {
  /** ключ жалости (PityService ядра; сброс/бамп — только исходами §4) */
  const pityKey = (iid: ID): string => `forge:${iid}`;

  const levelOf = (iid: ID): number => deps.getState().sharpening[iid] ?? 0;

  /** потолок заточки — ТОЛЬКО через шину (R3: источник — craftStationProvider) */
  const levelMaxOf = (): number =>
    deps.statBus.resolve({ stat: 'forge.sharpen.levelMax', ctx: deps.resolveCtx() });

  function attempt(iid: ID): Result<AttemptReceipt> {
    // --- гейт 1: предмет в рюкзаке (экипированное — сначала снять, D30)
    const entry = deps.listItems().find((e) => e.iid === iid);
    if (!entry) {
      // санация: iid исчез (продан/израсходован) — запись уровня чистим (П5)
      const s = deps.getState();
      if (s.sharpening[iid] !== undefined || s.frozenCards[iid] !== undefined) {
        const sharpening = { ...s.sharpening };
        delete sharpening[iid];
        const frozenCards = { ...s.frozenCards };
        delete frozenCards[iid];
        deps.setState({ ...s, sharpening, frozenCards });
        deps.markDirty();
      }
      deps.pity.reset('player', pityKey(iid));
      return err(`предмет "${iid}" не найден в рюкзаке (экипированное — сначала снимите)`);
    }
    const def = deps.tryItem(entry.defId);
    if (!def) return err(`предмет-шаблон "${entry.defId}" не найден в content/items`);

    // --- гейт 2: тип точится
    if (!SHARPENABLE_TYPES.has(def.itemType)) {
      return err(`предметы типа ${def.itemType} не точатся (tool/weapon/armor/shield/rod)`);
    }

    // --- гейт 3: «Точильный станок» (улучшение дома)
    if (!deps.getState().stations.whetstone) {
      return err('заточка требует «Точильный станок» (forge buy whetstone)');
    }

    // --- гейт 4: наковальня построена (api craft.stations — не импорт)
    if (!deps.craftStationBuilt('anvil')) {
      return err('заточка требует наковальню (craft.buy anvil)');
    }

    // --- гейт 5: уровень < потолка станции (на потолке материалы НЕ списываются)
    const level = levelOf(iid);
    const levelMax = levelMaxOf();
    if (level >= levelMax) {
      return err(`достигнут потолок станции: ${level}/${levelMax} (улучшение наковальни — craft.buy second_hammer / mithril_anvil)`);
    }

    // --- гейт 6: материалы (транзакция ДО ролла; слиток — ПРЕДМЕТ iron_ingot)
    const cost = attemptCostOf(level, deps.table);
    const pay = deps.transaction.transact({
      costs: [
        { t: 'item', defId: 'iron_ingot', qty: cost.ingots },
        { t: 'currency', id: 'gold', qty: cost.gold },
      ],
      eventId: 'forge.attempt',
      reason: `заточка ${def.name} (${iid}) L${level} → L${level + 1}`,
    });
    if (!pay.ok) return err(pay.error);

    // --- шансы (полные данные — в событие, П6) + [M10.2] одноразовый бонус
    //     отказа от карточки (R7: потребляется ЭТОЙ попыткой, обнуляется)
    const pityFails = deps.pity.get('player', pityKey(iid));
    const bonusStat = deps.statBus.resolve({ stat: 'forge.success.bonus', ctx: deps.resolveCtx() });
    const decline = cards ? cards.consumeDecline(iid) : 0;
    const breakdown = chanceBreakdownOf(level, pityFails, deps.table, bonusStat, decline);
    const chance = breakdown.chance;
    const rollbackChance = rollbackChanceOf(level, deps.table);

    // --- решение: dev-форс ИЛИ два ролла именованного стрима (детерминизм).
    //     seq инкрементируется и КОММИТИТСЯ до ролла (карточные стримы
    //     поверх — монотонность; финальный setState seq не трогает)
    const seq = deps.getState().seq + 1;
    deps.setState({ ...deps.getState(), seq });
    deps.markDirty();
    const stream = `forge:attempt:${seq}`;
    const forced = deps.forceMode();
    const u1 = deps.rngBus.nextFloat(stream);
    const u2 = deps.rngBus.nextFloat(stream);
    const outcome: ForgeOutcomeKind = forced ?? decideOutcome(u1, u2, chance, rollbackChance);

    // --- событие попытки: шансы + стоимость-квитанция + исход (§4.4)
    deps.bus.publish('forge.attempt', {
      iid,
      defId: def.id,
      level,
      breakdown,
      chance,
      rollbackChance,
      cost,
      outcome,
      draws: forced === null ? [u1, u2] : null,
    });

    // --- применение исхода
    let toLevel = level;
    let cardsReceipt: LevelUpReceipt | null = null;
    let frozen: boolean | null = null;
    const sharpening = { ...deps.getState().sharpening };
    if (outcome === 'success') {
      toLevel = level + 1;
      sharpening[iid] = toLevel;
      deps.pity.reset('player', pityKey(iid));
      deps.bus.publish('forge.success', { iid, level: toLevel });
      // [M10.2] карточки уровня (§5): восстановление/auto-выбор/предложение;
      // ошибки карточек НЕ откатывают уровень (прогресс заработан — журнал в receipt)
      if (cards) {
        const r = cards.onLevelUp(iid, def.id, def.rarity, toLevel);
        cardsReceipt = r.ok ? r.value : null;
      }
    } else if (outcome === 'rollback') {
      toLevel = Math.max(0, level - 1);
      if (toLevel > 0) sharpening[iid] = toLevel;
      else delete sharpening[iid]; // 0 = отсутствие записи
      deps.pity.bump('player', pityKey(iid));
      // [M10.2] заморозка карточки потерянного уровня (§4)
      frozen = cards ? cards.freezeOnRollback(iid, level) : null;
      deps.bus.publish('forge.rollback', { iid, fromLevel: level, toLevel, frozen: frozen === true });
    } else {
      deps.pity.bump('player', pityKey(iid));
    }

    deps.setState({ ...deps.getState(), sharpening });
    deps.markDirty();
    // статы предмета (statScale) и цена (эффективный тир) — кэши шин сбросить
    deps.bus.publish('invalidate.stat', {});
    deps.bus.publish('invalidate.price', {});

    return ok({
      iid,
      defId: def.id,
      level,
      outcome,
      toLevel,
      breakdown,
      rollbackChance,
      cost,
      pityFails,
      cards: cardsReceipt,
      frozen,
    });
  }

  /** витрина предмета (§4.5 forge stats): тир качества / эффективный / scale / потолок / pity */
  function statsView(iid: ID): Result<{
    iid: ID;
    defId: ID;
    level: number;
    levelMax: number;
    pityFails: number;
    breakdown: ChanceBreakdown;
    declineBonus: number;
    frozenLevels: number[];
    rollbackChance: number;
    cost: { ingots: number; gold: number };
    whetstone: boolean;
    anvil: boolean;
  }> {
    const entry = deps.listItems().find((e) => e.iid === iid);
    if (!entry) return err(`предмет "${iid}" не найден в рюкзаке (inv list)`);
    const def = deps.tryItem(entry.defId);
    if (!def) return err(`предмет-шаблон "${entry.defId}" не найден в content/items`);
    if (!SHARPENABLE_TYPES.has(def.itemType)) {
      return err(`предметы типа ${def.itemType} не точатся (tool/weapon/armor/shield/rod)`);
    }
    const level = levelOf(iid);
    const pityFails = deps.pity.get('player', pityKey(iid));
    const bonusStat = deps.statBus.resolve({ stat: 'forge.success.bonus', ctx: deps.resolveCtx() });
    const decline = deps.getState().declineBonus?.[iid] ?? 0;
    return ok({
      iid,
      defId: def.id,
      level,
      levelMax: levelMaxOf(),
      pityFails,
      breakdown: chanceBreakdownOf(level, pityFails, deps.table, bonusStat, decline),
      declineBonus: decline,
      frozenLevels: Object.keys(deps.getState().frozenCards[iid] ?? {}).map(Number).sort((a, b) => a - b),
      rollbackChance: rollbackChanceOf(level, deps.table),
      cost: attemptCostOf(level, deps.table),
      whetstone: deps.getState().stations.whetstone,
      anvil: deps.craftStationBuilt('anvil'),
    });
  }

  return { attempt, statsView, levelOf, levelMaxOf, pityKey };
}

export type AttemptService = ReturnType<typeof createAttemptService>;
export type { ForgeTable, ForgeState };
