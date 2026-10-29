import { ManualClock } from '@/kernel/di/clock';
import { MemoryStorage } from '@/kernel/save/storage-drivers';
import { createGame } from '@/game/bootstrap';

const T0 = new Date(2024, 0, 1, 12, 0, 0, 0).getTime();

async function main() {
  const st = new MemoryStorage();
  await st.set('main', JSON.stringify({ saveVersion: 15, savedAt: T0, saveId: 'dbg-5', contentVersion: '0.1.0-phase0', modules: { player: { v: 1, energy: 100, hp: 50, xp: 0, level: 1, skills: [] } }, lastSeen: T0 }));
  const game = createGame(new ManualClock(T0), st);
  await game.init();
  const player = game.modules.get('player')!.api;
  const passives = game.modules.get('passives')!.api;
  const log: string[] = [];
  for (const n of ['player.levelUp', 'achievement.unlocked', 'mine.bossKilled']) {
    game.bus.subscribe(n, (p) => log.push(`${n}: ${String((p as { id?: string; level?: number }).id ?? (p as { level?: number }).level ?? '')}`));
  }
  game.bus.publish('mine.bossKilled', { bossId: 'x', layer: 1 });
  log.push(`boss done`);
  game.bus.publish('achievement.unlocked', { id: 'ach_agronomist' });
  log.push(`ach done`);
  (player['player.addXp'] as (n: number, s: string) => unknown)(200, 'selfcheck');
  log.push(`xp done`);
  const v = passives['passives.state']() as { lines: string[] };
  log.push(`STATE: ${v.lines[0]}`);
  log.push(`LOG: ${log.join(' / ')}`);
  console.log(log.join('\n'));
  game.dispose();
}
void main();
