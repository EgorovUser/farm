/**
 * Расчёт помощников при завершении забега M13.2 (брифы R5/R6, карточка §4):
 *  - ДОЛЯ: только с золота мобов/боссов забега (run.mobGold; предметы/руда
 *    runBag НЕ делятся): доля i = shareOfLoot% × вклад_i / Σ вкладов (игрок +
 *    helpers); нулевой Σ — поровну между активными helpers; списание ОТДЕЛЬНОЙ
 *    транзакцией eventId mine.helper.share с поимённой витриной «доля <имя> Nз»;
 *    «Жадный» +10% к своей доле, уровень −2%/ур (аддитивные пункты, данные).
 *  - ЗАРПЛАТА/день списывается при ЗАВЕРШЕНИИ забега (забег = 1 день; eventId
 *    mine.helper.salary; аванса НЕТ); уровень −5%/ур; нехватка золота →
 *    helper.quit {reason:'unpaid'} + репутация НЕ растёт.
 *  - РЕПУТАЦИЯ: +[3..5] за успешный забег (ролл стримом), +10 за босса;
 *    пересечение порога уровня (10 × (уровень − 1)) → helper.levelReputation
 *    {instanceId, level, reputation}.
 *  - HP участников восстанавливается между забегами до max (данные; R2).
 *
 * [DECISION R5-порядок] доля списывается РАНЬШЕ зарплаты (золото боёв уже в
 * кошельке; остаток доступен зарплатам); провал транзакции доли — честная
 * строка «НЕ уплачена», НЕ уход (уход — только нехватка на ЗАРПЛАТУ).
 * [DECISION R5-смерть] забег смертью: зарплата списывается (день отработан),
 * репутация НЕ растёт (неуспешный забег), доля — по фактическому вкладу.
 */
import type { HelperProfile } from '@/content/mine/helpers';
import { helperTag } from '@/content/mine/helpers';
import type { HelperInstanceState, MineRunState } from './state';
import type { RunCtx } from './run';
import { helperLevelOf } from './helpers-hire';

export interface HelperSettleRow {
  instanceId: string;
  name: string;
  share: number;
  sharePaid: boolean;
  salary: number;
  salaryPaid: boolean;
  repDelta: number;
  reputation: number;
  level: number;
  levelUp: boolean;
}

export interface HelperSettlement {
  /** следующий срез helpers (репутация/HP/увольнения); undefined = не менять */
  helpers: HelperInstanceState[] | undefined;
  lines: string[];
  rows: HelperSettleRow[];
}

/** модификаторы доли профиля: «Жадный» +N% (данные страха, аддитивно) */
function greedSharePctOf(profile: HelperProfile): number {
  return profile.fears
    .filter((f) => f.effect.t === 'profile')
    .reduce((s, f) => s + (f.effect as { sharePct: number }).sharePct, 0);
}

/**
 * Полный расчёт участников забега: доли → зарплаты → репутация → HP.
 * Публикует helper.quit (unpaid) и helper.levelReputation по ходу; транзакции
 * — TransactionService (списания с кошелька игрока).
 */
