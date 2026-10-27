/**
 * Боевые сценарии M12.2 (распил module.ts по wc-гигиене, прецедент b4af909):
 * моб-бой (runFight — F3/F6/F7 канона M12.1 + лут слоёв G5), босс-бой
 * (runBoss — G1/G2: гейты → движок → bossKilled → атомарный mine.bossLoot +
 * A+-предмет тиром A), вход (enter — G4: гейты + энергия ровно один раз).
 * Обёртки публикуют события/HP/транзакции ПОСЛЕ чистого движка.
 */
import type { Tag } from '@/shared/types/ids';
import type { Result } from '@/shared/types/result';
import { err, ok } from '@/shared/types/result';
import type { EliteModDef, MineMobDef } from '@/content/mine/mobs';
import type { MineBossDef } from '@/content/mine/bosses';
import type { MineLayerDef } from '@/content/mine/layers';
import type { MineTable } from '@/content/mine/table';
import type { TransactionService } from '@/kernel/services/transaction/transaction-service';
import type { RngBus } from '@/kernel/bus/rng-bus/rng-bus';
import type { StatBus } from '@/kernel/bus/stat-bus/stat-bus';
import type { EventBus } from '@/kernel/bus/event-bus/event-bus';
import type { SaveDirector } from '@/kernel/save/save-director';
import { resolveFight, type FightGear } from './logic/fight';
import { buildEnemies, buildBossEnemy } from './logic/enemies';
import { rollOre, rollItem, createWearPickaxe, createRollOf, publishRounds, lootFits, grantMobLoot } from './loot';
import { buildBossFightView, buildEnterView, buildFightView, type BossFightView, type EnterView, type FightView } from './view';
import type { MineState } from './state';
import type { MineModuleDeps } from './deps';

/** контекст активации (модуль собирает, сценарии потребляют) */
export interface BattleCtx {
  deps: MineModuleDeps;
  table: MineTable;
  mobs: MineMobDef[];
  eliteDefs: EliteModDef[];
  bosses: MineBossDef[];
  layers: MineLayerDef[];
  layerOf(raw: unknown): Result<MineLayerDef>;
  layerGate(def: MineLayerDef): Result<{ pick: ReturnType<MineModuleDeps['pickaxeView']> }>;
  statOf(): { atk: number; def: number; speed: number };
  gearOf(): FightGear;
  getState(): MineState;
  setState(s: MineState): void;
  markDirty(): void;
  bus: EventBus;
  transaction: TransactionService;
  rngBus: RngBus;
  statBus: StatBus;
  time: { now(): number };
  save: SaveDirector;
}

