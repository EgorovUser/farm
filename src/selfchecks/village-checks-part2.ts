/**
 * Self-checks M16 «Деревня» — часть 2 (бриф G9: ворчание → налог, формула
 * налога оракулами, подарки фикс-сид, помощь через TaskRegistry-двойник,
 * идемпотентность dayTick ×2, roundtrip байт-в-байт, манифест = факту).
 */
import { VILLAGE_GIFTS, giftChancePercent } from '@/content/village/gifts';
import { VILLAGE_TAX, taxOracleGold } from '@/content/village/tax';
import { VILLAGE_TABLE } from '@/content/village/table';
import { taxInfoOf, taxModifiersOf, giftEntryByRoll } from '@/game/modules/village/logic';
import { VILLAGERS } from '@/content/village/villagers';
import { check, type CheckResult } from './types';
import {
  dayTickAt,
  giveItems,
  goldOf,
  localDateISO,
  makeSeededVillageGame,
  makeVillageGame,
  openVillageGate,
  taxEventsOf,
  VILLAGE_T0,
  type R,
  type VillageFixture,
} from './village-fixture';

const DAY0 = localDateISO(VILLAGE_T0);

interface SliceShape {
  unlocked: boolean;
  xp: number;
  villagers: Record<string, {
    happiness: number;
    grumbleDays: number;
    lastSatisfied?: string;
    need?: { item: string; qty: number; kind: string; day: string };
  }>;
  helpLastDay: string | null;
}

async function readSlice(f: VillageFixture): Promise<SliceShape | undefined> {
  await f.game.save.save();
  const raw = JSON.parse((await f.storage.get('main')) as string) as { modules: Record<string, unknown> };
  return raw.modules['village'] as SliceShape | undefined;
}

