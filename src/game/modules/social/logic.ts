/**
 * Чистое ядро M17 «Соц-заглушки» (бриф G2–G4): сиды дня, сбор фактов
 * доски/писем из живых витрин, взвешенный выбор dailySeed-потоками,
 * подстановка плейсхолдеров шаблонов. Ноль импортов игровых модулей
 * (П4): всё живое — структурные витрины deps.ts; одна дата + одно
 * состояние → идентичные витрины (детерминизм — оракул приёмки).
 *
 * Сиды (бриф G2/G3 — НОВЫЕ суффиксы, НЕ пересекаются с существующими):
 *   board: hash(saveId, 'social-board', dateISO[, '#rerolls'])
 *   mail:  hash(saveId, 'social-letters', dateISO[, '#rerolls'])
 */
import { hashString, mulberry32, weightedPick } from '@/shared/utils/rng';
import type { SocialMailKind, SocialMailTable, SocialNewsTable } from '@/content/social/types';
import type { BoardFact, MailCandidate, SocialVitrines } from './deps';

/** взвешенный выбор ИНДЕКСА (weightedPick возвращает { id: string }) */
function pickIndex(weights: number[], rnd: () => number): number | null {
  const pick = weightedPick(
    weights.map((w, i) => ({ id: String(i), weight: Math.max(1, w) })),
    rnd,
  );
  return pick === null ? null : Number(pick.id);
}

/** выбор варианта шаблона по весам (один вариант — без ролла) */
function pickVariant<T extends { weight: number }>(variants: T[], rnd: () => number): T | null {
  if (variants.length === 0) return null;
  if (variants.length === 1) return variants[0]!;
  const idx = pickIndex(
    variants.map((v) => v.weight),
    rnd,
  );
  return idx === null ? null : variants[idx]!;
};

