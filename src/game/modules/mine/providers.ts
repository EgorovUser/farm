/**
 * Провайдеры M13.1:
 *  - runBuffProvider (карточка §5, манифест modifierProviders ×1) — ЕДИНЫЙ
 *    провайдер модуля mine [DECISION]: бафы алтарей забега (duration runs —
 *    очищаются вместе с контейнером), эффекты статусов слоёв (conditions
 *    ctxTag status:<x> — действуют в резолвах с тегом: бои забега), «Насыщенность»
 *    (inc +10 на mine.oreYield первым забегом дня — модификатор дня по данным),
 *    Освещение (inc −25 на mine.hiddenChance — постоянный, режет долю скрытых
 *    40% → 30% на СЛЕДУЮЩЕЙ генерации, оракул R9);
 *  - mineTraderProvider (PriceBus, 04-DISCOUNTS §1) — кротовая наценка по
 *    данным на сток крота (ctx-тег mine:trader; поле манифеста
 *    priceModifierProviders — заявлено открыто: в перечислении R7 его не было).
 */
import type { Modifier, ModifierProvider, ResolveCtx } from '@/kernel/bus/stat-bus/modifier';
import type { PriceMod, PriceModifierProvider } from '@/kernel/bus/price-bus/price-bus';
import type { StatId, ID } from '@/shared/types/ids';
import type { MineCardDef, MineLayerStatusDef } from '@/content/mine/cards';
import type { MineUpgradeDef } from '@/content/mine/upgrades';
import { MINE_SATURATION } from '@/content/mine/cards';
import type { MineState } from './state';

export const RUN_BUFF_PROVIDER_ID = 'runBuff';
export const MINE_TRADER_PROVIDER_ID = 'mineTrader';

export function makeRunBuffProvider(
  getState: () => MineState,
  upgradeDefs: MineUpgradeDef[],
  statuses: MineLayerStatusDef[],
): ModifierProvider {
  return {
    id: RUN_BUFF_PROVIDER_ID,
    provide(stat: StatId, _ctx: ResolveCtx): Modifier[] {
      void _ctx;
      const state = getState();
      const mods: Modifier[] = [];
      const run = state.run;
      // бафы алтарей (duration: runs — живут в контейнере забега)
      if (run !== undefined) {
        for (const m of run.altarMods) {
          if (m.stat !== stat) continue;
          mods.push({
            id: m.id,
            source: { kind: 'buff', refId: 'mine.altar' },
            stat: m.stat,
            op: m.op,
            value: m.value,
            duration: { kind: 'runs', value: 1 },
          });
        }
        // эффект статуса слоя (данные; условие ctxTag — бои забега с тегом)
        if (run.status !== null) {
          const st = statuses.find((s) => s.layer === run.layer);
          if (st?.effect !== undefined && st.effect.stat === stat) {
            mods.push({
              id: `mine.status.${run.status}`,
              source: { kind: 'debuff', refId: `status:${run.status}` },
              stat: st.effect.stat,
              op: st.effect.op,
              value: st.effect.value,
              conditions: [{ t: 'ctxTag', tag: `status:${run.status}` }],
            });
          }
        }
        // «Насыщенность» (модификатор дня по данным): первый забег дня.
        // op flat — канон FIX-RIVEN (inc на нулевой базе mine.oreYield инертен;
        // ривены кирок oreYield на той же нулевой базе тоже flat — компонуются)
        if (run.firstOfDay && stat === 'mine.oreYield') {
          mods.push({
            id: 'mine.saturation',
            source: { kind: 'event', refId: 'mine.saturation' },
            stat: 'mine.oreYield',
            op: 'flat',
            value: MINE_SATURATION.oreBonusPercent,
          });
        }
      }
      // Освещение (постоянное): −25% скрытых — inc к mine.hiddenChance
      const lighting = upgradeDefs.find((u) => u.effect.t === 'lighting');
      if (lighting !== undefined && state.upgrades?.[lighting.id] === true && stat === 'mine.hiddenChance') {
        const eff = lighting.effect as { hiddenChanceInc: number };
        mods.push({
          id: 'mine.upgrade.lighting',
          source: { kind: 'upgrade', refId: lighting.id },
          stat: 'mine.hiddenChance',
          op: 'inc',
          value: eff.hiddenChanceInc,
        });
      }
      return mods;
    },
  };
}

/** кротовая наценка: сток крота × ctx-тег крота → markup по данным */
export function makeMineTraderProvider(cards: MineCardDef[]): PriceModifierProvider {
  // сток и наценка — данные карты 'trader' (первая с непустым стоком)
  const trader = cards.find((c) => c.kind === 'trader');
  const p = (trader?.payload ?? null) as
    | { markupPercent: number; priceTag: string; stock: Array<{ defId: ID }> }
    | null;
  const stockIds = new Set((p?.stock ?? []).map((s) => s.defId));
  return {
    id: MINE_TRADER_PROVIDER_ID,
    provide(defId: ID, ctx: { tags?: string[] }): PriceMod[] {
      if (p === null) return [];
      if (!(ctx.tags ?? []).includes(p.priceTag)) return [];
      if (!stockIds.has(defId)) return [];
      return [
        {
          id: 'mine.trader.markup',
          label: `кротовая наценка ${p.markupPercent}%`,
          kind: 'markup',
          value: p.markupPercent,
        },
      ];
    },
  };
}
