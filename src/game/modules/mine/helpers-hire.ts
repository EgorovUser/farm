/**
 * Наём/увольнение помощников M13.2 (брифы R2/R7, карточка §4): доска
 * (после «Барака» — честный отказ с условием до покупки), карточка найма
 * ЦЕЛИКОМ (класс/редкость/статы/трейты/страхи/зарплата/доля/цена — скрытых
 * свойств НЕТ), наём за золото (TransactionService eventId
 * mine.helper.hire → instance {instanceId, defId, hp := max, reputation := 0}
 * в срез helpers?; публикация helper.hired {defId, instanceId, classId}),
 * увольнение БЕСПЛАТНО из витрины состава (helper.quit {reason:'fired'}).
 *
 * Слоты отряда (R7): старт 1, +1 за покупку «Отряда», кап 3; слот общий для
 * доски (наём при полном составе — честный отказ) и забега (run.helpers).
 * Забеги НЕ увольняют автоматически; состав забега фиксируется на старте
 * [DECISION R2]: найм в живом забеге — помощник ждёт следующего спуска.
 */
import type { EventBus } from '@/kernel/bus/event-bus/event-bus';
import type { TransactionService } from '@/kernel/services/transaction/transaction-service';
import type { Result } from '@/shared/types/result';
import { err, ok } from '@/shared/types/result';
import type { MineUpgradeDef } from '@/content/mine/upgrades';
import type {
  HelperClassDef,
  HelperFearDef,
  HelperProfile,
  MineHelpersTable,
} from '@/content/mine/helpers';
import { HELPER_RARITY_RU, HELPER_TRAIT_LABELS } from '@/content/mine/helpers';
import type { HelperInstanceState, MineState } from './state';

export interface HelpersView {
  header: string;
  lines: string[];
}

export interface HelpersDeps {
  classes: HelperClassDef[];
  table: MineHelpersTable;
  fears: HelperFearDef[];
  upgradeDefs: MineUpgradeDef[];
  saveId(): string;
  /** dateISO текущего дня (time.localDateISO(time.now())) */
  today(): string;
  now(): number;
  /** доска дня (детерминизм dailySeed; кэш — module.ts) */
  boardOf(dateISO: string): HelperProfile[];
  /** профиль нанятого по defId (перепосчёт из доски дня найма) */
  profileOf(defId: string): HelperProfile | null;
  /** per-instance resolve шины (тег helper:<id>; трейты/страхи — провайдер) */
  resolveHelperStat(stat: string, instanceId: string): number;
  getState(): MineState;
  setState(s: MineState): void;
  markDirty(): void;
  transaction: TransactionService;
  bus: EventBus;
}

/** purchasesOf: сколько раз куплено улучшение (true → 1; число → N) */
export function purchasesOf(state: MineState, id: string): number {
  const v = state.upgrades?.[id];
  if (v === true) return 1;
  if (typeof v === 'number' && Number.isFinite(v) && v >= 1) return Math.floor(v);
  return 0;
}

/** слоты отряда: старт baseSlots + покупки «Отряда», кап slotCap (R7) */
export function helperSlotsOf(d: HelpersDeps): number {
  const squad = d.upgradeDefs.find((u) => u.effect.t === 'squad');
  let slots = d.table.baseSlots;
  if (squad !== undefined) {
    const eff = squad.effect as { slotsPerPurchase: number };
    slots += purchasesOf(d.getState(), squad.id) * eff.slotsPerPurchase;
  }
  return Math.min(d.table.slotCap, slots);
}

/** уровень репутации: порог levelStep × (уровень − 1) (R6; данные) */
export function helperLevelOf(reputation: number, table: MineHelpersTable): number {
  return Math.floor(Math.max(0, reputation) / table.levelStep) + 1;
}

/** [M13.2] канонический наёмник среза: {instanceId, defId, hp, reputation,
 *  hiredDay?} — форма брифа R2; hp ≥ 0, reputation ≥ 0 (клэмп в игротоке).
 *  Живёт ЗДЕСЬ (распил state.ts по wc-гигиене M13.2 — прецедент FIX-M12) */
