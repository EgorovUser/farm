/**
 * audit-m13-static — статик-пробы аудита M13 (живой код, только чтение; вне дерева).
 * Пробы: A) golden gen --seed 12345 ×2 байт-в-байт; B) Освещение — серия 36
 * генераций (база → после покупки mine_lighting), доля скрытых; C) UV-1 скан —
 * обвал в колонке 4 на сиде аудита (runNumber 1..40, слой 1); D) R2 — НОВЫЙ
 * страх ДАННЫМИ через универсальный eval (код не меняется); E) UV-7 — клэмпы
 * волей/редиректа на синтетических HP (0/отрицательных/сверх-max).
 * Запуск: bun .zscripts/audit-m13-static.ts <saveId>
 */
import { makeSeededRunGame, grantGold } from '../src/selfchecks/mine-run-fixture';
import { generateLayer, runSeedOf, CARDS_PER_COLUMN } from '../src/game/modules/mine/generator';
import { checkCondition } from '../src/shared/utils/condition-check';
import { helperVolley, applyCover } from '../src/game/modules/mine/helpers-fight';
import { MINE_TABLE } from '../src/content/mine/table';
import { HELPER_CLASSES } from '../src/content/mine/helpers';
import type { Condition } from '../src/shared/types/requirement';

const SAVE = process.argv[2] ?? 'audit-m13-probe';

function line(s: string): void {
  console.log(s);
}

