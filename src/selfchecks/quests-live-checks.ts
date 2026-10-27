/**
 * Self-checks M15 «Квесты и ачивки», часть 2 (бриф §4.7: 9–12 + связи):
 * напоминание 22:00, «ноль спец-обработчиков» (шаблон данными), награды
 * (квитанция/XP/passivePoint), сейв v10 (F5/холодная v3/срезов 14 — M05.1 · v10: +farm), санация П5,
 * ссылочная целостность контента (прецедент M09/M10: связи — чеками).
 * [M15.2] +: ачивка-данными (§7-1 карточки), гейт ачивки → флаг →
 * ассортимент M04 → покупка (§7-3, N10), целостность пула полного объёма.
 */
import { check, type CheckResult } from './types';
import { MemoryStorage } from '@/kernel/save/storage-drivers';
import {
  DAY_MS,
  QUESTS_T0,
  advanceWithCatchUp,
  claim,
  devComplete,
  devUnlock,
  flagsOf,
  giveItem,
  grantGold,
  listAch,
  listQuests,
  makeQuestsGame,
  makeSeededQuestsGame,
  type QuestsFixture,
} from './quests-fixture';
import { DAILY_QUESTS } from '@/content/quests/daily';
import { WEEKLY_QUESTS } from '@/content/quests/weekly';
import { CHAIN_QUESTS } from '@/content/quests/chains';
import { ACHIEVEMENTS } from '@/content/quests/achievements';
import { REWARD_ITEMS } from '@/content/items/catalog-rewards';
import { COUNTERS_TABLE } from '@/content/player/counters';
import { CURRENCY_INFO } from '@/content/player/currencies';
import { ITEMS } from '@/content/items/items';
import { questsChainsSchema, questsDailySchema } from '@/content/quests/schemas';
import type { AchievementDef, QuestDef, Reward } from '@/content/quests/types';

const byId = (id: string) => DAILY_QUESTS.find((q) => q.id === id)!;
const T22_05 = new Date(2024, 0, 1, 22, 5, 0, 0).getTime() - QUESTS_T0; // +10ч05м от T0

