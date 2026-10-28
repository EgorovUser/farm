/**
 * AUDIT-M14 · временный скрипт машины (вне дерева; только-чтение, MemoryStorage).
 * Квантификация флейка M03·C6.2: P[variant(attempt 0) === variant(attempt 1)]
 * на свежих saveId — воспроизведение сценария чека modforge-c6-checks.ts §1–2.
 * Запуск: bun .zscripts/audit-m14-c6flake.ts
 */
import { makeActionGame, type ActionFixture } from '../src/selfchecks/inventory-action-fixture';

type R<T> = { ok: true; value: T } | { ok: false; error: string };
interface MfApi {
  'modforge.reroll': (iid: string) => R<{ variant: Array<{ type: string; value: number }>; attempts: number }>;
  'modforge.choose': (iid: string, c: 'new' | 'keep') => R<{ applied: boolean }>;
}

function grantGold(f: ActionFixture, qty: number): void {
  f.game.transaction.transact({
    grants: [{ t: 'currency', id: 'gold', qty }],
    eventId: 'selfcheck.c6-audit',
  });
}

function mfOf(f: ActionFixture): MfApi {
  const mf = f.game.modules.get('modforge')?.api as unknown as MfApi;
  if (!mf) throw new Error('фикстура: модуль modforge не найден');
  return mf;
}

function firstIid(f: ActionFixture, defId: string): string {
  const it = (f.api['inventory.list']() as Array<{ iid: string; defId: string }>).find((e) => e.defId === defId);
  if (!it) throw new Error(`фикстура: ${defId} не выдан`);
  return it.iid;
}

const M = 300;
let collisions = 0;
let failures = 0;
const examples: string[] = [];
for (let i = 0; i < M; i++) {
  const f = makeActionGame();
  try {
    const mf = mfOf(f);
    grantGold(f, 100);
    (f.api['inventory.add'] as unknown as (d: string, t: string, v: number, q: number, s: string) => unknown)(
      'iron_pickaxe', 'C', 50, 1, 'selfcheck',
    );
    const pick = firstIid(f, 'iron_pickaxe');
    const rrA = mf['modforge.reroll'](pick);
    mf['modforge.choose'](pick, 'keep');
    const rrB = mf['modforge.reroll'](pick);
    const rrC = mf['modforge.reroll'](pick); // БЕЗ keep: attempts 1→2, сид = attempt 1
    if (!rrA.ok || !rrB.ok || !rrC.ok) { failures++; continue; }
    if (JSON.stringify(rrB.value.variant) === JSON.stringify(rrC.value.variant)) {
      collisions++;
      if (examples.length < 3) examples.push(JSON.stringify(rrC.value.variant));
    }
  } finally {
    f.dispose();
  }
}
console.log(`прогонов: ${M} | коллизий variant(0)===variant(1): ${collisions} | p̂ = ${(collisions / M).toFixed(3)}`);
console.log(`прочих сбоев API: ${failures}`);
console.log('примеры совпавших вариантов:', examples);
