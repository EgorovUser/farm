/**
 * UI-витрины модулей Фазы 3 (M05 Ферма / M06 Загон / M15 Квесты) для
 * отладочных таблиц. Только чтение publicApi через ModuleRegistry (П4 —
 * UI без игровой логики; прецеденты player.snapshot и inventory-rows.ts).
 * Вынесено из game-store.ts по правилу 01-CORE §6 (файл приближался к 300).
 */
import type { Game } from '@/game/bootstrap';
import type { FarmStateView, FarmTileView } from '@/game/modules/farm/module';
import type { PenStateView } from '@/game/modules/pen/module';
import type { AnimalView } from '@/game/modules/pen/view';
import type { AchievementRow, QuestRow } from '@/game/modules/quests/views';
import type { Reward } from '@/content/quests/types';
import { CURRENCY_LABELS_RU } from '@/content/locale/ru';

export type { FarmStateView, FarmTileView, PenStateView, AnimalView, QuestRow, AchievementRow };

export interface QuestsView {
  daily: QuestRow[];
  weekly: QuestRow[];
  chains: QuestRow[];
  achievements: AchievementRow[];
  flags: string[];
}

export interface ModuleInfoRow {
  id: string;
  version: string;
  active: boolean;
  stateKey: string;
}

/** витрина фермы (farm.state — тот же sweep + данные тайлов, что в консоли) */
export function farmViewOf(game: Game): FarmStateView | null {
  return (game.modules.call('farm', 'farm.state') as FarmStateView | null) ?? null;
}

/** витрина загона (pen.state — sweep recover→produce→birth) */
export function penViewOf(game: Game): PenStateView | null {
  return (game.modules.call('pen', 'pen.state') as PenStateView | null) ?? null;
}

/** строки квестов/ачивок/флагов — те же витрины, что в командах quests list */
export function questsViewOf(game: Game): QuestsView | null {
  const daily = game.modules.call('quests', 'quests.list', 'daily');
  if (daily === null) return null;
  return {
    daily: daily as QuestRow[],
    weekly: (game.modules.call('quests', 'quests.list', 'weekly') as QuestRow[] | null) ?? [],
    chains: (game.modules.call('quests', 'quests.list', 'chain') as QuestRow[] | null) ?? [],
    achievements: (game.modules.call('quests', 'quests.list', 'ach') as AchievementRow[] | null) ?? [],
    flags: (game.modules.call('quests', 'quests.flags') as string[] | null) ?? [],
  };
}

/** манифесты смонтированных модулей (панель «Модули» + команды modules) */
export function modulesInfoOf(game: Game): ModuleInfoRow[] {
  return game.modules.list().map((m) => ({
    id: m.manifest.id,
    version: m.manifest.version,
    active: m.active,
    stateKey: m.manifest.stateKey,
  }));
}

/** имена дефов фермы для таблиц (контент — чтение реестра, П4 п.6) */
export function farmNamesOf(game: Game): { crops: Record<string, string>; upgrades: Record<string, string> } {
  try {
    const crops = game.content.get<Array<{ id: string; name: string }>>('farm.crops');
    const upgrades = game.content.get<Array<{ id: string; name: string }>>('farm.upgrades');
    return {
      crops: Object.fromEntries(crops.map((c) => [c.id, c.name])),
      upgrades: Object.fromEntries(upgrades.map((u) => [u.id, u.name])),
    };
  } catch {
    return { crops: {}, upgrades: {} };
  }
}

/** имена улучшений загона (M06.2) для чипов панели */
export function penUpgradeNamesOf(game: Game): Record<string, string> {
  try {
    const upgrades = game.content.get<Array<{ id: string; name: string }>>('pen.upgrades');
    return Object.fromEntries(upgrades.map((u) => [u.id, u.name]));
  } catch {
    return {};
  }
}

/** короткая подпись награды (формат консоли rewardsText, для таблиц) */
export function rewardText(game: Game, r: Reward): string {
  switch (r.t) {
    case 'currency':
      return `${r.qty} ${CURRENCY_LABELS_RU[r.id] ?? r.id}`;
    case 'item':
      return `${game.content.tryItem(r.defId)?.name ?? r.defId} ×${r.qty}`;
    case 'passivePoint':
      return `+${r.qty} очко пассивки`;
    case 'flag':
      return `флаг ${r.flag}`;
    case 'xp':
      return `${r.qty} XP`;
  }
}
