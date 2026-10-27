/**
 * Self-checks BuffService: runs-бафы «до конца забега» (FIX-0.1 G, ловушка M13).
 * Раньше expiresAt = now + Infinity → JSON null → баф признавался истёкшим
 * после загрузки и съедался sweep'ом. Хелперы — из modifier-filter-checks.
 */
import { StatBus } from '@/kernel/bus/stat-bus/stat-bus';
import { BuffService } from '@/kernel/services/buff/buff-service';
import { EventBus } from '@/kernel/bus/event-bus/event-bus';
import type { Modifier } from '@/kernel/bus/stat-bus/modifier';
import { MS_DAY } from '@/shared/utils/math';
import { check, group, type CheckGroup, type CheckResult } from './types';
import { NOW, makeBus, noTags } from './modifier-filter-checks';

/** [FIX-0.1 G] runs-бафы: «до конца забега» без expiresAt — переживают JSON и sweep */
export function runBuffRunsChecks(): CheckGroup {
  const results: CheckResult[] = [];
  const bus = new EventBus();
  const buffs = new BuffService(bus);
  const runsMod: Modifier = {
    id: 'runs.demo',
    source: { kind: 'buff', refId: 'selfcheck' },
    stat: 'demo.attack',
    op: 'flat',
    value: 5,
    duration: { kind: 'runs', value: 1 },
  };

  const r = buffs.add(runsMod, NOW);
  results.push(
    check('runs-баф: expiresAt НЕ выставляется', () => r.ok && buffs.get('runs.demo')?.mod.expiresAt === undefined),
  );

  // JSON roundtrip (симуляция save/load): раньше Infinity → null → «истёк»
  results.push(
    check('runs-баф жив после save/load JSON-roundtrip', () => {
      const json = JSON.stringify(buffs.saveState());
      const second = new BuffService(new EventBus());
      second.loadState(JSON.parse(json));
      const loaded = second.get('runs.demo');
      return loaded !== undefined && loaded.mod.expiresAt === undefined;
    }),
  );

  // sweep в далёком будущем не трогает runs-баф
  results.push(
    check('sweep через 100 дней не трогает runs-баф', () => {
      const removed = buffs.sweep(NOW + 100 * MS_DAY);
      return removed === 0 && buffs.get('runs.demo') !== undefined;
    }),
  );

  // контраст: timed-баф умирает в sweep
  buffs.add(
    {
      id: 'timed.demo',
      source: { kind: 'buff', refId: 'selfcheck' },
      stat: 'demo.attack',
      op: 'flat',
      value: 5,
      duration: { kind: 'seconds', value: 60 },
    },
    NOW,
  );
  results.push(
    check('контраст: timed-баф умирает в sweep (через 2 минуты)', () => {
      const removed = buffs.sweep(NOW + 120_000);
      return removed === 1 && buffs.get('timed.demo') === undefined && buffs.get('runs.demo') !== undefined;
    }),
  );

  // runs-баф участвует в резолве как обычный модификатор
  results.push(
    check('runs-баф действует в resolve (10 + 5 = 15)', () => {
      const statBus = makeBus();
      const provider = new BuffService(new EventBus());
      provider.add(runsMod, NOW);
      statBus.registerProvider(provider);
      return statBus.resolve({ stat: 'demo.attack', ctx: noTags }) === 15;
    }),
  );

  return group('BuffService · runs-бафы (FIX G, ловушка M13)', results);
}
