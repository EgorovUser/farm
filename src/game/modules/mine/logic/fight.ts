/**
 * Боевой движок M12.1+M12.2 — ЧИСТАЯ функция (карточка M12 §3/§7, бриф F3/F4
 * + M12.2 G1): resolveFight(...) без побочных эффектов — фиксированный сид →
 * идентичный лог (golden-тест); транзакции/события/HP-изменения публикует
 * ОБЁРТКА ПОСЛЕ боя (паттерн actionDone M11.2).
 *
 * Раунд (карточка §3, ВСЕ числа — content/mine):
 *  1. атакующий роллит attackDir ∈ {top, mid, bottom} — игрок uniform
 *     (стрим mine:attack:player), моб — по паттерну attackDirs (циклический
 *     [DECISION F4], 50/50 в паре);
 *  2. защищающийся С ЩИТОМ роллит blockDir (mine:block); без щита блок
 *     невозможен; чутьё щита при промахе подтягивает blockDir := attackDir;
 *     «Вещий удар» помечает раунд вещим и при щите ставит blockDir :=
 *     attackDir [DECISION F4]; замороженное направление — блок невозможен;
 *  3. attackDir == blockDir → БЛОК; иначе damage = floor(atk × divisor /
 *     (divisor + def)), минимум min; крит ×multiplier; mine.damage ×(1+pct/100);
 *  4. стороны чередуются; первым бьёт быстрая сторона, равенство → игрок.
 *
 * Особенности (данные content/mine): уклонение (мышь) — ролл ДО урона; стая —
 * чередование, цель игрока — первый живой [DECISION F5]; ядовитый — DOT;
 * шаман — само-баф в одиночном бою [DECISION F5]. Босс-фазы M12.2 (G1):
 * королева — заморозка блока (3 → 2 → 1 ход); владыка — пропуск → двойной;
 * змей — вызов элитки (шаблон из обёртки — движок контента не читает).
 */
import type { AttackDir } from '@/content/mine/mobs';
import type { MineTable } from '@/content/mine/table';
import type { PlayerCombat, EnemyCombat, FightGear, RoundRecord, FightOutcome, FightInput, FightRoll } from './basics';
import { ATTACK_DIRS, dirOf, baseDamage, resolveDefense } from './basics';

export * from './basics';

/** шаг игрока: true, если бой окончен (все враги мертвы) */
function playerTurn(
  rec: RoundRecord,
  player: PlayerCombat,
  enemies: EnemyCombat[],
  gear: FightGear,
  table: MineTable,
  roll: FightRoll,
  summons: Map<string, number>,
): boolean {
  const target = enemies.find((e) => e.hp > 0); // первый живой по порядку [DECISION F5]
  if (target === undefined) return true;
  rec.enemyKey = target.key;
  rec.attackDir = dirOf(roll('mine:attack:player'));
  if (target.evade > 0 && roll(`mine:evade:${target.key}`) < target.evade / 100) {
    rec.evaded = true; // уклонение — «блок без щита» (карточка §4)
  } else {
    let dmg = baseDamage(player.atk, target.def, table);
    if (gear.critPct > 0 && roll('mine:crit') < gear.critPct / 100) {
      rec.crit = true;
      dmg = Math.floor(dmg * table.crit.multiplier);
    }
    if (gear.damagePct !== 0) {
      dmg = Math.max(table.damage.min, Math.floor(dmg * (1 + gear.damagePct / 100)));
    }
    rec.damage = dmg;
    target.hp = Math.max(0, target.hp - dmg);
    // змей: вызов элитки при падении HP ниже порога (живой, в пределах max)
    const s = target.boss?.summon;
    if (
      s !== undefined && target.hp > 0 && target.hp / target.maxHp < s.atHpBelow &&
      (summons.get(target.key) ?? 0) < s.max
    ) {
      const n = (summons.get(target.key) ?? 0) + 1;
      summons.set(target.key, n);
      const called: EnemyCombat = {
        ...s.template,
        key: `${s.template.mobId}#s${n}`,
        name: `${s.template.name} (призыв ${n})`,
      };
      enemies.push(called);
      rec.summon = { key: called.key, mobId: called.mobId, elite: s.elite };
    }
  }
  rec.enemyHp = target.hp;
  rec.playerHp = Math.max(0, player.hp);
  return enemies.every((e) => e.hp <= 0);
}

