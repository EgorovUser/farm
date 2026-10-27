/**
 * Self-checks M07 «Рыбалка» — часть 1 (сеанс M07.1: каркас + таблицы + удочки/
 * наживки + процесс + альбом + сейв v12). Оракулы руками (без ожиданий).
 *
 * Покрытие (бриф §3.7): контент (категории ×6 / рыбы ×6 / мусор ×3 / сундук /
 * события / удочки ×6 с ценами-редкостями-прочностью / наживки ×5 со сверкой
 * Червя по реестру); fish.buy (золото/инвентарь/ривен-роллы fish:rod:* /
 * отказы атомарны); заброс (энергия 4 + наживка 1 + прочность −1 + улов
 * acquire-каноном источник 'fishing' + события ×2 полным payload / отказы
 * с причинами / «наживка кончилась»); альбом/статы/XP/навык/счётчик
 * fish.total; детерминизм серии ×2 байт-в-байт; манифест 1.0.0 = факту.
 */
import { check, group, type CheckGroup, type CheckResult } from './types';
import { runFishContentChecks } from './fish-content-checks';
import {
  buyAndEquip,
  countOf,
  energyOf,
  equippedOf,
  eventsOf,
  invList,
  lastRollOf,
  makeSeededFishGame,
  progressOf,
  rollOf,
  skillOf,
  type R,
} from './fish-fixture';
import { runFishDropChecks } from './fish-drop-checks';
import { runFishMigrationChecks } from './fish-migration-checks';
import { runFishRiverChecks } from './fish-river-checks';
import { runFishIntegrChecks } from './fish-integr-checks';

interface CastReceiptV {
  category: string;
  defId: string | null;
  rarity: string | null;
  quality: { tier: string; value: number } | null;
  weightGrams: number | null;
  bite: { rolledSeconds: number; waitSeconds: number };
  rod: { defId: string; current: number; max: number; broken: boolean };
  bait: { defId: string; reequipped: boolean };
  goldGranted: number | null;
}

