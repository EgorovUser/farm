/**
 * СТАНЦИИ КРАФТА (карточка M09 §2: «покупаются как улучшения дома; данные»).
 * Рабочий верстак — стартовый (built с новой игры, costGold 0); остальные
 * шесть покупаются за золото через TransactionService (eventId craft.station).
 *
 * Улучшения станции: +queueBonus к длине очереди (стат craft.queue.length.<id>,
 * П3 — через шину) и/или эффекты-модификаторы (craftStationProvider).
 * «Мифриловая наковальня» — потолок заточки M10 как cap-модификатор на
 * forge.sharpen.levelMax (база 20, владелец — M10; наковальня cap 10, мифрил
 * cap 15 — ОДНА стек-группа: в группе max, побеждает 15 — карточка §6).
 *
 * Числа — стартовые (П6), тюнятся здесь без миграций.
 */
import type { ID } from '@/shared/types/ids';
import type { Condition } from '@/shared/types/requirement';
import type { Modifier } from '@/kernel/bus/stat-bus/modifier';

/** id станций — канон 03-DATA §8 RecipeDef.station */
export type StationId =
  | 'workbench'
  | 'smelter'
  | 'anvil'
  | 'tannery'
  | 'loom'
  | 'kitchen'
  | 'alchemy';

export interface StationUpgradeDef {
  id: ID;
  name: string;
  costGold: number;
  /** +N к длине очереди станции (стат craft.queue.length.<station>) */
  queueBonus: number;
  /** эффекты улучшения (модификаторы через craftStationProvider) */
  effects: Modifier[];
  unlock?: Condition;
}

export interface StationDef {
  id: StationId;
  name: string;
  /** покупка станции за золото; 0 = стартовая (построена с новой игры) */
  costGold: number;
  /** гейт покупки станции */
  unlock?: Condition;
  /** эффекты самой станции (наковальня → cap потолка заточки) */
  effects: Modifier[];
  upgrades: StationUpgradeDef[];
}

export const STATIONS: StationDef[] = [
  {
    id: 'workbench',
    name: 'Рабочий верстак',
    costGold: 0,
    effects: [],
    upgrades: [
      {
        id: 'big_workbench',
        name: 'Большой верстак',
        costGold: 350,
        queueBonus: 2,
        effects: [],
        unlock: { t: 'playerLevel', level: 4 },
      },
    ],
  },
  {
    id: 'smelter',
    name: 'Плавильня',
    costGold: 300,
    unlock: { t: 'playerLevel', level: 3 },
    effects: [],
    upgrades: [
      {
        id: 'hot_blast',
        name: 'Горячее дутьё',
        costGold: 450,
        queueBonus: 2,
        effects: [],
        unlock: { t: 'playerLevel', level: 6 },
      },
    ],
  },
  {
    id: 'anvil',
    name: 'Наковальня',
    costGold: 500,
    unlock: { t: 'playerLevel', level: 5 },
    // потолок заточки M10 как cap-модификатор (карточка M10 §3, [R1 · M10.1]):
    // база стата 60 (без наковальни заточка недостижима — гейт модуля forge);
    // лестница капов: наковальня 20 → «Второй молот» 40 → мифрил 60 — одна
    // стек-группа craft.anvil.cap (в группе max побеждает)
    effects: [
      {
        id: 'craft.anvil.cap',
        source: { kind: 'upgrade', refId: 'anvil' },
        stat: 'forge.sharpen.levelMax',
        op: 'cap',
        value: 20,
        stackGroup: 'craft.anvil.cap',
        label: 'наковальня: потолок заточки 20',
      },
    ],
    upgrades: [
      {
        id: 'mithril_anvil',
        name: 'Мифриловая наковальня',
        costGold: 1200,
        queueBonus: 1,
        effects: [
          {
            id: 'craft.anvil.cap.mithril',
            source: { kind: 'upgrade', refId: 'mithril_anvil' },
            stat: 'forge.sharpen.levelMax',
            op: 'cap',
            value: 60,
            stackGroup: 'craft.anvil.cap',
            label: 'мифриловая наковальня: потолок заточки 60',
          },
        ],
        unlock: { t: 'playerLevel', level: 12 },
      },
      {
        // [R1 · M10.1] улучшение может нести НЕСКОЛЬКО эффектов: очередь +2
        // И кап потолка 40 («улучшенная» наковальня карточки M10 §3)
        id: 'second_hammer',
        name: 'Второй молот',
        costGold: 600,
        queueBonus: 2,
        effects: [
          {
            id: 'craft.anvil.cap.second',
            source: { kind: 'upgrade', refId: 'second_hammer' },
            stat: 'forge.sharpen.levelMax',
            op: 'cap',
            value: 40,
            stackGroup: 'craft.anvil.cap',
            label: 'второй молот: потолок заточки 40',
          },
        ],
        unlock: { t: 'playerLevel', level: 8 },
      },
    ],
  },
  {
    id: 'tannery',
    name: 'Кожевенный верстак',
    costGold: 350,
    unlock: { t: 'playerLevel', level: 4 },
    effects: [],
    upgrades: [
      {
        id: 'tanning_oils',
        name: 'Дубильные масла',
        costGold: 400,
        queueBonus: 2,
        effects: [],
        unlock: { t: 'playerLevel', level: 7 },
      },
    ],
  },
  {
    id: 'loom',
    name: 'Ткацкий станок',
    costGold: 280,
    unlock: { t: 'playerLevel', level: 3 },
    effects: [],
    upgrades: [
      {
        id: 'fine_threads',
        name: 'Тонкие нити',
        costGold: 380,
        queueBonus: 2,
        effects: [],
        unlock: { t: 'playerLevel', level: 6 },
      },
    ],
  },
  {
    id: 'kitchen',
    name: 'Кухня',
    costGold: 250,
    unlock: { t: 'playerLevel', level: 2 },
    effects: [],
    upgrades: [
      {
        id: 'big_stove',
        name: 'Большая печь',
        costGold: 300,
        queueBonus: 2,
        effects: [],
        unlock: { t: 'playerLevel', level: 5 },
      },
    ],
  },
  {
    id: 'alchemy',
    name: 'Алхимический котёл',
    costGold: 400,
    unlock: { t: 'playerLevel', level: 5 },
    effects: [],
    upgrades: [
      {
        id: 'philosopher_dust',
        name: 'Пыль философа',
        costGold: 550,
        queueBonus: 2,
        effects: [],
        unlock: { t: 'playerLevel', level: 9 },
      },
    ],
  },
];
