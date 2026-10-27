/**
 * Провайдер штрафа сорняков (F2 брифа M05.2, карточка §4 «−25%/стадия»).
 *
 * [DECISION · F2] кумулятивный штраф — ОДИН мод со значением
 * −growthPenaltyPercent × weeds (op inc) на стат 'farm.growthSpeed' с тегом
 * тайла: резолв с ctx.tags ∋ 'farm:tile:<tab>:<idx>' даёт эффективную
 * скорость тайла = база × (1 − 0.25 × weeds) — оракул-инвариант
 * стадия 1 → −25% / 2 → −50% / 3 → −75%. Три отдельных inc-мода в одной
 * stackGroup дали бы max = −25% (НЕ то); без группы — складывались бы
 * постадийно только при трёх публикациях — мод один, значение кратно
 * стадии: минимальная поверхность, ноль магии в шине.
 *
 * Провайдер регистрируется модулем при активации (манифест
 * modifierProviders) и опрашивается шиной лениво; ctx без тега тайла —
 * модулевая база скорости (посадка/удобрение сорняков не видят).
 */
import type { Modifier, ModifierProvider, ResolveCtx } from '@/kernel/bus/stat-bus/modifier';
import type { StatId } from '@/shared/types/ids';
import type { FarmTable } from '@/content/balance/farm';
import type { FarmState } from '../state';
import { tileTagOf } from './weeds';

export const WEEDS_PROVIDER_ID = 'farmWeedsProvider';

const TILE_TAG_PREFIX = 'farm:tile:';

export function makeWeedsProvider(getState: () => FarmState, table: FarmTable): ModifierProvider {
  return {
    id: WEEDS_PROVIDER_ID,
    provide(stat: StatId, ctx: ResolveCtx): Modifier[] {
      if (stat !== 'farm.growthSpeed') return [];
      const tag = (ctx.tags ?? []).find((t) => t.startsWith(TILE_TAG_PREFIX));
      if (!tag) return [];
      const parts = tag.split(':'); // ['farm', 'tile', '<tab>', '<idx>']
      const tabId = parts[2];
      const tileIdx = Number(parts[3]);
      if (tabId === undefined || !Number.isInteger(tileIdx)) return [];
      const tile = getState().tabs.find((t) => t.id === tabId)?.tiles.find((t) => t.index === tileIdx);
      if (!tile || tile.weeds <= 0) return [];
      return [
        {
          id: `farm.weeds.${tabId}.${tileIdx}`,
          source: { kind: 'debuff', refId: 'farm.weeds' },
          stat,
          op: 'inc',
          value: -table.weeds.growthPenaltyPercent * tile.weeds,
          tags: [tileTagOf(tabId, tileIdx)],
          label: `сорняки ${tile.weeds}/${table.weeds.maxStages} (−${table.weeds.growthPenaltyPercent}%/стадия)`,
        },
      ];
    },
  };
}
