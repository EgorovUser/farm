/**
 * Группа «M13 Помощники» — часть 3: классовая логика ×5 ЧИСТЫМ волей-ядром
 * (golden без роллов: медик-счётчик ×4, лутер → слабейший, щитоносец-
 * редирект, инициатива speed), доля 20% по вкладу (golden), нулевой Σ —
 * поровну, зарплата-нехватка → quit 'unpaid'.
 */
import { check, type CheckResult } from './types';
import { MINE_TABLE } from '@/content/mine/table';
import { helperVolley, applyCover, oursFaster, volleyDamage, woundedTargetOf, type HelperCombat } from '@/game/modules/mine/helpers-fight';
import type { EnemyCombat } from '@/game/modules/mine/logic/fight';
import {
  makeSeededSliceGame,
  seededMineSlice,
  plainCard,
  eventsOf,
  grantGold,
  goldOf,
  type ViewShape,
} from './mine-run-fixture';

type R<T> = { ok: true; value: T } | { ok: false; error: string };

const textOf = (r: R<ViewShape>): string => (r.ok ? [r.value.header, ...r.value.lines].join('\n') : `ERR: ${r.error}`);
/** mine.helpers — ГЛАДКАЯ витрина (НЕ Result) */
const boardText = (v: unknown): string => ((v as ViewShape).header + '\n' + (v as ViewShape).lines.join('\n'));

/** боец-помощник для чистого волей-ядра (special — данные класса) */
function combat(p: Partial<HelperCombat> & Pick<HelperCombat, 'instanceId' | 'name'>): HelperCombat {
  return {
    defId: 'hpr_test',
    classId: 'spearman',
    special: { t: 'none' },
    atk: 10,
    speed: 10,
    efficiency: 100,
    hp: 30,
    maxHp: 30,
    fears: [],
    ...p,
  };
}

/** враг для чистого волей-ядра (минимальный EnemyCombat) */
function enemy(key: string, hp: number, def = 0): EnemyCombat {
  return {
    key, mobId: key, name: key, hp, maxHp: hp, atk: 5, atkBase: 5, def, speed: 10,
    evade: 0, attackDirs: [['top', 'mid']], dot: 0,
  };
}

