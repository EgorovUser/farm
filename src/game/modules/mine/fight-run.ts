/**
 * Бои ЗАБЕГА M13.1 (бриф R3 «mob/элита — бой M12 resolveFight — обёртка после
 * боя, паттерн M12.1 F3»): движок M12 НЕ тронут — обёртка публикует события,
 * применяет HP/транзакции ПОСЛЕ чистого resolveFight. Отличие от песочницы
 * M12 (battles.ts): ЛУТ → runBag (НЕ в инвентарь), золото — сразу в кошелёк
 * (eventId mine.lootRun), смерть — подписка M13.1 (deaths+cozy+конец 'death'
 * — обёртка НЕ дублирует). A+ босса — тиром A в runBag (общая выдача R4).
 */
import type { Result } from '@/shared/types/result';
import { err, ok } from '@/shared/types/result';
import { resolveFight } from './logic/fight';
import { buildEnemies, buildBossEnemy } from './logic/enemies';
import { rollOre, rollItem, createWearPickaxe, createRollOf, publishRounds } from './loot';
import { endRun, type RunCtx } from './run';
import { collectOre, collectToBag } from './bag';
import type { CardResolution } from './resolve';
import type { MineRunState, RunCard } from './state';
import type { MineLayerDef } from '@/content/mine/layers';

function fightCore(x: RunCtx, layerDef: MineLayerDef) {
  const wearPickaxe = createWearPickaxe(x.deps);
  const rollOf = createRollOf(x.rngBus, x.time);
  const hpCheck = x.deps.playerHp();
  const s = x.statOf();
  const player = { hp: hpCheck.current, maxHp: hpCheck.max, ...s };
  const gear = x.gearOf();
  return { wearPickaxe, rollOf, player, gear };
}

/** моб/элита в забеге: победа → лут в runBag + золото в кошелёк */
export function runMobFight(
  x: RunCtx,
  run: MineRunState,
  card: RunCard,
  layerDef: MineLayerDef,
): Result<CardResolution> {
  const mobId = card.mobId ?? 'spider';
  const mob = x.mobs.find((m) => m.id === mobId);
  if (mob === undefined) return err(`карта моба: неизвестный моб ${mobId}`);
  const elite = card.elite ?? null;
  const eliteDef = elite !== null ? (x.eliteDefs.find((e) => e.id === elite) ?? null) : null;
  const { wearPickaxe, rollOf, player, gear } = fightCore(x, layerDef);
  const enemies = buildEnemies(mob, layerDef.layer, elite, x.table);
  const roll = rollOf(undefined);
  const outcome = resolveFight({ player, enemies, gear, table: x.table, roll });

  publishRounds(x.bus, outcome);
  const taken = Math.max(0, player.hp - outcome.playerHp);
  if (taken > 0) {
    x.deps.damageHp(taken, `mine.fight:${mob.id}`); // смерть — подписка M13.1
  }
  const stats = { ...x.getState().stats };
  stats.fights += 1;
  const lines: string[] = [];
  let died = false;
  if (x.getState().run === undefined) {
    died = true;
  }
  if (outcome.result === 'win') {
    let goldTotal = 0;
    for (const e of outcome.enemies) {
      if (!e.killed) continue;
      const g = Math.floor(roll(`mine:loot:gold:${e.key}`) * (mob.gold[1] - mob.gold[0] + 1)) + mob.gold[0];
      const ore = rollOre(layerDef, e.key, roll);
      const item = rollItem(layerDef, e.key, roll);
      goldTotal += g;
      stats.kills += 1;
      x.bus.publish('mine.enemyKilled', {
        mobId: mob.id,
        layer: layerDef.layer,
        elite,
        loot: {
          gold: g,
          ore: { defId: layerDef.ore.defId, qty: ore },
          ...(item !== null ? { item } : {}),
        },
      });
      if (x.getState().run !== undefined) {
        const ro = collectOre(x, run, layerDef, ore, 1);
        if (ro.qty > 0) lines.push(`${layerDef.ore.defId} ×${ro.qty} → runBag${ro.lost > 0 ? ` (${ro.lost} НЕ влезло)` : ''}`);
      }
      if (item !== null && x.getState().run !== undefined) {
        const iq = x.rngBus.rollTable('inventory.quality', { ...x.time.ctx('player') });
        const iv = x.rngBus.rollRange(0, 100, 'uniform', 'inventory.quality.value', { ...x.time.ctx('player') });
        const TIERS = ['D', 'C', 'B', 'A', 'S', 'SS'] as const;
        const tier = (TIERS as readonly string[]).includes(iq ?? '') ? (iq as 'D' | 'C' | 'B' | 'A' | 'S' | 'SS') : 'D';
        const r = collectToBag(x, run, item.defId, item.qty, { tier, value: iv });
        lines.push(`${item.defId} ×${item.qty} (${tier}) → runBag${r.lost > 0 ? ` (${r.lost} НЕ влезло)` : ''}`);
      }
    }
    if (goldTotal > 0) {
      const t = x.transaction.transact({
        grants: [{ t: 'currency', id: 'gold', qty: goldTotal }],
        eventId: 'mine.lootRun',
        reason: `бой в забеге: ${mob.name} (слой ${layerDef.layer})`,
      });
      if (t.ok) lines.push(`${goldTotal}з → кошелёк (mine.lootRun)`);
    }
    if (x.getState().run !== undefined) {
      const wear = wearPickaxe();
      if (wear !== null) lines.push(wear);
    }
  }
  x.setState({ ...x.getState(), stats });
  x.markDirty();
  if (died) {
    return ok({ header: `Бой: ${mob.name}${eliteDef !== null ? ` (${eliteDef.name})` : ''}`, lines: ['игрок пал в бою — смерть обработана подпиской M13.1 (cozy HP := 1, −20%/−5% runBag)'] });
  }
  return ok({
    header: `Бой: ${mob.name}${eliteDef !== null ? ` (${eliteDef.name})` : ''} (слой ${layerDef.layer})`,
    lines: lines.length > 0 ? lines : ['победа без добычи (нулевые роллы лута)'],
  });
}