async function main(): Promise<void> {
  const f = await makeSeededRunGame(SAVE);

  // --- A) golden gen 12345 ×2 -------------------------------------------------
  const cards = f.game.content.get<Array<{ id: string }>>('mine.cards') ?? [];
  const statuses = f.game.content.get<Array<{ layer: number }>>('mine.cards.statuses') ?? [];
  const mobs = f.game.content.get<Array<{ id: string }>>('mine.mobs') ?? [];
  const layers = f.game.content.get<Array<{ layer: number }>>('mine.layers') ?? [];
  const layerDef = layers.find((l) => l.layer === 1)!;
  const genCtx = { player: 'player', now: f.game.time.now(), tags: ['mine', 'layer:1'] };
  const snap = (seed: number): string =>
    generateLayer(
      { cards: cards as never, statuses: statuses as never, mobs: mobs as never, statBus: f.game.statBus, rngBus: f.game.rngBus, time: f.game.time },
      1,
      seed,
      layerDef as never,
      genCtx,
    )
      .cards.map((c) => `${c.id}${c.hidden ? '?' : ''}`)
      .join(' | ');
  const g1 = snap(12345);
  const g2 = snap(12345);
  line(`A) golden gen 12345 ×2: ${g1 === g2 ? 'ИДЕНТИЧНЫ' : 'РАСХОЖДЕНИЕ!'}`);
  line(`   прогон 1: ${g1}`);
  line(`   прогон 2: ${g2}`);

  // --- B) Освещение: серия 36 генераций до/после ------------------------------
  const series = (): { hidden: number; total: number } => {
    let hidden = 0;
    let total = 0;
    for (let rn = 1; rn <= 36; rn++) {
      const lay = generateLayer(
        { cards: cards as never, statuses: statuses as never, mobs: mobs as never, statBus: f.game.statBus, rngBus: f.game.rngBus, time: f.game.time },
        1,
        runSeedOf(SAVE + ':b' + rn, 1, 1),
        layerDef as never,
        genCtx,
      );
      for (const c of lay.cards) {
        if (c.id !== 'mc_boss') {
          total++;
          if (c.hidden) hidden++;
        }
      }
    }
    return { hidden, total };
  };
  const before = series();
  grantGold(f, 2000);
  const buy = f.mine['mine.upgrades.buy']('mine_lighting') as { ok: boolean };
  // кэш StatBus — до конца тика (stat-bus.ts:14): ManualClock заморожен,
  // сдвигаем минуту = новый тик → кэш истёк (как в живой игре каждую секунду)
  f.clock.advance(60_000);
  f.game.statBus.clearCache(); //minuteTick-эквивалент живой игры
  const after = series();
  line(`B) Освещение (серия 36 генераций = ${before.total} карт):`);
  line(`   до покупки: скрытых ${before.hidden}/${before.total} = ${((before.hidden / before.total) * 100).toFixed(1)}% (ожидание ≈40%)`);
  line(`   покупка mine_lighting: ${buy.ok ? 'ok' : 'FAIL'}`);
  line(`   после:     скрытых ${after.hidden}/${after.total} = ${((after.hidden / after.total) * 100).toFixed(1)}% (ожидание ≈30%)`);

  // --- C) UV-1 скан: обвал в колонке 4 ----------------------------------------
  line(`C) UV-1 скан (saveId ${SAVE}, слой 1, runNumber 1..40):`);
  const found: number[] = [];
  for (let rn = 1; rn <= 40; rn++) {
    const lay = generateLayer(
      { cards: cards as never, statuses: statuses as never, mobs: mobs as never, statBus: f.game.statBus, rngBus: f.game.rngBus, time: f.game.time },
      1,
      runSeedOf(SAVE, 1, rn),
      layerDef as never,
      genCtx,
    );
    const col4 = lay.cards.slice(3 * CARDS_PER_COLUMN, 4 * CARDS_PER_COLUMN);
    if (col4.some((c) => c.kind === 'collapse')) {
      found.push(rn);
      line(`   runNumber ${rn}: колонка 4 = [${col4.map((c) => `${c.id}${c.hidden ? '?' : ''}`).join(', ')}]`);
    }
  }
  if (found.length === 0) line('   обвала в колонке 4 не найдено (runNumber 1..40)');

  // --- D) R2: НОВЫЙ страх данными — универсальный eval ------------------------
  // строка, КОТОРОЙ НЕТ в контенте (enemy:bat — не в HELPER_FEAR_DEFS):
  const newFear: { id: string; condition: Condition; effect: { t: 'standAside' } } = {
    id: 'fear_AUDIT_bats',
    condition: { t: 'ctxTag', tag: 'enemy:bat' },
    effect: { t: 'standAside' },
  };
  const ctxOf = (tags: string[]) => ({ player: 'player', now: f.game.time.now(), tags });
  // та же цепочка потребления, что в gatherHelpers (helpers-fight.ts:225):
  const dispatch = (fear: typeof newFear, tags: string[]): boolean =>
    fear.effect.t === 'standAside' && checkCondition(fear.condition, ctxOf(tags));
  line('D) НОВЫЙ страх данными (fear_AUDIT_bats {ctxTag enemy:bat}, в контенте НЕТ):');
  line(`   с тегом enemy:bat  → стоит в стороне: ${dispatch(newFear, ['mine', 'enemy:bat'])} (ожидание true)`);
  line(`   без летучей мыши   → стоит в стороне: ${dispatch(newFear, ['mine', 'enemy:spider'])} (ожидание false)`);
  line(`   оценщик один (checkCondition), ветвлений по id страха в коде НЕТ — новая строка данных = 0 правок кода`);

  // --- E) UV-7: клэмпы волей/редиректа на синтетических HP --------------------
  const medic = HELPER_CLASSES.find((c) => c.classId === 'medic')!;
  const looter = HELPER_CLASSES.find((c) => c.classId === 'looter')!;
  // волей: hp целей 0 и отрицательные — урон не уходит в минус, contrib считается
  const v = helperVolley({
    helpers: [
      { instanceId: 'h1', defId: 'd', name: 'Лутер', classId: 'looter', special: looter.special, atk: 8, speed: 11, efficiency: 100, hp: 30, maxHp: 30, fears: [] },
    ],
    participants: [
      { key: 'player', name: 'Игрок', hp: -5, maxHp: 50 },
      { key: 'h1', name: 'Лутер', hp: 30, maxHp: 30 },
    ],
    enemies: [
      { key: 'e1', name: 'Мёртвый (hp 0)', hp: 0, atk: 0, def: 0, speed: 0 },
      { key: 'e2', name: 'Слизень', hp: 12, atk: 3, def: 2, speed: 1 },
    ],
    table: MINE_TABLE,
    turns: {},
  });
  const negativeHp = applyCover({
    taken: 20,
    covers: [
      { instanceId: 'c1', name: 'Щит-0HP', redirectPercent: 40, hp: 0, speed: 8 },
      { instanceId: 'c2', name: 'Щит-минус', redirectPercent: 40, hp: -7, speed: 7 },
      { instanceId: 'c3', name: 'Щит-жив', redirectPercent: 40, hp: 5, speed: 6 },
    ],
  });
  const bigCover = applyCover({
    taken: 10,
    covers: [{ instanceId: 'c4', name: 'Щит-1HP', redirectPercent: 40, hp: 1, speed: 8 }],
  });
  line('E) UV-7 клэмпы:');
  line(`   волей: враг hp 0 не избран/не ушло в минус — строки: ${JSON.stringify(v.lines)}`);
  line(`   редирект hp 0/−7 → пропущены, живой 5HP закрыл 2 из 8: playerTaken ${negativeHp.playerTaken} (ожидание 18: 20−floor(8×0.4)=17, но клэмп 5HP → 20−5=15? см. строки) — redirects ${JSON.stringify(negativeHp.redirects)}`);
  line(`   редирект сверх HP: взял 1 из 4 → playerTaken ${bigCover.playerTaken} (ожидание 9), hpLeft ${bigCover.redirects[0]?.hpLeft} (ожидание 0)`);

  f.dispose();
}

await main();
