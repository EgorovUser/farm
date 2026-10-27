/**
 * БАЛАНС ЗАГОНА (карточка M06 §3–§4; 03-DATA §11: имена таблиц = имена модулей).
 * Единственное место чисел загона (П6): слоты базы, уход (кормление/чистка/
 * гладить), дневной decay, склад-cap, таблица тиров покупки, качество
 * продукции (веса + коридор фактора + участие качества животного).
 *
 * ЭНЕРГИИ ДЕЙСТВИЙ — НЕ здесь: статы action.pen.<verb>.energyCost живут в
 * content/player/bases.ts с фазы M01 (feed 1 там уже есть; clean 2 / collect
 * 2 / pet 0 добавлены сеансом M06.1 — F6) — дублирование баз запрещено (П2),
 * PEN_TABLE их НЕ повторяет (та же конвенция, что у фермы: погрешность
 * OBS-4 брифа M05.1 учтена — одна база).
 *
 * [F6] уход: кормить — 1 «Корм» (валюта feed кошелька) через
 * TransactionService, satiety → 100, лимит 1/животное/день; чистить —
 * cleanliness → 100; гладить — +5 счастья, лимит 1/день.
 *
 * [F6] decay за день: satiety −25, cleanliness −10; при satiety = 0 —
 * «голодная» (не производит — produceNeeds) и −30 счастья; при
 * cleanliness = 0 — −10 счастья. «Тёплый загон» (M06.2) умножает decay
 * сытости на appetiteFactor 0.9 (−22.5/день) — фактор читается из данных
 * улучшения, база НЕ дублируется (П2).
 *
 * [M06.2 · F1] болезни: базовый шанс PEN_TABLE.sickness.base = 0.02/день
 * (2% — карточка §3); уход-штрафы +1 п.п. за накопленный hungryDays/
 * dirtyDays; заболевшее — health → 40 (сразу ниже needs-гейта 50 —
 * больная НЕ производит), далее −10/день пока больна; лечение лекарством
 * (pen.heal, M09) ИЛИ временем (48ч); выздоровление → health 100 + окно
 * иммунитета 48ч. Смерти НЕТ (вне карточки M06). «Тёплый загон» — sickFactor
 * 0.5 к ИТОГОВОМУ шансу (база + уход-штрафы).
 *
 * [M06.2 · F5] разведение: потомство через 48ч; childTier =
 * clamp(max(родители) − 1 + мутация, D, SS), мутация 10% (ролл
 * pen:breed:<species>:mutation) — формула ЕДИНА с M08 §4 (канон-основа
 * озера: M06.2 реализует данные+функцию, M08 ссылается); продажа молодняка —
 * 50% цены покупки.
 *
 * [F5] качество животного при покупке: ролл из таблицы тиров
 * buyQualityWeights (D45 C35 B15 A5 — стартовое предложение [DECISION];
 * S/SS недостижимы покупкой — бизнес-случай разведения M06.2).
 *
 * [F7] качество продукции: веса тиров (старт — копия
 * inventory.qualityWeights, прецедент acquire M02) с фактором
 * factorOfScore(happiness/100) — та же функция-преобразование, что у фермы
 * (d1265be), коридор [minFactor, maxFactor] = [0.8, 1.3]; участие качества
 * животного — [DECISION · сеанс M06.1, слот F7]: шанс +1 тира продукта
 * qualityTierUpChancePerTier × средний тир производителей вида (D=0..SS=5;
 * отдельный бросок, пропускается при нулевом шансе — журнал без шума,
 * прецедент farm:harvest:skill).
 *
 * [F7] склад: cap = stockCapCollections (3) × максимальный qty коллекции
 * среди производителей продукта («3 сбора per вид»; молоко: коза 1/корова 2
 * → cap 6; шерсть: овца 1/альпака 2 → cap 6). Переполнение не копится —
 * уходит в overflow-отчёт среза (offlineReport: продукция сверх cap,
 * голодные/грязные дни — счётчики животных).
 */
