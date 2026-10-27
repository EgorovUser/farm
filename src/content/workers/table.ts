/**
 * Контент M11 «Работники» (карточка M11 §2–§4, бриф SESSION-M11 F2–F7):
 * ВСЕ числа модуля — ЗДЕСЬ (П6; единственное место чисел сеанса).
 *
 * Доска: 5 профилей/день, детерминированы dailySeed(saveId, dateISO)
 * (канон 03-DATA §12 — прецеденты shop-rotation/rollQuestIds; перезапуск
 * НЕ переролливает). Профиль = WorkerDef по 03-DATA §10: имя (пул имён),
 * профессия farmer|fishkeeper|herdsman, звёзды 1–5, зарплата (сетка от
 * звёзд × фактор ухода), период проверок 2|4|6 ч, уход 1–5, трейты через
 * живой ривен-конструктор M03 в бюджете 6 × звёзды, toolRequirement.
 *
 * Настроение (§4): 0–100, старт 50; ролл ±10; зарплата вовремя +2;
 * задержка −15; грязный объект −5; премия +10. Болезни: 2%/день,
 * 1–3 дня (sickFactor — задел улучшения «Баня» M11.2). Расчётный день:
 * после роллов настроения/болезней, нехватка → увольнение ОДНОГО
 * случайного + −15 остальным; прогноз за 24ч. Увольнение по настроению:
 * mood < 20 три дня подряд → 10%/день.
 */
import type { Tag } from '@/shared/types/ids';
import type { BasesTable } from '@/content/balance/bases';

/** профессия работника (03-DATA §10) */
export type WorkerProfession = 'farmer' | 'fishkeeper' | 'herdsman';

/** объект-место работы (F3: farmer → field|field2, fishkeeper → lake|lake2,
 *  herdsman → pen|animals2) */
export type WorkerObjectId = 'field' | 'field2' | 'lake' | 'lake2' | 'pen' | 'animals2';

/** деф-описание объекта из ЖИВОГО состояния (F3: реестр строится данными,
 *  НЕ хардкодом — проба признака живости через витрины publicApi) */
export interface WorkerObjectDef {
  id: WorkerObjectId;
  name: string;
  system: 'farm' | 'lake' | 'pen';
  profession: WorkerProfession;
  /** признак живости объекта в живом состоянии */
  probe: 'always' | 'farmTab' | 'lake2' | 'pen2';
  /** farmTab: id вкладки фермы (kind field) */
  tabId?: string;
}

/** реестр объектов (максимум 6; карточка §2): базовые — ферма/озеро/загон,
 *  копии от улучшений — «Второе поле» (M05.3) / «Второе озеро» (M08.2) /
 *  «Второй загон» (M06.2); живость — из витрин живых систем */
export const WORKER_OBJECTS: WorkerObjectDef[] = [
  { id: 'field', name: 'Ферма «Поле»', system: 'farm', profession: 'farmer', probe: 'farmTab', tabId: 'field' },
  { id: 'field2', name: 'Ферма «Второе поле»', system: 'farm', profession: 'farmer', probe: 'farmTab', tabId: 'field2' },
  { id: 'lake', name: 'Озеро №1', system: 'lake', profession: 'fishkeeper', probe: 'always' },
  { id: 'lake2', name: 'Озеро №2', system: 'lake', profession: 'fishkeeper', probe: 'lake2' },
  { id: 'pen', name: 'Загон №1', system: 'pen', profession: 'herdsman', probe: 'always' },
  { id: 'animals2', name: 'Загон №2', system: 'pen', profession: 'herdsman', probe: 'pen2' },
];

