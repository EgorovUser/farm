/**
 * Группа «M13 Забег» · ЧАСТЬ 3/3 (FIX-M13, бриф §2/§3): предписания аудита
 * AUDIT-M13 — P1 BLOCKER-1 (край обвала: гейт засыпания по ЦЕЛИ + неприят-
 * косновенность выхода) и P2 MISS-2 (трофей босса — гейт-предмет в обход
 * D23-вместимости, контракт награды M12 §4). Живые зеркала границ:
 * обвал@кол.3 → босс цел/забег продолжается; обвал@кол.4 → босс цел/свиток
 * доступен/забег завершаем; инвентарь 20/20 → победа → трофей доставлен
 * в обход D23 + ach_mine_boss_N + следующий слой зелёный.
 */
import { check, type CheckResult } from './types';
import {
  makeSeededRunGame,
  makeSeededSliceGame,
  seededMineSlice,
  viewOf,
  eventsOf,
  equipPickaxe,
  grantGold,
  buffWin,
  fillInventory,
  backpackCount,
  type ViewShape,
  type R,
} from './mine-run-fixture';
import { findRun, slotOf, kindsOf } from './mine-run-part1';

/** unsafe для пути чека: крот/выход/обвал ломают детерминированный прогон */
const unsafeKind = (k: string): boolean => k === 'trader' || k === 'exit' || k === 'collapse';

