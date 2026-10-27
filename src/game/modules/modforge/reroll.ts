/**
 * Реролл-цикл M03 §6 (как у ривенов Warframe): для стартовых роллов предмета
 * reroll(iid) генерирует новый вариант РЯДОМ со старым (бюджет предмета
 * фиксирован — редкость не понижается), игрок выбирает «оставить новый» или
 * «остаться на старом»; стоимость растёт геометрически
 * (ceil(base(rarity) × min(growth^n, capMult))) и сбрасывается при выборе.
 * [C2 · M04.2] база цены — ПО РЕДКОСТИ предмета (бриф-вариант 10/20/40/80/150
 * + mythic 300; плоские 10 — ратифицированы были только на фазу 1).
 *
 * [DECISION · M03.3] choose 'new' перегенерирует ТОЛЬКО стартовые роллы
 * (from 'initial'); карточки заточки (from 'forge', M10) сохраняются — они
 * заработаны отдельной системой (§7), снос рероллом был бы деструктивным.
 *
 * [DECISION · M03.3] канал доступа к предмету — колбэки app-слоя
 * (getSubject/applyRolls, прецедент D33 applyUseEffect): модуль НЕ импортирует
 * инвентарь (П4), app-слой вайрит inventory.list / inventory.setRolls.
 *
 * Отказы (fail-closed, деньги не списываются): нет предмета / нет ривен-слотов
 * / нет кандидатов для скоупа / не хватило золота (транзакция ядра отклоняет).
 */
import type { RngBus } from '@/kernel/bus/rng-bus/rng-bus';
import type { EventBus } from '@/kernel/bus/event-bus/event-bus';
import type { TransactionService } from '@/kernel/services/transaction/transaction-service';
import type { ModForgeTable } from '@/content/balance/modforge';
import type { ItemDef } from '@/content/items/items';
import type { ModTypeDef } from '@/content/mods/registry';
import type { ID, Rarity } from '@/shared/types/ids';
import { err, ok, type Result } from '@/shared/types/result';
import type { RolledModEntry } from '@/shared/types/rolled-mod';
import { hashString, mulberry32 } from '@/shared/utils/rng';
import { candidatesFor, rollFor, type RollOutcome } from './roll';
import type { ModForgeState } from './state';

export interface RerollSubject {
  defId: ID;
  rolls: RolledModEntry[];
}

export interface RerollDeps {
  table: ModForgeTable;
  mods: readonly ModTypeDef[];
  tryItem(defId: ID): ItemDef | undefined;
  rngBus: RngBus;
  transaction: TransactionService;
  bus: EventBus;
  now(): number;
  getState(): ModForgeState;
  setState(s: ModForgeState): void;
  markDirty(): void;
  /** app-слой (bootstrap): saveId сейва — основа стабильного сида реролла
   *  (C6 · AUDIT-M03: канон §5 — hash(saveId, iid, attempts), вариант стабилен
   *  ВСЕГДА для той же попытки; НЕ dailySeed — иначе через сутки keep-сброс
   *  давал бы НОВЫЙ вариант той же попытки и инфляция обходилась ожиданием) */
  saveId(): string;
  /** app-слой (bootstrap): предмет по iid (inventory.list); null — не найден */
  getSubject(iid: ID): RerollSubject | null;
  /** app-слой: применить партию (inventory.setRolls) */
  applyRolls(iid: ID, rolls: RolledModEntry[]): Result<unknown>;
}

export interface RerollReceipt {
  iid: ID;
  defId: ID;
  /** уплачено золота */
  cost: number;
  /** номер попытки (после этой) */
  attempts: number;
  /** следующая цена (если игрок продолжит) */
  nextCost: number;
  variant: RolledModEntry[];
  outcome: RollOutcome;
}

export interface ChooseReceipt {
  iid: ID;
  applied: boolean;
  /** итоговые роллы предмета при applied (variant + сохранённые forge) */
  rolls?: RolledModEntry[];
}

export interface RerollView {
  iid: ID;
  attempts: number;
  nextCost: number;
  pending: RolledModEntry[] | null;
}

export class RerollService {
  private readonly deps: RerollDeps;

  constructor(deps: RerollDeps) {
    this.deps = deps;
  }

  /** Цена следующего реролла: ceil(base(rarity) × min(growth^attempts, capMult))
   *  [C2 · M04.2] база — по редкости предмета (карточка §6: «кап ×10 базы») */
  costOf(rarity: Rarity, attempts: number): number {
    const { baseCostByRarity, growth, capMult } = this.deps.table.reroll;
    const base = baseCostByRarity[rarity] ?? 0;
    return Math.ceil(base * Math.min(Math.pow(growth, Math.max(0, attempts)), capMult));
  }

  /** Состояние цикла по предмету (debug/UI, П6 — числа на стол). Предмет
   *  исчез (продан) — редкость неизвестна, цена 0: цикл всё равно неактивен
   *  (reroll отказывает без субъекта), ключ подчистит choose/санация сейва. */
  view(iid: ID): RerollView {
    const st = this.deps.getState().rerolls[iid];
    const attempts = st?.attempts ?? 0;
    const subject = this.deps.getSubject(iid);
    const def = subject ? this.deps.tryItem(subject.defId) : undefined;
    return {
      iid,
      attempts,
      nextCost: def ? this.costOf(def.rarity, attempts) : 0,
      pending: st?.pending ? st.pending.variant : null,
    };
  }

  /** Все активные циклы (debug) */
  views(): RerollView[] {
    return Object.keys(this.deps.getState().rerolls).map((iid) => this.view(iid));
  }

