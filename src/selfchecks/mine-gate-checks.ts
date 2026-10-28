/**
 * Группа «M12 Шахта» · ЧАСТЬ 2/2 сеанса M12.2 — гейты слоёв + вход (энергия)
 * + износ кирки + ачивки auto-claim + roundtrip + сверка данных (G3–G5, G8).
 * Оркестратор — mine-checks.ts; движковые фазы — mine-boss-checks.ts.
 */
import { check, type CheckResult } from './types';
import { MINE_LAYERS } from '@/content/mine/layers';
import { MINE_BOSSES } from '@/content/mine/bosses';
import type { ItemDef } from '@/content/items/items';
import type { AchievementDef } from '@/content/quests/types';
import { makeSeededMineGame, eventsOf, mineStateOf, type MineFixture } from './mine-fixture';
import type { Game } from '@/game/bootstrap';

type R<T> = { ok: true; value: T } | { ok: false; error: string };
interface EnterView { header: string; lines: string[] }

/** выдать кирку + экипировать (витрина M02); предыдущая снимается */
function equipPickaxe(f: MineFixture, tier: 'D' | 'B' | 'A' | 'S'): string {
  const eq = (f.inv['inventory.equipped'] as () => Array<{ slot: string; entry: { iid: string } }>)();
  if (eq.some((e) => e.slot === 'pickaxe')) {
    (f.inv['inventory.unequip'] as (slot: string) => R<unknown>)('pickaxe'); // слот, НЕ iid
  }
  (f.inv['inventory.add'] as (d: string, t: string, v: number, q: number, s: string) => R<{ iids: string[] }>)(
    'iron_pickaxe',
    tier,
    50,
    1,
    'selfcheck',
  );
  const list = (f.inv['inventory.list'] as () => Array<{ iid: string; defId: string }>)();
  const pick = list.findLast((i) => i.defId === 'iron_pickaxe')!;
  (f.inv['inventory.equip'] as (iid: string, slot: string) => R<unknown>)(pick.iid, 'pickaxe');
  return pick.iid;
}

/** баф канала ядра (BUF-1): усиление для детерминированных побед */
function buffWin(f: MineFixture): void {
  const now = f.game.time.now();
  f.game.buffs.add(
    { id: 'selfcheck.mine.atk', source: { kind: 'buff', refId: 'selfcheck' }, stat: 'combat.attack', op: 'flat', value: 100 },
    now,
  );
  f.game.buffs.add(
    { id: 'selfcheck.mine.def', source: { kind: 'buff', refId: 'selfcheck' }, stat: 'combat.defense', op: 'flat', value: 100 },
    now,
  );
}

const flagsOf = (game: Game): string[] => {
  const quests = game.modules.get('quests');
  const gate = quests?.api['quests.gateExtras'] as () => Record<string, unknown>;
  return Object.keys(gate()).filter((k) => k.startsWith('flag:')).map((k) => k.slice(5));
};

const energyOf = (game: Game): number =>
  (game.modules.get('player')?.api['player.snapshot'] as () => { energy: { current: number } })()
    .energy.current;

