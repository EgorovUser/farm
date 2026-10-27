/**
 * Self-checks модификаторов: фильтры (условия/теги/срок) — закрытие MISS-1 аудита.
 * checkCondition (03-DATA §2, 11 типов) и passesFilters (теги AND, expiresAt)
 * ранее не были покрыты ни одной из 103 проверок.
 * Все оракулы посчитаны руками: база 10, мод flat +5 → действует = 15, не действует = 10.
 * Изолированная шина со стаб-базами — живая игра не затрагивается.
 */
import { StatBus, type BaseSource } from '@/kernel/bus/stat-bus/stat-bus';
import { BuffService } from '@/kernel/services/buff/buff-service';
import { EventBus } from '@/kernel/bus/event-bus/event-bus';
import type { Modifier, ModifierProvider, ResolveCtx } from '@/kernel/bus/stat-bus/modifier';
import type { Condition } from '@/shared/types/requirement';
import { MS_DAY, MS_HOUR } from '@/shared/utils/math';
import { check, group, type CheckGroup, type CheckResult } from './types';

export const NOW = 1_700_000_000_000;

export function makeBus(): StatBus {
  const bases: Record<string, number> = { 'demo.attack': 10, 'demo.power': 7 };
  const source: BaseSource = {
    base: (stat) => {
      if (!(stat in bases)) throw new Error(`неизвестный стат ${stat}`);
      return bases[stat];
    },
    meta: () => ({}),
    listStats: () => Object.keys(bases),
  };
  return new StatBus(source);
}

let uid = 0;
function flatMod(partial: Partial<Modifier>): Modifier {
  uid++;
  return {
    id: partial.id ?? `selfcheck.filter${uid}`,
    source: { kind: 'buff', refId: 'selfcheck' },
    stat: 'demo.attack',
    op: 'flat',
    value: 5,
    ...partial,
  } as Modifier;
}

function busWith(mods: Modifier[]): StatBus {
  const bus = makeBus();
  const provider: ModifierProvider = { id: 'selfcheck.filters', provide: () => mods };
  bus.registerProvider(provider);
  return bus;
}

export const noTags: ResolveCtx = { player: 'selfcheck', now: NOW };
const fishing: ResolveCtx = { player: 'selfcheck', now: NOW, tags: ['fishing'] };
const fishingNight: ResolveCtx = { player: 'selfcheck', now: NOW, tags: ['fishing', 'night'] };
const inCave: ResolveCtx = { player: 'selfcheck', now: NOW, location: 'cave' };
const richCtx: ResolveCtx = {
  player: 'selfcheck',
  now: NOW,
  extra: {
    'flag:unlocked.village': true,
    'item:turnip': 3,
    'skill:fishing': 4,
    'player:level': 7,
    'achievement:first_steps': true,
  },
};

