/**
 * Провайдеры M13.1+M13.2:
 *  - runBuffProvider (карточка §5, манифест modifierProviders ×1 — ЕДИНСТВЕННЫЙ
 *    провайдер модуля) [M13.1]: бафы алтарей забега (duration runs), эффекты
 *    статусов слоёв (conditions ctxTag status:<x>), «Насыщенность» (flat +10
 *    на mine.oreYield первым забегом дня), Освещение (inc −25 на
 *    mine.hiddenChance); [M13.2 · R10] здесь же — МОДИФИКАТОРЫ ПРОФИЛЕЙ
 *    наёмников через conditions-канал (per-instance тег helper:<id>):
 *    трейты (ривен-роллы доски — op flat на нулевых базах, канон FIX-RIVEN),
 *    страх-эффективность («Мерзляк» more −(100−N) с условием страха), бонус
 *    золота с мобов (лутер + «Жадный» flat на mine.helper.gold).
 *  - mineTraderProvider (PriceBus, 04-DISCOUNTS §1) — кротовая наценка.
 */
import type { Modifier, ModifierProvider, ResolveCtx } from '@/kernel/bus/stat-bus/modifier';
import type { PriceMod, PriceModifierProvider } from '@/kernel/bus/price-bus/price-bus';
import type { StatId, ID } from '@/shared/types/ids';
import type { MineCardDef, MineLayerStatusDef } from '@/content/mine/cards';
import { MINE_SATURATION } from '@/content/mine/cards';
import type { MineUpgradeDef } from '@/content/mine/upgrades';
import type { ModTypeDef } from '@/content/mods/registry';
import { helperTag, type HelperClassDef, type HelperProfile } from '@/content/mine/helpers';
import type { MineState } from './state';

export const RUN_BUFF_PROVIDER_ID = 'runBuff';
export const MINE_TRADER_PROVIDER_ID = 'mineTrader';

export function makeRunBuffProvider(
  getState: () => MineState,
  upgradeDefs: MineUpgradeDef[],
  statuses: MineLayerStatusDef[],
  modTypes: readonly ModTypeDef[] = [],
  helperClasses: readonly HelperClassDef[] = [],
  profileOf: (defId: string) => HelperProfile | null = () => null,
  baseOf: (stat: string) => number = () => 0,
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
      // --- [M13.2 · R10] модификаторы профилей наёмников: per-instance тег
      //     helper:<id> в conditions — трейты/страхи/класс-бонусы действуют
      //     ТОЛЬКО в резолвах с тегом этого экземпляра (канал условий шины)
      for (const inst of state.helpers ?? []) {
        const profile = profileOf(inst.defId);
        if (profile === null) continue;
        const tag = helperTag(inst.instanceId);
        // трейты: тип → деф реестра 'mods' → стат; op по пред-базе (FIX-RIVEN:
        // inc на нулевой базе инертен — atk/hp/speed/gold базово 0 → flat)
        for (const t of profile.traits) {
          const def = modTypes.find((m) => m.id === t.type && m.scopeTags.includes('helper'));
          if (def === undefined || def.stat !== stat) continue;
          mods.push({
            id: `mine.helper.trait.${t.type}.${inst.instanceId}`,
            source: { kind: 'helper', refId: inst.defId },
            stat: def.stat,
            op: baseOf(def.stat) === 0 ? 'flat' : 'inc',
            value: t.value,
            conditions: [{ t: 'ctxTag', tag }],
          });
        }
        // страх-эффективность: «Мерзляк» — more −(100−N) с условием страха
        for (const f of profile.fears) {
          if (f.effect.t !== 'efficiency') continue;
          if (stat !== 'mine.helper.efficiency') continue;
          const eff = f.effect as { t: 'efficiency'; percent: number };
          mods.push({
            id: `mine.helper.fear.${f.id}.${inst.instanceId}`,
            source: { kind: 'helper', refId: inst.defId },
            stat: 'mine.helper.efficiency',
            op: 'more',
            value: -(100 - eff.percent),
            conditions: [f.condition, { t: 'ctxTag', tag }],
          });
        }
        // класс-бонус золота с мобов (лутер) + «Жадный» (страха profile)
        if (stat === 'mine.helper.gold') {
          const cls = helperClasses.find((c) => c.classId === profile.classId);
          if (cls !== undefined && cls.special.t === 'loot') {
            const eff = cls.special as { t: 'loot'; goldBonusPercent: number };
            mods.push({
              id: `mine.helper.class.loot.${inst.instanceId}`,
              source: { kind: 'helper', refId: profile.classId },
              stat: 'mine.helper.gold',
              op: 'flat',
              value: eff.goldBonusPercent,
              conditions: [{ t: 'ctxTag', tag }],
            });
          }
          for (const f of profile.fears) {
            if (f.effect.t !== 'profile') continue;
            const eff = f.effect as { t: 'profile'; sharePct: number; goldPct: number };
            mods.push({
              id: `mine.helper.fear.${f.id}.gold.${inst.instanceId}`,
              source: { kind: 'helper', refId: inst.defId },
              stat: 'mine.helper.gold',
              op: 'flat',
              value: eff.goldPct,
              conditions: [f.condition, { t: 'ctxTag', tag }],
            });
          }
        }
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
