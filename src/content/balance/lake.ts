/**
 * БАЛАНС ОЗЕРА (карточка M08 §2–§4; 03-DATA §11: имена таблиц = имена модулей).
 * Единственное место чисел озера, НЕ живущих в дефах рыб (П6): старты воды,
 * дрейф чистоты, сетка периодов разведения, окна мутации 89/10/1, шансы
 * болезней, «Сачок», созревание икры.
 *
 * ЭНЕРГИИ ДЕЙСТВИЙ — НЕ здесь: статы action.lake.<verb>.energyCost живут в
 * content/player/bases.ts (feed 2 / clean 3 — бриф F4; конвенция action.farm.*
 * и action.pen.*, П2: дублирование баз запрещено).
 *
 * ТРЕБОВАНИЯ ВИДОВ lakeRequirements {tempMin, tempMax, cleanlinessMin} —
 * ДАННЫЕ на дефах рыб (канон 03-DATA §6 FishDef; content/fishing/fish.ts,
 * аддитивные поля [DECISION-сетка брифа F3]); вид без записи — нейтрален
 * (neutralRequirements: {0–100, ≥0}).
 *
 * КОРМ — валюта кошелька 'feed' (живая с фазы 0: wb_feed M09 / полка M04 /
 * pen.feed M06); цена прямой продажи lake.buy feed читается из ДАННЫХ M04
 * shop.currencyGoods.feed (3з — единый источник, прецедент чтения чужих
 * данных «Симбиозом» M06.2; полка M04 НЕ открывается, пул N=60 не трогается).
 *
 * ФОРМУЛА ПОТОМСТВА (решение №3 «2+ @1%», Task 45 / M08 §8):
 *   childTier = clamp(max(родители) − 1 + mutationRoll, D, SS)
 *   mutationRoll — ОДИН категорийный ролл: 89% → +0 / 10% → +1 / 1% → +2
 * (редкая +2 даёт потомка ВЫШЕ лучшего родителя — max+1 в пределах клампа
 * до SS). Окна категорий — данные breeding.mutation (контракт [0, +1From) /
 * [+1From, +2From) / [+2From, 1]). Стаки «Инкубатора»/пассивок — M08.2
 * (только к +1-тиру, кап +40; +2 = база 1% всегда).
 */
import type { BasesTable } from '@/content/balance/bases';
import type { CurrencyId } from '@/shared/types/ids';
export interface LakeTable {
  /** §2: стартовые слоты озера («Глубоководье» +4 — M08.2) */
  slots: {
    base: number;
  };
  /** §2: глобальные параметры воды 0–100 */
  water: {
    /** стартовая температура [DECISION брифа F3] */
    temperatureStart: number;
    /** стартовая чистота [DECISION брифа F3] */
    cleanlinessStart: number;
    min: number;
    max: number;
    /** дрейф чистоты за день без фильтрации (карточка §2: −5/день;
     *  «Аэратор» замедляет — M08.2); температура без дрейфа в M08.1 */
    cleanlinessDriftPerDay: number;
  };
  /** §3: уход */
  care: {
    /** «Сачок»: +чистоты за чистку (карточка §3: +15, кап 100) */
    cleanAmount: number;
    /** голод: fedAt старше N часов (бриф F4: 24ч) */
    hungryHours: number;
    /** value качества при harvest — слот хранит только тир (03-DATA §6
     *  LakeSlot), value = нейтральная середина тира; цена от value НЕ
     *  зависит (sellPrice по тиру) */
    harvestQualityValue: number;
  };
  /** §4: разведение */
  breeding: {
    /** период появления икры по редкости ВИДА, часы (лестница брифа F6:
     *  мелкая/common 24 / средняя/uncommon 36 / редкая/rare 48 /
     *  эпическая/epic 60 / легендарная/legendary 72) */
    periodHoursByRarity: Record<string, number>;
    /** неизвестная редкость вида (П5) — кап лестницы */
    fallbackPeriodHours: number;
    /** окна категорийного ролла мутации 89/10/1 (решение №3, M08 §8):
     *  [0, plus1From) → +0 / [plus1From, plus2From) → +1 / [plus2From, 1] → +2 */
    mutation: {
      plus1From: number;
      plus2From: number;
      /** [M08.2 · F11] кап суммы бонусов к весу +1-тира (Инкубатор +10,
       *  будущие пассивки; X ≤ 40 — вес ≤ 50); +2 = база 1% ВСЕГДА */
      plusBonusCap: number;
    };
    /** [M08.2 · F11] тёплая группа: правило ДАННЫМИ — при воде ≥ threshold
     *  и тёплолюбивом виде (tempMin ≥ warmSpeciesTempMin: Линь/Щука/
     *  Зеркальный карп/Золотой карп) период появления икры × periodFactor
     *  («Подогреватель»: тропические виды активны, карточка §5) */
    warmBreeding: {
      threshold: number;
      warmSpeciesTempMin: number;
      periodFactor: number;
    };
  };
  /** [M08.2 · F13] Лаборатория: направить мутацию в нужную сторону (раз в
   *  cooldownHours от применения; форс потребляется следующей икрой озера) */
  research: {
    cooldownHours: number;
  };
  /** §4: икра — запись очереди среза, НЕ предмет инвентаря [DECISION F8] */
  roe: {
    /** созревание икры, часы (бриф F6: 24ч) */
    matureHours: number;
  };
  /** §3: болезни (карточка: 5%/день при нарушенных требованиях, 2%/день при хороших) */
  sickness: {
    badConditionsChance: number;
    goodConditionsChance: number;
  };
  /** вид без записи lakeRequirements — нейтрален (бриф F3) */
  neutralRequirements: {
    tempMin: number;
    tempMax: number;
    cleanlinessMin: number;
  };
  /** канал покупки lake.buy feed [DECISION брифа F4/F8]: валюта Корма;
   *  цена — из ДАННЫХ M04 shop.currencyGoods (прецедент «Симбиоза») */
  buy: {
    feedCurrency: CurrencyId;
  };
}

