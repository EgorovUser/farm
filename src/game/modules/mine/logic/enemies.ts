/**
 * Сборка боевых экземпляров мобов (бриф F5): масштаб слоя + элитные
 * модификаторы. Чистые функции данных — числа ТОЛЬКО в content/mine
 * (MINE_TABLE / MineMobDef), здесь ни одного магического числа.
 *
 * Масштаб слоя (карточка §4): mobHP = floor(hpBase × hpScale^(слой−1)).
 * Элиты ×3: «стая» — 2 экземпляра с hp × hpFactor каждый, бьют по очереди
 * (чередование — движок fight.ts); «панцирный» — +defBonus к защите;
 * «ядовитый» — DOT после своего хода (длительность = бой).
 *
 * [M12.2] боссы: масштаб ОТДЕЛЬНЫЙ (MINE_TABLE.boss.hpScale — мягче мобового,
 * глубокие циклы слоёв проходимы в лимит раундов); фаза «вызов» получает
 * ГОТОВЫЙ шаблон элитки (движок чистый, контента не читает — G1: босс =
 * данные без кода; шаблон строится здесь из тех же buildEnemies).
 */
import type { MineMobDef } from '@/content/mine/mobs';
import type { MineBossDef } from '@/content/mine/bosses';
import type { MineTable } from '@/content/mine/table';
import type { EnemyCombat } from './fight';

/** HP моба на слое (канон карточки: 50 × 1.6^(n−1) — средний моб) */
export function mobHpOf(hpBase: number, layer: number, table: MineTable): number {
  const l = Math.max(1, Math.floor(layer));
  return Math.floor(hpBase * Math.pow(table.layer.hpScale, l - 1));
}

/** HP босса на слое (M12.2: отдельный мягкий масштаб) */
export function bossHpOf(hpBase: number, layer: number, table: MineTable): number {
  const l = Math.max(1, Math.floor(layer));
  return Math.floor(hpBase * Math.pow(table.boss.hpScale, l - 1));
}

/** боевые экземпляры моба на слое (элита — тег или null) */
export function buildEnemies(
  mob: MineMobDef,
  layer: number,
  elite: string | null,
  table: MineTable,
): EnemyCombat[] {
  const full = mobHpOf(mob.hpBase, layer, table);
  const swarm = elite === 'swarm';
  const count = swarm ? table.elite.swarm.targets : 1;
  const hp = swarm ? Math.floor(full * table.elite.swarm.hpFactor) : full;
  return Array.from({ length: count }, (_, i) => ({
    key: count > 1 ? `${mob.id}#${i}` : mob.id,
    mobId: mob.id,
    name: count > 1 ? `${mob.name} №${i + 1}` : mob.name,
    hp,
    maxHp: hp,
    atk: mob.atk,
    atkBase: mob.atk,
    def: mob.def + (elite === 'armored' ? table.elite.armored.defBonus : 0),
    speed: mob.speed,
    evade: mob.evade ?? 0,
    attackDirs: mob.attackDirs,
    ...(mob.selfBuff !== undefined ? { selfBuff: mob.selfBuff } : {}),
    dot: elite === 'venomous' ? table.elite.venomous.dot : 0,
  }));
}

/** боевой экземпляр босса на слое (G1: фазы данными; шаблон призыва — здесь) */
export function buildBossEnemy(
  boss: MineBossDef,
  layer: number,
  table: MineTable,
  mobs: readonly MineMobDef[],
): EnemyCombat {
  const hp = bossHpOf(boss.hpBase, layer, table);
  const summonMob =
    boss.summon !== undefined ? mobs.find((m) => m.id === boss.summon!.mobId) : undefined;
  if (boss.summon !== undefined && summonMob === undefined) {
    throw new Error(`босс ${boss.id}: моб призыва ${boss.summon.mobId} не найден в content/mine`);
  }
  return {
    key: boss.id,
    mobId: boss.id,
    name: boss.name,
    hp,
    maxHp: hp,
    atk: boss.atk,
    atkBase: boss.atk,
    def: boss.def,
    speed: boss.speed,
    evade: 0,
    attackDirs: boss.attackDirs,
    dot: 0,
    boss: {
      ...(boss.freeze !== undefined ? { freeze: boss.freeze } : {}),
      ...(boss.skipDouble !== undefined ? { skipDouble: boss.skipDouble } : {}),
      ...(boss.summon !== undefined && summonMob !== undefined
        ? {
            summon: {
              atHpBelow: boss.summon.atHpBelow,
              max: boss.summon.max,
              elite: boss.summon.elite,
              template: buildEnemies(summonMob, layer, boss.summon.elite, table)[0]!,
            },
          }
        : {}),
    },
  };
}
