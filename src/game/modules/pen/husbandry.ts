/**
 * PenHusbandry (M06.2, брифы F2–F5): болезни-уход, улучшения, разведение,
 * продажа молодняка, навоз-цикл. Паттерн PenActions/PenCollect — колбэки
 * app-слоя (withEnergy/deliverProduct/probeCapacity), золото/предметы —
 * ТОЛЬКО TransactionService (eventId 'pen.heal' / 'pen.upgrade' /
 * 'pen.sell' / 'pen.manure' / 'pen.compost').
 *
 * F2 лечение: лекарство «Лекарство для животных» (живой деф animal_remedy +
 * рецепт al_animal_remedy Алхимического котла — сверены по ContentRegistry,
 * прецедент Корма M06.1 §3.6; создание не потребовалось); энергия 0 — уход
 * за больным не труд [DECISION]; выздоровление → health 100 + иммунитет 48ч
 * (та же форма, что временем).
 *
 * F5 разведение: pen.breed <idx1> <idx2> — валидация breedCheck (Родильный
 * загон, один процесс, один вид, оба здоровы и сыты); рождение — лениво
 * (logic/breeding.tryBirth из часового прохода/сворки).
 *
 * F4 навоз: pen.manure take — буфер → предметы «Навоз» в инвентарь
 * (канон d23: проба вместимости ДО выдачи; дальше — живой путь M05:
 * компостер фермы принимает навоз при прополке, без импортов).
 */
import type { TransactionService } from '@/kernel/services/transaction/transaction-service';
import type { TimeService } from '@/kernel/time/time-service';
import type { SaveDirector } from '@/kernel/save/save-director';
import type { ID } from '@/shared/types/ids';
import type { Result } from '@/shared/types/result';
import { err, ok } from '@/shared/types/result';
import type { AnimalDef } from '@/content/pen/animals';
import type { PenUpgradeDef } from '@/content/pen/upgrades';
import type { PenTable } from '@/content/balance/pen';
import type { AnimalInstance, BreedingInfo, PenState } from './state';
import { canonicalAnimal, localDayIndex } from './state';
import type { PenActions } from './actions';
import { breedCheck } from './logic/breeding';

export interface PenHusbandryDeps {
  transaction: TransactionService;
  time: TimeService;
  save: SaveDirector;
  table: PenTable;
  animals: AnimalDef[];
  upgradesDefs: PenUpgradeDef[];
  actions: PenActions;
  getState(): PenState;
  setState(s: PenState): void;
  /** inventory.canAcquire — проба вместимости до выдачи (канон d23) */
  probeCapacity(defId: ID, qty: number): Result<{ fits: boolean; free: number; newEntries: number }>;
}

export interface UpgradeReceipt {
  id: string;
  name: string;
  level: number;
  maxLevel: number;
  description: string;
}

export class PenHusbandry {
  private readonly d: PenHusbandryDeps;

  constructor(deps: PenHusbandryDeps) {
    this.d = deps;
  }

  /** F2: лечение лекарством (энергия 0 — прямой путь, прецедент pet) */
  heal(idx: number, pen: 1 | 2 = 1): Result<{ idx: number; health: number; immuneHours: number }> {
    const animal = this.d.actions.list(pen)[idx];
    if (!animal) return err(`в загоне ${pen} нет животного №${idx} (pen.state — витрина)`);
    const now = this.d.time.now();
    const healMs = this.d.table.sickness.healHours * 3_600_000;
    const sick = animal.sickAt !== undefined && now < animal.sickAt + healMs;
    if (!sick) return err(`животное №${idx} здорово (лечить нечего — pen.state)`);
    const pay = this.d.transaction.transact({
      costs: [{ t: 'item', defId: 'animal_remedy', qty: 1 }],
      eventId: 'pen.heal',
      reason: `лечение животного №${idx} (загон ${pen})`,
    });
    if (!pay.ok) {
      return err(`${pay.error} — сварите «Лекарство для животных» (Алхимический котёл: al_animal_remedy)`);
    }
    this.patch(idx, pen, { health: 100, sickAt: undefined, immuneUntil: now + this.d.table.sickness.immunityHours * 3_600_000 });
    return ok({ idx, health: 100, immuneHours: this.d.table.sickness.immunityHours });
  }

