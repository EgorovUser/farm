/**
 * Self-checks StatBus: агрегация + провайдеры (02-BUSES §13.1, §13.2).
 * Изолированная шина со стаб-базами — живая игра не затрагивается.
 */
import { EventBus } from '@/kernel/bus/event-bus/event-bus';
import { StatBus, type BaseSource } from '@/kernel/bus/stat-bus/stat-bus';
import type { Modifier, ModifierProvider, ResolveCtx } from '@/kernel/bus/stat-bus/modifier';
import type { Rounding } from '@/shared/utils/math';
import { check, group, type CheckGroup, type CheckResult } from './types';

type StatMetaEntry = { round?: Rounding; min?: number };

function makeBus(bases: Record<string, number>, meta: Record<string, StatMetaEntry> = {}): StatBus {
  const source: BaseSource = {
    base: (stat) => {
      if (!(stat in bases)) throw new Error(`неизвестный стат ${stat}`);
      return bases[stat];
    },
    meta: (stat) => meta[stat] ?? {},
    listStats: () => Object.keys(bases),
  };
  return new StatBus(source);
}

let uid = 0;
function mod(partial: Partial<Modifier> & { stat: string; op: Modifier['op']; value: number }): Modifier {
  uid++;
  return {
    id: partial.id ?? `selfcheck.mod${uid}`,
    source: { kind: 'buff', refId: 'selfcheck' },
    ...partial,
  } as Modifier;
}

/** кап с направлением: расширение capDir описано в modifier.ts */
function capMod(stat: string, value: number, capDir: 'max' | 'min'): Modifier {
  return { ...mod({ stat, op: 'cap', value }), capDir } as Modifier;
}

const ctx: ResolveCtx = { player: 'selfcheck', now: 1_700_000_000_000 };

function withMods(bus: StatBus, mods: Modifier[]): StatBus {
  const provider: ModifierProvider = { id: 'selfcheck.mods', provide: () => mods };
  bus.registerProvider(provider);
  return bus;
}

