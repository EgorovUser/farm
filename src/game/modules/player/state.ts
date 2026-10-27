/**
 * Состояние игрока (M01): «тело» — энергия, HP, XP/уровень, навыки.
 * Капы/регены/стоимости — НЕ здесь: они читаются только через StatBus (П3).
 * Здесь — только мутабельные текущие значения и прогресс.
 *
 * Энергия/HP — дробные внутри (реген 1/3 и 1/5 за тик), наружу отдаются
 * через Math.floor: списания целые, копейки копятся до целой единицы.
 */
import type { SaveSlice } from '@/kernel/save/save-director';

export interface SkillState {
  level: number;
  xp: number;
}

export interface PlayerState {
  energy: number;
  hp: number;
  /** XP внутри текущего уровня (кривая — из данных, progress.ts) */
  xp: number;
  level: number;
  skills: Record<string, SkillState>;
}

export interface DefaultPlayerDeps {
  /** кап на момент создания новой игры (резолв шины — провайдеров ещё нет) */
  energyMax: number;
  hpMax: number;
  skillIds: readonly string[];
}

export function defaultPlayerState(deps: DefaultPlayerDeps): PlayerState {
  const skills: Record<string, SkillState> = {};
  for (const id of deps.skillIds) skills[id] = { level: 0, xp: 0 };
  return { energy: deps.energyMax, hp: deps.hpMax, xp: 0, level: 1, skills };
}

/**
 * Срез сейва 'player' (02-BUSES §11: чистые данные, никакой логики).
 * Формат v1: { v, energy, hp, xp, level, skills: [[id, {level, xp}]] }.
 * Битые значения отбрасываются с возвратом к дефолту поля (П5).
 */
export function playerSaveSlice(
  getState: () => PlayerState,
  setState: (s: PlayerState) => void,
): SaveSlice {
  return {
    save: () => {
      const s = getState();
      return {
        v: 1,
        energy: s.energy,
        hp: s.hp,
        xp: s.xp,
        level: s.level,
        skills: Object.entries(s.skills).map(([id, sk]) => [id, { level: sk.level, xp: sk.xp }]),
      };
    },
    load: (data) => {
      const parsed = data as
        | { energy?: unknown; hp?: unknown; xp?: unknown; level?: unknown; skills?: unknown }
        | null;
      if (!parsed || typeof parsed !== 'object') return;
      const current = getState();
      const num = (v: unknown, fallback: number): number =>
        typeof v === 'number' && Number.isFinite(v) ? v : fallback;
      const skills: Record<string, SkillState> = { ...current.skills };
      if (Array.isArray(parsed.skills)) {
        for (const entry of parsed.skills) {
          if (!Array.isArray(entry)) continue;
          const [id, sk] = entry as [unknown, { level?: unknown; xp?: unknown } | null];
          if (typeof id !== 'string' || !id || !sk || typeof sk !== 'object') continue;
          skills[id] = { level: num(sk.level, 0), xp: num(sk.xp, 0) };
        }
      }
      setState({
        energy: num(parsed.energy, current.energy),
        hp: num(parsed.hp, current.hp),
        xp: num(parsed.xp, current.xp),
        level: Math.max(1, Math.floor(num(parsed.level, current.level))),
        skills,
      });
    },
  };
}
