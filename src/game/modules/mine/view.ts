/**
 * Витрины M12 (бриф F6/F8 + M12.2 G4/G7): построчный лог раундов + итог
 * (win/loss, HP-остатки, расклад), витрина дефа моба, витрина статов среза,
 * витрина входа (гейты/расход энергии), босс-бой с фазами в логе честности.
 * Форматирование — ЗДЕСЬ, модуль возвращает данные.
 */
import type { AttackDir, EliteModDef, MineMobDef } from '@/content/mine/mobs';
import type { MineLayerDef } from '@/content/mine/layers';
import type { MineTable } from '@/content/mine/table';
import type { FightOutcome } from './logic/fight';
import { mobHpOf } from './logic/enemies';
import type { PickaxeView } from './module';
import type { MineState } from './state';

const DIR_RU: Record<AttackDir, string> = { top: 'верх', mid: 'центр', bottom: 'низ' };

export interface FightMeta {
  mobName: string;
  layer: number;
  elite: string | null;
  eliteName: string | null;
  playerStart: {
    hp: number;
    maxHp: number;
    atk: number;
    def: number;
    speed: number;
    hasShield: boolean;
    blockSensePct: number;
    fatedPct: number;
  };
  enemies: Array<{ name: string; maxHp: number }>;
}

/** расклад моба (G5): золото + руда слоя (+ шанс-предмет + износ кирки) */
export interface FightLoot {
  gold: number;
  ore: { defId: string; qty: number };
  item?: { defId: string; qty: number };
  wear?: string;
}

/** расклад босса (G2): золото + руда + трофей + A+-предмет (+ износ) */
export interface BossLoot {
  gold: number;
  ore: { defId: string; qty: number };
  trophy: string;
  aPlus: { defId: string; tier: string; granted: boolean };
  wear?: string;
}

export interface FightView {
  header: string;
  rounds: string[];
  outcome: string;
  hp: { player: number; start: number; max: number };
  loot: { gold: number; ore?: { defId: string; qty: number }; item?: { defId: string; qty: number }; wear?: string } | null;
}

export interface BossFightView {
  header: string;
  rounds: string[];
  outcome: string;
  hp: { player: number; start: number; max: number };
  loot: BossLoot | null;
}

/** витрина входа (G4/G7): гейты + расход энергии + руда слоя */
export interface EnterView {
  header: string;
  lines: string[];
}

/** построчный лог раундов — общая сборка (мобы и боссы; фазы M12.2 — в логе) */
function roundLines(meta: FightMeta, outcome: FightOutcome): string[] {
  const maxHpByName = new Map(meta.enemies.map((e) => [e.name, e.maxHp]));
  return outcome.rounds.map((r) => {
    const idx = outcome.enemies.findIndex((o) => o.key === r.enemyKey);
    const enemyName = meta.enemies[idx >= 0 ? idx : 0]?.name ?? meta.mobName;
    if (r.attacker === 'player') {
      const hpPart = r.evaded === true ? 'УКЛОНЕНИЕ — мимо' : `−${r.damage}${r.crit ? ' КРИТ ×1.5' : ''} (HP ${r.enemyHp}/${maxHpByName.get(enemyName) ?? '?'})`;
      const summonPart = r.summon !== undefined ? ` · ВЫЗОВ: ${r.summon.mobId} (${r.summon.elite}) вступает в бой!` : '';
      return `Р${r.round} · игрок бьёт ${DIR_RU[r.attackDir]} → ${enemyName}: ${hpPart}${summonPart}`;
    }
    const buff = r.selfBuff !== undefined ? `бафает себя (+atk → ${r.selfBuff}) и ` : '';
    const fated = r.fated === true ? ' — ВЕЩИЙ (направление увидено)' : '';
    const freezePart =
      r.freeze !== undefined ? ` · ЗАМОРОЗКА: блок ${DIR_RU[r.freeze.dir]} скован (${r.freeze.left} → 2 → 1 ход)` : '';
    const frozenPart = r.frozen !== undefined ? ` [заморожено: ${DIR_RU[r.frozen.dir]}, осталось ${r.frozen.left} ход]` : '';
    const skipped = r.skipped === true ? 'ПРОПУСКАЕТ УДАР (копит силу — следующий ×2)' : '';
    const doublePart = r.double === true ? 'УДАР ×2! ' : '';
    if (r.skipped === true) {
      return `Р${r.round} · ${enemyName} ${skipped}${frozenPart}`;
    }
    let def: string;
    if (r.blockDir === null) {
      def = 'без щита';
    } else if (r.blocked) {
      def = `блок ${DIR_RU[r.blockDir]}${r.sense === true ? ' (чутьё щита!)' : r.fated === true ? ' (вещий блок)' : ''} — ОТБИТО`;
    } else {
      def = `блок ${DIR_RU[r.blockDir]} — мимо`;
    }
    if (r.fated === true && r.blockDir !== null && !r.blocked) {
      def = `вещий, но ${DIR_RU[r.blockDir]} заморожено — блок невозможен`;
    }
    const dmgPart = r.blocked ? '' : ` −${r.damage}`;
    const dotPart = r.dot !== undefined ? ` · яд −${r.dot}` : '';
    const hpPart = ` (HP ${r.playerHp}/${meta.playerStart.maxHp})`;
    return `Р${r.round} · ${enemyName} ${buff}${doublePart}бьёт ${DIR_RU[r.attackDir]}${fated} → ${def}${dmgPart}${dotPart}${freezePart}${frozenPart}${hpPart}`;
  });
}

