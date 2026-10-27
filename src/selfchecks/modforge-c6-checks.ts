/**
 * Self-checks M04.1 · C6 (AUDIT-M03): состав сида реролла — канон §5
 * hash(saveId, iid, attempts): вариант стабилен ВСЕГДА для той же попытки.
 *
 * Прежний код сидался от rngBus.seed (= dailySeed) — смена дня меняла вариант
 * ТОЙ ЖЕ попытки: keep-сброс через сутки давал НОВЫЙ вариант, инфляция
 * обходилась ожиданием (ровно сценарий C6 леджера AUDIT-M03). Фикс: основа
 * сида — saveId ( reroll.ts, [ИСПРАВЛЕНО · M04.1/C6] ).
 *
 * Красный сценарий: на старом коде проверка 1 падает (setSeed между
 * рероллами = имитация границы дня меняла вариант), проверка 2 — тоже
 * (разные попытки сидуются одинаково при daily-основе только в пределах
 * дня; здесь — инвариант различия попыток).
 */
import { makeActionGame, type ActionFixture } from './inventory-action-fixture';
import { check, group, type CheckGroup, type CheckResult } from './types';

type MfApi = Record<string, (...args: unknown[]) => unknown>;
type R<T> = { ok: true; value: T } | { ok: false; error: string };

interface View {
  iid: string;
  attempts: number;
  nextCost: number;
  pending: Array<{ type: string; value: number }> | null;
}

function mfOf(f: ActionFixture): MfApi {
  return f.game.modules.get('modforge')?.api ?? {};
}

function grantGold(f: ActionFixture, qty: number): void {
  f.game.transaction.transact({
    grants: [{ t: 'currency', id: 'gold', qty }],
    eventId: 'selfcheck.c6-setup',
  });
}

function firstIid(f: ActionFixture, defId: string): string {
  const it = (f.api['inventory.list']() as Array<{ iid: string; defId: string }>).find((e) => e.defId === defId);
  if (!it) throw new Error(`фикстура: ${defId} не выдан`);
  return it.iid;
}

export async function runModForgeC6Checks(): Promise<CheckGroup> {
  const results: CheckResult[] = [];

  // --- 1. Стабильность через «границу дня»: та же попытка того же предмета
  //     даёт ТОТ ЖЕ вариант при ДРУГОМ сиде дня rngBus (имитация суток)
  const f1 = makeActionGame();
  const mf1 = mfOf(f1);
  grantGold(f1, 100);
  f1.api['inventory.add']('iron_pickaxe', 'C', 50, 1, 'selfcheck');
  const pick = firstIid(f1, 'iron_pickaxe');
  const rrA = mf1['modforge.reroll'](pick) as R<{ variant: Array<{ type: string; value: number }> }>;
  const keepA = mf1['modforge.choose'](pick, 'keep') as R<{ applied: boolean }>;
  // «наступил следующий день»: сид шины пересеялся (SeedSync на dayTick),
  // реролл-цикл сброшен keep'ом — попытка снова 0
  f1.game.rngBus.setSeed(987654321);
  const rrB = mf1['modforge.reroll'](pick) as R<{ variant: Array<{ type: string; value: number }> }>;
  results.push(
    check('C6: смена сида дня (имитация суток) НЕ меняет вариант той же попытки — hash(saveId:iid:attempts) стабилен ВСЕГДА', () =>
      rrA.ok && keepA.ok && rrB.ok &&
      JSON.stringify(rrA.value.variant) === JSON.stringify(rrB.value.variant), {
      expected: 'вариант A === вариант B байт-в-байт',
      actual: rrA.ok && rrB.ok ? `совпадение: ${JSON.stringify(rrA.value.variant) === JSON.stringify(rrB.value.variant)}` : 'реролл не удался',
    }),
  );

  // --- 2. Разные попытки — разные сиды: попытка 0 ≠ попытка 1 (attempts в сида)
  const rrC = mf1['modforge.reroll'](pick) as R<{ variant: Array<{ type: string; value: number }>; attempts: number }>;
  results.push(
    check('C6: attempts входит в сид — вариант попытки 1 отличается от попытки 0 (инфляция покупает РАЗНЫЕ варианты)', () => {
      if (!rrC.ok || !rrB.ok) return false;
      const v = mf1['modforge.rerollView'](pick) as View;
      return rrC.value.attempts === 2 && v.attempts === 2 &&
        JSON.stringify(rrC.value.variant) !== JSON.stringify(rrB.value.variant);
    }),
  );

  // --- 3. Стабильность после полной перезагрузки (saveId переживает сейв):
  //     та же попытка — тот же вариант в НОВОМ экземпляре игры
  const MemoryStorage = (await import('@/kernel/save/storage-drivers')).MemoryStorage;
  const storage = new MemoryStorage();
  const f2 = makeActionGame(storage);
  const mf2 = mfOf(f2);
  grantGold(f2, 100);
  f2.api['inventory.add']('iron_pickaxe', 'C', 50, 1, 'selfcheck');
  const pick2 = firstIid(f2, 'iron_pickaxe');
  const rrD = mf2['modforge.reroll'](pick2) as R<{ variant: Array<{ type: string; value: number }> }>;
  const variantD = rrD.ok ? JSON.stringify(rrD.value.variant) : '';
  f2.dispose(); // сохраняет
  const f3 = makeActionGame(storage);
  await f3.game.init();
  const mf3 = mfOf(f3);
  grantGold(f3, 100);
  // после загрузки: attempts=1 и pending пережили сейв — сбрасываем keep'ом,
  // чтобы снова встать на попытку 0 (та же, что у rrD)
  const keep3 = mf3['modforge.choose'](pick2, 'keep') as R<{ applied: boolean }>;
  const rrE = mf3['modforge.reroll'](pick2) as R<{ variant: Array<{ type: string; value: number }> }>;
  results.push(
    check('C6: вариант той же попытки стабилен после dispose/load (saveId — основа сида, переживает сейв)', () =>
      rrD.ok && keep3.ok && rrE.ok && JSON.stringify(rrE.value.variant) === variantD),
  );
  f1.dispose();
  f3.dispose();

  return group('M03 · C6: сид реролла стабилен (saveId, не день)', results);
}