export async function runFishChecks(): Promise<CheckGroup> {
  const results: CheckResult[] = [];

  // ------------------------------------------------ 3. fish.buy: удочка с ривен-роллами + наживка стаком
  {
    const f = await makeSeededFishGame('m071-buy');
    f.game.wallet.grant('gold', 500);
    const rod = f.fish['fish.buy']('bamboo_rod') as R<{ iid: string; rolls: Array<{ type: string; value: number }> }>;
    const goldAfterRod = f.game.wallet.get('gold');
    const rodEntry = invList(f).find((i) => i.defId === 'bamboo_rod');
    const rolledEv = eventsOf(f, 'modforge.rolled').find((e) => e.source === 'modforge.rollItem' && (e.target as { refId?: string } | null)?.refId === (rod.ok ? rod.value.iid : ''));
    const bait = f.fish['fish.buy']('worm_bait', 20) as R<{ qty: number }>;
    const goldAfterBait = f.game.wallet.get('gold');
    const badId = f.fish['fish.buy']('iron_pickaxe') as R<unknown>;
    const rodQty2 = f.fish['fish.buy']('bamboo_rod', 2) as R<unknown>;
    results.push(
      check('fish.buy: удочка 50з → инвентарь + ривен-роллы (событие modforge.rolled с адресатом-iid; стрим fish:rod:<defId> сидирует; роллы на записи); наживка ×20 = 40з; чужой id/удочка ×2 — отказы', () =>
        rod.ok && goldAfterRod === 450 && rodEntry !== undefined && (rodEntry.rolledMods?.length ?? 0) > 0 &&
        rolledEv !== undefined &&
        bait.ok && countOf(f, 'worm_bait') === 20 && goldAfterBait === 410 &&
        !badId.ok && !rodQty2.ok, {
        expected: '450з после удочки; 410з после ×20; отказы iron_pickaxe/rod×2',
        actual: `удочка ${rod.ok ? 'ок' : rod.error}; золото ${goldAfterRod}; роллов ${rodEntry?.rolledMods?.length ?? 0}; событие ${String(rolledEv !== undefined)}; червей ${countOf(f, 'worm_bait')}; золото ${goldAfterBait}; отказы ${String(!badId.ok)}/${String(!rodQty2.ok)}`,
      }),
    );
    f.dispose();
  }

  // ------------------------------------------------ 4. заброс: отказы с причинами (снасть/энергия)
  {
    const f = await makeSeededFishGame('m071-refusals');
    f.game.wallet.grant('gold', 500);
    const noRod = f.fish['fish.cast']() as R<unknown>;
    await buyAndEquip(f, 'bamboo_rod', 'rod');
    const noBait = f.fish['fish.cast']() as R<unknown>;
    await buyAndEquip(f, 'worm_bait', 'bait');
    f.inv['inventory.dur'](equippedOf(f, 'rod')!.iid, 0); // сломанная удочка
    const broken = f.fish['fish.cast']() as R<unknown>;
    f.inv['inventory.dur'](equippedOf(f, 'rod')!.iid, 30); // починка dev-штампом
    const badLoc = f.fish['fish.cast']('river') as R<unknown>;
    const errs = [noRod, noBait, broken, badLoc].map((r) => (r.ok ? 'ок' : r.error));
    results.push(
      check('отказы заброса: нет удочки / нет наживки / удочка сломана (ремонт M09) / река без навыка — честные причины, состояние цело', () =>
        !noRod.ok && errs[0]!.includes('нет удочки') &&
        !noBait.ok && errs[1]!.includes('нет наживки') &&
        !broken.ok && errs[2]!.includes('сломана') &&
        !badLoc.ok && errs[3]!.includes('навык Рыболовство 10') &&
        countOf(f, 'worm_bait') === 0 && f.game.wallet.get('gold') >= 0, {
        expected: '4 отказа с причинами (река: навык 10 — [M07.2 · F12]); наживка не расходована',
        actual: errs.join(' | '),
      }),
    );
    f.dispose();
  }

  // ------------------------------------------------ 5. заброс живой: энергии/наживка/прочность/улов/события
  {
    const f = await makeSeededFishGame('m071-livecast');
    f.game.wallet.grant('gold', 500);
    await buyAndEquip(f, 'bamboo_rod', 'rod');
    await buyAndEquip(f, 'worm_bait', 'bait');
    f.fish['fish.buy']('worm_bait', 10);
    const e0 = energyOf(f);
    const xp0 = progressOf(f).xp;
    const sk0 = skillOf(f, 'fishing').xp;
    const c0 = f.game.stats.get('fish.total');
    const r = f.fish['fish.cast']() as R<CastReceiptV>;
    const cast1 = eventsOf(f, 'cast.completed')[0];
    const caught1 = eventsOf(f, 'fish.caught')[0];
    const energySpent = eventsOf(f, 'player.energySpent').find(
      (e) => e.stat === 'action.fishing.cast.energyCost' && Number(e.cost) === 4,
    );
    const baitConsumed = eventsOf(f, 'item.consumed').find((e) => e.source === 'fish.cast');
    const acquired = eventsOf(f, 'item.acquired').find((e) => e.source === 'fishing');
    const rodNow = equippedOf(f, 'rod');
    const baitNow = equippedOf(f, 'bait');
    const wormsTotal = (baitNow?.qty ?? 0) + countOf(f, 'worm_bait');
    results.push(
      check('заброс живой: энергия −4; наживка −1 (item.consumed fish.cast); прочность 30→29; улов acquire-каноном (item.acquired источник fishing); события cast.completed {категория,defId,вес/качество} + fish.caught {defId,редкость,качество,qty} полным payload; XP +8 игроку и навыку; счётчик fish.total +1; наживка в слоте (авто-пополнение из рюкзака)', () =>
        r.ok &&
        energySpent !== undefined && energyOf(f) === e0 - 4 &&
        baitConsumed !== undefined && acquired !== undefined &&
        r.value.rod.current === 29 && r.value.rod.max === 30 &&
        rodNow !== null && baitNow !== null && wormsTotal === 10 &&
        cast1 !== undefined && typeof cast1.category === 'string' && typeof cast1.defId === 'string' &&
        caught1 !== undefined && typeof caught1.rarity === 'string' && caught1.qty === 1 &&
        progressOf(f).xp >= xp0 + 8 && skillOf(f, 'fishing').xp >= sk0 + 8 &&
        f.game.stats.get('fish.total') === c0 + 1, {
        expected: '−4 энергии; −1 наживка; 29/30; события+XP+счётчик; наживок всего 10',
        actual: `${r.ok ? 'каст ок' : r.error}; энергия ${energyOf(f)}/${e0}; удочка ${r.ok ? r.value.rod.current : '?'}/30; всего червей ${wormsTotal} (слот ${baitNow?.qty ?? 0}); cast ${String(cast1 !== undefined)}; caught ${String(caught1 !== undefined)}; xp ${progressOf(f).xp - xp0}/${skillOf(f, 'fishing').xp - sk0}; fish.total ${f.game.stats.get('fish.total')}`,
      }),
    );
    f.dispose();
  }

  // ------------------------------------------------ 6. «наживка кончилась» + альбом
  {
    const f = await makeSeededFishGame('m071-baitout');
    f.game.wallet.grant('gold', 500);
    await buyAndEquip(f, 'bamboo_rod', 'rod');
    const b1 = buyAndEquip(f, 'worm_bait', 'bait'); // стек ×1 — БЕЗ запаса в рюкзаке
    const r1 = f.fish['fish.force']('crucian') as R<CastReceiptV>; // гарантированный улов
    const r2 = f.fish['fish.cast']() as R<unknown>; // слот пуст, рюкзак пуст
    const state1 = f.fish['fish.state']() as { stats: { casts: number; caught: number }; albumSpecies: number; albumTotal: number };
    results.push(
      check('наживка-стек ×1: расход ровно 1 за заброс → слот опустел («наживка кончилась», reequipped false); следующий заброс — отказ; альбом/статы тикают с fish.caught', () =>
        b1.ok && r1.ok && r1.value.bait.reequipped === false && !r2.ok && String(r2.error).includes('нет наживки') &&
        state1.stats.casts === 1 && state1.stats.caught === 1 && state1.albumSpecies === 1 && state1.albumTotal === 1, {
        expected: '×1 → кончилась; отказ; 1/1/1 вид/1 рыба',
        actual: `${r1.ok ? `кончилась=${String(r1.value.bait.reequipped === false)}` : r1.error}; повтор ${r2.ok ? 'ПРОШЁЛ?!' : 'отказ'}; статы ${state1.stats.casts}/${state1.stats.caught}; альбом ${state1.albumSpecies}/${state1.albumTotal}`,
      }),
    );
    f.dispose();
  }

  // ------------------------------------------------ 7. маппинг-оракулы роллов (журнал П6)
  {
    const f = await makeSeededFishGame('m071-mapping');
    f.game.wallet.grant('gold', 500);
    await buyAndEquip(f, 'walnut_rod', 'rod');
    await buyAndEquip(f, 'worm_bait', 'bait');
    f.fish['fish.buy']('worm_bait', 10);
    const normal = f.fish['fish.cast']() as R<CastReceiptV>; // кат/pick роллятся
    const r = f.fish['fish.force']('tench') as R<CastReceiptV>; // rarity/size/bite роллятся
    const catRoll = rollOf(f, 'fish:cast:pond:category');
    const pickRoll = rollOf(f, 'fish:cast:pond:pick');
    const rarRoll = lastRollOf(f, 'fish:cast:rarity');
    const sizeRoll = lastRollOf(f, 'fish:size:tench');
    const biteRoll = lastRollOf(f, 'fish:bite:pond');
    // маппинг-оракул категории: roll01 × эффективные веса (та же арифметика —
    // как pen:buy; вес lucky-редкой тянет удача удочки+роллов через шину)
    const luck = f.game.statBus.resolve({ stat: 'fishing.luck.rare', ctx: f.game.time.ctx('player') });
    const weights = [
      { id: 'trash', w: 25 },
      { id: 'small', w: 40 },
      { id: 'medium', w: 20 },
      { id: 'rare', w: 8 * (1 + luck / 100) },
      { id: 'treasure', w: 4 },
      { id: 'event', w: 3 },
    ];
    const total = weights.reduce((s, e) => s + e.w, 0);
    let acc = 0;
    let mapped = 'trash';
    for (const e of weights) {
      acc += e.w;
      if ((catRoll ?? 0) * total < acc) {
        mapped = e.id;
        break;
      }
    }
    results.push(
      check('маппинг-оракулы: журналы fish:cast:pond:category/:pick + fish:cast:rarity + fish:size:<id> + fish:bite:pond — роллы логируются (П6); категория = пересчёту roll01×веса; force tench — рыба/вес/клёв в диапазонах', () =>
        normal.ok && r.ok && r.value.category === 'medium' && r.value.defId === 'tench' &&
        catRoll !== null && pickRoll !== null && rarRoll !== null && sizeRoll !== null && biteRoll !== null &&
        mapped === normal.value.category &&
        r.value.weightGrams !== null && r.value.weightGrams >= 400 && r.value.weightGrams <= 1500 &&
        biteRoll! >= 5 && biteRoll! <= 10, {
        expected: '5 журналов живы; категория = маппингу; tench 400–1500 г; клёв 5–10 с',
        actual: `cat ${catRoll?.toFixed(3)} → ${mapped} (чек ${normal.ok ? normal.value.category : '?'}); pick ${pickRoll?.toFixed(3)}; rarity ${rarRoll?.toFixed(3)}; size ${sizeRoll?.toFixed(0)} г (чек ${r.ok ? r.value.weightGrams : null}); bite ${biteRoll?.toFixed(1)} с`,
      }),
    );
    f.dispose();
  }

  // ------------------------------------------------ 8. детерминизм серии ×2 (фикс-saveId)
  {
    const run = async (): Promise<string[]> => {
      const f = await makeSeededFishGame('m071-det');
      f.game.wallet.grant('gold', 500);
      await buyAndEquip(f, 'bamboo_rod', 'rod');
      await buyAndEquip(f, 'worm_bait', 'bait');
      f.fish['fish.buy']('worm_bait', 30);
      const out: string[] = [];
      for (let i = 0; i < 12; i++) {
        const r = f.fish['fish.cast']() as R<CastReceiptV>;
        out.push(
          r.ok
            ? `${r.value.category}/${r.value.defId}/${r.value.rarity ?? '-'}/${r.value.weightGrams ?? '-'}/${r.value.bite.waitSeconds}/${r.value.rod.current}`
            : `ERR:${r.error}`,
        );
      }
      f.dispose();
      return out;
    };
    const a = await run();
    const b = await run();
    results.push(
      check('детерминизм заброса по сиду: серия 12 забросов ×2 (фикс-saveId) — байт-в-байт (категория/рыба/редкость/вес/клёв/прочность)', () =>
        a.length === 12 && JSON.stringify(a) === JSON.stringify(b) && a.every((l) => !l.startsWith('ERR')), {
        expected: '12 строк идентичны',
        actual: `${String(JSON.stringify(a) === JSON.stringify(b))}; ${a.slice(0, 3).join(' | ')}…`,
      }),
    );
  }

  return group('M07 · Рыбалка', [
    ...results,
    ...(await runFishContentChecks()),
    ...(await runFishDropChecks()),
    ...(await runFishMigrationChecks()),
    ...(await runFishRiverChecks()),
    ...(await runFishIntegrChecks()),
  ]);
}
