/**
 * Self-checks FIX-M01 (бриф §2.4): парсер resolve-ключей (MISS-7), SeedSync —
 * пересев и серийный детерминизм (MISS-7, программный эквивалент DEBT-15),
 * холодная загрузка без порога 1ч (D13а), reconcile при возврате вкладки
 * от watermark обработанного времени (D13б). Каждая группа — отдельной
 * строкой в selftest.
 */
import { parseResolveKeys, RESOLVE_KEYS_USAGE } from '@/debug/resolve-keys';
import { SeedSync } from '@/game/seed-sync';
import { createFocusReconciler, initGame } from '@/game/game-init';
import { createGame } from '@/game/bootstrap';
import { ManualClock } from '@/kernel/di/clock';
import { MemoryStorage } from '@/kernel/save/storage-drivers';
import { dailySeed } from '@/shared/utils/rng';
import { check, group, type CheckGroup, type CheckResult } from './types';
import { makePlayerGame } from './player-fixture';

/** Даты без TZ-зависимости: UTC-полдень → toISOString().slice(0, 10) стабилен */
const T0 = Date.UTC(2024, 0, 1, 12);
const dateOf = (ms: number): string => new Date(ms).toISOString().slice(0, 10);

export function runResolveKeyChecks(): CheckGroup {
  const results: CheckResult[] = [];
  const p = (tokens: string[]) => parseResolveKeys(tokens);

  const tagMulti = p(['[tag=fishing,mine]']);
  results.push(
    check('[tag=a,b]: мульти-теги через запятую', () => tagMulti.ok && tagMulti.value.tags.join(',') === 'fishing,mine'),
  );
  const lvl = p(['[lvl=5]']);
  results.push(
    check('[lvl=N]: player:level = 5', () => lvl.ok && lvl.value.extra['player:level'] === 5),
  );
  const skill = p(['[skill:fishing=7]']);
  results.push(
    check('[skill:id=N]: skill:fishing = 7', () => skill.ok && skill.value.extra['skill:fishing'] === 7),
  );
  const flag = p(['[flag=has_bed]']);
  results.push(
    check('[flag=f]: flag:has_bed = true', () => flag.ok && flag.value.extra['flag:has_bed'] === true),
  );
  const item = p(['[item:iron_pickaxe=2]']);
  results.push(
    check('[item:defId=N]: item:iron_pickaxe = 2', () => item.ok && item.value.extra['item:iron_pickaxe'] === 2),
  );
  const ach = p(['[ach=first_harvest]']);
  results.push(
    check('[ach=id]: achievement:first_harvest = true', () => ach.ok && ach.value.extra['achievement:first_harvest'] === true),
  );
  const garbage = p(['[foo=bar]']);
  results.push(
    check('мусор [foo=bar] — внятный отказ', () => !garbage.ok && garbage.error.includes('не разобран')),
  );
  results.push(
    check('текст usage в отказе присутствует', () => !garbage.ok && garbage.error.includes(RESOLVE_KEYS_USAGE)),
  );
  const cyr = p(['[tag=рыбалка]']);
  results.push(
    check('кириллица [tag=рыбалка] — внятный отказ', () => !cyr.ok && cyr.error.includes('не разобран')),
  );
  // приоритет ручных ключей над ctxExtras — контракт слияния команды resolve
  const manual = p(['[lvl=9]']);
  const merged: Record<string, unknown> = manual.ok
    ? { 'player:level': 1, 'skill:fishing': 2, ...manual.value.extra }
    : {};
  results.push(
    check('ручные ключи перекрывают ctxExtras (уровень 1 → 9)', () => merged['player:level'] === 9 && merged['skill:fishing'] === 2),
  );

  return group('FIX-M01 · Парсер resolve-ключей (MISS-7)', results);
}

