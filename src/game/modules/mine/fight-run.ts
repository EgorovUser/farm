/**
 * Бои ЗАБЕГА M13.1+M13.2 (бриф R3 «mob/элита — бой M12 resolveFight — обёртка
 * после боя, паттерн M12.1 F3»): движок M12 НЕ тронут — обёртка публикует события,
 * применяет HP/транзакции ПОСЛЕ чистого resolveFight. Отличие от песочницы
 * M12 (battles.ts): ЛУТ → runBag (НЕ в инвентарь), золото — сразу в кошелёк
 * (eventId mine.lootRun), смерть — подписка M13.1 (deaths+cozy+конец 'death'
 * — обёртка НЕ дублирует). A+ босса — тиром A в runBag (общая выдача R4).
 * [FIX-M13 · P2] трофей босса — ГЕЙТ-ПРЕДМЕТ: грант транзакции в обход D23
 * (DECISION FIX13-2; был в runBag → терялся по вместимости → ачивка-гейт
 * слоя не открывался — AUDIT-M13-MISS-2).
 *
 * [M13.2 · R4] ПОМОЩНИКИ — дополнительные участники ОБЁРТКИ: инициатива по
 * speed (наша сторона = игрок + активные помощники; равенство → наша),
 * волей-раунд ДО боя (наши быстрее) или ПОСЛЕ (враги быстрее); урон — общая
 * формула M12 §3 × эффективность; щитоносец перенаправляет долю урона по
 * игроку НА СЕБЯ до применения (смерть может не наступить); золото мобов/боссов
 * с бонусом лутера/«Жадного» (mine.helper.gold); вклад участников — в
 * run.contrib (база долей R5). Призывы змея — цель движка, не волей
 * [DECISION]: помощники бьют врагов КАРТЫ (исходный состав боя).
 */
import type { Result } from '@/shared/types/result';
import { err, ok } from '@/shared/types/result';
import { resolveFight } from './logic/fight';
import type { EnemyCombat, FightOutcome } from './logic/fight';
import { buildEnemies, buildBossEnemy } from './logic/enemies';
import { rollOre, rollItem, createWearPickaxe, createRollOf, publishRounds } from './loot';
import { endRun, type RunCtx } from './run';
import { collectOre, collectToBag } from './bag';
import { applyCover, gatherHelpers, helperVolley, oursFaster, battleTagsOf, type HelperCombat } from './helpers-fight';
import { applyVolley, syncEngineHp, mobGoldBonusPct } from './helpers-battle';
import type { CardResolution } from './resolve';
import type { MineRunState, RunCard } from './state';
import type { MineLayerDef } from '@/content/mine/layers';
import type { MineMobDef } from '@/content/mine/mobs';

function fightCore(x: RunCtx, layerDef: MineLayerDef) {
  const wearPickaxe = createWearPickaxe(x.deps);
  const rollOf = createRollOf(x.rngBus, x.time);
  const hpCheck = x.deps.playerHp();
  const s = x.statOf();
  const player = { hp: hpCheck.current, maxHp: hpCheck.max, ...s };
  const gear = x.gearOf();
  return { wearPickaxe, rollOf, player, gear };
}

