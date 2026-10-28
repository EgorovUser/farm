import { makeSeededRunGame, grantGold, type ViewShape } from '../src/selfchecks/mine-run-fixture';
type R<T> = { ok: true; value: T } | { ok: false; error: string };

const f = await makeSeededRunGame('m132-gold-0');
grantGold(f, 3000);
const b0 = f.mine['mine.upgrades.buy']('mine_barracks') as R<ViewShape>;
grantGold(f, 3000);
const b1 = f.mine['mine.upgrades.buy']('mine_squad') as R<ViewShape>;
const board = (v: unknown) => ((v as ViewShape).header + '\n' + (v as ViewShape).lines.join('\n'));
const slots2 = board(f.mine['mine.helpers']()).includes('отряд: 0/2 слотов');
f.mine['mine.helpers.hire'](1);
f.mine['mine.helpers.hire'](2);
const b2 = f.mine['mine.upgrades.buy']('mine_squad') as R<ViewShape>;
const board3 = board(f.mine['mine.helpers']());
f.mine['mine.helpers.hire'](3);
const boardFull = board(f.mine['mine.helpers']());
const b3 = f.mine['mine.upgrades.buy']('mine_squad') as R<ViewShape>;
const hire4 = f.mine['mine.helpers.hire'](1) as R<ViewShape>;
console.log(JSON.stringify({
  barracks: b0.ok,
  b1: b1.ok, slots2,
  b2: b2.ok,
  b3_23: board3.includes('отряд: 2/3 слотов'),
  b3_33: boardFull.includes('отряд: 3/3'),
  b3ok: b3.ok, b3err: b3.ok ? null : b3.error, b3incl: b3.ok ? null : b3.error.includes('отряд полон'),
  h4ok: hire4.ok, h4err: hire4.ok ? null : hire4.error, h4incl: hire4.ok ? null : hire4.error.includes('отряд полон'),
  full: b1.ok && slots2 && b2.ok && board3.includes('отряд: 2/3 слотов') && boardFull.includes('отряд: 3/3') && !b3.ok && b3.error.includes('отряд полон') && !hire4.ok && hire4.error.includes('отряд полон'),
}, null, 1));
f.dispose();