  /** F5: запуск разведения (валидация; рождение — лениво по dueAt) */
  breed(idx1: number, idx2: number, pen: 1 | 2 = 1): Result<{ speciesId: string; dueAt: number; maxParentTier: string }> {
    const now = this.d.time.now();
    const check = breedCheck(
      this.d.getState(), this.d.table, this.d.animals,
      { has: (id) => (this.d.getState().upgrades?.[id] ?? 0) >= 1 },
      idx1, idx2, pen, now,
    );
    if (!check.ok) return err(check.error);
    const info: BreedingInfo = { pen, speciesId: this.d.actions.list(pen)[idx1]!.speciesId, maxParentTier: check.maxParentTier, dueAt: check.dueAt };
    this.d.setState({ ...this.d.getState(), breeding: info });
    this.d.save.markDirty();
    return ok({ speciesId: info.speciesId, dueAt: info.dueAt, maxParentTier: info.maxParentTier });
  }

  /** F5: продажа животного (50% цены покупки; больное — отказ) */
  sell(idx: number, pen: 1 | 2 = 1): Result<{ idx: number; gold: number; speciesId: string }> {
    const animal = this.d.actions.list(pen)[idx];
    if (!animal) return err(`в загоне ${pen} нет животного №${idx} (pen.state — витрина)`);
    const now = this.d.time.now();
    const healMs = this.d.table.sickness.healHours * 3_600_000;
    if (animal.sickAt !== undefined && now < animal.sickAt + healMs) {
      return err(`животное №${idx} больно — вылечите сначала (pen.heal ${idx})`);
    }
    const def = this.d.animals.find((a) => a.id === animal.speciesId);
    if (!def) return err(`вид ${animal.speciesId} не найден (pen.animals — каталог)`);
    const gold = Math.floor(def.price * this.d.table.breeding.sellFactor);
    const tx = this.d.transaction.transact({
      grants: [{ t: 'currency', id: 'gold', qty: gold }],
      eventId: 'pen.sell',
      reason: `продажа животного ${def.name} №${idx} (загон ${pen})`,
    });
    if (!tx.ok) return err(tx.error);
    const list = this.d.actions.list(pen).filter((_, i) => i !== idx);
    if (pen === 1) this.d.setState({ ...this.d.getState(), animals: list });
    else this.d.setState({ ...this.d.getState(), animals2: list });
    this.d.save.markDirty();
    return ok({ idx, gold, speciesId: def.id });
  }

  /** F3: покупка улучшения (TransactionService eventId pen.upgrade, БЕЗ энергии) */
  upgrade(id: string): Result<UpgradeReceipt> {
    const def = this.d.upgradesDefs.find((u) => u.id === id);
    if (!def) return err(`улучшение «${id}» не найдено (pen.upgrades — витрина)`);
    const level = this.d.getState().upgrades?.[id] ?? 0;
    const maxLevel = def.effect.t === 'slots' ? def.effect.maxLevels : 1;
    if (level >= maxLevel) {
      return err(
        maxLevel > 1
          ? `«${def.name}» уже максимального уровня (${level}/${maxLevel})`
          : `«${def.name}» уже куплено`,
      );
    }
    const pay = this.d.transaction.transact({
      costs: [{ t: 'currency', id: 'gold', qty: def.cost.qty }],
      eventId: 'pen.upgrade',
      reason: `покупка улучшения «${def.name}»${maxLevel > 1 ? ` (уровень ${level + 1})` : ''}`,
    });
    if (!pay.ok) return err(pay.error);
    const upgrades = { ...(this.d.getState().upgrades ?? {}), [id]: level + 1 };
    this.d.setState({ ...this.d.getState(), upgrades });
    this.d.save.markDirty();
    return ok({
      id: def.id,
      name: def.name,
      level: level + 1,
      maxLevel,
      description: def.description,
    });
  }