/** итог моб-боя (G5: расклад с рудой/предметом) */
function mobOutcomeLine(meta: FightMeta, outcome: FightOutcome, loot: FightView['loot']): string {
  const n = outcome.rounds.length;
  if (outcome.result === 'win') {
    const parts: string[] = [];
    if (loot !== null) {
      parts.push(`${loot.gold}з`);
      if (loot.ore !== undefined) parts.push(`${loot.ore.defId} ×${loot.ore.qty}`);
      if (loot.item !== undefined) parts.push(`${loot.item.defId} ×${loot.item.qty}`);
      if (loot.wear !== undefined) parts.push(loot.wear);
    }
    const lootPart = parts.length > 0 ? ` · добыча: ${parts.join(' + ')} (транзакция mine.loot, событие mine.enemyKilled)` : '';
    return `ПОБЕДА за ${n} раундов · HP игрока ${outcome.playerHp}/${meta.playerStart.maxHp}${lootPart}`;
  }
  if (outcome.result === 'loss') {
    return `ПРОИГРАН за ${n} раундов — игрок пал в бою · событие player.hpChanged(death) опубликовано · cozy-правило: HP := 1 («больше никаких штрафов», карточка §5)`;
  }
  return `БОЙ ПРЕРВАН — лимит раундов (${n}) без победителя`;
}

function headerOf(meta: FightMeta, boss: boolean): string {
  const shield = meta.playerStart.hasShield
    ? `щит есть (чутьё ${meta.playerStart.blockSensePct}%)`
    : 'щита нет — блок невозможен';
  const who = boss
    ? `Босс: ${meta.mobName} (слой ${meta.layer})`
    : `Бой: ${meta.mobName} (слой ${meta.layer})${meta.eliteName !== null ? ` · элита: ${meta.eliteName}` : ''}`;
  return `${who} · врагов ${meta.enemies.length} (HP ${meta.enemies.map((e) => e.maxHp).join('/')}), игрок: HP ${meta.playerStart.hp}/${meta.playerStart.maxHp} · атака ${meta.playerStart.atk} · защита ${meta.playerStart.def} · скорость ${meta.playerStart.speed} · ${shield}${meta.playerStart.fatedPct > 0 ? ` · вещий удар ${meta.playerStart.fatedPct}%` : ''}`;
}

/** построчный лог раундов + итог — «лог честности» (карточка §6) */
export function buildFightView(meta: FightMeta, outcome: FightOutcome, loot: FightView['loot']): FightView {
  return {
    header: headerOf(meta, false),
    rounds: roundLines(meta, outcome),
    outcome: mobOutcomeLine(meta, outcome, loot),
    hp: { player: outcome.playerHp, start: meta.playerStart.hp, max: meta.playerStart.maxHp },
    loot,
  };
}

