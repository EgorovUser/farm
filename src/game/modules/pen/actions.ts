/**
 * PenActions (M06.1 + M06.2, карточка M06 §2–§3; брифы F5/F6 + F3/F4):
 * покупка животных и уход (кормить/чистить/гладить) с адресацией загона
 * (pen 1|2 — «Второй загон» F3; по умолчанию 1).
 *
 * Изоляция (01 §5–§7): модуль не импортирует другие модули; контент —
 * чтение общих реестров (П4 п.6); энергия и золото/Корм — колбэки app-слоя
 * через ModuleRegistry (паттерн farm, прецеденты D33/D38/C4):
 *   withEnergy → player.withEnergy (энергию списывает ТОЛЬКО успех действия);
 *   золото покупки и Корм кормления — ТОЛЬКО TransactionService (eventId
 *   'pen.buy' / 'pen.feed'; покупка БЕЗ энергии — прецеденты shop.buy).
 *
 * Покупка: гейт unlock → свободный слот ЗАГОНА (база + Амбар; pen2 — только
 * после «Второго загона») → транзакция → ролл качества именованным стримом
 * `pen:buy:<species>` (П6) → экземпляр по 03-DATA §6.
 *
 * Уход: дневные лимиты 1/животное/день (fedDay/pettedDay), satiety/
 * cleanliness → 100, гладить +5 счастья (энергия 0); [M06.2 F4] каждое
 * кормление +1 навоз в буфер (кап — данные); [M06.2 F3] машинное кормление
 * автокормушек — без энергии (механизм; прецедент спринклеров).
 */
import type { EventBus } from '@/kernel/bus/event-bus/event-bus';
import type { RngBus } from '@/kernel/bus/rng-bus/rng-bus';
import type { StatBus } from '@/kernel/bus/stat-bus/stat-bus';
import type { TransactionService } from '@/kernel/services/transaction/transaction-service';
import type { TimeService } from '@/kernel/time/time-service';
import type { SaveDirector } from '@/kernel/save/save-director';
import type { StatId } from '@/shared/types/ids';
import type { Result } from '@/shared/types/result';
import { err, ok } from '@/shared/types/result';
import type { AnimalDef } from '@/content/pen/animals';
import type { PenUpgradeDef } from '@/content/pen/upgrades';
import type { PenTable } from '@/content/balance/pen';
import type { ConditionCtx } from '@/shared/types/requirement';
import { checkCondition } from '@/shared/utils/condition-check';
import type { AnimalInstance, PenState } from './state';
import { canonicalAnimal, localDayIndex } from './state';
import { gateTextOf } from './logic/gates';
import { rollBuyQualityTier, rollBuyQualityValue } from './logic/quality';
import { addManure } from './logic/manure';

export interface PenActionsDeps {
  bus: EventBus;
  rngBus: RngBus;
  statBus: StatBus;
  transaction: TransactionService;
  time: TimeService;
  save: SaveDirector;
  table: PenTable;
  animals: AnimalDef[];
  upgradesDefs: PenUpgradeDef[];
  getState(): PenState;
  setState(s: PenState): void;
  gateCtx(): ConditionCtx;
  withEnergy(stat: StatId, action: () => Result<unknown>, reason?: string): Result<unknown>;
}

export interface BuyReceipt {
  species: string;
  name: string;
  quality: { tier: string; value: number };
  nextProduceAt: number;
  slotsUsed: number;
  slotsBase: number;
  pen: 1 | 2;
}

export class PenActions {
  private readonly d: PenActionsDeps;
  private readonly byId: Map<string, AnimalDef>;

  constructor(deps: PenActionsDeps) {
    this.d = deps;
    this.byId = new Map(deps.animals.map((a) => [a.id, a] as const));
  }

  defOf(species: string): AnimalDef | undefined {
    return this.byId.get(species);
  }

  /** животные загона (pen 1|2; animals2 — после покупки «Второго загона») */
  list(pen: 1 | 2): AnimalInstance[] {
    return pen === 1 ? this.d.getState().animals : (this.d.getState().animals2 ?? []);
  }

  private setList(pen: 1 | 2, list: AnimalInstance[]): void {
    const s = this.d.getState();
    this.d.setState(pen === 1 ? { ...s, animals: list } : { ...s, animals2: list });
  }

