// FIX-M12 debug: почему моб-лут при free=0 прошёл пробу
import { makeSeededMineGame } from '../src/selfchecks/mine-fixture';

type R<T> = { ok: true; value: T } | { ok: false; error: string };

async function main() {
  const f = await makeSeededMineGame('m12fix-capa');
  // кирка B + equip
  (f.inv['inventory.add'] as (d: string, t: string, v: number, q: number, s: string) => R<unknown>)('iron_pickaxe', 'B', 50, 1, 'selfcheck');
  const list = (f.inv['inventory.list'] as () => Array<{ iid: string; defId: string }>)();
  const pick = list.findLast((i) => i.defId === 'iron_pickaxe')!;
  (f.inv['inventory.equip'] as (iid: string, slot: string) => R<unknown>)(pick.iid, 'pickaxe');
  // баф
  const now = f.game.time.now();
  f.game.buffs.add({ id: 'dbg.atk', source: { kind: 'buff', refId: 'dbg' }, stat: 'combat.attack', op: 'flat', value: 100 }, now);
  const infoOf = () => (f.inv['inventory.info'] as () => { capacity: number; used: number; free: number })();
  const addFill = (n: number, tag: string) => {
    for (let i = 0; i < n; i += 1) {
      const r = (f.inv['inventory.add'] as (d: string, t: string, v: number, q: number, s: string) => R<unknown>)('copper_ore', 'D', 3 + i * 0.37, 1, `dbg.${tag}.${i}`);
      if (!r.ok) console.log(`fill ${tag}.${i} FAIL: ${r.error}`);
    }
  };
  const cap = infoOf().capacity;
  console.log('cap', cap, 'used0', infoOf().used);
  addFill(cap - 1 - infoOf().used, 'a');
  console.log('after fill A: used', infoOf().used, 'free', infoOf().free);
  // проба вручную
  const probe = (f.inv['inventory.canAcquire'] as (d: string, q: number) => R<{ fits: boolean; free: number; newEntries: number }>);
  console.log('probe(copper_ore,1):', JSON.stringify(probe('copper_ore', 1)));
  console.log('probe(trophy_mine_1,1):', JSON.stringify(probe('trophy_mine_1', 1)));
  // моб-бой при free=1
  const r1 = (f.mine['mine.fight'] as (m: string, l?: unknown, e?: unknown, s?: unknown) => R<{ outcome: string; loot: { gold: number; ore?: { qty: number } } | null }>)('spider', 1, undefined, 888);
  console.log('mob fight at free=1:', r1.ok ? r1.value.outcome : r1.error);
  if (r1.ok) console.log('  loot:', JSON.stringify(r1.value.loot));
  console.log('after: used', infoOf().used, 'free', infoOf().free);
  f.dispose();
}
main().catch((e) => { console.error(e); process.exit(1); });
