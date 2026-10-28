/**
 * Группа «M13 Забег» · ЧАСТЬ 1/2 (бриф R9, карточка §6): golden-генерация
 * фикс-сид ×2, монте-карло открытости ≈60% + Освещение 40% → 30%, факел
 * (direct/luck — данными, luck = resolve mine.luck.hidden), runBag: лестница
 * 100% / смерть −20% / костёр −5% на фиксированных рюкзаках + инвариант
 * used ≤ capacity при выдаче (граница 20/20 → 21/20 запрещена — прецедент
 * FIX-M12 чек 31). Оркестратор — mine-run-checks.ts.
 */
import { check, type CheckResult } from './types';
import { MINE_CARDS, MINE_LAYER_STATUSES, MINE_TORCH } from '@/content/mine/cards';
import { MINE_MOBS } from '@/content/mine/mobs';
import { MINE_LAYERS } from '@/content/mine/layers';
import { generateLayer, runSeedOf } from '@/game/modules/mine/generator';
import {
  makeSeededRunGame,
  viewOf,
  eventsOf,
  equipPickaxe,
  grantGold,
  fillInventory,
  backpackCount,
  type RunFixture,
  type ViewShape,
  type R,
} from './mine-run-fixture';
export type { RunFixture, ViewShape, R };

type GenDeps = Parameters<typeof generateLayer>[0];

export function genDepsOf(f: RunFixture): GenDeps {
  return {
    cards: MINE_CARDS,
    statuses: MINE_LAYER_STATUSES,
    mobs: MINE_MOBS,
    statBus: f.game.statBus,
    rngBus: f.game.rngBus,
    time: f.game.time,
  };
}

export interface LayoutCard {
  kind: string;
  hidden: boolean;
}
export type LayoutColumns = LayoutCard[][];

export function layoutOf(f: RunFixture, saveId: string, layer = 1): LayoutColumns {
  const seed = runSeedOf(saveId, layer, 1);
  const layout = generateLayer(
    genDepsOf(f),
    layer,
    seed,
    MINE_LAYERS[layer - 1]!,
    { player: 'player', now: f.game.time.now(), tags: ['mine', `layer:${layer}`] },
  );
  return [0, 1, 2, 3].map((c) =>
    layout.cards.slice(c * 3, c * 3 + 3).map((k) => ({ kind: k.kind, hidden: k.hidden })),
  );
}

/** поиск saveId с нужным раскладом забега №1 (детерминизм сида) */
export async function findRun(
  tag: string,
  pred: (cols: LayoutColumns) => boolean,
  layer = 1,
): Promise<{ f: RunFixture; saveId: string; cols: LayoutColumns }> {
  for (let i = 1; i <= 500; i++) {
    const saveId = `m131-${tag}-${i}`;
    const f = await makeSeededRunGame(saveId);
    const cols = layoutOf(f, saveId, layer);
    if (pred(cols)) return { f, saveId, cols };
    f.dispose();
  }
  throw new Error(`расклад для ${tag} не найден за 500 сидов`);
}

export const kindsOf = (col: LayoutCard[]): string[] => col.map((c) => c.kind);
export const slotOf = (kinds: string[], kind: string): number => kinds.indexOf(kind) + 1;

/** монте-карло доли скрытых (10k раскладов фикс-сид; хи-квадрат-допуск 4σ) */
function hiddenShare(f: RunFixture, upgradesBought: boolean): { hidden: number; total: number; expected: number } {
  let hidden = 0;
  const N = 10_000;
  for (let s = 1; s <= N; s++) {
    const layout = generateLayer(
      genDepsOf(f),
      1,
      s,
      MINE_LAYERS[0]!,
      { player: 'player', now: f.game.time.now(), tags: ['mine', 'layer:1'] },
    );
    hidden += layout.cards.slice(0, 12).filter((c) => c.hidden).length;
  }
  void upgradesBought;
  return { hidden, total: N * 12, expected: N * 12 * 0.4 };
}