  reroll(iid: ID): Result<RerollReceipt> {
    const subject = this.deps.getSubject(iid);
    if (!subject) return err(`предмет "${iid}" не найден в инвентаре`);
    const def = this.deps.tryItem(subject.defId);
    if (!def) return err(`предмет-шаблон "${subject.defId}" не найден в реестре`);
    if (!def.modSlots) return err(`у предмета "${def.name}" нет ривен-слотов — рероллить нечего`);
    const candidates = candidatesFor(this.deps.mods, def.modSlots.tags);
    if (candidates.length === 0) {
      return err(`нет типов характеристик для скоупа [${def.modSlots.tags.join(',')}] (mods list)`);
    }
    const state = this.deps.getState();
    const attempts = state.rerolls[iid]?.attempts ?? 0;
    const cost = this.costOf(def.rarity, attempts);
    const pay = this.deps.transaction.transact({
      costs: [{ t: 'currency', id: 'gold', qty: cost }],
      grants: [],
      eventId: 'modforge.reroll',
      reason: `реролл стартовых роллов ${def.name}`,
    });
    if (!pay.ok) return err(pay.error);

    const row = this.deps.table.byRarity[def.rarity];
    // [DECISION · M03.3, ИСПРАВЛЕНО · M04.1/C6] СВЕЖИЙ PRNG от хеша
    // (saveId : iid : attempts), а НЕ кэш-стрим rngBus (стрим ПРОДОЛЖАЕТСЯ при
    // повторе ключа). [C6 · AUDIT-M03] основа сида — saveId, НЕ сид дня rngBus:
    // прежний вариант (rngBus.seed = dailySeed) менял вариант той же попытки
    // через сутки — канон §5 «hash(saveId, itemId, attempts)» требует
    // стабильности ВСЕГДА: та же попытка того же предмета даёт ТОТ ЖЕ вариант
    // — в том числе после F5, после keep-сброса и ЧЕРЕЗ границу дня
    const outcome = rollFor(
      {
        budget: def.modSlots.budgetBase,
        scopeTags: def.modSlots.tags,
        shape: { positives: [row.positives[0], row.positives[1]], negChance: row.negChance },
        mods: this.deps.mods,
        rng: mulberry32(
          hashString(`${this.deps.saveId()}:modforge:reroll:${iid}:${attempts}`),
        ),
        from: 'initial',
      },
      {
        negativeRefund: this.deps.table.negativeRefund,
        positiveExponent: this.deps.table.positiveExponent,
        negativeExponent: this.deps.table.negativeExponent,
      },
    );
    // [M03.3] честный лог (§9: modforge.rolled — «кто, бюджет, список роллов»)
    // [M10.1 · C1 леджера AUDIT-M03] payload += target — реролл стартовых
    //  роллов ПРИНАДЛЕЖИТ предмету: { kind: 'item', refId: iid }
    this.deps.bus.publish('modforge.rolled', {
      source: 'modforge.reroll',
      budget: def.modSlots.budgetBase,
      scopeTags: [...def.modSlots.tags],
      rolls: outcome.rolls.map((r) => ({ ...r })),
      refund: outcome.detail.refund,
      spent: outcome.detail.spent,
      target: { kind: 'item', refId: iid },
    });

    const rerolls = { ...state.rerolls };
    rerolls[iid] = {
      attempts: attempts + 1,
      pending: { variant: outcome.rolls, at: this.deps.now() },
    };
    this.deps.setState({ ...state, rerolls });
    this.deps.markDirty();
    return ok({
      iid,
      defId: def.id,
      cost,
      attempts: attempts + 1,
      nextCost: this.costOf(def.rarity, attempts + 1),
      variant: outcome.rolls,
      outcome,
    });
  }

  /** Выбор игрока: 'new' — применить вариант (forge-карточки сохраняются),
   *  'keep' — остаться на старом. Любой выбор сбрасывает инфляцию (§6). */
  choose(iid: ID, choice: 'new' | 'keep'): Result<ChooseReceipt> {
    if (choice !== 'new' && choice !== 'keep') return err('choice должен быть "new" или "keep"');
    const state = this.deps.getState();
    const st = state.rerolls[iid];
    if (!st?.pending) return err(`у предмета "${iid}" нет ожидающего реролла (mods reroll <iid>)`);

    let applied = false;
    let final: RolledModEntry[] | undefined;
    if (choice === 'new') {
      const subject = this.deps.getSubject(iid);
      if (!subject) {
        // предмет исчез (продан/израсходован) — цикл бессмыслен, чистим ключ
        const rerolls = { ...state.rerolls };
        delete rerolls[iid];
        this.deps.setState({ ...state, rerolls });
        this.deps.markDirty();
        return err(`предмет "${iid}" не найден в инвентаре — цикл очищен`);
      }
      const forgeCards = subject.rolls.filter((r) => r.from === 'forge');
      final = [...st.pending.variant, ...forgeCards];
      const applyR = this.deps.applyRolls(iid, final);
      if (!applyR.ok) {
        // применение не удалось (валидация партии) — pending сохраняем,
        // инфляцию НЕ сбрасываем: выбор не завершён, деньги не пропали зря
        return err(applyR.error);
      }
      applied = true;
    }

    const rerolls = { ...state.rerolls };
    delete rerolls[iid]; // «сбрасывается при выборе» — инфляция обнуляется
    this.deps.setState({ ...state, rerolls });
    this.deps.markDirty();
    return ok(applied ? { iid, applied, rolls: final } : { iid, applied });
  }
}
