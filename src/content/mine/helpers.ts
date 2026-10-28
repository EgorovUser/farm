/**
 * Контент M13.2 «Помощники (наёмники)» (карточка M13 §4, брифы R1–R7):
 * классы ×5 (HelperDef-профили 03-DATA §7 — канон Task 70: atk/hp/speed),
 * пул страхов (Condition + эффект — ДАННЫЕ), пул перков 50+, зарплаты/доли/
 * цены найма, трейт-типы ривена (скоуп 'helper', бюджет по редкости —
 * MODFORGE_TABLE.traitBudgets.helper, живой движок C6 M03). ВСЕ числа —
 * ЗДЕСЬ (П6).
 *
 * [DECISION R3-форма] «Клаустрофоб» = слой ≥ 5 выражен КАТАЛОГОМ 03 §2:
 * {t:'any', cs:[ctxTag layer:5..layer:9]} — типа 'layer' в каталоге НЕТ
 * (неизвестный тип → false, П5), shared/types+utils вне леджера M13.2;
 * теги layer:N живут в ctx забега с M13.1 (runTags) — семантика слоя 1–9
 * эквивалентна буквальной форме брифа. «Мерзляк» — тег живого статуса
 * status:cold (M13.1 STATUS_RU «холодный»; карточка §1). Ветвлений по id
 * страха в коде НЕТ — универсальный checkCondition + эффекты данными.
 *
 * [DECISION R4-диспетчер] спец-эффекты классов — данные special.t
 * ('cover'/'heal'/'loot'/'reveal'/'none'); диспетчер обёртки читает ПОЛЕ
 * ДАННЫХ, не classId (прецедент карт M13.1 R3: kind → поведение). Новый
 * класс с существующим special.t = ноль кода.
 */
import type { ID, Rarity, Tag } from '@/shared/types/ids';
import type { Condition } from '@/shared/types/requirement';
import type { ModTypeDef } from '@/content/mods/registry';
import type { RolledModEntry } from '@/shared/types/rolled-mod';

export type HelperClassId = 'shieldbearer' | 'spearman' | 'medic' | 'looter' | 'scout';

/** спец-эффект класса — данные (роль/период/цель; R4) */
export type HelperClassSpecial =
  | { t: 'cover'; redirectPercent: number } // щитоносец: доля урона по игроку на себя
  | { t: 'heal'; everyTurns: number; heal: number } // медик: раз в everyTurns ходов, величина
  | { t: 'loot'; goldBonusPercent: number } // лутер: +% золота с мобов (бьёт слабейшего)
  | { t: 'reveal'; chancePercent: number } // разведчик: вскрытие скрытой карты при входе в колонку
  | { t: 'none' }; // копейщик: базовый удар (класс-ориентир скорости)

/** перк уровня «50+» (карточка §4; в M13.2-пуле ТОЛЬКО медик) */
export interface HelperPerkDef {
  t: 'revive';
  hpPercent: number; // воскресить игрока 1 раз за забег с N% HP
}

export interface HelperClassDef {
  classId: HelperClassId;
  name: string;
  role: string;
  atkBase: number;
  hpBase: number;
  speedBase: number;
  /** множитель зарплаты класса (к базе редкости) */
  salaryFactor: number;
  special: HelperClassSpecial;
  /** слот перка 50+; отсутствует = «перк не задан» (честная витрина, R6) */
  perk50?: HelperPerkDef;
}

export const HELPER_CLASSES: HelperClassDef[] = [
  {
    classId: 'shieldbearer',
    name: 'Щитоносец',
    role: 'прикрывает блоком: переносит часть урона по игроку на себя',
    atkBase: 6,
    hpBase: 60,
    speedBase: 8,
    salaryFactor: 1.1,
    special: { t: 'cover', redirectPercent: 40 },
  },
  {
    classId: 'spearman',
    name: 'Копейщик',
    role: 'базовый удар по общим правилам M12 (класс-ориентир скорости)',
    atkBase: 10,
    hpBase: 40,
    speedBase: 12,
    salaryFactor: 1.0,
    special: { t: 'none' },
  },
  {
    classId: 'medic',
    name: 'Медик',
    role: 'лечит самого раненого раз в 4 хода',
    atkBase: 5,
    hpBase: 35,
    speedBase: 9,
    salaryFactor: 1.2,
    special: { t: 'heal', everyTurns: 4, heal: 12 },
    perk50: { t: 'revive', hpPercent: 30 },
  },
  {
    classId: 'looter',
    name: 'Лутер',
    role: 'бьёт слабейшего врага; +15% золота с мобов',
    atkBase: 8,
    hpBase: 30,
    speedBase: 11,
    salaryFactor: 1.0,
    special: { t: 'loot', goldBonusPercent: 15 },
  },
  {
    classId: 'scout',
    name: 'Разведчик',
    role: 'вскрывает скрытые карты при входе в колонку (факелы не тратит)',
    atkBase: 6,
    hpBase: 30,
    speedBase: 14,
    salaryFactor: 0.9,
    special: { t: 'reveal', chancePercent: 35 },
  },
];

