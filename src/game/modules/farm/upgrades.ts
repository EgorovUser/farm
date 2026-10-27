/**
 * FarmUpgrades (M05.3 · G1/G2/G3): покупки улучшений фермы — данные
 * content/farm/upgrades.ts + TransactionService (карточка §6 «улучшение =
 * данные + вызов TransactionService; код не трогается»).
 *
 * Покупка: гейт unlock (обычно уровень) → повтор/вкладка уже открыта →
 * транзакция золота (eventId 'farm.upgrade') → применение эффекта:
 *   openTab — вкладка в состояние (свои тайлы; вид вкладки);
 *   прочие эффекты (mods/sprinkler/composter/tierBonus) — id в
 *   state.upgrades; потребители читают покупку через purchased()/провайдера.
 *
 * Витрина farm.upgrades: доступные/купленные, цены, замки (П6).
 *
 * [DECISION · G1] покупка БЕЗ энергии — это транзакция золота, не труд
 * (прецеденты shop.buy / craft.station); энергии действий фермы не тронуты.
 */
import type { TransactionService } from '@/kernel/services/transaction/transaction-service';
import type { TimeService } from '@/kernel/time/time-service';
import type { SaveDirector } from '@/kernel/save/save-director';
import type { Result } from '@/shared/types/result';
import { err, ok } from '@/shared/types/result';
import type { ConditionCtx } from '@/shared/types/requirement';
import { checkCondition } from '@/shared/utils/condition-check';
import type { FarmUpgradeDef } from '@/content/farm/upgrades';
import type { FarmState } from './state';
import { makeTab } from './state';
import { gateTextOf } from './logic/gates';

export interface FarmUpgradesDeps {
  upgrades: FarmUpgradeDef[];
  transaction: TransactionService;
  time: TimeService;
  save: SaveDirector;
  getState(): FarmState;
  setState(s: FarmState): void;
  gateCtx(): ConditionCtx;
  /** сторона эффектов (модуль): invalidate.stat; спринклеры — регистрация
   *  исполнителя farm.sprinkler (карточка §6 «через TaskRegistry») */
  onApplied(def: FarmUpgradeDef): void;
}

export interface FarmUpgradeRow {
  id: string;
  name: string;
  description: string;
  cost: { currency: string; qty: number };
  gateText: string | null;
  purchased: boolean;
  effectText: string;
}

/** человекочитаемое описание эффекта (витрина П6) */
export function effectTextOf(def: FarmUpgradeDef): string {
  const e = def.effect;
  switch (e.t) {
    case 'openTab':
      return `вкладка «${def.name}» (${e.kind}, ${e.tiles} тайлов)${e.speedPercent ? ` · +${e.speedPercent}% скорости` : ''}`;
    case 'mods':
      return e.mods.map((m) => `${m.stat} ${m.op} ${m.value > 0 ? '+' : ''}${m.value} [${m.tag}]`).join('; ');
    case 'sprinkler':
      return `автополив всех растущих раз в ${e.intervalHours} ч (исполнитель farm.sprinkler)`;
    case 'composter':
      return `прополка с навозом (${e.input.item} ×${e.input.qty}) → ${e.output.currency} ×${e.output.qty}`;
    case 'tierBonus':
      return `+1 тир качества сборов вкладки ${e.tabKind}`;
  }
}

export class FarmUpgrades {
  private readonly d: FarmUpgradesDeps;

  constructor(deps: FarmUpgradesDeps) {
    this.d = deps;
  }

  private defOf(id: string): FarmUpgradeDef | undefined {
    return this.d.upgrades.find((u) => u.id === id);
  }

  purchased(): Set<string> {
    return new Set(this.d.getState().upgrades);
  }

  has(id: string): boolean {
    return this.purchased().has(id);
  }

  /** [M05.3 · G2] купленный Компостер (вход/выход обмена) или null */
  composterOf(): { input: { item: string; qty: number }; output: { currency: string; qty: number } } | null {
    for (const def of this.d.upgrades) {
      if (def.effect.t === 'composter' && this.has(def.id)) return def.effect;
    }
    return null;
  }

  /** [M05.3 · G4] «Парник-люкс»: сумма tierBonus-эффектов купленных
   *  улучшений для вкладки tabKind (каждый +1 тир; текущий контент — один) */
  tierBonusOf(tabKind: string): number {
    let bonus = 0;
    for (const def of this.d.upgrades) {
      if (def.effect.t === 'tierBonus' && def.effect.tabKind === tabKind && this.has(def.id)) bonus += 1;
    }
    return bonus;
  }

  view(): { rows: FarmUpgradeRow[]; purchased: number; total: number } {
    const bought = this.purchased();
    const ctx = this.d.gateCtx();
    const rows: FarmUpgradeRow[] = this.d.upgrades.map((def) => {
      const gateOk = checkCondition(def.unlock, ctx);
      return {
        id: def.id,
        name: def.name,
        description: def.description,
        cost: { currency: def.cost.currency, qty: def.cost.qty },
        gateText: gateOk ? null : gateTextOf(def.unlock),
        purchased: bought.has(def.id),
        effectText: effectTextOf(def),
      };
    });
    return { rows, purchased: rows.filter((r) => r.purchased).length, total: rows.length };
  }

  /** покупка улучшения: гейт → повтор → транзакция → эффект */
  buy(id: string): Result<{ id: string; name: string }> {
    const def = this.defOf(id);
    if (!def) return err(`улучшение «${id}» не найдено (farm.upgrades — список)`);
    const ctx = this.d.gateCtx();
    if (!checkCondition(def.unlock, ctx)) {
      return err(`${id}: Откроется: ${gateTextOf(def.unlock)}`);
    }
    if (this.has(id)) return err(`${id}: уже куплено`);
    const s = this.d.getState();
    const eff = def.effect;
    if (eff.t === 'openTab' && s.tabs.some((t) => t.id === eff.tabId)) {
      return err(`${id}: вкладка «${eff.tabId}» уже открыта`);
    }
    const pay = this.d.transaction.transact({
      costs: [{ t: 'currency', id: def.cost.currency, qty: def.cost.qty }],
      eventId: 'farm.upgrade',
      reason: `покупка улучшения ${def.name}`,
    });
    if (!pay.ok) return err(pay.error);
    // применение эффекта (транзакция прошла — откатов нет: вкладка/список id)
    if (def.effect.t === 'openTab') {
      // вкладка + id в списке покупок (провайдер модов скорости читает список)
      this.d.setState({
        ...s,
        tabs: [...s.tabs, makeTab(def.effect.tabId, def.effect.kind, def.effect.tiles)],
        upgrades: [...s.upgrades, id],
      });
    } else if (def.effect.t === 'sprinkler') {
      // якорь каденса: первый автополив через intervalHours после покупки
      this.d.setState({ ...s, upgrades: [...s.upgrades, id], sprinklerAt: this.d.time.now() });
    } else {
      this.d.setState({ ...s, upgrades: [...s.upgrades, id] });
    }
    this.d.save.markDirty();
    this.d.onApplied(def);
    return ok({ id: def.id, name: def.name });
  }
}
