/**
 * Self-checks M15 «Квесты и ачивки», часть 1 (бриф §4.7: 1–8): детерминизм
 * dailySeed, замена 1/день, прогресс по событиям, фильтр счётчика, claim-
 * идемпотентность, невзятые награды, цепочки, ачивки + hidden.
 * Собирается с quests-live-checks.ts в ОДНУ группу «M15 · Квесты и ачивки»
 * (расщепление 01 §6 — файл превысил бы 300 строк).
 */
import { check, group, type CheckGroup, type CheckResult } from './types';
import { rollQuestIds } from '@/game/modules/quests/roll';
import { DAILY_QUESTS } from '@/content/quests/daily';
import { runQuestsLiveChecks } from './quests-live-checks';
import {
  advanceWithCatchUp,
  claim,
  devComplete,
  devUnlock,
  flagsOf,
  giveItem,
  grantGold,
  listAch,
  listQuests,
  makeSeededQuestsGame,
  reroll,
  setupForgeSuccess,
  type QuestsFixture,
} from './quests-fixture';

const byId = (id: string) => DAILY_QUESTS.find((q) => q.id === id)!;

/** сколько транзакций с eventId выдано (квитанции — факт, П6) */
export function txCount(f: QuestsFixture, eventId: string): number {
  return f.events.filter((e) => e.name === 'wallet.transaction' && e.payload.eventId === eventId).length;
}