export const LAKE_TABLE: LakeTable = {
  slots: {
    base: 6, // карточка §2: старт 6 («Глубоководье» +4 — M08.2)
  },
  water: {
    temperatureStart: 15, // [DECISION брифа F3]
    cleanlinessStart: 70, // [DECISION брифа F3]
    min: 0,
    max: 100,
    cleanlinessDriftPerDay: -5, // карточка §2: −5/день без фильтрации
  },
  care: {
    cleanAmount: 15, // карточка §3: «Сачок» +15 (кап 100)
    hungryHours: 24, // бриф F4: голод = fedAt старше 24ч
    harvestQualityValue: 50, // середина тира (слот хранит только тир)
  },
  breeding: {
    periodHoursByRarity: {
      common: 24,
      uncommon: 36,
      rare: 48,
      epic: 60,
      legendary: 72,
    },
    fallbackPeriodHours: 72, // П5: неизвестная редкость — кап лестницы
    mutation: {
      plus1From: 0.89, // [0, 0.89) → +0 (89%)
      plus2From: 0.99, // [0.89, 0.99) → +1 (10%); [0.99, 1] → +2 (1%)
      plusBonusCap: 40, // [M08.2 · F11] X ≤ 40 → plus1From не ниже 0.49
    },
    warmBreeding: {
      threshold: 20, // вода ≥ 20 + тёплолюбивый вид → период ×0.75
      warmSpeciesTempMin: 10, // Линь/Щука/Зеркальный карп/Золотой карп
      periodFactor: 0.75,
    },
  },
  research: {
    cooldownHours: 24, // [M08.2 · F13] Лаборатория: раз в сутки
  },
  roe: {
    matureHours: 24, // бриф F6: созревание икры 24ч
  },
  sickness: {
    badConditionsChance: 0.05, // карточка §3: 5%/день при ЛЮБОМ нарушенном требовании
    goodConditionsChance: 0.02, // карточка §3: 2%/день при хороших условиях
  },
  neutralRequirements: {
    tempMin: 0, // вид без записи — нейтрален {0–100, ≥0}
    tempMax: 100,
    cleanlinessMin: 0,
  },
  buy: {
    feedCurrency: 'feed', // валюта кошелька (03-DATA §1); цена — shop.currencyGoods
  },
};

/**
 * [M08.2 · F11] Базы статов озера (П2: задаются один раз; модификаторы —
 * провайдер lake.upgrades). lake.mutation.plus1Bonus — сумма бонусов к весу
 * +1-тира мутации (Инкубатор flat +10; кап X ≤ 40 — cap-мод провайдера);
 * потребитель — логика разведения (окно plus1From = 0.89 − X/100, кламп по
 * plusBonusCap данных). +2-тир = база 1% ВСЕГДА (plus2From неподвижен).
 */
export const LAKE_BASES_TABLE: BasesTable = {
  bases: {
    'lake.mutation.plus1Bonus': 0, // база 0 — без улучшений окна канонические
  },
  meta: {
    'lake.mutation.plus1Bonus': { min: 0, round: 'none' },
  },
};
