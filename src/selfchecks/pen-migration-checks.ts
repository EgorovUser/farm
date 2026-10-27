/**
 * Self-checks M06 «Загон» — часть 3: миграция v11 + roundtrip + «Грибник» +
 * манифест (сеанс M06.1; расщепление 01 §6 — см. pen-checks/pen-prod-checks).
 *
 * Оракулы: migrate10to11 (дефолт-срез / идемпотентность / цепочка v3→v11 /
 * v99-отказ); roundtrip v11 байт-в-байт (животные/склад/даты); «Грибник» —
 * счётчик тикает ТОЛЬКО грибами → ачивка → флаг → гейт Свиньи открывается;
 * манифест 1.0.0 = факту (publicApi ×7 / 1 событие / 2 подписки / пусто×3).
 */
import { COUNTERS_TABLE } from '@/content/player/counters';
import { ACHIEVEMENTS } from '@/content/quests/achievements';
import { migrateSaveData } from '@/kernel/save/migrations';
import { check, type CheckResult } from './types';
import { MemoryStorage } from '@/kernel/save/storage-drivers';
import { PEN_T0, PEN_HOUR, levelPlayerTo, makePenGame, makeSeededPenGame, penView, type R } from './pen-fixture';

const HOUR = PEN_HOUR;

export async function runPenMigrationChecks(): Promise<CheckResult[]> {
  const results: CheckResult[] = [];

  // ------------------------------------------------ 13. миграция migrate10to11 + цепочка + v99
  {
    const v10 = {
      saveVersion: 10,
      saveId: 'm061-v10-donor',
      savedAt: PEN_T0,
      contentVersion: '0.1.0-phase0',
      modules: { 'kernel.wallet': { balances: [['gold', 4321]] }, farm: { v: 1, tabs: [{ id: 'field', kind: 'field', tiles: [] }] } },
      lastSeen: PEN_T0,
    };
    const m = migrateSaveData({ ...v10 });
    const penSlice = (m.data.modules as Record<string, unknown>)['pen'] as
      | { animals?: unknown[]; stock?: Record<string, number>; overflow?: Record<string, number> }
      | undefined;
    // идемпотентность: срез уже есть — не перезаписывается
    const withPen = {
      ...v10,
      modules: { ...v10.modules, pen: { v: 1, animals: [{ speciesId: 'chicken', quality: 'B' }], stock: { egg: 2 }, overflow: {} } },
    };
    const m2 = migrateSaveData(withPen);
    const pen2 = (m2.data.modules as Record<string, unknown>)['pen'] as { animals: Array<{ speciesId: string }> };
    // холодная цепочка v3 → v12 (9 шагов), v99 — отказ
    const v3 = { saveVersion: 3, saveId: 'v3-pen', savedAt: PEN_T0, contentVersion: '0', modules: { 'kernel.wallet': { balances: [['gold', 7]] } }, lastSeen: PEN_T0 };
    const m3 = migrateSaveData(v3);
    let threw99 = false;
    try {
      migrateSaveData({ saveVersion: 99, saveId: 'x', savedAt: 0, contentVersion: '0', modules: {}, lastSeen: 0 });
    } catch {
      threw99 = true;
    }
    results.push(
      check('migrate10to12: v10-донор → v12 + pen-дефолт { animals: [], stock: {}, overflow: {} }, прежние срезы целы; идемпотентность (живой pen НЕ перезаписан); v3→v12 9 шагов; v99 — отказ [M11 · v14 → M12.1 · v15]', () => // [M07.1 · v12] донор v10 идёт до текущей (2 шага: pen + fishing) — [M11 · v14] +1 шаг workers, [M12.1 · v15] +1 шаг mine
        m.data.saveVersion === 15 && m.steps === 5 &&
        JSON.stringify(penSlice) === JSON.stringify({ v: 1, animals: [], stock: {}, overflow: {} }) &&
        (m.data.modules as Record<string, unknown>)['farm'] !== undefined &&
        (m.data.modules as Record<string, unknown>)['fishing'] !== undefined &&
        m2.data.saveVersion === 15 && pen2.animals[0]!.speciesId === 'chicken' &&
        m3.data.saveVersion === 15 && m3.steps === 12 &&
        (m3.data.modules as Record<string, unknown>)['pen'] !== undefined &&
        threw99, {
        expected: 'v12/2 шага/дефолт+fishing; идемпотентно; v3→12 9 шагов; v99 отказ [M11 · v14: +1][M12.1 · v15: +1]',
        actual: `v${m.data.saveVersion} ${m.steps} шаг; pen ${JSON.stringify(penSlice)}; идем ${pen2.animals[0]!.speciesId}; v3→${m3.data.saveVersion} ${m3.steps}; v99 ${threw99}`,
      }),
    );
  }

  // ------------------------------------------------ 14. roundtrip v12: животные/склад/даты байт-в-байт
  {
    const storage = new (await import('@/kernel/save/storage-drivers')).MemoryStorage();
    const f = makePenGame(storage);
    await f.game.init();
    f.game.wallet.grant('gold', 300);
    f.pen['pen.buy']('chicken');
    f.pen['pen.buy']('goat');
    f.clock.set(PEN_T0 + 20 * HOUR);
    penView(f); // каскад: яйцо 3 (cap), молоко 2
    await f.game.save.save();
    const raw = JSON.parse((await storage.get('main')) ?? '{}') as { saveVersion: number; modules: { pen: { animals?: unknown[] } } };
    const f2 = makePenGame(storage);
    await f2.game.init();
    await f2.game.save.save();
    const raw2 = JSON.parse((await storage.get('main')) ?? '{}') as { modules: { pen: unknown } };
    results.push(
      check('roundtrip v12: животные/склад/overflow/dates байт-в-байт через dispose/load (срез pen в файле) [M11 · v14]', () => // [M07.1 · v12]
        raw.saveVersion === 15 && // [M12.1 · v15]
        JSON.stringify(raw.modules.pen) === JSON.stringify(raw2.modules.pen) &&
        JSON.stringify(raw.modules.pen) !== JSON.stringify({ v: 1, animals: [], stock: {}, overflow: {} }), {
        expected: 'pen-срез идентичен после reload (не дефолт)',
        actual: `${String(JSON.stringify(raw.modules.pen) === JSON.stringify(raw2.modules.pen))} (${String((raw.modules.pen as { animals?: unknown[] }).animals?.length)} животных)`,
      }),
    );
    f.dispose();
    f2.dispose();
  }

  // ------------------------------------------------ 15. «Грибник»: счётчик → ачивка → флаг → гейт Свиньи
  {
    const f = await makeSeededPenGame('m061-pen-mycologist');
    f.game.wallet.grant('gold', 600);
    levelPlayerTo(f, 5);
    const noAch = f.pen['pen.buy']('pig') as R<unknown>;
    // 25 сборов грибницы событийным каналом (payload F4/M05 — defId гриб)
    for (let i = 0; i < 25; i++) {
      f.game.bus.publish('farm.cropHarvested', { defId: 'mushroom', qty: 2, quality: { tier: 'D', value: 1 }, tab: 'mushroom' });
    }
    // пшеница НЕ тикает счётчик грибов (фильтр defId)
    f.game.bus.publish('farm.cropHarvested', { defId: 'wheat_grain', qty: 5, quality: { tier: 'D', value: 1 }, tab: 'field' });
    const counters = (f.game.stats as unknown as { get(id: string): number }).get('farm.mushroom.harvests');
    const achs = (f.game.modules.get('quests')?.api['quests.list'] as unknown as (t: string) => Array<{ id: string; unlocked: boolean }>)('ach');
    const flags = (f.game.modules.get('quests')?.api['quests.flags'] as unknown as () => string[])();
    const withAch = f.pen['pen.buy']('pig') as R<{ name: string }>;
    const counterDef = COUNTERS_TABLE.find((c) => c.id === 'farm.mushroom.harvests');
    const achDef = ACHIEVEMENTS.find((a) => a.id === 'ach_mycologist');
    results.push(
      check('«Грибник»: счётчик farm.mushroom.harvests тикает ТОЛЬКО грибами (25, пшеница не считается); 25 → ачивка unlocked + флаг ach.farm.mycologist; гейт Свиньи: без — отказ «ачинка»... «ачивка», с — покупка жива', () =>
        !noAch.ok && noAch.error.includes('ачивка ach_mycologist') &&
        counters === 25 &&
        (achs ?? []).some((a) => a.id === 'ach_mycologist' && a.unlocked === true) &&
        flags.includes('ach.farm.mycologist') &&
        withAch.ok && withAch.value.name === 'Свинья' &&
        counterDef?.event === 'farm.cropHarvested' && JSON.stringify(counterDef.filter) === JSON.stringify({ defId: 'mushroom' }) &&
        achDef !== undefined && JSON.stringify(achDef.unlockFlags) === JSON.stringify(['ach.farm.mycologist']), {
        expected: '25 (не 26) / unlocked / флаг / покупка жива',
        actual: `счётчик ${counters}, unlocked ${String((achs ?? []).some((a) => a.id === 'ach_mycologist' && a.unlocked))}, флаг ${String(flags.includes('ach.farm.mycologist'))}, покупка ${withAch.ok}`,
      }),
    );
    f.dispose();
  }

  // ------------------------------------------------ 16. манифест 1.1.0 = факту + изоляция среза
  //     (M06.2: ратифицированный bump — болезни + улучшения, один на сеанс;
  //     прецедент farm 1.2.0 M05.3)
  {
    const f = makePenGame();
    await f.game.init();
    const m = f.game.modules.get('pen')?.manifest;
    const empty = penView(f);
    results.push(
      check('манифест: 1.1.0 (publicApi ×15: M06.1 + heal/upgrade/upgrades/breed/sell/manure×2 + dev produce/sick); eventsPublished [pen.produceCollected, pen.animalSick] (= каталог 02 §4, строка animalSick — спека Task 40); подписки [hourTick, dayTick]; providers [penUpgradesProvider]; executors [pen.feed/clean/collect/pet/autofeeder]; counters ПУСТО; пустой загон: слотов 4, животных 0, склад пуст', () =>
        m?.version === '1.1.0' && m.id === 'pen' && m.stateKey === 'pen' &&
        JSON.stringify(m.eventsPublished) === JSON.stringify(['pen.produceCollected', 'pen.animalSick']) &&
        JSON.stringify(m.eventsSubscribed) === JSON.stringify([
          { event: 'time.hourTick', handler: 'onHourTick' },
          { event: 'time.dayTick', handler: 'onDayTick' },
        ]) &&
        JSON.stringify(m.modifierProviders) === JSON.stringify(['penUpgradesProvider']) &&
        JSON.stringify(m.taskExecutors) === JSON.stringify(['pen.feed', 'pen.clean', 'pen.collect', 'pen.pet', 'pen.autofeeder']) &&
        JSON.stringify(m.statsCounters) === JSON.stringify([]) &&
        empty.slots.base === 4 && empty.slots.used === 0 && empty.animals.length === 0 && empty.stock.length === 0, {
        expected: '1.1.0 / 15 api / 2 события / 2 подписки / 1+5+0 / 4 слота',
        actual: `${m?.version} / ${m?.publicApi?.length} / ${m?.eventsPublished?.length} / ${m?.eventsSubscribed?.length} / ${m?.modifierProviders?.length}+${m?.taskExecutors?.length}+${m?.statsCounters?.length} / ${empty.slots.base} слотов`,
      }),
    );
    f.dispose();
  }

  return results;
}
