/**
 * Витрины M17 «Соц-заглушки» (бриф G1: форматы стабильны для M18 — UI
 * никогда не считает игровых чисел, инвариант M18 §7). Текстовые ряды;
 * UI-визитка/компоненты — замок M18. До открытия деревни доска/письма —
 * честный гейт-замок с условиями (П6 «гейты не прячутся», прецедент
 * M16.1); профиль жив на любой игре.
 */
import type { SocialMailTable, SocialNewsTable, SocialProfileTable } from '@/content/social/types';
import {
  boardSeedOf,
  buildBoardFacts,
  buildMailCandidates,
  mailSeedOf,
  pickLetters,
  pickNotes,
  type BoardNote,
  type SocialLetter,
} from './logic';
import type { SocialModuleDeps, SocialVitrines } from './deps';
import type { SocialState } from './state';

export interface BoardView {
  day: string;
  locked: boolean;
  gateLines: string[];
  notes: BoardNote[];
  /** сеансовые дев-рероллы social force (в срез НЕ пишутся) */
  rerolls: number;
}

export interface MailView {
  day: string;
  locked: boolean;
  gateLines: string[];
  letters: SocialLetter[];
  unread: number;
  mailReadDay: string | null;
}

export interface ProfileView {
  day: string;
  title: string;
  player: { level: number; xp: number; xpNeed: number };
  gold: number;
  achievements: { unlocked: number; pool: number };
  counters: Array<{ id: string; label: string; value: number }>;
  skills: Array<{ id: string; name: string; level: number }>;
  village: { unlocked: boolean; gateLines: string[] };
  reputation: Array<{ partnerId: string; partnerName: string; levelName: string; points: number }>;
}

export interface SocialStateView {
  day: string;
  mailReadDay: string | null;
  readToday: boolean;
  village: { unlocked: boolean; gateLines: string[] };
  title: string;
  rerolls: number;
}

/** Титул по МАКСИМАЛЬНОМУ уровню репутации партнёров (бриф G4: шкала
 *  M16.3 ×4 читается через deps; запертая деревня / пустые ряды — «Чужак») */
export function titleOf(
  villageUnlocked: boolean,
  reputation: Array<{ level: number; levelName: string }>,
): string {
  if (!villageUnlocked || reputation.length === 0) return 'Чужак';
  let best = reputation[0]!;
  for (const r of reputation) {
    if (r.level > best.level) best = r;
  }
  return best.levelName;
}

export function buildBoardView(
  deps: SocialModuleDeps,
  v: SocialVitrines,
  table: SocialNewsTable,
  depsCtx: { saveId: string; dateISO: string; itemName(defId: string): string; rerolls: number },
): BoardView {
  if (!v.state.unlocked) {
    return { day: depsCtx.dateISO, locked: true, gateLines: v.state.gateLines, notes: [], rerolls: depsCtx.rerolls };
  }
  const seed = boardSeedOf(depsCtx.saveId, depsCtx.dateISO, depsCtx.rerolls);
  const facts = buildBoardFacts(v, depsCtx.itemName);
  return {
    day: depsCtx.dateISO,
    locked: false,
    gateLines: [],
    notes: pickNotes(facts, table, seed),
    rerolls: depsCtx.rerolls,
  };
}

export function buildMailView(
  v: SocialVitrines,
  table: SocialMailTable,
  state: SocialState,
  depsCtx: { saveId: string; dateISO: string; itemName(defId: string): string; rerolls: number },
): MailView {
  if (!v.state.unlocked) {
    return { day: depsCtx.dateISO, locked: true, gateLines: v.state.gateLines, letters: [], unread: 0, mailReadDay: state.mailReadDay ?? null };
  }
  const seed = mailSeedOf(depsCtx.saveId, depsCtx.dateISO, depsCtx.rerolls);
  const fallback = table.templates.find((t) => t.authorFallback !== undefined)?.authorFallback ?? 'староста';
  const candidates = buildMailCandidates(v, depsCtx.itemName, fallback);
  const letters = pickLetters(candidates, table, seed);
  return {
    day: depsCtx.dateISO,
    locked: false,
    gateLines: [],
    letters,
    unread: state.mailReadDay === depsCtx.dateISO ? 0 : letters.length,
    mailReadDay: state.mailReadDay ?? null,
  };
}

export function buildProfileView(
  deps: SocialModuleDeps,
  v: SocialVitrines,
  table: SocialProfileTable,
  depsCtx: { dateISO: string; counters: Array<{ id: string; value: number }> },
): ProfileView {
  const byId = new Map(depsCtx.counters.map((c) => [c.id, c.value]));
  return {
    day: depsCtx.dateISO,
    title: titleOf(v.state.unlocked, v.trade.reputation),
    player: deps.playerProgress(),
    gold: deps.walletGold(),
    achievements: deps.achievements(),
    counters: table.counters.map((c) => ({ id: c.id, label: c.label, value: byId.get(c.id) ?? 0 })),
    skills: deps.skills(),
    village: { unlocked: v.state.unlocked, gateLines: v.state.gateLines },
    reputation: v.trade.reputation.map((r) => ({
      partnerId: r.partnerId,
      partnerName: r.partnerName,
      levelName: r.levelName,
      points: r.points,
    })),
  };
}

export function buildSocialStateView(
  v: SocialVitrines,
  state: SocialState,
  depsCtx: { dateISO: string; rerolls: number },
): SocialStateView {
  return {
    day: depsCtx.dateISO,
    mailReadDay: state.mailReadDay ?? null,
    readToday: state.mailReadDay === depsCtx.dateISO,
    village: { unlocked: v.state.unlocked, gateLines: v.state.gateLines },
    title: titleOf(v.state.unlocked, v.trade.reputation),
    rerolls: depsCtx.rerolls,
  };
}