/** редкость кандидата: частоты + масштаб статов + экономика (данные R1) */
export interface HelperRarityRow {
  weight: number;
  atkMult: number;
  hpMult: number;
  speedAdd: number;
  salaryBase: number;
  hireCost: number;
}

export const HELPER_RARITY_ROWS: Record<Rarity, HelperRarityRow> = {
  common: { weight: 40, atkMult: 1, hpMult: 1, speedAdd: 0, salaryBase: 12, hireCost: 30 },
  uncommon: { weight: 30, atkMult: 1.15, hpMult: 1.15, speedAdd: 0, salaryBase: 20, hireCost: 60 },
  rare: { weight: 18, atkMult: 1.3, hpMult: 1.3, speedAdd: 1, salaryBase: 32, hireCost: 120 },
  epic: { weight: 9, atkMult: 1.5, hpMult: 1.5, speedAdd: 1, salaryBase: 48, hireCost: 250 },
  legendary: { weight: 3, atkMult: 1.8, hpMult: 1.8, speedAdd: 2, salaryBase: 70, hireCost: 500 },
  mythic: { weight: 1, atkMult: 2.2, hpMult: 2.2, speedAdd: 2, salaryBase: 100, hireCost: 900 },
};

export const HELPER_RARITY_RU: Record<Rarity, string> = {
  common: 'обычный',
  uncommon: 'необычный',
  rare: 'редкий',
  epic: 'эпический',
  legendary: 'легендарный',
  mythic: 'мифический',
};

/** эффект страха — данные (движок страхов читает t, НЕ id страха; R3) */
export type HelperFearEffect =
  | { t: 'standAside' } // не участвует в бою (стоит в стороне)
  | { t: 'efficiency'; percent: number } // эффективность N% (модификатор с условием)
  | { t: 'leaveRun'; chancePercent: number; columns: number[] } // шанс уйти из забега на колонках
  | { t: 'profile'; sharePct: number; goldPct: number }; // модификатор профиля (доля/золото)

export interface HelperFearDef {
  id: ID;
  name: string;
  desc: string;
  /** вес в пуле страхов доски */
  weight: number;
  /** УНИВЕРСАЛЬНЫЙ оценщик 03 §2 (ctx боя: enemy:…/status:…/layer:…/mine) */
  condition: Condition;
  effect: HelperFearEffect;
}

export const HELPER_FEAR_DEFS: HelperFearDef[] = [
  {
    id: 'fear_spiders',
    name: 'Боится пауков',
    desc: 'в боях с пауками не участвует — стоит в стороне',
    weight: 30,
    condition: { t: 'ctxTag', tag: 'enemy:spider' },
    effect: { t: 'standAside' },
  },
  {
    id: 'fear_cold',
    name: 'Мерзляк',
    desc: 'на холодных слоях эффективность 50%',
    weight: 25,
    condition: { t: 'ctxTag', tag: 'status:cold' },
    effect: { t: 'efficiency', percent: 50 },
  },
  {
    id: 'fear_claustrophobe',
    name: 'Клаустрофоб',
    desc: 'на слоях 5+ может уйти из забега на середине (10%)',
    weight: 25,
    // [DECISION R3-форма] any[layer:5..layer:9] — каталог 03 §2, см. шапку
    condition: {
      t: 'any',
      cs: [5, 6, 7, 8, 9].map((n) => ({ t: 'ctxTag', tag: `layer:${n}` })),
    },
    effect: { t: 'leaveRun', chancePercent: 10, columns: [3, 4] },
  },
  {
    id: 'fear_greedy',
    name: 'Жадный',
    desc: 'доля награды +10%, но +15% золота с мобов',
    weight: 20,
    condition: { t: 'ctxTag', tag: 'mine' },
    effect: { t: 'profile', sharePct: 10, goldPct: 15 },
  },
];