export function runStatAggregationChecks(): CheckGroup {
  const results: CheckResult[] = [];

  // 1. только база
  let bus = makeBus({ 'demo.attack': 10 });
  results.push(check('база без модов = 10', () => bus.resolve({ stat: 'demo.attack', ctx }) === 10));

  // 2. flat
  bus = withMods(makeBus({ 'demo.attack': 10 }), [mod({ stat: 'demo.attack', op: 'flat', value: 5 })]);
  results.push(check('base 10 + flat 5 = 15', () => bus.resolve({ stat: 'demo.attack', ctx }) === 15));

  // 3. inc
  bus = withMods(makeBus({ 'demo.attack': 10 }), [mod({ stat: 'demo.attack', op: 'inc', value: 50 })]);
  results.push(check('base 10 × inc 50% = 15', () => bus.resolve({ stat: 'demo.attack', ctx }) === 15));

  // 4. flat + inc
  bus = withMods(makeBus({ 'demo.attack': 10 }), [
    mod({ stat: 'demo.attack', op: 'flat', value: 5 }),
    mod({ stat: 'demo.attack', op: 'inc', value: 20 }),
  ]);
  results.push(check('(10 + 5) × 1.2 = 18', () => bus.resolve({ stat: 'demo.attack', ctx }) === 18));

  // 5. inc складываются
  bus = withMods(makeBus({ 'demo.attack': 10 }), [
    mod({ stat: 'demo.attack', op: 'inc', value: 10 }),
    mod({ stat: 'demo.attack', op: 'inc', value: 20 }),
  ]);
  results.push(check('inc +10% и +20% складываются = 13', () => bus.resolve({ stat: 'demo.attack', ctx }) === 13));

  // 6. more одиночный
  bus = withMods(makeBus({ 'demo.attack': 10 }), [mod({ stat: 'demo.attack', op: 'more', value: 100 })]);
  results.push(check('more +100% = 20', () => bus.resolve({ stat: 'demo.attack', ctx }) === 20));

  // 7. more перемножаются (POE-стиль)
  bus = withMods(makeBus({ 'demo.attack': 10 }), [
    mod({ stat: 'demo.attack', op: 'more', value: 100 }),
    mod({ stat: 'demo.attack', op: 'more', value: 50 }),
  ]);
  results.push(check('more ×2 × 1.5 = 30', () => bus.resolve({ stat: 'demo.attack', ctx }) === 30));

  // 8. полная цепочка (base + flat) × inc × more
  bus = withMods(makeBus({ 'demo.attack': 100 }), [
    mod({ stat: 'demo.attack', op: 'flat', value: 10 }),
    mod({ stat: 'demo.attack', op: 'inc', value: 50 }),
    mod({ stat: 'demo.attack', op: 'more', value: 20 }),
  ]);
  results.push(check('(100+10) × 1.5 × 1.2 = 198', () => bus.resolve({ stat: 'demo.attack', ctx }) === 198));

  // 9. отрицательный inc
  bus = withMods(makeBus({ 'demo.attack': 10 }), [mod({ stat: 'demo.attack', op: 'inc', value: -20 })]);
  results.push(check('inc −20% = 8', () => bus.resolve({ stat: 'demo.attack', ctx }) === 8));

  // 10. override: «замена есть замена» — трассировка из 02-BUSES §3
  bus = withMods(makeBus({ 'player.energy.max': 100 }), [
    mod({ stat: 'player.energy.max', op: 'flat', value: 20 }),
    mod({ stat: 'player.energy.max', op: 'inc', value: 10 }),
    mod({ stat: 'player.energy.max', op: 'override', value: 50, priority: 10 }),
  ]);
  results.push(
    check('override 50 (prio 10) глушит flat/inc: итог 50', () => bus.resolve({ stat: 'player.energy.max', ctx }) === 50),
  );

  // 11. override: при равном приоритете побеждает большее значение
  bus = withMods(makeBus({ 'player.energy.max': 100 }), [
    mod({ stat: 'player.energy.max', op: 'override', value: 40, priority: 5 }),
    mod({ stat: 'player.energy.max', op: 'override', value: 60, priority: 5 }),
  ]);
  results.push(
    check('override при равном prio: max(value) = 60', () => bus.resolve({ stat: 'player.energy.max', ctx }) === 60),
  );

  // 12. cap сверху
  bus = withMods(makeBus({ 'demo.attack': 10 }), [
    mod({ stat: 'demo.attack', op: 'flat', value: 10 }),
    capMod('demo.attack', 15, 'max'),
  ]);
  results.push(check('cap ≤ 15 на 20 → 15', () => bus.resolve({ stat: 'demo.attack', ctx }) === 15));

  // 13. cap снизу
  bus = withMods(makeBus({ 'demo.attack': 10 }), [capMod('demo.attack', 50, 'min')]);
  results.push(check('cap ≥ 50 на 10 → 50', () => bus.resolve({ stat: 'demo.attack', ctx }) === 50));

  // 14. стек-группа: max внутри группы
  bus = withMods(makeBus({ 'demo.attack': 10 }), [
    mod({ stat: 'demo.attack', op: 'flat', value: 5, stackGroup: 'g1' }),
    mod({ stat: 'demo.attack', op: 'flat', value: 12, stackGroup: 'g1' }),
  ]);
  results.push(check('stackGroup: только max(+12) → 22', () => bus.resolve({ stat: 'demo.attack', ctx }) === 22));

  // 15. округление по правилу стата (floor) и жёсткий min данных
  bus = withMods(
    makeBus({ 'demo.defense': 5, 'player.energy.max': 100 }, { 'demo.defense': { round: 'floor' }, 'player.energy.max': { min: 0 } }),
    [
      mod({ stat: 'demo.defense', op: 'inc', value: 25 }),
      mod({ stat: 'player.energy.max', op: 'flat', value: -150 }),
    ],
  );
  results.push(check('floor(5 × 1.25) = 6', () => bus.resolve({ stat: 'demo.defense', ctx }) === 6));
  results.push(check('min 0: энергия не уходит в минус', () => bus.resolve({ stat: 'player.energy.max', ctx }) === 0));

  // 16. [FIX-0.1 E] round:'none' — дробные базы/результаты не округляются (реген M01)
  // [FIX-M01 · D12] реген-ид переименован в perMinute-форму (значение то же)
  bus = makeBus({ 'player.energy.regenPerMinute': 0.5 }, { 'player.energy.regenPerMinute': { round: 'none' } });
  results.push(
    check("round 'none': база 0.5 резолвится как 0.5 (не искажается)", () =>
      bus.resolve({ stat: 'player.energy.regenPerMinute', ctx }) === 0.5),
  );
  bus = withMods(
    makeBus({ 'demo.speed': 0.5 }, { 'demo.speed': { round: 'none' } }),
    [mod({ stat: 'demo.speed', op: 'flat', value: 0.25 }), mod({ stat: 'demo.speed', op: 'inc', value: 10 })],
  );
  results.push(
    check("round 'none': (0.5 + 0.25) × 1.1 = 0.825 без округления", () =>
      Math.abs(bus.resolve({ stat: 'demo.speed', ctx }) - 0.825) < 1e-12, {
      expected: '0.825',
      actual: String(bus.resolve({ stat: 'demo.speed', ctx })),
    }),
  );

  return group('StatBus · агрегация (§13.1)', results);
}

