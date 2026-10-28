/**
 * villageProvider (манифест modifierProviders ×1) — модификаторы деревни
 * (карточка M16 §1/§3; бриф §0): счастье-модификаторы и ворчун-минус к
 * налогам ЧЕРЕЗ ШИНУ (G4/G6 — «ворчун реально режет налог живьём»).
 * Эффекты зданий — M16.2, скидки репутации — M16.3 (замки §6).
 *
 *  - 'village.level': override фактическим уровнем (база 1 из bases;
 *    потребители — unlock-гейты жителей statAtLeast, будущие партнёры
 *    M16.3). До открытия деревни провайдер модов НЕ даёт — база 1.
 *  - 'village.tax.gold': inc-моды уровня/счастья/ворчунов — величины
 *    из данных tax.ts; фактический сбор = StatBus.resolve (округление
 *    шины). Провайдер чист (state → mods).
 */
import type { Modifier, ModifierProvider, ResolveCtx } from '@/kernel/bus/stat-bus/modifier';
import type { StatId } from '@/shared/types/ids';
import type { VillagerDef, VillageTable, VillageTaxTable } from '@/content/village/types';
import { villageLevelOf } from '@/content/village/table';
import { taxInfoOf, taxModifiersOf } from './logic';
import type { VillageState } from './state';

export const VILLAGE_PROVIDER_ID = 'villageProvider';

export function makeVillageProvider(
  getState: () => VillageState,
  defs: VillagerDef[],
  table: VillageTable,
  tax: VillageTaxTable,
): ModifierProvider {
  return {
    id: VILLAGE_PROVIDER_ID,
    provide(stat: StatId, _ctx: ResolveCtx): Modifier[] {
      void _ctx;
      const state = getState();
      if (!state.unlocked) return [];
      if (stat === 'village.level') {
        const level = villageLevelOf(state.xp, table.level);
        if (level <= 1) return []; // база 1 — мод не нужен
        return [
          {
            id: 'village.level.current',
            source: { kind: 'village', refId: 'village' },
            stat,
            op: 'override',
            value: level,
            priority: 10,
            label: `деревня уровня ${level} (XP ${state.xp})`,
          },
        ];
      }
      if (stat === 'village.tax.gold') {
        const info = taxInfoOf(state, defs, table, tax);
        return taxModifiersOf(info, tax).map((m) => ({
          id: m.id,
          source: { kind: 'village', refId: 'village' },
          stat,
          op: 'inc' as const,
          value: m.value,
          label: taxLabel(m.id, info, m.value),
        }));
      }
      return [];
    },
  };
}

function taxLabel(id: string, info: { level: number; avgHappiness: number; grumblers: number }, value: number): string {
  switch (id) {
    case 'village.tax.level':
      return `уровень деревни ${info.level}: ${value >= 0 ? '+' : ''}${value}%`;
    case 'village.tax.happiness':
      return `среднее счастье ${Math.round(info.avgHappiness)}: ${value >= 0 ? '+' : ''}${Math.round(value * 10) / 10}%`;
    case 'village.tax.grumbler':
      return `ворчуны (${info.grumblers}): ${value}%`;
    default:
      return id;
  }
}