const num = (v: unknown, def: number): number =>
  typeof v === 'number' && Number.isFinite(v) ? v : def;

export function canonicalHelpers(raw: unknown): HelperInstanceState[] {
  if (!Array.isArray(raw)) return [];
  const out: HelperInstanceState[] = [];
  for (const h of raw) {
    const r = h as HelperInstanceState | undefined;
    if (!r || typeof r !== 'object' || typeof r.instanceId !== 'string' || typeof r.defId !== 'string') continue;
    if (r.instanceId.length === 0 || r.defId.length === 0) continue;
    const day = typeof r.hiredDay === 'string' && r.hiredDay.length > 0 ? r.hiredDay : undefined;
    out.push({
      instanceId: r.instanceId,
      defId: r.defId,
      hp: Math.max(0, num(r.hp, 1)),
      reputation: Math.max(0, Math.floor(num(r.reputation, 0))),
      ...(day !== undefined ? { hiredDay: day } : {}),
    });
  }
  return out;
}

/** эффективный maxHP: деф + трейты (mine.helper.hp, per-instance conditions) */
export function helperMaxHp(d: HelpersDeps, profile: HelperProfile, instanceId: string): number {
  return Math.max(1, profile.hp + d.resolveHelperStat('mine.helper.hp', instanceId));
}

/** подпись страхов профиля (честная витрина карточки найма) */
function fearsLabel(profile: HelperProfile): string {
  if (profile.fears.length === 0) return 'страхов нет';
  return profile.fears.map((f) => `${f.name} (${f.desc})`).join(' · ');
}

/** подпись трейтов профиля (лейблы данных; без лейбла — тип+значение) */
function traitsLabel(profile: HelperProfile): string {
  if (profile.traits.length === 0) return 'трейтов нет';
  return profile.traits
    .map((t) => {
      const l = HELPER_TRAIT_LABELS[t.type];
      return l !== undefined ? `${l.name}: ${l.text(t.value)}` : `${t.type} ${t.value}`;
    })
    .join(' · ');
}

/** карточка найма ЦЕЛИКОМ (карточка §4: «всё честно показывается») */
function hireCardLines(p: HelperProfile, index: number): string[] {
  const cls = p.classId;
  return [
    `[${index}] ${p.name} (${p.defId}) · класс: ${cls} · редкость: ${HELPER_RARITY_RU[p.rarity]}`,
    `    HP ${p.hp} · атака ${p.atk} · скорость ${p.speed} (инициатива боя — M12 §3)`,
    `    доля награды с мобов ${p.shareOfLoot}% · зарплата ${p.salaryPerDay}з/день · наём ${p.hireCost}з`,
    `    трейты: ${traitsLabel(p)}`,
    `    страхи: ${fearsLabel(p)}`,
  ];
}

/** состав отряда поимённо: HP/статус/репутация-уровень (R2/R8) */
function rosterLines(d: HelpersDeps): string[] {
  const state = d.getState();
  const helpers = state.helpers ?? [];
  if (helpers.length === 0) return ['состав: помощников нет (наём — mine helpers hire <i>)'];
  const lines: string[] = [];
  helpers.forEach((h, idx) => {
    const p = d.profileOf(h.defId);
    if (p === null) {
      lines.push(`  [${idx + 1}] ${h.defId} — профиль не выводится (доска дня найма пуста)`);
      return;
    }
    const maxHp = helperMaxHp(d, p, h.instanceId);
    const level = helperLevelOf(h.reputation, d.table);
    const cls = d.classes.find((c) => c.classId === p.classId);
    const perkNote =
      cls?.perk50 !== undefined
        ? h.reputation >= d.table.perkRepAtLeast
          ? ' · перк 50+ АКТИВЕН'
          : ` · перк 50+ с репутации ${d.table.perkRepAtLeast}`
        : ' · перк не задан';
    lines.push(
      `  [${idx + 1}] ${p.name} — ${p.classId} · HP ${h.hp}/${maxHp} · репутация ${h.reputation} (ур. ${level}) · страхи: ${fearsLabel(p)}${perkNote}`,
    );
  });
  return lines;
}

