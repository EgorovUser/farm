/**
 * FSM тайла фермы (карточка M05 §3) — ЧИСТЫЕ функции над состоянием
 * (паттерн M01/M02): каждая возвращает новое состояние или отказ с причиной;
 * сайд-эффекты (энергия, изъятие семени, выдача урожая, события) — в модуле.
 *
 * Переходы: EMPTY → PLOWED → GROWING → READY → EMPTY (+ урожай).
 * Гейт перехода к READY «тайл полит» — [DECISION · M05.1]: полит хотя бы раз
 * после посадки (wateredUntil > plantedAt); полная пауза-механика сухости —
 * M05.2 (окно 8ч уже пишется, потребляется будущим hourTick-правилом).
 * Повторный полив растущей культуры освежает окно.
 *
 * [M05.2 · F3 · СУХОСТЬ — DECISION-формализация]: «сухой» = растущий тайл,
 * который ПОЛИВАЛСЯ (wateredUntil > plantedAt) и чьё окно истекло
 * (wateredUntil < now) — рост стоит. Ленивая переоценка при обращении
 * (прецедент sweep): сухие часы НЕ двигают прогресс — grownAt отодвигается
 * на сухое время (wateredUntil → now), якорь учёта = wateredUntil (после
 * учёта wateredUntil = now: инкрементально, без двойного счёта; гейт «был
 * полит» сохраняется). Тайл, успевший вырасти до высыхания
 * (grownAt ≤ wateredUntil) — ГОТОВ по датам; НЕполивавшийся — растёт без
 * паузы (буква карточки «полив обязателен» — только гейт, M05.1-семантика).
 *
 * [M05.2 · F2 · СОРНЯКИ]: weeds 0..3 — кумулятивный штраф скорости
 * ×(1 − growthPenaltyPercent × weeds/100); при смене стадий grownAt
 * пересчитывается с conserving-остатка: grownAt' = now + (grownAt − now) ×
 * mult(old)/mult(new) — растяжение при зарастании, сжатие при прополке
 * (правило — weeds.ts; штраф резолвится провайдером с тегом тайла).
 *
 * sweepTabs — ленивая переоценка (прецедент craft.sweep): готовность по
 * датам + учёт сухости; список переходов возвращает для публикации
 * farm.tileChanged (модуль публикует, чистая функция — нет).
 */
import type { ID } from '@/shared/types/ids';
import type { Result } from '@/shared/types/result';
import { err, ok } from '@/shared/types/result';
import type { CropDef } from '@/content/farm/crops';
import type { FarmState, FarmTab, FarmTile } from '../state';

export interface TileRef {
  tab: FarmTab;
  tile: FarmTile;
}

/** Найти вкладку и тайл; отказ — с причиной (неизвестные id/индексы, П5) */
export function findTile(state: FarmState, tabId: string, tileIdx: number): Result<TileRef> {
  const tab = state.tabs.find((t) => t.id === tabId);
  if (!tab) return err(`вкладка «${tabId}» не найдена (farm.state)`);
  const tile = tab.tiles.find((t) => t.index === tileIdx);
  if (!tile) return err(`тайл ${tileIdx} не найден во вкладке «${tabId}» (0..${tab.tiles.length - 1})`);
  return ok({ tab, tile });
}

/** обновить один тайл иммутабельно (вкладки/тайлы — новые массивы) */
function withTile(state: FarmState, tabId: ID, tileIdx: number, patch: Partial<FarmTile>): FarmState {
  return {
    ...state,
    tabs: state.tabs.map((tab) =>
      tab.id !== tabId
        ? tab
        : { ...tab, tiles: tab.tiles.map((t) => (t.index === tileIdx ? { ...t, ...patch } : t)) },
    ),
  };
}

// ------------------------------------------------------------ EMPTY → PLOWED

export function plowTile(state: FarmState, tabId: string, tileIdx: number): Result<{ state: FarmState }> {
  const ref = findTile(state, tabId, tileIdx);
  if (!ref.ok) return ref;
  if (ref.value.tile.state !== 'empty') {
    return err(`тайл ${tileIdx} уже обработан (состояние «${ref.value.tile.state}») — вспахать можно только пустой`);
  }
  return ok({ state: withTile(state, ref.value.tab.id, tileIdx, { state: 'plowed' }) });
}

// ------------------------------------------------------------ PLOWED → GROWING

