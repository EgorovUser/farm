/**
 * Распил fight-run.ts/pick.ts по wc-гигиене M13.2 (прецедент FIX-M12):
 * интеграционный клей помощников в карты забега — применение исхода волей-
 * раунда (вклад/счётчики/лечение каналами), синхронизация HP движка, бонус
 * золота с мобов (лутер/«Жадный»), страх-уход клаустрофоба (ролл стримом
 * при разрешении карт колонок 3–4) и вскрытие скрытых карт разведчиком при
 * входе в колонку (факелы НЕ тратит; R3/R4).
 */
import { helperTag } from '@/content/mine/helpers';
import type { EnemyCombat, FightOutcome } from './logic/fight';
import { checkCondition } from '@/shared/utils/condition-check';
import { CARDS_PER_COLUMN } from './generator';
import { cardTitle } from './torch';
import { battleTagsOf, fearCtxOf, helperVolley, type HelperCombat } from './helpers-fight';
import type { MineRunState } from './state';
import type { RunCtx } from './run';

/** применить исход волей-раунда: вклад/счётчики — в забег, лечение — каналы
 *  (игрок — M01 healHp; помощник — срез hp с клэмпом max) */
export function applyVolley(
  x: RunCtx,
  run: MineRunState,
  active: HelperCombat[],
  player: { hp: number; maxHp: number },
  out: ReturnType<typeof helperVolley>,
): void {
  run.turns = { ...run.turns, ...out.turns };
  for (const [id, dmg] of Object.entries(out.contrib)) {
    run.contrib[id] = (run.contrib[id] ?? 0) + dmg;
  }
  if (out.playerHeal > 0) {
    x.deps.healHp(out.playerHeal, `mine.helper:medic:${run.runId}`);
    player.hp = x.deps.playerHp().current;
    run.hp = player.hp;
  }
  const helpers = x.getState().helpers ?? [];
  for (const hh of out.helperHeals) {
    const inst = helpers.find((h) => h.instanceId === hh.instanceId);
    const combat = active.find((a) => a.instanceId === hh.instanceId);
    if (inst !== undefined) {
      inst.hp = Math.min(combat?.maxHp ?? inst.hp, inst.hp + hh.amount);
    }
  }
}

/** синхронизация финального HP движка обратно в массив обёртки (волей-пост) */
export function syncEngineHp(enemies: EnemyCombat[], outcome: FightOutcome): void {
  const finalHp = new Map(outcome.enemies.map((e) => [e.key, e.hp] as const));
  for (const e of enemies) {
    const hp = finalHp.get(e.key);
    if (hp !== undefined) e.hp = hp;
  }
}

/** бонус золота с мобов/боссов: лутер + «Жадный» (шина mine.helper.gold,
 *  теги АКТИВНЫХ (не в стороне, HP > 0) помощников боя) */
export function mobGoldBonusPct(
  x: RunCtx,
  run: MineRunState,
  battleTags: string[],
  active: HelperCombat[],
): number {
  const fighting = active.filter((h) => h.hp > 0);
  if (fighting.length === 0) return 0;
  const tags = [...battleTags, ...fighting.map((h) => helperTag(h.instanceId) as string)];
  return Math.max(0, x.statBus.resolve({ stat: 'mine.helper.gold', ctx: { ...x.time.ctx('player'), tags } }));
}

/** [M13.2 · R3] страх-уход: «Клаустрофоб» — при разрешении карт колонок 3–4
 *  ролл стримом (шанс данными); уход = helper.quit {reason:'fear'} + помощник
 *  покидает забег И отряд, забег продолжается. Универсальный eval условия —
 *  ветвлений по id страха НЕТ. */
