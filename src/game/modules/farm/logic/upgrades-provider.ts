/**
 * Провайдер улучшений фермы (G2/G3 брифа M05.3, карточка §6/§7): ВСЕ
 * статовые эффекты купленных улучшений — модификаторами отсюда; код
 * улучшений не трогается («улучшение = данные + TransactionService»).
 *
 * Источники модов:
 *  - эффект {t:'mods'} купленных улучшений (Плодородие/Чернозём/Гербициды):
 *    моды дефа отдаются как есть — таргетинг по тегам делает StatBus
 *    (02-BUSES §2: все теги мода должны быть в ctx резолва);
 *  - эффект {t:'openTab', speedPercent} купленных вкладок (Теплица +20%):
 *    inc на farm.growthSpeed с тегом farm:tab:<kind> — резолв посадки
 *    в этой вкладке подхватывает (actions.growthSpeedFor).
 *
 * Плюс чистый проход спринклеров (карточка §6 «автополив раз в 8 ч через
 * TaskRegistry»): поливает ВСЕ растущие тайлы (освежает окно влажности —
 * в том числе ни разу не политые: автополив закрывает гейт READY); каденс
 * ведёт часовая ветка модуля (данные intervalHours), исполнение — ЧЕРЕЗ
 * TaskRegistry (исполнитель farm.sprinkler; [DECISION] гибрид буквы
 * карточки и доступной автономности: реестр — канал исполнения, часовой
 * обработчик — будильник каденса; работники M11 смогут дёргать так же).
 */
import type { Modifier, ModifierProvider, ResolveCtx } from '@/kernel/bus/stat-bus/modifier';
import type { StatId } from '@/shared/types/ids';
import type { FarmUpgradeDef } from '@/content/farm/upgrades';
import type { FarmState } from '../state';

export const UPGRADES_PROVIDER_ID = 'farmUpgradesProvider';

const TAB_TAG_PREFIX = 'farm:tab:';

export function makeUpgradesProvider(
  getState: () => FarmState,
  upgrades: FarmUpgradeDef[],
): ModifierProvider {
  return {
    id: UPGRADES_PROVIDER_ID,
    provide(stat: StatId, ctx: ResolveCtx): Modifier[] {
      const bought = new Set(getState().upgrades);
      if (bought.size === 0) return [];
      const out: Modifier[] = [];
      for (const def of upgrades) {
        if (!bought.has(def.id)) continue;
        const e = def.effect;
        if (e.t === 'mods') {
          for (const m of e.mods) {
            if (m.stat !== stat) continue;
            out.push({
              id: `farm.upg.${def.id}.${m.stat}.${m.tag}`,
              source: { kind: 'upgrade', refId: def.id },
              stat,
              op: m.op,
              value: m.value,
              tags: [m.tag],
              label: m.label,
            });
          }
        } else if (e.t === 'openTab' && e.speedPercent !== undefined && stat === 'farm.growthSpeed') {
          // скорость вкладки (Теплица +20%): тег вкладки — резолвы посадки
          out.push({
            id: `farm.upg.${def.id}.tabSpeed`,
            source: { kind: 'upgrade', refId: def.id },
            stat,
            op: 'inc',
            value: e.speedPercent,
            tags: [`${TAB_TAG_PREFIX}${e.kind}`],
            label: `${def.name}: +${e.speedPercent}% скорости на вкладке ${e.kind}`,
          });
        }
      }
      return out;
    },
  };
}

/** чистый проход спринклеров: полить все растущие тайлы (окно из данных) */
export function sprinklerPass(state: FarmState, now: number, windowMs: number): { state: FarmState; watered: number } {
  let watered = 0;
  const tabs = state.tabs.map((tab) => ({
    ...tab,
    tiles: tab.tiles.map((tile) => {
      if (tile.state !== 'growing') return tile;
      watered++;
      return { ...tile, wateredUntil: now + windowMs };
    }),
  }));
  return { state: watered > 0 ? { ...state, tabs } : state, watered };
}
