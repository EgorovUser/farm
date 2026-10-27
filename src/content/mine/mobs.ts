/**
 * Контент M12 «Шахта»: мобы ×7 + элитные модификаторы ×3 (карточка M12 §4,
 * бриф SESSION-M12.1 F5; 03-DATA §7 MobDef-канон + модульные расширения).
 * ВСЕ числа мобов — ЗДЕСЬ (П6; единственное место чисел).
 *
 * Сетка hpBase — бриф F5 [DECISION]: паук 30 (быстрый/слабый), летучая
 * мышь 40 (уклонение), кобольд-шаман 45 (само-баф в одиночном бою),
 * скелет-мечник 50 (средний — канон карточки «50 × 1.6^(n−1)»), копейщик
 * 55, слизель 90 (толстый), голем 160 (мини-босс, медленный). atk/def/speed
 * — стартовые числа (тюн-слот, П6: правятся здесь без миграций).
 *
 * attackDirs — паттерны атак по раундам (канон 03-DATA §7: ПАРЫ направлений
 * на раунд): в свой k-й ход моб роллит 50/50 между двумя направлениями пары
 * attackDirs[(k−1) mod len] — циклический паттерн [DECISION брифа F4],
 * НЕ равномерный ролл по трём. drops — таблица канона MobDef, M12.2
 * заполнит (руда по слою/предметы/трофеи); расклад M12.1 = gold [min,max]
 * (бриф F6). Элитные модификаторы — числа эффектов в MINE_TABLE (П2).
 */
import type { ID, Tag } from '@/shared/types/ids';

export type AttackDir = 'top' | 'mid' | 'bottom';

/** Моб шахты: канон MobDef 03-DATA §7 + модульные поля (speed/evade/…) */
export interface MineMobDef {
  id: ID;
  name: string;
  hpBase: number;
  atk: number;
  def: number;
  /** скорость бойца: первым бьёт более быстрая сторона (карточка §3) */
  speed: number;
  /** паттерны атак по раундам (пары направлений; циклический [DECISION F4]) */
  attackDirs: [AttackDir, AttackDir][];
  /** % уклонения — «блок без щита» (летучая мышь, карточка §4) */
  evade?: number;
  /** само-баф шамана: +atk за свой ход, в ОДИНОЧНОМ бою [DECISION F5] */
  selfBuff?: { perRound: number; capBonus: number };
  /** мини-босс (голем) */
  miniBoss?: boolean;
  tags: Tag[];
  /** расклад M12.1: золото [min, max] (руда/предметы/трофеи — M12.2) */
  gold: [number, number];
  /** канон MobDef: таблица дропов (заполнение — M12.2) */
  drops: Array<{ defId: ID; weight: number; qty: [number, number] }>;
  /** доступные элитные модификаторы (канон MobDef) */
  eliteMods?: Tag[];
}

export const MINE_MOBS: MineMobDef[] = [
  {
    id: 'spider',
    name: 'Паук',
    hpBase: 30,
    atk: 6,
    def: 0,
    speed: 14,
    attackDirs: [
      ['top', 'mid'],
      ['mid', 'bottom'],
    ],
    tags: ['enemy:spider', 'mine'],
    gold: [2, 5],
    drops: [],
    eliteMods: ['venomous', 'swarm'],
  },
  {
    id: 'bat',
    name: 'Летучая мышь',
    hpBase: 40,
    atk: 7,
    def: 0,
    speed: 12,
    evade: 15,
    attackDirs: [
      ['top', 'bottom'],
      ['mid', 'top'],
    ],
    tags: ['enemy:bat', 'mine'],
    gold: [3, 6],
    drops: [],
    eliteMods: ['venomous', 'swarm'],
  },
  {
    id: 'kobold_shaman',
    name: 'Кобольд-шаман',
    hpBase: 45,
    atk: 5,
    def: 2,
    speed: 8,
    attackDirs: [
      ['top', 'mid'],
      ['mid', 'bottom'],
    ],
    selfBuff: { perRound: 2, capBonus: 6 },
    tags: ['enemy:kobold_shaman', 'mine'],
    gold: [4, 8],
    drops: [],
    eliteMods: ['venomous', 'armored'],
  },
  {
    id: 'skeleton',
    name: 'Скелет-мечник',
    hpBase: 50,
    atk: 9,
    def: 4,
    speed: 10,
    attackDirs: [
      ['top', 'mid'],
      ['mid', 'bottom'],
      ['bottom', 'top'],
    ],
    tags: ['enemy:skeleton', 'mine'],
    gold: [5, 10],
    drops: [],
    eliteMods: ['armored', 'venomous'],
  },
  {
    id: 'spearman',
    name: 'Копейщик',
    hpBase: 55,
    atk: 11,
    def: 3,
    speed: 9,
    attackDirs: [
      ['mid', 'bottom'],
      ['top', 'mid'],
      ['bottom', 'mid'],
    ],
    tags: ['enemy:spearman', 'mine'],
    gold: [6, 12],
    drops: [],
    eliteMods: ['armored', 'swarm'],
  },
  {
    id: 'slime',
    name: 'Слизель',
    hpBase: 90,
    atk: 7,
    def: 8,
    speed: 6,
    attackDirs: [
      ['mid', 'bottom'],
      ['bottom', 'mid'],
    ],
    tags: ['enemy:slime', 'mine'],
    gold: [8, 16],
    drops: [],
    eliteMods: ['armored', 'venomous'],
  },
  {
    id: 'golem',
    name: 'Голем',
    hpBase: 160,
    atk: 14,
    def: 10,
    speed: 5,
    miniBoss: true,
    attackDirs: [
      ['top', 'mid'],
      ['mid', 'bottom'],
      ['bottom', 'top'],
    ],
    tags: ['enemy:golem', 'mine', 'miniboss'],
    gold: [20, 40],
    drops: [],
    eliteMods: ['armored', 'venomous'],
  },
];

/** Элитные модификаторы ×3 (карточка §4; числа эффектов — MINE_TABLE, П2) */
export interface EliteModDef {
  id: Tag;
  name: string;
  /** качественное описание (числа — ТОЛЬКО в MINE_TABLE) */
  description: string;
}

export const ELITE_MODS: EliteModDef[] = [
  { id: 'venomous', name: 'Ядовитый', description: 'урон ядом после каждого своего хода (весь бой)' },
  { id: 'armored', name: 'Панцирный', description: 'бонус к защите' },
  { id: 'swarm', name: 'Стая', description: 'две особи с половинным HP, бьют по очереди' },
];