/** mine helpers — доска + состав (R10: publicApi ×1 на обе витрины) */
export function helpersBoardView(d: HelpersDeps): HelpersView {
  const state = d.getState();
  const barracks = d.upgradeDefs.find((u) => u.effect.t === 'barracks');
  const hasBarracks = barracks !== undefined && purchasesOf(state, barracks.id) > 0;
  const slots = helperSlotsOf(d);
  const hired = (state.helpers ?? []).length;
  if (!hasBarracks) {
    return {
      header: 'Доска наёмников (mine.helpers)',
      lines: [
        'доска закрыта: нужно улучшение «Барак наёмников» (mine upgrades.buy mine_barracks)',
        `состав: ${hired}/${slots} — без Барака найм невозможен`,
      ],
    };
  }
  const today = d.today();
  const board = d.boardOf(today);
  const lines: string[] = [`доска наёмников на ${today} · кандидатов ${board.length} (смена в полночь; dailySeed)`];
  board.forEach((p, i) => lines.push(...hireCardLines(p, i + 1)));
  // [FIX-M13 · OBS-7] суффикс «отряд полон (кап)» — по ЗАНЯТОСТИ слотов (N/M),
  // а не по факту покупок «Отряда»: при капе покупок и свободных слотах —
  // честная строка (аудит: «отряд: 1/3 слотов — отряд полон (кап)» при
  // свободных слотах — полон только при hired >= slots)
  let squadLine = `отряд: ${hired}/${slots} слотов`;
  if (hired >= slots) {
    squadLine +=
      slots >= d.table.slotCap
        ? ' — отряд полон (кап)'
        : ' — отряд полон («Отряд» расширяет — mine upgrades.buy mine_squad)';
  } else if (slots >= d.table.slotCap) {
    squadLine += ` — кап покупок «Отряда»: слоты свободны ${slots - hired}/${slots}`;
  } else {
    squadLine += ' («Отряд» расширяет — mine upgrades.buy mine_squad)';
  }
  lines.push(squadLine);
  lines.push(...rosterLines(d));
  // [FIX-M13 · OBS-8] витрина «последний расчёт»: ведомость забега,
  // завершённого СМЕРТЬЮ (канал вывода у подписки player.hpChanged
  // отсутствует; транзакции/события/репутация — без изменений)
  const lastSettle = state.lastDeathSettle;
  if (lastSettle !== undefined && lastSettle.length > 0) {
    lines.push('последний расчёт (забег завершён смертью — ведомость доступна здесь):');
    lines.push(...lastSettle.map((l) => `  ${l}`));
  }
  if (hired >= slots) lines.push('наём невозможен: отряд полон (увольте или купите «Отряд») — honest gate');
  return { header: 'Доска наёмников (mine.helpers)', lines };
}