export function plantTile(
  state: FarmState,
  tabId: string,
  tileIdx: number,
  crop: CropDef,
  now: number,
  growMs: number,
): Result<{ state: FarmState }> {
  const ref = findTile(state, tabId, tileIdx);
  if (!ref.ok) return ref;
  if (ref.value.tile.state !== 'plowed') {
    return err(`в тайл ${tileIdx} посадить нельзя: нужно вспаханное поле (состояние «${ref.value.tile.state}»)`);
  }
  if (!crop.allowedTabs.includes(ref.value.tab.kind)) {
    return err(`культура «${crop.id}» не растёт на вкладке «${ref.value.tab.kind}» (разрешено: ${crop.allowedTabs.join(', ')})`);
  }
  return ok({
    state: withTile(state, ref.value.tab.id, tileIdx, {
      state: 'growing',
      cropId: crop.id,
      plantedAt: now,
      grownAt: now + growMs,
      wateredUntil: undefined,
      fertilized: undefined,
      weeds: 0,
      // [M05.3 · G5] клубника: счётчик сборов посадки (винограду окно ставит
      // первый сбор — logic/replant.ts)
      harvestsLeft: crop.harvests,
    }),
  });
}

// ------------------------------------------------------------ GROWING: полив

/** полив: пишет/освежает окно влажности (абсолютная дата; пауза — M05.2) */
export function waterTile(
  state: FarmState,
  tabId: string,
  tileIdx: number,
  now: number,
  windowMs: number,
): Result<{ state: FarmState }> {
  const ref = findTile(state, tabId, tileIdx);
  if (!ref.ok) return ref;
  if (ref.value.tile.state !== 'growing') {
    return err(`полить можно только растущее (тайл ${tileIdx}: «${ref.value.tile.state}»)`);
  }
  return ok({ state: withTile(state, ref.value.tab.id, tileIdx, { wateredUntil: now + windowMs }) });
}

// ------------------------------------------------------------ GROWING: удобрение

/**
 * удобрение: fertilized + пересчёт ОСТАВШЕГОСЯ времени (remaining / (1 + p/100))
 * — ускорение честно применяется к тому, что осталось расти (карточка §3
 * «+15% скорость роста»; [DECISION] M05.1: пересчёт остатка, не пересев).
 */
export function fertilizeTile(
  state: FarmState,
  tabId: string,
  tileIdx: number,
  now: number,
  speedBonusPercent: number,
): Result<{ state: FarmState; prevGrownAt: number }> {
  const ref = findTile(state, tabId, tileIdx);
  if (!ref.ok) return ref;
  const t = ref.value.tile;
  if (t.state !== 'growing') {
    return err(`удобрить можно только растущее (тайл ${tileIdx}: «${t.state}»)`);
  }
  if (t.fertilized) {
    return err(`тайл ${tileIdx} уже удобрен (один раз за цикл роста)`);
  }
  if (t.grownAt === undefined || t.grownAt <= now) {
    // grownAt в прошлом: удобрять поздно — sweep переведёт в ready при поливе
    return err(`тайл ${tileIdx} уже вырос — удобрять поздно`);
  }
  const remaining = t.grownAt - now;
  const next = now + Math.max(1, Math.round(remaining / (1 + speedBonusPercent / 100)));
  return ok({
    state: withTile(state, ref.value.tab.id, tileIdx, { fertilized: true, grownAt: next }),
    prevGrownAt: t.grownAt,
  });
}

// ------------------------------------------------------------ dev: форс роста

/** dev-форс (карточка §7, прецедент D24): время роста тайла истекло —
 *  grownAt отодвигается в прошлое (полив-гейт и сбор остаются честными).
 *  [M05.2] тело перенесено из actions.ts (файл >300 — распил 01 §6). */
export function forceGrowTile(state: FarmState, tabId: string, tileIdx: number, now: number): FarmState {
  const tabs = state.tabs.map((tab) =>
    tab.id !== tabId
      ? tab
      : {
          ...tab,
          tiles: tab.tiles.map((t) =>
            t.index === tileIdx ? { ...t, grownAt: Math.min(t.grownAt ?? now, now - 1) } : t,
          ),
        },
  );
  return { ...state, tabs };
}

// ------------------------------------------------------------ GROWING: прополка