export function fearLeaveRolls(x: RunCtx, run: MineRunState, resolvedColumn: number): string[] {
  const lines: string[] = [];
  const tags = ['mine', `layer:${run.layer}`, ...(run.status !== null ? [`status:${run.status}`] : [])];
  const ctx = fearCtxOf(x, tags);
  const state = x.getState();
  const helpers = state.helpers ?? [];
  const quitters: Array<{ instanceId: string; name: string; fearName: string }> = [];
  for (const entry of [...run.helpers]) {
    const inst = helpers.find((h) => h.instanceId === entry.instanceId);
    const profile = inst !== undefined ? x.profileOf(inst.defId) : null;
    if (inst === undefined || profile === null) continue;
    const fear = profile.fears.find(
      (f) =>
        f.effect.t === 'leaveRun' &&
        f.effect.columns.includes(resolvedColumn) &&
        checkCondition(f.condition, {
          ...ctx,
          tags: [...tags, helperTag(inst.instanceId) as string],
        }),
    );
    if (fear === undefined) continue;
    const eff = fear.effect as { t: 'leaveRun'; chancePercent: number; columns: number[] };
    const u = x.rngBus.rollRange(
      0,
      1,
      'uniform',
      `mine:helper:fear:${inst.instanceId}:r${run.cardsResolved}`,
      { ...x.time.ctx('player') },
    );
    if (u * 100 >= eff.chancePercent) continue;
    quitters.push({ instanceId: inst.instanceId, name: profile.name, fearName: fear.name });
  }
  if (quitters.length > 0) {
    // уход: из забега И из отряда (контракт расторгнут страхом — R2/R3);
    // состояние перечитывается ПОСЛЕ сбора всех уходов (нет стейл-перезаписи)
    const quitIds = new Set(quitters.map((q) => q.instanceId));
    const cur = x.getState();
    const curRun = cur.run;
    if (curRun !== undefined) {
      x.setState({
        ...cur,
        helpers: (cur.helpers ?? []).filter((h) => !quitIds.has(h.instanceId)),
        run: { ...curRun, helpers: curRun.helpers.filter((h) => !quitIds.has(h.instanceId)) },
      });
      x.markDirty();
      for (const q of quitters) {
        x.bus.publish('helper.quit', { instanceId: q.instanceId, reason: 'fear', name: q.name });
        lines.push(
          `${q.name} не выдерживает глубины — страх «${q.fearName}»: уходит из забега И из отряда (helper.quit reason 'fear'; забег продолжается)`,
        );
      }
    }
  }
  return lines;
}

/** [M13.2 · R4] разведчик: при входе в колонку вскрыть 1 скрытую карту
 *  (шанс данными, ролл стримом; факелы НЕ тратит) */
export function scoutReveal(x: RunCtx, run: MineRunState): string[] {
  const lines: string[] = [];
  const state = x.getState();
  const helpers = state.helpers ?? [];
  const column = run.column;
  for (const entry of run.helpers) {
    const inst = helpers.find((h) => h.instanceId === entry.instanceId);
    const profile = inst !== undefined ? x.profileOf(inst.defId) : null;
    const cls = profile !== null ? x.helperClasses.find((c) => c.classId === profile.classId) : undefined;
    if (inst === undefined || profile === null || cls === undefined) continue;
    if (cls.special.t !== 'reveal') continue;
    const eff = cls.special as { t: 'reveal'; chancePercent: number };
    const u = x.rngBus.rollRange(
      0,
      1,
      'uniform',
      `mine:helper:scout:${inst.instanceId}:c${column}`,
      { ...x.time.ctx('player') },
    );
    if (u * 100 >= eff.chancePercent) continue;
    // первая скрытая карта новой колонки (не уничтоженная, не вскрытая)
    const from = (Math.min(column, 5) - 1) * CARDS_PER_COLUMN;
    const to = column >= 5 ? run.cards.length : from + CARDS_PER_COLUMN;
    const target = run.cards
      .slice(from, to)
      .find((c) => c.hidden && c.revealed !== true && c.destroyed !== true && c.resolved !== true);
    if (target === undefined) continue;
    target.revealed = true;
    lines.push(
      `${profile.name} (разведчик) вскрывает скрытую карту колонки ${column}: «${cardTitle(target)}» (шанс ${eff.chancePercent}%, факелы целы)`,
    );
  }
  if (lines.length > 0) x.markDirty();
  return lines;
}

/** теги боя для gatherHelpers (переэкспорт для fight-run) */
export { battleTagsOf } from './helpers-fight';
