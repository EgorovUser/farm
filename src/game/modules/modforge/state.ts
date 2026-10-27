/**
 * Состояние M03 «Модфордж» (срез сейва 'modforge', 02-BUSES §11).
 * M03.2: регистрирует срез финальной формы (v1, rerolls) — писатели
 * приходят с реролл-циклом M03.3, эволюция полей внутри среза — санация
 * загрузчика без bump версии (прецедент inventory v1).
 *
 * rerolls: iid предмета → { attempts (инфляция §6), pending (ожидающий
 * выбор вариант + метка времени) }. Ключи проданных предметов остаются
 * (iid уникальны навсегда — счётчик монотонный; мусор-ключи безвредны).
 */
import type { SaveSlice } from '@/kernel/save/save-director';
import type { RolledModEntry } from '@/shared/types/rolled-mod';
import { isRolledModEntry } from '@/shared/types/rolled-mod';

export interface RerollPending {
  variant: RolledModEntry[];
  at: number;
}

export interface ModForgeRerollState {
  attempts: number;
  pending?: RerollPending;
}

export interface ModForgeState {
  v: 1;
  rerolls: Record<string, ModForgeRerollState>;
}

export function defaultModForgeState(): ModForgeState {
  return { v: 1, rerolls: {} };
}

/** санация одного среза rerolls (П5: мусор — не ошибка, отбрасывается) */
function sanitizeState(raw: unknown): ModForgeState {
  const out = defaultModForgeState();
  if (!raw || typeof raw !== 'object') return out;
  const r = raw as { rerolls?: unknown };
  if (!r.rerolls || typeof r.rerolls !== 'object') return out;
  for (const [iid, entry] of Object.entries(r.rerolls as Record<string, unknown>)) {
    if (!entry || typeof entry !== 'object') continue;
    const e = entry as { attempts?: unknown; pending?: unknown };
    const attempts =
      typeof e.attempts === 'number' && Number.isFinite(e.attempts)
        ? Math.max(0, Math.floor(e.attempts))
        : 0;
    const state: ModForgeRerollState = { attempts };
    const p = e.pending;
    if (p && typeof p === 'object') {
      const pending = p as { variant?: unknown; at?: unknown };
      const variant = Array.isArray(pending.variant) ? pending.variant.filter(isRolledModEntry) : [];
      const at = typeof pending.at === 'number' && Number.isFinite(pending.at) ? pending.at : 0;
      if (variant.length > 0) state.pending = { variant, at };
    }
    out.rerolls[iid] = state;
  }
  return out;
}

export function modForgeSaveSlice(
  getState: () => ModForgeState,
  setState: (s: ModForgeState) => void,
): SaveSlice {
  return {
    save: () => {
      const s = getState();
      // глубокая копия чистых данных (никаких классов/функций — 02 §11)
      const rerolls: Record<string, ModForgeRerollState> = {};
      for (const [iid, e] of Object.entries(s.rerolls)) {
        rerolls[iid] = {
          attempts: e.attempts,
          ...(e.pending
            ? { pending: { variant: e.pending.variant.map((m) => ({ ...m })), at: e.pending.at } }
            : {}),
        };
      }
      return { v: 1, rerolls };
    },
    load: (data) => {
      setState(sanitizeState(data));
    },
  };
}
