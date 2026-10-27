/**
 * Self-checks времени и сейва (02-BUSES §13.6, §13.7).
 * catchUp: фиксированные даты через ManualClock (DI-подмена now()).
 * Сейв: roundtrip + миграция версии N → N+1.
 */
import { EventBus } from '@/kernel/bus/event-bus/event-bus';
import { DebugClock, ManualClock } from '@/kernel/di/clock';
import { OfflineCatchup } from '@/kernel/time/offline-catchup';
import { TIME_TABLE } from '@/content/balance/time';
import { createGame } from '@/game/bootstrap';
import { MemoryStorage } from '@/kernel/save/storage-drivers';
import { MIGRATIONS, SAVE_VERSION, migrateSaveData } from '@/kernel/save/migrations';
import { SaveDirector } from '@/kernel/save/save-director';
import { check, group, type CheckGroup, type CheckResult } from './types';
import { MS_HOUR } from '@/shared/utils/math';

const HOUR = MS_HOUR;
/** 1 января 2024, 12:00 локального времени */
function noonOn(day: number): number {
  return new Date(2024, 0, day, 12, 0, 0, 0).getTime();
}

export function runCatchUpChecks(): CheckGroup {
  const results: CheckResult[] = [];
  const bus = new EventBus();
  const catchUp = new OfflineCatchup(bus, TIME_TABLE);

  let hourTicks = 0;
  let dayTicks = 0;
  let catchUpFlags = 0;
  bus.subscribe('time.hourTick', (p) => {
    hourTicks++;
    if ((p as { catchUp?: boolean }).catchUp) catchUpFlags++;
  });
  bus.subscribe('time.dayTick', () => dayTicks++);

  // 5 часов оффлайна → ровно 5 hourTick, 0 dayTick
  hourTicks = 0;
  dayTicks = 0;
  catchUpFlags = 0;
  const report5 = catchUp.run(noonOn(1), noonOn(1) + 5 * HOUR);
  results.push(check('5 часов → 5 hourTick', () => hourTicks === 5 && report5.hoursFired === 5));
  results.push(check('5 часов → 0 dayTick', () => dayTicks === 0 && report5.daysFired === 0));
  results.push(check('все события помечены catchUp: true', () => catchUpFlags === 5));

  // через 2 полуночи → 2 dayTick + 48 hourTick
  hourTicks = 0;
  dayTicks = 0;
  const report2d = catchUp.run(noonOn(1), noonOn(3));
  results.push(check('2 суток → 48 hourTick', () => hourTicks === 48 && report2d.hoursFired === 48));
  results.push(check('2 суток → 2 dayTick (локальные полуночи)', () => dayTicks === 2 && report2d.daysFired === 2));
  results.push(check('отчёт считает пропущенные минутные тики', () => report2d.minuteTicksSkipped === 48 * 3600));

  // кап 72 часа
  hourTicks = 0;
  const report100 = catchUp.run(noonOn(1), noonOn(1) + 100 * HOUR);
  results.push(
    check('100 часов → кап 72 hourTick', () => hourTicks === 72 && report100.hoursCapped && report100.hoursNeeded === 100),
  );

  // защита от отмотки часов
  hourTicks = 0;
  dayTicks = 0;
  const reportBack = catchUp.run(noonOn(3), noonOn(1));
  results.push(
    check('отмотка часов: 0 событий, awayMs = 0', () => hourTicks === 0 && dayTicks === 0 && reportBack.awayMs === 0),
  );

  // событие time.catchUpDone публикуется
  let done = 0;
  bus.subscribe('time.catchUpDone', () => done++);
  catchUp.run(noonOn(1), noonOn(1) + 2 * HOUR);
  results.push(check('time.catchUpDone опубликовано', () => done === 1));

  return group('OfflineCatchup (§13.6)', results);
}

