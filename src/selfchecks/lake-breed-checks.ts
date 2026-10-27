/**
 * Self-checks M08 «Озеро» — часть 2 (сеанс M08.1: разведение F6 + условия F3).
 *
 * Покрытие (бриф §3.8): формульные оракулы 89/10/1 (окна [0.89/0.99] +
 * кламп D..SS + max+1 при +2, кап SS); монте-карло 10 000 фикс-LCG —
 * распределение 89/10/1 в допуске хи-квадрат (карточка §7); живая авто-пара:
 * 2 Карася → пара по старшинству bornAt (период common 24ч из данных) →
 * икра (маппинг-оракул по журналу lake:breed:<fishId>:mutation) → событие
 * lake.bred {fishId, childTier, родители} = каталогу → созревание 24ч →
 * взрослая в свободном слоте; «ждёт свободного слота» при полном озере;
 * ленивое рождение после lake.harvest; условия-блок (температурная сетка /
 * чистота / голод / болезнь — formPairsPass синтетикой, данные НЕ if-ы).
 */
import { LAKE_TABLE } from '@/content/balance/lake';
import { POND_FISH } from '@/content/fishing/fish';
import { mulberry32 } from '@/shared/utils/rng';
import { mutationBonusOf, childTierOf, formPairsPass } from '@/game/modules/lake/logic/breeding';
import type { LakeState } from '@/game/modules/lake/state';
import type { QualityTier } from '@/shared/types/ids';
import { check, type CheckResult } from './types';
import {
  LAKE_T0,
  LAKE_HOUR,
  dayPass,
  eventsOf,
  giveFish,
  hourPass,
  lakeView,
  lastRollOf,
  makeSeededLakeGame,
  type R,
} from './lake-fixture';

const crucianDef = POND_FISH[0]!; // Карась: common → период 24ч, {5–30, ≥10}

/** синтетическое состояние озера для formPairsPass (чистая функция) */
function synth(water: { temperature: number; cleanliness: number }, slots: Array<Partial<LakeState['slots'][number]>>): LakeState {
  return {
    v: 1,
    slots: slots.map((s) => ({
      fishId: s.fishId,
      quality: s.quality,
      fedAt: s.fedAt,
      sick: s.sick ?? false,
      bornAt: s.bornAt,
    })),
    water,
    roe: [],
    stats: { released: slots.length, bred: 0, harvested: 0 },
  };
}

