/**
 * БАЗЫ СТАТОВ (03-DATA §11): единственное место, где живут base-значения (П2).
 * База задаётся в данных ОДИН раз и НИКОГДА не мутируется.
 * Любое влияние — Modifier через StatBus.
 *
 * Каталог намеренно_minimal: фаза 0. Модули M01+ будут добавлять свои таблицы
 * баз ОТДЕЛЬНЫМИ файлами контента, этот файл не расширяется вручную.
 */
import type { StatId } from '@/shared/types/ids';
import type { Rounding } from '@/shared/utils/math';

export interface StatMetaEntry {
  round?: Rounding;
  min?: number;
}

export interface BasesTable {
  bases: Record<StatId, number>;
  meta: Record<StatId, StatMetaEntry>;
}

export const BASES_TABLE: BasesTable = {
  bases: {
    // [M01] статы player.* переехали в content/player/bases.ts — модуль
    // владеет своим доменом (этот файл не расширяется вручную, 03-DATA §11)
    // --- удачи подсистем (RngBus читает через StatBus)
    'fishing.luck.rare': 0,
    'mine.luck.hidden': 0,
    'shop.luck.discount': 0,
    // --- демо-статы для self-checks и debug-консоли фазы 0
    'demo.attack': 10,
    'demo.defense': 5,
    'demo.growthSpeed': 100,
    // --- [M02.2] боевые базы для baseStats/ModTypeDef экипировки (бриф §2.6:
    // «при отсутствии базы стата — добавить в content/balance/bases.ts, стартовое
    // число с пометкой "тюнюемое"»). Владелец боевого баланса — M12; до него
    // числа ТЮНЮЕМЫЕ, меняются здесь без миграций (базы, не сейв-данные)
    'combat.attack': 5, // кулачный удар игрока без оружия
    'combat.defense': 0,
    'combat.block': 0,
  },
  meta: {
    'demo.growthSpeed': { min: 0 },
  },
};
