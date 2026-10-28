/** audit-m13-layouts: полные расклады забегов сида аудита (только чтение). */
import { makeSeededRunGame } from '../src/selfchecks/mine-run-fixture';
import { generateLayer, runSeedOf } from '../src/game/modules/mine/generator';

const SAVE = process.argv[2] ?? 'x';
const from = Number(process.argv[3] ?? 1);
const to = Number(process.argv[4] ?? 3);

const f = await makeSeededRunGame(SAVE);
const cards = f.game.content.get<any[]>('mine.cards') ?? [];
const statuses = f.game.content.get<any[]>('mine.cards.statuses') ?? [];
const mobs = f.game.content.get<any[]>('mine.mobs') ?? [];
const layers = f.game.content.get<any[]>('mine.layers') ?? [];
const LAYER = Number(process.argv[5] ?? 1);
const layer1 = layers.find((l: any) => l.layer === LAYER)!;
for (let rn = from; rn <= to; rn++) {
  const lay = generateLayer(
    { cards, statuses, mobs, statBus: f.game.statBus, rngBus: f.game.rngBus, time: f.game.time },
    LAYER, runSeedOf(SAVE, LAYER, rn), layers.find((l: any) => l.layer === LAYER)!,
    { player: 'player', now: f.game.time.now(), tags: ['mine', `layer:`] },
  );
  console.log(`run ${rn} (seed ${lay.seed}, статус ${lay.status ?? '—'}):`);
  for (let col = 1; col <= 4; col++) {
    const cs = lay.cards.slice((col - 1) * 3, col * 3);
    console.log(`  кол.${col}: ${cs.map((c: any) => `${c.id}${c.hidden ? '?' : ''}${c.payload?.mobId ? `(${c.payload.mobId})` : ''}`).join(' | ')}`);
  }
  console.log(`  кол.5: ${lay.cards[12].id} (${lay.cards[12].payload?.bossId ?? 'boss'})`);
}
f.dispose();
