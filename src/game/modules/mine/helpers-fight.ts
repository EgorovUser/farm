/**
 * Помощники в боях забега M13.2 (брифы R3/R4/R8, карточка §4): ДОПОЛНИТЕЛЬНЫЕ
 * участники ОБЁРТКИ fight-run.ts — движок M12 resolveFight НЕ тронут (паттерн
 * M12.1 F3/M13.1). Инициатива по speed (канон Task 70: «первым бьёт более
 * быстрая сторона»; равенство → наша сторона — зеркало [DECISION F4]),
 * удар по общей формуле M12 §3 (atk/def/floor) c эффективностью
 * (mine.helper.efficiency — «Мерзляк» more −50 через conditions-канал).
 *
 * СТРАХИ — УНИВЕРСАЛЬНЫЙ eval Condition (03 §2): «Боится пауков» =
 * ctxTag enemy:spider → не участвует (стоит в стороне); ветвлений по id
 * страха в коде НЕТ — только типы эффектов данными (standAside/efficiency/
 * leaveRun/profile). Классовая логика — диспетчер по special.t ДАННЫХ
 * (cover/heal/loot/reveal/none; прецедент карт M13.1 R3): новый класс с
 * существующим special.t = ноль кода.
 *
 * Энергоконтракт R8 (прецедент withWorkerEnergy M11.2 / pen.autofeeder
 * M06.2): действия помощников БЕЗ player.energy — волей не вызывает
 * spendEnergy (инвариант — self-чек R9; строк в витрине НЕТ — не шум).
 *
 * ЧИСТОЕ ЯДРО (golden-чеки R9 без роллов): helperVolley/applyCover —
 * детерминированные функции данных; обёртка применяет HP/события после.
 */
import type { StatBus } from '@/kernel/bus/stat-bus/stat-bus';
import type { MineTable } from '@/content/mine/table';
import type { MineMobDef } from '@/content/mine/mobs';
import type {
  HelperClassDef,
  HelperFearDef,
  HelperProfile,
  MineHelpersTable,
} from '@/content/mine/helpers';
import { helperTag } from '@/content/mine/helpers';
import type { ConditionCtx } from '@/shared/types/requirement';
import { checkCondition } from '@/shared/utils/condition-check';
import type { EnemyCombat } from './logic/fight';
import { baseDamage } from './logic/basics';
import type { HelperInstanceState, MineRunState } from './state';
import type { RunCtx } from './run';

/** эффективный боец-помощник (шина: трейты/страхи — per-instance conditions) */
export interface HelperCombat {
  instanceId: string;
  defId: string;
  name: string;
  classId: HelperClassDef['classId'];
  special: HelperClassDef['special'];
  atk: number;
  speed: number;
  efficiency: number;
  hp: number;
  maxHp: number;
  fears: HelperFearDef[];
}

export interface VolleyOutcome {
  lines: string[];
  /** вклад волей-раунда: instanceId → Σ урона (эффективного, как нанесён) */
  contrib: Record<string, number>;
  /** лечение игрока медиком — обёртка применяет каналом M01 */
  playerHeal: number;
  /** лечение помощников медиком — обёртка применяет к срезу */
  helperHeals: Array<{ instanceId: string; name: string; amount: number }>;
  /** обновлённые счётчики ходов (медик: раз в everyTurns) */
  turns: Record<string, number>;
}

/** ctx оценщика страхов: теги боя (enemy:…/status:…/layer:…/mine/helper:id) */
export function fearCtxOf(x: RunCtx, tags: string[]): ConditionCtx {
  const extra = x.deps.gateExtras();
  return {
    tags,
    stat: (stat) => x.statBus.resolve({ stat, ctx: { ...x.time.ctx('player'), tags } }),
    hasFlag: (flag) => Boolean(extra[`flag:${flag}`]),
    skillLevel: (skill) => Number(extra[`skill:${skill}`] ?? 0),
    playerLevel: Number(extra['player:level'] ?? 0),
    itemCount: (defId) => x.deps.itemCount(defId),
    hasAchievement: (id) => Boolean(extra[`achievement:${id}`]),
  };
}

/** теги ctx одного помощника: боевые + per-instance (канал R10) */
function helperCtxTags(battleTags: string[], instanceId: string): string[] {
  return [...battleTags, helperTag(instanceId)];
}

/** инициатива: max скорость нашей стороны (игрок+helpers) vs врагов;
 *  равенство → наша (зеркало [DECISION F4] движка M12) */
