/**
 * Улучшения шахты M13.1+M13.2 — покупки навсегда (бриф R6 + R7): TransactionService
 * eventId mine.upgrade, ленивое поле upgrades? среза. [M13.2] повторяемые
 * покупки (Отряд: старт 1 → 2 → 3, кап данными; цены повторных — repeatCosts):
 * при капе — честный отказ «отряд полон». Эффекты читают потребители:
 * bagSlots — run.ts; lighting/campgear/saturation/status — провайдер
 * runBuffProvider и resolve.ts; barracks/squad — helpers-hire.ts.
 */
import type { Result } from '@/shared/types/result';
import { err, ok } from '@/shared/types/result';
import type { MineUpgradeDef } from '@/content/mine/upgrades';
import type { RunCtx } from './run';
import { purchasesOf } from './helpers-hire';

export interface UpgradesView {
  header: string;
  lines: string[];
}

export function upgradesView(x: RunCtx): UpgradesView {
  const state = x.getState();
  const lines: string[] = [];
  for (const u of x.upgradeDefs) {
    const bought = purchasesOf(state, u.id);
    const maxP = 1 + (u.repeatCosts?.length ?? 0);
    const price = bought === 0 ? u.costGold : bought < maxP ? u.repeatCosts?.[bought - 1] : undefined;
    lines.push(
      `[${bought >= maxP ? '×' : ' '}] ${u.name} — ${price !== undefined ? `${price}з` : '—'}: ${u.desc}${bought > 0 ? ` · КУПЛЕНО${maxP > 1 ? ` (${bought}/${maxP})` : ''}` : ''}`,
    );
  }
  return { header: `Улучшения шахты (покупки навсегда, eventId mine.upgrade)`, lines };
}

/** mine upgrades.buy <id> — атомарная покупка за золото (повторяемые — до капа) */
export function buyUpgrade(x: RunCtx, idRaw: string): Result<UpgradesView> {
  const def = x.upgradeDefs.find((u) => u.id === idRaw);
  if (def === undefined) {
    return err(`неизвестное улучшение: ${idRaw} (реестр: ${x.upgradeDefs.map((u) => u.id).join(', ')})`);
  }
  const state = x.getState();
  const bought = purchasesOf(state, def.id);
  const maxPurchases = 1 + (def.repeatCosts?.length ?? 0);
  if (bought >= maxPurchases) {
    if (def.effect.t === 'squad') {
      const eff = def.effect as { slotsPerPurchase: number };
      return err(
        `отряд полон: слоты ${x.helpersTable.baseSlots + bought * eff.slotsPerPurchase}/${x.helpersTable.slotCap} — кап данными («Отряд» куплен ${bought}/${maxPurchases})`,
      );
    }
    return err(`«${def.name}» уже куплено`);
  }
  const price = bought === 0 ? def.costGold : (def.repeatCosts?.[bought - 1] ?? def.costGold);
  const t = x.transaction.transact({
    costs: [{ t: 'currency', id: 'gold', qty: price }],
    eventId: 'mine.upgrade',
    reason: `покупка улучшения шахты: ${def.name}${maxPurchases > 1 ? ` (${bought + 1}/${maxPurchases})` : ''}`,
  });
  if (!t.ok) return err(t.error);
  const upgrades = { ...(state.upgrades ?? {}), [def.id]: bought === 0 ? true : bought + 1 };
  x.setState({ ...state, upgrades });
  x.markDirty();
  const view = upgradesView(x);
  return ok({
    header: view.header,
    lines: [`КУПЛЕНО: ${def.name}${maxPurchases > 1 ? ` (${bought + 1}/${maxPurchases})` : ''} — ${price}з (транзакция mine.upgrade)`, ...view.lines],
  });
}
