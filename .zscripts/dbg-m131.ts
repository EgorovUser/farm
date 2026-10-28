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

async function make(saveId: string) {
  const storage = new MemoryStorage();
  await storage.set('main', JSON.stringify({ saveVersion: 15, savedAt: T0, saveId, contentVersion: '0.1.0-phase0', modules: {}, lastSeen: T0 }));
  const clock = new ManualClock(T0);
  const game = createGame(clock, storage);
  await game.init();
  return game;
}

// найти saveId: col1 = vein + exit
let found = '';
for (let i = 1; i <= 300; i++) {
  const sid = `dbg-ladder-${i}`;
  const game = await make(sid);
  const layout = generateLayer(
    { cards: MINE_CARDS, statuses: MINE_LAYER_STATUSES, mobs: MINE_MOBS, statBus: game.statBus, rngBus: game.rngBus, time: game.time },
    1, runSeedOf(sid, 1, 1), MINE_LAYERS[0]!,
    { player: 'player', now: game.time.now(), tags: ['mine', 'layer:1'] },
  );
  const k1 = layout.cards.slice(0, 3).map((c) => c.kind);
  if (k1.includes('oreVein') && k1.includes('exit')) { found = sid; game.dispose(); break; }
  game.dispose();
}
console.log('saveId:', found);
const game = await make(found);
const mine = game.modules.get('mine')!.api;
const inv = game.modules.get('inventory')!.api;
const player = game.modules.get('player')!.api;
// кирка D
(inv as any)['inventory.add']('iron_pickaxe', 'D', 50, 1, 'dbg');
const list = ((inv as any)['inventory.list'] as () => Array<{ iid: string; defId: string }>)();
const pick = list.findLast((i) => i.defId === 'iron_pickaxe')!;
(inv as any)['inventory.equip'](pick.iid, 'pickaxe');

const enter = mine['mine.enter'](1) as R<V>;
console.log('enter:', enter.ok ? enter.value.header : enter.error);
if (enter.ok) enter.value.lines.forEach((l) => console.log('  ' + l));
const layout = generateLayer(
  { cards: MINE_CARDS, statuses: MINE_LAYER_STATUSES, mobs: MINE_MOBS, statBus: game.statBus, rngBus: game.rngBus, time: game.time },
  1, runSeedOf(found, 1, 1), MINE_LAYERS[0]!,
  { player: 'player', now: game.time.now(), tags: ['mine', 'layer:1'] },
);
const k1 = layout.cards.slice(0, 3).map((c) => c.kind);
console.log('col1 kinds:', k1);
const veinSlot = k1.indexOf('oreVein') + 1;
const exitSlot = k1.indexOf('exit') + 1;
const pv = mine['mine.pick'](String(veinSlot)) as R<V>;
console.log('pick vein:', pv.ok ? pv.value.lines.join(' | ') : pv.error);
const rv = mine['mine.run']() as V;
console.log('run view:', rv.lines.join('\n  '));
const pe = mine['mine.pick'](String(exitSlot)) as R<V>;
console.log('pick exit:', pe.ok ? pe.value.lines.join(' | ') : pe.error);
const after = mine['mine.run']() as V;
console.log('after:', after.lines[0]);
game.dispose();
