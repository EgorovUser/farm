/**
 * Состояние заточки (M10): уровни предметов, станок/круг, счётчик стримов.
 * Формат v1 — чистые данные (02-BUSES §11).
 *
 * УРОВЕНЬ живёт в срезе forge (Record<iid, number>), НЕ в ItemInstance M02 —
 * модуль не мутирует чужое состояние (П4; поле sharpeningLevel канона 03-DATA
 * §4 реализовано срезом владельца). PITY — в PityService ядра (kernel.pity,
 * ключ 'forge:<iid>') — единое хранилище, в forge-срезе НЕ дублируется
 * ([DECISION · M10.1]: §4.2/карточка §6 назначают PityService; дублирование
 * §4.6 создавало бы второй источник истины).
 *
 * frozenCards — место карточек M10.2: резервируется ПУСТЫМ (версию второй раз
 * НЕ поднимаем — срез v8 уже описан под полный цикл).
 */
import type { SaveSlice } from '@/kernel/save/save-director';
import type { ID } from '@/shared/types/ids';

export interface ForgeState {
  v: 1;
  /** уровень заточки по iid предмета (отсутствие = 0) */
  sharpening: Record<ID, number>;
  /** карточки «замороженных» откатом уровней — M10.2 (пусто до него) */
  frozenCards: Record<ID, Record<number, unknown>>;
  /** [M10.2 · R7] одноразовый бонус отказа от карточки (доля; аддитивная
   *  эволюция среза v8: опциональное поле с П5-дефолтом, БЕЗ bump версии) */
  declineBonus?: Record<ID, number>;
  /** «Точильный станок» + купленные улучшения (круг) */
  stations: {
    whetstone: boolean;
    upgrades: ID[];
  };
  /** монотонный счётчик стримов попыток forge:attempt:<seq> (детерминизм) */
  seq: number;
}

export function defaultForgeState(): ForgeState {
  return {
    v: 1,
    sharpening: {},
    frozenCards: {},
    declineBonus: {},
    stations: { whetstone: false, upgrades: [] },
    seq: 0,
  };
}

// ------------------------------------------------------------- save slice

/**
 * Срез сейва 'forge' (02-BUSES §11). Санация П5: битое → дефолт поля.
 * Исчезнувшие iid не вычищаются здесь (срез не знает инвентарь — П4):
 * чистка — по факту в attempt (предмет не найден → запись удаляется;
 * прецедент reroll-цикла M03.3, choose-санация).
 */
export function forgeSaveSlice(
  getState: () => ForgeState,
  setState: (s: ForgeState) => void,
): SaveSlice {
  return {
    save: () => {
      const s = getState();
      return {
        v: 1,
        sharpening: { ...s.sharpening },
        frozenCards: Object.fromEntries(
          Object.entries(s.frozenCards).map(([k, v]) => [k, { ...v }]),
        ),
        // [M10.2 · R7] опциональное поле: пишем только если есть значения
        ...(s.declineBonus && Object.keys(s.declineBonus).length > 0 ? { declineBonus: { ...s.declineBonus } } : {}),
        stations: { whetstone: s.stations.whetstone, upgrades: [...s.stations.upgrades] },
        seq: s.seq,
      };
    },
    load: (data) => {
      const parsed = data as Partial<ForgeState> | null;
      if (!parsed || typeof parsed !== 'object') return;
      const lvl = (v: unknown): number =>
        typeof v === 'number' && Number.isFinite(v) && v > 0 ? Math.floor(v) : 0;

      const sharpening: Record<ID, number> = {};
      if (parsed.sharpening && typeof parsed.sharpening === 'object') {
        for (const [iid, v] of Object.entries(parsed.sharpening as Record<string, unknown>)) {
          if (!iid) continue;
          const L = lvl(v);
          if (L > 0) sharpening[iid] = Math.min(1000, L); // санитарный предел
        }
      }

      // frozenCards: M10.2 — форма { [iid]: { [level]: unknown } }; пусто/битое → {}
      const frozenCards: Record<ID, Record<number, unknown>> = {};
      if (parsed.frozenCards && typeof parsed.frozenCards === 'object') {
        for (const [iid, v] of Object.entries(parsed.frozenCards as Record<string, unknown>)) {
          if (!iid || v === null || typeof v !== 'object' || Array.isArray(v)) continue;
          frozenCards[iid] = { ...(v as Record<number, unknown>) };
        }
      }

      const st = (parsed.stations ?? {}) as { whetstone?: unknown; upgrades?: unknown };
      const upgrades = Array.isArray(st.upgrades)
        ? st.upgrades.filter((u): u is ID => typeof u === 'string' && u !== '')
        : [];

      // [M10.2 · R7] declineBonus: опциональное поле среза v8 (П5-дефолт {})
      const declineBonus: Record<ID, number> = {};
      if (parsed.declineBonus && typeof parsed.declineBonus === 'object') {
        for (const [iid, v] of Object.entries(parsed.declineBonus as Record<string, unknown>)) {
          if (!iid) continue;
          if (typeof v === 'number' && Number.isFinite(v) && v > 0) {
            declineBonus[iid] = Math.min(1, v); // санитарный предел (доля)
          }
        }
      }

      setState({
        v: 1,
        sharpening,
        frozenCards,
        declineBonus,
        stations: {
          whetstone: st.whetstone === true,
          upgrades: [...new Set(upgrades)],
        },
        seq: typeof parsed.seq === 'number' && Number.isFinite(parsed.seq) && parsed.seq > 0 ? Math.floor(parsed.seq) : 0,
      });
    },
  };
}
