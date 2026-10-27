/**
 * Состояние шахты (M12.1, бриф F1/[DECISION] §0): срез `mine` = форма v15
 * (migrate14to15 добавляет дефолт). Счётчики — витрина/ачивки M12.2:
 * fights (каждый проведённый бой), kills (убитые мобы — по экземпляру),
 * bossKills (M12.2), deaths (смерти игрока в бою).
 *
 * Слой НЕ персистится (достижение слоя = ачивка-флаг M15 при гейте M12.2);
 * контейнер MineRun/runBag — домен M13 (канон 03-DATA §7), сюда НЕ тащится.
 */
import type { SaveSlice } from '@/kernel/save/save-director';

export interface MineStats {
  fights: number;
  kills: number;
  bossKills: number;
  deaths: number;
}

export interface MineState {
  v: 1;
  stats: MineStats;
}

export function defaultMineState(): MineState {
  return { v: 1, stats: { fights: 0, kills: 0, bossKills: 0, deaths: 0 } };
}

const num = (v: unknown, def: number): number =>
  typeof v === 'number' && Number.isFinite(v) ? v : def;

/** канонический порядок полей — roundtrip байт-в-байт */
export function canonicalMineState(s: MineState): MineState {
  return {
    v: 1,
    stats: {
      fights: Math.max(0, Math.floor(num(s.stats?.fights, 0))),
      kills: Math.max(0, Math.floor(num(s.stats?.kills, 0))),
      bossKills: Math.max(0, Math.floor(num(s.stats?.bossKills, 0))),
      deaths: Math.max(0, Math.floor(num(s.stats?.deaths, 0))),
    },
  };
}

function sanitize(raw: unknown): MineState {
  const s = raw as MineState | undefined;
  if (!s || typeof s !== 'object' || typeof s.stats !== 'object' || s.stats === null) {
    return defaultMineState();
  }
  return canonicalMineState(s);
}

/** Срез сейва: чистые данные; канонический порядок — roundtrip байт-в-байт */
export function mineSaveSlice(
  getState: () => MineState,
  setState: (s: MineState) => void,
): SaveSlice {
  return {
    save: () => canonicalMineState(getState()),
    load: (data: unknown) => setState(sanitize(data)),
  };
}