/** босс-финал: победа = конец забега 'boss' + трофей/A+ через общую выдачу */
export function runBossFight(
  x: RunCtx,
  run: MineRunState,
  card: RunCard,
  layerDef: MineLayerDef,
): Result<CardResolution> {
  const gate = x.layerGate(layerDef);
  if (!gate.ok) return err(gate.error);
  const boss = x.bosses.find((b) => b.id === layerDef.bossId);
  if (boss === undefined) {
    return err(`слой ${layerDef.layer}: босс ${layerDef.bossId} не найден в content/mine/bosses.ts`);
  }
  const { wearPickaxe, rollOf, player, gear } = fightCore(x, layerDef);
  const enemy = buildBossEnemy(boss, layerDef.layer, x.table, x.mobs);
  const roll = rollOf(undefined);
  const outcome = resolveFight({ player, enemies: [enemy], gear, table: x.table, roll });

  publishRounds(x.bus, outcome);
  const taken = Math.max(0, player.hp - outcome.playerHp);
  if (taken > 0) {
    x.deps.damageHp(taken, `mine.boss:${boss.id}`);
  }
  const stats = { ...x.getState().stats };
  stats.fights += 1;
  const lines: string[] = [];
  if (outcome.result === 'win') {
    stats.bossKills += 1;
    const gold = Math.floor(roll(`mine:loot:gold:${boss.id}`) * (boss.gold[1] - boss.gold[0] + 1)) + boss.gold[0];
    const ore = rollOre(layerDef, boss.id, roll);
    const aPlusPick = Math.floor(roll(`mine:loot:aplus:${boss.id}`) * boss.aPlus.length);
    const aPlus = boss.aPlus[Math.min(boss.aPlus.length - 1, aPlusPick)]!;
    x.bus.publish('mine.bossKilled', {
      bossId: boss.id,
      bossType: boss.id,
      layer: layerDef.layer,
      loot: {
        gold,
        itemAPlus: aPlus,
        ore: { defId: layerDef.ore.defId, qty: ore },
        trophy: layerDef.trophy,
      },
    });
    if (x.getState().run !== undefined) {
      const ro = collectOre(x, run, layerDef, ore, 1);
      collectToBag(x, run, layerDef.trophy, 1, { tier: 'D', value: 0 });
      collectToBag(x, run, aPlus, 1, { tier: 'A', value: 0 });
      const t = x.transaction.transact({
        grants: [{ t: 'currency', id: 'gold', qty: gold }],
        eventId: 'mine.lootRun',
        reason: `босс забега: ${boss.name} (слой ${layerDef.layer})`,
      });
      lines.push(`${gold}з → кошелёк${t.ok ? '' : ' (отказ транзакции!)'}`);
      lines.push(`${layerDef.ore.defId} ×${ro.qty} + трофей ${layerDef.trophy} + ${aPlus} (тир A) → runBag`);
      const wear = wearPickaxe();
      if (wear !== null) lines.push(wear);
    }
  }
  x.setState({ ...x.getState(), stats });
  x.markDirty();
  if (outcome.result !== 'win') {
    return ok({ header: `Босс: ${boss.name} (слой ${layerDef.layer})`, lines: ['бой не выигран — забег завершён смертью (подписка M13.1)'] });
  }
  // cardResolved публикует вызывающий (pick), здесь — только конец 'boss'
  const end = endRun(x, 'boss');
  if (!end.ok) return err(end.error);
  lines.push('ПОБЕДА над боссом — конец забега (причина boss)');
  lines.push(`выдача 100%: ${end.value.granted.map((g) => `${g.defId} ×${g.qty}${g.tier !== undefined ? ` (${g.tier})` : ''}`).join(' + ') || 'рюкзак пуст'}`);
  if (end.value.lostByCapacity.length > 0) {
    lines.push(`НЕ влезло (поимённо): ${end.value.lostByCapacity.map((l) => `${l.defId} ×${l.qty}`).join(', ')} — слоты основного рюкзака`);
  }
  return ok({ header: `Босс: ${boss.name} (слой ${layerDef.layer})`, lines });
}