export function runProviderChecks(): CheckGroup {
  const results: CheckResult[] = [];

  let calls = 0;
  const provider: ModifierProvider = {
    id: 'selfcheck.lazy',
    provide: (stat) => {
      calls++;
      return stat === 'demo.attack' ? [mod({ stat: 'demo.attack', op: 'flat', value: 7, id: 'selfcheck.lazy.flat' })] : [];
    },
  };
  const bus = makeBus({ 'demo.attack': 10 });
  bus.registerProvider(provider);

  results.push(check('регистрация: провайдер сразу влияет (10+7=17)', () => bus.resolve({ stat: 'demo.attack', ctx }) === 17));

  const callsAfterFirst = calls;
  bus.resolve({ stat: 'demo.attack', ctx });
  results.push(check('кэш: повторный resolve не опрашивает провайдера', () => calls === callsAfterFirst));

  bus.clearCache();
  bus.resolve({ stat: 'demo.attack', ctx });
  results.push(check('ленивый опрос: после инвалидации провайдер опрошен снова', () => calls === callsAfterFirst + 1));

  const a = bus.resolve({ stat: 'demo.attack', ctx });
  const b = bus.resolve({ stat: 'demo.attack', ctx });
  results.push(check('чистота resolve: одинаковый вход → одинаковый выход', () => a === b));

  bus.unregisterProvider('selfcheck.lazy');
  bus.clearCache();
  results.push(check('снятие: влияние исчезло (снова 10)', () => bus.resolve({ stat: 'demo.attack', ctx }) === 10));

  // упавший провайдер не роняет шину
  const bad: ModifierProvider = {
    id: 'selfcheck.bad',
    provide: () => {
      throw new Error('провайдер сломан');
    },
  };
  bus.registerProvider(bad);
  bus.clearCache();
  results.push(check('упавший провайдер не роняет шину', () => bus.resolve({ stat: 'demo.attack', ctx }) === 10));
  bus.unregisterProvider('selfcheck.bad');

  // инвалидация по событию
  const bus2 = makeBus({ 'demo.attack': 10 });
  const eventBus = new EventBus();
  eventBus.subscribe('invalidate.stat', () => bus2.clearCache());
  bus2.registerProvider({ id: 'selfcheck.evt', provide: () => [mod({ stat: 'demo.attack', op: 'flat', value: 3 })] });
  bus2.resolve({ stat: 'demo.attack', ctx });
  eventBus.publish('invalidate.stat', {});
  results.push(check('событие invalidate.stat чистит кэш', () => bus2.resolve({ stat: 'demo.attack', ctx }) === 13));

  return group('StatBus · провайдеры (§13.2)', results);
}