export function runModifierFilterChecks(): CheckGroup {
  const results: CheckResult[] = [];
  const atk = (bus: StatBus, ctx: ResolveCtx) => bus.resolve({ stat: 'demo.attack', ctx });

  // --- теги модификатора (сопоставление с ctx по AND)

  results.push(
    check('тег мода есть в ctx → применяется (10+5=15)', () => atk(busWith([flatMod({ tags: ['fishing'] })]), fishing) === 15),
  );
  results.push(
    check('тега мода нет в ctx → не применяется (10)', () => atk(busWith([flatMod({ tags: ['fishing'] })]), noTags) === 10),
  );
  results.push(
    check('теги AND: один из двух в ctx → не применяется (10)', () =>
      atk(busWith([flatMod({ tags: ['fishing', 'night'] })]), fishing) === 10),
  );
  results.push(
    check('теги AND: оба в ctx → применяется (15)', () => atk(busWith([flatMod({ tags: ['fishing', 'night'] })]), fishingNight) === 15),
  );
  results.push(
    check('location считается тегом ctx (15)', () => atk(busWith([flatMod({ tags: ['cave'] })]), inCave) === 15),
  );

  // --- условия 03-DATA §2 (единый оценщик checkCondition через StatBus)

  results.push(
    check('statAtLeast истина (power 7 ≥ 5) → 15', () =>
      atk(busWith([flatMod({ conditions: [{ t: 'statAtLeast', stat: 'demo.power', value: 5 }] })]), noTags) === 15),
  );
  results.push(
    check('statAtLeast ложь (power 7 < 9) → 10', () =>
      atk(busWith([flatMod({ conditions: [{ t: 'statAtLeast', stat: 'demo.power', value: 9 }] })]), noTags) === 10),
  );
  results.push(
    check('statAtMost истина (power 7 ≤ 9) → 15', () =>
      atk(busWith([flatMod({ conditions: [{ t: 'statAtMost', stat: 'demo.power', value: 9 }] })]), noTags) === 15),
  );
  results.push(
    check('statAtMost ложь (power 7 > 5) → 10', () =>
      atk(busWith([flatMod({ conditions: [{ t: 'statAtMost', stat: 'demo.power', value: 5 }] })]), noTags) === 10),
  );
  results.push(
    check('not инвертирует ложное условие → 15', () =>
      atk(busWith([flatMod({ conditions: [{ t: 'not', c: { t: 'statAtLeast', stat: 'demo.power', value: 9 } }] })]), noTags) === 15),
  );
  results.push(
    check('all: все условия истинны → 15', () =>
      atk(
        busWith([
          flatMod({ conditions: [{ t: 'all', cs: [{ t: 'ctxTag', tag: 'fishing' }, { t: 'statAtLeast', stat: 'demo.power', value: 5 }] }] }),
        ]),
        fishing,
      ) === 15),
  );
  results.push(
    check('all: одно условие ложно → 10', () =>
      atk(
        busWith([
          flatMod({ conditions: [{ t: 'all', cs: [{ t: 'ctxTag', tag: 'cave' }, { t: 'statAtLeast', stat: 'demo.power', value: 5 }] }] }),
        ]),
        fishing,
      ) === 10),
  );
  results.push(
    check('any: одно из двух истинно → 15', () =>
      atk(
        busWith([
          flatMod({ conditions: [{ t: 'any', cs: [{ t: 'ctxTag', tag: 'cave' }, { t: 'statAtLeast', stat: 'demo.power', value: 5 }] }] }),
        ]),
        noTags,
      ) === 15),
  );
  results.push(
    check('any: все ложны → 10', () =>
      atk(
        busWith([
          flatMod({ conditions: [{ t: 'any', cs: [{ t: 'ctxTag', tag: 'cave' }, { t: 'statAtLeast', stat: 'demo.power', value: 9 }] }] }),
        ]),
        noTags,
      ) === 10),
  );

  // --- условия на extra-контексте (флаги/предметы/навыки/уровень/ачивки)

  results.push(
    check('flag: флаг есть в extra → 15', () =>
      atk(busWith([flatMod({ conditions: [{ t: 'flag', flag: 'unlocked.village' }] })]), richCtx) === 15),
  );
  results.push(
    check('flag: флага нет → 10', () =>
      atk(busWith([flatMod({ conditions: [{ t: 'flag', flag: 'unlocked.village' }] })]), noTags) === 10),
  );
  results.push(
    check('hasItem: достаточно (3 ≥ 3) → 15', () =>
      atk(busWith([flatMod({ conditions: [{ t: 'hasItem', defId: 'turnip', qty: 3 }] })]), richCtx) === 15),
  );
  results.push(
    check('hasItem: недостаточно (3 < 4) → 10', () =>
      atk(busWith([flatMod({ conditions: [{ t: 'hasItem', defId: 'turnip', qty: 4 }] })]), richCtx) === 10),
  );
  results.push(
    check('skill: fishing 4 ≥ 3 → 15', () =>
      atk(busWith([flatMod({ conditions: [{ t: 'skill', skill: 'fishing', level: 3 }] })]), richCtx) === 15),
  );
  results.push(
    check('playerLevel: 7 ≥ 5 → 15', () =>
      atk(busWith([flatMod({ conditions: [{ t: 'playerLevel', level: 5 }] })]), richCtx) === 15),
  );
  results.push(
    check('achievement: выдана → 15', () =>
      atk(busWith([flatMod({ conditions: [{ t: 'achievement', id: 'first_steps' }] })]), richCtx) === 15),
  );

  // --- срок действия (абсолютные даты)

  results.push(
    check('истёкший expiresAt игнорируется (10)', () =>
      atk(busWith([flatMod({ expiresAt: NOW - 1 })]), noTags) === 10),
  );
  results.push(
    check('expiresAt в будущем действует (15)', () => atk(busWith([flatMod({ expiresAt: NOW + MS_HOUR })]), noTags) === 15),
  );

  // --- неизвестность (П5): неизвестный тип условия → false, мод не действует

  results.push(
    check('неизвестный тип условия → false, мод не действует (10)', () => {
      const unknown = { t: 'событиеБудущего' } as unknown as Condition;
      return atk(busWith([flatMod({ conditions: [unknown] })]), noTags) === 10;
    }),
  );

  return group('Фильтры модификаторов · условия/теги/срок (03-DATA §2, MISS-1)', results);
}
