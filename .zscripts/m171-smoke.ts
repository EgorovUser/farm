// .zscripts/m171-smoke.ts — смоук социального модуля (не в дереве игры)
import { ManualClock } from '@/kernel/di/clock';
import { MemoryStorage } from '@/kernel/save/storage-drivers';
import { createGame } from '@/game/bootstrap';

const T0 = new Date(2026, 9, 30, 12, 0, 0, 0).getTime();

async function main() {
  const st = new MemoryStorage();
  await st.set('main', JSON.stringify({ saveVersion: 15, savedAt: T0, saveId: 'm171-smoke', contentVersion: '0.1.0-phase0', modules: {}, lastSeen: T0 }));
  const clock = new ManualClock(T0);
  const game = createGame(clock, st);
  await game.init();
  const social = game.modules.get('social')?.api ?? {};
  const village = game.modules.get('village')?.api ?? {};
  const player = game.modules.get('player')?.api ?? {};
  const quests = game.modules.get('quests')?.api ?? {};

  console.log('modules:', game.modules.list().length, 'social:', !!social['social.board']);
  const lockedBoard = social['social.board']() as { locked: boolean; gateLines: string[] };
  console.log('locked board:', JSON.stringify(lockedBoard).slice(0, 160));
  const lockedMail = social['social.mail']() as { locked: boolean };
  console.log('locked mail:', lockedMail.locked);
  const profile = social['social.profile']() as { title: string; achievements: { unlocked: number; pool: number } };
  console.log('profile locked-title:', profile.title, 'ach:', profile.achievements.unlocked, '/', profile.achievements.pool);

  // открываем деревню честно
  (player['player.addXp'] as (n: number, s: string) => unknown)(60000, 'smoke.gate');
  (quests['quests.unlockAch'] as (id: string) => unknown)('ach_homestead_master');
  (village['village.state'] as () => unknown)();
  const board1 = social['social.board']() as { locked: boolean; notes: Array<{ text: string }> };
  const board2 = social['social.board']() as { notes: Array<{ text: string }> };
  console.log('board unlocked:', !board1.locked, 'notes:', board1.notes.length);
  for (const n of board1.notes) console.log('  •', n.text);
  console.log('determinism:', JSON.stringify(board1.notes) === JSON.stringify(board2.notes));

  const mail1 = social['social.mail']() as { letters: Array<{ author: string; subject: string }>; unread: number };
  console.log('mail letters:', mail1.letters.length, 'unread:', mail1.unread);
  for (const l of mail1.letters) console.log('  ✉', l.author, '—', l.subject);
  const readMail = social['social.mail']('read') as { unread: number; mailReadDay: string | null };
  console.log('after read: unread', readMail.unread, 'marker', readMail.mailReadDay);

  await game.save.save();
  const raw = JSON.parse((await st.get('main')) as string) as { modules: Record<string, unknown> };
  console.log('save keys:', Object.keys(raw.modules).join(','));

  const forced = social['social.force']() as { header: string };
  console.log('force:', forced.header);
  const boardF = social['social.board']() as { notes: Array<{ text: string }> };
  console.log('after force notes:', boardF.notes.length, 'changed:', JSON.stringify(boardF.notes) !== JSON.stringify(board1.notes));
  const mailAfterForce = social['social.mail']() as { unread: number };
  console.log('mail after force unread (живучесть маркера):', mailAfterForce.unread);

  const prof2 = social['social.profile']() as { title: string; reputation: Array<{ partnerName: string; levelName: string; points: number }> };
  console.log('profile title:', prof2.title, 'reputation:', prof2.reputation.map((r) => `${r.partnerName}=${r.levelName}(${r.points})`).join(' '));
  game.dispose();
}

main().catch((e) => { console.error('FAIL', e); process.exit(1); });
