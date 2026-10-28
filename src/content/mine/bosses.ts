/**
 * Контент M12.2 «Шахта»: боссы ×3 фазами (карточка M12 §4, бриф SESSION-M12.2
 * G1; 03-DATA §7 MobDef-канон + слот boss). ВСЕ числа боссов — ЗДЕСЬ (П6).
 *
 * Фазы — ДАННЫЕ, движок знает ровно три вида (G1 «новый босс = новые данные
 * БЕЗ кода» — карточка §7-тест): freeze (заморозка направления блока),
 * skipDouble (пропуск → двойной удар), summon (вызов элитки M12.1).
 *
 * HP боссов масштабируются ОТДЕЛЬНЫМ множителем MINE_TABLE.boss.hpScale
 * (мягче мобового 1.6 — глубокие циклы слоёв остаются проходимыми в лимит
 * раундов; мобы каноном M12.1 не тронуты). Канонические слои: королева 1,
 * владыка 2, змей 3; цикл повторяется (данные layers.ts).
 */
import type { ID, Tag } from '@/shared/types/ids';
import type { AttackDir } from './mobs';

/** Фаза «заморозка» (паучья королева): одно направление блока игрока
 *  замораживается на turns ХОДОВ (модификатор с длительностью раундов —
 *  модель 02-BUSES §2, применённая внутри чистого движка); блок в нём
 *  невозможен, ролл блока — по двум оставшимся направлениям. */
export interface BossFreezeDef {
  /** ход босса, на котором срабатывает первая заморозка */
  onTurn: number;
  /** повтор каждые N ходов босса (цикл фазы) */
  everyTurns: number;
  /** длительность: ходов защиты игрока (3 → 2 → 1) */
  turns: number;
}

/** Фаза «пропуск → двойной» (каменный владыка): каждый everyTurns-й ход
 *  босс ПРОПУСКАЕТ удар, следующий — ДВОЙНОЙ (счётчик фазы в логе честности). */
export interface BossSkipDoubleDef {
  everyTurns: number;
}

/** Фаза «вызов» (глубинный змей): при падении HP ниже порога вызывает
 *  элитку M12.1 (существующие eliteMods; стая-адресация — цель игрока
 *  первый живой, [DECISION]-переподтверждение G11). */
export interface BossSummonDef {
  mobId: ID;
  elite: Tag;
  /** доля HP (0..1), ниже которой срабатывает вызов */
  atHpBelow: number;
  /** максимум вызовов за бой */
  max: number;
}

export interface MineBossDef {
  id: ID;
  name: string;
  hpBase: number;
  atk: number;
  def: number;
  speed: number;
  attackDirs: [AttackDir, AttackDir][];
  tags: Tag[];
  /** канон MobDef 03-DATA §7 (боссы не используют — расклад задан aPlus) */
  drops: Array<{ defId: ID; weight: number; qty: [number, number] }>;
  /** канон MobDef: слот босса */
  boss: true;
  /** расклад: золото [min, max] */
  gold: [number, number];
  /** таблица A+-предметов: ровно ОДНА единица тира A за победу (G2) */
  aPlus: ID[];
  freeze?: BossFreezeDef;
  skipDouble?: BossSkipDoubleDef;
  summon?: BossSummonDef;
}

export const MINE_BOSSES: MineBossDef[] = [
  {
    id: 'spider_queen',
    name: 'Паучья королева',
    hpBase: 130,
    atk: 11,
    def: 3,
    speed: 8,
    attackDirs: [
      ['top', 'mid'],
      ['mid', 'bottom'],
      ['bottom', 'top'],
    ],
    tags: ['enemy:spider_queen', 'mine', 'boss'],
    drops: [],
    boss: true,
    gold: [30, 60],
    aPlus: ['iron_sword', 'leather_armor', 'buckler'],
    freeze: { onTurn: 1, everyTurns: 5, turns: 3 },
  },
  {
    id: 'stone_guardian',
    name: 'Каменный владыка',
    hpBase: 144,
    atk: 13,
    def: 10,
    speed: 6,
    attackDirs: [
      ['top', 'mid'],
      ['mid', 'bottom'],
      ['bottom', 'top'],
    ],
    tags: ['enemy:stone_guardian', 'mine', 'boss'],
    drops: [],
    boss: true,
    gold: [40, 80],
    aPlus: ['iron_axe', 'knight_armor', 'iron_sword'],
    skipDouble: { everyTurns: 3 },
  },
  {
    id: 'deep_serpent',
    name: 'Глубинный змей',
    hpBase: 154,
    atk: 15,
    def: 6,
    speed: 9,
    attackDirs: [
      ['mid', 'bottom'],
      ['top', 'mid'],
      ['bottom', 'top'],
    ],
    tags: ['enemy:deep_serpent', 'mine', 'boss'],
    drops: [],
    boss: true,
    gold: [50, 100],
    aPlus: ['hunting_bow', 'steel_axe', 'knight_armor'],
    summon: { mobId: 'spider', elite: 'venomous', atHpBelow: 0.5, max: 2 },
  },
];
