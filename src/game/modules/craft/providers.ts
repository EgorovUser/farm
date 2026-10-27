/**
 * craftStationProvider (карточка M09 §6) — ЕДИНЫЙ провайдер модуля в StatBus:
 *
 *  - длины очередей: stat craft.queue.length.<station> += Σ queueBonus
 *    купленных улучшений станции (данные; сами базы — balance/craft.ts);
 *  - эффекты станций и улучшений (наковальня → cap 10 / мифрил → cap 15 на
 *    forge.sharpen.levelMax — «потолок заточки M10 как cap-модификатор»,
 *    стек-группа: max побеждает);
 *  - постоянные эффекты рецептов (рюкзак: +4 player.inventory.slots за каждую
 *    собранную партию, id уникален на партию; продажа трофея бонус не
 *    отбирает — cozy, [DECISION] M09).
 *
 * Будущие пассивки M14 подцепятся к тем же статам без правки модуля (П3).
 */
import type { Modifier, ModifierProvider, ResolveCtx } from '@/kernel/bus/stat-bus/modifier';
import type { StatId, Tag } from '@/shared/types/ids';
import type { StationDef } from '@/content/craft/stations';
import type { CraftState } from './state';

export class CraftStationProvider implements ModifierProvider {
  readonly id = 'craft.stations';

  constructor(
    private readonly deps: {
      stations: readonly StationDef[];
      getState(): CraftState;
    },
  ) {}

  provide(stat: StatId, _ctx: ResolveCtx): Modifier[] {
    void _ctx; // фильтрацию (условия/теги/срок) делает StatBus
    const state = this.deps.getState();
    const out: Modifier[] = [];

    // --- длины очередей: flat от купленных улучшений станции
    for (const station of this.deps.stations) {
      if (stat !== `craft.queue.length.${station.id}`) continue;
      const bought = state.stations[station.id];
      if (!bought) continue;
      for (const upgrade of station.upgrades) {
        if (!bought.upgrades.includes(upgrade.id) || upgrade.queueBonus <= 0) continue;
        out.push({
          id: `craft.upgrade.${upgrade.id}`,
          source: { kind: 'upgrade', refId: upgrade.id },
          stat,
          op: 'flat',
          value: upgrade.queueBonus,
          tags: [] as Tag[],
          label: `${upgrade.name}: +${upgrade.queueBonus} к очереди`,
        });
      }
    }

    // --- эффекты станций (построена) и улучшений (куплено)
    for (const station of this.deps.stations) {
      const bought = state.stations[station.id];
      if (!bought) continue;
      if (station.effects.length > 0) {
        for (const eff of station.effects) {
          if (eff.stat !== stat) continue;
          out.push({ ...eff });
        }
      }
      for (const upgrade of station.upgrades) {
        if (!bought.upgrades.includes(upgrade.id)) continue;
        for (const eff of upgrade.effects) {
          if (eff.stat !== stat) continue;
          out.push({ ...eff });
        }
      }
    }

    // --- постоянные эффекты рецептов (рюкзаки)
    for (const eff of state.grantedEffects) {
      if (eff.stat !== stat) continue;
      out.push({
        id: eff.id,
        source: { kind: eff.source.kind as never, refId: eff.source.refId },
        stat: eff.stat as StatId,
        op: eff.op,
        value: eff.value,
        tags: [] as Tag[],
        ...(eff.label !== undefined ? { label: eff.label } : {}),
      });
    }
    return out;
  }
}
