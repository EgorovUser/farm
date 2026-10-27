/**
 * questFlagsProvider (карточка §6): флаги, которые САМИ модифицируют стат —
 * редкий случай; обычно флаги читают гейты-оценщики (unlock Requirement в
 * данных систем). Таблица связей — данные (balance/quests.flagModifiers):
 * строка = эффект (П1); в M15.1 пусто — провайдер живой, эффекты добавятся
 * с реальными потребностями (M15.2+).
 */
import type { Modifier, ModifierProvider, ResolveCtx } from '@/kernel/bus/stat-bus/modifier';
import type { StatId } from '@/shared/types/ids';
import type { QuestsTable } from '@/content/balance/quests';

export class QuestFlagsProvider implements ModifierProvider {
  readonly id = 'questFlagsProvider';

  constructor(
    private readonly deps: {
      table(): QuestsTable;
      hasFlag(flag: string): boolean;
    },
  ) {}

  provide(stat: StatId, _ctx: ResolveCtx): Modifier[] {
    void _ctx; // фильтрацию (условия/теги) делает StatBus
    return this.deps
      .table()
      .flagModifiers.filter((fm) => fm.stat === stat && this.deps.hasFlag(fm.flag))
      .map<Modifier>((fm) => ({
        id: `quest.flag:${fm.flag}`,
        source: { kind: 'event', refId: fm.flag },
        stat,
        op: fm.op,
        value: fm.value,
        label: `флаг «${fm.flag}»`,
      }));
  }
}