export async function runMineGateChecks(): Promise<CheckResult[]> {
  const results: CheckResult[] = [];

  // ------------------------------------------------ 23. гейты кирки: 4 диапазона + ачивка + данные
  {
    const f = await makeSeededMineGame('m122-gates');
    equipPickaxe(f, 'D'); // тир 1
    const d3 = f.mine['mine.boss'](3) as R<unknown>;
    equipPickaxe(f, 'B'); // тир 3
    const b3 = f.mine['mine.boss'](3) as R<unknown>;
    const b5 = f.mine['mine.boss'](5) as R<unknown>;
    equipPickaxe(f, 'A'); // тир 4
    const a5 = f.mine['mine.boss'](5) as R<unknown>;
    const a7 = f.mine['mine.boss'](7) as R<unknown>;
    equipPickaxe(f, 'S'); // тир 5
    const s7 = f.mine['mine.boss'](7) as R<unknown>;
    const out10 = f.mine['mine.enter'](10) as R<EnterView>;
    results.push(
      check('гейты кирки G3 — оракулы по 4 диапазонам (карточка §2, тир D/C/B/A/S/SS через витрину): D (тир 1) → слой 3 отказ «нужна железная кирка (тир 3+)»; B (тир 3) → слой 3 тир проходит (отказ ТОЛЬКО по ачивке слоя 2), слой 5 → «нужна стальная кирка (тир 4+)»; A (тир 4) → слой 5 тир проходит, слой 7 → «нужна мифриловая кирка (тир 5+)»; S (тир 5) → слой 7 тир проходит (отказ по ачивке); данные minTier = 1/1/3/3/4/4/5/5/5; слой 10 — вне данных шахты (слои 1–9)', () =>
        !d3.ok && d3.error.includes('нужна железная кирка (тир 3+)') &&
        !b3.ok && b3.error.includes('ачивка слоя 2') && !b3.error.includes('кирка') &&
        !b5.ok && b5.error.includes('нужна стальная кирка (тир 4+)') &&
        !a5.ok && a5.error.includes('ачивка слоя 4') && !a5.error.includes('кирка') &&
        !a7.ok && a7.error.includes('нужна мифриловая кирка (тир 5+)') &&
        !s7.ok && s7.error.includes('ачивка слоя 6') && !s7.error.includes('кирка') &&
        !out10.ok && out10.error.includes('вне данных шахты (слои 1–9)') &&
        JSON.stringify(MINE_LAYERS.map((l) => l.pickGate.minTier)) === JSON.stringify([1, 1, 3, 3, 4, 4, 5, 5, 5]), {
        expected: 'отказы по тиру/ачивке/данным во всех диапазонах; minTier 1,1,3,3,4,4,5,5,5',
        actual: `D-L3 ${d3.ok ? 'OK (НЕ ДОЛЖЕН)' : 'тир-отказ'}; B-L3 ${b3.ok ? 'OK (НЕ ДОЛЖЕН)' : 'ачивка-отказ'}; B-L5 ${b5.ok ? 'OK (НЕ ДОЛЖЕН)' : 'тир-отказ'}; A-L5 ${a5.ok ? 'OK (НЕ ДОЛЖЕН)' : 'ачивка-отказ'}; A-L7 ${a7.ok ? 'OK (НЕ ДОЛЖЕН)' : 'тир-отказ'}; S-L7 ${s7.ok ? 'OK (НЕ ДОЛЖЕН)' : 'ачивка-отказ'}; L10 ${out10.ok ? 'OK (НЕ ДОЛЖЕН)' : 'данные-отказ'}`,
      }),
    );
    f.dispose();
  }

  // ------------------------------------------------ 24. энергия входа: < 20 отказ / ≥ 20 расход ровно 20
  {
    const f = await makeSeededMineGame('m122-energy');
    equipPickaxe(f, 'D');
    (f.player['player.setEnergy'] as (n: number) => unknown)(19);
    const e19 = f.mine['mine.enter'](1) as R<EnterView>;
    const afterRefusal = energyOf(f.game);
    (f.player['player.setEnergy'] as (n: number) => unknown)(100);
    const ok1 = f.mine['mine.enter'](1) as R<EnterView>;
    const afterEnter = energyOf(f.game);
    results.push(
      check('энергия входа G4 [DECISION]: < 20 → честный отказ «не хватает энергии … нужно 20» (энергия НЕ тронута — 19/19); ≥ 20 → вход + расход РОВНО 20 (100 → 80); тратится ОДИН раз при входе — бой без энергии на раунды (mine.boss гейты БЕЗ энергии)', () =>
        !e19.ok && e19.error.includes('не хватает энергии') && e19.error.includes('20') &&
        afterRefusal === 19 &&
        ok1.ok && afterEnter === 80, {
        expected: 'отказ при 19 (19/19); вход при 100 → 80',
        actual: `19: ${e19.ok ? 'ok (НЕ ОТКАЗ)' : 'отказ'} (энергия ${afterRefusal}); 100 → ${ok1.ok ? 'вход' : 'отказ'} → ${afterEnter}`,
      }),
    );
    f.dispose();
  }

  // ------------------------------------------------ 25. износ кирки −1 за победу с добычей
  {
    const f = await makeSeededMineGame('m122-wear');
    const iid = equipPickaxe(f, 'D');
    (f.inv['inventory.dur'] as (iid: string, n: number) => R<{ current: number; max: number }>)(
      iid,
      50,
    );
    buffWin(f);
    const r = f.mine['mine.fight']('spider', 1, 42) as R<{ outcome: string; loot: { wear?: string } | null }>;
    // прочность — из витрины экипировки (экипированные НЕ занимают слоты списка)
    const eqAfter = (f.inv['inventory.equipped'] as () => Array<{ slot: string; entry: { iid: string; durability?: { current: number } } }>)();
    const dur = eqAfter.find((e) => e.slot === 'pickaxe')?.entry.durability?.current ?? -1;
    results.push(
      check('износ кирки G4: победа с добычей → прочность −1 витриной (50 → 49; канал inventory.wear D35 «потребители M05+», M02 НЕ тронут) — wear в раскладе витрины', () =>
        r.ok && r.value.outcome.startsWith('ПОБЕДА') &&
        r.value.loot !== null && r.value.loot!.wear !== undefined &&
        r.value.loot!.wear!.includes('49/100') && dur === 49, {
        expected: '50 → 49; wear в витрине лута',
        actual: `прочность ${dur}; wear ${r.ok ? (r.value.loot?.wear ?? '—') : 'ошибка'}`,
      }),
    );
    f.dispose();
  }

  // ------------------------------------------------ 26. ачивка auto-claim + гейт слоя 2
  {
    const f = await makeSeededMineGame('m122-ach');
    const unlocked: Array<Record<string, unknown>> = [];
    const off = f.game.bus.subscribe('achievement.unlocked', (p) => unlocked.push(p as Record<string, unknown>));
    equipPickaxe(f, 'B');
    buffWin(f);
    const before = f.mine['mine.enter'](2) as R<EnterView>;
    const boss1 = f.mine['mine.boss'](1, 2024) as R<{ outcome: string }>;
    const killsAfterBoss1 = mineStateOf(f).bossKills;
    const flags1 = flagsOf(f.game);
    const after = f.mine['mine.enter'](2) as R<EnterView>;
    const boss2gate = f.mine['mine.boss'](2, 777) as R<{ outcome: string }>;
    off();
    results.push(
      check('ачивка ach_mine_boss_1 (G2/G8): победа над королевой → трофей слоем (транзакция bossLoot) → auto-claim M15 ЖИВОЙ (item.acquired → syncAchievements): achievement.unlocked {ach_mine_boss_1} + unlockFlags «ach.mine.boss.1»; ДО победы слой 2 закрыт («нужна ачивка слоя 1»), ПОСЛЕ — открыт (ачивка И тир кирки); bossKills +1', () =>
        !before.ok && before.error.includes('нужна ачивка слоя 1') &&
        boss1.ok && boss1.value.outcome.startsWith('ПОБЕДА') &&
        unlocked.some((e) => e.id === 'ach_mine_boss_1') &&
        flags1.includes('ach.mine.boss.1') &&
        after.ok &&
        boss2gate.ok &&
        killsAfterBoss1 === 1, {
        expected: 'до — отказ по ачивке; после — вход и босс-гейт слоя 2 открыты; флаг жив',
        actual: `до ${before.ok}; unlocked ${unlocked.map((e) => String(e.id)).join(',') || '—'}; флаг ${flags1.includes('ach.mine.boss.1')}; после ${after.ok}; boss2 ${boss2gate.ok}`,
      }),
    );
    f.dispose();
  }

  // ------------------------------------------------ 27. roundtrip v15 с босс-статами
  {
    const f = await makeSeededMineGame('m122-roundtrip');
    equipPickaxe(f, 'B');
    buffWin(f);
    f.mine['mine.boss'](1, 11) as R<unknown>;
    const before = mineStateOf(f);
    await f.game.save.save();
    const json = f.game.save.exportJson();
    const f2 = await makeSeededMineGame('m122-roundtrip-b');
    await f2.game.save.importJson(json);
    await f2.game.save.save();
    const raw1 = (JSON.parse(json) as { modules: { mine: unknown }; saveVersion: number }).modules.mine;
    const raw2 = (JSON.parse(f2.game.save.exportJson()) as { modules: { mine: unknown } }).modules.mine;
    const after = mineStateOf(f2);
    results.push(
      check('roundtrip v15 БАЙТ-В-БАЙТ с босс-статами (kernel ПУСТ — срез mine не расширялся): bossKills 1 · fights 1 переживает export → import → save → re-export; канонический порядок полей цел', () =>
        before.bossKills === 1 && before.fights === 1 &&
        JSON.stringify(raw1) === JSON.stringify(raw2) &&
        JSON.stringify(after) === JSON.stringify(before), {
        expected: '1 бой/1 босс; срез ×2 идентичен',
        actual: `${before.fights}/${before.bossKills}; ${JSON.stringify(raw1) === JSON.stringify(raw2) ? 'идентичен' : 'РАЗЛИЧАЕТСЯ'}; после ${after.fights}/${after.bossKills}`,
      }),
    );
    f.dispose();
    f2.dispose();
  }

  // ------------------------------------------------ 28. моб-лут: руда слоя в раскладе
  {
    const f = await makeSeededMineGame('m122-mobloot');
    const r = f.mine['mine.fight']('spider', 1, 7) as R<{ outcome: string; loot: { gold: number; ore?: { defId: string; qty: number } } | null }>;
    const events = eventsOf(f, 'mine.enemyKilled');
    const loot = events[0]?.loot as { gold: number; ore: { defId: string; qty: number } } | undefined;
    const bossKilled = eventsOf(f, 'mine.bossKilled').length;
    results.push(
      check('моб-лут G5: победа над мобом → enemyKilled расклад {gold, ore: руда слоя copper_ore ×1–2} + зачисление ОДНОЙ транзакцией mine.loot (золото+руда; шанс-предмет — по роллу); ОРАКУЛ: моб-бой mine.bossKilled НЕ публикует', () =>
        r.ok && r.value.outcome.startsWith('ПОБЕДА') &&
        loot !== undefined && loot.ore.defId === 'copper_ore' && loot.ore.qty >= 1 && loot.ore.qty <= 2 &&
        r.value.loot !== null && r.value.loot!.ore !== undefined &&
        bossKilled === 0, {
        expected: 'руда copper_ore ×1–2 в раскладе и транзакции; bossKilled 0',
        actual: `ore ${loot?.ore.defId} ×${loot?.ore.qty}; bossKilled ${bossKilled}`,
      }),
    );
    f.dispose();
  }

  // ------------------------------------------------ 29. сверка данных (ContentRegistry)
  {
    const f = await makeSeededMineGame('m122-data');
    const items = f.game.content.get<ItemDef[]>('items') ?? [];
    const itemIds = new Set(items.map((i) => i.id));
    const achievements = f.game.content.get<AchievementDef[]>('quests.achievements') ?? [];
    const missing: string[] = [];
    for (const l of MINE_LAYERS) {
      if (!itemIds.has(l.ore.defId)) missing.push(`слой ${l.layer}: руда ${l.ore.defId}`);
      if (!itemIds.has(l.trophy)) missing.push(`слой ${l.layer}: трофей ${l.trophy}`);
      for (const it of l.items) if (!itemIds.has(it.defId)) missing.push(`слой ${l.layer}: предмет ${it.defId}`);
      if (!MINE_BOSSES.some((b) => b.id === l.bossId)) missing.push(`слой ${l.layer}: босс ${l.bossId}`);
    }
    for (const b of MINE_BOSSES) {
      for (const a of b.aPlus) if (!itemIds.has(a)) missing.push(`босс ${b.id}: A+ предмет ${a}`);
    }
    const achOk = [1, 2, 3, 4, 5, 6, 7, 8, 9].every((n) => {
      const a = achievements.find((x) => x.id === `ach_mine_boss_${n}`);
      return (
        a !== undefined &&
        a.condition.t === 'hasItem' &&
        (a.condition as { defId: string }).defId === MINE_LAYERS[n - 1]!.trophy &&
        (a.unlockFlags ?? []).includes(`ach.mine.boss.${n}`)
      );
    });
    results.push(
      check('сверка данных G5 (Червь-прецедент НЕ сработал — недостающих дефов НЕТ): руда/предметы/трофеи/A+-предметы всех 9 слоёв и 3 боссов существуют в реестре «items» (ContentRegistry — M09-канон); ачивки ach_mine_boss_1..9 поимённо в пуле M15: условие hasItem(трофей слоя) + unlockFlags ach.mine.boss.<n>; трофеи ×9 в каталоге', () =>
        missing.length === 0 && achOk && itemIds.has('trophy_mine_9'), {
        expected: '0 отсутствующих дефов; ачивки ×9 каноничны',
        actual: `отсутствуют: ${missing.length > 0 ? missing.join('; ') : '—'}; ачивки ${achOk ? 'каноничны' : 'РАСХОЖДЕНИЕ'}`,
      }),
    );
    f.dispose();
  }

  // ------------------------------------------------ 30. заточка — живой M10-канал тира кирки
  {
    const f = await makeSeededMineGame('m122-forge');
    const forge = f.game.modules.get('forge')?.api ?? {};
    const craft = f.game.modules.get('craft')?.api ?? {};
    (f.player['player.addXp'] as (n: number, r?: string) => unknown)(5000, 'selfcheck');
    f.game.transaction.transact({ grants: [{ t: 'currency', id: 'gold', qty: 4000 }], eventId: 'selfcheck.forge-setup' });
    (f.inv['inventory.add'] as (d: string, t: string, v: number, q: number, s: string) => R<unknown>)('iron_ingot', 'D', 0, 30, 'selfcheck');
    const buyW = forge['forge.buy']('whetstone') as R<unknown>;
    const buyA = craft['craft.buy']('anvil') as R<unknown>;
    forge['forge.force']('success');
    const iid = equipPickaxe(f, 'D'); // тир 1; точится в рюкзаке (D30)
    (f.inv['inventory.unequip'] as (slot: string) => R<unknown>)('pickaxe');
    let levels = 0;
    for (let i = 0; i < 20; i++) {
      const a = forge['forge.attempt'](iid) as R<{ toLevel: number }>;
      if (a.ok) levels = a.value.toLevel;
    }
    forge['forge.force']('off');
    (f.inv['inventory.equip'] as (iid: string, slot: string) => R<unknown>)(iid, 'pickaxe');
    const enter = f.mine['mine.enter'](1) as R<EnterView>;
    const tierLine = enter.ok ? enter.value.lines.find((l) => l.includes('тир')) ?? '' : '';
    const b3 = f.mine['mine.boss'](3) as R<unknown>;
    results.push(
      check('заточка — живой M10-канал тира (G3: тир кирки = тир качества + floor(заточка/10)): станок+наковальня куплены, 20 успешных заточек D-кирки (форс) → уровень 20 → витрина тир 3 (D 1 + 2) — слой 3 тир-гейт ПРОЙДЕН (отказ только по ачивке слоя 2); формула floor(L/10) — канон M10 §2 через forge.effectiveTier', () =>
        buyW.ok && buyA.ok &&
        levels === 20 &&
        enter.ok && tierLine.includes('тир 3') &&
        !b3.ok && b3.error.includes('ачивка слоя 2') && !b3.error.includes('кирка'), {
        expected: 'уровень 20 → тир 3; слой 3 тир пройден',
        actual: `уровень ${levels}; ${tierLine.trim() || 'витрина недоступна'}; слой 3: ${b3.ok ? 'ok' : b3.error}`,
      }),
    );
    f.dispose();
  }

  return results;
}
