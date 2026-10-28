/** audit-m13-board-days: превью досок наёмников будущих дней (только чтение). */
import { makeSeededRunGame, grantGold } from '../src/selfchecks/mine-run-fixture';

const SAVE = process.argv[2] ?? 'x';
const DAYS = Number(process.argv[3] ?? 6);
const f = await makeSeededRunGame(SAVE);
grantGold(f, 5000);
f.mine['mine.upgrades.buy']('mine_barracks');
// старт часов фикстуры = 2024-01-01; сдвигаем к 2026-10-29 (текущий день браузера)
const target = new Date(2026, 9, 29, 12, 0, 0, 0).getTime();
f.clock.advance(target - new Date(2024, 0, 1, 12, 0, 0, 0).getTime());
for (let d = 0; d < DAYS; d++) {
  const v = f.mine['mine.helpers']() as { lines: string[] };
  console.log(`=== день +${d}:`);
  for (const l of v.lines) console.log('  ' + l);
  if (d < DAYS - 1) f.clock.advance(24 * 3600_000);
}
f.dispose();
