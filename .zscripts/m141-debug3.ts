import { ManualClock } from '@/kernel/di/clock';
import { MemoryStorage } from '@/kernel/save/storage-drivers';
import { createGame } from '@/game/bootstrap';

const T0 = new Date(2024, 0, 1, 12, 0, 0, 0).getTime();

async function main() {
  const st = new MemoryStorage();
  await st.set('main', JSON.stringify({ saveVersion: 15, savedAt: T0, saveId: 'dbg-4', contentVersion: '0.1.0-phase0', modules: { player: { v: 1, energy: 100, hp: 50, xp: 0, level: 1, skills: [] } }, lastSeen: T0 }));
  const game = createGame(new ManualClock(T0), st);
  await game.init();
  const player = game.modules.get('player')!.api;
  const log: string[] = [];
  game.bus.subscribe('player.levelUp', (p) => log.push(`LVL ${JSON.stringify(p)}`));
  game.bus.subscribe('player.xpGained', (p) => log.push(`XP ${JSON.stringify(p)}`));
  (player['player.addXp'] as (n: number, s: string) => unknown)(200, 'selfcheck');
  const snap = player['player.snapshot']() as { level: number; xp: number };
  log.push(`итог: уровень ${snap.level}, xp ${snap.xp}`);
  console.log(log.join('\n'));
  game.dispose();
}
void main();