  /** слоты загона: база (данные) + Амбар ×уровень ([DECISION] оба загона) */
  slots(pen: 1 | 2): { used: number; base: number } {
    const barn = this.d.upgradesDefs.find((u) => u.effect.t === 'slots');
    let add = 0;
    if (barn && barn.effect.t === 'slots') {
      add = (this.d.getState().upgrades?.[barn.id] ?? 0) * barn.effect.addPerLevel;
    }
    return { used: this.list(pen).length, base: this.d.table.slots.base + add };
  }

  /** куплен ли «Второй загон» (адресация pen 2) */
  pen2Ready(): boolean {
    const def = this.d.upgradesDefs.find((u) => u.effect.t === 'pen2');
    return def !== undefined && (this.d.getState().upgrades?.[def.id] ?? 0) >= 1;
  }

  /** витрина каталога животных (П6: цены/периоды/замки видны) */
  view(): {
    rows: Array<{
      id: string;
      name: string;
      price: number;
      produce: { defId: string; periodHours: number; qty: number };
      gateText: string | null;
      owned: number;
    }>;
  } {
    const ctx = this.d.gateCtx();
    const owned = new Map<string, number>();
    for (const a of [...this.d.getState().animals, ...(this.d.getState().animals2 ?? [])]) {
      owned.set(a.speciesId, (owned.get(a.speciesId) ?? 0) + 1);
    }
    return {
      rows: this.d.animals.map((def) => ({
        id: def.id,
        name: def.name,
        price: def.price,
        produce: { ...def.produce },
        gateText: checkCondition(def.unlock, ctx) ? null : gateTextOf(def.unlock ?? { t: 'unknown' }),
        owned: owned.get(def.id) ?? 0,
      })),
    };
  }

  /** покупка животного: гейт → слот → транзакция → ролл качества → экземпляр */
  buy(species: string, pen: 1 | 2 = 1): Result<BuyReceipt> {
    const def = this.byId.get(species);
    if (!def) return err(`животное «${species}» не найдено (pen.animals — каталог)`);
    if (pen === 2 && !this.pen2Ready()) {
      return err('второй загон не построен (pen.upgrade upg_second_pen)');
    }
    const ctx = this.d.gateCtx();
    if (!checkCondition(def.unlock, ctx)) {
      return err(`${species}: Откроется: ${gateTextOf(def.unlock ?? { t: 'unknown' })}`);
    }
    const s = this.d.getState();
    const slots = this.slots(pen);
    if (slots.used >= slots.base) {
      return err(
        `в загоне ${pen} нет свободных слотов (${slots.used}/${slots.base}; Амбар расширяет — pen.upgrades)`,
      );
    }
    const pay = this.d.transaction.transact({
      costs: [{ t: 'currency', id: 'gold', qty: def.price }],
      eventId: 'pen.buy',
      reason: `покупка животного ${def.name} (загон ${pen})`,
    });
    if (!pay.ok) return err(pay.error);
    // [F5] качество роллится ПОКУПКОЙ: именованный стрим pen:buy:<species>
    const tier = rollBuyQualityTier(this.d.rngBus, this.d.table, species);
    const value = rollBuyQualityValue(this.d.rngBus, species);
    const now = this.d.time.now();
    const newborn = this.d.table.newborn;
    const list = [...this.list(pen), canonicalAnimal({
      speciesId: def.id,
      quality: tier,
      happiness: newborn.happiness,
      satiety: newborn.satiety,
      health: newborn.health,
      cleanliness: newborn.cleanliness,
      nextProduceAt: now + def.produce.periodHours * 3_600_000,
    })];
    this.setList(pen, list);
    this.d.save.markDirty();
    return ok({
      species: def.id,
      name: def.name,
      quality: { tier, value },
      nextProduceAt: now + def.produce.periodHours * 3_600_000,
      slotsUsed: list.length,
      slotsBase: slots.base,
      pen,
    });
  }

