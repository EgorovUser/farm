/**
 * SaveDirector — сейв (02-BUSES §11).
 * Формат: { saveVersion, savedAt, saveId, contentVersion, modules: {stateKey: data} }.
 * Каждый модуль сериализует ТОЛЬКО свой срез чистыми данными.
 * Автосейв раз в 30 с + на visibilitychange. Экспорт/импорт JSON.
 * [РАСШИРЕНИЕ] Поля `contentVersion` и `lastSeen` сверх формата §11 (версионирование
 * контента 03-DATA §12 и оффлайн-досчёт 02-BUSES §8).
 */
import type { EventBus } from '@/kernel/bus/event-bus/event-bus';
import { MIGRATIONS, SAVE_VERSION, migrateSaveData, type SaveFileShape } from './migrations';
import type { SaveStorage } from './storage-drivers';
import { SavePanic, type PanicStore } from './save-panic';

export interface SaveSlice {
  save(): unknown;
  load(data: unknown): void;
}

export interface SaveInfo {
  saveVersion: number;
  saveId: string;
  contentVersion: string;
  savedAt: number;
  lastSeen: number;
  slices: string[];
  storageKind: string;
  dirty: boolean;
}

export interface SaveDirectorDeps {
  storage: SaveStorage;
  bus: EventBus;
  now(): number;
  contentVersion: string;
  autosaveMs: number;
  /** [M05.1 · F2 · self-check] точка подвеса pagehide: прод — window
   * (реальная выгрузка диспатчит событие туда); чеки — фейк (подмена
   * глобалов в чеках вешала живую страницу — прецедент 6fa49d5). */
  pagehideTarget?: { addEventListener(type: string, handler: () => void): void; removeEventListener(type: string, handler: () => void): void };
  /** [M05.1 · F2 · self-check] panic-хранилище: прод — window.localStorage;
   * чеки — фейк (механика — save-panic.ts, MEL-H · M05.2). */
  panicStore?: PanicStore;
}

const MAIN_KEY = 'main';

export class SaveDirector {
  private readonly storage: SaveStorage;
  private readonly bus: EventBus;
  private readonly now: () => number;
  private readonly contentVersion: string;
  private readonly autosaveMs: number;
  private readonly pagehideTarget: SaveDirectorDeps['pagehideTarget'];
  /** [MEL-H · M05.2] механика снимка — save-panic.ts; директор — оркестрация */
  private readonly panic: SavePanic;

  private readonly slices = new Map<string, SaveSlice>();
  private saveId: string;
  private savedAt = 0;
  private lastSeen = 0;
  private dirty = false;
  private autosaveTimer: ReturnType<typeof setInterval> | null = null;
  private visibilityHandler: (() => void) | null = null;
  // [M05.1 · F2 · MEL-B] pagehide — выгрузка (F5/закрытие) пишет сейв
  // СИММЕТРИЧНО visibilitychange; триггеров три — гвард один (MISS-1).
  private pagehideHandler: (() => void) | null = null;
  private saving: Promise<void> = Promise.resolve();
  // [MISS-1 · FIX-PHASE-2] флаг «post-wipe»: до перезагрузки НИ ОДИН
  // автосейв не имеет права записать СТАРОЕ состояние под НОВЫМ saveId
  private wiped = false;

  constructor(deps: SaveDirectorDeps) {
    this.storage = deps.storage;
    this.bus = deps.bus;
    this.now = deps.now;
    this.contentVersion = deps.contentVersion;
    this.autosaveMs = deps.autosaveMs;
    this.pagehideTarget = deps.pagehideTarget;
    this.panic = new SavePanic({ store: deps.panicStore });
    this.saveId = generateSaveId();
  }

  /** Срез модуля/сервиса. stateKey уникален (манифесты это гарантируют). */
  registerSlice(stateKey: string, slice: SaveSlice): void {
    if (this.slices.has(stateKey)) {
      throw new Error(`[Save] срез "${stateKey}" уже зарегистрирован`);
    }
    this.slices.set(stateKey, slice);
  }