export async function runSaveChecks(): Promise<CheckGroup> {
  const results: CheckResult[] = [];

  // --- миграция v0 → v1
  const legacy = {
    saveVersion: 0,
    saveId: 'legacy-save',
    savedAt: 1_700_000_000_000,
    contentVersion: '0.0.1',
    // ранний формат: срезы ядра лежали в корне
    'kernel.wallet': { balances: [['gold', 33]] },
    'kernel.stats': { counters: [['kernel.transactions.total', 2]] },
  };
  const migrated = migrateSaveData(legacy as unknown as Record<string, unknown>);
  // [M09 · v7] цепочка 0→1→2→…→15 — 15 шагов (срезы craft/forge/quests/farm/pen/fishing/workers/mine) [M10.1 · v8][M15 · v9][M05.1 · v10][M06.1 · v11][M07.1 · v12 — легализация поимённо, прецедент M05.1][M08 · v13][M11 · v14 — срез workers][M12.1 · v15 — срез mine]
  results.push(check('миграция 0→15 (цепочка): версия поднята, 15 шагов [M12.1 · v15]', () => migrated.data.saveVersion === 15 && migrated.steps === 15));
  results.push(
    check('миграция 0→1: срезы переехали в modules', () => {
      const modules = migrated.data.modules as Record<string, unknown>;
      return modules['kernel.wallet'] !== undefined && modules['kernel.stats'] !== undefined;
    }),
  );

  // версия из будущего — явная ошибка, не молчаливое «сойдёт»
  let threw = false;
  try {
    migrateSaveData({ saveVersion: 99, modules: {} });
  } catch {
    threw = true;
  }
  results.push(check('версия из будущего → явная ошибка миграции', () => threw));

  // [FIX-0.1 H] миграция v1 → v2: срез kernel.clock добавляется
  const v1 = {
    saveVersion: 1,
    saveId: 'v1-save',
    savedAt: 1_700_000_000_000,
    contentVersion: '0.0.9',
    modules: { 'kernel.wallet': { balances: [['gold', 5]] } },
    lastSeen: 1_700_000_000_000,
  };
  const m12 = migrateSaveData(v1);
  const clockSlice = (m12.data.modules as Record<string, unknown>)['kernel.clock'] as { offsetMs?: number } | undefined;
  results.push(
    // [M10.1 · v8] цепочка удлинилась: 1→2→…→15 — 14 шагов [M15 · v9][M05.1 · v10][M06.1 · v11][M07.1 · v12][M08 · v13][M11 · v14][M12.1 · v15]
    check('миграция 1→15: kernel.clock { offsetMs: 0 } добавлен [M12.1 · v15]', () =>
      m12.data.saveVersion === 15 && m12.steps === 14 && clockSlice?.offsetMs === 0),
  );

  // [M01] миграция v2 → v3: срез player инициализируется дефолтом при загрузке
  // (SaveDirector: «отсутствующий срез = свежий модуль») — миграция только
  // фиксирует смену схемы
  const v2 = {
    saveVersion: 2,
    saveId: 'v2-save',
    savedAt: 1_700_000_000_000,
    contentVersion: '0.1.0-phase0',
    modules: { 'kernel.wallet': { balances: [['gold', 5]] } },
    lastSeen: 1_700_000_000_000,
  };
  const m23 = migrateSaveData(v2);
  results.push(
    // [M09 · v7] срезы не-предметов не тронуты (стэш конвертируется в inventory)
    check('миграция 2→15: версия поднята, срезы не тронуты [M12.1 · v15]', () =>
      m23.data.saveVersion === 15 && m23.steps === 13 && (m23.data.modules as Record<string, unknown>)['kernel.wallet'] !== undefined),
  );

  // инвариант цепочки
  const lastTo = MIGRATIONS[MIGRATIONS.length - 1]?.to ?? 0;
  results.push(check('SAVE_VERSION = цель последней миграции', () => SAVE_VERSION === lastTo));

  // --- полный roundtrip через два экземпляра игры
  const storage = new MemoryStorage();
  const clock = new ManualClock(noonOn(1));

  const g1 = createGame(clock, storage);
  g1.wallet.grant('gold', 77);
  g1.stash.add('turnip', 5);
  g1.pity.bump('player', 'forge.fail', 4);
  g1.stats.bump('kernel.transactions.total', 3);
  await g1.save.save();

  const g2 = createGame(clock, storage);
  await g2.init();

  results.push(
    check('roundtrip: кошелёк восстановлен', () => g2.wallet.get('gold') === 77, {
      expected: '77',
      actual: String(g2.wallet.get('gold')),
    }),
  );
  results.push(check('roundtrip: инвентарь восстановлен', () => g2.stash.count('turnip') === 5));
  results.push(check('roundtrip: pity восстановлен', () => g2.pity.get('player', 'forge.fail') === 4));
  results.push(check('roundtrip: счётчики восстановлены', () => g2.stats.get('kernel.transactions.total') === 3));
  results.push(check('roundtrip: saveId сохранён', () => g2.save.getSaveId() === g1.save.getSaveId()));

  // вторая загрузка после изменений
  g1.wallet.grant('gold', 1);
  await g1.save.save();
  await g2.save.load();
  results.push(check('повторная загрузка подтягивает изменения', () => g2.wallet.get('gold') === 78));

  // экспорт/импорт JSON
  const json = g1.save.exportJson();
  const g3 = createGame(clock, storage);
  await g3.save.importJson(json);
  results.push(check('экспорт/импорт JSON: кошелёк на месте', () => g3.wallet.get('gold') === 78));

  // [FIX-0.1 H] offset DebugClock переживает save/load: `time +5h` + баф 10м + F5
  // раньше давали «осталось 605ч» (offset не сохранялся, expiresAt — из сдвинутого времени)
  const storageH = new MemoryStorage();
  const clockA = new DebugClock();
  clockA.advance(5 * HOUR);
  const ga = createGame(clockA, storageH);
  ga.buffs.add(
    {
      id: 'h.demo',
      source: { kind: 'buff', refId: 'selfcheck' },
      stat: 'demo.attack',
      op: 'flat',
      value: 1,
      duration: { kind: 'seconds', value: 600 },
    },
    clockA.now(),
  );
  await ga.save.save();
  ga.dispose();

  const clockB = new DebugClock(); // новый рантайм: offset = 0 до загрузки среза
  const gb = createGame(clockB, storageH);
  await gb.init();
  const buffB = gb.buffs.get('h.demo');
  const leftMs = buffB ? buffB.mod.expiresAt! - gb.time.now() : -1;
  results.push(
    check('offset в сейве: баф 10м после F5 жив и «осталось» ≤ 10м', () =>
      buffB !== undefined && leftMs > 0 && leftMs <= 10 * 60_000, {
      expected: '0 < осталось ≤ 600000мс',
      actual: `${leftMs}мс`,
    }),
  );
  results.push(
    check('offset в сейве: смещение часов восстановлено (5ч)', () => clockB.offset === 5 * HOUR),
  );
  gb.dispose();

  // [FIX-PHASE-2 · MISS-1 AUDIT-M15] гонка wipe ↔ автосейв: после вайпа
  // принудительный сейв (интервальный тик/visibility/прямой вызов — все пути
  // сходят в save()) НЕ пишет старое состояние под новым saveId — reload
  // обязан дать честную новую игру, а не «загруженный сейв»-наследник
  const storageW = new MemoryStorage();
  const clockW = new ManualClock(noonOn(1));
  const gw = createGame(clockW, storageW);
  gw.wallet.grant('gold', 777);
  await gw.save.save();
  const jsonBeforeWipe = gw.save.exportJson();
  await gw.save.wipe();
  await gw.save.save(); // «интервальный тик после вайпа» — тот же кодовый путь
  const gw2 = createGame(clockW, storageW);
  const loaded2 = await gw2.init();
  results.push(
    check('wipe: сейв после вайпа молчит (гонка MISS-1 закрыта)', () => loaded2.fresh && gw2.wallet.get('gold') === 50 && gw2.save.getSaveId() !== gw.save.getSaveId(), {
      expected: 'новая игра: fresh, 50 золота (стартовый капитал), НОВЫЙ saveId',
      actual: `fresh=${String(loaded2.fresh)}, gold=${String(gw2.wallet.get('gold'))}`,
    }),
  );
  // импорт после вайпа оживляет сейвы (снимает post-wipe тишину)
  await gw2.save.importJson(jsonBeforeWipe);
  results.push(
    check('wipe: импорт JSON после вайпа оживляет сейвы', () => !gw2.save.isWiped() && gw2.wallet.get('gold') === 777),
  );
  gw.dispose();
  gw2.dispose();

  // [M05.1 · F2 · MEL-B — закрытие carried-находки AUDIT-FIX-PHASE-2 §8]
  // pagehide-сейв: выгрузка страницы (F5/закрытие) пишет сейв + СИНХРОННЫЙ
  // panic-снимок (localStorage переживает unload — IndexedDB-транзакция из
  // pagehide НЕ переживает, живой факт приёмки); load берёт снимок, если он
  // СВЕЖЕЕ основной записи; после wipe — тишина (гвард wiped + PANIC_KEY
  // чистится, иначе снимок воскресил бы старую игру).
  // ДЕТЕКТИВНО и без подмен глобалов: SaveDirector собирается напрямую с
  // DI-фейками pagehideTarget/panicStore (подмена window/document в чеке
  // ломает ЖИВУЮ браузерную страницу, на которой крутится selftest —
  // страница зависала; найдено живой пробой, прецедент: глобалы в чеках не трогаем).
  {
    const storagePH = new MemoryStorage();
    const clockPH = new ManualClock(noonOn(2));
    const handlers: Record<string, () => void> = {};
    const lsMap = new Map<string, string>();
    const panicStore = {
      getItem: (k: string) => lsMap.get(k) ?? null,
      setItem: (k: string, v: string) => {
        lsMap.set(k, v);
      },
      removeItem: (k: string) => {
        lsMap.delete(k);
      },
    };
    const busPH = new EventBus();
    const dir = new SaveDirector({
      storage: storagePH,
      bus: busPH,
      now: () => clockPH.now(),
      contentVersion: '0.1.0-phase0',
      autosaveMs: 30_000,
      pagehideTarget: {
        addEventListener: (t: string, h: () => void) => {
          handlers[t] = h;
        },
        removeEventListener: (t: string) => {
          delete handlers[t];
        },
      },
      panicStore,
    });
    dir.startAutosave();
    // основная запись + panic — на ПРЯМОМ директоре (изолированные
    // storage/panic; регистрируем срез кошелька — файл не пустой)
    const fakeSlice = { save: () => ({ gold: 123 }), load: () => undefined };
    dir.registerSlice('kernel.wallet', fakeSlice);
    handlers['pagehide']?.();
    await new Promise((r) => setTimeout(r, 20));
    const jsonPH = await storagePH.get('main');
    const panic1 = lsMap.get('koreni-ruda:pagehide') ?? null;
    const savedViaPanic = panic1 !== null && panic1 === jsonPH && panic1.includes('"saveVersion"');
    // load-приоритет: panic свежее основной записи — загружается снимок
    const mainWithOlderSavedAt = jsonPH ? jsonPH.replace(/"savedAt":\d+/, '"savedAt":1') : null;
    const dirOlder = new SaveDirector({
      storage: {
        kind: 'memory',
        get: async () => mainWithOlderSavedAt,
        set: async () => undefined,
        remove: async () => undefined,
      },
      bus: busPH,
      now: () => clockPH.now(),
      contentVersion: '0.1.0-phase0',
      autosaveMs: 30_000,
      panicStore,
    });
    const loadedFromPanic = await dirOlder.load();
    const panicPriority = loadedFromPanic !== null && (loadedFromPanic as unknown as { savedAt: number }).savedAt === (panic1 ? JSON.parse(panic1).savedAt : -1);
    // пост-wipe тишина: pagehide и panic молчат
    await dir.wipe();
    handlers['pagehide']?.();
    await new Promise((r) => setTimeout(r, 20));
    const afterWipePH = await storagePH.get('main');
    const panic2 = lsMap.get('koreni-ruda:pagehide') ?? null;
    results.push(
      check('pagehide: выгрузка пишет сейв + синхронный panic-снимок; load берёт снимок если свежее; после wipe — тишина (MEL-B закрыт)', () =>
        jsonPH !== null && jsonPH.includes('"saveVersion"') && afterWipePH === null &&
        savedViaPanic && panicPriority && panic2 === null, {
        expected: 'pagehide → сейв + снимок; приоритет снимка; wipe → тишина',
        actual: `main: ${jsonPH === null ? 'пусто' : 'записан'}, снимок=${String(panic1 !== null)}, приоритет=${String(panicPriority)}; после wipe: ${afterWipePH === null ? 'тишина' : 'ЗАПИСАН'}, снимок=${String(panic2 !== null)}`,
      }),
    );
    dir.stopAutosave();

    // [OBS-1 AUDIT-M05.1 · M05.2 §1.2] обратные направления panic-приоритета
    // (прямое «свежий panic побеждает» — чеком выше; живое воспроизведение
    // stale/broken в среде агента недостижимо — выгрузка всегда переписывает
    // снимок, покрытие — детерминированные подкладки): (а) panic СТАРЕЕ
    // основной записи → load берёт main; (б) битый JSON panic → main (не краш)
    const mainProbe = JSON.stringify({
      saveVersion: 10, savedAt: clockPH.now(), saveId: 'panic-priority-main-probe',
      contentVersion: '0.1.0-phase0', modules: { 'kernel.wallet': { gold: 4242 } }, lastSeen: clockPH.now(),
    });
    const mkProbeDirector = (panicValue: string | null) =>
      new SaveDirector({
        storage: { kind: 'memory', get: async () => mainProbe, set: async () => undefined, remove: async () => undefined },
        bus: busPH,
        now: () => clockPH.now(),
        contentVersion: '0.1.0-phase0',
        autosaveMs: 30_000,
        panicStore,
      });
    // (а) снимок на минуту старее main (savedAt −60000, чужой saveId)
    const stalePanic = mainProbe.replace('"saveId":"panic-priority-main-probe"', '"saveId":"panic-stale-probe"').replace(/"savedAt":\d+/, `"savedAt":${clockPH.now() - 60_000}`);
    lsMap.set('koreni-ruda:pagehide', stalePanic);
    const dirStale = mkProbeDirector(stalePanic);
    const loadedStale = await dirStale.load();
    const staleIgnored = loadedStale !== null && (loadedStale as unknown as { saveId: string }).saveId === 'panic-priority-main-probe';
    // (б) битый JSON в panic-ключе — load обязан взять main и не упасть
    lsMap.set('koreni-ruda:pagehide', '{{{битый-снимок-не-json');
    const dirBroken = mkProbeDirector('{{{');
    const loadedBroken = await dirBroken.load();
    const brokenIgnored = loadedBroken !== null && (loadedBroken as unknown as { saveId: string }).saveId === 'panic-priority-main-probe';
    lsMap.delete('koreni-ruda:pagehide');
    results.push(
      check('panic-приоритет: снимок СТАРЕЕ main → грузится main, чужой saveId не воскрешается — [OBS-1 AUDIT-M05.1]', () =>
        staleIgnored && (loadedStale as unknown as { saveId: string }).saveId !== 'panic-stale-probe', {
        expected: 'stale→main (panic-priority-main-probe)',
        actual: `stale→${(loadedStale as unknown as { saveId?: string } | null)?.saveId ?? 'null'}`,
      }),
    );
    results.push(
      check('panic-приоритет: битый JSON снимка → main, загрузка без исключения — [OBS-1 AUDIT-M05.1]', () =>
        brokenIgnored, {
        expected: 'broken→main (panic-priority-main-probe)',
        actual: `broken→${(loadedBroken as unknown as { saveId?: string } | null)?.saveId ?? 'null'}`,
      }),
    );
  }

  // g2/g3 создали свои интервалы? нет: init() их запускает — гасим
  g1.dispose();
  g2.dispose();
  g3.dispose();

  return group('SaveDirector + миграции (§13.7)', results);
}