export function oursFaster(ourSpeeds: number[], enemySpeeds: number[]): boolean {
  const ours = ourSpeeds.length > 0 ? Math.max(...ourSpeeds) : 0;
  const theirs = enemySpeeds.length > 0 ? Math.max(...enemySpeeds) : 0;
  return ours >= theirs;
}

/** урон волей: общая формула M12 §3 × эффективность (данные) */
export function volleyDamage(atk: number, def: number, efficiency: number, table: MineTable): number {
  const base = baseDamage(Math.max(0, atk), def, table);
  return Math.max(table.damage.min, Math.floor((base * Math.max(0, efficiency)) / 100));
}

/** цель удара по данным класса: 'loot' → слабейший живой; иначе первый живой */
export function volleyTarget(special: HelperClassDef['special'], enemies: EnemyCombat[]): EnemyCombat | undefined {
  const alive = enemies.filter((e) => e.hp > 0);
  if (alive.length === 0) return undefined;
  if (special.t === 'loot') {
    return alive.reduce((min, e) => (e.hp < min.hp ? e : min), alive[0]!);
  }
  return alive[0];
}

/** самый раненый участник (медик): min hp/maxHp среди игрока и помощников */
export function woundedTargetOf(
  participants: Array<{ key: string; name: string; hp: number; maxHp: number }>,
): { key: string; name: string } | null {
  let best: { key: string; name: string; ratio: number } | null = null;
  for (const p of participants) {
    if (p.maxHp < 1) continue;
    const ratio = p.hp / p.maxHp;
    if (best === null || ratio < best.ratio) best = { key: p.key, name: p.name, ratio };
  }
  return best === null ? null : { key: best.key, name: best.name };
}

/**
 * ЧИСТЫЙ волей-раунд: каждый активный помощник действует ОДИН раз (по speed
 * убыв.); медик на каждом everyTurns-м ходу ЛЕЧИТ вместо удара (счётчик
 * ходов живёт в забеге — run.turns, R4 «раз в 4 хода»). Мутирует hp врагов
 * (переданы копии обёрткой); лечение ТОЛЬКО записывается в исход.
 */
export function helperVolley(input: {
  helpers: HelperCombat[];
  participants: Array<{ key: string; name: string; hp: number; maxHp: number }>;
  enemies: EnemyCombat[];
  table: MineTable;
  turns: Record<string, number>;
}): VolleyOutcome {
  const out: VolleyOutcome = { lines: [], contrib: {}, playerHeal: 0, helperHeals: [], turns: { ...input.turns } };
  const order = [...input.helpers].sort((a, b) => b.speed - a.speed);
  for (const h of order) {
    if (input.enemies.every((e) => e.hp <= 0)) break;
    const turn = (out.turns[h.instanceId] ?? 0) + 1;
    out.turns[h.instanceId] = turn;
    // медик: каждые everyTurns ходов — лечение вместо удара (счётчик R4)
    if (h.special.t === 'heal' && turn % h.special.everyTurns === 0) {
      const target = woundedTargetOf(input.participants);
      if (target !== null) {
        const amount = h.special.heal;
        if (target.key === 'player') {
          out.playerHeal += amount;
          out.lines.push(`${h.name} (медик) лечит игрока: +${amount} HP (ход ${turn}, раз в ${h.special.everyTurns})`);
        } else {
          out.helperHeals.push({ instanceId: target.key, name: target.name, amount });
          out.lines.push(`${h.name} (медик) лечит ${target.name}: +${amount} HP (ход ${turn}, раз в ${h.special.everyTurns})`);
        }
        continue;
      }
    }
    const target = volleyTarget(h.special, input.enemies);
    if (target === undefined) continue;
    const dmg = volleyDamage(h.atk, target.def, h.efficiency, input.table);
    target.hp = Math.max(0, target.hp - dmg);
    out.contrib[h.instanceId] = (out.contrib[h.instanceId] ?? 0) + dmg;
    out.lines.push(
      `${h.name} (${h.classId}${h.efficiency !== 100 ? `, эффективность ${h.efficiency}%` : ''}) бьёт ${target.name}: −${dmg}${h.special.t === 'loot' ? ' (слабейший)' : ''}`,
    );
  }
  return out;
}

/** ЧИСТЫЙ редирект щитоносца (R4): переносит долю урона по игроку на себя,
 *  последовательно по остатку; каждый ограничен СВОИМ текущим HP (в ноль —
 *  выключается, не умирает: cozy, причины ухода — fired/unpaid/fear) */