/** mine helpers hire <i> — наём кандидата доски (R2) */
export function hireHelper(d: HelpersDeps, indexRaw: unknown): Result<HelpersView> {
  const state = d.getState();
  const barracks = d.upgradeDefs.find((u) => u.effect.t === 'barracks');
  if (barracks === undefined || purchasesOf(state, barracks.id) < 1) {
    return err('доска закрыта: сначала купите «Барак наёмников» (mine upgrades.buy mine_barracks)');
  }
  const i = Math.floor(Number(indexRaw));
  if (!Number.isInteger(i) || i < 1) {
    return err('укажите кандидата: mine helpers hire <i> (доска — mine helpers)');
  }
  const board = d.boardOf(d.today());
  const profile = board[i - 1];
  if (profile === undefined) {
    return err(`нет кандидата №${i} (доска дня: ${board.length}; смена состава в полночь)`);
  }
  const helpers = state.helpers ?? [];
  if (helpers.some((h) => h.defId === profile.defId)) {
    return err(`${profile.name} уже нанят (состав — mine helpers)`);
  }
  const slots = helperSlotsOf(d);
  if (helpers.length >= slots) {
    return err(`отряд полон: ${helpers.length}/${slots} (увольте помощника или купите «Отряд» — mine upgrades.buy mine_squad)`);
  }
  const t = d.transaction.transact({
    costs: [{ t: 'currency', id: 'gold', qty: profile.hireCost }],
    eventId: 'mine.helper.hire',
    reason: `наём помощника: ${profile.name} (${profile.classId}, ${HELPER_RARITY_RU[profile.rarity]})`,
  });
  if (!t.ok) return err(t.error);
  // instanceId: день+кандидат+момент — уникален в срезе (повторный найм того
  // же кандидата после увольнения = НОВЫЙ контракт: репутация с 0 [DECISION])
  const instanceId = `hi_${d.now().toString(36)}_${i}`;
  const today = d.today();
  // [FIX-M13 · OBS-6] экземпляр сначала попадает в срез (hp := 1 временно),
  // max вычисляется ПОСЛЕ — per-instance трейт-провайдер (runBuffProvider,
  // тег helper:<id>) видит найм с первого дня: позитивный hp-трейт даёт
  // HP max/max сразу, НЕ «69/71» до первого settle (hp ≤ max — инвариант)
  const instance: HelperInstanceState = {
    instanceId,
    defId: profile.defId,
    hp: 1,
    reputation: 0,
    hiredDay: today,
  };
  d.setState({ ...state, helpers: [...helpers, instance] });
  instance.hp = helperMaxHp(d, profile, instanceId);
  d.markDirty();
  d.bus.publish('helper.hired', {
    defId: profile.defId,
    instanceId,
    classId: profile.classId,
    name: profile.name,
  });
  return ok({
    header: `Наём: ${profile.name} (${profile.classId})`,
    lines: [
      `КУПЛЕНО: наём ${profile.name} — ${profile.hireCost}з (транзакция mine.helper.hire)`,
      `HP ${instance.hp} · атака ${profile.atk} · скорость ${profile.speed} · зарплата ${profile.salaryPerDay}з/день · доля с мобов ${profile.shareOfLoot}%`,
      `страхи: ${fearsLabel(profile)}`,
      `состав: ${helpers.length + 1}/${slots} · helper.hired {defId: ${profile.defId}, instanceId: ${instanceId}, classId: ${profile.classId}}`,
      'состав забега фиксируется на старте (mine enter) — помощник пойдёт в следующий спуск',
    ],
  });
}

/** mine helpers fire <i> — бесплатное увольнение из витрины состава (R2) */
export function fireHelper(d: HelpersDeps, indexRaw: unknown): Result<HelpersView> {
  const state = d.getState();
  const i = Math.floor(Number(indexRaw));
  if (!Number.isInteger(i) || i < 1) {
    return err('укажите номер в составе: mine helpers fire <i> (состав — mine helpers)');
  }
  const helpers = state.helpers ?? [];
  const target = helpers[i - 1];
  if (target === undefined) {
    return err(`нет помощника №${i} в составе (${helpers.length}; витрина — mine helpers)`);
  }
  const profile = d.profileOf(target.defId);
  const name = profile?.name ?? target.defId;
  const nextHelpers = helpers.filter((_, idx) => idx !== i - 1);
  // живой забег: уволенный покидает и забег (run.helpers) — зарплата/доля
  // считаются по УЧАСТНИКАМ на конец забега [DECISION]
  const run = state.run;
  const nextRun =
    run !== undefined
      ? { ...run, helpers: run.helpers.filter((h) => h.instanceId !== target.instanceId) }
      : undefined;
  d.setState({
    ...state,
    helpers: nextHelpers,
    ...(nextRun !== undefined ? { run: nextRun } : {}),
  });
  d.markDirty();
  d.bus.publish('helper.quit', { instanceId: target.instanceId, reason: 'fired', name });
  return ok({
    header: `Увольнение: ${name}`,
    lines: [
      `${name} уходит — бесплатно (расчёт по завершённым забегам уже сделан)`,
      `событие helper.quit {instanceId: ${target.instanceId}, reason: 'fired'}`,
      `состав: ${nextHelpers.length}/${helperSlotsOf(d)}`,
      ...(run !== undefined ? ['уволен из ЖИВОГО забега — состав забега обновлён'] : []),
    ],
  });
}
