import { ManualClock } from '@/kernel/di/clock';
import { MemoryStorage } from '@/kernel/save/storage-drivers';
import { createGame } from '@/game/bootstrap';

const T0 = new Date(2024, 0, 1, 12, 0, 0, 0).getTime();
const storage = new MemoryStorage();
await storage.set('main', JSON.stringify({ saveVersion: 15, savedAt: T0, saveId: 'dbg-m122', contentVersion: '0.1.0-phase0', modules: {}, lastSeen: T0 }));
const game = createGame(new ManualClock(T0), storage);
await game.init();
const inv = game.modules.get('inventory')!.api;
const player = game.modules.get('player')!.api;
const forge = game.modules.get('forge')!.api;
const craft = game.modules.get('craft')!.api;

(inv['inventory.add'] as any)('iron_pickaxe', 'D', 50, 1, 'dbg');
const list = (inv['inventory.list'] as any)() as any[];
const pick = list.find((i: any) => i.defId === 'iron_pickaxe');
(inv['inventory.equip'] as any)(pick.iid, 'pickaxe');
(inv['inventory.dur'] as any)(pick.iid, 50);
const eq = (inv['inventory.equipped'] as any)() as any[];
console.log('equipped dur:', JSON.stringify(eq.find((e: any) => e.slot === 'pickaxe')?.entry.durability));

(player['player.addXp'] as any)(5000, 'dbg');
console.log('player level:', JSON.stringify((player['player.snapshot'] as any)().progress));
game.transaction.transact({ grants: [{ t: 'currency', id: 'gold', qty: 4000 }], eventId: 'dbg' });
(inv['inventory.add'] as any)('iron_ingot', 'D', 0, 30, 'dbg');
const buyW = (forge['forge.buy'] as any)('whetstone');
console.log('buy whetstone:', JSON.stringify(buyW));
const buyA = (craft['craft.buy'] as any)('anvil');
console.log('buy anvil:', JSON.stringify(buyA));
(forge['forge.force'] as any)('success');
(inv['inventory.unequip'] as any)(pick.iid);
for (let i = 0; i < 3; i++) {
  const a = (forge['forge.attempt'] as any)(pick.iid);
  console.log(`attempt ${i}:`, a.ok ? `toLevel ${a.value.toLevel}` : a.error);
}
game.dispose();