export async function runMineRunPart3(): Promise<CheckResult[]> {
  const results: CheckResult[] = [];

  // 18. [FIX-M13 · P1] обвал@кол.3: bury в колонке 4, карта-босс ЦЕЛА, победа достижима
  {
    const { f, cols } = await findRun('fix13col3', (c) =>
      kindsOf(c[2]!).includes('collapse') &&
      [c[0]!, c[1]!, c[3]!].every((col) => col.every((x) => !unsafeKind(x.kind))),
    );
    equipPickaxe(f, 'D');
    buffWin(f);
    const topUp = (): void => {
      (f.player['player.setHp'] as (n: number) => unknown)(50);
    };
    const enter = f.mine['mine.enter'](1) as R<ViewShape>;
    f.mine['mine.pick'](1); // колонка 1
    topUp();
    f.mine['mine.pick'](1); // колонка 2
    topUp();
    const collapse = viewOf(f.mine['mine.pick'](String(slotOf(kindsOf(cols[2]!), 'collapse'))) as R<ViewShape>);
    const modeOn = (f.mine['mine.run']() as ViewShape).lines.join('\n');
    const buryR = f.mine['mine.pick']('1') as R<ViewShape>;
    const bury = viewOf(buryR);
    const afterBury = (f.mine['mine.run']() as ViewShape).lines.join('\n');
    f.mine['mine.pick'](1); // колонка 4 (2 живых) → колонка 5
    const finale = (f.mine['mine.run']() as ViewShape).lines.join('\n');
    f.mine['mine.pick'](1); // финальная карта-босс → победа (buffWin)
    const ended = eventsOf(f, 'mine.runEnded');
    results.push(
      check('граница обвала 3→4 [FIX-M13 · P1 / DECISION FIX13-1]: обвал на колонке 3 грозит колонке 4 (НЕ финалу); засыпается карта колонки 4 (слайс по пре-сдвиговой колонке разрешения); карта-босс НЕ предлагается и НЕ засыпается — «босса уничтожить нельзя»; забег продолжается (колонка 4/4, выбор из 2) и победа над боссом достижима (runEnded boss); свиток/зелья в режиме обвала не перехватываются (витрина режима честна)', () =>
        enter.ok &&
        collapse.includes('ОБВАЛ!') && collapse.includes('обвал грозит СЛЕДУЮЩЕЙ колонке (колонка 4)') &&
        modeOn.includes('РЕЖИМ ОБВАЛА') && modeOn.includes('свиток mine pick 0') &&
        buryR.ok && bury.includes('колонки 4 уничтожена') &&
        !bury.includes('босс') &&
        afterBury.includes('колонка 4/4') && afterBury.includes('выбор из 2') &&
        finale.includes('ФИНАЛ: босс:') &&
        ended.length === 1 && ended[0]!.reason === 'boss', {
        expected: 'bury@кол.4; босс цел (ФИНАЛ предлагает босса); runEnded boss',
        actual: `угроза=${collapse.includes('колонке 4') ? 'кол.4' : '?'}; bury=${bury.slice(0, 60)}; финал=${finale.includes('ФИНАЛ: босс:') ? 'босс жив' : 'БОСС ПОТЕРЯН'}; конец=${String(ended[0]?.reason ?? '—')}`,
      }),
    );
    f.dispose();
  }

  // 19. [FIX-M13 · P1] обвал@кол.4: следующая колонка — финал с боссом,
  //     засыпать нечего: честное закрытие БЕЗ лока; свиток-выход доступен
  {
    const { f, cols } = await findRun('fix13col4', (c) =>
      kindsOf(c[3]!).includes('collapse') &&
      [c[0]!, c[1]!, c[2]!].every((col) => col.every((x) => !unsafeKind(x.kind))),
    );
    equipPickaxe(f, 'D');
    buffWin(f);
    const topUp = (): void => {
      (f.player['player.setHp'] as (n: number) => unknown)(50);
    };
    const enter = f.mine['mine.enter'](1) as R<ViewShape>;
    f.mine['mine.pick'](1);
    topUp();
    f.mine['mine.pick'](1);
    topUp();
    f.mine['mine.pick'](1);
    topUp();
    const collapse = viewOf(f.mine['mine.pick'](String(slotOf(kindsOf(cols[3]!), 'collapse'))) as R<ViewShape>);
    const after = (f.mine['mine.run']() as ViewShape).lines.join('\n');
    // свиток-выход доступен ВСЕГДА (неприкосновенность выхода; лока НЕТ)
    (f.inv['inventory.add'] as (d: string, t: string, v: number, q: number, s: string) => R<unknown>)(
      'scroll_exit', 'D', 50, 1, 'selfcheck',
    );
    const scrollR = f.mine['mine.pick']('0') as R<ViewShape>;
    const scroll = viewOf(scrollR);
    const ended = eventsOf(f, 'mine.runEnded');
    results.push(
      check('граница обвала 4→5 [FIX-M13 · P1 / DECISION FIX13-1]: обвал на колонке 4 → следующая колонка — финал с картой-боссом → засыпать НЕЧЕГО (ЦЕЛЬ неприкосновенна) — обвал закрывается честной витриной БЕЗ установки режима и БЕЗ лока (карта-босс цела: ФИНАЛ предлагает босса); свиток выхода доступен: mine pick 0 → runEnded exit (ранее — вечный забег: гейт отклонял все выборы, свиток/зелья перехватывались — AUDIT-M13-BLOCKER-1)', () =>
        enter.ok &&
        collapse.includes('обвал отыгран — засыпать нечего') && collapse.includes('босса уничтожить нельзя') &&
        !after.includes('РЕЖИМ ОБВАЛА') &&
        after.includes('ФИНАЛ: босс:') &&
        scrollR.ok && scroll.includes('добровольный выход') &&
        ended.length === 1 && ended[0]!.reason === 'exit', {
        expected: 'честное закрытие; босс цел; свиток exit; лока НЕТ',
        actual: `закрытие=${collapse.includes('засыпать нечего') ? 'да' : 'НЕТ'}; режим=${after.includes('РЕЖИМ ОБВАЛА') ? 'ВКЛЮЧЕН (дефект)' : 'выключен'}; босс=${after.includes('ФИНАЛ: босс:') ? 'жив' : 'ПОТЕРЯН'}; свиток=${scrollR.ok ? 'exit ок' : `ОТКАЗ: ${scroll}`}; конец=${String(ended[0]?.reason ?? '—')}`,
      }),
    );
    f.dispose();
  }

  // 20. [FIX-M13 · P2] трофей босса — ГЕЙТ-ПРЕДМЕТ в обход D23 (инвентарь 20/20)
  {
    const f = await makeSeededSliceGame(
      'm13x-trophy',
      seededMineSlice({ helpers: [], runHelpers: [], layer: 1, column: 5, cards: [] }),
    );
    equipPickaxe(f, 'D');
    buffWin(f);
    fillInventory(f, 20, 'trophy'); // рюкзак 20/20 — граница вместимости
    const before = backpackCount(f);
    const boss = viewOf(f.mine['mine.pick'](1) as R<ViewShape>); // финальная карта-босс → победа
    const ended = eventsOf(f, 'mine.runEnded');
    const lostByCap = (ended[0]?.lostByCapacity ?? []) as Array<{ defId: string; qty: number }>;
    const trophyLost = lostByCap.some((l) => l.defId === 'trophy_mine_1');
    const invList = (f.inv['inventory.list'] as () => Array<{ defId: string; qty: number }>)();
    const trophy = invList.find((i) => i.defId === 'trophy_mine_1');
    const ach = eventsOf(f, 'achievement.unlocked').find((a) => a.id === 'ach_mine_boss_1');
    const after = backpackCount(f);
    const enter2 = viewOf(f.mine['mine.enter'](2) as R<ViewShape>);
    results.push(
      check('трофей босса — гейт-предмет в обход D23 [FIX-M13 · P2 / DECISION FIX13-2]: инвентарь 20/20 → победа над боссом слоя 1 → трофей trophy_mine_1 выдан ГРАНТОМ ТРАНЗАКЦИИ (ItemPort enforceCapacity:false — канал песочницы M12.2) в обход вместимости с честной строкой «гейт-предмет: выдан в обход вместимости»; руда и A+-предмет — ЛУТ: утраты по D23 честны поимённо (контраст); achievement.unlocked ach_mine_boss_1 (auto-claim M15 по item.acquired — hasItem по факту первой победы); следующий слой ЗЕЛЁНЫЙ: mine enter 2 проходит (ранее трофей терялся поимённо → ачивка-гейт слоя не открывался — AUDIT-M13-MISS-2)', () =>
        before === 20 &&
        boss.includes('ПОБЕДА над боссом') && boss.includes('гейт-предмет: выдан в обход вместимости') &&
        ended.length === 1 && ended[0]!.reason === 'boss' &&
        !trophyLost && lostByCap.length >= 1 &&
        trophy !== undefined && trophy.qty >= 1 &&
        after === 21 &&
        ach !== undefined &&
        enter2.includes('ЗАБЕГ НАЧАТ'), {
        expected: '20/20 → трофей доставлен (21); лут потерян поимённо; ачивка; слой 2 зелёный',
        actual: `${before} → ${after}; трофей=${trophy !== undefined ? 'в рюкзаке' : 'ПОТЕРЯН'}; в утратах=${trophyLost ? 'ДА (дефект)' : 'нет'}; лут-утраты ${lostByCap.length}; ачивка=${ach !== undefined ? 'открыта' : 'НЕТ'}; слой2=${enter2.includes('ЗАБЕГ НАЧАТ') ? 'зелёный' : 'ЗАКРЫТ'}`,
      }),
    );
    f.dispose();
  }

  return results;
}