  getSaveId(): string {
    return this.saveId;
  }

  markDirty(): void {
    this.dirty = true;
  }

  /** Собрать файл сейва (без записи) */
  buildFile(): SaveFileShape {
    const modules: Record<string, unknown> = {};
    for (const [key, slice] of this.slices) {
      modules[key] = slice.save();
    }
    return {
      saveVersion: SAVE_VERSION,
      savedAt: this.now(),
      saveId: this.saveId,
      contentVersion: this.contentVersion,
      modules,
      lastSeen: this.now(),
    };
  }

  /** Записать сейв в хранилище */
  async save(): Promise<void> {
    // [MISS-1 · FIX-PHASE-2] после wipe() — тишина до перезагрузки: единая точка
    // запрета для интервального, visibility и ручного путей (все сходятся сюда)
    if (this.wiped) return;
    // сериализация срезов синхронна — гонок между сейвами нет
    const file = this.buildFile();
    const json = JSON.stringify(file);
    this.saving = this.storage.set(MAIN_KEY, json).then(() => {
      this.savedAt = file.savedAt;
      this.lastSeen = file.lastSeen;
      this.dirty = false;
    });
    return this.saving;
  }

  /** [M05.1 · F2 · MEL-B] сейв на выгрузку: асинхронная запись в основное
   * хранилище (может не успеть) + СИНХРОННЫЙ panic-снимок (save-panic.ts);
   * гвард один со save() — после wipe выгрузка тоже молчит (MISS-1 цел). */
  private saveOnUnload(): void {
    if (this.wiped) return;
    const file = this.buildFile();
    const json = JSON.stringify(file);
    void this.storage.set(MAIN_KEY, json).then(() => {
      this.savedAt = file.savedAt;
      this.lastSeen = file.lastSeen;
      this.dirty = false;
    });
    this.panic.write(json);
  }

  /**
   * Загрузить сейв: прочитать → мигрировать → раздать срезы.
   * Возвращает инфо для оффлайн-досчёта (lastSeen) или null, если сейва нет.
   */
  async load(): Promise<SaveFileShape | null> {
    let json = await this.storage.get(MAIN_KEY);
    // [M05.1 · F2 · MEL-B] panic-снимок мог пережить выгрузку там, где
    // IDB-запись pagehide не успела: берём снимок, если он СВЕЖЕЕ основной
    // записи; битый/старый игнорируется (механика — save-panic.ts, MEL-H)
    json = this.panic.pickFreshest(json);
    if (!json) return null;
    try {
      const parsed = JSON.parse(json) as Record<string, unknown>;
      const { data } = migrateSaveData(parsed);
      if (typeof data.saveId === 'string' && data.saveId) this.saveId = data.saveId;
      this.savedAt = data.savedAt ?? 0;
      this.lastSeen = data.lastSeen ?? data.savedAt ?? 0;
      const modules = data.modules ?? {};
      for (const [key, slice] of this.slices) {
        // отсутствующий срез = свежий модуль: он остаётся в дефолте
        if (key in modules) slice.load(modules[key]);
      }
      this.dirty = false;
      return data;
    } catch (e) {
      // битый сейв не должен ронять игру — стартуем с чистого состояния
       
      console.error('[Save] не удалось разобрать сейв, старт с чистого листа:', e);
      return null;
    }
  }

  /**
   * Полный сброс (новая saveId — ротации дня перероллятся честно).
   * [MISS-1 · FIX-PHASE-2] [DECISION] вариант «post-wipe флаг» (НЕ полный сброс
   * срезов): семантика новой игры (стартовый капитал, kernel.newGame) живёт в
   * bootstrap-слое, ядро её не знает — поэтому вайп = «обязателен reload»,
   * а до reload автосейв останавливается и сейвы молчат (см. save()).
   */
  async wipe(): Promise<void> {
    await this.storage.remove(MAIN_KEY);
    // [M05.1 · F2 · MEL-B] panic-снимок умирает вместе с сейвом: иначе
    // переживший выгрузку localStorage-снимок воскресил бы старую игру
    this.panic.clear();
    this.saveId = generateSaveId();
    this.savedAt = 0;
    this.lastSeen = this.now();
    this.dirty = false;
    this.wiped = true;
    this.stopAutosave();
  }

