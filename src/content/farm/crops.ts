/**
 * КУЛЬТУРЫ ФЕРМЫ (карточка M05 §2; CropDef — канон 03-DATA §6).
 *
 * Восемь стартовых культур поимённо (буква карточки): пшеница 4ч / морковь 6ч /
 * картофель 8ч / тыква 12ч / клубника 10ч (replantable — механика M05.3,
 * поле-маркер уже в данных) / грибы 3ч (вкладка «Грибница» — M05.3, культура
 * в данных уже сейчас) / виноград 24ч (вкладка «Виноградник» — M05.3) /
 * солнечник 16ч (гейт ур.25 + ачивка «Агроном»; ачивковая часть гейта —
 * M05.3, уровневая жива уже сейчас — [DECISION] сеанса M05.1).
 *
 * allowedTabs — теги вкладок (FarmTab.kind): 'field' | 'mushroom' |
 * 'vineyard' | 'greenhouse'. В M05.1 жива только «Поле» (field): грибы и
 * виноград посадить нельзя до своих вкладок (M05.3) — культура в данных,
 * посадка гейтится вкладкой.
 *
 * [M05.3 · G1 · DECISION] «Теплица» принимает ПОЛЕВЫЕ культуры (allowedTabs
 * 'field' += 'greenhouse'): карточка §2 не назначает тепличных культур, а
 * пустая вкладка (ни одной разрешённой) — дефект; теплица растит то же, что
 * поле, но без сорняков и +20% скорости — строгое превосходство оправдано
 * ценой 2000з/ур.20. Грибы/виноград остаются нишевыми (свои вкладки).
 *
 * Числа — стартовые (П6, тюнюется без миграций): growHours по карточке §2,
 * yields — мин/макс единиц за сбор, seedPrice — справочная цена семени
 * (подсказки «где добыть»; фактическая цена — PriceBus от basePrice дефа).
 * weedRiskMult — множитель риска сорняков (M05.2 живое: weedChance =
 * resolve('farm.weeds.chancePercent') × множитель; дефолт 1 при отсутствии —
 * [DECISION · M05.2], неизвестность — рядовой случай П5).
 */
import type { ID } from '@/shared/types/ids';
import type { Condition } from '@/shared/types/requirement';

export interface CropYieldDef {
  defId: ID;
  minQty: number;
  maxQty: number;
}

export interface CropDef {
  id: ID;
  name: string;
  growHours: number;
  seedDef: ID;
  /** справочная цена семени (подсказки; фактическая — PriceBus) */
  seedPrice: number;
  yields: CropYieldDef[];
  /** после сбора снова READY без пересадки (механика — M05.3) */
  replantable?: boolean;
  /** [M05.3 · G5] клубника: число сборов с одной посадки (3 сбора подряд —
   *  тайл снова READY, семя не тратится; после последнего — EMPTY) */
  harvests?: number;
  /** [M05.3 · G5] виноград: окно плодоношения после первого сбора, дней
   *  (повторные сборы без пересадки — регроу growHours в окне; [DECISION]
   *  окно отсчитывается от первого сбора, регроу = growHours культуры) */
  fruitingDays?: number;
  /** теги вкладок (FarmTab.kind), на которых культуру можно сажать */
  allowedTabs: string[];
  /** множитель риска сорняков (данные для M05.2) */
  weedRiskMult?: number;
  /** [M05.3 · G2] категория для мод улучшений (Плодородие/Чернозём
   *  таргетятся тегом farm:crop:<category>; дефолт — без категории — П5) */
  category?: 'fruit' | 'root' | 'grain' | 'mushroom';
  unlock?: Condition;
}

export const CROPS: CropDef[] = [
  {
    id: 'wheat',
    name: 'Пшеница',
    growHours: 4,
    seedDef: 'seed_wheat',
    seedPrice: 12,
    yields: [{ defId: 'wheat_grain', minQty: 2, maxQty: 4 }],
    allowedTabs: ['field', 'greenhouse'],
    category: 'grain',
    weedRiskMult: 1.0, // эталон нейтрального риска (M05.2)
  },
  {
    id: 'carrot',
    name: 'Морковь',
    growHours: 6,
    seedDef: 'seed_carrot',
    seedPrice: 8,
    yields: [{ defId: 'carrot', minQty: 2, maxQty: 3 }],
    allowedTabs: ['field', 'greenhouse'],
    category: 'root',
    weedRiskMult: 1.2, // нежные всходы (M05.2)
  },
  {
    id: 'potato',
    name: 'Картофель',
    growHours: 8,
    seedDef: 'seed_potato',
    seedPrice: 10,
    yields: [{ defId: 'potato', minQty: 2, maxQty: 4 }],
    allowedTabs: ['field', 'greenhouse'],
    category: 'root',
    weedRiskMult: 0.8, // грубая культура глушит сорняки (M05.2)
  },
  {
    id: 'pumpkin',
    name: 'Тыква',
    growHours: 12,
    seedDef: 'seed_pumpkin',
    seedPrice: 30,
    yields: [{ defId: 'pumpkin', minQty: 1, maxQty: 2 }],
    allowedTabs: ['field', 'greenhouse'],
    category: 'fruit',
    weedRiskMult: 0.9, // крупные листья затеняют (M05.2)
  },
  {
    id: 'strawberry',
    name: 'Клубника',
    growHours: 10,
    seedDef: 'seed_strawberry',
    seedPrice: 25,
    yields: [{ defId: 'strawberry', minQty: 2, maxQty: 3 }],
    replantable: true,
    harvests: 3, // [G5] 3 сбора подряд с одной посадки (карточка §2)
    allowedTabs: ['field', 'greenhouse'],
    category: 'fruit',
    weedRiskMult: 1.3, // нежная ягода — соседи-сорняки (M05.2)
  },
  {
    id: 'mushroom',
    name: 'Грибы',
    growHours: 3,
    seedDef: 'seed_mushroom',
    seedPrice: 6,
    yields: [{ defId: 'mushroom', minQty: 2, maxQty: 4 }],
    allowedTabs: ['mushroom'],
    category: 'mushroom',
    weedRiskMult: 0.6, // чистая среда грибницы (M05.2)
  },
  {
    id: 'grape',
    name: 'Виноград',
    growHours: 24,
    seedDef: 'seed_grape',
    seedPrice: 50,
    yields: [{ defId: 'grape', minQty: 2, maxQty: 3 }],
    replantable: true,
    fruitingDays: 7, // [G5] окно плодоношения после первого сбора (карточка §2)
    allowedTabs: ['vineyard'],
    category: 'fruit',
    weedRiskMult: 0.7, // древесная лиана зарастает слабо (M05.2)
  },
  {
    id: 'sunflower',
    name: 'Подсолнух',
    growHours: 16,
    seedDef: 'seed_sunflower',
    seedPrice: 45,
    yields: [{ defId: 'sunflower', minQty: 1, maxQty: 2 }],
    allowedTabs: ['field', 'greenhouse'],
    category: 'grain',
    weedRiskMult: 0.9, // высокая — глушит соседей (M05.2)
    // [M05.3 · G6] гейт солнечника: уровень 25 + ачивка «Агроном»
    // (карточка §2; уровневая часть жива с M05.1, ачивковая добавлена —
    // {t:'all'} раскладывается в отказе посадки: gates.gateTextOf)
    unlock: { t: 'all', cs: [{ t: 'playerLevel', level: 25 }, { t: 'achievement', id: 'ach_agronomist' }] },
  },
];