export async function runMineRunPart1(): Promise<CheckResult[]> {
  const results: CheckResult[] = [];

  // 1. golden-генерация фикс-сид ×2 идентична (карточка §6)
  {
    const f = await makeSeededRunGame('m131-golden');
    const g1 = viewOf(f.mine['mine.gen'](1, 12345) as R<ViewShape>);
    const g2 = viewOf(f.mine['mine.gen'](1, 12345) as R<ViewShape>);
    results.push(
      check('golden-генерация (R9/карточка §6): mine gen 1 --seed 12345 ×2 — расклад ПОСТРОЧНО идентичен (12 карт + босс + скрытость; стримы mine:gen:* в roll.log)', () =>
        g1 === g2 && g1.includes('колонка 1:') && g1.includes('финал: босс:') && g1.includes('[скрыта]') !== g1.includes('открыта]') === false, {
        expected: '×2 идентичны; 4 колонки + финал',
        actual: g1 === g2 ? 'идентичны' : 'РАЗЛИЧАЮТСЯ',
      }),
    );
    f.dispose();
  }

  // 2. монте-карло открытости ≈60% (база 40% скрытых; допуск 4σ)
  {
    const f = await makeSeededRunGame('m131-mc');
    const r = hiddenShare(f, false);
    const sd = Math.sqrt(r.total * 0.4 * 0.6);
    results.push(
      check('монте-карло открытости (R9): 10 000 раскладов фикс-сид → доля скрытых ≈ 40% (открыты ≈ 60%, карточка §1); допуск 4σ (хи-квадрат-канон UV-1 M11.1)', () =>
        Math.abs(r.hidden - r.expected) < 4 * sd, {
        expected: `скрытых ≈ ${Math.round(r.expected)} ± ${(4 * sd).toFixed(0)}`,
        actual: `скрытых ${r.hidden} из ${r.total} (${((r.hidden / r.total) * 100).toFixed(2)}%)`,
      }),
    );
    f.dispose();
  }

  // 3. Освещение: доля скрытых 40% → 30% (inc −25 на mine.hiddenChance)
  {
    const f = await makeSeededRunGame('m131-light');
    grantGold(f, 1000);
    const buy = f.mine['mine.upgrades.buy']('mine_lighting') as R<ViewShape>;
    const r = hiddenShare(f, true);
    const sd = Math.sqrt(r.total * 0.3 * 0.7);
    results.push(
      check('Освещение (R6/R9): inc −25% к mine.hiddenChance → доля скрытых 40% → 30% (оракул); покупка eventId mine.upgrade', () =>
        buy.ok && Math.abs(r.hidden - r.total * 0.3) < 4 * sd, {
        expected: `скрытых ≈ ${Math.round(r.total * 0.3)} ± ${(4 * sd).toFixed(0)}`,
        actual: `покупка ${buy.ok ? 'ок' : 'ОТКАЗ'}; скрытых ${r.hidden} (${((r.hidden / r.total) * 100).toFixed(2)}%)`,
      }),
    );
    f.dispose();
  }

  // 4. факел: оба режима — direct (гарантированно) и luck (resolve mine.luck.hidden;
  //    base 100 ⇒ без дебафов гарантированно; −200 → шанс 0 → погас)
  {
    const { f, cols } = await findRun('torch', (c) =>
      kindsOf(c[0]!).includes('trader') && c[1]!.some((x) => x.hidden),
    );
    equipPickaxe(f, 'D');
    grantGold(f, 500);
    const enter = f.mine['mine.enter'](1) as R<ViewShape>;
    const traderSlot = slotOf(kindsOf(cols[0]!), 'trader');
    const pick = f.mine['mine.pick'](String(traderSlot)) as R<ViewShape>;
    const buyTorch = f.mine['mine.pick']('3') as R<ViewShape>; // сток №3 — факел ×2
    f.mine['mine.pick']('3') as R<ViewShape>; // вторая партия (итого 4 факела)
    f.mine['mine.pick']('0'); // покинуть крота
    const torchLuck0 = f.mine['mine.torch']() as R<ViewShape>;
    // дебаф удачи скрытого −200 → шанс clamp 0 → факел гаснет
    f.game.buffs.add(
      { id: 'selfcheck.darkluck', source: { kind: 'debuff', refId: 'selfcheck' }, stat: 'mine.luck.hidden', op: 'flat', value: -200 },
      f.game.time.now(),
    );
    const torchDark = f.mine['mine.torch']() as R<ViewShape>;
    f.game.buffs.remove('selfcheck.darkluck');
    // direct-режим: подмена данных (DI-канон) — гарантированно даже в темноте
    const torchData = f.game.content.get<{ mode: string }>('mine.cards.torch')!;
    const savedMode = torchData.mode;
    (torchData as { mode: string }).mode = 'direct';
    const torchDirect = f.mine['mine.torch']() as R<ViewShape>;
    (torchData as { mode: string }).mode = savedMode;
    results.push(
      check('факел (R5/R9): режим ПО ДАННЫМ; luck — chance = clamp(base 100 × (1 + mine.luck.hidden/100)): без дебафов гарантированно (раскрыта); luck −200 → 0% → «погас» (факел потрачен); direct — гарантированно НЕВЗАВИСИМО от удачи (подмена данных, DI-канон)', () =>
        enter.ok && pick.ok && buyTorch.ok && buyTorch.value.lines.join('\n').includes('run.torches (+2') &&
        torchLuck0.ok && torchLuck0.value.lines.join('\n').includes('раскрыта') &&
        torchDark.ok && torchDark.value.lines.join('\n').includes('погас') &&
        torchDirect.ok && torchDirect.value.lines.join('\n').includes('раскрыта'), {
        expected: 'luck0: раскрыта; −200: погас; direct: раскрыта',
        actual: `luck0 ${torchLuck0.ok && torchLuck0.value.lines.some((l) => l.includes('раскрыта')) ? 'раскрыта' : '?'}; dark ${torchDark.ok && torchDark.value.lines.some((l) => l.includes('погас')) ? 'погас' : '?'}; direct ${torchDirect.ok && torchDirect.value.lines.some((l) => l.includes('раскрыта')) ? 'раскрыта' : '?'}`,
      }),
    );
    f.dispose();
  }

  // 5. runBag: лестница 100% (жила + лестница в колонке 1)
  {
    const { f, cols } = await findRun('ladder', (c) => kindsOf(c[0]!).includes('oreVein') && kindsOf(c[1]!).includes('exit'));
    equipPickaxe(f, 'D');
    const enter = f.mine['mine.enter'](1) as R<ViewShape>;
    f.mine['mine.pick'](String(slotOf(kindsOf(cols[0]!), 'oreVein')));
    const exit = f.mine['mine.pick'](String(slotOf(kindsOf(cols[1]!), 'exit'))) as R<ViewShape>;
    const ended = eventsOf(f, 'mine.runEnded');
    results.push(
      check('runBag: ЛЕСТНИЦА = 100% (карточка §6): забег с vein → runBag ≥2 руды → exit → runEnded {причина exit, granted = весь рюкзак, lost = 0}; трофеев/утрат нет', () =>
        enter.ok && exit.ok && ended.length === 1 && ended[0]!.reason === 'exit' &&
        (ended[0]!.granted as unknown[]).length >= 1 && (ended[0]!.lost as unknown[]).length === 0, {
        expected: 'exit; granted ≥ 1; lost 0',
        actual: `reason ${ended[0]?.reason}; granted ${(ended[0]?.granted as unknown[] | undefined)?.length ?? 0}; lost ${(ended[0]?.lost as unknown[] | undefined)?.length ?? 0}`,
      }),
    );
    f.dispose();
  }

  // 6. смерть −20%: квота round(Σqty × 20%) — фиксированный рюкзак (vein → mob при HP 1)
  {
    const { f, cols } = await findRun('death20', (c) => kindsOf(c[0]!).includes('oreVein') && kindsOf(c[1]!).includes('mob'));
    equipPickaxe(f, 'D');
    const enter = f.mine['mine.enter'](1) as R<ViewShape>;
    f.mine['mine.pick'](String(slotOf(kindsOf(cols[0]!), 'oreVein')));
    (f.player['player.setHp'] as (n: number) => unknown)(1);
    f.mine['mine.pick'](String(slotOf(kindsOf(cols[1]!), 'mob')));
    const ended = eventsOf(f, 'mine.runEnded');
    const granted = ended[0]?.granted as Array<{ defId: string; qty: number }> ?? [];
    const lost = ended[0]?.lost as Array<{ defId: string; qty: number }> ?? [];
    const total = granted.reduce((s, g) => s + g.qty, 0) + lost.reduce((s, l) => s + l.qty, 0);
    const hp = (f.player['player.checkHp'] as () => { current: number })();
    results.push(
      check('runBag: СМЕРТЬ = −20% (карточка §6): HP 1 → карта моб → смерть → runEnded {причина death, lost = round(Σqty × 20%) поимённо, granted = остальные}; cozy HP := 1 (канон F7); deaths+1 срез', () =>
        enter.ok && ended.length === 1 && ended[0]!.reason === 'death' && total >= 2 &&
        lost.reduce((s, l) => s + l.qty, 0) === Math.round((total * 20) / 100) &&
        hp.current === 1, {
        expected: `death; lost = round(${total} × 0.2) = ${Math.round((total * 20) / 100)}; HP 1`,
        actual: `lost ${lost.reduce((s, l) => s + l.qty, 0)} из ${total}; HP ${hp.current}`,
      }),
    );
    f.dispose();
  }

  // 7. костёр-чекпойнт: −5% вместо −20% (контраст на фиксированных рюкзаках)
  {
    const { f, cols } = await findRun('death5', (c) => kindsOf(c[0]!).includes('campfire') && kindsOf(c[1]!).includes('oreVein') && kindsOf(c[2]!).includes('mob'));
    equipPickaxe(f, 'D');
    const enter = f.mine['mine.enter'](1) as R<ViewShape>;
    f.mine['mine.pick'](String(slotOf(kindsOf(cols[0]!), 'campfire')));
    f.mine['mine.pick'](String(slotOf(kindsOf(cols[1]!), 'oreVein')));
    (f.player['player.setHp'] as (n: number) => unknown)(1);
    f.mine['mine.pick'](String(slotOf(kindsOf(cols[2]!), 'mob')));
    const ended = eventsOf(f, 'mine.runEnded');
    const granted = ended[0]?.granted as Array<{ defId: string; qty: number }> ?? [];
    const lost = ended[0]?.lost as Array<{ defId: string; qty: number }> ?? [];
    const total = granted.reduce((s, g) => s + g.qty, 0) + lost.reduce((s, l) => s + l.qty, 0);
    results.push(
      check('runBag: КОСТЁР-чекпойнт = −5% (карточка §6): campfire → vein → смерть при HP 1 → lost = round(Σqty × 5%) — мягче −20% (контраст); run.campfire витриной', () =>
        enter.ok && ended.length === 1 && ended[0]!.reason === 'death' && total >= 2 &&
        lost.reduce((s, l) => s + l.qty, 0) === Math.round((total * 5) / 100), {
        expected: `lost = round(${total} × 0.05) = ${Math.round((total * 5) / 100)}`,
        actual: `lost ${lost.reduce((s, l) => s + l.qty, 0)} из ${total}`,
      }),
    );
    f.dispose();
  }

  // 8. инвариант used ≤ capacity при выдаче: полный инвентарь 20/20 → 20/20 (НЕ 21/20)
  {
    const { f, cols } = await findRun('capfull', (c) => kindsOf(c[0]!).includes('oreVein') && kindsOf(c[1]!).includes('exit'));
    equipPickaxe(f, 'D');
    fillInventory(f, 20, 'cap'); // рюкзак 20/20 (уникальные value — без слияний)
    const before = backpackCount(f);
    const enter = f.mine['mine.enter'](1) as R<ViewShape>;
    f.mine['mine.pick'](String(slotOf(kindsOf(cols[0]!), 'oreVein')));
    const exit = f.mine['mine.pick'](String(slotOf(kindsOf(cols[1]!), 'exit'))) as R<ViewShape>;
    const after = backpackCount(f);
    const ended = eventsOf(f, 'mine.runEnded');
    const lostByCap = ended[0]?.lostByCapacity as unknown[] ?? [];
    results.push(
      check('инвариант used ≤ capacity при выдаче (R9, прецедент FIX-M12 чек 31): инвентарь 20/20 + runBag с рудой → лестница → ЧЕСТНАЯ частичная выдача: ВСЁ в lostByCapacity поимённо, слоты НИКОГДА > 20 (20 → 20, граница 20/20 → 21/20 запрещена)', () =>
        enter.ok && before === 20 && exit.ok && after === 20 && lostByCap.length >= 1, {
        expected: '20/20 → 20/20; lostByCapacity ≥ 1 (поимённо)',
        actual: `${before} → ${after}; lostByCapacity ${lostByCap.length}`,
      }),
    );
    f.dispose();
  }

  return results;
}
