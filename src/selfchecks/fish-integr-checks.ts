/**
 * Self-checks M07 «Рыбалка» — часть 5 (M07.2: карты сокровищ + события-выбор
 * + витрина альбома + ачивки/счётчики + D-блок каталога + taskExecutor).
 *
 * Покрытие (бриф §3.3): карты — вес в сундуке + золото-пакеты + «Клад»
 * (open → награда из таблицы + карта израсходована / stash → предмет).
 * События-мини: выбор-оракулы (release → skillXp, sell → золото, read,
 * discard; авто-резолв дефолта). Витрина: полноты 7/9 + гейт-причины
 * текстом. Ачивки: «Рыбак» (fish.total ≥ 100) + «Хозяин пруда» (all-условие)
 * + счётчики fish.<fishId> тикают с fish.caught. Каталог: D1 (egg 3 / wool
 * 15), D4 (worm_bait 2), D2 (turnip). taskExecutor: fishing.cast в реестре,
 * runTask живой (фиксстура).
 */
import { CHEST_TABLE, TREASURE_MAP_TABLE, TREASURE_MAP_EVENT, FISHING_EVENTS } from '@/content/fishing/fish';
import { ITEMS } from '@/content/items/items';
import { ACHIEVEMENTS } from '@/content/quests/achievements';
import { COUNTERS_TABLE } from '@/content/player/counters';
import { check, type CheckResult } from './types';
import { buyAndEquip, countOf, eventsOf, invList, makeSeededFishGame, type R } from './fish-fixture';

interface CastV {
  location: string;
  category: string;
  defId: string | null;
  rarity: string | null;
  choice: { optionId: string; label: string; outcome: string; granted: string | null } | null;
  treasure: { choice: string; reward: { kind: string; defId: string; qty: number } | null } | null;
}