/** шаг врага: true, если бой окончен (игрок пал) */
function enemyTurn(
  rec: RoundRecord,
  player: PlayerCombat,
  enemies: EnemyCombat[],
  gear: FightGear,
  table: MineTable,
  roll: FightRoll,
  cursor: { i: number },
  ordinals: Map<string, number>,
  freezeState: { dir: AttackDir | null; left: number },
  pendingDouble: Map<string, boolean>,
): boolean {
  let attacker: EnemyCombat | undefined;
  for (let i = 0; i < enemies.length; i++) {
    const cand = enemies[(cursor.i + i) % enemies.length];
    if (cand.hp > 0) {
      attacker = cand;
      cursor.i = (cursor.i + i + 1) % enemies.length; // стая бьёт по очереди [DECISION F5]
      break;
    }
  }
  if (attacker === undefined) return true;
  rec.enemyKey = attacker.key;
  const ordinal = (ordinals.get(attacker.key) ?? 0) + 1;
  ordinals.set(attacker.key, ordinal);
  // шаман: само-баф в ОДИНОЧНОМ бою, перед ударом [DECISION F5]
  if (attacker.selfBuff !== undefined && enemies.length === 1) {
    attacker.atk = Math.min(attacker.atkBase + attacker.selfBuff.capBonus, attacker.atk + attacker.selfBuff.perRound);
    rec.selfBuff = attacker.atk;
  }
  // --- фаза «владыка»: каждые everyTurns-й ход — ПРОПУСК, следующий — ДВОЙНОЙ
  const skip = attacker.boss?.skipDouble;
  if (skip !== undefined && ordinal % skip.everyTurns === 0) {
    rec.skipped = true; // счётчик фазы в логе честности (G1)
    pendingDouble.set(attacker.key, true);
    rec.playerHp = Math.max(0, player.hp);
    rec.enemyHp = attacker.hp;
    return false;
  }
  const isDouble = pendingDouble.get(attacker.key) === true;
  if (isDouble) pendingDouble.set(attacker.key, false);
  // --- фаза «королева»: заморозка направления блока игрока (цикл фазы).
  //  Состояние ЭТОГО раунда фиксируется ДО триггера: раунд объявления не
  //  скован и не тикает (ровно turns ПОСЛЕДУЮЩИХ защит: 3 → 2 → 1 ход)
  const roundFrozen =
    freezeState.dir !== null && freezeState.left > 0 ? freezeState.dir : null;
  const fz = attacker.boss?.freeze;
  if (
    fz !== undefined && freezeState.left === 0 &&
    (ordinal === fz.onTurn || (ordinal > fz.onTurn && (ordinal - fz.onTurn) % fz.everyTurns === 0))
  ) {
    freezeState.dir = dirOf(roll(`mine:boss:freeze:${attacker.key}`));
    freezeState.left = fz.turns;
    rec.freeze = { dir: freezeState.dir, left: freezeState.left };
  }
  const pair = attacker.attackDirs[(ordinal - 1) % attacker.attackDirs.length];
  rec.attackDir = roll(`mine:attack:${attacker.key}`) < 0.5 ? pair[0] : pair[1];
  // «Вещий удар»: увидеть направление ДО раунда (M10 §3; при щите — блок [DECISION F4]);
  // замороженное направление — блок невозможен (заморозка сильнее вещести)
  if (gear.fatedPct > 0 && roll('mine:fated') < gear.fatedPct / 100) rec.fated = true;
  if (gear.hasShield) {
    if (rec.fated === true) {
      rec.blockDir = rec.attackDir;
      rec.blocked = rec.attackDir !== roundFrozen;
    } else {
      const d = resolveDefense(
        rec.attackDir,
        gear,
        () => roll('mine:block'),
        () => roll('mine:blockSense'),
        roundFrozen,
      );
      rec.blockDir = d.blockDir;
      rec.blocked = d.blocked;
      if (d.sense) rec.sense = true;
    }
  }
  // витрина заморозки: эта защита скована (3 → 2 → 1 ход), затем тик вниз
  if (roundFrozen !== null) {
    rec.frozen = { dir: roundFrozen, left: freezeState.left };
    freezeState.left -= 1;
  }
  if (!rec.blocked) {
    let dmg = baseDamage(attacker.atk, player.def, table);
    if (isDouble) {
      rec.double = true; // удар двойной после пропуска (G1)
      dmg = Math.floor(dmg * 2);
    }
    rec.damage = dmg;
    player.hp -= dmg;
  }
  // ядовитая элита: DOT после хода атакующего (длительность = бой)
  if (attacker.dot > 0) {
    rec.dot = attacker.dot;
    player.hp -= attacker.dot;
  }
  rec.playerHp = Math.max(0, player.hp);
  rec.enemyHp = attacker.hp;
  if (player.hp <= 0) {
    player.hp = 0;
    return true;
  }
  return false;
}

/** resolveFight: чистая функция боя (шапка файла; F3 карточки §7) */
export function resolveFight(input: FightInput): FightOutcome {
  const { gear, table, roll } = input;
  const player: PlayerCombat = { ...input.player };
  const enemies: EnemyCombat[] = input.enemies.map((e) => ({ ...e }));
  const rounds: RoundRecord[] = [];
  const enemySpeed = enemies.reduce((m, e) => Math.max(m, e.speed), 0);
  let turn: 'player' | 'enemy' = player.speed >= enemySpeed ? 'player' : 'enemy'; // равенство → игрок [DECISION F4]
  const cursor = { i: 0 };
  const ordinals = new Map<string, number>();
  // [M12.2] состояние фаз: заморозка (игрок) + двойной/призывы (по боссам)
  const freezeState: { dir: AttackDir | null; left: number } = { dir: null, left: 0 };
  const pendingDouble = new Map<string, boolean>();
  const summons = new Map<string, number>();
  let result: FightOutcome['result'] | null = null;
  let round = 0;
  while (result === null && round < table.rounds.cap) {
    round += 1;
    const rec: RoundRecord = {
      round,
      attacker: turn,
      attackDir: 'top',
      blockDir: null,
      blocked: false,
      damage: 0,
      crit: false,
      playerHp: Math.max(0, player.hp),
      enemyHp: 0,
      enemyKey: '',
    };
    const over =
      turn === 'player'
        ? playerTurn(rec, player, enemies, gear, table, roll, summons)
        : enemyTurn(rec, player, enemies, gear, table, roll, cursor, ordinals, freezeState, pendingDouble);
    // over ⇒ либо все враги мертвы (win), либо игрок пал (loss);
    // ничья возможна только от лимита раундов (данные) — ниже
    if (over) result = player.hp <= 0 ? 'loss' : 'win';
    rounds.push(rec);
    turn = turn === 'player' ? 'enemy' : 'player';
  }
  if (result === null) result = 'stalemate'; // лимит раундов (данные) — защита от вечного боя
  return {
    rounds,
    result,
    playerHp: Math.max(0, player.hp),
    enemies: enemies.map((e) => ({ key: e.key, hp: e.hp, killed: e.hp <= 0 })),
  };
}
