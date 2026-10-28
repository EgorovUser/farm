/**
 * Контент M13.1 «Карточный рогалик»: карты забега ×12 kinds (карточка M13 §2 —
 * поимённо), факел-семантика (§3), статусы слоёв (§1), кротовый сток (§2),
 * «Насыщенность шахты» (§1) — ВСЕ числа ЗДЕСЬ (П6; канон 03-DATA §7 MineCardDef).
 *
 * kind 'boss' — вес 0: в колонки НЕ роллится (финальная карта слоя собирается
 * из данных слоя M12.2 — payload bossId). kind 'mob' — payload.mobPool +
 * eliteChance; сам mobId роллится при генерации (стрим mine:gen:mob:*).
 * Пейлоады карт — ДАННЫЕ: резолвер (resolve.ts) читает их обобщённо (П5),
 * никаких ветвлений по id карт в коде.
 */
import type { ID, Tag } from '@/shared/types/ids';
import type { Condition, Requirement } from '@/shared/types/requirement';

export type MineCardKind =
  | 'empty'
  | 'oreVein'
  | 'chest'
  | 'collapse'
  | 'mob'
  | 'boss'
  | 'altar'
  | 'spring'
  | 'campfire'
  | 'trader'
  | 'camp'
  | 'exit';

/** канон 03-DATA §7 MineCardDef + модульное поле payload (данные карты) */
export interface MineCardDef {
  id: ID;
  kind: MineCardKind;
  hidden: boolean;
  weight: number;
  payload?: unknown;
  unlock?: Requirement;
}

/** жертва алтаря: ровно один непустой способ оплаты (данные) */
export interface AltarPrice {
  gold?: number;
  hp?: number;
  item?: { defId: ID; qty: number };
}

/** предложение алтаря: жертва → баф забега (Modifier-данные) */
export interface AltarOffer {
  label: string;
  price: AltarPrice;
  mod: {
    stat: string;
    op: 'flat' | 'inc' | 'more';
    value: number;
    label: string;
  };
}

/** мини-событие лагеря (auto-режим до фазы 6, прецедент событий-мини M07) */
export interface CampEventChoice {
  label: string;
  effect: { heal?: number; gold?: [number, number]; torches?: number };
}
export interface CampEvent {
  text: string;
  choices: CampEventChoice[];
  /** auto-режим: индекс выбора данных (до фазы 6 UI нет) */
  autoPick: number;
}

export interface MineCardsPayloads {
  empty: { xp: number };
  oreVein: { qtyMult: number };
  chest: {
    gold: [number, number];
    itemRolls: number;
    trapChance: number;
    trapDamage: [number, number];
  };
  collapse: { damage: [number, number] };
  mob: { mobPool: ID[]; eliteChance: number };
  altar: { offers: AltarOffer[] };
  spring: { healPercent: number };
  campfire: { label: string };
  trader: {
    name: string;
    markupPercent: number;
    /** ctx-тег крота для PriceBus (наценка данными, 04-DISCOUNTS §1) */
    priceTag: Tag;
    stock: Array<{ defId: ID; qty: number; label: string }>;
  };
  camp: {
    finds: Array<{ weight: number; kind: 'gold' | 'torches' | 'item'; gold?: [number, number]; torches?: number }>;
    events: CampEvent[];
  };
  exit: { label: string };
}

