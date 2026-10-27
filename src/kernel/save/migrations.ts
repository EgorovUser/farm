/**
 * Миграции сейва (02-BUSES §11, 03-DATA §12).
 * Любое изменение схемы срезов = bump SAVE_VERSION + миграция в цепочке.
 * Миграция N→N+1 получает весь сейв ДО изменения, возвращает сейв ПОСЛЕ.
 */

export interface SaveFileShape {
  saveVersion: number;
  savedAt: number;
  saveId: string;
  contentVersion: string;
  modules: Record<string, unknown>;
  /** служебное: время последней сессии для оффлайн-досчёта */
  lastSeen: number;
}

export const SAVE_VERSION = 15;

export interface Migration {
  from: number;
  to: number;
  apply(data: Record<string, unknown>): Record<string, unknown>;
}

/**
 * v0 → v1: нормализация раннего формата (модули могли лежать в корне).
 * Нужна в том числе для self-checkа цепочки миграций.
 */
const migrate0to1: Migration = {
  from: 0,
  to: 1,
  apply(data) {
    const out: Record<string, unknown> = { ...data };
    if (!out.modules || typeof out.modules !== 'object') {
      out.modules = {};
      // переносим известные срезы ядра из корня, если вдруг там
      for (const key of ['kernel.wallet', 'kernel.stash', 'kernel.pity', 'kernel.stats', 'kernel.buff']) {
        if (key in out) {
          (out.modules as Record<string, unknown>)[key] = out[key];
          delete out[key];
        }
      }
    }
    if (typeof out.saveId !== 'string' || !out.saveId) out.saveId = 'migrated-unknown';
    if (typeof out.savedAt !== 'number') out.savedAt = 0;
    if (typeof out.lastSeen !== 'number') out.lastSeen = out.savedAt as number;
    if (typeof out.contentVersion !== 'string') out.contentVersion = '0';
    out.saveVersion = 1;
    return out;
  },
};

/**
 * v1 → v2 (FIX-0.1 H): срез kernel.clock { offsetMs } — смещение отладочных часов.
 * Сейвы v1 его не содержали (бафы в сдвинутом времени «жили» 605ч после F5):
 * миграция добавляет срез с нулевым смещением.
 */
const migrate1to2: Migration = {
  from: 1,
  to: 2,
  apply(data) {
    const out: Record<string, unknown> = { ...data };
    if (!out.modules || typeof out.modules !== 'object') out.modules = {};
    const modules = out.modules as Record<string, unknown>;
    if (!modules['kernel.clock'] || typeof modules['kernel.clock'] !== 'object') {
      modules['kernel.clock'] = { offsetMs: 0 };
    }
    out.saveVersion = 2;
    return out;
  },
};

/**
 * v2 → v3 (M01): срез player { energy, hp, xp, level, skills } — модуль игрока.
 * Миграция ничего не дописывает: новые срезы инициализируются дефолтами при
 * загрузке (SaveDirector.load: «отсутствующий срез = свежий модуль»), поэтому
 * смена версии — фиксация смены схемы сейва (02-BUSES §11: любое изменение
 * схемы = bump версии + миграция в цепочке).
 */
const migrate2to3: Migration = {
  from: 2,
  to: 3,
  apply(data) {
    const out: Record<string, unknown> = { ...data };
    out.saveVersion = 3;
    return out;
  },
};

/**
 * v3 → v4 (M02, D18): срез inventory { v, items, equipped, seq } — модуль
 * инвентаря. Содержимое kernel.stash конвертируется БЕЗ роллов: качество
 * { tier: 'D', value: 50 }, sharpeningLevel 0, rolledMods [] (детерминизм
 * миграции — D23). Предметный срез kernel.stash ПОГЛОЩАЕТСЯ конвертацией
 * (срезы не-предметов не трогаются); срез-регистрация SimpleStash в bootstrap
 * остаётся как фолбэк и пишет пустое состояние.
 *
 * [DECISION] Точная нарезка стаков по maxStack и «прочность полная у
 * носителей» (D18) — контент-осведомлённая нормализация ПРИ ЗАГРУЗКЕ
 * (game/modules/inventory/state.ts: слияние/нарезка/прочность): ядро контента
 * не читает (изоляция 01-CORE §5), а миграция оставляет записи честной формы.
 */