export async function runQuestsLiveChecks(): Promise<CheckResult[]> {
  const results: CheckResult[] = [];

  // ------------------------------------------- 9. напоминание 22:00 (карточка §3)
  const f9 = await makeSeededQuestsGame('m15-remind', undefined, [byId('qd_forge_lucky')]);
  devComplete(f9, 'qd_forge_lucky'); // завершён и НЕ забран → есть что напомнить
  const remindersBefore = f9.events.filter((e) => e.name === 'quest.reminder').length;
  (f9.game.clock as unknown as { advance(ms: number): void }).advance(T22_05);
  f9.game.time.tick(); // ЖИВОЙ hourTick (catchUp=false) часа 22
  const reminder = f9.events.find((e) => e.name === 'quest.reminder');
  claim(f9, 'qd_forge_lucky'); // после claim напоминать не о чем
  (f9.game.clock as unknown as { advance(ms: number): void }).advance(3_600_000); // 23:05
  f9.game.time.tick();
  results.push(
    check('напоминание 22:00: живой hourTick часа 22 публикует quest.reminder о незабранном; после claim — молчит', () =>
      remindersBefore === 0 &&
      reminder !== undefined &&
      Array.isArray(reminder.payload.unclaimed) &&
      (reminder.payload.unclaimed as Array<{ id: string }>).some((u) => u.id === 'qd_forge_lucky') &&
      f9.events.filter((e) => e.name === 'quest.reminder').length === 1),
  );
  f9.dispose();

  // ------------------------------------------- 10. ноль спец-обработчиков (§4.7-9 / §7 карточки)
  // тест-цепочка добавляется ДАННЫМИ (перерегистрация таблицы реестра — движок
  // не трогается): шаг на счётчик kernel.transactions.total поднимается событием
  const f10 = await makeSeededQuestsGame('m15-data');
  const testChain: QuestDef = {
    id: 'chain_selfcheck_probe',
    kind: 'chain',
    name: 'Чековый шаблон (фикстура)',
    ceremony: 'тест',
    steps: [
      {
        id: 'sc_probe_1',
        description: 'любая транзакция',
        condition: { t: 'counterAtLeast', counter: 'kernel.transactions.total', value: 1 },
        rewards: [{ t: 'currency', id: 'gold', qty: 5 }],
      },
    ],
  };
  f10.game.content.register('quests.chains', questsChainsSchema, [...CHAIN_QUESTS, testChain]);
  grantGold(f10, 3); // wallet.transaction → kernel.transactions.total=1 → шаг завершён
  const probeRow = listQuests(f10, 'chain').find((q) => q.id === 'chain_selfcheck_probe');
  results.push(
    check('ноль спец-обработчиков: НОВЫЙ шаблон в данных → прогресс и награда без правки кода (§7 карточки)', () =>
      probeRow !== undefined && probeRow.finished === true &&
      f10.game.wallet.get('gold') === 3 + 5 && // грант 3 + награда 5
      f10.events.some((e) => e.name === 'quest.completed' && e.payload.id === 'chain_selfcheck_probe')),
  );
  f10.dispose();

  // ------------------------------------------- 11. награды: квитанция/XP/passivePoint (§4.7-10)
  const f11 = await makeSeededQuestsGame('m15-rewards', undefined, [byId('qd_forge_lucky')]);
  const xpBefore = (f11.player['player.snapshot']() as { progress: { xp: number } }).progress.xp;
  devComplete(f11, 'qd_forge_lucky');
  const xpAfter = (f11.player['player.snapshot']() as { progress: { xp: number } }).progress.xp;
  const goldBefore11 = f11.game.wallet.get('gold');
  claim(f11, 'qd_forge_lucky');
  const claimTx = f11.events.find((e) => e.name === 'wallet.transaction' && e.payload.eventId === 'quest.claim');
  const xpEvent = f11.events.find((e) => e.name === 'player.xpGained' && e.payload.source === 'quest.completed');
  // passivePoint: weekly-цепочка (последний шаг) + hidden-ачивка
  const f11b = await makeSeededQuestsGame('m15-rewards-w');
  for (let i = 0; i < 4; i++) devComplete(f11b, 'qw_hardening_cycle');
  const lastStep = f11b.events
    .filter((e) => e.name === 'quest.completed' && e.payload.id === 'qw_hardening_cycle')
    .find((e) => e.payload.finished === true);
  devUnlock(f11b, 'ach_modesty');
  const modestyEv = f11b.events.find((e) => e.name === 'achievement.unlocked' && e.payload.id === 'ach_modesty');
  results.push(
    check('награды: квитанция (золото+гвозди одной транзакцией), XP начислен (канал M01), passivePoint-события опубликованы', () => {
      const grants = (claimTx?.payload.grants ?? []) as Array<{ id: string; qty: number }>;
      return (
        claimTx !== undefined && grants.length === 2 &&
        grants.some((g) => g.id === 'gold' && g.qty === 60) && grants.some((g) => g.id === 'nails' && g.qty === 6) &&
        f11.game.wallet.get('gold') === goldBefore11 + 60 && f11.game.wallet.get('nails') === 6 &&
        xpEvent !== undefined && xpEvent.payload.amount === 40 && xpBefore === 0 && xpAfter === 40 &&
        lastStep !== undefined &&
        (lastStep.payload.rewards as Reward[]).some((r) => r.t === 'passivePoint') &&
        modestyEv !== undefined && (modestyEv.payload.rewards as Reward[]).some((r) => r.t === 'passivePoint')
      );
    }),
  );
  f11.dispose();
  f11b.dispose();

  // ------------------------------------------- 12. сейв v9: F5-раундтрип + холодная v3 (§4.7-11)
  const storage12 = new MemoryStorage();
  const f12 = await makeSeededQuestsGame('m15-save', storage12, [byId('qd_forge_lucky'), byId('qd_stock_up')]);
  devComplete(f12, 'qd_forge_lucky');
  claim(f12, 'qd_forge_lucky');
  devUnlock(f12, 'ach_first_spark');
  giveItem(f12, 'bread'); // цепочка: шаг 1 в прогрессе (acquired 1/3)
  f12.dispose(); // сохраняет
  const f12r = makeQuestsGame(storage12);
  await f12r.game.init();
  const daily12 = listQuests(f12r, 'daily');
  const chain12 = listQuests(f12r, 'chain').find((q) => q.id === 'chain_homestead');
  const ach12 = listAch(f12r).find((a) => a.id === 'ach_first_spark');
  // холодная v3 → v9
  const cold = new MemoryStorage();
  await cold.set('main', JSON.stringify({
    saveVersion: 3, savedAt: QUESTS_T0, saveId: 'm15-cold-v3', contentVersion: '0.0.1', lastSeen: QUESTS_T0,
    modules: { 'kernel.wallet': { balances: [['gold', 777]] } },
  }));
  const f12c = makeQuestsGame(cold);
  await f12c.game.init();
  results.push(
    check('сейв v15: версия 15, срезов 19 (+mine [M12.1 · v15]); F5-раундтрип (ролл/claim/цепочка/флаги живы); холодная v3 → v15 [M08 · v13 → M11 · v14 → M12.1 · v15]', () => // [M05.1 · v10 → M06.1 · v11 → M07.1 · v12: +срезы pen/fishing]
      f12r.game.save.info().saveVersion === 15 &&
      f12r.game.save.info().slices.length === 19 &&
      f12r.game.save.info().slices.includes('quests') &&
      daily12.length === 2 && daily12.find((q) => q.id === 'qd_forge_lucky')?.claimed === true &&
      chain12 !== undefined && chain12.step === 1 && chain12.progress === 1 &&
      ach12?.unlocked === true &&
      (f12r.quests['quests.flags']() as string[]).includes('ach.forge.first') &&
      f12c.game.save.info().saveVersion === 15 && f12c.game.wallet.get('gold') === 777 &&
      f12c.game.save.info().slices.includes('quests') && listQuests(f12c, 'daily').length === 3),
  );
  f12r.dispose();
  f12c.dispose();

  // ------------------------------------------- 13. санация П5 (§4.7-12)
  const broken = new MemoryStorage();
  await broken.set('main', JSON.stringify({
    saveVersion: 9, savedAt: QUESTS_T0, saveId: 'm15-broken', contentVersion: '0.0.1', lastSeen: QUESTS_T0,
    modules: {
      'kernel.wallet': { balances: [['gold', 5]] },
      quests: {
        v: 1,
        daily: { key: '2044-01-01', ids: ['qd_gone_nope', 42, 'qd_forge_lucky'], baseline: { 'x=1': 'oops' }, rerollUsed: 'да', completed: [7], claimed: [], progress: { '!': -3 }, steps: {} },
        weekly: { key: '', ids: [], baseline: {}, rerollUsed: false, completed: [], claimed: [], progress: {}, steps: {} },
        chains: { step: { chain_homestead: 9999 }, granted: ['?:?'], progress: {} },
        achievements: { unlocked: [true, 'ach_first_spark'], claimed: [] },
        flags: [123, 'survivor.flag'],
      },
    },
  }));
  let brokenOk = true;
  let brokenRows: ReturnType<typeof listQuests> = [];
  let brokenAch: ReturnType<typeof listAch> = [];
  try {
    const f13 = makeQuestsGame(broken);
    await f13.game.init();
    brokenRows = listQuests(f13, 'daily');
    brokenAch = listAch(f13);
    f13.dispose();
  } catch {
    brokenOk = false;
  }
  results.push(
    check('санация П5: битый срез (мусорные id/типы/пределы) → дефолт без падения, мусор невидим', () =>
      brokenOk &&
      brokenRows.length === 3 && // ролл перевыведен на сегодня (битая дата 2044 → ensureDay)
      brokenRows.every((q) => q.goal >= 1) &&
      !brokenRows.some((q) => q.id === 'qd_gone_nope') &&
      brokenAch.some((a) => a.id === 'ach_first_spark') && !brokenAch.some((a) => a.id === 'true')),
  );

  // ------------------------------------------- 14. ссылочная целостность контента
  const counterIds = new Set(COUNTERS_TABLE.map((c) => c.id));
  const itemIds = new Set(ITEMS.map((i) => i.id));
  const brokenRefs: string[] = [];
  const checkRewards = (src: string, rewards: readonly Reward[] | undefined): void => {
    for (const r of rewards ?? []) {
      if (r.t === 'item' && !itemIds.has(r.defId)) brokenRefs.push(`${src}: предмет ${r.defId}`);
      if (r.t === 'currency' && !(r.id in CURRENCY_INFO)) brokenRefs.push(`${src}: валюта ${r.id}`);
    }
  };
  const walkCondition = (src: string, c: unknown): void => {
    if (c === null || typeof c !== 'object') return;
    const cond = c as { t?: string; counter?: string; c?: unknown; cs?: unknown[] };
    if (cond.t === 'counterAtLeast' && !counterIds.has(String(cond.counter))) {
      brokenRefs.push(`${src}: счётчик ${cond.counter}`);
    }
    if (cond.c !== undefined) walkCondition(src, cond.c);
    for (const sub of cond.cs ?? []) walkCondition(src, sub);
  };
  for (const q of [...DAILY_QUESTS, ...WEEKLY_QUESTS, ...CHAIN_QUESTS]) {
    for (const st of q.steps) {
      checkRewards(q.id, st.rewards);
      walkCondition(q.id, st.condition);
    }
  }
  for (const a of ACHIEVEMENTS) {
    checkRewards(a.id, a.rewards);
    walkCondition(a.id, a.condition);
  }
  results.push(
    check('целостность контента: награды ссылаются на живые предметы/валюты; counterAtLeast — на счётчики конфига', () =>
      brokenRefs.length === 0, { expected: '0 битых ссылок', actual: brokenRefs.slice(0, 5).join('; ') || '—' }),
  );

  // ------------------------------------------- 14b. [M15.2] целостность пула полного объёма
  // объёмы (N8 — по факту пула живых событий) + гейт-связи фикстур M04 (N10):
  // каждый unlock фикстуры ссылается на живую ачивку/производимый флаг,
  // флагов-гейтеров ≥ 5, каждая ачивка несёт unlockFlags, hidden ≥ 2
  const achIds = new Set(ACHIEVEMENTS.map((a) => a.id));
  const producedFlags = new Set<string>();
  for (const a of ACHIEVEMENTS) for (const fl of a.unlockFlags ?? []) producedFlags.add(fl);
  for (const q of [...DAILY_QUESTS, ...WEEKLY_QUESTS, ...CHAIN_QUESTS]) {
    for (const st of q.steps) for (const r of st.rewards) if (r.t === 'flag') producedFlags.add(r.flag);
  }
  const gateFixtureIssues: string[] = [];
  const gatingFlags = new Set<string>();
  for (const it of REWARD_ITEMS) {
    const u = it.unlock as { t?: string; id?: string; flag?: string } | undefined;
    if (!u) { gateFixtureIssues.push(`${it.id}: без unlock`); continue; }
    if (u.t === 'achievement') {
      if (!achIds.has(String(u.id))) gateFixtureIssues.push(`${it.id}: ачивка ${u.id}`);
      else { const a = ACHIEVEMENTS.find((x) => x.id === u.id); for (const fl of a?.unlockFlags ?? []) gatingFlags.add(fl); }
    } else if (u.t === 'flag') {
      if (!producedFlags.has(String(u.flag))) gateFixtureIssues.push(`${it.id}: флаг ${u.flag} не производится`);
      else gatingFlags.add(String(u.flag));
    } else gateFixtureIssues.push(`${it.id}: тип гейта ${u.t}`);
  }
  results.push(
    check('целостность пула M15.2: daily ≥ 30 по факту живых событий; weekly = 3 × 3–4 шага; ачивки ≥ 40, каждая с unlockFlags, hidden ≥ 2; фикстуры M04 гейтятся живыми ачивками/флагами (гейт-флагов ≥ 5)', () =>
      DAILY_QUESTS.length >= 30 &&
      WEEKLY_QUESTS.length === 3 && WEEKLY_QUESTS.every((w) => w.steps.length >= 3 && w.steps.length <= 4) &&
      ACHIEVEMENTS.length >= 40 &&
      ACHIEVEMENTS.every((a) => (a.unlockFlags ?? []).length > 0) &&
      ACHIEVEMENTS.filter((a) => a.hidden === true).length >= 2 &&
      gateFixtureIssues.length === 0 && gatingFlags.size >= 5,
      { expected: `daily ${DAILY_QUESTS.length}, weekly ${WEEKLY_QUESTS.length}, ачивок ${ACHIEVEMENTS.length}, hidden ${ACHIEVEMENTS.filter((a) => a.hidden === true).length}, гейт-флагов ${gatingFlags.size}`, actual: gateFixtureIssues.slice(0, 3).join('; ') || '—' }),
  );

  // ------------------------------------------- 15. манифест-паритет (D24, урок MEL-D)
  const f15 = await makeSeededQuestsGame('m15-manifest', undefined, [byId('qd_forge_lucky')]);
  const mounted = f15.game.modules.get('quests');
  const apiKeys = Object.keys(mounted?.api ?? {}).sort();
  const declaredApi = [...(mounted?.manifest.publicApi ?? [])].sort();
  const declaredEvents = [...(mounted?.manifest.eventsPublished ?? [])].sort();
  devComplete(f15, "qd_forge_lucky"); // completed в этой фикстуре живой
  results.push(
    check('манифест-паритет (D24): publicApi = фактические методы модуля; eventsPublished = объявленные события каталога', () =>
      mounted !== undefined &&
      JSON.stringify(declaredApi) === JSON.stringify(apiKeys) &&
      JSON.stringify(declaredEvents) === JSON.stringify(['achievement.unlocked', 'quest.completed', 'quest.progress', 'quest.reminder']) &&
      f15.events.some((e) => e.name === 'quest.completed'), // progress/reminder/unlocked — живые в чеках 3/8/9
      { expected: `${declaredApi.length} API / 4 события`, actual: `${apiKeys.length} API / ${declaredEvents.length} событий` }),
  );
  f15.dispose();

  // ------------------------------------------- 16. [M15.2] ачивка-данными (§7-1 карточки)
  // НОВАЯ ачивка регистрируется в реестре ДО init (перерегистрация таблицы —
  // движок не трогается): живое событие item.acquired ×2 → unlock + флаг +
  // событие achievement.unlocked — без единой строки кода
  const probeAch: AchievementDef = {
    id: 'ach_selfcheck_probe',
    name: 'Чековая ачивка (фикстура)',
    condition: { t: 'counterAtLeast', counter: 'items.acquired', value: 2 },
    rewards: [{ t: 'currency', id: 'gold', qty: 7 }],
    unlockFlags: ['probe.flag'],
  };
  const f16 = await makeSeededQuestsGame('m15-ach-data', undefined, undefined, [...ACHIEVEMENTS, probeAch]);
  giveItem(f16, 'bread'); // acquired 1 — порог ещё не взят
  const probeMidRow = listAch(f16).find((a) => a.id === 'ach_selfcheck_probe');
  giveItem(f16, 'bread'); // acquired 2 → счётчик → условие → unlock
  const probeAchRow = listAch(f16).find((a) => a.id === 'ach_selfcheck_probe');
  const probeEv = f16.events.find((e) => e.name === 'achievement.unlocked' && e.payload.id === 'ach_selfcheck_probe');
  results.push(
    check('ноль спец-обработчиков (АЧИВКА): новый шаблон ачивки в данных → счётчик → unlock + флаг + событие без пересборки (§7 карточки)', () =>
      probeMidRow !== undefined && probeMidRow.unlocked === false &&
      probeAchRow !== undefined && probeAchRow.unlocked === true &&
      probeEv !== undefined && probeEv.payload.hidden === false &&
      flagsOf(f16).includes('probe.flag')),
  );
  f16.dispose();

  // ------------------------------------------- 17. [M15.2] гейт ачивки → флаг → M04 → покупка (§7-3, N10)
  // живой интеграционный тест ROADMAP M15: каталог «что привозить» + постоянный
  // заказ → предмет в стоке ежедневно; покупка под гейтом — валидный отказ с
  // текстом; ачивка → unlockFlags → гейт открыт (оба пути: {t:'achievement'}
  // и {t:'flag'}) → покупка проходит
  const f17 = await makeSeededQuestsGame('m15-gate');
  grantGold(f17, 2500);
  const shop = f17.game.modules.get('shop')?.api ?? {};
  const pickA = shop['shop.branch.buy']('assortment', 'whetstone_of_luck') as { ok: boolean };
  const pinA = shop['shop.branch.buy']('permanent', 'whetstone_of_luck') as { ok: boolean };
  const pickB = shop['shop.branch.buy']('assortment', 'metallurgist_hammer') as { ok: boolean; error?: string };
  const pinB = shop['shop.branch.buy']('permanent', 'metallurgist_hammer') as { ok: boolean; error?: string };
  advanceWithCatchUp(f17, DAY_MS); // +1d → dayTick → свежий сток с заказами
  const stock17 = shop['shop.stock']() as { entries: Array<{ id: string; pinned?: boolean }> };
  const stockHas = (id: string): boolean => stock17.entries.some((e) => e.id === id && e.pinned === true);
  const buyLockedA = shop['shop.buy']('whetstone_of_luck', 1) as { ok: boolean; error?: string };
  const buyLockedB = shop['shop.buy']('metallurgist_hammer', 1) as { ok: boolean; error?: string };
  devUnlock(f17, 'ach_first_spark'); // ачивка → флаг ach.forge.first
  devUnlock(f17, 'ach_smelter_master'); // ачивка → флаг ach.smelter.master
  const gateFlags17 = flagsOf(f17);
  const gold17 = f17.game.wallet.get('gold');
  const buyOpenA = shop['shop.buy']('whetstone_of_luck', 1) as { ok: boolean };
  const buyOpenB = shop['shop.buy']('metallurgist_hammer', 1) as { ok: boolean };
  results.push(
    check('гейт ачивки открывает РЕАЛЬНЫЙ гейт магазина (§7-3/N10): фикс-предметы в стоке (заказ), покупка под гейтом — отказ с текстом, после ачивки — обе (achievement/flag) покупки проходят', () =>
      pickA.ok && pinA.ok && pickB.ok && pinB.ok &&
      stockHas('whetstone_of_luck') && stockHas('metallurgist_hammer') &&
      !buyLockedA.ok && String(buyLockedA.error).includes('ачивка') &&
      !buyLockedB.ok && String(buyLockedB.error).includes('ach.smelter.master') &&
      gateFlags17.includes('ach.forge.first') && gateFlags17.includes('ach.smelter.master') &&
      buyOpenA.ok && buyOpenB.ok && f17.game.wallet.get('gold') === gold17 - 68 - 650),
  );
  f17.dispose();

  return results;
}