export function applyCover(input: {
  taken: number;
  covers: Array<{ instanceId: string; name: string; redirectPercent: number; hp: number; speed: number }>;
}): { playerTaken: number; redirects: Array<{ instanceId: string; name: string; amount: number; hpLeft: number }> } {
  const covers = [...input.covers].sort((a, b) => b.speed - a.speed);
  let rest = input.taken;
  const redirects: Array<{ instanceId: string; name: string; amount: number; hpLeft: number }> = [];
  for (const c of covers) {
    if (rest <= 0) break;
    const want = Math.floor((rest * c.redirectPercent) / 100);
    const amount = Math.min(want, Math.max(0, c.hp));
    if (amount <= 0) continue;
    rest -= amount;
    redirects.push({ instanceId: c.instanceId, name: c.name, amount, hpLeft: Math.max(0, c.hp - amount) });
  }
  return { playerTaken: Math.max(0, rest), redirects };
}

/** сбор активных бойцов забега: страх standAside фильтрует УНИВЕРСАЛЬНЫМ
 *  оценщиком (ctx боя + тег экземпляра); трейты/эффективность — шина */
export function gatherHelpers(
  x: RunCtx,
  run: MineRunState,
  battleTags: string[],
): { active: HelperCombat[]; aside: HelperCombat[]; missing: string[] } {
  const state = x.getState();
  const active: HelperCombat[] = [];
  const aside: HelperCombat[] = [];
  const missing: string[] = [];
  for (const entry of run.helpers) {
    const inst = (state.helpers ?? []).find((h) => h.instanceId === entry.instanceId);
    const profile = inst !== undefined ? x.profileOf(inst.defId) : null;
    const cls = profile !== null ? x.helperClasses.find((c) => c.classId === profile.classId) : undefined;
    if (inst === undefined || profile === null || cls === undefined) {
      missing.push(entry.instanceId);
      continue;
    }
    const tags = helperCtxTags(battleTags, inst.instanceId);
    const ctx = fearCtxOf(x, tags);
    const combat: HelperCombat = {
      instanceId: inst.instanceId,
      defId: inst.defId,
      name: profile.name,
      classId: profile.classId,
      special: cls.special,
      atk: Math.max(0, profile.atk + x.statBus.resolve({ stat: 'mine.helper.atk', ctx: { ...x.time.ctx('player'), tags } })),
      speed: Math.max(0, profile.speed + x.statBus.resolve({ stat: 'mine.helper.speed', ctx: { ...x.time.ctx('player'), tags } })),
      efficiency: x.statBus.resolve({ stat: 'mine.helper.efficiency', ctx: { ...x.time.ctx('player'), tags } }),
      hp: inst.hp,
      maxHp: Math.max(1, profile.hp + x.statBus.resolve({ stat: 'mine.helper.hp', ctx: { ...x.time.ctx('player'), tags } })),
      fears: profile.fears,
    };
    // страх standAside: условие истинно в ЭТОМ бою → стоит в стороне (R3)
    const standsAside = combat.fears.some((f) => f.effect.t === 'standAside' && checkCondition(f.condition, ctx));
    if (standsAside) aside.push(combat);
    else active.push(combat);
  }
  return { active, aside, missing };
}

/** перк 50+ медика (R6): репутация ≥ perkRepAtLeast, класс с perk50, флаг
 *  per-run НЕ ставился — идемпотентный 'revive:used' в run.helpers[].status */
export function reviveMedicOf(
  x: RunCtx,
  run: MineRunState,
): { instance: HelperInstanceState; profile: HelperProfile; classDef: HelperClassDef } | null {
  const state = x.getState();
  const table = x.helpersTable;
  for (const entry of run.helpers) {
    if (entry.status.includes('revive:used')) continue;
    const inst = (state.helpers ?? []).find((h) => h.instanceId === entry.instanceId);
    if (inst === undefined || inst.reputation < table.perkRepAtLeast) continue;
    const profile = x.profileOf(inst.defId);
    const cls = profile !== null ? x.helperClasses.find((c) => c.classId === profile.classId) : undefined;
    if (profile === null || cls === undefined || cls.perk50 === undefined) continue;
    if (cls.perk50.t !== 'revive') continue;
    return { instance: inst, profile, classDef: cls };
  }
  return null;
}

/** теги боя забега: mine/layer/status + теги моба (enemy:*, data mobs.ts) */
export function battleTagsOf(run: MineRunState, mob: MineMobDef | { tags: string[] }): string[] {
  return ['mine', `layer:${run.layer}`, ...(run.status !== null ? [`status:${run.status}`] : []), ...mob.tags];
}

export type { HelperInstanceState };