const migrate3to4: Migration = {
  from: 3,
  to: 4,
  apply(data) {
    const out: Record<string, unknown> = { ...data };
    const modules = (out.modules && typeof out.modules === 'object' ? out.modules : {}) as Record<
      string,
      unknown
    >;
    const stash = modules['kernel.stash'] as { items?: unknown } | undefined;
    const stashItems = Array.isArray(stash?.items) ? (stash!.items as unknown[]) : [];
    const items: Array<Record<string, unknown>> = [];
    let seq = 0;
    for (const entry of stashItems) {
      if (!Array.isArray(entry)) continue;
      const [defId, qty] = entry as [unknown, unknown];
      if (typeof defId !== 'string' || !defId) continue;
      if (typeof qty !== 'number' || !Number.isFinite(qty) || qty < 1) continue;
      seq += 1;
      items.push({
        iid: `${defId}#${seq}`,
        defId,
        qty: Math.floor(qty),
        quality: { tier: 'D', value: 50 },
        sharpeningLevel: 0,
        rolledMods: [],
      });
    }
    modules['inventory'] = { v: 1, items, equipped: {}, seq };
    delete modules['kernel.stash'];
    out.modules = modules;
    out.saveVersion = 4;
    return out;
  },
};

/**
 * v4 → v5 (M03): срез modforge { v, rerolls } — модуль ривен-генератора.
 * В v4 содержимого не было; реролл-состояние инициализируется дефолтом
 * при загрузке (SaveDirector: «отсутствующий срез = свежий модуль») —
 * миграция фиксирует смену схемы сейва (прецедент v2→v3 для player).
 */
const migrate4to5: Migration = {
  from: 4,
  to: 5,
  apply(data) {
    const out: Record<string, unknown> = { ...data };
    out.saveVersion = 5;
    return out;
  },
};

/**
 * v5 → v6 (M04): срез shop { v, level, xp, branches, stock } — модуль
 * магазина. В v5 содержимого не было; срез инициализируется дефолтом при
 * загрузке (SaveDirector: «отсутствующий срез = свежий модуль») — миграция
 * фиксирует смену схемы сейва (прецеденты v2→v3 player, v4→v5 modforge).
 */
const migrate5to6: Migration = {
  from: 5,
  to: 6,
  apply(data) {
    const out: Record<string, unknown> = { ...data };
    out.saveVersion = 6;
    return out;
  },
};

/**
 * v6 → v7 (M09): срез craft { v, stations, queues, ready, grantedEffects, seq }
 * — модуль крафта. В v6 содержимого не было; срез инициализируется дефолтом
 * при загрузке (SaveDirector: «отсутствующий срез = свежий модуль») — миграция
 * фиксирует смену схемы сейва (прецеденты v2→v3 player, v4→v5 modforge,
 * v5→v6 shop). Единственное kernel-касание M09 (санкционированное).
 */
const migrate6to7: Migration = {
  from: 6,
  to: 7,
  apply(data) {
    const out: Record<string, unknown> = { ...data };
    out.saveVersion = 7;
    return out;
  },
};

/**
 * v7 → v8 (M10.1): срез forge { v, sharpening, frozenCards, stations, seq }
 * — модуль заточки. В v7 содержимого не было; срез инициализируется дефолтом
 * при загрузке (SaveDirector: «отсутствующий срез = свежий модуль») — миграция
 * фиксирует смену схемы сейва (прецеденты v2→v3 player, v4→v5 modforge,
 * v5→v6 shop, v6→v7 craft). Единственное kernel-касание M10.1.
 */
const migrate7to8: Migration = {
  from: 7,
  to: 8,
  apply(data) {
    const out: Record<string, unknown> = { ...data };
    out.saveVersion = 8;
    return out;
  },
};

/**
 * v8 → v9 (M15): срез quests { v, daily, weekly, chains, achievements, flags }
 * — модуль квестов/ачивок. В v8 содержимого не было; срез инициализируется
 * дефолтом при загрузке (SaveDirector: «отсутствующий срез = свежий модуль»;
 * ролл дня навёрчивается ленивым quests.ensureDay при холодной загрузке —
 * прецедент shop.ensureStock) — миграция фиксирует смену схемы сейва
 * (прецеденты v2→v3, v4→v5, v5→v6, v6→v7, v7→v8). Единственное
 * kernel-касание M15.1.
 */
const migrate8to9: Migration = {
  from: 8,
  to: 9,
  apply(data) {
    const out: Record<string, unknown> = { ...data };
    out.saveVersion = 9;
    return out;
  },
};