export async function runLakeBreedChecks(): Promise<CheckResult[]> {
  const results: CheckResult[] = [];

  // ------------------------------------------------ 10. формула 89/10/1: окна + кламп
  {
    const windows: Array<[number, 0 | 1 | 2]> = [
      [0, 0], [0.5, 0], [0.888, 0], [0.889, 0],
      [0.89, 1], [0.9, 1], [0.985, 1], [0.989, 1],
      [0.99, 2], [0.999, 2], [1, 2],
    ];
    const corridor: Array<[QualityTier, number, QualityTier]> = [
      ['D', 0, 'D'], ['D', 1, 'D'], ['D', 2, 'C'],
      ['C', 0, 'D'], ['C', 1, 'C'], ['C', 2, 'B'],
      ['B', 0, 'C'], ['B', 1, 'B'], ['B', 2, 'A'],
      ['A', 0, 'B'], ['A', 1, 'A'], ['A', 2, 'S'],
      ['S', 0, 'A'], ['S', 1, 'S'], ['S', 2, 'SS'],
      ['SS', 0, 'S'], ['SS', 1, 'SS'], ['SS', 2, 'SS'],
    ];
    results.push(
      check('формула 89/10/1 [M08 · решение №3 «2+ @1%»]: окна [0, 0.89) → +0 / [0.89, 0.99) → +1 / [0.99, 1] → +2 (границы 0.889/0.89/0.989/0.99/0.999 поимённо); кламп D..SS весь коридор: C+2→B, B+2→A (ВЫШЕ родителя), A+2→S, S+2→SS, SS+2→SS (кап), D+2→C', () =>
        windows.every(([roll, bonus]) => mutationBonusOf(roll, LAKE_TABLE.breeding.mutation) === bonus) &&
        corridor.every(([p, b, e]) => childTierOf(p, b) === e), {
        expected: 'окна 11/11; коридор 18/18',
        actual: `окна ${windows.filter(([r, b]) => mutationBonusOf(r, LAKE_TABLE.breeding.mutation) === b).length}/11; коридор ${corridor.filter(([p, b, e]) => childTierOf(p, b) === e).length}/18`,
      }),
    );
  }

  // ------------------------------------------------ 11. монте-карло 10 000 фикс-LCG: 89/10/1
  {
    const next = mulberry32(20261026);
    let plus0 = 0;
    let plus1 = 0;
    let plus2 = 0;
    for (let i = 0; i < 10_000; i++) {
      const b = mutationBonusOf(next(), LAKE_TABLE.breeding.mutation);
      if (b === 0) plus0++;
      else if (b === 1) plus1++;
      else plus2++;
    }
    // хи-квадрат: ожидание 8900/1000/100; σ биномиальные ~31.3/30/9.95;
    // допуск χ² = Σ(o−e)²/e < 5.99 (df=2, p=0.05 — канон [M11 · UV-1
    // AUDIT-M08]: единый порог 5.99 во всех местах; 11.07/11.34 сняты)
    const chi =
      (plus0 - 8900) ** 2 / 8900 + (plus1 - 1000) ** 2 / 1000 + (plus2 - 100) ** 2 / 100;
    results.push(
      check('монте-карло мутации (карточка §7): 10 000 фикс-LCG роллов — распределение 89/10/1 в допуске хи-квадрат (χ² < 5.99, df=2)', () =>
        plus0 + plus1 + plus2 === 10_000 && chi < 5.99, {
        expected: '≈8900/1000/100; χ² < 5.99',
        actual: `${plus0}/${plus1}/${plus2}; χ² = ${chi.toFixed(2)}`,
      }),
    );
  }

  // ------------------------------------------------ 12. живая авто-пара: период → икра (оракул журнала) → событие → созревание → взрослая
  {
    const f = await makeSeededLakeGame('m081-breed-live');
    f.game.wallet.grant('gold', 100);
    f.game.wallet.grant('feed', 20);
    giveFish(f, 'crucian', 'C');
    giveFish(f, 'crucian', 'C');
    const iids = (f.inv['inventory.list']() as Array<{ iid: string; defId: string }>).filter((i) => i.defId === 'crucian');
    f.lake['lake.release'](iids[0]!.iid);
    f.lake['lake.release'](iids[1]!.iid);
    // выпуск образует пару немедленно (sweep: оба сыты/здоровы/условия в норме)
    const paired = lakeView(f);
    // период common = 24ч (из данных): hourPass после dueAt → икра
    hourPass(f, LAKE_T0 + 24 * LAKE_HOUR + LAKE_HOUR);
    const withRoe = lakeView(f);
    const roll = lastRollOf(f, 'lake:breed:crucian:mutation');
    const bonus = roll !== null ? mutationBonusOf(roll, LAKE_TABLE.breeding.mutation) : 0;
    const oracleTier = childTierOf('C', bonus);
    const bred = eventsOf(f, 'lake.bred');
    // созревание 24ч от появления икры (readyAt = момент завершения пары + 24ч)
    hourPass(f, LAKE_T0 + 48 * LAKE_HOUR + 2 * LAKE_HOUR);
    const grown = lakeView(f);
    results.push(
      check('живая авто-пара: 2 Карася C → пара по старшинству bornAt (манифест-сweep, до икры 24ч — период common из данных); dueAt истёк → икра в очереди, тир = маппинг-оракулу журнала lake:breed:crucian:mutation (окно → бонус → clamp(C−1+бонус)); lake.bred {fishId, childTier, родители} = каталогу 02 §4; +24ч созревание → взрослая в свободном слоте (bornAt обновлён, сыта); статы bred 1', () =>
        paired.pairs.length === 1 && paired.pairs[0]!.fishId === 'crucian' &&
        withRoe.roe.length === 1 && withRoe.roe[0]!.tier === oracleTier && roll !== null &&
        bred.length === 1 && bred[0]!.fishId === 'crucian' && bred[0]!.childTier === oracleTier &&
        JSON.stringify(bred[0]!.parents) === JSON.stringify([{ slot: 0, tier: 'C' }, { slot: 1, tier: 'C' }]) &&
        grown.fish.length === 3 && grown.fish[2]!.fishId === 'crucian' && grown.fish[2]!.quality === oracleTier &&
        grown.roe.length === 0 && grown.stats.bred === 1, {
        expected: `пара 24ч → икра тир ${oracleTier} (ролл ${roll}) → взрослая в слоте 2`,
        actual: `пара ${paired.pairs.length}; икра ${withRoe.roe.map((r) => `${r.fishId}:${r.tier}`).join(',')}; событие ${bred.length}; взрослая ${grown.fish[2] ? grown.fish[2]!.quality : 'нет'}; ролл ${roll}`,
      }),
    );
    f.dispose();
  }

  // ------------------------------------------------ 13. «ждёт свободного слота» + ленивое рождение после harvest
  {
    const f = await makeSeededLakeGame('m081-breed-wait');
    f.game.wallet.grant('gold', 200);
    f.game.wallet.grant('feed', 50);
    // полное озеро: 6 Карасей; при выпуске авто-пара (слоты 0/1) стартует
    // сама; форс-икра из слотов 0/1 — немедленно (мутационный ролл сейчас)
    for (let i = 0; i < 6; i++) giveFish(f, 'crucian', 'C');
    const iids = (f.inv['inventory.list']() as Array<{ iid: string; defId: string }>).filter((i) => i.defId === 'crucian');
    for (const e of iids) f.lake['lake.release'](e.iid);
    const paired = lakeView(f);
    const roe = f.lake['lake.force']('roe', 0, 1) as R<{ fishId: string; childTier: string; bonus: number; roll: number }>;
    // +25ч: форс-икра СОЗРЕЛА (readyAt = T0+24ч), но озеро полно → ждёт;
    // авто-пара завершается (dueAt T0+24ч) → вторая икра (readyAt +49ч)
    hourPass(f, LAKE_T0 + 25 * LAKE_HOUR);
    const waiting = lakeView(f);
    // harvest освобождает слот → ленивое рождение СРАЗУ (тот же sweep)
    const harvested = f.lake['lake.harvest'](5) as R<unknown>;
    const born = lakeView(f);
    results.push(
      check('икра «ждёт свободного слота» при полном озере (6/6): readyAt истёк — очередь держит запись (витрина помечает ожидание), рождение НЕ происходит; авто-пара при этом завершается своей икрой (вторая в очереди, ещё зреет); lake.harvest освобождает слот → ленивое рождение СРАЗУ (тот же sweep — прецедент pen: FIFO, первой рождается ЗАРЕВШАЯ икра); форс-икра = немедленный мутационный ролл (окно в журнале) + lake.bred', () =>
        paired.pairs.length === 1 &&
        roe.ok && waiting.slots.used === 6 && waiting.roe.length === 2 && waiting.roe[0]!.waitingSlot === true && waiting.roe[1]!.waitingSlot === false &&
        harvested.ok && born.slots.used === 6 && born.roe.length === 1 &&
        born.fish.filter((x) => x.fishId === 'crucian').length === 6, {
        expected: 'полное озеро: икра-1 ждёт + икра-2 зреет; harvest → рождение сразу; очередь 1',
        actual: `форс ${roe.ok}; ожидание-1 ${String(waiting.roe[0]?.waitingSlot)} / ожидание-2 ${String(waiting.roe[1]?.waitingSlot)} (занято ${waiting.slots.used}); после harvest — икра ${born.roe.length}, рыб ${born.fish.length}`,
      }),
    );
    f.dispose();
  }

  // ------------------------------------------------ 14. условия-блок: температурная сетка / чистота / голод / болезнь
  {
    const fed = LAKE_T0;
    const mk = (over?: Partial<{ fedAt: number; sick: boolean }>): Array<Partial<LakeState['slots'][number]>> => [
      { fishId: 'crucian', quality: 'C', bornAt: fed, fedAt: over?.fedAt ?? fed, sick: over?.sick ?? false },
      { fishId: 'crucian', quality: 'C', bornAt: fed + 1, fedAt: over?.fedAt ?? fed, sick: over?.sick ?? false },
    ];
    const okPair = formPairsPass(synth({ temperature: 15, cleanliness: 70 }, mk()), { now: LAKE_T0, table: LAKE_TABLE, fishOf: (id) => (id === 'crucian' ? crucianDef : undefined) });
    const hotPair = formPairsPass(synth({ temperature: 35, cleanliness: 70 }, mk()), { now: LAKE_T0, table: LAKE_TABLE, fishOf: (id) => (id === 'crucian' ? crucianDef : undefined) });
    const coldPair = formPairsPass(synth({ temperature: 4, cleanliness: 70 }, mk()), { now: LAKE_T0, table: LAKE_TABLE, fishOf: (id) => (id === 'crucian' ? crucianDef : undefined) });
    const dirtyPair = formPairsPass(synth({ temperature: 15, cleanliness: 9 }, mk()), { now: LAKE_T0, table: LAKE_TABLE, fishOf: (id) => (id === 'crucian' ? crucianDef : undefined) });
    const hungryPair = formPairsPass(synth({ temperature: 15, cleanliness: 70 }, mk({ fedAt: LAKE_T0 - 25 * LAKE_HOUR })), { now: LAKE_T0, table: LAKE_TABLE, fishOf: (id) => (id === 'crucian' ? crucianDef : undefined) });
    const sickPair = formPairsPass(synth({ temperature: 15, cleanliness: 70 }, mk({ sick: true })), { now: LAKE_T0, table: LAKE_TABLE, fishOf: (id) => (id === 'crucian' ? crucianDef : undefined) });
    // граница включительно: чистота ровно 10 = норма; temp ровно 30 = норма
    const edgePair = formPairsPass(synth({ temperature: 30, cleanliness: 10 }, mk()), { now: LAKE_T0, table: LAKE_TABLE, fishOf: (id) => (id === 'crucian' ? crucianDef : undefined) });
    // одиночная рыба — пары нет
    const singlePair = formPairsPass(synth({ temperature: 15, cleanliness: 70 }, [mk()[0]]), { now: LAKE_T0, table: LAKE_TABLE, fishOf: (id) => (id === 'crucian' ? crucianDef : undefined) });
    results.push(
      check('условия-блок (данные → Condition-оценщик, НЕ if-ы): Карась {5–30, ≥10} — пара образуется при 15°/70; НЕ образуется при 35° (жарко) / 4° (холодно) / чистоте 9 (< 10); голодная пара (fedAt старше 24ч) — нет; больная пара — нет; границы ВКЛЮЧИТЕЛЬНО (30°/10 — норма); одиночка — нет пары', () =>
        okPair.formed.length === 1 && okPair.formed[0]!.tierA === 'C' && okPair.formed[0]!.slotA === 0 && okPair.formed[0]!.slotB === 1 &&
        hotPair.formed.length === 0 && coldPair.formed.length === 0 && dirtyPair.formed.length === 0 &&
        hungryPair.formed.length === 0 && sickPair.formed.length === 0 &&
        edgePair.formed.length === 1 && singlePair.formed.length === 0, {
        expected: '1/0/0/0/0/0/1(граница)/0',
        actual: `норма ${okPair.formed.length}; жара ${hotPair.formed.length}; холод ${coldPair.formed.length}; грязь ${dirtyPair.formed.length}; голод ${hungryPair.formed.length}; болезнь ${sickPair.formed.length}; граница ${edgePair.formed.length}; одиночка ${singlePair.formed.length}`,
      }),
    );
  }

  // ------------------------------------------------ 15. живой условия-блок: дрейф чистоты ломает пару Карпа
  {
    const f = await makeSeededLakeGame('m081-breed-conditions');
    f.game.wallet.grant('gold', 200);
    f.game.wallet.grant('feed', 50);
    // Зеркальный карп {10–35, ≥30}: при 70 пара есть (rare период 48ч);
    // пары продолжают замыкаться пока чистота ≥ 30 (граница включительно);
    // после дрейфа < 30 новые пары НЕ образуются — последняя завершается
    // своей икрой (тиры зафиксированы), очередь дальше не пополняется
    giveFish(f, 'mirror_carp', 'B');
    giveFish(f, 'mirror_carp', 'B');
    const iids = (f.inv['inventory.list']() as Array<{ iid: string; defId: string }>).filter((i) => i.defId === 'mirror_carp');
    f.lake['lake.release'](iids[0]!.iid);
    f.lake['lake.release'](iids[1]!.iid);
    const paired = lakeView(f);
    // кормим каждый день (голод блокирует пару — снимаем), дрейф −5/день
    for (let d = 1; d <= 10; d++) {
      dayPass(f, LAKE_T0 + d * 86_400_000);
      f.game.wallet.grant('feed', 10);
      f.lake['lake.feed']();
    }
    const dirty = lakeView(f);
    results.push(
      check('живой условия-блок: Зеркальный карп {10–35, ≥30} — пара при чистоте 70 (rare период 48ч из данных); дрейф −5/день × 10 дней → чистота 20 < 30 — требования НАРУШЕНЫ у ВСЕХ рыб (витрина текстом: «чистота ≥ 30»); рыбы сыты (голод снят кормлением) — НОВЫХ пар НЕ образуется: активных пар 0, блокирует ТОЛЬКО чистота', () =>
        paired.pairs.length === 1 && paired.pairs[0]!.fishId === 'mirror_carp' &&
        paired.pairs[0]!.maxParentTier === 'B' &&
        dirty.water.cleanliness === 20 && dirty.hungryCount === 0 &&
        dirty.fish.every((x) => !x.requirementsMet) &&
        dirty.fish.some((x) => x.requirementsText !== null && x.requirementsText.includes('чистота ≥ 30')) &&
        dirty.pairs.length === 0, {
        expected: 'пара 1 → 0 (чистота 20 < 30, рыбы сыты; последняя пара доисчерпана)',
        actual: `пара ${paired.pairs.length} → ${dirty.pairs.length}; чистота ${dirty.water.cleanliness}; голодных ${dirty.hungryCount}; рыб ${dirty.fish.length}; нарушения: ${dirty.fish[0]?.requirementsText ?? '—'}`,
      }),
    );
    f.dispose();
  }

  return results;
}