/**
 * прополка (F2): снимает сорняки ЦЕЛИКОМ (weeds → 0) и ВОЗОБНОВЛЯЕТ скорость —
 * остаток роста сжимается обратно: grownAt' = now + (grownAt − now) ×
 * mult(weeds)/mult(0) (conserving работы). Отказы: не растущее / без сорняков.
 */
export function weedTile(
  state: FarmState,
  tabId: string,
  tileIdx: number,
  now: number,
  growthPenaltyPercent: number,
): Result<{ state: FarmState; prevWeeds: number }> {
  const ref = findTile(state, tabId, tileIdx);
  if (!ref.ok) return ref;
  const t = ref.value.tile;
  if (t.state !== 'growing') {
    return err(`прополоть можно только растущее (тайл ${tileIdx}: «${t.state}»)`);
  }
  if (t.weeds <= 0) {
    return err(`в тайле ${tileIdx} нет сорняков`);
  }
  const mult = weedsSpeedMult(t.weeds, growthPenaltyPercent);
  const patch: Partial<FarmTile> = { weeds: 0 };
  if (t.grownAt !== undefined && t.grownAt > now) {
    patch.grownAt = now + Math.max(1, Math.round((t.grownAt - now) * mult));
  }
  return ok({ state: withTile(state, ref.value.tab.id, tileIdx, patch), prevWeeds: t.weeds });
}

/** множитель скорости от стадий сорняков: ×(1 − p × weeds / 100) [F2] */
export function weedsSpeedMult(weeds: number, growthPenaltyPercent: number): number {
  return Math.max(0, 1 - (growthPenaltyPercent * Math.max(0, weeds)) / 100);
}

// ------------------------------------------------------------ READY → …
// сбор (переход READY) перенесён в logic/replant.ts (wc-распил M05.3 при
// G5-послесловии: клубника снова READY / виноград регроу в окне плодоношения)

// ------------------------------------------------------------ ленивая переоценка

export interface TileTransition {
  tab: string;
  tileIdx: number;
  from: FarmTile['state'];
  to: FarmTile['state'];
}

/**
 * Ленивый sweep (прецедент craft.sweep): (1) готовность по датам — растущие
 * тайлы с прошедшим grownAt, политые И успевшие вырасти до высыхания
 * (grownAt ≤ wateredUntil) → ready; (2) учёт сухости — политые тайлы с
 * истёкшим окном: grownAt += (now − wateredUntil), wateredUntil = now
 * (рост стоял — сухие часы не двигают прогресс; F3). Возвращает новое
 * состояние + список переходов (модуль публикует farm.tileChanged
 * по каждому). Часовые правила сорняков — weeds.ts поверх этого sweep.
 */
export function sweepTabs(state: FarmState, now: number): { state: FarmState; transitions: TileTransition[]; changed: boolean } {
  const transitions: TileTransition[] = [];
  let changed = false;
  const tabs = state.tabs.map((tab) => {
    const tiles = tab.tiles.map((tile) => {
      if (tile.state !== 'growing') return tile;
      const wateredUntil = tile.wateredUntil;
      const wasWatered = wateredUntil !== undefined && wateredUntil > (tile.plantedAt ?? 0);
      if (!wasWatered) return tile; // не поливался: растёт, гейт READY держит (M05.1)
      const grownAt = tile.grownAt;
      if (grownAt === undefined) return tile;
      // успел вырасти, пока было влажно → ГОТОВ по датам
      if (grownAt <= now && grownAt <= wateredUntil) {
        changed = true;
        transitions.push({ tab: tab.id, tileIdx: tile.index, from: 'growing', to: 'ready' });
        return { ...tile, state: 'ready' as const };
      }
      // сухой (окно истекло) и рост не завершён → пауза: сухие часы не в счёт
      if (wateredUntil < now && grownAt > wateredUntil) {
        changed = true;
        return {
          ...tile,
          grownAt: grownAt + (now - wateredUntil),
          wateredUntil: now, // якорь учёта: следующий sweep продолжит с now
        };
      }
      return tile;
    });
    return { ...tab, tiles };
  });
  return { state: changed ? { ...state, tabs } : state, transitions, changed };
}

/** гейт полива: полит ли тайл после посадки ([DECISION] M05.1 — см. шапку) */
export function isWatered(tile: FarmTile): boolean {
  return tile.wateredUntil !== undefined && tile.wateredUntil > (tile.plantedAt ?? 0);
}
