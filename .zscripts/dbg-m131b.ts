import { ManualClock } from '@/kernel/di/clock';
import { MemoryStorage } from '@/kernel/save/storage-drivers';
import { createGame } from '@/game/bootstrap';
import { MINE_CARDS, MINE_LAYER_STATUSES } from '@/content/mine/cards';
import { MINE_MOBS } from '@/content/mine/mobs';
import { MINE_LAYERS } from '@/content/mine/layers';
import { generateLayer, runSeedOf } from '@/game/modules/mine/generator';

const T0 = new Date(2024, 0, 1, 12, 0, 0).getTime();
type R<T> = { ok: true; value: T } | { ok: false; error: string };
interface V { header: string; lines: string[] }
const mk = async (saveId: string, storage?: MemoryStorage) => {
  const st = storage ?? new MemoryStorage();
  if (!storage) await st.set('main', JSON.stringify({ saveVersion: 15, savedAt: T0, saveId, contentVersion: '0.1.0-phase0', modules: {}, lastSeen: T0 }));
  const game = createGame(new ManualClock(T0), st);
  await game.init();
  return game;
};
const layout = (game: any, sid: string, layer = 1) =>
  generateLayer({ cards: MINE_CARDS, statuses: MINE_LAYER_STATUSES, mobs: MINE_MOBS, statBus: game.statBus, rngBus: game.rngBus, time: game.time },
    layer, runSeedOf(sid, layer, 1), (MINE_LAYERS as any)[layer - 1], { player: 'player', now: game.time.now(), tags: ['mine', `layer:${layer}`] });
const kindsOf = (game: any, sid: string, col: number, layer = 1) => layout(game, sid, layer).cards.slice(col * 3, col * 3 + 3).map((c: any) => c.kind);

async function find(tag: string, pred: (cols: string[][]) => boolean) {
  for (let i = 1; i <= 500; i++) {
    const sid = `dbg2-${tag}-${i}`;
    const game = await mk(sid);
    const cols = [0, 1, 2, 3].map((c) => kindsOf(game, sid, c));
    if (pred(cols)) { game.dispose(); return sid; }
    game.dispose();
  }
  throw new Error('not found ' + tag);
}

// --- ROUNDTRIP debug
const sidR = await find('rt', (c) => c[0]!.includes('oreVein'));
const g1 = await mk(sidR);
{
  const mine = g1.modules.get('mine')!.api;
  const inv = g1.modules.get('inventory')!.api;
  (inv as any)['inventory.add']('iron_pickaxe', 'D', 50, 1, 'dbg');
  const list = ((inv as any)['inventory.list'] as () => Array<{ iid: string; defId: string }>)();
  (inv as any)['inventory.equip'](list.findLast((i) => i.defId === 'iron_pickaxe')!.iid, 'pickaxe');
  console.log('RT enter:', (mine['mine.enter'](1) as R<V>).ok);
  mine['mine.pick'](String(kindsOf(g1, sidR, 0).indexOf('oreVein') + 1));
  await g1.save.save();
  const json = g1.save.exportJson();
  const g2 = await mk('dbg2-rt-b');
  await g2.save.importJson(json);
  await g2.save.save();
  const raw1 = (JSON.parse(json) as any).modules.mine;
  const raw2 = (JSON.parse(g2.save.exportJson()) as any).modules.mine;
  console.log('RT raw equal:', JSON.stringify(raw1) === JSON.stringify(raw2), 'keys:', Object.keys(raw2).sort().join(','));
  console.log('RT run in raw2:', raw2.run !== undefined ? `runId ${raw2.run.runId} col ${raw2.run.column}` : 'НЕТ');
  const v = (g2.modules.get('mine')!.api['mine.run']() as V);
  console.log('RT f2 run view:', v.lines[0]);
  g2.dispose();
}
g1.dispose();