export interface WorkersTable {
  /** доска: сколько профилей в день */
  board: { size: number };
  /** звёзды → базовая зарплата (сетка от звёзд; карточка §2) */
  salaryByStars: Record<1 | 2 | 3 | 4 | 5, number>;
  /** шаг фактора ухода: зарплата = сетка × (1 + (care − 3) × step) */
  salaryCareStep: number;
  /** периоды проверок (ч) — ролл равномерный из списка */
  checkPeriodHours: [2, 4, 6];
  /** шанс (0–1) наличия требования инструмента у профиля */
  toolChance: number;
  /** требование по профессии (slot — тег скоупа предмета) */
  toolByProfession: Record<WorkerProfession, { slot: Tag; minTier: 'D' | 'C' | 'B' | 'A' | 'S' | 'SS' }>;
  mood: {
    start: number;
    min: number;
    max: number;
    /** ролл ±: |delta| (бросок 50/50 знака) */
    rollDelta: number;
    /** зарплата вовремя */
    paydayOnTime: number;
    /** задержка расчёта (нехватка) */
    paydayDelay: number;
    /** грязный объект */
    dirtyObject: number;
    /** премия */
    bonus: number;
  };
  /** признаки «грязного объекта» (F4): читаются из витрин живых систем */
  dirty: {
    /** озеро: чистота ниже — «грязно» */
    lakeCleanlinessBelow: number;
    /** ферма: любая стадия сорняков ≥ — «грязно» */
    farmWeedsAtLeast: number;
    /** загон: среднее счастье ниже — «грязно» (пустой загон — чист) */
    penHappinessBelow: number;
  };
  sickness: {
    /** шанс/день (карточка §4: 2%) */
    chance: number;
    /** множитель будущих улучшений («Баня» −50% — M11.2; задел данных) */
    sickFactor: number;
    /** границы длительности, дни (карточка §4: 1–3) */
    minDays: number;
    maxDays: number;
  };
  payday: {
    /** прогноз-предупреждение за 24ч: событие worker.payday {forecast} */
    forecast: boolean;
  };
  moodFire: {
    /** порог плохого настроения (карточка §4: < 20) */
    moodBelow: number;
    /** сколько дней ПОДРЯД (карточка §4: 3) */
    daysInRow: number;
    /** шанс увольнения в день после серии (карточка §4: 10%) */
    chance: number;
  };
  bonus: {
    /** множитель дневной ЗП (карточка §4: ×1.5) */
    salaryMult: number;
    /** кулдаун премии, дней (карточка §4: раз в неделю) */
    cooldownDays: number;
  };
  /** [M11.2 · F11] шанс успеха действия работника — f(звёзды, уход,
   *  инструмент, настроение) ВСЁ данными (карточка §3); провал — действие
   *  НЕ выполнено, БЕЗ последствий */
  success: {
    /** базовый шанс от звёзд */
    baseByStars: Record<1 | 2 | 3 | 4 | 5, number>;
    /** ± к шансу за пункт ухода от 3 */
    careStep: number;
    /** множитель настроения: moodFactor = min + (mood/100) × span
     *  (50 → «мин + полспана»; карточка §3 «настроение влияет») */
    moodFactorMin: number;
    moodFactorSpan: number;
    /** больной — эффективность 50% (карточка §4; задел F5 M11.1) */
    sickEfficiency: number;
    /** [DECISION Task 54] без нужного инструмента — ШТРАФ к шансу,
     *  НЕ отказ (Инструментальный шкаф закрывает требования) */
    toolPenaltyFactor: number;
  };
  /** [M11.2 · F15] Праздничный день — каждый N-й игровой день от
   *  абсолютного календаря (НЕ от hiredAt) [DECISION-привязка]; действует
   *  при купленном улучшении «Праздничный день» */
  holiday: {
    /** каждые N игровых дней (карточка §5: раз в неделю) */
    everyDays: number;
    /** weekday-остаток абсолютного игрового дня (данные) */
    remainder: number;
    /** +15 настроения всем нанятым (карточка §5) */
    moodBonus: number;
  };
  /** [M11.2 · F10] приоритет задач систем для worker.tick: WorkersDirector
   *  перебирает по порядку до первого успешного вызова исполнителя
   *  (farm.plant НЕ входит: выбор культуры/семян — за игроком) */
  taskBySystem: Record<'farm' | 'lake' | 'pen', string[]>;
}

