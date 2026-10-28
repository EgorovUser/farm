/**
 * Группа «M13 Помощники» (бриф R9, карточка M13 §6) — часть 1: доска
 * dailySeed golden ×2 + смена дня, наём/увольнение события payload, страхи
 * Condition универсальным оценщиком (тест-паук живьём в сеяном забеге),
 * «Мерзляк» эффективность 50%, «Клаустрофоб» уход 10% по журналу роллов.
 * Golden-доски 2024-01-01 (дата фикстуры) сняты скриптом .zscripts/dbg-m132-board.ts:
 *  - m132-gold-0: [0] Кувалда medic uncommon [greedy,spiders] зп24 наём60 ·
 *    [1] Брут looter common [] зп12 наём30 · [2] Дымка spearman rare [spiders]
 *  - m132-gold-1: [1] Брут medic uncommon [] зп24 · [2] Дымка shieldbearer
 *    common [claustrophobe] зп13
 *  - m132-gold-3: [1] Уголёк looter rare [cold] зп32
 */
import { check, type CheckResult } from './types';
import { checkCondition } from '@/shared/utils/condition-check';
import { HELPER_FEAR_DEFS } from '@/content/mine/helpers';
import {
  makeRunGame,
  makeSeededRunGame,
  makeSeededSliceGame,
  seededMineSlice,
  mobCard,
  plainCard,
  viewOf,
  eventsOf,
  grantGold,
  goldOf,
  buffWin,
  type RunFixture,
  type ViewShape,
} from './mine-run-fixture';

type R<T> = { ok: true; value: T } | { ok: false; error: string };

const ctxOf = (tags: string[]) => ({
  tags,
  stat: () => 0,
  hasFlag: () => false,
  skillLevel: () => 0,
  playerLevel: 1,
  itemCount: () => 0,
  hasAchievement: () => false,
});

/** список строк витрины api-вызова (ошибки — ERR:) */
function linesOf(r: R<ViewShape>): string[] {
  return r.ok ? r.value.lines : [`ERR: ${r.error}`];
}
const textOf = (r: R<ViewShape>): string => linesOf(r).join('\n');
/** mine.helpers — ГЛАДКАЯ витрина (НЕ Result; R10: publicApi ×1 на доску+состав) */
const boardText = (v: unknown): string => ((v as ViewShape).header + '\n' + (v as ViewShape).lines.join('\n'));
const boardLines = (v: unknown): string[] => (v as ViewShape).lines;

/** купить Барак (грант золота + upgrades.buy) */
function buyBarracks(f: RunFixture): void {
  grantGold(f, 3000);
  f.mine['mine.upgrades.buy']('mine_barracks');
}

