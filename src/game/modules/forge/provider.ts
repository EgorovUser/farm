/**
 * forgingProvider (карточка M10 §6) — станочные моды заточки в StatBus.
 *
 * [R3 · M10.1] доставляет ТОЛЬКО эффекты станка M10: бонус «Точильного
 * круга» (inc к процентному стату forge.success.bonus, база 100 — прецедент
 * craft.qualityBonus). ПОТОЛОК заточки НЕ дублирует: единственный источник —
 * craftStationProvider (M09, AUDIT-M09-верифицирован; дубль = нарушение
 * «один источник истины» 02-BUSES §1).
 */
import type { Modifier, ModifierProvider, ResolveCtx } from '@/kernel/bus/stat-bus/modifier';
import type { StatId } from '@/shared/types/ids';
import type { ForgeTable } from '@/content/balance/forging';
import type { ForgeState } from './state';

export class ForgingProvider implements ModifierProvider {
  readonly id = 'forge.whetstone';

  constructor(
    private readonly deps: {
      table: ForgeTable;
      getState(): ForgeState;
    },
  ) {}

  provide(stat: StatId, _ctx: ResolveCtx): Modifier[] {
    void _ctx; // фильтрацию (условия/теги/срок) делает StatBus
    if (stat !== 'forge.success.bonus') return [];
    const state = this.deps.getState();
    if (!state.stations.whetstone || !state.stations.upgrades.includes('whetstone_circle')) {
      return [];
    }
    const { bonusInc } = this.deps.table.whetstoneCircle;
    if (bonusInc <= 0) return [];
    return [
      {
        id: 'forge.whetstone.circle',
        source: { kind: 'upgrade', refId: 'whetstone_circle' },
        stat,
        op: 'inc',
        value: bonusInc,
        label: `точильный круг: +${bonusInc}% к шансу заточки`,
      },
    ];
  }
}
