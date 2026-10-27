/**
 * Провайдер улучшений озера (M08.2, бриф F11/F16; прецеденты penUpgradesProvider
 * M06.2 / farmUpgradesProvider M05.3): статовые эффекты купленных улучшений —
 * модификаторами отсюда; код улучшений не трогается («улучшение = данные +
 * TransactionService»). id 'lake.upgrades' [DECISION: по канону живых
 * провайдеров (fishing.bait); карточное имя lakeUpgradesProvider].
 *
 * Источник модов: эффект {t:'incubator', mods} купленных улучшений
 * ПЕР-ОЗЕРО. Эффекты локальны озеру — шина глобальна: потребитель резолвит
 * стат с контекстным тегом `lake:N` (N — индекс озера), провайдер отдаёт
 * моды только под соответствующий тег (мод несёт tags: [`lake:N`] — вне
 * контекста озера не применяется; П5: чужие резолвы стата без тега
 * получают кап без инфляции — см. ниже).
 *
 * «Инкубатор»: flat +10 к lake.mutation.plus1Bonus (база 0, content/balance/
 * lake.ts). Кап суммы X ≤ 40 («вес ≤ 50») — cap-мод провайдера value =
 * LAKE_TABLE.breeding.mutation.plusBonusCap: применяется к ИТОГУ резолва
 * (база + сумма flat-ов), поэтому будущие пассивки автоматически клампятся.
 * +2-тир = база 1% ВСЕГДА — plus2From неподвижен (потребитель breeding).
 */
import type { Modifier, ModifierProvider, ResolveCtx } from '@/kernel/bus/stat-bus/modifier';
import type { StatId } from '@/shared/types/ids';
import type { LakeTable } from '@/content/balance/lake';
import type { LakeUpgradeDef } from '@/content/lake/upgrades';
import type { LakeState } from '../state';
import { groupOf, lakeIndices } from '../state';

export const LAKE_UPGRADES_PROVIDER_ID = 'lake.upgrades';

/** тег контекста озера №N (эффекты локальны — см. докблок) */
export function lakeTagOf(idx: number): string {
  return `lake:${idx}`;
}

export function makeLakeUpgradesProvider(
  getState: () => LakeState,
  upgrades: LakeUpgradeDef[],
  table: LakeTable,
): ModifierProvider {
  return {
    id: LAKE_UPGRADES_PROVIDER_ID,
    provide(stat: StatId, ctx: ResolveCtx): Modifier[] {
      if (stat !== 'lake.mutation.plus1Bonus') return [];
      const state = getState();
      const out: Modifier[] = [];
      for (const idx of lakeIndices(state)) {
        const tag = lakeTagOf(idx);
        if (!(ctx.tags ?? []).includes(tag)) continue; // эффект — только контексту озера №N
        const bought = groupOf(state, idx).upgrades ?? [];
        for (const def of upgrades) {
          if (!bought.includes(def.id)) continue;
          if (def.effect.t !== 'incubator') continue;
          for (const m of def.effect.mods) {
            if (m.stat !== stat) continue;
            out.push({
              id: `lake.upg.${def.id}.${m.stat}.${idx}`,
              source: { kind: 'upgrade', refId: def.id },
              stat,
              op: m.op,
              value: m.value,
              tags: [tag],
              label: `${m.label} (озеро №${idx + 1})`,
            });
          }
        }
        // кап суммы бонусов: применяется к итогу (база + Σ flat) — данные
        out.push({
          id: `lake.upg.cap.${idx}`,
          source: { kind: 'upgrade', refId: 'lake.mutation.cap' },
          stat,
          op: 'cap',
          value: table.breeding.mutation.plusBonusCap,
          tags: [tag],
          label: `кап бонуса +1-тира ${table.breeding.mutation.plusBonusCap} п.п. (вес ≤ 50)`,
        });
      }
      return out;
    },
  };
}