export const MINE_CARDS: MineCardDef[] = [
  {
    id: 'card_empty',
    kind: 'empty',
    hidden: false,
    weight: 10,
    payload: { xp: 5 } as MineCardsPayloads['empty'],
  },
  {
    id: 'card_ore_vein',
    kind: 'oreVein',
    hidden: false,
    weight: 22,
    payload: { qtyMult: 2 } as MineCardsPayloads['oreVein'],
  },
  {
    id: 'card_chest',
    kind: 'chest',
    hidden: false,
    weight: 10,
    payload: {
      gold: [8, 25],
      itemRolls: 2,
      trapChance: 15,
      trapDamage: [3, 8],
    } as MineCardsPayloads['chest'],
  },
  {
    id: 'card_collapse',
    kind: 'collapse',
    hidden: false,
    weight: 8,
    payload: { damage: [4, 10] } as MineCardsPayloads['collapse'],
  },
  {
    id: 'card_mob',
    kind: 'mob',
    hidden: false,
    weight: 20,
    payload: {
      mobPool: ['spider', 'bat', 'kobold_shaman', 'skeleton', 'spearman', 'slime'],
      eliteChance: 10,
    } as MineCardsPayloads['mob'],
  },
  {
    id: 'card_boss',
    kind: 'boss',
    hidden: false,
    // в колонки НЕ роллится (карточка §1: финал слоя; R2 «вес 0»)
    weight: 0,
    payload: null,
  },
  {
    id: 'card_altar',
    kind: 'altar',
    hidden: false,
    weight: 5,
    payload: {
      offers: [
        {
          label: 'золото → ярость (+20% урона забега)',
          price: { gold: 30 },
          mod: { stat: 'mine.damage', op: 'flat', value: 20, label: 'ярость алтаря' },
        },
        {
          label: 'кровь → меткость (+10% крита забега)',
          price: { hp: 8 },
          mod: { stat: 'mine.crit', op: 'flat', value: 10, label: 'меткость алтаря' },
        },
        {
          label: 'травы → чутьё скрытого (+15 mine.luck.hidden забега)',
          price: { item: { defId: 'healing_herb', qty: 2 } },
          mod: { stat: 'mine.luck.hidden', op: 'flat', value: 15, label: 'чутьё алтаря' },
        },
      ],
    } as MineCardsPayloads['altar'],
  },
  {
    id: 'card_spring',
    kind: 'spring',
    hidden: false,
    weight: 5,
    payload: { healPercent: 50 } as MineCardsPayloads['spring'],
  },
  {
    id: 'card_campfire',
    kind: 'campfire',
    hidden: false,
    weight: 6,
    payload: { label: 'костёр' } as MineCardsPayloads['campfire'],
  },
  {
    id: 'card_trader',
    kind: 'trader',
    hidden: false,
    weight: 4,
    payload: {
      name: 'Торговец-крот',
      markupPercent: 30,
      priceTag: 'mine:trader',
      stock: [
        { defId: 'potion_might', qty: 2, label: 'зелье ярости' },
        { defId: 'potion_keen', qty: 2, label: 'зелье меткости' },
        { defId: 'mine_torch', qty: 2, label: 'факел' },
        { defId: 'scroll_exit', qty: 1, label: 'свиток выхода' },
      ],
    } as MineCardsPayloads['trader'],
  },
  {
    id: 'card_camp',
    kind: 'camp',
    hidden: false,
    weight: 6,
    payload: {
      finds: [
        { weight: 4, kind: 'torches', torches: 1 },
        { weight: 3, kind: 'gold', gold: [5, 15] },
        { weight: 3, kind: 'item' },
      ],
      events: [
        {
          text: 'У догорающего костра — чей-то брошенный мешок. Взять?',
          choices: [
            { label: 'обыскать мешок', effect: { gold: [6, 12] } },
            { label: 'не трогать чужое', effect: { heal: 5 } },
          ],
          autoPick: 0,
        },
        {
          text: 'Заброшенная койка. Передохнуть пару часов?',
          choices: [
            { label: 'поспать', effect: { heal: 8 } },
            { label: 'взять одеяло с собой (факел)', effect: { torches: 1 } },
          ],
          autoPick: 0,
        },
      ],
    } as MineCardsPayloads['camp'],
  },
  {
    id: 'card_exit',
    kind: 'exit',
    hidden: false,
    weight: 4,
    payload: { label: 'лестница вверх' } as MineCardsPayloads['exit'],
  },
];

/**
 * Факел (карточка §3): семантика ПО ДАННЫМ — mode 'direct' = гарантированно;
 * 'luck' = ролл с удачей mine.luck.hidden (02-BUSES §6). [DECISION R5]:
 * дефолт mode 'luck', base 100 ⇒ без дебафов гарантированно (chance =
 * clamp(base × (1 + mine.luck.hidden/100), 0, 100)).
 */
export const MINE_TORCH: { mode: 'direct' | 'luck'; base: number } = {
  mode: 'luck',
  base: 100,
};

/**
 * Статусы слоёв (карточка §1): холодный/тёмный/ядовитый/жаркий — данные по
 * слою; витрина в runStarted/`mine run`, тег status:<x> в ctx (страхи-Condition
 * M13.2 читают). Эффекты на забег — ТОЛЬКО данными: поле effect (Modifier-
 * данные с условием ctxTag status:<x>) — отсутствует = витрина/тег без эффекта.
 */
export interface MineLayerStatusDef {
  layer: number;
  status: 'cold' | 'dark' | 'poison' | 'hot' | null;
  effect?: { stat: string; op: 'flat' | 'inc' | 'more'; value: number; label: string };
}

export const MINE_LAYER_STATUSES: MineLayerStatusDef[] = [
  { layer: 1, status: null },
  { layer: 2, status: 'cold', effect: { stat: 'mine.damage', op: 'flat', value: -10, label: 'замёрз в холодном слое' } },
  { layer: 3, status: 'dark', effect: { stat: 'mine.hiddenChance', op: 'flat', value: 10, label: 'тьма прячет больше тайн' } },
  { layer: 4, status: null },
  { layer: 5, status: 'poison' },
  { layer: 6, status: 'cold', effect: { stat: 'mine.damage', op: 'flat', value: -10, label: 'замёрз в холодном слое' } },
  { layer: 7, status: 'hot' },
  { layer: 8, status: 'dark', effect: { stat: 'mine.hiddenChance', op: 'flat', value: 10, label: 'тьма прячет больше тайн' } },
  { layer: 9, status: null },
];

/**
 * «Насыщенность шахты» (карточка §1): первый забег календарного дня —
 * модификатор дня ПО ДАННЫМ (+10% руды через inc на mine.oreYield; ривен-
 * канал кирок oreYield — тот же стат, компонуются).
 */
export const MINE_SATURATION: { oreBonusPercent: number } = { oreBonusPercent: 10 };

/**
 * Run-эффекты предметов ИЗ ДАННЫХ (бриф R3 «свиток — предмет с run-эффектом
 * из данных (тег)»): defId → эффект забега. Использование в забеге —
 * командой M13 (mine pick 0); новые эффекты = строки данных (П5).
 */
export interface MineRunEffectItem {
  defId: ID;
  effect: 'exit';
  label: string;
}

export const MINE_RUN_EFFECTS: MineRunEffectItem[] = [
  { defId: 'scroll_exit', effect: 'exit', label: 'свиток выхода' },
];

/** Страхи-Condition для чтения статуса (M13.2 прочитает тем же оценщиком) */
export const STATUS_TAG: (status: string) => Tag = (status) => `status:${status}` as Tag;

export type { Condition };