// --- УЛУЧШЕНИЯ debug
{
  const g = await mk('dbg2-upg');
  const mine = g.modules.get('mine')!.api;
  const inv = g.modules.get('inventory')!.api;
  const player = g.modules.get('player')!.api;
  (inv as any)['inventory.add']('iron_pickaxe', 'D', 50, 1, 'dbg');
  const list = ((inv as any)['inventory.list'] as () => Array<{ iid: string; defId: string }>)();
  (inv as any)['inventory.equip'](list.findLast((i) => i.defId === 'iron_pickaxe')!.iid, 'pickaxe');
  g.transaction.transact({ grants: [{ t: 'currency', id: 'gold', qty: 2000 }], eventId: 'dbg' });
  for (const id of ['mine_cart', 'mine_lighting', 'mine_campgear', 'mine_lift']) {
    const r = mine['mine.upgrades.buy'](id) as R<V>;
    console.log('buy', id, r.ok);
  }
  const enter1 = mine['mine.enter'](1) as R<V>;
  console.log('enter1:', enter1.ok ? enter1.value.lines.slice(-3).join(' | ') : enter1.error);
  const rv = mine['mine.run']() as V;
  console.log('runView bag line:', rv.lines.find((l) => l.includes('runBag')));
  (player as any)['player.setHp'](0);
  (player as any)['player.setHp'](50);
  g.buffs.add({ id: 'dbg.atk', source: { kind: 'buff', refId: 'dbg' }, stat: 'combat.attack', op: 'flat', value: 500 }, g.time.now());
  g.buffs.add({ id: 'dbg.def', source: { kind: 'buff', refId: 'dbg' }, stat: 'combat.defense', op: 'flat', value: 500 }, g.time.now());
  const boss = mine['mine.boss'](1, 777) as R<{ outcome: string }>;
  console.log('boss:', boss.ok ? boss.value.outcome.slice(0, 40) : boss.error);
  const quests = g.modules.get('quests')!.api;
  const extras = (quests as any)['quests.gateExtras']() as Record<string, unknown>;
  console.log('ach extra:', Object.keys(extras).filter((k) => k.includes('ach_mine')).join(','));
  const enter2 = mine['mine.enter'](1) as R<V>;
  console.log('enter2:', enter2.ok ? enter2.value.lines.slice(-2).join(' | ') : enter2.error);
  g.dispose();
}

// --- КРОТ debug
{
  const sid = await find('tr', (c) => c[0]!.includes('trader') && c[1]!.includes('exit'));
  const g = await mk(sid);
  const mine = g.modules.get('mine')!.api;
  const inv = g.modules.get('inventory')!.api;
  (inv as any)['inventory.add']('iron_pickaxe', 'D', 50, 1, 'dbg');
  const list = ((inv as any)['inventory.list'] as () => Array<{ iid: string; defId: string }>)();
  (inv as any)['inventory.equip'](list.findLast((i) => i.defId === 'iron_pickaxe')!.iid, 'pickaxe');
  g.transaction.transact({ grants: [{ t: 'currency', id: 'gold', qty: 2000 }], eventId: 'dbg' });
  mine['mine.enter'](1);
  const tv = mine['mine.pick'](String(kindsOf(g, sid, 0).indexOf('trader') + 1)) as R<V>;
  console.log('trader pick:', tv.ok ? tv.value.lines.join(' | ') : tv.error);
  const rv = mine['mine.run']() as V;
  console.log('РЕЖИМ line:', rv.lines.find((l) => l.includes('РЕЖИМ')));
  const b3 = mine['mine.pick']('3') as R<V>;
  console.log('buy3(torch):', b3.ok ? b3.value.lines.join(' | ') : b3.error);
  const b1 = mine['mine.pick']('1') as R<V>;
  console.log('buy1(potion):', b1.ok ? b1.value.lines.join(' | ') : b1.error);
  const b4 = mine['mine.pick']('4') as R<V>;
  console.log('buy4(scroll):', b4.ok ? b4.value.lines.join(' | ') : b4.error);
  const leave = mine['mine.pick']('0') as R<V>;
  console.log('leave:', leave.ok ? leave.value.lines.join(' | ') : leave.error);
  const ex = mine['mine.pick'](String(kindsOf(g, sid, 1).indexOf('exit') + 1)) as R<V>;
  console.log('exit:', ex.ok ? ex.value.lines.join(' | ') : ex.error);
  g.dispose();
}