export function settleHelpers(x: RunCtx, run: MineRunState, reason: 'exit' | 'boss' | 'death'): HelperSettlement {
  const table = x.helpersTable;
  const state = x.getState();
  const helpers = state.helpers ?? [];
  const lines: string[] = [];
  const rows: HelperSettleRow[] = [];
  const participants = run.helpers
    .map((entry) => ({
      entry,
      inst: helpers.find((h) => h.instanceId === entry.instanceId),
    }))
    .filter((p): p is { entry: typeof run.helpers[number]; inst: HelperInstanceState } => p.inst !== undefined)
    .filter((p) => x.profileOf(p.inst.defId) !== null);

  const contribTotal = Object.values(run.contrib).reduce((s, v) => s + v, 0);
  const ctx = { ...x.time.ctx('player'), tags: ['mine', `layer:${run.layer}`] };

  // --- 1. ДОЛЯ (только золото мобов/боссов; R5)
  const shareOf = (inst: HelperInstanceState, profile: HelperProfile): number => {
    const level = helperLevelOf(inst.reputation, table);
    const pct = greedSharePctOf(profile) + table.levelSharePct * (level - 1);
    const pool = (run.mobGold * profile.shareOfLoot) / 100;
    if (contribTotal > 0) {
      const raw = pool * ((run.contrib[inst.instanceId] ?? 0) / contribTotal);
      return Math.floor(Math.max(table.shareFloor, raw * (1 + pct / 100)));
    }
    // нулевой Σ — поровну между активными helpers (R5)
    return participants.length > 0 ? Math.floor(pool / participants.length) : 0;
  };

  // --- 2/3. зарплата + репутация + HP (следующий срез собираем здесь)
  let nextHelpers = [...helpers];

  for (const p of participants) {
    const profile = x.profileOf(p.inst.defId);
    if (profile === null) continue;
    const row: HelperSettleRow = {
      instanceId: p.inst.instanceId,
      name: profile.name,
      share: 0,
      sharePaid: false,
      salary: 0,
      salaryPaid: false,
      repDelta: 0,
      reputation: p.inst.reputation,
      level: helperLevelOf(p.inst.reputation, table),
      levelUp: false,
    };
    // доля — отдельной транзакцией (R5)
    row.share = shareOf(p.inst, profile);
    if (row.share > 0) {
      const t = x.transaction.transact({
        costs: [{ t: 'currency', id: 'gold', qty: row.share }],
        eventId: 'mine.helper.share',
        reason: `доля ${profile.name} с золота мобов забега №${run.runNumber} (вклад ${run.contrib[p.inst.instanceId] ?? 0}/${contribTotal})`,
      });
      row.sharePaid = t.ok;
      lines.push(
        t.ok
          ? `доля ${profile.name}: ${row.share}з (mine.helper.share; вклад ${run.contrib[p.inst.instanceId] ?? 0} из ${contribTotal})`
          : `доля ${profile.name}: ${row.share}з НЕ уплачена — в кошельке нет золота (честная витрина)`,
      );
    }
    // зарплата/день (забег = 1 день; уровень −5%/ур, пол ≥ 0)
    const salary = Math.max(
      table.salaryFloor,
      Math.round(profile.salaryPerDay * (1 + (table.levelSalaryPct * (row.level - 1)) / 100)),
    );
    row.salary = salary;
    const ts = x.transaction.transact({
      costs: [{ t: 'currency', id: 'gold', qty: salary }],
      eventId: 'mine.helper.salary',
      reason: `зарплата ${profile.name} за забег №${run.runNumber} (забег = 1 день; ур. ${row.level})`,
    });
    row.salaryPaid = ts.ok;
    if (!ts.ok) {
      // нехватка золота → уход + репутация НЕ растёт (R5)
      lines.push(`зарплата ${profile.name}: ${salary}з НЕ уплачена — ${profile.name} увольняется (helper.quit reason 'unpaid')`);
      x.bus.publish('helper.quit', { instanceId: p.inst.instanceId, reason: 'unpaid', name: profile.name });
      nextHelpers = nextHelpers.filter((h) => h.instanceId !== p.inst.instanceId);
      rows.push(row);
      continue;
    }
    lines.push(`зарплата ${profile.name}: ${salary}з (mine.helper.salary; ур. ${row.level}${row.level > 1 ? `, −${Math.abs(table.levelSalaryPct) * (row.level - 1)}%` : ''})`);
    // репутация: успешный забег +[3..5] (ролл стримом), босс +10 (R6)
    if (reason === 'exit' || reason === 'boss') {
      const span = table.repPerRun[1] - table.repPerRun[0] + 1;
      const u = x.rngBus.rollRange(0, 1, 'uniform', `mine:helper:rep:${p.inst.instanceId}:${run.runNumber}`, ctx);
      let delta = table.repPerRun[0] + Math.floor(u * span);
      if (reason === 'boss') delta += table.repPerBoss;
      row.repDelta = delta;
      row.reputation = p.inst.reputation + delta;
      row.level = helperLevelOf(row.reputation, table);
      row.levelUp = row.level > helperLevelOf(p.inst.reputation, table);
      lines.push(
        `репутация ${profile.name}: +${delta}${reason === 'boss' ? ` (забег ${table.repPerRun[0]}..${table.repPerRun[1]} + босс ${table.repPerBoss})` : ` (забег ${table.repPerRun[0]}..${table.repPerRun[1]})`} → ${row.reputation} (ур. ${row.level})`,
      );
      if (row.levelUp) {
        x.bus.publish('helper.levelReputation', {
          instanceId: p.inst.instanceId,
          level: row.level,
          reputation: row.reputation,
          name: profile.name,
        });
      }
    } else {
      lines.push(`репутация ${profile.name}: без роста (забег завершён смертью)`);
    }
    // HP восстанавливается между забегами до max (данные; R2)
    const maxHp = Math.max(
      1,
      profile.hp + x.statBus.resolve({ stat: 'mine.helper.hp', ctx: { ...ctx, tags: [...ctx.tags, helperTag(p.inst.instanceId)] } }),
    );
    const hp = reason === 'boss' || reason === 'exit' || table.hpRestorePercent >= 100
      ? maxHp
      : Math.min(maxHp, Math.ceil((maxHp * table.hpRestorePercent) / 100));
    nextHelpers = nextHelpers.map((h) => (h.instanceId === p.inst.instanceId ? { ...h, reputation: row.reputation, hp } : h));
    rows.push(row);
  }

  if (participants.length > 0) {
    lines.unshift(`помощники забега (${participants.length}): расчёт по завершении — доля с мобов ${table.sharePoolPercent}% по вкладу, зарплата за день, репутация${reason === 'death' ? ' без роста (смерть)' : ''}`);
  }
  return { helpers: nextHelpers.length !== helpers.length || participants.length > 0 ? nextHelpers : undefined, lines, rows };
}
