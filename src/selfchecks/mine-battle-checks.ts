/**
 * Группа «M12 Шахта» — ЧАСТЬ БОЕВАЯ (чеки 3–7: монте-карло блоков χ²,
 * формула урона, крит, паттерны attackDirs, уклонение). Распил 01 §6
 * (бриф «новые ≤300»): оркестратор mine-checks.ts конкатенирует ЭТУ часть
 * после чека 2, затем элитную mine-elite-checks (8–11) — порядок чеков и
 * тексты НЕ меняются, вывод selftest байт-в-байт.
 */
import { check, type CheckResult } from './types';
import { MINE_TABLE } from '@/content/mine/table';
import { RollLog } from '@/kernel/bus/rng-bus/roll-log';
import { mulberry32 } from '@/shared/utils/rng';
import {
  resolveFight,
  resolveDefense,
  dirOf,
  baseDamage,
  type FightGear,
} from '@/game/modules/mine/logic/fight';
import { buildEnemies, mobHpOf } from '@/game/modules/mine/logic/enemies';
import { makeSeededRoll } from '@/game/modules/mine/logic/seed';
import { mobOf, NO_GEAR, SHIELD_GEAR, scriptRoll, dummyEnemy, makeSeededMineGame } from './mine-fixture';

export async function runMineBattleChecks(): Promise<CheckResult[]> {
  const results: CheckResult[] = [];

  // ------------------------------------------------ 3. монте-карло блоков (χ² df=2)
  {
    const N = 10_000;
    const lcg0 = mulberry32(20261027);
    const counts = { top: 0, mid: 0, bottom: 0 };
    let blocked0 = 0;
    for (let i = 0; i < N; i++) {
      const d = resolveDefense(dirOf(lcg0()), SHIELD_GEAR, () => lcg0(), () => lcg0());
      if (d.blockDir !== null) counts[d.blockDir] += 1;
      if (d.blocked) blocked0 += 1;
    }
    const exp = N / 3;
    const chi2 = (['top', 'mid', 'bottom'] as const).reduce((s, k) => s + (counts[k] - exp) ** 2 / exp, 0);
    const p = 12;
    const gearS: FightGear = { ...SHIELD_GEAR, blockSensePct: p };
    const lcg1 = mulberry32(20261028);
    let blockedS = 0;
    for (let i = 0; i < N; i++) {
      const d = resolveDefense(dirOf(lcg1()), gearS, () => lcg1(), () => lcg1());
      if (d.blocked) blockedS += 1;
    }
    const expectS = 1 / 3 + (2 / 3) * (p / 100);
    const lcg2 = mulberry32(20261029);
    let blockedNo = 0;
    for (let i = 0; i < N; i++) {
      const d = resolveDefense(dirOf(lcg2()), { ...NO_GEAR, blockSensePct: 99 }, () => lcg2(), () => lcg2());
      if (d.blocked) blockedNo += 1;
    }
    results.push(
      check(`монте-карло блоков (10 000 фикс-LCG): blockDir uniform — χ² df=2 = ${chi2.toFixed(2)} < 5.99 (канон UV-1 M11.1); блок-рейт без чутья ≈ 1/3 (${(blocked0 / N).toFixed(3)}); с чутьём ${p}% ≈ 1/3+(2/3)·p = ${expectS.toFixed(3)} (${(blockedS / N).toFixed(3)}; механика «при успехе blockDir := attackDir»); БЕЗ щита блоков РОВНО 0 (блок невозможен)`, () =>
        chi2 < 5.99 &&
        Math.abs(blocked0 / N - 1 / 3) <= 0.02 &&
        Math.abs(blockedS / N - expectS) <= 0.02 &&
        blockedNo === 0, {
        expected: 'χ² < 5.99; ≈1/3; ≈1/3+(2/3)p; без щита 0',
        actual: `χ² ${chi2.toFixed(2)}; ${blocked0}/${N}; ${blockedS}/${N}; без щита ${blockedNo}`,
      }),
    );
  }

  // ------------------------------------------------ 4. формула урона + минимум (карточка §3)
  {
    results.push(
      check('формула урона F4: damage = floor(atk × 100 / (100 + def)) оракулами (10/50 → 6; 25/25 → 20; 33/1 → 32; 100/0 → 100; 7/8 → 6); минимальный урон = 1 (atk 1 vs def 999: floor(100/1099) = 0 → 1)', () =>
        baseDamage(10, 50, MINE_TABLE) === 6 &&
        baseDamage(25, 25, MINE_TABLE) === 20 &&
        baseDamage(33, 1, MINE_TABLE) === 32 &&
        baseDamage(100, 0, MINE_TABLE) === 100 &&
        baseDamage(7, 8, MINE_TABLE) === 6 &&
        baseDamage(1, 999, MINE_TABLE) === 1, {
        expected: '6; 20; 32; 100; 6; 1',
        actual: `${baseDamage(10, 50, MINE_TABLE)}; ${baseDamage(25, 25, MINE_TABLE)}; ${baseDamage(33, 1, MINE_TABLE)}; ${baseDamage(100, 0, MINE_TABLE)}; ${baseDamage(7, 8, MINE_TABLE)}; ${baseDamage(1, 999, MINE_TABLE)}`,
      }),
    );
  }

  // ------------------------------------------------ 5. крит 5% (base через шину) + ×1.5
  {
    const skel = buildEnemies(mobOf('skeleton'), 1, null, MINE_TABLE);
    const critGear: FightGear = { ...NO_GEAR, critPct: 5 };
    const hit = (critRoll: number) =>
      resolveFight({
        player: { hp: 1000, maxHp: 1000, atk: 10, def: 0, speed: 99 },
        enemies: skel.map((e) => ({ ...e })),
        gear: critGear,
        table: MINE_TABLE,
        roll: scriptRoll({ 'mine:crit': critRoll }),
      }).rounds[0]!;
    const crit = hit(0.01);
    const plain = hit(0.99);
    // статистика: 100 боёв по лимиту раундов (кап 200) = 10 000 атак игрока
    let crits = 0;
    let attacks = 0;
    for (let s = 0; s < 100; s++) {
      const out = resolveFight({
        player: { hp: 100_000, maxHp: 100_000, atk: 1, def: 0, speed: 99 },
        enemies: [dummyEnemy()],
        gear: critGear,
        table: MINE_TABLE,
        roll: makeSeededRoll(777_000 + s, new RollLog(), () => 0),
      });
      for (const r of out.rounds) {
        if (r.attacker === 'player') {
          attacks += 1;
          if (r.crit) crits += 1;
        }
      }
    }
    results.push(
      check(`крит F4 (base 5% через шину — resolve mine.crit): точный оракул — ролл 0.01 < 5% → крит floor(9 × 1.5) = 13 и помечен; 0.99 → без крита 9 (скелет def 4); монте-карло 10 000 атак фикс-сидов: критов ${crits} ≈ 5% (${((crits / attacks) * 100).toFixed(2)}%)`, () =>
        crit.crit === true && crit.damage === 13 &&
        plain.crit === false && plain.damage === 9 &&
        attacks === 10_000 && Math.abs(crits / attacks - 0.05) <= 0.02, {
        expected: '13/крит; 9/без; 10 000 атак; 5% ± 2пп',
        actual: `${crit.damage}/${crit.crit}; ${plain.damage}/${plain.crit}; ${attacks}; ${((crits / attacks) * 100).toFixed(2)}%`,
      }),
    );
  }

  // ------------------------------------------------ 6. паттерны attackDirs (данные, НЕ uniform)
  {
    const skel = mobOf('skeleton');
    const enemies = buildEnemies(skel, 1, null, MINE_TABLE);
    let k = 0;
    const roll = (id: string): number => {
      if (id === 'mine:attack:skeleton') {
        k += 1;
        return k % 2 === 0 ? 0.25 : 0.75; // чётный → pair[0], нечётный → pair[1]
      }
      return 0.5;
    };
    const out = resolveFight({
      player: { hp: 100_000, maxHp: 100_000, atk: 1, def: 0, speed: 99 },
      enemies,
      gear: NO_GEAR,
      table: MINE_TABLE,
      roll,
    });
    const enemyRounds = out.rounds.filter((r) => r.attacker === 'enemy');
    const expectedDirs = enemyRounds.map((_, i) => {
      const pair = skel.attackDirs[i % skel.attackDirs.length]!;
      return (i + 1) % 2 === 1 ? pair[1] : pair[0];
    });
    const match = enemyRounds.every((r, i) => r.attackDir === expectedDirs[i]);
    // первым бьёт более быстрая сторона; при равенстве — игрок [DECISION]
    const first = (enemySpeed: number, playerSpeed: number) =>
      resolveFight({
        player: { hp: 1000, maxHp: 1000, atk: 50, def: 0, speed: playerSpeed },
        enemies: [dummyEnemy({ speed: enemySpeed, hp: 1 })],
        gear: NO_GEAR,
        table: MINE_TABLE,
        roll: () => 0.5,
      }).rounds[0]!.attacker;
    results.push(
      check('паттерны attackDirs F4/F5: моб бьёт ПО ПАТТЕРНУ (циклический [DECISION], 50/50 в паре — НЕ uniform): k-я атака скелета ∈ паре attackDirs[(k−1) mod 3] (данные), сверка последовательности из 49 атак; первым бьёт быстрая сторона (враг 99 > игрок 1 → враг; игрок 99 > 1 → игрок); при равенстве скоростей — ИГРОК [DECISION]', () =>
        match && enemyRounds.length === 49 &&
        first(99, 1) === 'enemy' && first(1, 99) === 'player' && first(10, 10) === 'player', {
        expected: 'последовательность = паттерну; 49 атак; enemy/player/player',
        actual: `${match ? 'совпадает' : 'РАСХОЖДЕНИЕ'}; ${enemyRounds.length}; ${first(99, 1)}/${first(1, 99)}/${first(10, 10)}`,
      }),
    );
  }

  // ------------------------------------------------ 7. уклонение мыши 15%
  {
    const bat = buildEnemies(mobOf('bat'), 1, null, MINE_TABLE);
    const hit = (evadeRoll: number) =>
      resolveFight({
        player: { hp: 1000, maxHp: 1000, atk: 10, def: 0, speed: 99 },
        enemies: bat.map((e) => ({ ...e })),
        gear: NO_GEAR,
        table: MINE_TABLE,
        roll: scriptRoll({ 'mine:evade:bat': evadeRoll }),
      }).rounds[0]!;
    const evaded = hit(0.1);
    const notEvaded = hit(0.9);
    let evades = 0;
    let attacks = 0;
    for (let s = 0; s < 100; s++) {
      const out = resolveFight({
        player: { hp: 100_000, maxHp: 100_000, atk: 1, def: 0, speed: 99 },
        enemies: [dummyEnemy({ evade: 15 })],
        gear: NO_GEAR,
        table: MINE_TABLE,
        roll: makeSeededRoll(888_000 + s, new RollLog(), () => 0),
      });
      for (const r of out.rounds) {
        if (r.attacker === 'player') {
          attacks += 1;
          if (r.evaded === true) evades += 1;
        }
      }
    }
    results.push(
      check(`уклонение мыши F5 (15%, данные): отдельный ролл ДО урона — «блок без щита»: ролл 0.10 < 15% → evaded, урон 0 (мышь невредима); 0.90 → урон 10 проходит; монте-карло 10 000 атак: уклонений ${evades} ≈ 15% (${((evades / attacks) * 100).toFixed(2)}%)`, () =>
        evaded.evaded === true && evaded.damage === 0 && evaded.enemyHp === 40 &&
        notEvaded.evaded !== true && notEvaded.damage === 10 &&
        attacks === 10_000 && Math.abs(evades / attacks - 0.15) <= 0.02, {
        expected: 'evaded/0/40; 10; 15% ± 2пп',
        actual: `${evaded.damage}/${evaded.enemyHp}; ${notEvaded.damage}; ${((evades / attacks) * 100).toFixed(2)}%`,
      }),
    );
  }

  return results;
}