/** таблица помощников — все коэффициенты модуля (П6) */
export interface MineHelpersTable {
  /** кандидатов на доске в день (карточка §4: 3) */
  boardSize: number;
  /** слоты отряда: старт 1, кап 3 (карточка §3 «Отряд») */
  baseSlots: number;
  slotCap: number;
  /** имена кандидатов (без повторов в наборе дня) */
  names: string[];
  /** распределение числа страхов кандидата (вес → count) */
  fearCounts: Array<{ count: number; weight: number }>;
  /** доля награды с мобов — номинал профиля (карточка §4 «20%») */
  sharePoolPercent: number;
  /** репутация: +[min..max] за успешный забег, +N за босса (карточка §4) */
  repPerRun: [number, number];
  repPerBoss: number;
  /** порог уровня = levelStep × (уровень − 1); перк — от perkRepAtLeast */
  levelStep: number;
  perkRepAtLeast: number;
  /** эффекты уровня: −2% доля / −5% зарплата за уровень (уровень 1 — база) */
  levelSharePct: number;
  levelSalaryPct: number;
  shareFloor: number;
  salaryFloor: number;
  /** HP восстанавливается между забегами до max (карточка §4; данные) */
  hpRestorePercent: number;
}

export const MINE_HELPERS_TABLE: MineHelpersTable = {
  boardSize: 3,
  baseSlots: 1,
  slotCap: 3,
  names: ['Брут', 'Сажа', 'Кувалда', 'Штырь', 'Молчун', 'Сокол', 'Рябой', 'Уголёк', 'Хворост', 'Дымка'],
  fearCounts: [
    { count: 0, weight: 30 },
    { count: 1, weight: 50 },
    { count: 2, weight: 20 },
  ],
  sharePoolPercent: 20,
  repPerRun: [3, 5],
  repPerBoss: 10,
  levelStep: 10,
  perkRepAtLeast: 50,
  levelSharePct: -2,
  levelSalaryPct: -5,
  shareFloor: 0,
  salaryFloor: 0,
  hpRestorePercent: 100,
};

/** трейт-типы помощников — ривен-кандидаты (скоуп 'helper'; П1/П5:
 *  слияние в реестр 'mods' — content-registration; инвариант M03
 *  «stat → существующие базы» — mine.helper.*-строки в player/bases.ts) */
export const HELPER_TRAIT_TYPES: ModTypeDef[] = [
  {
    // «Силач»/«Хилый»: ± к атаке помощника (шина mine.helper.atk, flat)
    id: 'helper_mighty',
    stat: 'mine.helper.atk',
    scopeTags: ['helper'],
    maxPositive: 4,
    maxNegative: -3,
    costWeight: 6,
    curve: 'linear',
  },
  {
    // «Крепкий»/«Дряхлый»: ± к HP помощника
    id: 'helper_tough',
    stat: 'mine.helper.hp',
    scopeTags: ['helper'],
    maxPositive: 10,
    maxNegative: -8,
    costWeight: 6,
    curve: 'linear',
  },
  {
    // «Быстрый»/«Флегматичный»: ± к скорости (инициатива)
    id: 'helper_swift',
    stat: 'mine.helper.speed',
    scopeTags: ['helper'],
    maxPositive: 3,
    maxNegative: -2,
    costWeight: 5,
    curve: 'linear',
  },
  {
    // «Бодрый»/«Унылый»: ±% эффективности (штрафы/бонусы страха — один стат)
    id: 'helper_cheerful',
    stat: 'mine.helper.efficiency',
    scopeTags: ['helper'],
    maxPositive: 15,
    maxNegative: -10,
    costWeight: 7,
    curve: 'soft',
  },
];

/** витринные подписи трейтов (П6: трейты текстом на карточке найма) */
export const HELPER_TRAIT_LABELS: Record<string, { name: string; text: (value: number) => string }> = {
  helper_mighty: { name: 'Силач', text: (v) => `${v > 0 ? '+' : ''}${v} к атаке` },
  helper_tough: { name: 'Крепкий', text: (v) => `${v > 0 ? '+' : ''}${v} к HP` },
  helper_swift: { name: 'Быстрый', text: (v) => `${v > 0 ? '+' : ''}${v} к скорости` },
  helper_cheerful: { name: 'Бодрый', text: (v) => `${v > 0 ? '+' : ''}${v}% эффективности` },
};

/** профиль кандидата доски (канон HelperDef 03-DATA §7 + экономика найма) */
export interface HelperProfile {
  defId: ID; // hpr_<YYYYMMDD>_<i> — детерминизм дня+индекса (прецедент wk_)
  name: string;
  classId: HelperClassId;
  rarity: Rarity;
  salaryPerDay: number;
  shareOfLoot: number;
  atk: number;
  hp: number;
  speed: number;
  hireCost: number;
  traits: RolledModEntry[];
  fears: HelperFearDef[];
}

/** тег ctx экземпляра помощника (per-instance conditions канала R10) */
export const helperTag: (instanceId: string) => Tag = (instanceId) => `helper:${instanceId}` as Tag;