import type { BasesTable } from '@/content/balance/bases';
export interface PenTable {
  /** §2: базовые слоты загона (Амбар M06.2: +4/уровень; «Второй загон» — M06.2) */
  slots: {
    base: number;
  };
  /** §3: уход */
  care: {
    /** счастье за «гладить» */
    petHappiness: number;
    /** сколько восстанавливает кормление (satiety → 100) */
    feedSatiety: number;
    /** сколько восстанавливает чистка (cleanliness → 100) */
    cleanCleanliness: number;
  };
  /** §3: дневной decay (dayTick-проход; catchUp — те же публикации, кап 14) */
  decay: {
    satietyPerDay: number;
    cleanlinessPerDay: number;
    /** штраф счастья при satiety = 0 («голодная») */
    hungryHappinessPerDay: number;
    /** штраф счастья при cleanliness = 0 */
    dirtyHappinessPerDay: number;
  };
  /** §3: стартовые значения экземпляра при покупке */
  newborn: {
    happiness: number;
    satiety: number;
    health: number;
    cleanliness: number;
  };
  /** F5: таблица тиров качества животного при покупке (веса; S/SS нет) */
  buyQualityWeights: Record<string, number>;
  /** F7: качество продукции */
  produce: {
    /** веса тиров D..SS (старт — копия inventory.qualityWeights) */
    qualityWeights: Record<string, number>;
    /** коридор фактора счастья (factorOfScore(happiness/100)) */
    minFactor: number;
    maxFactor: number;
    /** [DECISION · F7-слот] шанс +1 тира за единицу среднего тира животных */
    qualityTierUpChancePerTier: number;
    /** склад: сколько СБОРОВ копится на складе per продукт */
    stockCapCollections: number;
  };
  /** [F3] репутация деревни (M16): флаг-заглушка Альпаки */
  reputation: {
    /** до M16 — всегда false: гейт честно закрыт, витрина — «(скоро)» */
    ready: boolean;
  };
  /** [M06.2 · F1] болезни (карточка §3: шанс 2%/день, выше при плохом уходе) */
  sickness: {
    /** базовый шанс заболевания за день, доля (0.02 = 2%) */
    base: number;
    /** +п.п. (доля) за каждый накопленный hungryDays */
    perHungryDay: number;
    /** +п.п. (доля) за каждый накопленный dirtyDays */
    perDirtyDay: number;
    /** health при заболевании (сразу ниже needs-гейта 50 — не производит) */
    sickHealth: number;
    /** health decay за день, пока больна (пол 0; смерти нет) */
    healthDecayPerDay: number;
    /** самолечение временем, часы */
    healHours: number;
    /** окно иммунитета после выздоровления, часы */
    immunityHours: number;
  };
  /** [M06.2 · F5] разведение (после «Родильного загона») */
  breeding: {
    /** потомство через N часов после запуска пары */
    periodHours: number;
    /** оба родителя: satiety ≥ порога и здоровы */
    minSatiety: number;
    /** базовый шанс мутации (+1 тир потомку; ролл pen:breed:<species>:mutation) */
    mutationChance: number;
    /** цена продажи = доля от цены покупки вида */
    sellFactor: number;
  };
  /** [M06.2 · F4] навоз-цикл */
  manure: {
    /** навоза за каждое кормление (в буфер среза) */
    perFeeding: number;
    /** кап буфера навоза */
    cap: number;
  };
}

export const PEN_TABLE: PenTable = {
  slots: {
    base: 4, // [DECISION] стартовые слоты (карточка §2: база 4; Амбар — M06.2)
  },
  care: {
    petHappiness: 5, // карточка §3 «+5 счастья»
    feedSatiety: 100, // satiety → 100
    cleanCleanliness: 100, // cleanliness → 100
  },
  decay: {
    satietyPerDay: 25, // карточка §3 «−25/день»
    cleanlinessPerDay: 10, // карточка §3 «−10/день»
    hungryHappinessPerDay: 30, // «при satiety = 0 … −30 счастья/день»
    dirtyHappinessPerDay: 10, // «при 0 — −10 счастья/день»
  },
  newborn: {
    happiness: 100,
    satiety: 100,
    health: 100,
    cleanliness: 100,
  },
  buyQualityWeights: { D: 45, C: 35, B: 15, A: 5 }, // F5: D45 C35 B15 A5
  produce: {
    // старт — копия inventory.qualityWeights (прецедент acquire M02)
    qualityWeights: { D: 40, C: 30, B: 20, A: 8, S: 1.6, SS: 0.4 },
    minFactor: 0.8, // тот же коридор, что у фермы (d1265be)
    maxFactor: 1.3,
    qualityTierUpChancePerTier: 0.1, // средний тир A (3) → шанс +1 тира 0.3
    stockCapCollections: 3, // «склад cap 3 сбора per вид»
  },
  reputation: {
    ready: false, // M16 подключит реальную репутацию (право касания)
  },
  sickness: {
    base: 0.02, // карточка §3 «2%/день» (бриф F1: PEN_TABLE.sickness.base)
    perHungryDay: 0.01, // +1 п.п. за голодный день [DECISION-числа, тюнинг]
    perDirtyDay: 0.01, // +1 п.п. за грязный день [DECISION-числа, тюнинг]
    sickHealth: 40, // заболевшее: health 40 — ниже needs-гейта 50 [DECISION]
    healthDecayPerDay: 10, // −10/день пока больна [DECISION]
    healHours: 48, // самолечение временем [DECISION]
    immunityHours: 48, // окно иммунитета после выздоровления [DECISION-слот]
  },
  breeding: {
    periodHours: 48, // потомство через 48ч [DECISION-числа]
    minSatiety: 50, // оба родителя satiety ≥ 50
    mutationChance: 0.1, // мутация 10% (карточка §4; формулы M08 §4)
    sellFactor: 0.5, // продажа = 50% цены покупки [DECISION]
  },
  manure: {
    perFeeding: 1, // +1 навоз за кормление [DECISION-форма]
    cap: 30, // кап буфера [DECISION-форма]
  },
};

/**
 * Базы статов загона (П2: задаются один раз; модификаторы —
 * penUpgradesProvider M06.2). pen.happiness.bonus — «Пастбище-люкс»
 * (flat +10, тег 'pen'): эффективное счастье = min(100, raw + бонус).
 */
export const PEN_BASES_TABLE: BasesTable = {
  bases: {
    'pen.happiness.bonus': 0, // люкс-бонус счастья (база 0 — без улучшения)
  },
  meta: {
    'pen.happiness.bonus': { min: 0, round: 'none' },
  },
};
