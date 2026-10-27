/**
 * Драйверы хранения сейва (02-BUSES §11: IndexedDB + экспорт/импорт JSON).
 * Выбор: IndexedDB → localStorage → память (по доступности в рантайме).
 */

export interface SaveStorage {
  readonly kind: 'indexeddb' | 'localstorage' | 'memory';
  get(key: string): Promise<string | null>;
  set(key: string, json: string): Promise<void>;
  remove(key: string): Promise<void>;
}

export class MemoryStorage implements SaveStorage {
  readonly kind = 'memory' as const;
  private readonly map = new Map<string, string>();

  async get(key: string): Promise<string | null> {
    return this.map.get(key) ?? null;
  }

  async set(key: string, json: string): Promise<void> {
    this.map.set(key, json);
  }

  async remove(key: string): Promise<void> {
    this.map.delete(key);
  }
}

export class LocalStorageDriver implements SaveStorage {
  readonly kind = 'localstorage' as const;
  private readonly prefix: string;

  constructor(prefix = 'koreni-ruda:') {
    this.prefix = prefix;
  }

  async get(key: string): Promise<string | null> {
    try {
      return window.localStorage.getItem(this.prefix + key);
    } catch {
      return null;
    }
  }

  async set(key: string, json: string): Promise<void> {
    try {
      window.localStorage.setItem(this.prefix + key, json);
    } catch {
      // квота/приватный режим — сейв в памяти продолжает работать
    }
  }

  async remove(key: string): Promise<void> {
    try {
      window.localStorage.removeItem(this.prefix + key);
    } catch {
      // игнорируем
    }
  }
}

const DB_NAME = 'koreni-ruda';
const STORE = 'saves';

export class IndexedDbDriver implements SaveStorage {
  readonly kind = 'indexeddb' as const;
  private db: IDBDatabase | null = null;

  private open(): Promise<IDBDatabase> {
    if (this.db) return Promise.resolve(this.db);
    return new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, 1);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE);
      };
      req.onsuccess = () => {
        this.db = req.result;
        resolve(req.result);
      };
      req.onerror = () => reject(req.error ?? new Error('IndexedDB open failed'));
    });
  }

  private tx(mode: IDBTransactionMode): Promise<IDBObjectStore> {
    return this.open().then((db) => db.transaction(STORE, mode).objectStore(STORE));
  }

  async get(key: string): Promise<string | null> {
    try {
      const store = await this.tx('readonly');
      return await new Promise<string | null>((resolve, reject) => {
        const req = store.get(key);
        req.onsuccess = () => resolve((req.result as string | undefined) ?? null);
        req.onerror = () => reject(req.error);
      });
    } catch {
      return null;
    }
  }

  async set(key: string, json: string): Promise<void> {
    try {
      const store = await this.tx('readwrite');
      await new Promise<void>((resolve, reject) => {
        const req = store.put(json, key);
        req.onsuccess = () => resolve();
        req.onerror = () => reject(req.error);
      });
    } catch {
      // тихо деградируем — слой выше может переключиться на другой драйвер
      throw new Error('IndexedDB write failed');
    }
  }

  async remove(key: string): Promise<void> {
    try {
      const store = await this.tx('readwrite');
      await new Promise<void>((resolve, reject) => {
        const req = store.delete(key);
        req.onsuccess = () => resolve();
        req.onerror = () => reject(req.error);
      });
    } catch {
      // игнорируем
    }
  }
}

/** Выбор драйвера по среде выполнения */
export function createStorage(): SaveStorage {
  if (typeof indexedDB !== 'undefined') return new IndexedDbDriver();
  if (typeof window !== 'undefined' && window.localStorage) return new LocalStorageDriver();
  return new MemoryStorage();
}
