/**
 * UI-стор (zustand): зеркалит снапшоты ядра для панелей.
 * UI не содержит игровой логики — только вызовы debug-консоли и чтение шин.
 */
import { create } from 'zustand';
import type { ConsoleLine, LineKind } from '@/debug/console-types';
import { executeCommand } from '@/debug/console';
import { getGame } from '@/game/game-instance';
import type { PlayerSnapshot } from '@/game/modules/player/module';
import type { SaveInfo } from '@/kernel/save/save-director';
import { formatDuration } from '@/shared/utils/format';
import { equippedRows, invRows, type EquippedRow, type StashRow } from './inventory-rows';
import {
  farmViewOf,
  modulesInfoOf,
  penViewOf,
  questsViewOf,
  type FarmStateView,
  type ModuleInfoRow,
  type PenStateView,
  type QuestsView,
} from './module-rows';

export interface WalletRow {
  id: string;
  qty: number;
}
// [M02.2] строки инвентаря/экипировки — stores/inventory-rows.ts (01 §6: расщепление
// при касании — game-store приближался к 300 строкам)
export type { StashRow, EquippedRow };
export interface StatRow {
  stat: string;
  base: number;
  final: number;
}
export interface BuffRow {
  id: string;
  stat: string;
  op: string;
  value: number;
  expiresAt: number | null;
  tags: string[];
  /** [FIX-0.1 G] «до конца забега» — не путать с бессрочным */
  runs: boolean;
}
export interface PityRow {
  ownerId: string;
  key: string;
  value: number;
}
export interface CounterRow {
  id: string;
  value: number;
}
export interface TaskRow {
  id: string;
  label?: string;
}
export interface EventRow {
  name: string;
  payload: string;
  at: number;
}
export interface RollRow {
  at: number;
  kind: string;
  input: string;
  output: string;
  luck: number;
}
// [Фаза 3 · дебаг-панели] витрины модулей — типы и мапперы module-rows.ts
// (прецедент inventory-rows: UI читает publicApi, игровой логики нет)
export type { FarmStateView, PenStateView, QuestsView, ModuleInfoRow };

interface GameStore {
  ready: boolean;
  bootMessage: string | null;
  lines: ConsoleLine[];
  history: string[];
  now: number;
  /** [FIX-0.1 B] фильтр ТОЛЬКО отображения ленты: минутные тики скрыты по умолчанию.
   *  Подписчики EventBus (очистка кэшей шин и пр.) продолжают получать minuteTick. */
  showTicks: boolean;
  setShowTicks(visible: boolean): void;
  wallet: WalletRow[];
  stash: StashRow[];
  /** [M02.2] экипировка: слот → запись (панель «Инвентарь») */
  equipped: EquippedRow[];
  stats: StatRow[];
  buffs: BuffRow[];
  providers: string[];
  pity: PityRow[];
  counters: CounterRow[];
  tasks: TaskRow[];
  eventFeed: EventRow[];
  rollLog: RollRow[];
  saveInfo: SaveInfo | null;
  player: PlayerSnapshot | null;
  /** [Фаза 3] витрины модулей для отладочных таблиц (правая колонка) */
  farm: FarmStateView | null;
  pen: PenStateView | null;
  quests: QuestsView | null;
  modulesInfo: ModuleInfoRow[];
  init(): Promise<void>;
  runCommand(text: string): void;
  refresh(): void;
  clearConsole(): void;
}

let lineSeq = 0;
let bootStarted = false;
let refreshTimer: ReturnType<typeof setTimeout> | null = null;
let clockTimer: ReturnType<typeof setInterval> | null = null;

const MAX_LINES = 600;
const MAX_FEED = 60;