/** общая обёртка боя забега С помощниками (моб/элита и босс) */
function fightWithHelpers(
  x: RunCtx,
  run: MineRunState,
  layerDef: MineLayerDef,
  enemies: EnemyCombat[],
  mob: MineMobDef,
  player: ReturnType<typeof fightCore>['player'],
  gear: ReturnType<typeof fightCore>['gear'],
  roll: (id: string) => number,
): { outcome: FightOutcome; helperLines: string[]; died: boolean; won: boolean; covered: boolean } {
  const helperLines: string[] = [];
  const battleTags = battleTagsOf(run, mob);
  const { active, aside } = gatherHelpers(x, run, battleTags);
  for (const a of aside) {
    const fear = a.fears.find((f) => f.effect.t === 'standAside');
    helperLines.push(`${a.name} стоит в стороне — страх: ${fear?.name ?? '?'} (в бою не участвует)`);
  }
  const fighting = active.filter((h) => h.hp > 0);
  const enemySpeeds = enemies.map((e) => e.speed);
  const ourSpeeds = [player.speed, ...fighting.map((h) => h.speed)];
  const oursFirst = oursFaster(ourSpeeds, enemySpeeds);
  if (fighting.length > 0) {
    helperLines.push(
      `инициатива: ${oursFirst ? 'НАШИ' : 'враги'} быстрее (${Math.max(...ourSpeeds)} против ${Math.max(...enemySpeeds)}) — помощники бьют ${oursFirst ? 'ДО боя' : 'после боя'}`,
    );
  }
  const volleyOnce = (): void => {
    if (fighting.length === 0) return;
    const participants = [
      { key: 'player', name: 'игрок', hp: player.hp, maxHp: player.maxHp },
      ...active.map((h) => ({ key: h.instanceId, name: h.name, hp: h.hp, maxHp: h.maxHp })),
    ];
    const out = helperVolley({ helpers: fighting, participants, enemies, table: x.table, turns: run.turns });
    applyVolley(x, run, active, player, out);
    helperLines.push(...out.lines);
  };
  if (oursFirst) volleyOnce();

  const outcome = resolveFight({ player, enemies, gear, table: x.table, roll });
  syncEngineHp(enemies, outcome);
  publishRounds(x.bus, outcome);

  // урон игрока: щитоносец принимает долю НА СЕБЯ до применения (R4)
  const taken = Math.max(0, player.hp - outcome.playerHp);
  const covers = fighting
    .filter((h) => h.special.t === 'cover')
    .map((h) => ({
      instanceId: h.instanceId,
      name: h.name,
      redirectPercent: (h.special as { redirectPercent: number }).redirectPercent,
      hp: h.hp,
      speed: h.speed,
    }));
  const cover = applyCover({ taken, covers });
  if (taken > 0) {
    for (const r of cover.redirects) {
      const inst = (x.getState().helpers ?? []).find((h) => h.instanceId === r.instanceId);
      if (inst !== undefined) inst.hp = r.hpLeft;
      helperLines.push(`${r.name} (щитоносец) принимает на себя ${r.amount} из ${taken} урона по игроку`);
    }
    if (cover.playerTaken > 0) {
      x.deps.damageHp(cover.playerTaken, `mine.fight:${mob.id}`); // смерть — подписка M13.1 (перк R6 — внутри)
    } else if (cover.redirects.length > 0) {
      helperLines.push('урон по игроку полностью прикрыт — HP не тронуты');
    }
  }
  run.hp = Math.max(1, x.deps.playerHp().current);
  const died = x.getState().run === undefined;

  // вклад игрока: Σ урона раундов движка (эффективного; уклонения — 0)
  const playerDmg = outcome.rounds
    .filter((r) => r.attacker === 'player' && r.evaded !== true)
    .reduce((s, r) => s + r.damage, 0);
  run.contrib['player'] = (run.contrib['player'] ?? 0) + playerDmg;

  // волей-пост: враги были быстрее — добиваем выживших (если игрок жив)
  if (!oursFirst && !died && !enemies.every((e) => e.hp <= 0)) {
    volleyOnce();
  }
  // призывы змея — цель движка: волей бьёт врагов карты [DECISION]
  const summonAlive = outcome.enemies.some(
    (oe) => oe.hp > 0 && !enemies.some((m) => m.key === oe.key),
  );
  const won = enemies.every((e) => e.hp <= 0) && !summonAlive;
  return { outcome, helperLines, died, won, covered: cover.redirects.length > 0 };
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
  const battleTags = battleTagsOf(run, mob);
  const { active } = gatherHelpers(x, run, battleTags);
  const { outcome, helperLines, died, won, covered } = fightWithHelpers(x, run, layerDef, enemies, mob, player, gear, roll);

  const stats = { ...x.getState().stats };
  stats.fights += 1;
  const lines: string[] = [...helperLines];
  if (won) {
    const bonusPct = mobGoldBonusPct(x, run, battleTags, active);
    let goldTotal = 0;
    for (const e of enemies) {
      if (e.hp > 0) continue;
      const gBase = Math.floor(roll(`mine:loot:gold:${e.key}`) * (mob.gold[1] - mob.gold[0] + 1)) + mob.gold[0];
      const g = bonusPct > 0 ? Math.max(1, Math.floor(gBase * (1 + bonusPct / 100))) : gBase;
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
      run.mobGold += goldTotal; // база долей R5 (только золото мобов/боссов)
      const t = x.transaction.transact({
        grants: [{ t: 'currency', id: 'gold', qty: goldTotal }],
        eventId: 'mine.lootRun',
        reason: `бой в забеге: ${mob.name} (слой ${layerDef.layer})`,
      });
      lines.push(
        `${goldTotal}з → кошелёк (mine.lootRun)${bonusPct > 0 ? ` · бонус помощников +${bonusPct}% золота` : ''}${t.ok ? '' : ' (отказ транзакции!)'}`,
      );
    }
    if (x.getState().run !== undefined) {
      const wear = wearPickaxe();
      if (wear !== null) lines.push(wear);
    }
  }
  x.setState({ ...x.getState(), stats });
  x.markDirty();
  if (died) {
    return ok({ header: `Бой: ${mob.name}${eliteDef !== null ? ` (${eliteDef.name})` : ''}`, lines: ['игрок пал в бою — смерть обработана подпиской M13.1 (cozy HP := 1, −20%/−5% runBag)', ...lines] });
  }
  if (!won) {
    lines.push(`бой не завершён победой (исход движка: ${outcome.result}${covered ? ' — урон прикрыт щитоносцем, игрок выжил' : ''}) — забег продолжается`);
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
  const battleTags = battleTagsOf(run, boss);
  const { active } = gatherHelpers(x, run, battleTags);
  const { outcome, helperLines, died, won } = fightWithHelpers(x, run, layerDef, [enemy], boss, player, gear, roll);

  const stats = { ...x.getState().stats };
  stats.fights += 1;
  const lines: string[] = [...helperLines];
  if (won) {
    stats.bossKills += 1;
    const bonusPct = mobGoldBonusPct(x, run, battleTags, active);
    const gBase = Math.floor(roll(`mine:loot:gold:${boss.id}`) * (boss.gold[1] - boss.gold[0] + 1)) + boss.gold[0];
    const gold = bonusPct > 0 ? Math.max(1, Math.floor(gBase * (1 + bonusPct / 100))) : gBase;
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
      collectToBag(x, run, aPlus, 1, { tier: 'A', value: 0 });
      run.mobGold += gold; // база долей R5 (только золото мобов/боссов)
      // [FIX-M13 · P2 / DECISION FIX13-2] трофей — ГЕЙТ-ПРЕДМЕТ (контракт
      // награды босса M12 §4, НЕ лут): грант-канал транзакции (ItemPort,
      // enforceCapacity:false — тот же канал, что песочница M12.2) БЕЗ
      // D23-пробы — в обход вместимости; item.acquired → auto-claim M15
      // открывает ach_mine_boss_N (hasItem) по факту первой победы.
      // A+-предмет и руда — ЛУТ в runBag: «гарантированный» M12 §4 =
      // гарантия ДРОПА, не вместимости — утраты по D23 честны поимённо
      const t = x.transaction.transact({
        grants: [
          { t: 'currency', id: 'gold', qty: gold },
          { t: 'item', defId: layerDef.trophy, qty: 1 },
        ],
        eventId: 'mine.lootRun',
        reason: `босс забега: ${boss.name} (слой ${layerDef.layer}) — трофей-гейт в обход вместимости`,
      });
      lines.push(
        `${gold}з → кошелёк${bonusPct > 0 ? ` (бонус помощников +${bonusPct}%)` : ''}${t.ok ? '' : ' (отказ транзакции!)'}`,
      );
      lines.push(`${layerDef.ore.defId} ×${ro.qty} + ${aPlus} (тир A) → runBag (лут: утраты по вместимости честны поимённо, D23)`);
      lines.push(`трофей ${layerDef.trophy} — гейт-предмет: выдан в обход вместимости (ачивка ach_mine_boss_${layerDef.layer} — по факту победы; M12 §4)`);
      const wear = wearPickaxe();
      if (wear !== null) lines.push(wear);
    }
  }
  x.setState({ ...x.getState(), stats });
  x.markDirty();
  if (died || !won) {
    return ok({
      header: `Босс: ${boss.name} (слой ${layerDef.layer})`,
      lines: [...lines, died ? 'бой не выигран — забег завершён смертью (подписка M13.1)' : `бой не завершён победой (исход движка: ${outcome.result}) — забег продолжается`],
    });
  }
  // cardResolved публикует вызывающий (pick), здесь — только конец 'boss'
  const end = endRun(x, 'boss');
  if (!end.ok) return err(end.error);
  lines.push('ПОБЕДА над боссом — конец забега (причина boss)');
  lines.push(`выдача 100%: ${end.value.granted.map((g) => `${g.defId} ×${g.qty}${g.tier !== undefined ? ` (${g.tier})` : ''}`).join(' + ') || 'рюкзак пуст'}`);
  if (end.value.lostByCapacity.length > 0) {
    lines.push(`НЕ влезло (поимённо): ${end.value.lostByCapacity.map((l) => `${l.defId} ×${l.qty}`).join(', ')} — слоты основного рюкзака`);
  }
  if (end.value.helperLines.length > 0) {
    lines.push('— помощники (расчёт по забегу):', ...end.value.helperLines.map((l) => `  ${l}`));
  }
  return ok({ header: `Босс: ${boss.name} (слой ${layerDef.layer})`, lines });
}
