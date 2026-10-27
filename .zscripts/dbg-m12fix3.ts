// FIX-M12 debug ч.3: точный сценарий чека 31 (а)+(в)
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
  f.game.buffs.add({ id: 'dbg.def', source: { kind: 'buff', refId: 'dbg' }, stat: 'combat.defense', op: 'flat', value: 100 }, now);
  const infoOf = () => (f.inv['inventory.info'] as () => { capacity: number; used: number; free: number })();
  const addFill = (n: number, tag: string) => {
    for (let i = 0; i < n; i += 1) {
      const r = (f.inv['inventory.add'] as (d: string, t: string, v: number, q: number, s: string) => R<unknown>)('copper_ore', 'D', 3 + i * 0.37, 1, `dbg.${tag}.${i}`);
      if (!r.ok) console.log(`  fill ${tag}.${i} REFUSED: ${r.error}`);
    }
  };
  const cap = infoOf().capacity;
  addFill(cap - 1 - infoOf().used, 'a');
  console.log('A: used', infoOf().used, 'free', infoOf().free);
  const boss = (f.mine['mine.boss'] as (l: unknown, s?: unknown) => R<{ outcome: string; loot: { gold: number } | null }>);
  const rA = boss(1, 777);
  console.log('boss:', rA.ok ? rA.value.outcome.slice(0, 60) : rA.error, '| loot gold:', rA.ok && rA.value.loot ? rA.value.loot.gold : '—');
  console.log('after boss: used', infoOf().used, 'free', infoOf().free);
  // вторая fill-порция с тегом 'b' — как в чеке
  addFill(1, 'b');
  console.log('after fill b: used', infoOf().used, 'free', infoOf().free);
  const probe = (f.inv['inventory.canAcquire'] as (d: string, q: number) => R<{ fits: boolean; free: number; newEntries: number }>);
  console.log('probe(copper_ore,1):', JSON.stringify(probe('copper_ore', 1)));
  const rM = (f.mine['mine.fight'] as (m: string, l?: unknown, e?: unknown, s?: unknown) => R<{ outcome: string; loot: { gold: number } | null }>)('spider', 1, undefined, 888);
  console.log('mob:', rM.ok ? rM.value.outcome : rM.error);
  if (rM.ok) console.log('  loot:', JSON.stringify(rM.value.loot));
  console.log('after mob: used', infoOf().used, 'free', infoOf().free);
  f.dispose();
}
main().catch((e) => { console.error(e); process.exit(1); });
