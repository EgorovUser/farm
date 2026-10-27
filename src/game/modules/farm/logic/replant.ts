/**
 * Replantable-послесловие сбора (G5 брифа M05.3, карточка §2) — ЧИСТЫЕ
 * функции. Перенос harvestTile из fsm.ts (wc-распил 01 §6) + расширение
 * послесловием: культура с replantable НЕ очищает грядку в EMPTY.
 *
 * [DECISION · G5] семантика остатка сборов/окна:
 *  - клубника (crop.harvests = 3): счётчик тайла harvestsLeft ставится при
 *    посадке; каждый сбор декрементирует — пока остаток > 0, тайл СНОВА
 *    READY (буква карточки «после сбора снова READY»: 3 сбора ПОДРЯД,
 *    семя не тратится); после последнего — EMPTY;
 *  - виноград (crop.fruitingDays = 7): первый сбор ставит окно
 *    fruitingUntil = now + fruitingDays (окно отсчитывается ОТ ПЕРВОГО
 *    СБОРА — оффлайн-дружелюбно: несобранный READY не сжигает окно);
 *    повторные сборы БЕЗ пересадки — регроу growHours культуры (24ч;
 *    скорость — текущий резолв) в пределах окна: успевает вырасти до
 *    закрытия → GROWING (свежий посевной цикл: полив/удобрение/сорняки
 *    честно заново), не успевает → EMPTY;
 *  - прочие культуры → EMPTY (поведение M05.1/M05.2 без изменений).
 */
import type { ID } from '@/shared/types/ids';
import type { Result } from '@/shared/types/result';
import { err, ok } from '@/shared/types/result';
import type { CropDef } from '@/content/farm/crops';
import type { FarmState, FarmTile } from '../state';
import { findTile } from './fsm';

const DAY_MS = 86_400_000;

function withTile(state: FarmState, tabId: string, tileIdx: number, patch: Partial<FarmTile>): FarmState {
  return {
    ...state,
    tabs: state.tabs.map((tab) =>
      tab.id !== tabId
        ? tab
        : { ...tab, tiles: tab.tiles.map((t) => (t.index === tileIdx ? { ...t, ...patch } : t)) },
    ),
  };
}

/** послесловие сбора: патч тайла для replantable-культуры или null (= EMPTY) */
function replantPatch(crop: CropDef | undefined, tile: FarmTile, now: number, regrowMs: number | null): Partial<FarmTile> | null {
  if (!crop?.replantable) return null;
  // клубника: счётчик сборов (посадка ставит crop.harvests)
  if (crop.harvests !== undefined) {
    const left = (tile.harvestsLeft ?? crop.harvests) - 1;
    return left > 0 ? { state: 'ready', harvestsLeft: left } : null;
  }
  // виноград: окно плодоношения + регроу в окне
  if (crop.fruitingDays !== undefined) {
    const window = tile.fruitingUntil ?? now + crop.fruitingDays * DAY_MS; // первый сбор открывает
    if (regrowMs !== null && now + regrowMs <= window) {
      return {
        state: 'growing',
        plantedAt: now,
        grownAt: now + regrowMs,
        wateredUntil: undefined, // новый цикл: полив-гейт честен
        fertilized: undefined,
        weeds: 0,
        fruitingUntil: window,
      };
    }
    return null; // окно закрыто (регроу не успеет) — лоза выдохлась
  }
  return null;
}

export interface HarvestTransition {
  state: FarmState;
  cropId: ID;
  /** послесловие: 'empty' | 'again' (снова READY — клубника) | 'regrow' (виноград) */
  aftermath: 'empty' | 'again' | 'regrow';
  harvestsLeft?: number;
  fruitingUntil?: number;
}

/** переход READY → (EMPTY | снова READY | регроу) — сбор с послесловием G5 */
export function harvestTile(
  state: FarmState,
  tabId: string,
  tileIdx: number,
  opts?: { crop?: CropDef; now?: number; regrowMs?: number | null },
): Result<HarvestTransition> {
  const ref = findTile(state, tabId, tileIdx);
  if (!ref.ok) return ref;
  const t = ref.value.tile;
  if (t.state !== 'ready') {
    return err(`собрать можно только готовое (тайл ${tileIdx}: «${t.state}»)`);
  }
  const now = opts?.now ?? 0;
  const patch = replantPatch(opts?.crop, t, now, opts?.regrowMs ?? null);
  if (patch === null) {
    // [M05.1] сбор → EMPTY; [M05.2] weeds → 0 (сбор очищает грядку)
    return ok({
      state: withTile(state, ref.value.tab.id, tileIdx, {
        state: 'empty',
        cropId: undefined,
        plantedAt: undefined,
        grownAt: undefined,
        wateredUntil: undefined,
        fertilized: undefined,
        weeds: 0,
        harvestsLeft: undefined,
        fruitingUntil: undefined,
      }),
      cropId: t.cropId as ID,
      aftermath: 'empty',
    });
  }
  const aftermath = patch.state === 'ready' ? 'again' : 'regrow';
  return ok({
    state: withTile(state, ref.value.tab.id, tileIdx, { ...patch, cropId: t.cropId }),
    cropId: t.cropId as ID,
    aftermath,
    harvestsLeft: patch.harvestsLeft,
    fruitingUntil: patch.fruitingUntil,
  });
}