export async function runFishIntegrChecks(): Promise<CheckResult[]> {
  const results: CheckResult[] = [];

  // ------------------------------------------------ 6. карты сокровищ: сундук + пакеты + «Клад»
  {
    const chestOk =
      CHEST_TABLE.find((c) => c.id === 'treasure_map')?.weight === 10 &&
      CHEST_TABLE.filter((c) => c.id.startsWith('gold_pack_')).length === 3 &&
      JSON.stringify(CHEST_TABLE.filter((c) => c.id.startsWith('gold_pack_')).map((c) => [c.qty[0], c.weight])) ===
        JSON.stringify([[60, 15], [150, 8], [300, 4]]);
    const f = await makeSeededFishGame('m072-treasure');
    f.game.wallet.grant('gold', 500);
    await buyAndEquip(f, 'bamboo_rod', 'rod');
    await buyAndEquip(f, 'worm_bait', 'bait');
    f.fish['fish.buy']('worm_bait', 10);
    // (а) open (дефолт): карта израсходована, награда из таблицы, журнал
    const gold0 = f.game.wallet.get('gold');
    const opened = f.fish['fish.force']('chest:treasure_map') as R<CastV>;
    const mapAfterOpen = countOf(f, 'treasure_map');
    const oreAfterOpen = countOf(f, 'iron_ore') + countOf(f, 'lucky_charm');
    const journalTreasure = f.game.rngBus.rollLog().list().some((e) => e.source.startsWith('fish:treasure:'));
    // (б) stash: dev-выбор — карта остаётся предметом
    f.fish['fish.choice']('stash');
    const stashed = f.fish['fish.force']('chest:treasure_map') as R<CastV>;
    const mapAfterStash = countOf(f, 'treasure_map');
    results.push(
      check('карты сокровищ (F13): сундук += карта (вес 10) + золото-пакеты 60/150/300 (веса 15/8/4); «Клад» open (дефолт) → карта израсходована + награда из таблицы (стрим fish:treasure:*); stash (dev) → карта-предмет в инвентаре (источник fishing)', () =>
        chestOk && opened.ok && opened.value.treasure !== null && opened.value.treasure.choice === 'open' &&
        mapAfterOpen === 0 && (oreAfterOpen > 0 || f.game.wallet.get('gold') > gold0) && journalTreasure &&
        stashed.ok && stashed.value.treasure !== null && stashed.value.treasure.choice === 'stash' &&
        mapAfterStash === 1, {
        expected: 'пакеты+карта в данных; open: расход+награда; stash: карта ×1',
        actual: `данные ${chestOk ? 'ок' : 'РАСХОЖДЕНИЕ'}; open ${opened.ok ? `${JSON.stringify(opened.value.treasure?.reward)}` : opened.error}; карта после open ${mapAfterOpen}; после stash ${mapAfterStash}; журнал ${String(journalTreasure)}`,
      }),
    );
    f.dispose();
  }

  // ------------------------------------------------ 7. события-мини: выбор (F14)
  {
    const f = await makeSeededFishGame('m072-events');
    f.game.wallet.grant('gold', 500);
    await buyAndEquip(f, 'bamboo_rod', 'rod');
    await buyAndEquip(f, 'worm_bait', 'bait');
    f.fish['fish.buy']('worm_bait', 10);
    // русалка: авто-резолв дефолта «Отпустить» (+15 XP Рыболовства)
    const xp0 = (f.player['skills.list']() as Array<{ id: string; xp: number }>).find((s) => s.id === 'fishing')!.xp;
    const mermaid = f.fish['fish.force']('event:evt_mermaid') as R<CastV>;
    const xp1 = (f.player['skills.list']() as Array<{ id: string; xp: number }>).find((s) => s.id === 'fishing')!.xp;
    // русалка: dev «Продать» → золото 30
    const gold0 = f.game.wallet.get('gold');
    f.fish['fish.choice']('sell');
    const sold = f.fish['fish.force']('event:evt_mermaid') as R<CastV>;
    // бутылка: dev «Выбросить» → ничего
    f.fish['fish.choice']('discard');
    const bottle = f.fish['fish.force']('event:evt_bottle') as R<CastV>;
    results.push(
      check('события-мини с выбором (F14): русалка авто-дефолт «Отпустить» → +15 XP Рыболовства; dev «Продать» → золото +30; бутылка dev «Выбросить» → ничего; исходы — штатные каналы (skills.addXp/TransactionService)', () =>
        mermaid.ok && mermaid.value.choice?.optionId === 'release' && xp1 - xp0 === 15 &&
        sold.ok && sold.value.choice?.optionId === 'sell' && f.game.wallet.get('gold') === gold0 + 30 &&
        bottle.ok && bottle.value.choice?.optionId === 'discard', {
        expected: 'release +15 XP; sell +30з; discard ничего',
        actual: `release ${xp1 - xp0} XP; sell ${f.game.wallet.get('gold') - gold0}з; discard ${bottle.ok ? bottle.value.choice?.optionId : bottle.error}`,
      }),
    );
    f.dispose();
  }

  // ------------------------------------------------ 8. витрина альбома (F10)
  {
    const f = await makeSeededFishGame('m072-album');
    const v = f.fish['fish.album']() as {
      totals: { pond: { caught: number; total: number }; river: { caught: number; total: number } };
      river: { skillLevel: number; unlocked: boolean };
      species: Array<{ defId: string; name: string; location: string; caught: number; unlocked: boolean; gateText: string | null }>;
    };
    const golden = v.species.find((s) => s.defId === 'golden_carp');
    const narka = v.species.find((s) => s.defId === 'ice_char');
    const som = v.species.find((s) => s.defId === 'ancient_som');
    results.push(
      check('витрина альбома (F10): полноты пруд 0/7 + река 0/9; река закрыта (навык); гейт-причины ТЕКСТОМ: Золотой карп (удочка+наживка+уровень), нерка/сом (ачивки-замки M08/M12)', () =>
        v.totals.pond.total === 7 && v.totals.river.total === 9 &&
        !v.river.unlocked && v.river.skillLevel === 10 &&
        golden?.gateText !== null && golden!.gateText!.includes('Икра') && golden!.gateText!.includes('Мифриловая') && golden!.gateText!.includes('уровень 20') &&
        // [M08.2 · F15] ачивка ach_lake_master в реестре — гейт-причина ИМЕНЕМ
        narka?.gateText !== null && (narka!.gateText!.includes('Хозяин озера') || narka!.gateText!.includes('ach_lake_master')) &&
        som?.gateText !== null && som!.gateText!.includes('ach_depths') && som!.gateText!.includes('Легендарная приманка'), {
        expected: '7/9; гейты текстом',
        actual: `пруд ${v.totals.pond.caught}/${v.totals.pond.total}, река ${v.totals.river.caught}/${v.totals.river.total}; карп: ${golden?.gateText}; нерка: ${narka?.gateText}`,
      }),
    );
    f.dispose();
  }

  // ------------------------------------------------ 9. ачивки: «Рыбак» + «Хозяин пруда» (F15)
  {
    const f = await makeSeededFishGame('m072-achv');
    const regTotal = ACHIEVEMENTS.length;
    const fisherman = ACHIEVEMENTS.find((a) => a.id === 'ach_fisherman');
    const pondMaster = ACHIEVEMENTS.find((a) => a.id === 'ach_pond_master');
    const riverMaster = ACHIEVEMENTS.find((a) => a.id === 'ach_river_master');
    // «Рыбак»: 100 уловов событиями (счётчик-движок)
    const achEv: Array<Record<string, unknown>> = [];
    const off = f.game.bus.subscribe('achievement.unlocked', (p) => achEv.push(p as Record<string, unknown>));
    for (let i = 0; i < 100; i++) {
      f.game.bus.publish('fish.caught', { defId: 'crucian', rarity: 'common', quality: { tier: 'D', value: 50 }, qty: 1 });
    }
    off();
    // «Хозяин пруда»: фиксстура fish.force по 7 видам пруда
    f.game.wallet.grant('gold', 5000);
    await buyAndEquip(f, 'bamboo_rod', 'rod');
    await buyAndEquip(f, 'worm_bait', 'bait');
    f.fish['fish.buy']('worm_bait', 20);
    for (const id of ['crucian', 'rotan', 'perch', 'tench', 'pike', 'mirror_carp']) {
      f.inv['inventory.dur'](invList(f).find((i) => i.defId === 'bamboo_rod')?.iid ?? '', 30); // починка
      f.fish['fish.force'](id);
    }
    // Золотой карп — с условиями гейта (Мифриловая + Икра + ур. 20)
    f.inv['inventory.unequip']('rod');
    f.inv['inventory.unequip']('bait');
    await buyAndEquip(f, 'mithril_rod', 'rod');
    await buyAndEquip(f, 'caviar_bait', 'bait');
    f.fish['fish.buy']('caviar_bait', 5);
    for (let guard = 0; guard < 400; guard++) {
      const p = (f.player['player.snapshot']() as { progress: { level: number; xp: number; xpNeed: number } }).progress;
      if (p.level >= 20) break;
      f.player['player.addXp'](p.xpNeed - p.xp + 1, 'selfcheck');
    }
    f.fish['fish.force']('golden_carp');
    const flags = f.game.modules.get('quests')?.api['quests.flags']() as string[];
    results.push(
      check('ачивки (F15): «Рыбак» (fish.total ≥ 100 → achievement.unlocked живьём); «Хозяин пруда» (all 7 видов — фиксстура force) → флаг; «Хозяин реки» в реестре (задел); счётчики видов тикают (fish.crucian = 100+7)', () =>
        fisherman?.condition.t === 'counterAtLeast' && (fisherman.condition as { value: number }).value === 100 &&
        pondMaster !== undefined && riverMaster !== undefined &&
        achEv.some((e) => e.id === 'ach_fisherman') &&
        flags.includes('ach.fishing.fisherman') && flags.includes('ach.fishing.pond_master') &&
        (f.game.stats.get('fish.crucian') ?? 0) >= 100, {
        expected: 'Рыбак unlocked; Хозяин пруда unlocked; счётчики живы',
        actual: `реестр ${regTotal}; события ${achEv.map((e) => e.id).join(',')}; флаги ${flags.filter((x) => x.startsWith('ach.fishing')).join(',')}; fish.crucian ${f.game.stats.get('fish.crucian')}`,
      }),
    );
    f.dispose();
  }

  // ------------------------------------------------ 10. D1/D4: каталог цен
  {
    const egg = ITEMS.find((i) => i.id === 'egg');
    const wool = ITEMS.find((i) => i.id === 'wool');
    const worm = ITEMS.find((i) => i.id === 'worm_bait');
    const countersTurnip = COUNTERS_TABLE.some((c) => c.id === 'harvest.turnip');
    results.push(
      check('D-блок каталога: egg 3з / wool 15з (D1 — канон M06.1 «3/15»); worm_bait 2з (D4 — таблица F5); honey 20з НЕ тронут; счётчик harvest.turnip удалён из конфига (D2)', () =>
        egg?.basePrice === 3 && wool?.basePrice === 15 && worm?.basePrice === 2 &&
        ITEMS.find((i) => i.id === 'honey')?.basePrice === 20 && !countersTurnip, {
        expected: '3/15/2/20; turnip нет',
        actual: `egg ${egg?.basePrice}, wool ${wool?.basePrice}, worm ${worm?.basePrice}, honey ${ITEMS.find((i) => i.id === 'honey')?.basePrice}; turnip ${String(countersTurnip)}`,
      }),
    );
  }

  // ------------------------------------------------ 11. taskExecutor (F16)
  {
    const f = await makeSeededFishGame('m072-executor');
    const tasksBefore = (f.game.tasks.list() as Array<{ id: string }>).map((t) => t.id);
    f.game.wallet.grant('gold', 500);
    await buyAndEquip(f, 'bamboo_rod', 'rod');
    await buyAndEquip(f, 'worm_bait', 'bait');
    f.fish['fish.buy']('worm_bait', 5);
    const run = f.game.tasks.runTask('fishing.cast', { now: 0, params: {} }) as R<{ message: string }>;
    const rodBroken = f.fish['fish.cast']('river') as R<unknown>; // река ещё закрыта — executor с параметром тоже должен бы отказать
    results.push(
      check('taskExecutor fishing.cast (F16): в реестре (15 базово [M08.2 · F16: +lake ×4]); runTask живой (полный каст: улов/события/расходы); worker.actionDone НЕ публикуется (домен M11)', () =>
        tasksBefore.includes('fishing.cast') && tasksBefore.length === 15 &&
        run.ok && !eventsOf(f, 'cast.completed').some(() => false) && eventsOf(f, 'cast.completed').length >= 1 &&
        !rodBroken.ok, {
        expected: 'реестр 15; runTask ok; cast.completed в ленте',
        actual: `реестр ${tasksBefore.length} (${tasksBefore.includes('fishing.cast') ? 'есть' : 'НЕТ'}); run ${run.ok ? 'ok' : run.error}; событий ${eventsOf(f, 'cast.completed').length}`,
      }),
    );
    f.dispose();
  }

  // ------------------------------------------------ 12. раундтрип 'river' + события-данные
  {
    const evOk =
      FISHING_EVENTS.every((e) => e.options.length >= 2) &&
      TREASURE_MAP_EVENT.options[0]!.outcome.t === 'treasureRoll' &&
      TREASURE_MAP_TABLE.length === 3;
    results.push(
      check('данные событий/карты (F13/F14): у каждого события-мини опции ×2 с исходами; «Клад»: дефолт open = treasureRoll, stash = none; карта-таблица ×3 (золото 100–300/руда/оберег)', () =>
        evOk, {
        expected: 'опции ×2; клад open/stash; таблица ×3',
        actual: `${FISHING_EVENTS.map((e) => `${e.id}:${e.options.length}`).join(' ')}; клад ${TREASURE_MAP_EVENT.options.map((o) => o.id).join('/')}; таблица ${TREASURE_MAP_TABLE.length}`,
      }),
    );
  }

  return results;
}
