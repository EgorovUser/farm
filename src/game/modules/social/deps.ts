/**
 * Депсы M17 (П4: модуль НЕ импортирует чужие модули — каналы приходят
 * колбэками app-слоя, паттерн VillageModuleDeps/PassivesModuleDeps).
 * Чтение деревни — ТОЛЬКО через deps-интерфейс поверх витринных оракулов
 * village publicApi (бриф G5); `modules/village` НЕ правится — витрины
 * структурно типизированы тут (подмножество полей, паттерн VillageViews
 * WorkersDirector). Дата/saveId/счётчики/имена предметов — сервисы ядра
 * из ModuleContext (time/save/stats/content) — НЕ депы.
 */
import type { SocialMailKind, SocialNewsKind } from '@/content/social/types';

/** витрина village.state (подмножество полей, структурная типизация) */
export interface SocialVillageStateVitrine {
  unlocked: boolean;
  gateLines: string[];
  level: number;
  levelMax: number;
  xp: number;
  tax: { expectedGold: number; level: number; avgHappiness: number; grumblers: number };
  villagers: Array<{
    name: string;
    profession: string;
    happiness: number;
    grumbleDays: number;
    grumbler: boolean;
    need: { item: string; qty: number; kind: 'daily' | 'weekly'; satisfied: boolean } | null;
  }>;
  villagersLocked: Array<{ name: string }>;
}

/** витрина village.trade (контракты/тренды/репутация дня) */
export interface SocialTradeVitrine {
  contracts: Array<{ partnerId: string; partnerName: string; item: string; qty: number; fulfilledToday: boolean }>;
  trends: Array<{ defId: string; kind: 'abundance' | 'deficit' }>;
  reputation: Array<{ partnerId: string; partnerName: string; points: number; level: number; levelName: string }>;
}

/** витрина village.raid (окно/предвестник/итог недели) */
export interface SocialRaidVitrine {
  schedule: { weekday: string; hour: number; inHours: number };
  warning: { sent: boolean; resolvedThisWeek: boolean };
  lastResult: { success: boolean; stolen: number; dateISO: string } | null;
}

/** витрина village.build (реестр построек: статусы/стройки) */
export interface SocialBuildingsVitrine {
  rows: Array<{ id: string; name: string; level: number; status: string; construction: { hoursLeft: number } | null }>;
}

/** агрегат живых витрин деревни (чтение deps — единственный канал деревни) */
export interface SocialVitrines {
  state: SocialVillageStateVitrine;
  trade: SocialTradeVitrine;
  raid: SocialRaidVitrine;
  buildings: SocialBuildingsVitrine;
}

export interface SocialModuleDeps {
  playerLevel(): number;
  playerProgress(): { level: number; xp: number; xpNeed: number };
  walletGold(): number;
  skills(): Array<{ id: string; name: string; level: number }>;
  achievements(): { unlocked: number; pool: number };
  villageState(): SocialVillageStateVitrine;
  villageTrade(): SocialTradeVitrine;
  villageRaid(): SocialRaidVitrine;
  villageBuildings(): SocialBuildingsVitrine;
}

/** кандидат заметки доски: категория + параметры плейсхолдеров */
export interface BoardFact {
  kind: SocialNewsKind;
  params: Record<string, string | number>;
}

/** кандидат письма: тип + живой автор + параметры */
export interface MailCandidate {
  kind: SocialMailKind;
  author: string;
  params: Record<string, string | number>;
}
