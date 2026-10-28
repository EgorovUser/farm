// FIX-M12 debug ч.2: моб-бой при free=0 (после заполнения до cap)
import { makeSeededMineGame } from '../src/selfchecks/mine-fixture';

type R<T> = { ok: true; value: T } | { ok: false; error: string };

async function main() {
  const f = await makeSeededMineGame('m12fix-capa');
  (f.inv['inventory.add'] as (d: string, t: string, v: number, q: number, s: string) => R<unknown>)('iron_pickaxe', 'B', 50, 1, 'selfcheck');
  const list = (f.inv['inventory.list'] as () => Array<{ iid: string; defId: string }>)();
  const pick = list.findLast((i) => i.defId === 'iron_pickaxe')!;
  (f.inv['inventory.equip'] as (iid: string, slot: string) => R<unknown>)(pick.iid, 'pickaxe');
  const now = f.game.time.now();
  f.game.buffs.add({ id: 'dbg.atk', source: { kind: 'buff', refId: 'dbg' }, stat: 'combat.attack', op: 'flat', value: 100 }, now);
  const infoOf = () => (f.inv['inventory.info'] as () => { capacity: number; used: number; free: number })();
  for (let i = 0; i < 20; i += 1) {
    (f.inv['inventory.add'] as (d: string, t: string, v: number, q: number, s: string) => R<unknown>)('copper_ore', 'D', 3 + i * 0.37, 1, `dbg.full.${i}`);
  }
  console.log('before: used', infoOf().used, 'free', infoOf().free);
  const probe = (f.inv['inventory.canAcquire'] as (d: string, q: number) => R<{ fits: boolean; free: number; newEntries: number }>);
  console.log('probe(copper_ore,1) at full:', JSON.stringify(probe('copper_ore', 1)));
  const r = (f.mine['mine.fight'] as (m: string, l?: unknown, e?: unknown, s?: unknown) => R<{ outcome: string; loot: { gold: number; ore?: { qty: number }; item?: unknown } | null }>)('spider', 1, undefined, 888);
  console.log('mob fight at free=0:', r.ok ? r.value.outcome : r.error);
  if (r.ok) console.log('  loot:', JSON.stringify(r.value.loot));
  console.log('after: used', infoOf().used, 'free', infoOf().free, 'cap', infoOf().capacity);
  // иevents: была ли транзакция
  f.dispose();
}
main().catch((e) => { console.error(e); process.exit(1); });