/** босс-бой (G1/G2): фазы в логе, расклад bossKilled + mine.bossLoot */
export function buildBossFightView(
  meta: Omit<FightMeta, 'elite' | 'eliteName'>,
  outcome: FightOutcome,
  loot: BossLoot | null,
): BossFightView {
  const n = outcome.rounds.length;
  let outcomeLine: string;
  if (outcome.result === 'win') {
    const parts: string[] = [];
    if (loot !== null) {
      parts.push(`${loot.gold}з`);
      if (loot.ore.qty > 0) parts.push(`${loot.ore.defId} ×${loot.ore.qty}`);
      parts.push(`трофей: ${loot.trophy}`);
      parts.push(`${loot.aPlus.defId} (тир ${loot.aPlus.tier}${loot.aPlus.granted ? '' : ' — НЕ выдан: инвентарь полон'})`);
      if (loot.wear !== undefined) parts.push(loot.wear);
    }
    const lootPart = parts.length > 0 ? ` · добыча: ${parts.join(' + ')}` : '';
    outcomeLine =
      `ПОБЕДА над боссом за ${n} раундов · HP игрока ${outcome.playerHp}/${meta.playerStart.maxHp}${lootPart} · событие mine.bossKilled + 100 XP (канал M01) · транзакция mine.bossLoot (золото+руда+трофей) + A+-предмет тиром A`;
  } else if (outcome.result === 'loss') {
    outcomeLine =
      `ПРОИГРАН за ${n} раундов — игрок пал в бою · cozy-правило: HP := 1 · ачивка слоя НЕ открыта (только победа, G11) · счётчик смертей +1`;
  } else {
    outcomeLine = `БОЙ ПРЕРВАН — лимит раундов (${n}) без победителя`;
  }
  return {
    header: headerOf({ ...meta, elite: null, eliteName: null }, true),
    rounds: roundLines({ ...meta, elite: null, eliteName: null }, outcome),
    outcome: outcomeLine,
    hp: { player: outcome.playerHp, start: meta.playerStart.hp, max: meta.playerStart.maxHp },
    loot,
  };
}

/** витрина входа (G4/G7) */
export function buildEnterView(
  def: MineLayerDef,
  pick: PickaxeView,
  spent: { cost: number; current: number; max: number },
  totalLayers: number,
): EnterView {
  const gate = def.unlock !== undefined ? `ачивка слоя ${def.layer - 1} ✓` : 'первый слой — ачивка не нужна';
  return {
    header: `Спуск в шахту: слой ${def.layer} из ${totalLayers}`,
    lines: [
      `кирка: ${pick.name ?? pick.defId ?? '?'} · качество ${pick.quality ?? '?'} + заточка ${pick.forgeLevel}/10 → тир ${pick.tier} (гейт «${def.pickGate.label}», нужно ${def.pickGate.minTier}+)`,
      `гейт прогрессии: ${gate}`,
      `энергия: −${spent.cost} (осталось ${spent.current}/${spent.max}) — тратится ОДИН раз при входе, бой без энергии на раунды`,
      `руда слоя: ${def.ore.defId} ×${def.ore.qty[0]}–${def.ore.qty[1]} за победу · босс слоя: ${def.bossId}`,
      `трофей слоя: ${def.trophy} (ачивка ach_mine_boss_${def.layer} = трофей в рюкзаке, auto-claim M15)`,
    ],
  };
}

/** витрина дефа моба (F8: mine mob <id>) */
export interface MobView {
  id: string;
  name: string;
  hpBase: number;
  atk: number;
  def: number;
  speed: number;
  evade: number;
  selfBuff: string | null;
  miniBoss: boolean;
  pattern: string;
  tags: string[];
  gold: string;
  eliteMods: string[];
  hpByLayer: string[];
}

export function buildMobView(mob: MineMobDef, eliteDefs: EliteModDef[], table: MineTable): MobView {
  const eliteName = (tag: string): string => eliteDefs.find((e) => e.id === tag)?.name ?? tag;
  return {
    id: mob.id,
    name: mob.name,
    hpBase: mob.hpBase,
    atk: mob.atk,
    def: mob.def,
    speed: mob.speed,
    evade: mob.evade ?? 0,
    selfBuff:
      mob.selfBuff !== undefined
        ? `+${mob.selfBuff.perRound} атака за свой ход (кап +${mob.selfBuff.capBonus}), одиночный бой`
        : null,
    miniBoss: mob.miniBoss === true,
    pattern: `${mob.attackDirs.map((p) => p.map((d) => DIR_RU[d]).join('|')).join(' → ')} (цикл; 50/50 в паре)`,
    tags: [...mob.tags],
    gold: `${mob.gold[0]}..${mob.gold[1]}з`,
    eliteMods: (mob.eliteMods ?? []).map(eliteName),
    hpByLayer: [1, 2, 3].map((l) => `${l} → ${mobHpOf(mob.hpBase, l, table)}`),
  };
}

/** витрина статов среза (F8: mine state) */
export interface MineStateView {
  fights: number;
  kills: number;
  bossKills: number;
  deaths: number;
}

export function buildStateView(state: MineState): MineStateView {
  return { ...state.stats };
}