export function boardSeedOf(saveId: string, dateISO: string, rerolls = 0): number {
  return hashString(`${saveId}:social-board:${dateISO}${rerolls > 0 ? `#${rerolls}` : ''}`);
}

export function mailSeedOf(saveId: string, dateISO: string, rerolls = 0): number {
  return hashString(`${saveId}:social-letters:${dateISO}${rerolls > 0 ? `#${rerolls}` : ''}`);
}

/** {name} {item} {qty} … → значения (неизвестный плейсхолдер остаётся как есть) */
export function fillTemplate(text: string, params: Record<string, string | number>): string {
  return text.replace(/\{([a-zA-Z][a-zA-Z0-9]*)\}/g, (whole, key: string) =>
    Object.prototype.hasOwnProperty.call(params, key) ? String(params[key]) : whole,
  );
}

// ---------------------------------------------------------------- доска: факты

/**
 * Кандидаты заметок из живого состояния (ПОРЯДОК СТАБИЛЕН: голова сводки
 * (уровень, налог) → жители (порядок контента) → постройки → тренды →
 * сделки → рейд → очередь жителей). Голова всегда присутствует —
 * остальные роли роллит pickNotes по сиду дня.
 */
export function buildBoardFacts(v: SocialVitrines, itemName: (defId: string) => string): BoardFact[] {
  const facts: BoardFact[] = [];
  const vs = v.state;
  // голова сводки (первые два факта — всегда в доске)
  facts.push({ kind: 'village-level', params: { level: vs.level, levelMax: vs.levelMax, xp: vs.xp } });
  facts.push({
    kind: 'tax',
    params: {
      gold: vs.tax.expectedGold,
      avg: Math.round(vs.tax.avgHappiness * 10) / 10,
      grumblers: vs.tax.grumblers,
    },
  });
  // жители: ворчун → просьба → довольный (приоритет новостей)
  for (const r of vs.villagers) {
    if (r.grumbler) {
      facts.push({ kind: 'villager-grumbler', params: { name: r.name, days: r.grumbleDays, happiness: r.happiness } });
      continue;
    }
    if (r.need !== null && !r.need.satisfied) {
      facts.push({ kind: 'villager-request', params: { name: r.name, item: itemName(r.need.item), qty: r.need.qty } });
      continue;
    }
    if (r.need !== null && r.need.satisfied) {
      facts.push({ kind: 'villager-happy', params: { name: r.name, happiness: r.happiness, item: itemName(r.need.item) } });
    }
  }
  // постройки: готовые и строящиеся
  for (const b of v.buildings.rows) {
    if (b.construction !== null) {
      facts.push({ kind: 'building-construction', params: { building: b.name, hours: b.construction.hoursLeft } });
    } else if (b.level > 0) {
      facts.push({ kind: 'building-built', params: { building: b.name, level: b.level } });
    }
  }
  // тренды и сделки дня биржи
  for (const t of v.trade.trends) {
    facts.push({
      kind: 'trade-trend',
      params: { item: itemName(t.defId), trend: t.kind === 'abundance' ? 'изобилие' : 'дефицит' },
    });
  }
  for (const c of v.trade.contracts) {
    if (c.fulfilledToday) {
      facts.push({ kind: 'trade-deal', params: { partner: c.partnerName, item: itemName(c.item), qty: c.qty } });
    }
  }
  // рейд: предвестник жив → итог недели → тишина
  if (v.raid.warning.sent && !v.raid.warning.resolvedThisWeek) {
    facts.push({ kind: 'raid-warning', params: {} });
  } else if (v.raid.warning.resolvedThisWeek && v.raid.lastResult !== null) {
    facts.push({
      kind: 'raid-result',
      params: {
        result: v.raid.lastResult.success
          ? 'гоблины отбиты, склад цел'
          : `украдено ${v.raid.lastResult.stolen}з золота`,
      },
    });
  } else {
    facts.push({
      kind: 'raid-quiet',
      params: { weekday: v.raid.schedule.weekday, hour: v.raid.schedule.hour, hours: v.raid.schedule.inHours },
    });
  }
  // очередь будущих жителей
  if (vs.villagersLocked.length > 0) {
    facts.push({ kind: 'villagers-waiting', params: { count: vs.villagersLocked.length } });
  }
  return facts;
}

// ---------------------------------------------------------------- выбор/рендер

export interface BoardNote {
  id: string;
  kind: string;
  text: string;
}

function templatesOf(table: SocialNewsTable, kind: string) {
  return table.templates.filter((t) => t.kind === kind);
}

/**
 * Заметки дня: голова (уровень+налог) — всегда; добор — взвешенный
 * выбор без возвращения по сиду дня до min..max заметок; вариант
 * формулировки каждого факта — отдельный ролл по весам шаблонов.
 */
export function pickNotes(facts: BoardFact[], table: SocialNewsTable, seed: number): BoardNote[] {
  const rnd = mulberry32(seed);
  const { min, max } = table.notesPerDay;
  const want = Math.max(Math.min(facts.length, min + Math.floor(rnd() * (max - min + 1))), Math.min(2, facts.length));
  const head = facts.slice(0, 2);
  const rest = facts.slice(2);
  const chosen: BoardFact[] = [...head];
  while (chosen.length < want && rest.length > 0) {
    const idx = pickIndex(
      rest.map((f) => Math.max(...templatesOf(table, f.kind).map((t) => t.weight))),
      rnd,
    );
    if (idx === null) break;
    chosen.push(rest.splice(idx, 1)[0]!);
  }
  return chosen.map((f) => {
    const tpl = pickVariant(templatesOf(table, f.kind), rnd) ?? templatesOf(table, f.kind)[0]!;
    return { id: tpl.id, kind: f.kind, text: fillTemplate(tpl.text, f.params) };
  });
}

// ---------------------------------------------------------------- письма

/**
 * Кандидаты писем из живого состояния: просьба (потребность не закрыта),
 * благодарность (закрыта сегодня), предвестник рейда (окно недели живо —
 * пишет «староста»), хвастовство трендом (партнёр биржи, чей предмет
 * трендует; иначе первый партнёр по контенту).
 */
export function buildMailCandidates(
  v: SocialVitrines,
  itemName: (defId: string) => string,
  raidAuthorFallback: string,
): MailCandidate[] {
  const out: MailCandidate[] = [];
  for (const r of v.state.villagers) {
    if (r.need === null) continue;
    if (!r.need.satisfied) {
      out.push({ kind: 'request', author: r.name, params: { author: r.name, item: itemName(r.need.item), qty: r.need.qty } });
    } else {
      out.push({ kind: 'thanks', author: r.name, params: { author: r.name, item: itemName(r.need.item) } });
    }
  }
  if (v.raid.warning.sent && !v.raid.warning.resolvedThisWeek) {
    out.push({ kind: 'raid-warning', author: raidAuthorFallback, params: { author: raidAuthorFallback } });
  }
  if (v.trade.trends.length > 0) {
    const firstPartner = v.trade.reputation[0]?.partnerName ?? 'соседняя деревня';
    for (const t of v.trade.trends) {
      const owner = v.trade.contracts.find((c) => c.item === t.defId)?.partnerName ?? firstPartner;
      out.push({
        kind: 'trend-boast',
        author: owner,
        params: { author: owner, item: itemName(t.defId), trend: t.kind === 'abundance' ? 'изобилие' : 'дефицит' },
      });
    }
  }
  return out;
}

export interface SocialLetter {
  id: string;
  kind: SocialMailKind | string;
  author: string;
  subject: string;
  body: string;
}

/** Письма дня: количество (0..2 по весам) → взвешенный выбор кандидатов */
export function pickLetters(candidates: MailCandidate[], table: SocialMailTable, seed: number): SocialLetter[] {
  if (candidates.length === 0) return [];
  const rnd = mulberry32(seed);
  const rolled = pickIndex([...table.countWeights], rnd);
  const want = Math.min(rolled ?? table.lettersPerDay.min, candidates.length, table.lettersPerDay.max);
  const pool = [...candidates];
  const letters: SocialLetter[] = [];
  while (letters.length < want && pool.length > 0) {
    const idx = pickIndex(
      pool.map((c) =>
        Math.max(
          ...table.templates
            .filter((t) => t.kind === c.kind)
            .map((t) => t.weight),
          1,
        ),
      ),
      rnd,
    );
    if (idx === null) break;
    const cand = pool.splice(idx, 1)[0]!;
    const tpl = pickVariant(table.templates.filter((t) => t.kind === cand.kind), rnd);
    if (tpl === null) continue;
    letters.push({
      id: tpl.id,
      kind: cand.kind,
      author: cand.author,
      subject: fillTemplate(tpl.subject, cand.params),
      body: fillTemplate(tpl.body, cand.params),
    });
  }
  return letters;
}