export const useGameStore = create<GameStore>()((set, get) => {
  const pushLine = (kind: LineKind, text: string) => {
    lineSeq += 1;
    const line: ConsoleLine = { id: lineSeq, kind, text, at: Date.now() };
    set((s) => ({ lines: [...s.lines.slice(-(MAX_LINES - 1)), line] }));
  };

  const scheduleRefresh = () => {
    if (refreshTimer !== null) return;
    refreshTimer = setTimeout(() => {
      refreshTimer = null;
      get().refresh();
    }, 120);
  };

  const refresh = () => {
    if (!get().ready) return;
    const game = getGame();
    const statCtx = game.time.ctx('player');
    const stats: StatRow[] = game.statBus.listStats().map((stat) => {
      const trace = game.statBus.resolveTrace({ stat, ctx: statCtx });
      return { stat, base: trace.base, final: trace.final };
    });
    set({
      now: game.time.now(),
      wallet: game.wallet.snapshot(),
      // [M02] предметы — из инвентаря (каноническое хранилище, D17);
      // фолбэк — простой тайник ядра, если модуль не активен
      stash: invRows(game),
      // [M02.2] экипировка — для панели «Инвентарь» (D30: слот → запись)
      equipped: equippedRows(game),
      stats,
      buffs: game.buffs.list().map((e) => ({
        id: e.mod.id,
        stat: e.mod.stat,
        op: e.mod.op,
        value: e.mod.value,
        expiresAt: e.mod.expiresAt ?? null,
        tags: e.mod.tags ?? [],
        runs: e.mod.duration?.kind === 'runs',
      })),
      providers: game.statBus.providerIds(),
      pity: game.pity.entries(),
      counters: game.stats.snapshot(),
      tasks: game.tasks.list(),
      eventFeed: game.bus
        .recentEvents()
        // [FIX-0.1 B] фильтр отображения: без стены minuteTick (каждую секунду)
        .filter((e) => get().showTicks || e.name !== 'time.minuteTick')
        .slice(-MAX_FEED)
        .reverse()
        .map((e) => ({ name: e.name, payload: compact(e.payload), at: e.at })),
      rollLog: game.rngBus
        .rollLog()
        .list()
        .slice(-40)
        .reverse()
        .map((e) => ({ at: e.at, kind: e.kind, input: e.input, output: e.output, luck: e.luck })),
      saveInfo: game.save.info(),
      // [M01] игрок — только чтение снапшота (UI без игровой логики, П4)
      player: (game.modules.get('player')?.api['player.snapshot']?.() as PlayerSnapshot | undefined) ?? null,
      // [Фаза 3] витрины фермы/загона/квестов — те же вызовы publicApi, что
      // в консоли (farm.state / pen.state / quests list); null — модуль не активен
      farm: farmViewOf(game),
      pen: penViewOf(game),
      quests: questsViewOf(game),
      modulesInfo: modulesInfoOf(game),
    });
  };

  return {
    ready: false,
    bootMessage: null,
    lines: [],
    history: [],
    now: 0,
    showTicks: false,
    setShowTicks: (visible) => set({ showTicks: visible }),
    wallet: [],
    stash: [],
    equipped: [],
    stats: [],
    buffs: [],
    providers: [],
    pity: [],
    counters: [],
    tasks: [],
    eventFeed: [],
    rollLog: [],
    saveInfo: null,
    player: null,
    farm: null,
    pen: null,
    quests: null,
    modulesInfo: [],

    init: async () => {
      if (bootStarted) return;
      bootStarted = true;
      const game = getGame();

      // живая лента событий
      game.bus.subscribeAll(() => scheduleRefresh());
      game.time.onTick(() => set({ now: game.time.now() }));

      pushLine('title', 'КОРНИ И РУДА · фаза 3 — ядро + M01 Игрок + M02 Инвентарь + M03 Модфордж + M04 Магазин + M05 Ферма + M06 Загон + M09 Крафт + M10 Заточка + M15 Квесты');
      pushLine('info', 'шины: StatBus · EventBus · PriceBus · RngBus — активны');
      pushLine('info', 'сервисы: pity · транзакции · задачи · время · сейв — активны');
      pushLine('info', 'M01: энергия · HP · XP/уровень · навыки · счётчики — активен');
      pushLine('info', 'M02: инвентарь · качество · стаки · вкладки · экипировка — активен');
      pushLine('info', 'M03: ривен-генератор · бюджеты · роллы · рероллы — активен (mods list)');
      pushLine('info', 'M04: магазин · ротация дня · скидки · покупки · ветви — активен (shop.stock / shop.branch)');
      pushLine('info', 'M05: ферма · вкладки · улучшения · качество урожая — активна (farm.state)');
      pushLine('info', 'M06: загон · животные · болезни · разведение — активен (pen.state)');
      pushLine('info', 'M09: крафт · станции · рецепты · очереди · качество — активен (craft.list / craft.stations)');
      pushLine('info', 'M10: заточка · шансы/pity/откат · statScale — активен (forge.info / forge.stats)');
      pushLine('info', 'M15: квесты · ачивки · цепочки · флаги — активен (quests list)');
      pushLine('info', 'отладочные таблицы справа: ферма · загон · квесты — живые витрины модулей');

      const boot = await game.init();
      if (boot.fresh) {
        pushLine('ok', 'новая игра: выдан стартовый капитал 50 золота (kernel.newGame)');
      } else {
        pushLine('ok', 'сейв загружен — добро пожаловать обратно');
      }
      if (boot.offlineReport) {
        const r = boot.offlineReport;
        pushLine(
          'warn',
          `оффлайн-досчёт ${formatDuration(r.awayMs)}: hourTick ×${r.hoursFired}${r.hoursCapped ? ' (кап 72!)' : ''}, dayTick ×${r.daysFired}${r.daysCapped ? ' (кап 14!)' : ''}`,
        );
      }

      pushLine('out', '');
      pushLine('info', 'введите help — список команд · demo — экскурсия по ядру · selftest — приёмка фазы 0');

      set({ ready: true, bootMessage: boot.fresh ? 'новая игра' : 'сейв загружен' });
      refresh();

      // ходики для панели времени
      if (clockTimer === null) {
        clockTimer = setInterval(() => {
          if (get().ready) set({ now: getGame().time.now() });
        }, 1000);
      }
    },

    runCommand: (text) => {
      const input = text.trim();
      if (!input) return;
      pushLine('cmd', input);
      set((s) => ({ history: [...s.history.filter((h) => h !== input), input].slice(-100) }));
      executeCommand(input, {
        game: getGame(),
        print: (t) => pushLine('out', t),
        printOk: (t) => pushLine('ok', t),
        printErr: (t) => pushLine('err', t),
        printWarn: (t) => pushLine('warn', t),
        printTitle: (t) => pushLine('title', t),
        clear: () => get().clearConsole(),
        refresh: () => get().refresh(),
        // [FIX-0.1 B] фильтр ленты для команды events ticks on|off
        setTickFilter: (visible) => get().setShowTicks(visible),
        getTickFilter: () => get().showTicks,
      });
      refresh();
    },

    refresh,

    clearConsole: () => set({ lines: [] }),
  };
});

function compact(payload: unknown): string {
  try {
    const s = JSON.stringify(payload);
    return s.length > 140 ? `${s.slice(0, 140)}…` : s;
  } catch {
    return String(payload);
  }
}
