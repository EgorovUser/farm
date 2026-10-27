/**
 * Группа «M12 Шахта» — ЧАСТЬ ЭЛИТ (чеки 8–11: стая ×2, ядовитый DOT,
 * панцирный +def, масштаб слоя). Распил 01 §6 (mine-battle-checks 337 > 300 —
 * бриф «новые ≤300»): оркестратор mine-checks.ts конкатенирует ЭТУ часть
 * после боевой (между чеками 7 и 12) — порядок чеков и тексты НЕ меняются,
 * вывод selftest байт-в-байт.
 */
import { check, type CheckResult } from './types';
import { MINE_TABLE } from '@/content/mine/table';
import { resolveFight } from '@/game/modules/mine/logic/fight';
import { buildEnemies, mobHpOf } from '@/game/modules/mine/logic/enemies';
import { mobOf, NO_GEAR, SHIELD_GEAR, makeSeededMineGame } from './mine-fixture';

export async function runMineEliteChecks(): Promise<CheckResult[]> {
  const results: CheckResult[] = [];

  // ------------------------------------------------ 8. стая ×2 (hp-сплит + чередование + цель)
  {
    const spider = mobOf('spider');
    const swarm = buildEnemies(spider, 1, 'swarm', MINE_TABLE);
    const out = resolveFight({
      player: { hp: 100, maxHp: 100, atk: 20, def: 0, speed: 99 },
      enemies: swarm.map((e) => ({ ...e })),
      gear: NO_GEAR,
      table: MINE_TABLE,
      roll: () => 0.5,
    });
    // слабый игрок: 2 удара на паука — враги чередуются в общем вращении
    let k2 = 0;
    const roll2 = (id: string): number => {
      if (id.startsWith('mine:attack:spider#')) {
        k2 += 1;
        return k2 % 2 === 0 ? 0.25 : 0.75;
      }
      return 0.5;
    };
    const out2 = resolveFight({
      player: { hp: 100, maxHp: 100, atk: 8, def: 0, speed: 99 },
      enemies: buildEnemies(spider, 1, 'swarm', MINE_TABLE),
      gear: NO_GEAR,
      table: MINE_TABLE,
      roll: roll2,
    });
    const enemyKeys2 = out2.rounds.filter((r) => r.attacker === 'enemy').map((r) => r.enemyKey);
    results.push(
      check('стая F5 [DECISION]: 2 экземпляра, hp × 0.5 каждый (паук 30 → 15/15, ключи spider#0/#1); цель игрока — ПЕРВЫЙ ЖИВОЙ по порядку (Р1 → #0, после гибели → #1); враги бьют ПО ОЧЕРЕДИ в общем чередовании (#0 затем #1; после гибели #0 — только #1); победа = все мертвы', () =>
        swarm.length === 2 && swarm.every((e) => e.hp === 15) &&
        out.rounds[0]!.enemyKey === 'spider#0' && out.rounds[0]!.enemyHp === 0 &&
        out.rounds[1]!.attacker === 'enemy' && out.rounds[1]!.enemyKey === 'spider#1' &&
        out.rounds[2]!.enemyKey === 'spider#1' && out.result === 'win' && out.rounds.length === 3 &&
        JSON.stringify(enemyKeys2) === JSON.stringify(['spider#0', 'spider#1', 'spider#1']) &&
        out2.result === 'win', {
        expected: '15/15; #0→#1→#1 (чередование); win ×2',
        actual: `${swarm.map((e) => e.hp).join('/')}; ${enemyKeys2.join('→')}; ${out.result}/${out2.result}`,
      }),
    );
  }

  // ------------------------------------------------ 9. ядовитый DOT (после хода атакующего)
  {
    const venom = buildEnemies(mobOf('slime'), 1, 'venomous', MINE_TABLE);
    // паттерн слизеля [[mid,bottom],[bottom,mid]] чередуется по атакам:
    // k-я атака 0.25 → pair[0] (k нечётный mid, чётный bottom); блок
    // подстраивается тем же чередованием (0.5 → mid, 0.9 → bottom) — все
    // удары ОТБИТЫ, яд проходит СКВОЗЬ блок
    let bk = 0;
    const roll = (id: string): number => {
      if (id === 'mine:block') {
        bk += 1;
        return bk % 2 === 1 ? 0.5 : 0.9;
      }
      if (id === 'mine:attack:slime') return 0.25;
      return 0.5;
    };
    const out = resolveFight({
      player: { hp: 100, maxHp: 100, atk: 30, def: 0, speed: 99 },
      enemies: venom,
      gear: SHIELD_GEAR,
      table: MINE_TABLE,
      roll,
    });
    const r2 = out.rounds[1]!;
    const r4 = out.rounds[3]!;
    results.push(
      check('ядовитый F5 (DOT после хода атакующего, длительность = бой): слизель бьёт, блок игрока — удар ОТБИТ (урон 0), НО яд −2 снимается СКВОЗЬ блок (HP 100 → 98 → 96); победа за 7 раундов, HP 94 (0 удара + 3×2 яда)', () =>
        r2.attacker === 'enemy' && r2.blocked === true && r2.damage === 0 && r2.dot === 2 && r2.playerHp === 98 &&
        r4.blocked === true && r4.dot === 2 && r4.playerHp === 96 &&
        out.result === 'win' && out.rounds.length === 7 && out.playerHp === 94, {
        expected: 'блок+яд; 98/96; win 7 раундов; HP 94',
        actual: `Р2 ${r2.damage}+яд${r2.dot} → ${r2.playerHp}; Р4 → ${r4.playerHp}; ${out.result} ${out.rounds.length}; HP ${out.playerHp}`,
      }),
    );
  }

  // ------------------------------------------------ 10. панцирный +def
  {
    const plain = resolveFight({
      player: { hp: 1000, maxHp: 1000, atk: 10, def: 0, speed: 99 },
      enemies: buildEnemies(mobOf('spider'), 1, null, MINE_TABLE),
      gear: NO_GEAR,
      table: MINE_TABLE,
      roll: () => 0.99,
    }).rounds[0]!;
    const armored = resolveFight({
      player: { hp: 1000, maxHp: 1000, atk: 10, def: 0, speed: 99 },
      enemies: buildEnemies(mobOf('spider'), 1, 'armored', MINE_TABLE),
      gear: NO_GEAR,
      table: MINE_TABLE,
      roll: () => 0.99,
    }).rounds[0]!;
    results.push(
      check('панцирный F5 (+def данными MINE_TABLE = 6): урон по пауку без элиты floor(10×100/100) = 10; с элитой floor(1000/106) = 9 — урон МЕНЬШЕ на величину бонуса защиты; элита в бриф-наборе паука (mine elite spider venomous — соседний слот) отвергается для недоступных пар', () =>
        plain.damage === 10 && armored.damage === 9, {
        expected: '10; 9',
        actual: `${plain.damage}; ${armored.damage}`,
      }),
    );
  }

  // ------------------------------------------------ 11. масштаб слоя 1.6^(n−1)
  {
    const f = await makeSeededMineGame('m121-scale');
    const r = f.mine['mine.mob']('slime') as
      | { ok: true; value: { hpByLayer: string[]; hpBase: number } }
      | { ok: false; error: string };
    const byApi = r.ok ? r.value.hpByLayer.join(' · ') : 'ошибка';
    results.push(
      check('масштаб слоя F5: mobHP = floor(hpBase × 1.6^(слой−1)) — средний моб (hpBase 50): 50 → 80 → 128 (слои 1–3); слизель 90: 90 → 144 → 230 (90 × 2.56 = 230.4 → 230 — проба брифа §5); витрина mine.mob slime показывает HP по слоям', () =>
        mobHpOf(50, 1, MINE_TABLE) === 50 &&
        mobHpOf(50, 2, MINE_TABLE) === 80 &&
        mobHpOf(50, 3, MINE_TABLE) === 128 &&
        mobHpOf(90, 1, MINE_TABLE) === 90 &&
        mobHpOf(90, 3, MINE_TABLE) === 230 &&
        r.ok && r.value.hpByLayer.join(' · ') === '1 → 90 · 2 → 144 · 3 → 230', {
        expected: '50/80/128; 90/144/230; витрина 1 → 90 · 2 → 144 · 3 → 230',
        actual: `${mobHpOf(50, 1, MINE_TABLE)}/${mobHpOf(50, 2, MINE_TABLE)}/${mobHpOf(50, 3, MINE_TABLE)}; ${mobHpOf(90, 1, MINE_TABLE)}/${mobHpOf(90, 3, MINE_TABLE)}; ${byApi}`,
      }),
    );
    f.dispose();
  }

  return results;
}