export function createBattles(x: BattleCtx): {
  runFight(mobId: string, layerRaw: unknown, eliteRaw: unknown, seedRaw: unknown): Result<FightView>;
  runBoss(layerRaw: unknown, seedRaw: unknown): Result<BossFightView>;
  enter(layerRaw: unknown): Result<EnterView>;
} {
  const wearPickaxe = createWearPickaxe(x.deps);
  const rollOf = createRollOf(x.rngBus, x.time);

  // моб-бой: движок + обёртка событий/HP/транзакций ПОСЛЕ (F3/F6/F7)
  const runFight = (
    mobId: string,
    layerRaw: unknown,
    eliteRaw: unknown,
    seedRaw: unknown,
  ): Result<FightView> => {
    const layerDef = x.layerOf(layerRaw);
    if (!layerDef.ok) return err(layerDef.error);
    const layer = layerDef.value.layer;
    const mob = x.mobs.find((m) => m.id === mobId);
    if (mob === undefined) {
      return err(`неизвестный моб: ${mobId} (реестр: ${x.mobs.map((m) => m.id).join(', ')})`);
    }
    const elite = typeof eliteRaw === 'string' && eliteRaw.length > 0 ? eliteRaw : null;
    if (elite !== null && !(mob.eliteMods ?? []).includes(elite as Tag)) {
      return err(
        `моб ${mob.id} не бывает элитным «${elite}» (доступно: ${(mob.eliteMods ?? []).join(', ') || '—'})`,
      );
    }
    const eliteDef = elite !== null ? (x.eliteDefs.find((e) => e.id === elite) ?? null) : null;
    const hpCheck = x.deps.playerHp();
    const s = x.statOf();
    const player = { hp: hpCheck.current, maxHp: hpCheck.max, ...s };
    const gear = x.gearOf();
    const enemies = buildEnemies(mob, layer, elite, x.table);
    const roll = rollOf(seedRaw);
    const outcome = resolveFight({ player, enemies, gear, table: x.table, roll });

    publishRounds(x.bus, outcome);
    const taken = Math.max(0, player.hp - outcome.playerHp);
    if (taken > 0) {
      // смерть: floor(HP) → 0 — M01 публикует player.hpChanged с тегом death
      x.deps.damageHp(taken, `mine.fight:${mob.id}`);
    }
    const stats = { ...x.getState().stats };
    stats.fights += 1;
    let loot: FightView['loot'] = null;
    if (outcome.result === 'win') {
      let goldTotal = 0;
      let oreTotal = 0;
      const items: Array<{ defId: string; qty: number }> = [];
      for (const e of outcome.enemies) {
        if (!e.killed) continue;
        const g =
          Math.floor(roll(`mine:loot:gold:${e.key}`) * (mob.gold[1] - mob.gold[0] + 1)) + mob.gold[0];
        const ore = rollOre(layerDef.value, e.key, roll);
        const item = rollItem(layerDef.value, e.key, roll);
        goldTotal += g;
        oreTotal += ore;
        if (item !== null) items.push(item);
        stats.kills += 1;
        x.bus.publish('mine.enemyKilled', {
          mobId: mob.id,
          layer,
          elite,
          loot: {
            gold: g,
            ore: { defId: layerDef.value.ore.defId, qty: ore },
            ...(item !== null ? { item } : {}),
          },
        });
      }
      // [FIX-M12 · MISS-1 AUDIT-M12] моб-лут: проба вместимости + транзакция/
      // нул-лут — хелпер grantMobLoot (loot.ts): проба по СУММЕ новых стеков
      // (руда + шанс-предметы; до фикса моб-путь вовсе не пробировал → переполнение)
      const lootGrants: Array<{ defId: string; qty: number }> = [
        { defId: layerDef.value.ore.defId, qty: oreTotal },
        ...items.map((i) => ({ defId: i.defId, qty: i.qty })),
      ];
      loot = grantMobLoot({
        deps: x.deps,
        transaction: x.transaction,
        grants: lootGrants,
        gold: goldTotal,
        reason: `добыча: ${mob.name}${eliteDef !== null ? ` (${eliteDef.name})` : ''} (слой ${layer})`,
        wear: wearPickaxe, // −1 за победу с добычей (G4)
        view: {
          ore: { defId: layerDef.value.ore.defId, qty: oreTotal },
          ...(items.length > 0 ? { item: items[0]! } : {}),
        },
      });
    }
    if (outcome.result === 'loss') {
      stats.deaths += 1;
      // cozy (карточка §5): HP := 1; судьба забега — M13-замок
      x.deps.healHp(1, 'mine.fight:cozy');
    }
    x.setState({ v: 1, stats });
    x.markDirty();
    return ok(
      buildFightView(
        {
          mobName: mob.name,
          layer,
          elite,
          eliteName: eliteDef !== null ? eliteDef.name : null,
          playerStart: {
            hp: player.hp,
            maxHp: player.maxHp,
            atk: player.atk,
            def: player.def,
            speed: player.speed,
            hasShield: gear.hasShield,
            blockSensePct: gear.blockSensePct,
            fatedPct: gear.fatedPct,
          },
          enemies: enemies.map((e) => ({ name: e.name, maxHp: e.maxHp })),
        },
        outcome,
        loot,
      ),
    );
  };

  // босс-бой (G1/G2): гейты БЕЗ энергии → движок → bossKilled → mine.bossLoot + A+ тиром A
  const runBoss = (layerRaw: unknown, seedRaw: unknown): Result<BossFightView> => {
    const layerDef = x.layerOf(layerRaw);
    if (!layerDef.ok) return err(layerDef.error);
    const def = layerDef.value;
    const gate = x.layerGate(def);
    if (!gate.ok) return err(gate.error);
    const boss = x.bosses.find((b) => b.id === def.bossId);
    if (boss === undefined) {
      return err(`слой ${def.layer}: босс ${def.bossId} не найден в content/mine/bosses.ts`);
    }
    const hpCheck = x.deps.playerHp();
    const s = x.statOf();
    const player = { hp: hpCheck.current, maxHp: hpCheck.max, ...s };
    const gear = x.gearOf();
    const enemy = buildBossEnemy(boss, def.layer, x.table, x.mobs);
    const roll = rollOf(seedRaw);
    const outcome = resolveFight({ player, enemies: [enemy], gear, table: x.table, roll });

    publishRounds(x.bus, outcome);
    const taken = Math.max(0, player.hp - outcome.playerHp);
    if (taken > 0) {
      x.deps.damageHp(taken, `mine.boss:${boss.id}`); // смерть — тег канала M01
    }
    const stats = { ...x.getState().stats };
    stats.fights += 1;
    let loot: BossFightView['loot'] = null;
    if (outcome.result === 'win') {
      stats.bossKills += 1; // ачивка босса — только ПОБЕДА (G11)
      const gold =
        Math.floor(roll(`mine:loot:gold:${boss.id}`) * (boss.gold[1] - boss.gold[0] + 1)) + boss.gold[0];
      const ore = rollOre(def, boss.id, roll);
      const aPlusPick = Math.floor(roll(`mine:loot:aplus:${boss.id}`) * boss.aPlus.length);
      const aPlus = boss.aPlus[Math.min(boss.aPlus.length - 1, aPlusPick)]!;
      // расклад витриной bossKilled (G2); bossType = bossId — фазовый
      // счётчик M01 mine.bosses.stone_guardian жив (обогащение — заявлено)
      x.bus.publish('mine.bossKilled', {
        bossId: boss.id,
        bossType: boss.id,
        layer: def.layer,
        loot: {
          gold,
          itemAPlus: aPlus,
          ore: { defId: def.ore.defId, qty: ore },
          trophy: def.trophy,
        },
      });
      // атомарность: проба → транзакция (золото+руда+трофей) → A+ тиром A (прецедент craft.collect)
      // [FIX-M12 · MISS-1 AUDIT-M12] проба вместимости — по СУММЕ новых стеков ВСЕХ
      // предметных грантов (руда + трофей): пробы D23 по отдельности не видят
      // взаимодействия (каждая «влезает» в один свободный слот), а порт D17
      // размещает гранты с enforceCapacity: false → инвентарь 21/20 (lootFits, loot.ts)
      if (lootFits(x.deps.canAcquire, [{ defId: def.ore.defId, qty: ore }, { defId: def.trophy, qty: 1 }])) {
        const t = x.transaction.transact({
          grants: [
            { t: 'currency', id: 'gold', qty: gold },
            { t: 'item', defId: def.ore.defId, qty: ore },
            { t: 'item', defId: def.trophy, qty: 1 },
          ],
          eventId: 'mine.bossLoot',
          reason: `добыча босса: ${boss.name} (слой ${def.layer})`,
        });
        if (t.ok) {
          const added = x.deps.addItem(aPlus, 'A', 1, 'mine.bossLoot');
          const wear = wearPickaxe(); // −1 за победу с добычей (G4)
          loot = {
            gold,
            ore: { defId: def.ore.defId, qty: ore },
            trophy: def.trophy,
            aPlus: { defId: aPlus, tier: 'A', granted: added.ok },
            ...(wear !== null ? { wear } : {}),
          };
        }
      } else {
        loot = {
          gold: 0,
          ore: { defId: def.ore.defId, qty: 0 },
          trophy: def.trophy,
          aPlus: { defId: aPlus, tier: 'A', granted: false },
        };
      }
    }
    if (outcome.result === 'loss') {
      stats.deaths += 1;
      x.deps.healHp(1, 'mine.boss:cozy'); // cozy (G11: смерть фазу не открывает)
    }
    x.setState({ v: 1, stats });
    x.markDirty();
    // витрина: мета включает ПОТЕНЦИАЛЬНЫЕ призывы (ключи <mobId>#s1..sN)
    const sm = enemy.boss?.summon;
    const summonsMeta = sm === undefined ? [] : Array.from({ length: sm.max }, (_, i) => ({ name: `${sm.template.name} (призыв ${i + 1})`, maxHp: sm.template.maxHp }));
    return ok(
      buildBossFightView(
        {
          mobName: boss.name,
          layer: def.layer,
          playerStart: {
            hp: player.hp,
            maxHp: player.maxHp,
            atk: player.atk,
            def: player.def,
            speed: player.speed,
            hasShield: gear.hasShield,
            blockSensePct: gear.blockSensePct,
            fatedPct: gear.fatedPct,
          },
          enemies: [{ name: boss.name, maxHp: enemy.maxHp }, ...summonsMeta],
        },
        outcome,
        loot,
      ),
    );
  };

  // вход (G4): гейты G3 + энергия 20 РОВНО один раз; бой без энергии [DECISION §0]
  const enter = (layerRaw: unknown): Result<EnterView> => {
    const layerDef = x.layerOf(layerRaw);
    if (!layerDef.ok) return err(layerDef.error);
    const def = layerDef.value;
    const gate = x.layerGate(def);
    if (!gate.ok) return err(gate.error);
    const spent = x.deps.spendEnterEnergy(`спуск в шахту (слой ${def.layer})`);
    if (!spent.ok) return err(spent.error);
    return ok(buildEnterView(def, gate.value.pick, spent.value, x.layers.length));
  };

  return { runFight, runBoss, enter };
}
