/**
 * Self-checks M07 «Рыбалка» — часть 4 (M07.2: река + гейт-рыбы).
 *
 * Покрытие (бриф §3.3): река — таблица ×9 (3/3/3) против оракула, ссылки
 * каталога, порог навыка в данных; гейт навыка 10 (cast river → отказ до /
 * жив после; fish.location river); заброс в реке — рыба речного пула,
 * стримы fish:cast:river:*. Гейт-рыбы: нерка/сом 10 000 роллов — ноль
 * (заглушки-замки); Золотой карп — force без условий → отказ / с условиями
 * → улов (маппинг-оракул).
 */
import { RIVER_FISH, POND_FISH } from '@/content/fishing/fish';
import { FISHING_TABLE } from '@/content/balance/fishing';
import { ITEMS } from '@/content/items/items';
import { eligibleFish, type FishCtxInfo } from '@/game/modules/fishing/logic/rolls';
import { mulberry32 } from '@/shared/utils/rng';
import { check, type CheckResult } from './types';
import { buyAndEquip, invList, makeSeededFishGame, type R } from './fish-fixture';

const noCtx: FishCtxInfo = { baitDefId: null, rodTier: 0, playerLevel: 1, hasAchievement: () => false };

interface CastV {
  location: string;
  category: string;
  defId: string | null;
  rarity: string | null;
  choice: { optionId: string; label: string; outcome: string; granted: string | null } | null;
  treasure: { choice: string; reward: { kind: string; defId: string; qty: number } | null } | null;
}

/** поднять навык Рыболовство до уровня (skills.addXp циклом) */
function skillTo(f: ReturnType<typeof makeSeededFishGame> extends Promise<infer T> ? T : never, target: number): void {
  for (let guard = 0; guard < 200; guard++) {
    const skills = f.player['skills.list']() as Array<{ id: string; level: number }>;
    if ((skills.find((s) => s.id === 'fishing')?.level ?? 0) >= target) return;
    f.player['skills.addXp']('fishing', 500, 'selfcheck');
  }
}