export async function runQuestsChecks(): Promise<CheckGroup> {
  const results: CheckResult[] = [];

  // ------------------------------------------- 1. dailySeed-детерминизм (§4.7-1)
  const pool = DAILY_QUESTS.map((q) => q.id);
  const r1a = rollQuestIds('m15-det', '2024-01-01', DAILY_QUESTS, 3, 'quests:daily');
  const r1b = rollQuestIds('m15-det', '2024-01-01', DAILY_QUESTS, 3, 'quests:daily');
  const r2 = rollQuestIds('m15-det', '2024-01-02', DAILY_QUESTS, 3, 'quests:daily');
  const f1 = await makeSeededQuestsGame('m15-det');
  const f1b = await makeSeededQuestsGame('m15-det');
  results.push(
    check('dailySeed-детерминизм: те же (saveId, дата) → тот же набор 3; +1d → новый набор', () =>
      JSON.stringify(r1a) === JSON.stringify(r1b) &&
      r1a.length === 3 && new Set(r1a).size === 3 && r1a.every((id) => pool.includes(id)) &&
      JSON.stringify(r1a) !== JSON.stringify(r2) &&
      JSON.stringify(listQuests(f1, 'daily').map((q) => q.id)) === JSON.stringify(r1a) &&
      JSON.stringify(listQuests(f1b, 'daily').map((q) => q.id)) === JSON.stringify(r1a)),
  );
  f1b.dispose();

  // ------------------------------------------- 2. замена 1/день (§4.7-2)
  const f2 = await makeSeededQuestsGame('m15-reroll', undefined, [
    byId('qd_forge_lucky'), byId('qd_forge_warmup'), byId('qd_stock_up'), byId('qd_trade_day'),
  ]);
  const before = listQuests(f2, 'daily').map((q) => q.id);
  const rr1 = reroll(f2, before[0]!);
  const afterRr = listQuests(f2, 'daily').map((q) => q.id);
  const rr2 = reroll(f2, afterRr[0]!);
  advanceWithCatchUp(f2, 86_400_000); // +1d → новый день, замена снова доступна
  const day2 = listQuests(f2, 'daily').map((q) => q.id);
  const rr3 = reroll(f2, day2[0]!);
  results.push(
    check('замена 1/день: меняет квест; вторая — валидный отказ; после +1d снова доступна', () =>
      rr1.ok && !afterRr.includes(before[0]) && afterRr.length === 3 &&
      !rr2.ok && rr2.error.includes('израсходована') &&
      day2.length === 3 && JSON.stringify(day2) !== JSON.stringify(afterRr) &&
      rr3.ok),
  );
  f2.dispose();

  // ------------------------------------------- 3. прогресс по событию (§4.7-3)
  const f3 = await makeSeededQuestsGame('m15-progress', undefined, [byId('qd_forge_lucky'), byId('qd_forge_warmup')]);
  const sword = setupForgeSuccess(f3, 'progress');
  f3.forge['forge.attempt'](sword); // успех → forge.success=1, карточки auto
  f3.forge['forge.attempt'](sword); // успех → forge.success=2 ≥ цели шаблона
  const luckyRow = listQuests(f3, 'daily').find((q) => q.id === 'qd_forge_lucky');
  results.push(
    check('прогресс по событию: forge force success ×2 → quest.progress в ленте и quest.completed (события живы)', () => {
      const progressEvents = f3.events.filter((e) => e.name === 'quest.progress' && e.payload.id === 'qd_forge_lucky');
      const completed = f3.events.find((e) => e.name === 'quest.completed' && e.payload.id === 'qd_forge_lucky');
      return (
        luckyRow !== undefined && luckyRow.completed && luckyRow.claimable &&
        progressEvents.length >= 1 && completed !== undefined &&
        completed.payload.finished === true && completed.payload.xp === 40
      );
    }),
  );
  f3.dispose();

  // ------------------------------------------- 4. фильтр счётчика (§4.7-4)
  const f4 = await makeSeededQuestsGame('m15-filter');
  const sword4 = setupForgeSuccess(f4, 'filter');
  f4.forge['forge.attempt'](sword4); // карточные роллы: modforge.rolled source='forge:card:...'
  const rerollsAfterCards = f4.game.stats.get('modforge.rerolls');
  giveItem(f4, 'iron_pickaxe');
  grantGold(f4, 100);
  const pick = (f4.inv['inventory.list']() as Array<{ iid: string; defId: string }>).find((i) => i.defId === 'iron_pickaxe');
  const rerollResult = f4.game.modules.get('modforge')?.api['modforge.reroll'](pick?.iid) as { ok: boolean; error?: string };
  results.push(
    check('фильтр defId: карточные роллы заточки (source=modforge.rollFor) НЕ считаются рероллами; mods reroll — считается', () =>
      rerollsAfterCards === 0 &&
      (f4.events.filter((e) => e.name === 'modforge.rolled').some((e) => e.payload.source === 'modforge.rollFor')) &&
      rerollResult.ok === true && f4.game.stats.get('modforge.rerolls') === 1),
  );
  f4.dispose();

  // ------------------------------------------- 5. claim-идемпотентность (§4.7-5)
  const f5 = await makeSeededQuestsGame('m15-claim', undefined, [byId('qd_forge_lucky')]);
  devComplete(f5, 'qd_forge_lucky');
  const goldBefore = f5.game.wallet.get('gold');
  const c1 = claim(f5, 'qd_forge_lucky');
  const goldAfter1 = f5.game.wallet.get('gold');
  const c2 = claim(f5, 'qd_forge_lucky');
  results.push(
    check('claim-идемпотентность: выдаёт один раз; повтор — валидный отказ (no-op); транзакция ОДНА', () =>
      c1.ok && goldAfter1 === goldBefore + 60 &&
      !c2.ok && c2.error.includes('уже получена') &&
      txCount(f5, 'quest.claim') === 1 && f5.game.wallet.get('gold') === goldAfter1),
  );
  f5.dispose();

  // ------------------------------------------- 6. невзятая награда пропадает (§4.7-6)
  const f6 = await makeSeededQuestsGame('m15-vanish', undefined, [byId('qd_forge_lucky'), byId('qd_stock_up')]);
  devComplete(f6, 'qd_forge_lucky'); // завершён, НЕ забран
  const gold6 = f6.game.wallet.get('gold');
  const nails6 = f6.game.wallet.get('nails');
  advanceWithCatchUp(f6, 86_400_000); // +1d: ролл нового дня, «прогресс не переносится»
  const row6 = listQuests(f6, 'daily').find((q) => q.id === 'qd_forge_lucky');
  results.push(
    check('невзятая награда пропадает: +1d без claim → день перероин, прогресс/claim сброшены, золото/гвозди НЕ выданы', () =>
      row6 !== undefined && row6.completed === false && row6.claimed === false && row6.claimable === false && row6.progress === 0 &&
      f6.game.wallet.get('gold') === gold6 && f6.game.wallet.get('nails') === nails6),
  );
  f6.dispose();

  // ------------------------------------------- 7. цепочка: строго последовательно (§4.7-7)
  // [DECISION] гейт выдачи: доска дел хутора оживается после первого ЗАБРАННОГО
  // вознаграждения — dev-завершение + claim открывают цепочку (quests.claimed ≥ 1)
  const f7 = await makeSeededQuestsGame('m15-chain');
  const lockedBefore = listQuests(f7, 'chain').find((q) => q.id === 'chain_homestead');
  const firstDaily = listQuests(f7, 'daily')[0]!.id;
  devComplete(f7, firstDaily); // первое поручение выполнено…
  const stillLocked = listQuests(f7, 'chain').find((q) => q.id === 'chain_homestead');
  claim(f7, firstDaily); // …и вознаграждение ЗАБРАНО → цепочка открыта
  const openedRow = listQuests(f7, 'chain').find((q) => q.id === 'chain_homestead');
  giveItem(f7, 'bread'); // acquired 1 — шаг 1 (≥3) не завершён
  f7.inv['inventory.sell']('bread', 1); // sell.items=1 ≥ цели шага 2 — но шаг 2 ещё закрыт
  const stepAfterSell = listQuests(f7, 'chain').find((q) => q.id === 'chain_homestead');
  giveItem(f7, 'bread', 2); // acquired 3 → шаг 1 завершён → шаг 2 (sell=1) завершён автоматически
  const chainRow = listQuests(f7, 'chain').find((q) => q.id === 'chain_homestead');
  const gold7 = f7.game.wallet.get('gold');
  giveItem(f7, 'bread'); // лишнее событие → sync: повторное выполнение шагов — no-op
  listQuests(f7, 'chain'); // ленивый ре-синк (список = переоценка)
  results.push(
    check('цепочка: гейт выдачи (до первого ЗАБРАННОГО вознаграждения — видна с условием, не идёт); шаг 2 не прогрессирует до шага 1; повторы — no-op', () => {
      const completed7 = f7.events.filter((e) => e.name === 'quest.completed' && e.payload.id === 'chain_homestead');
      return (
        lockedBefore !== undefined && lockedBefore.locked === true && lockedBefore.progress === 0 &&
        stillLocked !== undefined && stillLocked.locked === true && // выполнение без claim цепочку НЕ открывает
        openedRow !== undefined && openedRow.locked === false &&
        stepAfterSell !== undefined && stepAfterSell.step === 1 && stepAfterSell.progress === 1 &&
        chainRow !== undefined && chainRow.step === 3 && completed7.length === 2 &&
        f7.game.wallet.get('gold') === gold7 && // шаги 1-2 выданы ровно один раз (25+30 до замера)
        f7.events.filter((e) => e.name === 'wallet.transaction' && e.payload.eventId === 'quest.chain').length === 2 // по транзакции на шаг
      );
    }),
  );
  f7.dispose();

  // ------------------------------------------- 8. ачивка: порог → событие + флаг; hidden (§4.7-8)
  const f8 = await makeSeededQuestsGame('m15-ach');
  const hiddenBefore = listAch(f8).some((a) => a.id === 'ach_modesty');
  const sword8 = setupForgeSuccess(f8, 'ach');
  f8.forge['forge.attempt'](sword8); // forge.success=1 ≥ порога ach_first_spark
  const unlockedEv = f8.events.find((e) => e.name === 'achievement.unlocked' && e.payload.id === 'ach_first_spark');
  const unlockedRow = listAch(f8).find((a) => a.id === 'ach_first_spark');
  devUnlock(f8, 'ach_modesty');
  const modestyRow = listAch(f8).find((a) => a.id === 'ach_modesty');
  results.push(
    check('ачивка: порог счётчика → achievement.unlocked + флаг; hidden до unlock не видна, после — видна', () =>
      hiddenBefore === false &&
      unlockedEv !== undefined && unlockedEv.payload.hidden === false &&
      unlockedRow !== undefined && unlockedRow.unlocked === true &&
      flagsOf(f8).includes('ach.forge.first') &&
      modestyRow !== undefined && modestyRow.unlocked === true && flagsOf(f8).includes('ach.forge.modest')),
  );
  f8.dispose();

  // ------------------------------------------- живые пробы (quests-live-checks.ts)
  results.push(...(await runQuestsLiveChecks()));

  return group('M15 · Квесты и ачивки', results);
}
