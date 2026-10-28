/**
 * dbg-m132-live: дискавери golden-досок ЧЕРЕЗ ЖИВУЮ фикстуру (реальные трейты
 * двигают rng-стрим доски). Печатает живые доски 2024-01-01 для saveId.
 */
import { makeSeededRunGame, grantGold, type ViewShape } from '../src/selfchecks/mine-run-fixture';

async function show(saveId: string): Promise<void> {
  const f = await makeSeededRunGame(saveId);
  grantGold(f, 3000);
  const r = f.mine['mine.upgrades.buy']('mine_barracks') as { ok: boolean };
  const v = f.mine['mine.helpers']() as unknown as ViewShape;
  console.log(`== ${saveId} (барак: ${r.ok})`);
  for (const l of v.lines) console.log(`   ${l}`);
  f.dispose();
}

const ids = (process.argv[2] ?? 'm132-gold-0,m132-gold-1,m132-gold-3,m132-gold-4').split(',');
for (const id of ids) await show(id);