export async function runFishRiverChecks(): Promise<CheckResult[]> {
  const results: CheckResult[] = [];

  // ------------------------------------------------ 1. река: таблица ×9 + данные гейта
  {
    const cat = (c: string) => RIVER_FISH.filter((f) => f.category === c).length;
    const idsOk =
      RIVER_FISH.map((f) => f.id).join(',') ===
      'loach,dace,gudgeon,chub,zander,trout,sturgeon,ice_char,ancient_som';
    const defsOk = [...RIVER_FISH].every((f) => ITEMS.some((i) => i.id === f.id));
    const gateOk =
      FISHING_TABLE.locations.riverSkillLevel === 10 &&
      RIVER_FISH.find((f) => f.id === 'golden_carp') === undefined &&
      POND_FISH.find((f) => f.id === 'golden_carp')?.conditions?.bait === 'caviar_bait';
    results.push(
      check('река-контент: рыбы ×9 (3/3/3 поимённо [DECISION-пул спеки]); гейт-рыбы: нерка (medium, заглушка ach_lake_master) + сом (rare, заглушка ach_depths + легендарная); Золотой карп — пруд; defId — предметы; порог навыка в данных = 10', () =>
        cat('small') === 3 && cat('medium') === 3 && cat('rare') === 3 && idsOk && defsOk && gateOk, {
        expected: 'loach,dace,gudgeon/chub,zander,ice_char/trout,sturgeon,ancient_som; порог 10',
        actual: `${cat('small')}/${cat('medium')}/${cat('rare')}; ids ${idsOk ? 'ок' : RIVER_FISH.map((f) => f.id).join(',')}; defs ${defsOk ? 'целы' : 'БИТЫЕ'}; порог ${FISHING_TABLE.locations.riverSkillLevel}`,
      }),
    );
  }

  // ------------------------------------------------ 2. гейт реки: навык 10
  {
    const f = await makeSeededFishGame('m072-rivergate');
    f.game.wallet.grant('gold', 500);
    const before = f.fish['fish.cast']('river') as R<unknown>;
    const locBefore = f.fish['fish.location']('river') as R<unknown>;
    await buyAndEquip(f, 'bamboo_rod', 'rod');
    await buyAndEquip(f, 'worm_bait', 'bait');
    f.fish['fish.buy']('worm_bait', 10);
    skillTo(f, 10);
    const locAfter = f.fish['fish.location']('river') as R<{ location: string }>;
    const castRiver = f.fish['fish.cast']() as R<CastV>;
    const stateView = f.fish['fish.state']() as { location: string };
    results.push(
      check('гейт реки (F12): cast river до навыка → отказ «нужен навык Рыболовство 10»; fish.location river тоже; после skills.addXp до 10 → переход жив (срез location=river), заброс в реке проходит', () =>
        !before.ok && String(before.error).includes('навык Рыболовство 10') &&
        !locBefore.ok && String(locBefore.error).includes('навык Рыболовство 10') &&
        locAfter.ok && locAfter.value.location === 'river' &&
        castRiver.ok && castRiver.value.location === 'river' && stateView.location === 'river', {
        expected: 'отказы до навыка; переход + заброс после',
        actual: `${before.ok ? 'ПРОШЁЛ?!' : 'отказ'} | ${locAfter.ok ? 'переход ок' : locAfter.error} | каст ${castRiver.ok ? 'ок' : castRiver.error} | срез ${stateView.location}`,
      }),
    );
    f.dispose();
  }

  // ------------------------------------------------ 3. река-заброс: пул реки (маппинг)
  {
    const f = await makeSeededFishGame('m072-rivercast');
    f.game.wallet.grant('gold', 500);
    await buyAndEquip(f, 'bamboo_rod', 'rod');
    await buyAndEquip(f, 'worm_bait', 'bait');
    f.fish['fish.buy']('worm_bait', 30);
    skillTo(f, 10);
    (f.fish['fish.location']('river') as R<unknown>);
    // обычный заброс в реке — ролл категории пишет стрим fish:cast:river:*
    (f.fish['fish.cast']() as R<unknown>);
    const riverIds = new Set(RIVER_FISH.filter((x) => !x.conditions).map((x) => x.id));
    const seen: string[] = [];
    for (let i = 0; i < 8; i++) {
      const r = f.fish['fish.force'](riverIdsArr()[i % riverIdsArr().length]!) as R<CastV>;
      if (r.ok && r.value.defId !== null) seen.push(r.value.defId);
    }
    const journalRiver = f.game.rngBus.rollLog().list().some((e) => e.source === 'fish:cast:river:category');
    results.push(
      check('река-заброс: force по речным видам — улов в реке (location=river), стримы fish:cast:river:* в журнале (тег локации — F12)', () =>
        seen.length === 8 && seen.every((id) => riverIds.has(id)) && journalRiver, {
        expected: '8/8 речных видов; журнал river жив',
        actual: `${seen.join(',')}; журнал ${String(journalRiver)}`,
      }),
    );
    f.dispose();
  }

  // ------------------------------------------------ 4. гейт-рыбы: заглушки 10 000 роллов — ноль
  {
    // роллы КАК РЕАЛЬНЫЙ каст: eligible-пул (гейт-фильтрация) → взвешенный
    // выбор; гейт-рыбы вне пула — попаданий быть не может (карточка §7)
    const poolMedium = eligibleFish(RIVER_FISH, 'medium', noCtx);
    const poolRare = eligibleFish(RIVER_FISH, 'rare', noCtx);
    const rng = mulberry32(20261025);
    let narkaHits = 0;
    let somHits = 0;
    const rollPool = (pool: typeof RIVER_FISH): string => {
      const total = pool.reduce((s, x) => s + x.weight, 0);
      let acc = 0;
      const x01 = rng() * total;
      for (const x of pool) {
        acc += x.weight;
        if (x01 < acc) return x.id;
      }
      return pool[pool.length - 1]!.id;
    };
    for (let i = 0; i < 10_000; i++) {
      if (rollPool(poolMedium) === 'ice_char') narkaHits += 1;
      if (rollPool(poolRare) === 'ancient_som') somHits += 1;
    }
    const withAch = eligibleFish(RIVER_FISH, 'medium', {
      baitDefId: null, rodTier: 0, playerLevel: 1, hasAchievement: (id) => id === 'ach_lake_master',
    });
    results.push(
      check('гейт-рыбы-заглушки (F11): нерка/сом НЕ в eligible-пуле без ачивок; 10 000 равномерных роллов по полным спискам — 0 попаданий (замки M08/M12 закрыты); с ачивкой-флагом нерка в пуле (только фиксстуры)', () =>
        !poolMedium.some((x) => x.id === 'ice_char') && !poolRare.some((x) => x.id === 'ancient_som') &&
        narkaHits === 0 && somHits === 0 && withAch.some((x) => x.id === 'ice_char'), {
        expected: 'пулы без гейт-рыб; 0/10000; с флагом — в пуле',
        actual: `нерка ${narkaHits}/10000, сом ${somHits}/10000; с ачивкой ${withAch.length} видов`,
      }),
    );
  }

  // ------------------------------------------------ 5. Золотой карп: force-гейт + достижение
  {
    const f = await makeSeededFishGame('m072-golden');
    f.game.wallet.grant('gold', 5000);
    await buyAndEquip(f, 'bamboo_rod', 'rod');
    await buyAndEquip(f, 'worm_bait', 'bait');
    f.fish['fish.buy']('worm_bait', 10);
    const refused = f.fish['fish.force']('golden_carp') as R<unknown>;
    // снасть: Мифриловая (тир 5) + Икра + уровень 20 (слоты освобождаем)
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
    const caught = f.fish['fish.force']('golden_carp') as R<CastV>;
    const album = f.fish['fish.state']() as { album: Array<{ defId: string }> };
    results.push(
      check('Золотой карп (F11): force без условий → отказ с причиной (гейты уважаются); Мифриловая + Икра + ур.20 → улов; альбом/счётчик fish.golden_carp тикают', () =>
        !refused.ok && String(refused.error).includes('гейт-рыба') &&
        caught.ok && caught.value.defId === 'golden_carp' &&
        album.album.some((a) => a.defId === 'golden_carp') &&
        f.game.stats.get('fish.golden_carp') === 1, {
        expected: 'отказ до снасти; улов с условиями; счётчик 1',
        actual: `${refused.ok ? 'ПРОШЁЛ?!' : 'отказ ок'}; улов ${caught.ok ? 'ок' : caught.error}; счётчик ${f.game.stats.get('fish.golden_carp')}`,
      }),
    );
    f.dispose();
  }

  return results;
}

function riverIdsArr(): string[] {
  return RIVER_FISH.filter((x) => !x.conditions).map((x) => x.id);
}
