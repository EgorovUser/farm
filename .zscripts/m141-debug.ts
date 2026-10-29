import { ManualClock } from '@/kernel/di/clock';
import { MemoryStorage } from '@/kernel/save/storage-drivers';
import { createGame } from '@/game/bootstrap';

const T0 = new Date(2024, 0, 1, 12, 0, 0, 0).getTime();

async function main() {
  // roundtrip debug
  const donorSlice = { v: 1, points: 20, spent: 3, allocated: ['core_energy_1', 'core_energy_2', 'core_energy_3'], respecTotal: 2 };
  const storage = new MemoryStorage();
  await storage.set('main', JSON.stringify({ saveVersion: 15, savedAt: T0, saveId: 'dbg-1', contentVersion: '0.1.0-phase0', modules: { player: { v: 1, energy: 100, hp: 50, xp: 0, level: 20, skills: [] }, passives: donorSlice }, lastSeen: T0 }));
  const game = createGame(new ManualClock(T0), storage);
  await game.init();
  const slice = JSON.parse(game.save.exportJson()) as { modules: Record<string, unknown> };
  console.log('passives slice after load:', JSON.stringify(slice.modules['passives']));
  console.log('energy.max resolve:', game.statBus.resolve({ stat: 'player.energy.max', ctx: game.time.ctx('player') }));
  game.dispose();

  // levelUp debug
  const st2 = new MemoryStorage();
  await st2.set('main', JSON.stringify({ saveVersion: 15, savedAt: T0, saveId: 'dbg-2', contentVersion: '0.1.0-phase0', modules: { player: { v: 1, energy: 100, hp: 50, xp: 0, level: 1, skills: [] } }, lastSeen: T0 }));
  const g2 = createGame(new ManualClock(T0), st2);
  await g2.init();
  const player = g2.modules.get('player')!.api;
  console.log('player api keys:', Object.keys(player).join(','));
  const events: string[] = [];
  g2.bus.subscribe('player.levelUp', (p) => events.push(`levelUp ${JSON.stringify(p)}`));
  (player['player.addXp'] as (n: number, s: string) => unknown)(200, 'debug');
  console.log('events:', events.join(' | ') || 'NONE');
  const passives = g2.modules.get('passives')!.api;
  const v = passives['passives.state']() as { lines: string[] };
  console.log('points lines:', v.lines[0]);
  g2.dispose();
}
void main();
