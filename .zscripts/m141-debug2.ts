import { ManualClock } from '@/kernel/di/clock';
import { MemoryStorage } from '@/kernel/save/storage-drivers';
import { createGame } from '@/game/bootstrap';

const T0 = new Date(2024, 0, 1, 12, 0, 0, 0).getTime();

async function main() {
  const st = new MemoryStorage();
  await st.set('main', JSON.stringify({ saveVersion: 15, savedAt: T0, saveId: 'dbg-3', contentVersion: '0.1.0-phase0', modules: { player: { v: 1, energy: 100, hp: 50, xp: 0, level: 1, skills: [] } }, lastSeen: T0 }));
  const game = createGame(new ManualClock(T0), st);
  await game.init();
  const player = game.modules.get('player')!.api;
  const passives = game.modules.get('passives')!.api;
  const log: string[] = [];
  game.bus.subscribe('achievement.unlocked', (p) => log.push(`ACH ${String((p as { id: string }).id)}`));
  game.bus.publish('mine.bossKilled', { bossId: 'spider_queen', layer: 1 });
  let v = passives['passives.state']() as { lines: string[] };
  log.push(`после босса: ${v.lines[0]}`);
  game.bus.publish('achievement.unlocked', { id: 'ach_agronomist', name: 'Агроном', rewards: [] });
  v = passives['passives.state']() as { lines: string[] };
  log.push(`после ачивки: ${v.lines[0]}`);
  (player['player.addXp'] as (n: number, s: string) => unknown)(200, 'selfcheck');
  v = passives['passives.state']() as { lines: string[] };
  log.push(`после XP: ${v.lines[0]}`);
  console.log(log.join('\n'));
  game.dispose();
}
void main();
