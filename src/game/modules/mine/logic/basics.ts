/**
 * Базис боевого движка M12 (распил M12.2 § wc-гигиена, прецедент b4af909):
 * типы боя + чистые примитивы (направления/урон/защита). Ходы и цикл —
 * fight.ts (реэкспортирует базис — прежние импорты не меняются).
 *
 * [M12.2] босс-фазы: EnemyCombat.boss — freeze/skipDouble/summon (данные
 * content/mine/bosses.ts; движок знает ровно три вида — новый босс = данные
 * без кода, карточка §7). Заморозка — модификатор с длительностью ходов
 * (модель 02-BUSES §2, применённая внутри чистого движка).
 */
import type { AttackDir } from '@/content/mine/mobs';
import type { MineTable } from '@/content/mine/table';

export const ATTACK_DIRS: readonly AttackDir[] = ['top', 'mid', 'bottom'];

/** боец-игрок (вход движка; HP — реальный M01-стат, передаётся значением) */
export interface PlayerCombat {
  hp: number;
  maxHp: number;
  atk: number;
  def: number;
  speed: number;
}

/** снаряжение/статы игрока, влияющие на бой (обёртка резолвит по шине) */
export interface FightGear {
  hasShield: boolean;
  /** % подтяжки блока («чутьё щита»: тир-формула + ривен-канал combat.block) */
  blockSensePct: number;
  /** % «Вещего удара» (resolve combat.prophetic; карточка заточки M10) */
  fatedPct: number;
  /** % крита (resolve mine.crit; base 5) */
  critPct: number;
  /** % модификатор урона (resolve mine.damage; зелья/алтари — BUF-1) */
  damagePct: number;
}

/** босс-фазы на боевого экземпляре (данные content/mine/bosses.ts; G1 —
 *  движок знает ровно три вида, новый босс = данные без кода) */
export interface EnemyBossPhases {
  /** королева: заморозка направления блока игрока (02 §2 — модификатор
   *  с длительностью ходов, применён внутри чистого движка) */
  freeze?: { onTurn: number; everyTurns: number; turns: number };
  /** владыка: каждый everyTurns-й ход — пропуск, следующий — двойной */
  skipDouble?: { everyTurns: number };
  /** змей: вызов элитки при HP ниже порога (шаблон строит обёртка — движок
   *  чистый и контента не читает; клонирует шаблон с новым ключом) */
  summon?: {
    atHpBelow: number;
    max: number;
    elite: string;
    template: EnemyCombat;
  };
}

/** боевой экземпляр моба (стайный ключ: spider#0 / spider#1) */
export interface EnemyCombat {
  key: string;
  mobId: string;
  name: string;
  hp: number;
  maxHp: number;
  atk: number;
  atkBase: number;
  def: number;
  speed: number;
  evade: number;
  attackDirs: [AttackDir, AttackDir][];
  selfBuff?: { perRound: number; capBonus: number };
  /** ядовитая элита: урон после своего хода */
  dot: number;
  /** фазы босса (мобы — без) */
  boss?: EnemyBossPhases;
}

/** запись раунда — «лог честности» (карточка §6; событие mine.turnResolved) */
export interface RoundRecord {
  round: number;
  attacker: 'player' | 'enemy';
  attackDir: AttackDir;
  blockDir: AttackDir | null;
  blocked: boolean;
  evaded?: boolean;
  damage: number;
  crit: boolean;
  /** вещий раунд (направление увидено) */
  fated?: boolean;
  /** чутьё щита подтянуло блок */
  sense?: boolean;
  /** яд после хода ядовитого */
  dot?: number;
  /** шаман: атака после само-бафа */
  selfBuff?: number;
  /** королева заморозила направление блока (объявление фазы) */
  freeze?: { dir: AttackDir; left: number };
  /** защита в этом раунде скована заморозкой (осталось ходов) */
  frozen?: { dir: AttackDir; left: number };
  /** владыка пропустил удар (копит двойной) */
  skipped?: boolean;
  /** удар двойной (после пропуска) */
  double?: boolean;
  /** змей вызвал элитку */
  summon?: { key: string; mobId: string; elite: string };
  playerHp: number;
  enemyHp: number;
  enemyKey: string;
}

export interface FightOutcome {
  rounds: RoundRecord[];
  result: 'win' | 'loss' | 'stalemate';
  playerHp: number;
  enemies: Array<{ key: string; hp: number; killed: boolean }>;
}

/** ролл [0,1) по имени стрима — живые стримы RngBus / фикс-сид / сценарий */
export type FightRoll = (streamId: string) => number;

export interface FightInput {
  player: PlayerCombat;
  enemies: EnemyCombat[];
  gear: FightGear;
  table: MineTable;
  roll: FightRoll;
}

/** направление из ролла [0,1) — uniform по трём (карточка §3) */
export function dirOf(u: number): AttackDir {
  const i = Math.floor(u * ATTACK_DIRS.length);
  return ATTACK_DIRS[Math.min(ATTACK_DIRS.length - 1, Math.max(0, i))];
}

/** damage = floor(atk × divisor / (divisor + def)), минимум min (карточка §3) */
export function baseDamage(atk: number, def: number, table: MineTable): number {
  const d = Math.max(0, def);
  return Math.max(table.damage.min, Math.floor((atk * table.damage.divisor) / (table.damage.divisor + d)));
}

/** защита со щитом: blockDir uniform; чутьё при промахе подтягивает к атаке.
 *  Экспортировано для монте-карло self-checks (χ² df=2, канон 5.99).
 *  [M12.2] заморозка: ролл блока РАВНОМЕРНО по двум оставшимся направлениям;
 *  чутьё тянет к атаке, но в замороженное направление блок НЕВОЗМОЖЕН. */
export function resolveDefense(
  attackDir: AttackDir,
  gear: FightGear,
  rollBlock: () => number,
  rollSense: () => number,
  frozenDir?: AttackDir | null,
): { blockDir: AttackDir | null; blocked: boolean; sense: boolean } {
  if (!gear.hasShield) return { blockDir: null, blocked: false, sense: false };
  const dirs = frozenDir === undefined || frozenDir === null
    ? ATTACK_DIRS
    : ATTACK_DIRS.filter((d) => d !== frozenDir);
  const blockDir = dirs[Math.min(dirs.length - 1, Math.max(0, Math.floor(rollBlock() * dirs.length)))];
  if (blockDir === attackDir) return { blockDir, blocked: true, sense: false };
  if (gear.blockSensePct > 0 && rollSense() < gear.blockSensePct / 100) {
    if (attackDir === frozenDir) return { blockDir, blocked: false, sense: false }; // замороженное — блок невозможен
    return { blockDir: attackDir, blocked: true, sense: true };
  }
  return { blockDir, blocked: false, sense: false };
}