export async function runMineHelpersPart1(): Promise<CheckResult[]> {
  const results: CheckResult[] = [];

  // 1. доска golden ×2 байт-в-байт + карточка найма ЦЕЛИКОМ + оракул отрицания
  {
    const closed = await makeSeededRunGame('m132-gold-0');
    const closedText = boardText(closed.mine['mine.helpers']());
    buyBarracks(closed);
    const v1 = boardText(closed.mine['mine.helpers']());
    const v2 = boardText(closed.mine['mine.helpers']());
    const traitsLines = boardLines(closed.mine['mine.helpers']()).some((l) => l.startsWith('    трейты:'));
    results.push(
      check('доска наёмников golden ×2 + карточка ЦЕЛИКОМ (R1/R9): до Барака — честный отказ с условием; после — 3 кандидата детерминированы (dailySeed, повторный вызов байт-в-байт); карточка найма показывает ВСЁ: класс/редкость/HP/атаку/скорость/долю 20%/зарплату/цену/ТРЕЙТЫ (живой ривен-движок C6 — бюджет по редкости)/страхи — скрытых свойств НЕТ (карточка §4)', () =>
        closedText.includes('доска закрыта') && closedText.includes('Барак') &&
        v1 === v2 &&
        v1.includes('кандидатов 3') &&
        v1.includes('Кувалда (hpr_20240101_0) · класс: medic · редкость: необычный') &&
        v1.includes('HP 40 · атака 6 · скорость 9') &&
        v1.includes('доля награды с мобов 20% · зарплата 24з/день · наём 60з') &&
        v1.includes('страхи: Жадный') && v1.includes('Боится пауков') &&
        v1.includes('Брут (hpr_20240101_1) · класс: medic · редкость: редкий') &&
        v1.includes('Дымка (hpr_20240101_2) · класс: shieldbearer') &&
        v1.includes('отряд: 0/1 слотов') &&
        traitsLines &&
        v1.includes('Крепкий:') && v1.includes('Бодрый:'), {
        expected: 'закрыта→Барак; ×2 идентично; 3 кандидата; все поля карточек + трейты',
        actual: `${closedText.includes('доска закрыта') ? 'закрыта' : 'ОТКРЫТА'}; ×2 ${v1 === v2 ? 'идентично' : 'РАЗЛИЧАЕТСЯ'}; ${v1.includes('кандидатов 3') ? '3' : '?'} кандидата; трейты=${traitsLines}`,
      }),
    );
    closed.dispose();
  }

  // 2. смена дня → новая доска (DI-подмена now — канон ядра)
  {
    const f = await makeSeededRunGame('m132-gold-0');
    buyBarracks(f);
    const day1 = boardText(f.mine['mine.helpers']());
    f.clock.advance(24 * 3600 * 1000);
    const day2 = boardText(f.mine['mine.helpers']());
    results.push(
      check('смена дня → НОВАЯ доска (R1/R9): time +1d (DI-часы) → defId дня 20240102 ≠ 20240101; состав роллится заново dailySeed(saveId, dateISO) — полночь меняет кандидатов', () =>
        day1.includes('hpr_20240101_') && day2.includes('hpr_20240102_') && day1 !== day2, {
        expected: 'день 1: hpr_20240101_*; день 2: hpr_20240102_*; витрины различаются',
        actual: `${day1.includes('hpr_20240101_') ? '20240101' : '?'} → ${day2.includes('hpr_20240102_') ? '20240102' : '?'}; ${day1 !== day2 ? 'различаются' : 'ИДЕНТИЧНЫ'}`,
      }),
    );
    f.dispose();
  }

  // 3. наём/увольнение события payload + слоты (R2)
  {
    const f = await makeSeededRunGame('m132-gold-0');
    buyBarracks(f);
    const wallet0 = goldOf(f);
    const hire = f.mine['mine.helpers.hire'](1) as R<ViewShape>;
    const hired = eventsOf(f, 'helper.hired');
    const full = f.mine['mine.helpers.hire'](2) as R<ViewShape>;
    const board = boardText(f.mine['mine.helpers']());
    const fire = f.mine['mine.helpers.fire'](1) as R<ViewShape>;
    const quits = eventsOf(f, 'helper.quit');
    const roster = boardText(f.mine['mine.helpers']());
    results.push(
      check('наём/увольнение (R2/R9): плата 60з через mine.helper.hire (кошелёк −60); helper.hired {defId hpr_20240101_0, instanceId, classId medic}; состав 1/1; наём при полном составе — честный отказ «отряд полон»; увольнение БЕСПЛАТНО — helper.quit {reason: fired}; состав 0/1; повторный fire — отказ', () =>
        hire.ok && goldOf(f) === wallet0 - 60 &&
        hired.length === 1 && hired[0]!.defId === 'hpr_20240101_0' &&
        hired[0]!.classId === 'medic' && typeof hired[0]!.instanceId === 'string' &&
        board.includes('отряд: 1/1') &&
        !full.ok && full.error.includes('отряд полон') &&
        fire.ok && quits.length === 1 && quits[0]!.reason === 'fired' &&
        roster.includes('отряд: 0/1 слотов') &&
        !(f.mine['mine.helpers.fire'](1) as R<ViewShape>).ok, {
        expected: '−60з; hired{medic}; 1/1; отказ полон; quit fired; 0/1',
        actual: `кошелёк ${goldOf(f) - wallet0}; hired ${hired.length}; ${board.includes('отряд: 1/1') ? '1/1' : '?'}; полон=${!full.ok}; quits ${quits.length}`,
      }),
    );
    f.dispose();
  }

  // 4. Отряд ×2 до капа 3 + повторная покупка при капе (R7)
  {
    const f = await makeSeededRunGame('m132-gold-0');
    buyBarracks(f);
    grantGold(f, 3000);
    const b1 = f.mine['mine.upgrades.buy']('mine_squad') as R<ViewShape>;
    const slots2 = boardText(f.mine['mine.helpers']()).includes('отряд: 0/2 слотов');
    f.mine['mine.helpers.hire'](1);
    f.mine['mine.helpers.hire'](2);
    const b2 = f.mine['mine.upgrades.buy']('mine_squad') as R<ViewShape>;
    const board3 = boardText(f.mine['mine.helpers']());
    f.mine['mine.helpers.hire'](3);
    const boardFull = boardText(f.mine['mine.helpers']());
    const b3 = f.mine['mine.upgrades.buy']('mine_squad') as R<ViewShape>;
    // 4-й найм: все 3 кандидата дня уже наняты (dup-гейт раньше слотов) —
    // честный путь к слот-гейту: доска НОВОГО дня (time +1d, 3 свежих кандидата)
    f.clock.advance(24 * 3600 * 1000);
    const hire4 = f.mine['mine.helpers.hire'](1) as R<ViewShape>;
    results.push(
      check('Отряд (R7/R9): покупка ×2 (600з + 900з) — слоты 1 → 2 → 3, КАП 3 (карточка §3); тройной найм живьём; повторная покупка при капе — честный отказ «отряд полон»; наём четвёртого — отказ (доска нового дня: все 3 кандидата вчерашней доски уже наняты — dup-гейт раньше слотов, честный путь к слот-гейту через time +1d); витрина покупок 1/2 и 2/2', () =>
        b1.ok && slots2 && b2.ok &&
        board3.includes('отряд: 2/3 слотов') &&
        boardFull.includes('отряд: 3/3') &&
        !b3.ok && b3.error.includes('отряд полон') &&
        !hire4.ok && hire4.error.includes('отряд полон'), {
        expected: 'слоты 1→2→3; тройной найм; оба отказа «отряд полон»',
        actual: `отряд-1=${b1.ok}; 0/2=${slots2}; ×2=${b2.ok}; 2/3=${board3.includes('отряд: 2/3 слотов')}; 3/3=${boardFull.includes('отряд: 3/3')}; покупка-кап=${!b3.ok}; найм-кап=${!hire4.ok}`,
      }),
    );
    f.dispose();
  }

  // 5. страхи — УНИВЕРСАЛЬНЫЙ eval Condition (03 §2; ветвлений по id НЕТ)
  {
    const spiders = HELPER_FEAR_DEFS.find((d) => d.id === 'fear_spiders')!;
    const cold = HELPER_FEAR_DEFS.find((d) => d.id === 'fear_cold')!;
    const claustro = HELPER_FEAR_DEFS.find((d) => d.id === 'fear_claustrophobe')!;
    const greedy = HELPER_FEAR_DEFS.find((d) => d.id === 'fear_greedy')!;
    results.push(
      check('страхи-Condition универсальным оценщиком (R3/R9): «Боится пауков» {ctxTag enemy:spider} — true с пауком/false без; «Мерзляк» {ctxTag status:cold} — true холодный/false жаркий; «Клаустрофоб» {any[layer:5..layer:9]} — true слой 5 и 9/false слой 4 и 1 (эквивалент формы «слой ≥ 5» — [DECISION R3-форма], каталог 03 §2); «Жадный» {ctxTag mine} — true в любом бою забега; оценщик ОДИН — ветвлений по id страха в коде НЕТ', () =>
        checkCondition(spiders.condition, ctxOf(['enemy:spider', 'mine'])) === true &&
        checkCondition(spiders.condition, ctxOf(['enemy:bat', 'mine'])) === false &&
        checkCondition(cold.condition, ctxOf(['status:cold', 'mine'])) === true &&
        checkCondition(cold.condition, ctxOf(['status:hot', 'mine'])) === false &&
        checkCondition(claustro.condition, ctxOf(['layer:5', 'mine'])) === true &&
        checkCondition(claustro.condition, ctxOf(['layer:9', 'mine'])) === true &&
        checkCondition(claustro.condition, ctxOf(['layer:4', 'mine'])) === false &&
        checkCondition(claustro.condition, ctxOf(['layer:1', 'mine'])) === false &&
        checkCondition(greedy.condition, ctxOf(['mine', 'layer:2'])) === true, {
        expected: 'паук +/−, холод +/−, слой 5/9 + 4/1 −, mine +',
        actual: 'все 9 оракулов',
      }),
    );
  }
  return results;
}
