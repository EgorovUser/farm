/**
 * Группа «M12 Шахта» · чек 31 [FIX-M12] — граница вместимости лута
 * (MISS-1 аудита AUDIT-M12: проба bossLoot недосчитывала стек руды →
 * инвентарь 21/20). Тело чека вынесено из mine-boss-checks.ts по wc-гигиене
 * при касании (прецедент распила b4af909); группа «M12 Шахта» одна —
 * оркестратор mine-checks.ts не плодится.
 */
import { check, type CheckResult } from './types';
import {
  makeSeededMineGame,
  eventsOf,
  walletOf,
  mineStateOf,
  fightOf,
} from './mine-fixture';

type R<T> = { ok: true; value: T } | { ok: false; error: string };

interface BossView {
  outcome: string;
  loot: {
    gold: number;
    aPlus: { granted: boolean };
  } | null;
}

interface InvInfo {
  capacity: number;
  used: number;
  free: number;
}

/** баф канала ядра (BUF-1: штатный Buff-канал; пробам боёв — усиление) */
function buffWin(f: Awaited<ReturnType<typeof makeSeededMineGame>>, atk = 100, def = 100): void {
  const now = f.game.time.now();
  f.game.buffs.add(
    { id: 'selfcheck.mine.atk', source: { kind: 'buff', refId: 'selfcheck' }, stat: 'combat.attack', op: 'flat', value: atk },
    now,
  );
  f.game.buffs.add(
    { id: 'selfcheck.mine.def', source: { kind: 'buff', refId: 'selfcheck' }, stat: 'combat.defense', op: 'flat', value: def },
    now,
  );
}

/** выдать кирку + экипировать (витрина M02 → тир качества B ≥ гейт слоя 1) */
function equipPickaxe(f: Awaited<ReturnType<typeof makeSeededMineGame>>): void {
  (f.inv['inventory.add'] as (d: string, t: string, v: number, q: number, s: string) => R<unknown>)(
    'iron_pickaxe',
    'B',
    50,
    1,
    'selfcheck',
  );
  const list = (f.inv['inventory.list'] as () => Array<{ iid: string; defId: string }>)();
  const pick = list.findLast((i) => i.defId === 'iron_pickaxe')!;
  (f.inv['inventory.equip'] as (iid: string, slot: string) => R<unknown>)(pick.iid, 'pickaxe');
}

/** заполнить рюкзак отдельными записями руды — value качества УНИКАЛЬНЫ
 *  по тегу и индексу (смена тега = смена базы value): одинаковые
 *  defId+качество СЛИВАЮТСЯ в один стак — заполнение обязано создавать
 *  именно отдельные записи) */
function fillBackpack(
  f: Awaited<ReturnType<typeof makeSeededMineGame>>,
  n: number,
  tag: string,
): void {
  const base = 3 + (tag.charCodeAt(0) - 97) * 11;
  for (let i = 0; i < n; i += 1) {
    (f.inv['inventory.add'] as (d: string, t: string, v: number, q: number, s: string) => R<unknown>)(
      'copper_ore',
      'D',
      base + i * 0.37,
      1,
      `selfcheck.m12fix.${tag}.${i}`,
    );
  }
}

export async function runMineLootCapChecks(): Promise<CheckResult[]> {
  const results: CheckResult[] = [];

  // (а) free=1: боссу нужно 2 новых стека (руда + трофей) → честный нул-лут;
  // (в) моб при free=0 → без транзакции (до фикса моб-путь не пробировал вовсе)
  const f = await makeSeededMineGame('m12fix-capa');
  equipPickaxe(f);
  buffWin(f);
  const infoOf = () => (f.inv['inventory.info'] as () => InvInfo)();
  const cap = infoOf().capacity;
  fillBackpack(f, cap - 1 - infoOf().used, 'a'); // free = 1
  const infoA = infoOf();
  const rA = f.mine['mine.boss'](1, 777) as R<BossView>;
  const txA = eventsOf(f, 'wallet.transaction').filter((e) => e.eventId === 'mine.bossLoot');
  const infoA2 = infoOf();
  fillBackpack(f, 1, 'b'); // добиваем до cap: free = 0
  const rM = fightOf(f, 'spider', 1, 888);
  const infoM = infoOf();
  const stA = mineStateOf(f);
  f.dispose();

  // (б) free=2: полный лут ОДНОЙ транзакцией, рюкзак = cap РОВНО
  const f2 = await makeSeededMineGame('m12fix-capb');
  equipPickaxe(f2);
  buffWin(f2);
  const infoOf2 = () => (f2.inv['inventory.info'] as () => InvInfo)();
  const cap2 = infoOf2().capacity;
  fillBackpack(f2, cap2 - 2 - infoOf2().used, 'b'); // free = 2
  const goldB = walletOf(f2);
  const rB = f2.mine['mine.boss'](1, 777) as R<BossView>;
  const txB = eventsOf(f2, 'wallet.transaction').filter((e) => e.eventId === 'mine.bossLoot');
  const infoB = infoOf2();
  const goldB2 = walletOf(f2);
  f2.dispose();

  results.push(
    check('[FIX-M12 · MISS-1 AUDIT-M12] граница вместимости лута — проба по СУММЕ новых стеков: bossLoot при free=1 (руда+трофей = 2 стека) → честный нул-лут (0з, транзакции mine.bossLoot НЕТ, слоты НЕ растут, bossKills жив); моб-лут при free=0 → без транзакции (слоты = cap, kills жив); при free=2 → полный лут ОДНОЙ транзакцией, рюкзак = cap РОВНО (20/20 → 21/20 запрещено), A+ честно НЕ выдан', () =>
      infoA.free === 1 &&
      rA.ok && rA.value.outcome.startsWith('ПОБЕДА') &&
      rA.value.loot !== null && rA.value.loot.gold === 0 && rA.value.loot.aPlus.granted === false &&
      txA.length === 0 &&
      infoA2.used === infoA.used && infoA2.used <= infoA2.capacity &&
      infoM.free === 0 && rM.ok && rM.value.outcome.startsWith('ПОБЕДА') &&
      rM.value.loot !== null && rM.value.loot.gold === 0 &&
      infoM.used === infoM.capacity &&
      stA.fights === 2 && stA.bossKills === 1 && stA.kills === 1 && stA.deaths === 0 &&
      rB.ok && rB.value.outcome.startsWith('ПОБЕДА') &&
      rB.value.loot !== null && rB.value.loot.gold > 0 &&
      txB.length === 1 &&
      goldB2 === goldB + rB.value.loot.gold &&
      infoB.used === infoB.capacity && infoB.used <= infoB.capacity &&
      rB.value.loot.aPlus.granted === false, {
      expected: 'free=1 → 0з без tx (слоты целы); free=0 моб → без tx (слоты = cap); free=2 → tx ×1, used = cap ровно, A+ не выдан',
      actual: `A: free ${infoA.free} → gold ${rA.ok ? rA.value.loot?.gold : '—'}, tx ${txA.length}, used ${infoA.used}→${infoA2.used}; M: free 0 → gold ${rM.ok ? rM.value.loot?.gold : '—'}, used ${infoM.used}/${infoM.capacity}; B: gold ${rB.ok ? rB.value.loot?.gold : '—'}, tx ${txB.length}, used ${infoB.used}/${infoB.capacity}, A+ ${rB.ok ? rB.value.loot?.aPlus.granted : '—'}; статы ${stA.fights}/${stA.kills}/${stA.bossKills}/${stA.deaths}`,
    }),
  );

  return results;
}