export const WORKERS_TABLE: WorkersTable = {
  board: { size: 5 },
  salaryByStars: { 1: 10, 2: 18, 3: 30, 4: 50, 5: 80 },
  salaryCareStep: 0.1,
  checkPeriodHours: [2, 4, 6],
  toolChance: 0.25,
  toolByProfession: {
    farmer: { slot: 'tool', minTier: 'C' },
    fishkeeper: { slot: 'rod', minTier: 'C' },
    herdsman: { slot: 'tool', minTier: 'D' },
  },
  mood: {
    start: 50,
    min: 0,
    max: 100,
    rollDelta: 10,
    paydayOnTime: 2,
    paydayDelay: -15,
    dirtyObject: -5,
    bonus: 10,
  },
  dirty: {
    lakeCleanlinessBelow: 20,
    farmWeedsAtLeast: 1,
    penHappinessBelow: 40,
  },
  sickness: {
    chance: 0.02,
    sickFactor: 1,
    minDays: 1,
    maxDays: 3,
  },
  payday: { forecast: true },
  moodFire: {
    moodBelow: 20,
    daysInRow: 3,
    chance: 0.1,
  },
  bonus: {
    salaryMult: 1.5,
    cooldownDays: 7,
  },
  // [M11.2 · F11] шанс успеха — сетка/множители данными (карточка §3)
  success: {
    baseByStars: { 1: 0.4, 2: 0.45, 3: 0.5, 4: 0.55, 5: 0.6 },
    careStep: 0.025, // уход 1 → −0.05 … уход 5 → +0.05
    moodFactorMin: 0.5, // mood 0 → ×0.5 …
    moodFactorSpan: 0.75, // … mood 100 → ×1.25 (mood 50 → ×0.875)
    sickEfficiency: 0.5, // больной — эффективность 50% (карточка §4)
    toolPenaltyFactor: 0.6, // [DECISION Task 54] штраф, НЕ отказ
  },
  // [M11.2 · F15] Праздничный день (действует при купленном улучшении)
  holiday: {
    everyDays: 7,
    remainder: 0,
    moodBonus: 15,
  },
  // [M11.2 · F10] приоритет задач директора (данные; «свободный исполнитель»
  //  02 §10: перебор до первого ok; lake.treat/harvest цели находят сами,
  //  farm/pen — целеподбор директора из витрин)
  taskBySystem: {
    farm: ['farm.water', 'farm.weed', 'farm.harvest', 'farm.plow'],
    lake: ['lake.clean', 'lake.feed', 'lake.treat', 'lake.harvest'],
    pen: ['pen.collect', 'pen.feed', 'pen.clean', 'pen.pet'],
  },
};

/**
 * Базы статов домена работников (П2; сливаются в 'bases' при регистрации).
 *
 * Трейты-кандидаты ривена (content/workers/traits.ts) указывают на эти базы
 * (инвариант M03: stat только на существующие базы). Значения применяются
 * провайдером workerProvider в M11.2 — M11.1 хранит/показывает трейты.
 */
export const WORKERS_BASES_TABLE: BasesTable = {
  bases: {
    // «Трудолюбивый»: скидка на зарплату, % (база 0 — без трейта)
    'worker.salary.discount': 0,
    // «Ворчун»: аура настроения окружающим (база 0)
    'worker.mood.aura': 0,
    // «Проворный»: скорость работы, % (база 100 = обычная; прецедент
    // farm.growthSpeed) — потребляет M11.2
    'worker.action.speed': 100,
    // «Заботливый»: бонус ухода (база 0)
    'worker.care.bonus': 0,
  },
  meta: {
    'worker.salary.discount': { min: 0, round: 'none' },
    'worker.mood.aura': { min: 0, round: 'none' },
    'worker.action.speed': { min: 1, round: 'floor' },
    'worker.care.bonus': { min: 0, round: 'none' },
  },
};

/** пул имён работников (доска выбирает БЕЗ повторов в наборе — F2) */
export const WORKER_NAMES: string[] = [
  'Агата',
  'Аркадий',
  'Богдан',
  'Варвара',
  'Галина',
  'Демид',
  'Ефим',
  'Захар',
  'Инна',
  'Карп',
  'Лукерья',
  'Лука',
  'Марфа',
  'Настасья',
  'Овсей',
  'Пётр',
  'Радомир',
  'Степанида',
  'Тихон',
  'Устинья',
  'Фёдор',
  'Фёкла',
  'Харитон',
  'Юдифь',
];

/** профессии: id → витринное имя (карточка §2) */
export const PROFESSION_NAMES: Record<WorkerProfession, string> = {
  farmer: 'Фермер',
  fishkeeper: 'Рыбовод',
  herdsman: 'Скотник',
};