  /** F3: витрина улучшений (доступные/купленные; прецедент farm.upgrades) */
  upgradesView(): {
    rows: Array<{ id: string; name: string; description: string; price: number; level: number; maxLevel: number }>;
  } {
    const bought = this.d.getState().upgrades ?? {};
    return {
      rows: this.d.upgradesDefs.map((def) => {
        const maxLevel = def.effect.t === 'slots' ? def.effect.maxLevels : 1;
        return {
          id: def.id,
          name: def.name,
          description: def.description,
          price: def.cost.qty,
          level: bought[def.id] ?? 0,
          maxLevel,
        };
      }),
    };
  }

  /** F4: витрина буфера навоза */
  manureView(): { manure: number; cap: number } {
    return { manure: this.d.getState().manure ?? 0, cap: this.d.table.manure.cap };
  }

  /** F4: ручной обмен — буфер → предметы «Навоз» в инвентарь (d23-проба) */
  manureTake(qty?: number): Result<{ taken: number }> {
    const have = this.d.getState().manure ?? 0;
    if (have <= 0) return err('буфер навоза пуст (навоз дают кормления — pen.manure)');
    const take = Math.min(have, qty === undefined ? have : Math.max(1, Math.floor(qty)));
    const probe = this.d.probeCapacity('manure', take);
    if (!probe.ok) return err(probe.error);
    if (!probe.value.fits) {
      return err(`в инвентаре нет места для «Навоз» ×${take} — освободите слоты (inv list)`);
    }
    const tx = this.d.transaction.transact({
      grants: [{ t: 'item', defId: 'manure', qty: take }],
      eventId: 'pen.manure',
      reason: `ручной обмен: навоз ×${take} → инвентарь (дальше — компостер фермы)`,
    });
    if (!tx.ok) return err(tx.error);
    const s = this.d.getState();
    const left = have - take;
    const next: PenState = { ...s };
    if (left > 0) next.manure = left;
    else delete next.manure;
    this.d.setState(next);
    this.d.save.markDirty();
    return ok({ taken: take });
  }

  /** dev-форс болезни (заявлен SESSION-M06 §3.8): тот же переход, что ролл —
   *  health → sickHealth, sickAt = now, событие pen.animalSick публикуется */
  devSick(idx: number, pen: 1 | 2 = 1): Result<{ idx: number; health: number; dayIndex: number }> {
    const animal = this.d.actions.list(pen)[idx];
    if (!animal) return err(`в загоне ${pen} нет животного №${idx} (pen.state — витрина)`);
    const now = this.d.time.now();
    const healMs = this.d.table.sickness.healHours * 3_600_000;
    if (animal.sickAt !== undefined && now < animal.sickAt + healMs) {
      return err(`животное №${idx} уже болеет (pen.state — таймер лечения)`);
    }
    if (animal.immuneUntil !== undefined && now < animal.immuneUntil) {
      return err(`животное №${idx} иммуно до ${new Date(animal.immuneUntil).toLocaleTimeString('ru-RU')} (после выздоровления)`);
    }
    this.patch(idx, pen, { health: this.d.table.sickness.sickHealth, sickAt: now });
    return ok({ idx, health: this.d.table.sickness.sickHealth, dayIndex: localDayIndex(now) });
  }

  // ---------------------------------------------------------------- internals

  private patch(idx: number, pen: 1 | 2, patch: Partial<AnimalInstance>): void {
    const list = this.d.actions.list(pen).map((a, i) => (i === idx ? canonicalAnimal({ ...a, ...patch }) : a));
    if (pen === 1) this.d.setState({ ...this.d.getState(), animals: list });
    else this.d.setState({ ...this.d.getState(), animals2: list });
    this.d.save.markDirty();
  }
}
