/**
 * Группа «M13 Помощники» — часть 2: страхи ЖИВЬЁМ в сеяных забегах —
 * тест-паук (стоит в стороне/без паука бьёт), «Мерзляк» (эффективность /2
 * на холодном слое), «Клаустрофоб» (10%-уход по журналу роллов; слой 1 —
 * условие ложно). Golden-доски 2024-01-01 сняты живой фикстурой
 * (.zscripts/dbg-m132-live.ts): m132-gold-0 [0] Кувалда medic [greedy,spiders]
 · [1] Брут medic rare [cold] · [2] Дымка shieldbearer []; m132-gold-3 [0]
 * Дымка spearman rare [claustrophobe].
 */
import { check, type CheckResult } from './types';
import {
  makeSeededSliceGame,
  seededMineSlice,
  mobCard,
  plainCard,
  eventsOf,
  grantGold,
  buffWin,
  type ViewShape,
} from './mine-run-fixture';

type R<T> = { ok: true; value: T } | { ok: false; error: string };

function linesOf(r: R<ViewShape>): string[] {
  return r.ok ? r.value.lines : [`ERR: ${r.error}`];
}
const textOf = (r: R<ViewShape>): string => linesOf(r).join('\n');
/** mine.helpers / mine.run — ГЛАДКИЕ витрины (НЕ Result) */
const boardText = (v: unknown): string => ((v as ViewShape).header + '\n' + (v as ViewShape).lines.join('\n'));