  /** кормление: 1 «Корм» (валюта feed) транзакцией, satiety → 100, 1/день;
   *  [M06.2 F4] каждое кормление +1 навоз в буфер (кап — данные) */
  feed(idx: number, pen: 1 | 2 = 1): Result<{ idx: number; satiety: number }> {
    return this.withAnimal(idx, pen, 'кормление', (animal, today) => {
      if (animal.fedDay === today) return err(`животное №${idx} уже кормлено сегодня (лимит 1/день)`);
      const act = (): Result<unknown> => {
        const pay = this.d.transaction.transact({
          costs: [{ t: 'currency', id: 'feed', qty: 1 }],
          eventId: 'pen.feed',
          reason: `кормление животного №${idx} (загон ${pen})`,
        });
        if (!pay.ok) return err(pay.error);
        this.patch(idx, pen, { satiety: this.d.table.care.feedSatiety, fedDay: today });
        this.d.setState(addManure(this.d.getState(), this.d.table));
        this.d.save.markDirty();
        return ok({ idx, satiety: this.d.table.care.feedSatiety });
      };
      return this.d.withEnergy('action.pen.feed.energyCost', act, `кормление №${idx}`) as Result<{
        idx: number;
        satiety: number;
      }>;
    });
  }

  /** [M06.2 F3] машинное кормление автокормушек: БЕЗ энергии (механизм,
   *  прецедент спринклеров) — транзакция Корма + satiety → 100 + навоз */
  feedByMachine(idx: number, pen: 1 | 2, today: number): boolean {
    const animal = this.list(pen)[idx];
    if (!animal || animal.fedDay === today) return false;
    const pay = this.d.transaction.transact({
      costs: [{ t: 'currency', id: 'feed', qty: 1 }],
      eventId: 'pen.feed',
      reason: `автокормушка: животное №${idx} (загон ${pen})`,
    });
    if (!pay.ok) return false;
    this.patch(idx, pen, { satiety: this.d.table.care.feedSatiety, fedDay: today });
    this.d.setState(addManure(this.d.getState(), this.d.table));
    this.d.save.markDirty();
    return true;
  }

  /** чистка: cleanliness → 100 (энергия 2; без предмета и лимита) */
  clean(idx: number, pen: 1 | 2 = 1): Result<{ idx: number; cleanliness: number }> {
    return this.withAnimal(idx, pen, 'чистка', () => {
      const act = (): Result<{ idx: number; cleanliness: number }> => {
        this.patch(idx, pen, { cleanliness: this.d.table.care.cleanCleanliness });
        return ok({ idx, cleanliness: this.d.table.care.cleanCleanliness });
      };
      return this.d.withEnergy('action.pen.clean.energyCost', act, `чистка №${idx}`) as Result<{
        idx: number;
        cleanliness: number;
      }>;
    });
  }

  /** гладить: +5 счастья, энергия 0, лимит 1/день */
  pet(idx: number, pen: 1 | 2 = 1): Result<{ idx: number; happiness: number }> {
    return this.withAnimal(idx, pen, 'глажение', (animal, today) => {
      if (animal.pettedDay === today) {
        return err(`животное №${idx} уже гладили сегодня (лимит 1/день)`);
      }
      const happiness = Math.min(100, animal.happiness + this.d.table.care.petHappiness);
      const act = (): Result<{ idx: number; happiness: number }> => {
        this.patch(idx, pen, { happiness, pettedDay: today });
        return ok({ idx, happiness });
      };
      // [F6] энергия 0 (карточка §3): бесплатное действие — withEnergy только
      // при ненулевой стоимости (мод-путь жив: стоимость резолвится из данных)
      const cost = this.d.statBus.resolve({
        stat: 'action.pen.pet.energyCost',
        ctx: { ...this.d.time.ctx('player') },
      });
      if (cost <= 0) return act();
      return this.d.withEnergy('action.pen.pet.energyCost', act, `гладить №${idx}`) as Result<{
        idx: number;
        happiness: number;
      }>;
    });
  }

  // ---------------------------------------------------------------- internals

  private withAnimal<T>(
    idx: number,
    pen: 1 | 2,
    label: string,
    run: (animal: PenState['animals'][number], today: number) => Result<T>,
  ): Result<T> {
    const animal = this.list(pen)[idx];
    if (!animal) return err(`в загоне ${pen} нет животного №${idx} (pen.state — витрина)`);
    void label;
    const today = localDayIndex(this.d.time.now());
    return run(animal, today);
  }

  /** точечная правка животного (канонический порядок — roundtrip байт-в-байт) */
  private patch(idx: number, pen: 1 | 2, patch: Partial<PenState['animals'][number]>): void {
    const list = this.list(pen).map((a, i) => (i === idx ? canonicalAnimal({ ...a, ...patch }) : a));
    this.setList(pen, list);
    this.d.save.markDirty();
  }
}