/**
 * v9 → v10 (M05.1, F1 брифа): срез farm { v, tabs } — модуль фермы.
 * Миграция ДОБАВЛЯЕТ срез с дефолтным состоянием (вкладка «Поле», 16 тайлов
 * empty — чистые данные по 02 §11); если срез уже есть — не перезаписывается
 * (защита от повторного прогонa). Прежние срезы не трогаются; роллов в
 * миграции НЕТ (детерминизм; прецеденты D18/migrate8to9). Единственное
 * kernel-касание M05.1 по линии схемы (второе — save-director.ts F2).
 */
const migrate9to10: Migration = {
  from: 9,
  to: 10,
  apply(data) {
    const out: Record<string, unknown> = { ...data };
    const modules = (out.modules && typeof out.modules === 'object' ? out.modules : {}) as Record<
      string,
      unknown
    >;
    if (!modules['farm']) {
      // дефолт FarmState (modules/farm/state.ts) — снапшот схемы на момент v10
      modules['farm'] = {
        v: 1,
        tabs: [
          {
            id: 'field',
            kind: 'field',
            tiles: Array.from({ length: 16 }, (_, i) => ({ index: i, state: 'empty', weeds: 0 })),
          },
        ],
      };
    }
    out.modules = modules;
    out.saveVersion = 10;
    return out;
  },
};

/**
 * v10 → v11 (M06.1, F1 брифа): срез pen { v, animals, stock, overflow } —
 * модуль загона. Миграция ДОБАВЛЯЕТ срез с дефолтным состоянием (животных
 * нет: animals [], склад пуст, счётчик потерь пуст — чистые данные по
 * 02 §11; слоты базы 4 — данные PEN_TABLE, не сейва); если срез уже есть —
 * не перезаписывается (защита от повторного прогона; прецедент migrate9to10).
 * Прежние срезы не трогаются; роллов в миграции НЕТ (детерминизм;
 * прецеденты migrate9to10/migrate8to9). Единственное kernel-касание M06.1.
 */
const migrate10to11: Migration = {
  from: 10,
  to: 11,
  apply(data) {
    const out: Record<string, unknown> = { ...data };
    const modules = (out.modules && typeof out.modules === 'object' ? out.modules : {}) as Record<
      string,
      unknown
    >;
    if (!modules['pen']) {
      // дефолт PenState (modules/pen/state.ts) — снапшот схемы на момент v11
      modules['pen'] = { v: 1, animals: [], stock: {}, overflow: {} };
    }
    out.modules = modules;
    out.saveVersion = 11;
    return out;
  },
};

/**
 * v11 → v12 (M07.1, F1 брифа): срез fishing { v, location, album, stats } —
 * модуль рыбалки. Миграция ДОБАВЛЯЕТ срез с дефолтным состоянием (локация
 * «пруд», альбом пуст, статы забросов нули — чистые данные по 02 §11);
 * если срез уже есть — не перезаписывается (защита от повторного прогона;
 * прецеденты migrate9to10/migrate10to11). Прежние срезы не трогаются;
 * роллов в миграции НЕТ (детерминизм; прецеденты migrate10to11/migrate9to10).
 * Единственное kernel-касание M07.1.
 */
const migrate11to12: Migration = {
  from: 11,
  to: 12,
  apply(data) {
    const out: Record<string, unknown> = { ...data };
    const modules = (out.modules && typeof out.modules === 'object' ? out.modules : {}) as Record<
      string,
      unknown
    >;
    if (!modules['fishing']) {
      // дефолт FishState (modules/fishing/state.ts) — снапшот схемы на момент v12
      modules['fishing'] = {
        v: 1,
        location: 'pond',
        album: {},
        stats: { casts: 0, caught: 0 },
      };
    }
    out.modules = modules;
    out.saveVersion = 12;
    return out;
  },
};

/**
 * v12 → v13 (M08.1 · F1, бриф SESSION-M08.1 §3.6): добавляется срез `lake`
 * модуля озера — дефолт LakeState по канону 03-DATA §6 (карточка M08 §2):
 * слоты ×6 пустые, вода {temperature: 15, cleanliness: 70}, очередь икры
 * пуста, статы нули — чистые данные по 02 §11. Если срез уже есть — не
 * перезаписывается (защита от повторного прогона; прецеденты migrate10to11/
 * migrate11to12). Прежние срезы не трогаются; роллов в миграции НЕТ
 * (детерминизм). Единственное kernel-касание M08.1 (предписанное F1).
 */
