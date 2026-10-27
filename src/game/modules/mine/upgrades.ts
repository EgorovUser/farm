/**
 * Улучшения шахты M13.1 — покупки навсегда (бриф R6): TransactionService
 * eventId mine.upgrade, ленивое поле upgrades? среза. Эффекты читают
 * потребители: bagSlots — run.ts; lighting/campgear/saturation/status —
 * провайдер runBuffProvider (module.ts) и resolve.ts (реген). Числа —
 * content/mine/upgrades.ts (П6).
 */
import type { Result } from '@/shared/types/result';
import { err, ok } from '@/shared/types/result';
import type { MineUpgradeDef } from '@/content/mine/upgrades';
import type { RunCtx } from './run';

export interface UpgradesView {
  header: string;
  lines: string[];
}

export function upgradesView(x: RunCtx): UpgradesView {
  const state = x.getState();
  const lines: string[] = [];
  for (const u of x.upgradeDefs) {
    const bought = state.upgrades?.[u.id] === true;
    lines.push(
      `[${bought ? '×' : ' '}] ${u.name} — ${u.costGold}з: ${u.desc}${bought ? ' · КУПЛЕНО' : ''}`,
    );
  }
  return { header: `Улучшения шахты (покупки навсегда, eventId mine.upgrade)`, lines };
}

/** mine upgrades.buy <id> — атомарная покупка за золото */
export function buyUpgrade(x: RunCtx, idRaw: string): Result<UpgradesView> {
  const def = x.upgradeDefs.find((u) => u.id === idRaw);
  if (def === undefined) {
    return err(`неизвестное улучшение: ${idRaw} (реестр: ${x.upgradeDefs.map((u) => u.id).join(', ')})`);
  }
  const state = x.getState();
  if (state.upgrades?.[def.id] === true) {
    return err(`«${def.name}» уже куплено`);
  }
  const t = x.transaction.transact({
    costs: [{ t: 'currency', id: 'gold', qty: def.costGold }],
    eventId: 'mine.upgrade',
    reason: `покупка улучшения шахты: ${def.name}`,
  });
  if (!t.ok) return err(t.error);
  const upgrades = { ...(state.upgrades ?? {}), [def.id]: true };
  x.setState({ ...state, upgrades });
  x.markDirty();
  const view = upgradesView(x);
  return ok({
    header: view.header,
    lines: [`КУПЛЕНО: ${def.name} — ${def.costGold}з (транзакция mine.upgrade)`, ...view.lines],
  });
}
