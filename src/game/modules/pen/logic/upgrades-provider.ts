/**
 * Провайдер улучшений загона (M06.2, бриф F3; прецедент farmUpgradesProvider
 * M05.3): статовые эффекты купленных улучшений — модификаторами отсюда;
 * код улучшений не трогается («улучшение = данные + TransactionService»).
 *
 * Источник модов: эффект {t:'mods'} купленных улучшений («Пастбище-люкс»:
 * flat +10 на pen.happiness.bonus, тег 'pen' — [DECISION-форма: flat к капу
 * 100], эффективное счастье min(100, raw + бонус)). Поведенческие улучшения
 * (Амбар/Автокормушки/Тёплый/Родильный/Второй/Симбиоз) модов НЕ имеют —
 * модуль читает их из данных (прецедент спринклеров/компостера фермы).
 */
import type { Modifier, ModifierProvider, ResolveCtx } from '@/kernel/bus/stat-bus/modifier';
import type { StatId } from '@/shared/types/ids';
import type { PenUpgradeDef } from '@/content/pen/upgrades';
import type { PenState } from '../state';

export const PEN_UPGRADES_PROVIDER_ID = 'penUpgradesProvider';

export function makePenUpgradesProvider(
  getState: () => PenState,
  upgrades: PenUpgradeDef[],
): ModifierProvider {
  return {
    id: PEN_UPGRADES_PROVIDER_ID,
    provide(stat: StatId, _ctx: ResolveCtx): Modifier[] {
      const bought = getState().upgrades;
      if (bought === undefined) return [];
      const out: Modifier[] = [];
      for (const def of upgrades) {
        if ((bought[def.id] ?? 0) < 1) continue;
        const e = def.effect;
        if (e.t !== 'mods') continue;
        for (const m of e.mods) {
          if (m.stat !== stat) continue;
          out.push({
            id: `pen.upg.${def.id}.${m.stat}.${m.tag}`,
            source: { kind: 'upgrade', refId: def.id },
            stat,
            op: m.op,
            value: m.value,
            tags: [m.tag],
            label: m.label,
          });
        }
      }
      return out;
    },
  };
}
