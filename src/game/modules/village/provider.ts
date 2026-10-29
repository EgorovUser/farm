/**
 * villageProvider (манифест modifierProviders ×1) — модификаторы деревни.
 * M16.1: 'village.level' override фактическим уровнем (база 1 из bases;
 * потребители — unlock-гейты жителей statAtLeast); 'village.tax.gold'
 * inc-моды уровня/счастья/ворчунов + [M16.2] аура построек — ЧЕРЕЗ ШИНУ.
 *
 * M16.2 (эффекты зданий = ТОЛЬКО модификаторы провайдера, бриф §0):
 *  - 'village.repair.discountPercent': override силой Кузницы деревни
 *    (30/40/50; «починка за полцены» на L3) — строка-источник
 *    04-DISCOUNTS §2.2 [касса Task 86]; потребитель (проводка в цену
 *    craft.repair) — вне M16.2: M09-код read-only (§6) + [DECISION M09]
 *    «ремонт не читает PriceBus» — класс «резолв-без-проводки» (Рынок/
 *    bases M14.2); контраст живой: resolve ДО/ПОСЛЕ постройки;
 *  - 'village.market.discountPercent': override силой Рынка (5/8/10;
 *    «−10% у деревенских купцов» на L3) — БЕЗ потребителя (купцы M16.3).
 */
import type { Modifier, ModifierProvider, ResolveCtx } from '@/kernel/bus/stat-bus/modifier';
import type { StatId } from '@/shared/types/ids';
import type { VillageBuildingDef, VillagerDef, VillageTable, VillageTaxTable } from '@/content/village/types';
import { villageLevelOf } from '@/content/village/table';
import { taxInfoOf, taxModifiersOf } from './logic';
import { happinessAuraOf, marketDiscountOf, repairDiscountOf } from './buildings';
import type { VillageState } from './state';

export const VILLAGE_PROVIDER_ID = 'villageProvider';

export function makeVillageProvider(
  getState: () => VillageState,
  defs: VillagerDef[],
  table: VillageTable,
  tax: VillageTaxTable,
  buildingDefs: VillageBuildingDef[],
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
        // аура построек (Колодец/Храм/Баня) — отдельный мод (см. logic.ts)
        const info = taxInfoOf(state, defs, table, tax, happinessAuraOf(state, buildingDefs));
        return taxModifiersOf(info, tax).map((m) => ({
          id: m.id,
          source: { kind: 'village', refId: 'village' },
          stat,
          op: 'inc' as const,
          value: m.value,
          label: taxLabel(m.id, info, m.value),
        }));
      }
      if (stat === 'village.repair.discountPercent') {
        const value = repairDiscountOf(state, buildingDefs);
        if (value <= 0) return []; // база 0 — Кузницы нет
        return [
          {
            id: 'village.repair.forge',
            source: { kind: 'village', refId: 'forge_village' },
            stat,
            op: 'override',
            value,
            priority: 10,
            label: `Кузница деревни −${value}% к цене починки (источник 04-DISCOUNTS §2.2)`,
          },
        ];
      }
      if (stat === 'village.market.discountPercent') {
        const value = marketDiscountOf(state, buildingDefs);
        if (value <= 0) return []; // база 0 — Рынка нет
        return [
          {
            id: 'village.market.built',
            source: { kind: 'village', refId: 'market' },
            stat,
            op: 'override',
            value,
            priority: 10,
            label: `Рынок деревни −${value}% у деревенских купцов (потребитель — биржа M16.3)`,
          },
        ];
      }
      return [];
    },
  };
}

function taxLabel(
  id: string,
  info: { level: number; avgHappiness: number; grumblers: number; aura: number },
  value: number,
): string {
  switch (id) {
    case 'village.tax.level':
      return `уровень деревни ${info.level}: ${value >= 0 ? '+' : ''}${value}%`;
    case 'village.tax.happiness':
      return `среднее счастье ${Math.round(info.avgHappiness)}: ${value >= 0 ? '+' : ''}${Math.round(value * 10) / 10}%`;
    case 'village.tax.aura':
      return `счастье-аура построек +${info.aura}: +${Math.round(value * 10) / 10}%`;
    case 'village.tax.grumbler':
      return `ворчуны (${info.grumblers}): ${value}%`;
    default:
      return id;
  }
}