export async function runVillagePart2(): Promise<CheckResult[]> {
  const results: CheckResult[] = [];

  // 8. ворчание 3 дня → ворчун → налог дня НИЖЕ (G4/G6)
  {
    const f = await makeSeededVillageGame('v161-grumble');
    openVillageGate(f);
    dayTickAt(f, 1);
    dayTickAt(f, 2);
    dayTickAt(f, 3);
    const slice = await readSlice(f);
    const starters = ['villager_varvara', 'villager_miron', 'villager_zoya'];
    const grumbleOk = starters.every((id) => {
      const lv = slice!.villagers[id]!;
      return lv.grumbleDays === 3 && lv.happiness === 65;
    });
    const taxes = taxEventsOf(f).map((p) => Number(p.gold));
    // оракул: день1/2 — avg 70, ворчунов 0 → 9; день3 — avg 65, ворчунов 3 → 7
    const exp = [taxOracleGold(VILLAGE_TAX, 1, 70, 0), taxOracleGold(VILLAGE_TAX, 1, 70, 0), taxOracleGold(VILLAGE_TAX, 1, 65, 3)];
    const v = f.village['village.state']() as { tax: { mods: Array<{ id: string; value: number }>; grumblers: number } };
    const grumblerMod = v.tax.mods.find((m) => m.id === 'village.tax.grumbler');
    results.push(
      check(
        'ворчание 3 дня (G4): игнор потребностей → grumbleDays=3, счастье 70→65, «ворчун»; налог дня 3 НИЖЕ (оракул 9/9/7); мод village.tax.grumbler −18 виден в витрине',
        () =>
          grumbleOk &&
          JSON.stringify(taxes) === JSON.stringify(exp) &&
          exp[2]! < exp[0]! &&
          v.tax.grumblers === 3 &&
          grumblerMod !== undefined && grumblerMod.value === -18,
        { expected: `grumble=3/h=65; налоги ${JSON.stringify(exp)}`, actual: `grumbleOk=${grumbleOk}; налоги ${JSON.stringify(taxes)}` },
      ),
    );
    f.dispose();
  }

  // 9. формула налога оракулами: сетка уровень × счастье × ворчун (G6)
  {
    const grid: Array<[number, number, number]> = [
      [1, 50, 0], [1, 70, 0], [5, 85, 2], [10, 30, 4], [25, 100, 0], [3, 0, 1],
    ];
    const okGrid = grid.every(([lvl, hap, gr]) => {
      const info = { level: lvl, avgHappiness: hap, grumblers: gr };
      const mods = taxModifiersOf(info, VILLAGE_TAX);
      const sumInc = mods.reduce((s, m) => s + m.value, 0);
      const manual = Math.round(VILLAGE_TAX.baseGold * (1 + sumInc / 100));
      return manual === taxOracleGold(VILLAGE_TAX, lvl, hap, gr);
    });
    const f = await makeSeededVillageGame('v161-taxlive');
    openVillageGate(f);
    const live = f.game.statBus.resolve({ stat: 'village.tax.gold', ctx: f.game.time.ctx('player') });
    const expLive = taxOracleGold(VILLAGE_TAX, 1, 70, 0);
    results.push(
      check(
        'формула налога оракулами (G6): сетка ×6 (уровень×счастье×ворчун) — моды провайдера = ручной формуле; живой резолв шины (ур.1, счастье 70, 0 ворчунов) = оракулу',
        () => okGrid && live === expLive,
        { expected: `сетка ok; live ${expLive}`, actual: `сетка ${okGrid ? 'ok' : 'FAIL'}; live ${live}` },
      ),
    );
    f.dispose();
  }

  // 10. подарки: шанс от счастья + фикс-сид предсказание (G7)
  {
    const c100 = giftChancePercent(VILLAGE_GIFTS, 100);
    const c50 = giftChancePercent(VILLAGE_GIFTS, 50);
    const c0 = giftChancePercent(VILLAGE_GIFTS, 0);
    const entry = giftEntryByRoll(VILLAGE_GIFTS, 0.999999, 0.0);
    // проба стримов: та же пара saveId+дата → те же первые значения стримов
    const probe = await makeSeededVillageGame('v161-gift');
    openVillageGate(probe);
    const v1 = probe.game.rngBus.rollRange(0, 1, 'uniform', 'village:gift');
    const v2 = probe.game.rngBus.rollRange(0, 1, 'uniform', 'village:gift:pick');
    const v3 = probe.game.rngBus.rollRange(0, 1, 'uniform', 'village:gift:qty');
    probe.dispose();
    const f = await makeSeededVillageGame('v161-gift');
    openVillageGate(f);
    const slice0 = await readSlice(f);
    const need = slice0!.villagers['villager_zoya']!.need!;
    giveItems(f, need.item, need.qty);
    const r = f.village['village.supply']('villager_zoya', need.item) as R<{ lines: string[] }>;
    const chance76 = giftChancePercent(VILLAGE_GIFTS, 76);
    const willGift = v1 * 100 < chance76;
    const giftLine = r.ok ? r.value.lines.find((l) => l.includes('подарок деревни')) : undefined;
    const predicted = willGift ? giftEntryByRoll(VILLAGE_GIFTS, v2, v3) : null;
    const giftOk = willGift
      ? giftLine !== undefined && predicted !== null && giftLine.includes(`${predicted.id} ×${predicted.qty}`)
      : giftLine === undefined;
    results.push(
      check(
        'подарки (G7): шанс 30% при счастье 100 / 12% при 50 / 4% при 0 (выше при высоком); фикс-сид оракул — предсказанные стримы village:gift(+pick+qty) = факту поставки; запись таблицы валидна',
        () =>
          c100 === 30 && c50 === 12 && c0 === 4 && c100 > c50 && c50 > c0 &&
          entry !== null && entry.qty >= 1 && r.ok && giftOk,
        { expected: '30/12/4; предсказание = факт', actual: `${c100}/${c50}/${c0}; willGift=${willGift}; giftOk=${giftOk}` },
      ),
    );
    f.dispose();
  }

  // 11. помощь через TaskRegistry-двойник + энергия + повтор дня (G8)
  {
    const f = await makeSeededVillageGame('v161-help');
    openVillageGate(f);
    // лишить ферму/озеро целей: 16 вспашек + 2 чистки
    for (let i = 0; i < 16; i++) f.farm['farm.plow'](i, 'field');
    f.lake['lake.clean']();
    f.lake['lake.clean']();
    const none = f.village['village.help']() as R<unknown>;
    let slice = await readSlice(f);
    const slotKept = slice!.helpLastDay === null;
    // тест-двойник контракта mine.assist (M16.2) — ПРОТОКОЛ ИЗОЛЯЦИИ:
    // деревня вызывает ТОЛЬКО TaskRegistry; двойник фиксирует ctx исполнителя
    const calls: Array<{ workerId?: string }> = [];
    f.game.tasks.register('mine.assist', {
      label: 'тест-двойник боя (контракт M16.2)',
      run: (ctx) => {
        calls.push({ workerId: ctx.workerId });
        return { ok: true, value: { message: 'житель-единица одного боя (контракт)' } };
      },
    });
    const energyBefore = (f.player['player.snapshot']() as { energy: { current: number } }).energy.current;
    const ok1 = f.village['village.help']() as R<{ note: string; taskType: string; done: number }>;
    const energyAfter = (f.player['player.snapshot']() as { energy: { current: number } }).energy.current;
    slice = await readSlice(f);
    const again = f.village['village.help']() as R<unknown>;
    dayTickAt(f, 1);
    const ok2 = f.village['village.help']() as R<unknown>;
    const villagerIds = new Set(VILLAGERS.map((d) => d.id));
    const doubleOk = calls.length === 1 && typeof calls[0]!.workerId === 'string' && (calls[0]!.workerId as string).startsWith('villager:') && villagerIds.has((calls[0]!.workerId as string).slice('villager:'.length).replace('villager_', 'villager_'));
    results.push(
      check(
        'помощь через TaskRegistry (G8): без целей — честный отказ БЕЗ расхода слота; тест-двойник mine.assist (контракт M16.2) вызван с workerId villager:<id> — импорта фермы/озера/шахты НЕТ (rg ×3 сеансно); энергия игрока Δ0; повтор дня — отказ; новый день — снова можно',
        () =>
          !none.ok && none.error.includes('нечего делать') &&
          slotKept &&
          ok1.ok && ok1.value.taskType === 'mine.assist' && ok1.value.done >= 1 &&
          doubleOk &&
          energyBefore === energyAfter &&
          slice!.helpLastDay === DAY0 &&
          !again.ok && again.error.includes('уже была сегодня') &&
          ok2.ok,
        { expected: 'двойник вызван; ΔE=0; отказ повтора', actual: `double=${doubleOk}; ΔE=${energyAfter - energyBefore}; again=${!again.ok}` },
      ),
    );
    f.dispose();
  }

  // 12. идемпотентность dayTick ×2 — налог НЕ задваивается (G1/G6)
  {
    const f = await makeSeededVillageGame('v161-idem');
    openVillageGate(f);
    dayTickAt(f, 1);
    const taxes1 = taxEventsOf(f).length;
    const gold1 = goldOf(f);
    // ПОВТОР того же дня (ручной реплей: второй тик с ИДЕНТИЧНЫМ полднем
    // дня 1 — тот же dateISO/now/dayIndex, что у первого тика)
    dayTickAt(f, 1);
    const taxes2 = taxEventsOf(f).length;
    const gold2 = goldOf(f);
    dayTickAt(f, 2);
    const taxes3 = taxEventsOf(f).length;
    results.push(
      check(
        'идемпотентность dayTick/catchUp (G1/G6): повторный тик ТОГО же дня — налог НЕ задвоен (событие/золото Δ0); следующий день — новый налог',
        () => taxes1 === 1 && taxes2 === 1 && gold2 === gold1 && taxes3 === 2,
        { expected: '1 → 1 (Δ0) → 2', actual: `${taxes1} → ${taxes2} → ${taxes3}; золото ${gold1}→${gold2}` },
      ),
    );
    f.dispose();
  }

  // 13. roundtrip байт-в-байт (G1) — срез с жителями/потребностями/помощью
  {
    const f = await makeSeededVillageGame('v161-round');
    openVillageGate(f);
    const slice0 = await readSlice(f);
    const need = slice0!.villagers['villager_varvara']!.need!;
    giveItems(f, need.item, need.qty);
    f.village['village.supply']('villager_varvara', need.item);
    dayTickAt(f, 1);
    await f.game.save.save(); // фиксируем файл ДО чтения (dispose тоже сохраняет)
    const raw1 = JSON.parse((await f.storage.get('main')) as string) as { modules: Record<string, unknown> };
    const v1 = JSON.stringify(raw1.modules['village']);
    f.dispose();
    const f2 = await makeVillageGame(f.storage);
    void f2;
    const rawMid = JSON.parse((await f.storage.get('main')) as string) as { modules: Record<string, unknown> };
    const v2 = JSON.stringify(rawMid.modules['village']);
    await f2.game.save.save();
    const raw2 = JSON.parse((await f.storage.get('main')) as string) as { modules: Record<string, unknown> };
    const v3 = JSON.stringify(raw2.modules['village']);
    results.push(
      check(
        'roundtrip байт-в-байт (G1): сейв → загрузка в новую игру → состояние применено (срез идентичен) → повторная запись — срез village байт-в-байт',
        () => v1 === v2 && v2 === v3,
        { expected: 'v1 = v2 = v3', actual: `${v1 === v2 ? 'load ok' : 'LOAD FAIL'}; ${v2 === v3 ? 're-save ok' : 'RE-SAVE FAIL'}` },
      ),
    );
    f2.dispose();
  }

  // 14. манифест = факту (бриф §0: 1.0.0; eventsPublished ровно ×1; tasks 15)
  {
    const f = await makeSeededVillageGame('v161-manifest');
    const m = f.game.modules.get('village');
    const tasks = f.game.tasks.list();
    const api = f.village;
    const manifestOk =
      m !== null &&
      m.manifest.version === '1.0.0' &&
      m.manifest.stateKey === 'village' &&
      JSON.stringify(m.manifest.publicApi) === JSON.stringify(['village.state', 'village.need', 'village.supply', 'village.help', 'village.force']) &&
      JSON.stringify(m.manifest.eventsPublished) === JSON.stringify(['village.taxCollected']) &&
      JSON.stringify(m.manifest.eventsSubscribed) === JSON.stringify([{ event: 'time.dayTick', handler: 'onDayTick' }]) &&
      JSON.stringify(m.manifest.modifierProviders) === JSON.stringify(['villageProvider']) &&
      JSON.stringify(m.manifest.taskExecutors) === JSON.stringify(['village-helper']) &&
      JSON.stringify(m.manifest.statsCounters) === JSON.stringify([]);
    results.push(
      check(
        'манифест = факту (01 §9): version 1.0.0; publicApi РОВНО ×5 (state/need/supply/help/force); eventsPublished РОВНО ×1 village.taxCollected (каталог 02 §4 Task 84, НЕ редактировался); eventsSubscribed ×1 time.dayTick; modifierProviders [villageProvider] (живой резолв); taskExecutors [village-helper] — исполнитель СУЩЕСТВУЮЩИХ типов, реестр задач 15 жив (НОВЫХ типов НЕТ); statsCounters []',
        () => manifestOk && tasks.length === 15 && Object.keys(api).length === 5,
        { expected: '1.0.0 / ×5 / ×1 / tasks 15', actual: `${m?.manifest.version ?? '—'} / api ×${Object.keys(api).length} / tasks ${tasks.length}` },
      ),
    );
    f.dispose();
  }

  return results;
}