export async function runSeedSyncChecks(): Promise<CheckGroup> {
  const results: CheckResult[] = [];

  // изолированный SeedSync: deps пишут в массив, даты — от UTC-эпохи
  const seeds: number[] = [];
  let fakeNow = T0; // 2024-01-01
  const sync = new SeedSync({
    setSeed: (s) => seeds.push(s),
    saveId: () => 'selfcheck-save',
    dateISO: dateOf,
    now: () => fakeNow,
  });

  sync.reseed('2024-01-01');
  results.push(
    check('reseed(дата): пересев выполняется — setSeed(dailySeed(saveId, дата))', () =>
      seeds.length === 1 && seeds[0] === dailySeed('selfcheck-save', '2024-01-01')),
  );
  sync.syncToClock(); // часы всё ещё 2024-01-01 — пересева быть не должно
  results.push(
    check('syncToClock: та же дата — no-op (повторного пересева нет)', () => seeds.length === 1),
  );
  fakeNow = T0 + 48 * 3_600_000; // 2024-01-03
  sync.syncToClock();
  results.push(
    check('syncToClock: другая дата — пересев под часы', () =>
      seeds.length === 2 && seeds[1] === dailySeed('selfcheck-save', '2024-01-03')),
  );
  sync.onDayTick('2024-01-05');
  results.push(
    check('onDayTick(дата границы): пересев на дату пейлоада', () =>
      seeds.length === 3 && seeds[2] === dailySeed('selfcheck-save', '2024-01-05')),
  );
  sync.onDayTick(undefined); // без даты — от текущих часов (2024-01-03)
  results.push(
    check('onDayTick без даты: пересев на текущую дату часов', () =>
      seeds.length === 4 && seeds[3] === dailySeed('selfcheck-save', '2024-01-03')),
  );
  results.push(
    check('ротация дня: разные даты дают разные сиды', () =>
      dailySeed('selfcheck-save', '2024-01-01') !== dailySeed('selfcheck-save', '2024-01-03')),
  );

  // полный цикл (DEBT-15, программный эквивалент живой пробы): сейв →
  // перезагрузка того же дня → тот же (saveId, дата) → идентичная серия роллов
  const rollN = (g: ReturnType<typeof createGame>): string[] => {
    const out: string[] = [];
    for (let i = 0; i < 5; i++) out.push(g.rngBus.rollTable('demo.loot', g.time.ctx('player')) ?? '∅');
    return out;
  };
  const storage = new MemoryStorage();
  const g1 = createGame(new ManualClock(T0), storage);
  await initGame(g1); // новая игра: файл появится ниже
  const firstSeries = rollN(g1);
  await g1.save.save();
  g1.dispose();

  const g2 = createGame(new ManualClock(T0), storage);
  const boot = await initGame(g2); // сейв найден → пересев dailySeed(saveId, дата)
  const secondSeries = rollN(g2);
  results.push(
    check('перезагрузка того же дня: серии роллов идентичны (серийный детерминизм)', () =>
      boot.fresh === false && firstSeries.join('|') === secondSeries.join('|') && !firstSeries.includes('∅'), {
      expected: firstSeries.join('|'),
      actual: secondSeries.join('|'),
    }),
  );
  g2.dispose();

  return group('FIX-M01 · SeedSync: пересев и детерминизм (MISS-7)', results);
}

