/**
 * Сорняки — ЧАСОВОЕ правило (карточка M05 §4; F1/F2 брифа M05.2).
 *
 * На каждом time.hourTick каждый РАСТУЩИЙ тайл с шансом
 *   weedChance = resolve('farm.weeds.chancePercent', ctx c тегом тайла)
 *                × weedRiskMult(crop, дефолт 1 — [DECISION · M05.2], П5)
 * зарастает: бросок RngBus ИМЕНОВАННЫМ стримом `farm:weeds:<tab>:<idx>`
 * (прецедент farm:harvest:* — детерминизм по сиду дня); при срабатывании
 * стадия +1 (1..maxStages, кап) и grownAt растягивается conserving-остатка:
 * grownAt' = now + (grownAt − now) × mult(old)/mult(new), где mult(k) —
 * множитель скорости от стадий (fsm.weedsSpeedMult; Оракул-инвариант F2:
 * стадия 1 → −25% / 2 → −50% / 3 → −75% = база × (1 − 0.25 × weeds)).
 *
 * Роллы с истекшим grownAt (ждут полива) дат НЕ двигают — рост уже
 * спроецирован; тайлы не-growing не трогаются. Модуль публикует
 * farm.weedsAppeared по каждому срабатыванию (payload [DECISION]:
 * { tab, tileIdx, stage, cropId }) и invalidate.stat (кэш резолвов).
 *
 * Каденция hourTick — РЕАЛЬНЫЙ час (02 §8); таймеры фермы — игровые часы
 * (контент-ускорение n=1000): асимметрия — канон. Оффлайн — тот же
 * обработчик: OfflineCatchup публикует hourTick с per-hour now (кап 72),
 * подписка манифеста покрывает досчёт БЕЗ отдельного catchUp-кода (F4).
 */
import type { CropDef } from '@/content/farm/crops';
import type { FarmTable } from '@/content/balance/farm';
import type { FarmState, FarmTile, FarmTab } from '../state';
import { weedsSpeedMult } from './fsm';

/** событие появления сорняков (payload farm.weedsAppeared — F1 [DECISION]) */
export interface WeedAppearance {
  tab: string;
  tileIdx: number;
  stage: number;
  cropId: string;
}

/** узкий контракт рандома (прод — RngBus.rollRange(0,1): логируемый ролл
 *  с source=streamId — П6 «все шансы на стол»; чеки — фейк) */
export interface WeedsRng {
  roll01(streamId: string): number;
}

/** узкий контракт шанса: resolve('farm.weeds.chancePercent') с тегом тайла */
export interface WeedsChance {
  of(tabId: string, tileIdx: number): number;
}

export interface HourWeedsDeps {
  rng: WeedsRng;
  chance: WeedsChance;
  crops: Map<string, CropDef>;
  table: FarmTable;
}

/** тег тайла для ctx резолвов и модов (провайдер штрафа, гербициды) */
export function tileTagOf(tabId: string, tileIdx: number): string {
  return `farm:tile:${tabId}:${tileIdx}`;
}

function withTile(state: FarmState, tabId: string, tileIdx: number, patch: Partial<FarmTile>): FarmState {
  return {
    ...state,
    tabs: state.tabs.map((tab: FarmTab) =>
      tab.id !== tabId
        ? tab
        : { ...tab, tiles: tab.tiles.map((t) => (t.index === tileIdx ? { ...t, ...patch } : t)) },
    ),
  };
}

/**
 * Один часовой проход по всем растущим тайлам. ЧИСТАЯ функция:
 * (state, now, deps) → { state', appeared[] }; side-эффекты (публикации,
 * markDirty, invalidate.stat) — за модулем (module.ts onHourTick).
 */
export function hourWeedsPass(
  state: FarmState,
  now: number,
  deps: HourWeedsDeps,
): { state: FarmState; appeared: WeedAppearance[] } {
  const appeared: WeedAppearance[] = [];
  let next: FarmState = state;
  const { maxStages, growthPenaltyPercent, immuneTabKinds } = deps.table.weeds;
  for (const tab of state.tabs) {
    // [M05.3 · G1] «Теплица … без сорняков» (карточка §2): вкладки из
    // immuneTabKinds часовой проход пропускает — семантика «нулевого шанса»
    // (эквивалентна мод-путём, [DECISION] — гард дешевле и читаемее)
    if (immuneTabKinds?.includes(tab.kind)) continue;
    for (const tile of tab.tiles) {
      if (tile.state !== 'growing') continue;
      if (tile.weeds >= maxStages) continue; // кап стадий: дальше не растёт
      const crop = tile.cropId !== undefined ? deps.crops.get(tile.cropId) : undefined;
      const risk = crop?.weedRiskMult ?? 1; // [DECISION] дефолт 1 (П5)
      const chance = deps.chance.of(tab.id, tile.index) * risk;
      if (chance <= 0) continue;
      const roll = deps.rng.roll01(`farm:weeds:${tab.id}:${tile.index}`);
      if (roll >= chance / 100) continue;
      const newWeeds = tile.weeds + 1;
      const patch: Partial<FarmTile> = { weeds: newWeeds };
      if (tile.grownAt !== undefined && tile.grownAt > now) {
        // растяжение остатка: работа сохранена, скорость упала (F2)
        const multOld = weedsSpeedMult(tile.weeds, growthPenaltyPercent);
        const multNew = weedsSpeedMult(newWeeds, growthPenaltyPercent);
        patch.grownAt = now + Math.max(1, Math.round(((tile.grownAt - now) * multOld) / multNew));
      }
      next = withTile(next, tab.id, tile.index, patch);
      appeared.push({ tab: tab.id, tileIdx: tile.index, stage: newWeeds, cropId: tile.cropId ?? '' });
    }
  }
  return { state: next, appeared };
}