  /** [MISS-1 · FIX-PHASE-2] витрина: честный `save now` после вайпа */
  isWiped(): boolean {
    return this.wiped;
  }

  getLastSeen(): number {
    return this.lastSeen;
  }

  /** Автосейв: интервал + visibilitychange (02-BUSES §11) */
  startAutosave(): void {
    this.stopAutosave();
    this.autosaveTimer = setInterval(() => {
      void this.save();
    }, this.autosaveMs);
    if (typeof document !== 'undefined') {
      this.visibilityHandler = () => {
        if (document.visibilityState === 'hidden') void this.save();
      };
      document.addEventListener('visibilitychange', this.visibilityHandler);
    }
    // [M05.1 · F2 · MEL-B] pagehide: точка подвеса — ТОЛЬКО DI (прод —
    // window, передаётся bootstrap'ом явно; чеки — фейк или ничего).
    // Слушатель на WINDOW: реальная выгрузка (F5/закрытие) диспатчит событие
    // на window, document-подписчик его НЕ получает (живой факт приёмки:
    // маркеры doc=no / win=FIRED при reload). Неявный window-фолбэк убран —
    // та же изоляция, что у panic-хранилища (чеки не должны зависеть от
    // глобалов живой страницы).
    if (this.pagehideTarget) {
      this.pagehideHandler = () => {
        this.saveOnUnload();
      };
      this.pagehideTarget.addEventListener('pagehide', this.pagehideHandler);
    }
  }

  stopAutosave(): void {
    if (this.autosaveTimer !== null) {
      clearInterval(this.autosaveTimer);
      this.autosaveTimer = null;
    }
    if (this.visibilityHandler !== null && typeof document !== 'undefined') {
      document.removeEventListener('visibilitychange', this.visibilityHandler);
      this.visibilityHandler = null;
    }
    if (this.pagehideHandler !== null && this.pagehideTarget) {
      this.pagehideTarget.removeEventListener('pagehide', this.pagehideHandler);
      this.pagehideHandler = null;
    }
  }

  info(): SaveInfo {
    return {
      saveVersion: SAVE_VERSION,
      saveId: this.saveId,
      contentVersion: this.contentVersion,
      savedAt: this.savedAt,
      lastSeen: this.lastSeen,
      slices: [...this.slices.keys()].sort(),
      storageKind: this.storage.kind,
      dirty: this.dirty,
    };
  }

  exportJson(): string {
    return JSON.stringify(this.buildFile(), null, 2);
  }

  /** Импорт JSON: мигрируем и раздаём срезам; битый файл — отказ */
  async importJson(json: string): Promise<SaveFileShape> {
    const parsed = JSON.parse(json) as Record<string, unknown>;
    const { data } = migrateSaveData(parsed);
    if (typeof data.saveId === 'string' && data.saveId) this.saveId = data.saveId;
    this.savedAt = data.savedAt ?? 0;
    this.lastSeen = data.lastSeen ?? data.savedAt ?? 0;
    const modules = data.modules ?? {};
    for (const [key, slice] of this.slices) {
      if (key in modules) slice.load(modules[key]);
    }
    // [MISS-1 · FIX-PHASE-2] импорт = осознанная загрузка состояния: сейвы
    // оживают (снимает post-wipe тишину, если импорт сделали после вайпа)
    this.wiped = false;
    this.startAutosave();
    await this.save();
    this.bus.publish('invalidate.stat', {});
    return data;
  }

  /** Сколько миграций в цепочке (для self-check) */
  static migrationsCount(): number {
    return MIGRATIONS.length;
  }
}

function generateSaveId(): string {
  // без внешних зависимостей: crypto.randomUUID или fallback
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `save-${Date.now().toString(36)}-${Math.floor(Math.random() * 1e9).toString(36)}`;
}