export async function runMineHelpersPart2(): Promise<CheckResult[]> {
  const results: CheckResult[] = [];

  // 6. тест-паук живьём: «боится пауков» — стоит в стороне; без паука — бьёт
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
        cards: [
          mobCard('c1', 'spider'), mobCard('c2', 'bat'), plainCard('c3', 'empty', { xp: 5 }),
          mobCard('c4', 'bat'), plainCard('c5', 'empty', { xp: 5 }), plainCard('c6', 'empty', { xp: 5 }),
        ],
        upgrades: { mine_barracks: true, mine_squad: true },
      }),
    );
    buffWin(f); // гарантированная победа игрока (канон фикстуры)
    f.game.buffs.add(
      { id: 'selfcheck.m132.speed', source: { kind: 'buff', refId: 'selfcheck' }, stat: 'mine.speed', op: 'flat', value: 100 },
      f.game.time.now(),
    );
    const spiderFight = linesOf(f.mine['mine.pick'](1) as R<ViewShape>).join('\n');
    const batFight = linesOf(f.mine['mine.pick'](1) as R<ViewShape>).join('\n');
    results.push(
      check('тест-паук живьём (карточка §6/R9): «боится пауков» — Кувалда СТОИТ В СТОРОНЕ в бою с пауком (не бьёт), Дымка (щитоносец без страхов) бьёт; без паука (летучая мышь) — Кувалда БЬЁТ: фильтр страхов в бою — универсальный eval ctx-тегов enemy:*, БЕЗ ветвлений по id страха', () =>
        spiderFight.includes('Кувалда стоит в стороне') &&
        spiderFight.includes('страх: Боится пауков') &&
        spiderFight.includes('Дымка (shieldbearer') && spiderFight.includes('бьёт Паук') &&
        !spiderFight.includes('Кувалда (medic') &&
        batFight.includes('Кувалда (medic') && batFight.includes('бьёт Летучая мышь') &&
        batFight.includes('Дымка (shieldbearer') && batFight.includes('бьёт Летучая мышь'), {
        expected: 'паук: Кувалда в стороне + Дымка бьёт; мышь: оба бьют',
        actual: `паук: в стороне=${spiderFight.includes('стоит в стороне')}, Дымка=${spiderFight.includes('Дымка (shieldbearer')}; мышь: Кувалда=${batFight.includes('Кувалда (medic')}`,
      }),
    );
    f.dispose();
  }

  // 7. «Мерзляк»: холодный слой — эффективность /2 (more −50 от страха)
  {
    const f = await makeSeededSliceGame(
      'm132-gold-0',
      seededMineSlice({
        helpers: [{ instanceId: 'br', defId: 'hpr_20240101_1', hp: 46, reputation: 0 }],
        runHelpers: ['br'],
        layer: 2,
        status: 'cold',
        cards: [mobCard('c1', 'bat'), plainCard('c2', 'empty', { xp: 5 }), plainCard('c3', 'empty', { xp: 5 })],
      }),
    );
    buffWin(f);
    f.game.buffs.add(
      { id: 'selfcheck.m132.speed', source: { kind: 'buff', refId: 'selfcheck' }, stat: 'mine.speed', op: 'flat', value: 100 },
      f.game.time.now(),
    );
    const eff = f.game.statBus.resolve({
      stat: 'mine.helper.efficiency',
      ctx: { ...f.game.time.ctx('player'), tags: ['mine', 'layer:2', 'status:cold', 'helper:br'] },
    });
    const effWarm = f.game.statBus.resolve({
      stat: 'mine.helper.efficiency',
      ctx: { ...f.game.time.ctx('player'), tags: ['mine', 'layer:1', 'helper:br'] },
    });
    const fight = linesOf(f.mine['mine.pick'](1) as R<ViewShape>).join('\n');
    results.push(
      check('«Мерзляк» — эффективность /2 на холодном слое (R3/R9; golden фикстуры): модификатор с условием {ctxTag status:cold} через conditions-канал runBuffProvider (R10) — resolve(mine.helper.efficiency) = 57 с тегом холодного слоя (трейт «Бодрый» Брута inc +15 → 115; more −50 «Мерзляка» → 57.5 → округление шины 57); витрина волей несёт «эффективность» и урон по формуле M12 §3 от эффективности', () =>
        effWarm === 115 && eff === 57 &&
        fight.includes('эффективность') && fight.includes('Брут (medic') && fight.includes('бьёт Летучая мышь'), {
        expected: 'resolve 57/115; строка эффективности; удар',
        actual: `eff=${eff}/${effWarm}; строка=${fight.includes('эффективность')}; удар=${fight.includes('бьёт Летучая мышь')}`,
      }),
    );
    f.dispose();
  }

  // 8. «Клаустрофоб»: слой 5+ → 10%-уход (фикс-сид; сверка с журналом роллов);
  //    слой 1 — условие ложно, ролла НЕТ (универсальный eval)
  {
    const f5 = await makeSeededSliceGame(
      'm132-gold-3',
      seededMineSlice({
        helpers: [{ instanceId: 'dy', defId: 'hpr_20240101_0', hp: 62, reputation: 0 }],
        runHelpers: ['dy'],
        layer: 5,
        column: 3,
        cards: [
          plainCard('c1', 'empty', { xp: 5 }), plainCard('c2', 'empty', { xp: 5 }), plainCard('c3', 'empty', { xp: 5 }),
          plainCard('c4', 'empty', { xp: 5 }), plainCard('c5', 'empty', { xp: 5 }), plainCard('c6', 'empty', { xp: 5 }),
          plainCard('c7', 'empty', { xp: 5 }), plainCard('c8', 'empty', { xp: 5 }), plainCard('c9', 'empty', { xp: 5 }),
        ],
        upgrades: { mine_barracks: true },
      }),
    );
    const logLenBefore = f5.game.rngBus.rollLog().list().length;
    f5.mine['mine.pick'](1);
    const fearRolls = f5.game.rngBus.rollLog().list().slice(logLenBefore).filter((e) => e.source.startsWith('mine:helper:fear:'));
    const quits5 = eventsOf(f5, 'helper.quit');
    const roster5 = boardText(f5.mine['mine.helpers']());
    const left = quits5.length === 1 && quits5[0]!.reason === 'fear';
    const u = fearRolls.length > 0 ? Number(fearRolls[fearRolls.length - 1]!.output) : -1;
    const f1 = await makeSeededSliceGame(
      'm132-gold-3',
      seededMineSlice({
        helpers: [{ instanceId: 'dy', defId: 'hpr_20240101_0', hp: 62, reputation: 0 }],
        runHelpers: ['dy'],
        layer: 1,
        column: 3,
        cards: [plainCard('c1', 'empty', { xp: 5 }), plainCard('c2', 'empty', { xp: 5 }), plainCard('c3', 'empty', { xp: 5 })],
      }),
    );
    const logLen1 = f1.game.rngBus.rollLog().list().length;
    f1.mine['mine.pick'](1);
    const fearRolls1 = f1.game.rngBus.rollLog().list().slice(logLen1).filter((e) => e.source.startsWith('mine:helper:fear:'));
    const quits1 = eventsOf(f1, 'helper.quit');
    results.push(
      check('«Клаустрофоб» (R3/R9): колонка 3 слоя 5 — ролл стримом mine:helper:fear:* (10%, шанс данными); уход = helper.quit {reason: fear} + покидает забег И отряд, забег продолжается; сверка с журналом роллов: (ролл < 0.10) ⇔ уход; слой 1 — условие {any[layer:5..9]} ЛОЖНО: ролла НЕТ, ухода НЕТ (универсальный eval, фикс-сид фикстуры)', () =>
        fearRolls.length === 1 &&
        u >= 0 && u < 1 &&
        (u < 0.1) === left &&
        (!left || (roster5.includes('помощников нет') && quits5[0]!.name === 'Дымка')) &&
        fearRolls1.length === 0 && quits1.length === 0, {
        expected: 'ролл ×1; (u<0.10)⇔ушёл; слой 1: 0 роллов 0 уходов',
        actual: `роллов ${fearRolls.length}; u=${u.toFixed(2)}; ушёл=${left}; слой-1: роллов ${fearRolls1.length}, уходов ${quits1.length}`,
      }),
    );
    f5.dispose();
    f1.dispose();
  }
  return results;
}