export async function runColdReconcileChecks(): Promise<CheckGroup> {
  const results: CheckResult[] = [];

  // сейв с lastSeen = T0 (середина часа: 30 секунд не пересекут границ) и пустыми телом
  const TS = Date.UTC(2024, 0, 1, 12, 30);
  const storage = new MemoryStorage();
  const g1 = createGame(new ManualClock(TS), storage);
  await initGame(g1); // новая игра
  const api1 = g1.modules.get('player')?.api ?? {};
  api1['player.setEnergy'](0);
  api1['player.setHp'](0);
  await g1.save.save(); // lastSeen = TS (ManualClock стоит на месте)
  g1.dispose();

  // холодная загрузка спустя 30 реальных секунд = 30 игровых минут (D13а)
  const g2 = createGame(new ManualClock(TS + 30_000), storage);
  let hourTicks = 0;
  let dayTicks = 0;
  let catchUps = 0;
  g2.bus.subscribe('time.hourTick', () => hourTicks++);
  g2.bus.subscribe('time.dayTick', () => dayTicks++);
  g2.bus.subscribe('time.catchUpDone', () => catchUps++);
  const boot = await initGame(g2); // БЕЗ time.start() — живых тиков нет
  const snap2 = (g2.modules.get('player')?.api['player.snapshot'] ?? (() => null))() as
    | { energy: { current: number }; hp: { current: number } }
    | null;

  results.push(
    check('холодная загрузка: сейв найден, offlineReport awayMs = 30с', () =>
      boot.fresh === false && boot.offlineReport !== null && boot.offlineReport.awayMs === 30_000),
  );
  results.push(
    check('энергия 0 → ровно 10 (30 игровых минут × 1/3)', () => snap2?.energy.current === 10, {
      expected: '10',
      actual: String(snap2?.energy.current),
    }),
  );
  results.push(
    check('HP 0 → ровно 6 (30 × 0.2)', () => snap2?.hp.current === 6, {
      expected: '6',
      actual: String(snap2?.hp.current),
    }),
  );
  results.push(
    check('малый elapsed не порождает ложных границ: hourTick ×0, dayTick ×0', () => hourTicks === 0 && dayTicks === 0),
  );
  results.push(
    check('досчёт ровно один: time.catchUpDone ×1', () => catchUps === 1),
  );
  g2.dispose();

  return group('FIX-M01 · Холодная загрузка без порога (D13а)', results);
}

export function runFocusReconcileChecks(): CheckGroup {
  const results: CheckResult[] = [];
  const f = makePlayerGame(); // ManualClock на FIX_T0 (локальный полдень), таймеров нет
  f.api['player.setEnergy'](0);
  f.api['player.setHp'](0);
  let catchUps = 0;
  let hourTicks = 0;
  let dayTicks = 0;
  let energyChanged = 0;
  let hpChanged = 0;
  let energySpent = 0;
  f.game.bus.subscribe('time.catchUpDone', () => catchUps++);
  f.game.bus.subscribe('time.hourTick', () => hourTicks++);
  f.game.bus.subscribe('time.dayTick', () => dayTicks++);
  f.game.bus.subscribe('player.energyChanged', () => energyChanged++);
  f.game.bus.subscribe('player.hpChanged', () => hpChanged++);
  f.game.bus.subscribe('player.energySpent', () => energySpent++);

  const rec = createFocusReconciler(f.game); // watermark = FIX_T0
  try {
    // живые тики уже засчитаны (анти-двойной-счёт, D13б-требование 1)
    f.tick(3); // энергия 0 + 3×(1/3) = 1; HP 0.6 (floor 0)
    rec.reconcile(); // отставания нет — строгий no-op
    results.push(
      check('живые тики засчитаны: reconcile без отставания — no-op', () => catchUps === 0 && f.snapshot().energy.current === 1),
    );

    // подложенное отставание (фоновый троттлинг): время шло, тики не выполнялись
    f.clock.set(f.clock.now() + 45_000); // +45 реальных секунд = 45 игровых минут
    rec.reconcile();
    results.push(
      check('отставание 45 игровых минут: reconcile ровно на разницу — энергия 1 + 15 = 16', () =>
        f.snapshot().energy.current === 16, {
        expected: '16',
        actual: String(f.snapshot().energy.current),
      }),
    );
    results.push(
      check('HP: 0.6 + 45×0.2 = 9.6 → floor 9', () => f.snapshot().hp.current === 9, {
        expected: '9',
        actual: String(f.snapshot().hp.current),
      }),
    );
    rec.reconcile(); // повторный вызов без отставания — идемпотентность
    results.push(
      check('повторный вызов — no-op (идемпотентность)', () =>
        catchUps === 1 && f.snapshot().energy.current === 16 && f.snapshot().hp.current === 9),
    );
    results.push(
      check('лишних hourTick/dayTick нет', () => hourTicks === 0 && dayTicks === 0),
    );
    results.push(
      check('события ровно расчётные: energyChanged ×2, hpChanged ×1, energySpent ×0', () =>
        energyChanged === 2 && hpChanged === 1 && energySpent === 0),
    );
  } finally {
    rec.dispose();
    f.dispose();
  }
  return group('FIX-M01 · Возврат вкладки: reconcile от watermark (D13б)', results);
}
