/**
 * SavePanic — синхронный last-resort-снимок выгрузки страницы (02-BUSES §11).
 *
 * [MEL-H · M05.2] перенос panic-механики ЦЕЛИКОМ из save-director.ts
 * (жёлтый флаг 01 §6: 362 строки при касании M05.1) БЕЗ изменения поведения:
 * директор сохраняет оркестрацию (гвард wiped, автосейв 30с/visibilitychange/
 * pagehide-подключение, миграции), здесь — только механика снимка.
 *
 * Факты M05.1 (живые пробы приёмки, канон): выгрузка страницы (F5/закрытие)
 * убивает IndexedDB-транзакции, начатые в pagehide, а localStorage пишется
 * синхронно и переживает unload — pagehide дублирует сейв сюда; load берёт
 * снимок, только если он СВЕЖЕЕ основной записи (savedAt строго больше);
 * битый/старый снимок игнорируется; wipe чистит ключ (иначе пережившая
 * выгрузку копия воскресила бы старую игру — пост-wipe тишина MISS-1).
 *
 * DI-изоляция (прецедент 6fa49d5): хранилище — ТОЛЬКО явная инъекция
 * (прод подключает window.localStorage в bootstrap). Неявного window-фолбэка
 * НЕТ: roundtrip-фикстуры self-checkов на MemoryStorage не должны видеть
 * реальный panic-снимок живой страницы (он «свежее» фикстуры по savedAt —
 * было 6 красных только в браузерном selftest).
 */

/** синхронный last-resort-ключ: переживает unload там, где IDB — нет */
export const PANIC_KEY = 'koreni-ruda:pagehide';

/** контракт localStorage-подобного хранилища (прод — window.localStorage; чеки — фейк) */
export interface PanicStore {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

export interface SavePanicDeps {
  /** отсутствует = механика отключена (headless/чеки на MemoryStorage) */
  store?: PanicStore;
}

export class SavePanic {
  private readonly store: PanicStore | null;

  constructor(deps: SavePanicDeps = {}) {
    this.store = deps.store ?? null;
  }

  /** синхронный снимок unload-пути (квота/приватный режим — лучшее усилие:
   *  основная асинхронная запись уже пошла, отказ снимка не отменяет её) */
  write(json: string): void {
    if (!this.store) return;
    try {
      this.store.setItem(PANIC_KEY, json);
    } catch {
      // лучшее усилие
    }
  }

  /** чистка при wipe(): снимок умирает вместе с сейвом */
  clear(): void {
    if (!this.store) return;
    try {
      this.store.removeItem(PANIC_KEY);
    } catch {
      // лучшее усилие
    }
  }

  /**
   * load-приоритет: вернуть panic-снимок, если он СВЕЖЕЕ основной записи
   * (savedAt строго больше); битый JSON снимка или старый снимок — работать
   * по основной записи (try/catch → тишина, не краш загрузки).
   */
  pickFreshest(mainJson: string | null): string | null {
    const snap = this.read();
    if (snap === null) return mainJson;
    try {
      const p = JSON.parse(snap) as { savedAt?: unknown };
      const m = mainJson ? (JSON.parse(mainJson) as { savedAt?: unknown }) : null;
      const pAt = typeof p.savedAt === 'number' ? p.savedAt : -1;
      const mAt = m && typeof m.savedAt === 'number' ? m.savedAt : -1;
      return pAt > mAt ? snap : mainJson;
    } catch {
      // битый снимок — работаем по основной записи
      return mainJson;
    }
  }

  private read(): string | null {
    if (!this.store) return null;
    try {
      return this.store.getItem(PANIC_KEY);
    } catch {
      return null;
    }
  }
}