const migrate12to13: Migration = {
  from: 12,
  to: 13,
  apply(data) {
    const out: Record<string, unknown> = { ...data };
    const modules = (out.modules && typeof out.modules === 'object' ? out.modules : {}) as Record<
      string,
      unknown
    >;
    if (!modules['lake']) {
      // дефолт LakeState (modules/lake/state.ts) — снапшот схемы на момент v13
      modules['lake'] = {
        v: 1,
        slots: [{ sick: false }, { sick: false }, { sick: false }, { sick: false }, { sick: false }, { sick: false }],
        water: { temperature: 15, cleanliness: 70 },
        roe: [],
        stats: { released: 0, bred: 0, harvested: 0 },
      };
    }
    out.modules = modules;
    out.saveVersion = 13;
    return out;
  },
};

/**
 * v13 → v14 (M11.1 · F1, бриф SESSION-M11 §1): добавляется срез `workers`
 * модуля работников — дефолт WorkersState по канону 03-DATA §10 (карточка
 * M11 §2): нанятых нет — hired []. Если срез уже есть — не перезаписывается
 * (защита от повторного прогона; прецеденты migrate11to12/migrate12to13).
 * Прежние срезы не трогаются; роллов в миграции НЕТ (детерминизм —
 * доска переролливается dailySeed на лету, НЕ миграцией). Единственное
 * kernel-касание M11.1 (санкция брифа: ПЕРВАЯ kernel-правка после трёх
 * полных заморозок M06.2/M07.2/M08.2).
 */
const migrate13to14: Migration = {
  from: 13,
  to: 14,
  apply(data) {
    const out: Record<string, unknown> = { ...data };
    const modules = (out.modules && typeof out.modules === 'object' ? out.modules : {}) as Record<
      string,
      unknown
    >;
    if (!modules['workers']) {
      // дефолт WorkersState (modules/workers/state.ts) — снапшот схемы v14
      modules['workers'] = { v: 1, hired: [] };
    }
    out.modules = modules;
    out.saveVersion = 14;
    return out;
  },
};

/**
 * v14 → v15 (M12.1 · F1, бриф SESSION-M12.1 §1): добавляется срез `mine`
 * модуля шахты — дефолт MineState по [DECISION] брифа §0: { v: 1, stats:
 * { fights: 0, kills: 0, bossKills: 0, deaths: 0 } } — счётчики витрины/
 * ачивок M12.2. Слой НЕ персистится (достижение слоя = ачивка-флаг M15
 * при гейте M12.2); контейнер MineRun/runBag — канон 03-DATA §7, домен
 * M13, в срез НЕ тащится. Если срез уже есть — не перезаписывается (защита
 * от повторного прогона; прецеденты migrate13to14/migrate12to13). Прежние
 * срезы не трогаются; роллов в миграции НЕТ (детерминизм). Единственное
 * kernel-касание M12.1 (санкция брифа: вторая kernel-правка проекта
 * после M11.1; все прочие файлы ядра — заморозка).
 */
const migrate14to15: Migration = {
  from: 14,
  to: 15,
  apply(data) {
    const out: Record<string, unknown> = { ...data };
    const modules = (out.modules && typeof out.modules === 'object' ? out.modules : {}) as Record<
      string,
      unknown
    >;
    if (!modules['mine']) {
      // дефолт MineState (modules/mine/state.ts) — снапшот схемы на момент v15
      modules['mine'] = { v: 1, stats: { fights: 0, kills: 0, bossKills: 0, deaths: 0 } };
    }
    out.modules = modules;
    out.saveVersion = 15;
    return out;
  },
};

export const MIGRATIONS: readonly Migration[] = [migrate0to1, migrate1to2, migrate2to3, migrate3to4, migrate4to5, migrate5to6, migrate6to7, migrate7to8, migrate8to9, migrate9to10, migrate10to11, migrate11to12, migrate12to13, migrate13to14, migrate14to15];

/** Прогнать сейв по цепочке миграций до текущей версии */
export function migrateSaveData(raw: Record<string, unknown>): { data: SaveFileShape; steps: number } {
  let version = typeof raw.saveVersion === 'number' ? raw.saveVersion : 0;
  if (version > SAVE_VERSION) {
    throw new Error(
      `[Save] сейв версии ${version} новее ядра (${SAVE_VERSION}) — откат сейвов запрещён`,
    );
  }
  let data = raw;
  let steps = 0;
  while (version < SAVE_VERSION) {
    const migration = MIGRATIONS.find((m) => m.from === version);
    if (!migration) {
      throw new Error(`[Save] нет миграции с версии ${version} (цель ${SAVE_VERSION})`);
    }
    data = migration.apply(data);
    version = migration.to;
    steps++;
  }
  return { data: data as unknown as SaveFileShape, steps };
}
