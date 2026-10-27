/**
 * Лут-хелперы M12.2 (G4/G5, распил module.ts): износ кирки за победу с
 * добычей, роллы руды/предмета слоя (стримы mine:loot:*), публикация
 * раундов — лог честности с аддитивными полями фаз боссов.
 */
import type { EventBus } from '@/kernel/bus/event-bus/event-bus';
import type { RngBus } from '@/kernel/bus/rng-bus/rng-bus';
import type { MineLayerDef } from '@/content/mine/layers';
import type { FightOutcome, FightRoll } from './logic/basics';
import { makeSeededRoll } from './logic/seed';
import type { MineModuleDeps } from './deps';

/** износ кирки −1 за победу с добычей (G4; только при экипированной) */
export function createWearPickaxe(deps: MineModuleDeps): () => string | null {
  return () => {
    const pick = deps.pickaxeView();
    if (!pick.hasPickaxe || pick.iid === null) return null;
    const r = deps.wear(pick.iid, 1);
    if (!r.ok) return `кирка не изношена: ${r.error}`;
    return `кирка −1 прочность (${r.value.current}/${r.value.max})${r.value.broken ? ' — СЛОМАНА (моды пали)' : ''}`;
  };
}

/** ролл руды слоя: qty ∈ [min, max] (стрим mine:loot:ore:<key>) */
export function rollOre(
  def: MineLayerDef,
  key: string,
  roll: (id: string) => number,
): number {
  const [q0, q1] = def.ore.qty;
  return Math.floor(roll(`mine:loot:ore:${key}`) * (q1 - q0 + 1)) + q0;
}

/** ролл предмета слоя: шанс → взвешенный выбор (стримы mine:loot:item*) */
export function rollItem(
  def: MineLayerDef,
  key: string,
  roll: (id: string) => number,
): { defId: string; qty: number } | null {
  if (roll(`mine:loot:item:${key}`) >= def.itemChance / 100) return null;
  const total = def.items.reduce((s, i) => s + i.weight, 0);
  let pick = roll(`mine:loot:itemPick:${key}`) * total;
  for (const i of def.items) {
    pick -= i.weight;
    if (pick < 0) {
      const [q0, q1] = i.qty;
      return { defId: i.defId, qty: Math.floor(roll(`mine:loot:itemQty:${key}`) * (q1 - q0 + 1)) + q0 };
    }
  }
  return null;
}

/** публичный стрим-ролл (живые бои) / фикс-сид (--seed, golden) */
export function createRollOf(rngBus: RngBus, time: { now(): number }): (seedRaw: unknown) => FightRoll {
  return (seedRaw) => {
    const seed = seedRaw === undefined ? undefined : Number(seedRaw);
    return Number.isFinite(seed as number)
      ? makeSeededRoll(Math.floor(seed as number), rngBus.rollLog(), () => time.now())
      : (id: string) => rngBus.rollRange(0, 1, 'uniform', id);
  };
}

/** публикация раундов — лог честности (карточка §6; фазы M12.2 — аддитивно) */
export function publishRounds(bus: EventBus, outcome: FightOutcome): void {
  for (const r of outcome.rounds) {
    bus.publish('mine.turnResolved', {
      round: r.round,
      attacker: r.attacker,
      attackDir: r.attackDir,
      blockDir: r.blockDir,
      blocked: r.blocked,
      ...(r.evaded === true ? { evaded: true } : {}),
      damage: r.damage,
      crit: r.crit,
      ...(r.fated === true ? { fated: true } : {}),
      ...(r.sense === true ? { sense: true } : {}),
      ...(r.dot !== undefined ? { dot: r.dot } : {}),
      ...(r.selfBuff !== undefined ? { selfBuff: r.selfBuff } : {}),
      ...(r.freeze !== undefined ? { freeze: r.freeze } : {}),
      ...(r.frozen !== undefined ? { frozen: r.frozen } : {}),
      ...(r.skipped === true ? { skipped: true } : {}),
      ...(r.double === true ? { double: true } : {}),
      ...(r.summon !== undefined ? { summon: r.summon } : {}),
      enemyKey: r.enemyKey,
    });
  }
}
