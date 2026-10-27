/**
 * Инициализация и сдвиг времени игры (вынесено из bootstrap, 01-CORE §6:
 * один файл — одна ответственность). Обе функции работают только через
 * публичное лицо Game — никаких приватных замыканий bootstrap.
 *
 * [FIX-M01 · D13] Реген-инварианты D2 реализованы событийно (minuteTick +
 * catchUpDone) — ратифицировано. Здесь два дополнения: (а) reconcile при
 * ЛЮБОЙ холодной загрузке (раньше молчало всё, что меньше часа); (б) reconcile
 * при возврате вкладки — тем же advance-путём, что `time ±N` и холодный catchUp.
 */
import { START_GOLD } from '@/content/balance/economy';
import { dailySeed } from '@/shared/utils/rng';
import { DebugClock } from '@/kernel/di/clock';
import type { OfflineReport } from '@/kernel/time/offline-catchup';
import type { Game } from './bootstrap';

export async function initGame(game: Game): Promise<{ fresh: boolean; offlineReport: OfflineReport | null }> {
  const { save, time, transaction, rngBus, clock } = game;
  const file = await save.load();
  let offlineReport: OfflineReport | null = null;

  if (!file) {
    // новая игра: стартовый капитал — транзакцией, чтобы событие ушло в ленту
    transaction.transact({
      grants: [{ t: 'currency', id: 'gold', qty: START_GOLD }],
      eventId: 'kernel.newGame',
      reason: 'стартовый капитал',
    });
    // [M04.1] первый завоз магазина — сразу при новой игре (ленивый ensure:
    // тот же день — идемпотентный пропуск; app-слой — легальный оркестратор)
    void game.modules.call('shop', 'shop.ensureStock');
    // [M15] ролл квестов дня — тот же ленивый ensure (базовая линия = текущие
    // счётчики = нули новой игры); идемпотентен в тот же день
    void game.modules.call('quests', 'quests.ensureDay');
    return { fresh: true, offlineReport };
  }

  // [FIX-0.1 D] сид рандома загруженного сейва = dailySeed(saveId + СЕГОДНЯШНЯЯ дата):
  // рестарт в тот же день — те же роллы; смена дня — новый сид (02-BUSES §6)
  const now = clock.now();
  rngBus.setSeed(dailySeed(save.getSaveId(), time.localDateISO(now)));
  // [M01 · DEBT-15] синхронизировать дату последнего пересева с датой ЗАГРУЖЕННЫХ
  // часов (offset уже применён): иначе time -1d после F5 с cross-day offset
  // оставлял сид от чужого дня — syncSeedToClock ложно no-op'ил
  game.syncSeedToClock();

  // [FIX-M01 · D13а] оффлайн-досчёт при ЛЮБОЙ холодной загрузке, без порога 1ч:
  // 30 реальных секунд отсутствия = 30 игровых минут регена (раньше молчало всё,
  // что меньше часа). Guard'ы отмотки/нулевого срока (to <= from) — в OfflineCatchup.
  const lastSeen = save.getLastSeen();
  offlineReport = game.catchUp(lastSeen, now);
  game.syncSeedToClock(); // [FIX-0.1 D] капнутый досчёт оставляет «старый» день — выравниваем
  time.syncBoundaries(now);
  // [M04.1] сток после загрузки: пропущенный день (офлайн через полночь)
  // ротируется здесь; тот же день — идемпотентный пропуск (карточка §2)
  void game.modules.call('shop', 'shop.ensureStock');
  // [M15] квесты после загрузки: ролл дня/недели по дате загруженных часов
  // (пропущенный день — свежий ролл, «прогресс дня не переносится»; тот же
  // день — идемпотентный пропуск, прецедент ensureStock)
  void game.modules.call('quests', 'quests.ensureDay');
  return { fresh: false, offlineReport };
}

/** Сдвиг отладочных часов + оффлайн-досчёт пропущенного (команда `time +3h`) */
export function advanceGameTime(game: Game, ms: number): { advancedMs: number; report: OfflineReport | null } {
  const { clock, time, statBus, save } = game;
  if (!(clock instanceof DebugClock)) {
    return { advancedMs: 0, report: null };
  }
  const from = clock.now();
  clock.advance(ms);
  const to = clock.now();
  const report = game.catchUp(from, to);
  time.syncBoundaries(to);
  game.syncSeedToClock(); // [FIX-0.1 D] сид — под текущую дату часов после досчёта
  statBus.clearCache();
  save.markDirty();
  return { advancedMs: ms, report };
}

export interface FocusReconciler {
  /** довести обработанное время до текущего момента (идемпотентно) */
  reconcile(): void;
  dispose(): void;
}

/**
 * [FIX-M01 · D13б] Reconcile при возврате вкладки. Watermark — ОБРАБОТАННОЕ
 * игровое время: живой тик засчитывает ровно одну игровую минуту (tickMs),
 * catchUp — весь свой срок; часики реального времени могут убежать вперёд
 * (фоновый троттлинг таймеров вкладки, заморозка) — на visible разница
 * доводится тем же advance-путём, что `time ±N` и холодный catchUp.
 *
 * НЕ lastSeen: живые тики до ухода вкладки в фон уже начислены — отсчёт от
 * lastSeen двойной счёт. Идемпотентность: без необработанной полной игровой
 * минуты — строгий no-op (ни событий, ни досчёта).
 */
export function createFocusReconciler(game: Game): FocusReconciler {
  const tickMs = game.content.time().tickMs;
  // всё до этого момента обработано (монтаж — после initGame с его catchUp)
  let watermark = game.clock.now();
  const offTick = game.bus.subscribe('time.minuteTick', () => {
    watermark += tickMs; // живой тик = ровно одна игровая минута обработана
  });
  const offCatchUp = game.bus.subscribe('time.catchUpDone', (p) => {
    const to = (p as { to: number }).to; // time ±N / catchup simulate / сам reconcile
    if (to > watermark) watermark = to;
  });
  const reconcile = () => {
    const now = game.clock.now();
    if (now - watermark < tickMs) return; // нет отставания (или отмотка) — no-op
    game.catchUp(watermark, now); // тот же advance-путь, что у time ±N
    game.time.syncBoundaries(now);
    game.syncSeedToClock();
    game.statBus.clearCache();
    game.save.markDirty();
    watermark = now;
  };
  const onVisible = () => {
    if (document.visibilityState === 'visible') reconcile();
  };
  let offDoc: (() => void) | null = null;
  if (typeof document !== 'undefined') {
    document.addEventListener('visibilitychange', onVisible);
    offDoc = () => document.removeEventListener('visibilitychange', onVisible);
  }
  return {
    reconcile,
    dispose: () => {
      offTick();
      offCatchUp();
      offDoc?.();
    },
  };
}

/** Монтаж живой игрой: один активный reconciler (повторный init/HMR — прежний снят) */
let wiredFocus: FocusReconciler | null = null;

export function wireFocusReconcile(game: Game): FocusReconciler {
  wiredFocus?.dispose(); // защита от дублей подписки: флаг + отписка
  wiredFocus = createFocusReconciler(game);
  return wiredFocus;
}