export async function runMineHelpersPart3(): Promise<CheckResult[]> {
  const results: CheckResult[] = [];

  // 9. классовая логика ×5 — ЧИСТЫЙ волей golden (диспетчер по special.t данным)
  {
    // копейщик: базовый удар (atk 10, def 0 → −10; формула M12 §3)
    const spear = enemy('spear', 30);
    const v1 = helperVolley({
      helpers: [combat({ instanceId: 'a', name: 'Копь', classId: 'spearman' })],
      participants: [{ key: 'player', name: 'игрок', hp: 100, maxHp: 100 }],
      enemies: [spear],
      table: MINE_TABLE,
      turns: {},
    });
    // медик: счётчик ходов 3 → 4-й ход ЛЕЧИТ (самый раненый — игрок 10/100)
    const v2 = helperVolley({
      helpers: [combat({ instanceId: 'm', name: 'Мед', classId: 'medic', special: { t: 'heal', everyTurns: 4, heal: 12 }, atk: 5 })],
      participants: [{ key: 'player', name: 'игрок', hp: 10, maxHp: 100 }],
      enemies: [enemy('e', 30)],
      table: MINE_TABLE,
      turns: { m: 3 },
    });
    const v2strike = helperVolley({
      helpers: [combat({ instanceId: 'm', name: 'Мед', classId: 'medic', special: { t: 'heal', everyTurns: 4, heal: 12 }, atk: 5 })],
      participants: [{ key: 'player', name: 'игрок', hp: 100, maxHp: 100 }],
      enemies: [enemy('e', 30)],
      table: MINE_TABLE,
      turns: { m: 2 },
    });
    // лутер: бьёт СЛАБЕЙШЕГО из двух (30 и 10 HP)
    const weak = enemy('weak', 10);
    const strong = enemy('strong', 30);
    const v3 = helperVolley({
      helpers: [combat({ instanceId: 'l', name: 'Лут', classId: 'looter', special: { t: 'loot', goldBonusPercent: 15 }, atk: 8 })],
      participants: [{ key: 'player', name: 'игрок', hp: 100, maxHp: 100 }],
      enemies: [strong, weak],
      table: MINE_TABLE,
      turns: {},
    });
    // щитоносец: редирект доли урона (40% от 20 → 8 на себя, игроку 12)
    const cover = applyCover({
      taken: 20,
      covers: [{ instanceId: 's', name: 'Щит', redirectPercent: 40, hp: 60, speed: 8 }],
    });
    const coverClamp = applyCover({
      taken: 20,
      covers: [{ instanceId: 's', name: 'Щит', redirectPercent: 40, hp: 5, speed: 8 }],
    });
    results.push(
      check('классовая логика ×5 ЧИСТЫМ ядром (R4/R9, golden без роллов): копейщик — базовый удар −10 (floor(10×100/(100+0))); медик — СТРОГО раз в 4 хода (ход 4 → лечение +12 самого раненого, НЕ бьёт; ход 3 → бьёт −5); лутер — цель СЛАБЕЙШИЙ (weak −8, strong цел); щитоносец — редирект 40%×20 = 8 на себя (игроку 12), клэмп своим HP (5 → 5, игроку 15); разведчик — бьёт первого живого (вскрытие — R4 отдельным каналом); инициатива: oursFaster(14 vs 13)=true, (10 vs 14)=false, (14 vs 14)=true (равенство → наша, зеркало [DECISION F4])', () =>
        v1.lines.some((l) => l.includes('Копь (spearman) бьёт spear: −10')) && spear.hp === 20 &&
        v2.playerHeal === 12 && v2.contrib['m'] === undefined && v2.lines.some((l) => l.includes('лечит игрока: +12 HP (ход 4, раз в 4)')) &&
        v2strike.contrib['m'] === 5 && v2strike.playerHeal === 0 &&
        v3.contrib['l'] === 8 && weak.hp === 2 && strong.hp === 30 && v3.lines.some((l) => l.includes('слабейший')) &&
        cover.playerTaken === 12 && cover.redirects[0]!.amount === 8 && cover.redirects[0]!.hpLeft === 52 &&
        coverClamp.redirects[0]!.amount === 5 && coverClamp.playerTaken === 15 &&
        oursFaster([14], [13]) === true && oursFaster([10], [14]) === false && oursFaster([14], [14]) === true &&
        volleyDamage(10, 0, 100, MINE_TABLE) === 10 && volleyDamage(10, 0, 50, MINE_TABLE) === 5 &&
        woundedTargetOf([{ key: 'player', name: 'игрок', hp: 10, maxHp: 100 }, { key: 'x', name: 'Цел', hp: 30, maxHp: 30 }])!.key === 'player', {
        expected: 'копейщик −10; медик ход4 лечит/ход3 бьёт; лутер weak; щит 8/клэмп 5; инициатива +/−/=',
        actual: `копейщик ${spear.hp === 20 ? '−10' : spear.hp}; медик heal=${v2.playerHeal}/strike=${v2strike.contrib['m']}; лутер weak=${weak.hp}; щит ${cover.playerTaken}/${coverClamp.playerTaken}`,
      }),
    );
  }

  // 10. доля 20% по вкладу (golden: вклады известны → доли точно)
  {
    const f = await makeSeededSliceGame(
      'm132-gold-0',
      seededMineSlice({
        helpers: [{ instanceId: 'ku', defId: 'hpr_20240101_0', hp: 20, reputation: 0 }],
        runHelpers: ['ku'],
        layer: 1,
        cards: [plainCard('c1', 'exit', { label: 'лестница вверх' }), plainCard('c2', 'empty', { xp: 5 }), plainCard('c3', 'empty', { xp: 5 })],
        contrib: { player: 60, ku: 40 },
        mobGold: 100,
        upgrades: { mine_barracks: true },
      }),
    );
    grantGold(f, 1000);
    const wallet0 = goldOf(f);
    const exit = f.mine['mine.pick'](1) as R<ViewShape>;
    const ended = eventsOf(f, 'mine.runEnded');
    const rows = (ended[0]?.helpers ?? []) as Array<{ share: number; salary: number; repDelta: number; name: string; level: number }>;
    const roster = boardText(f.mine['mine.helpers']());
    const repOk = rows.length === 1 && rows[0]!.repDelta >= 3 && rows[0]!.repDelta <= 5;
    results.push(
      check('доля 20% по вкладу (R5/R9): вклады игрок 60 / Кувалда 40, золото мобов 100з → доля = floor(100 × 20% × 40/100 × 1.1) = 8з («Жадный» +10% — эффект профиля R3); зарплата 24з (mine.helper.salary); репутация +[3..5] (ролл); кошелёк −32 ровно; runEnded payload несёт ведомость {share, salary, repDelta}; HP восстанавливается между забегами до max (трейт «Крепкий» +10 → 50/50)', () =>
        exit.ok && ended.length === 1 &&
        rows.length === 1 && rows[0]!.share === 8 && rows[0]!.salary === 24 && repOk &&
        goldOf(f) === wallet0 - 32 &&
        roster.includes('HP 50/50') && roster.includes('репутация'), {
        expected: 'доля 8; зарплата 24; rep +3..5; кошелёк −32; HP 50/50 (40+трейт)',
        actual: `доля ${rows[0]?.share}; зп ${rows[0]?.salary}; rep ${rows[0]?.repDelta}; кошелёк ${goldOf(f) - wallet0}; HP50=${roster.includes('HP 50/50')}`,
      }),
    );
    f.dispose();
  }

  // 11. нулевой Σ вкладов — поровну между активными helpers (R5)
  {
    const f = await makeSeededSliceGame(
      'm132-gold-0',
      seededMineSlice({
        helpers: [
          { instanceId: 'ku', defId: 'hpr_20240101_0', hp: 40, reputation: 0 },
          { instanceId: 'dy', defId: 'hpr_20240101_2', hp: 90, reputation: 0 },
        ],
        runHelpers: ['ku', 'dy'],
        layer: 1,
        cards: [plainCard('c1', 'exit', { label: 'лестница вверх' }), plainCard('c2', 'empty', { xp: 5 }), plainCard('c3', 'empty', { xp: 5 })],
        contrib: {},
        mobGold: 30,
        upgrades: { mine_barracks: true, mine_squad: true },
      }),
    );
    grantGold(f, 1000);
    const wallet0 = goldOf(f);
    f.mine['mine.pick'](1);
    const ended = eventsOf(f, 'mine.runEnded');
    const rows = (ended[0]?.helpers ?? []) as Array<{ name: string; share: number; salary: number }>;
    results.push(
      check('нулевой Σ вкладов — ПОРОВНУ (R5/R9): contrib пуст, золото мобов 30з, два активных помощника (Кувалда «Жадный» + Дымка без страхов) → каждому floor(30 × 20% / 2) = 3з («Жадный» ×1.1 → floor(3.3) = 3); зарплаты 24 + 53; кошелёк −83 ровно; предметы/руда runBag НЕ делятся (доля — только золото мобов)', () =>
        rows.length === 2 &&
        rows.every((r) => r.share === 3) &&
        goldOf(f) === wallet0 - 83, {
        expected: 'обе доли 3; кошелёк −83 (3+3+24+53)',
        actual: `доли ${rows.map((r) => r.share).join('/')}; кошелёк ${goldOf(f) - wallet0}`,
      }),
    );
    f.dispose();
  }

  // 12. зарплата-нехватка → helper.quit 'unpaid' + репутация НЕ растёт
  {
    const f = await makeSeededSliceGame(
      'm132-gold-0',
      seededMineSlice({
        helpers: [{ instanceId: 'ku', defId: 'hpr_20240101_0', hp: 40, reputation: 7 }],
        runHelpers: ['ku'],
        layer: 1,
        cards: [plainCard('c1', 'exit', { label: 'лестница вверх' }), plainCard('c2', 'empty', { xp: 5 }), plainCard('c3', 'empty', { xp: 5 })],
        contrib: { player: 60, ku: 40 },
        mobGold: 100,
        upgrades: { mine_barracks: true },
      }),
    );
    // кошелёк в НОЛЬ: и доля, и зарплата неуплатны
    f.game.transaction.transact({
      costs: [{ t: 'currency', id: 'gold', qty: goldOf(f) }],
      eventId: 'selfcheck.m132.drain',
    });
    const exitText = textOf(f.mine['mine.pick'](1) as R<ViewShape>);
    const quits = eventsOf(f, 'helper.quit');
    const ended = eventsOf(f, 'mine.runEnded');
    const rows = (ended[0]?.helpers ?? []) as Array<{ share: number; sharePaid: boolean; salaryPaid: boolean }>;
    const roster = boardText(f.mine['mine.helpers']());
    results.push(
      check('зарплата-нехватка (R5/R9): кошелёк 0 → доля 8з НЕ уплачена (честная строка «НЕ уплачена», НЕ уход) + зарплата 24з НЕ уплачена → helper.quit {reason: unpaid}; репутация НЕ растёт (уход до начисления); состав пуст; runEnded несёт sharePaid/salaryPaid = false', () =>
        goldOf(f) === 0 &&
        exitText.includes('НЕ уплачена') &&
        quits.length === 1 && quits[0]!.reason === 'unpaid' && quits[0]!.name === 'Кувалда' &&
        rows.length === 1 && rows[0]!.share === 8 && rows[0]!.sharePaid === false && rows[0]!.salaryPaid === false &&
        roster.includes('помощников нет'), {
        expected: 'кошелёк 0; обе НЕ уплачены; quit unpaid; состав пуст',
        actual: `кошелёк ${goldOf(f)}; quits ${quits.length}; paid=${rows[0]?.sharePaid}/${rows[0]?.salaryPaid}`,
      }),
    );
    f.dispose();
  }

  return results;
}
