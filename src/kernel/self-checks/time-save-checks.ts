/**
 * Self-checks времени и сейва (02-BUSES §13.6, §13.7).
 * catchUp: фиксированные даты через ManualClock (DI-подмена now()).
 * Сейв: roundtrip + миграция версии N → N+1.
 */
import { EventBus } from '@/kernel/bus/event-bus/event-bus';
import { ManualClock } from '@/kernel/di/clock';
import { OfflineCatchup } from '@/kernel/time/offline-catchup';
import { TIME_TABLE } from '@/content/balance/time';
import { createGame } from '@/game/bootstrap';
import { MemoryStorage } from '@/kernel/save/storage-drivers';
import { MIGRATIONS, SAVE_VERSION, migrateSaveData } from '@/kernel/save/migrations';
import { check, group, type CheckGroup, type CheckResult } from './types';

const HOUR = 3_600_000;
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
  results.push(check('миграция 0→1: версия поднята', () => migrated.data.saveVersion === 1 && migrated.steps === 1));
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

  // g2/g3 создали свои интервалы? нет: init() их запускает — гасим
  g1.dispose();
  g2.dispose();
  g3.dispose();

  return group('SaveDirector + миграции (§13.7)', results);
}
