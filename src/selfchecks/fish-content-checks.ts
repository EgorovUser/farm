/**
 * Self-checks M07 «Рыбалка» — контент-часть: каталоги данных против карточки
 * M07 §2–§5 и брифа F3–F5 (категории/рыбы/мусор/сундук/события; удочки ×6
 * с ценами-редкостями-прочностью и C3-инвариантом rod-скоупа; наживки ×5 со
 * сверкой Червя по реестру) + манифест 1.0.0 = факту.
 */
import { DROP_CATEGORIES, POND_FISH, TRASH_ITEMS, CHEST_TABLE, FISHING_EVENTS } from '@/content/fishing/fish';
import { RODS } from '@/content/fishing/rods';
import { BAITS } from '@/content/fishing/baits';
import { ITEMS } from '@/content/items/items';
import { MOD_TYPES } from '@/content/mods/registry';
import { createFishingManifest } from '@/game/modules/fishing/manifest';
import { check, type CheckResult } from './types';

export async function runFishContentChecks(): Promise<CheckResult[]> {
  const results: CheckResult[] = [];

  // ------------------------------------------------ 1. контент: категории/рыбы/мусор/сундук/события
  {
    const catOk =
      DROP_CATEGORIES.map((c) => `${c.id}:${c.weight}${c.lucky ? '*' : ''}`).join(' ') ===
      'trash:25 small:40 medium:20 rare:8* treasure:4* event:3*';
    // [M07.2 · F11] + Золотой карп (гейт-рыба пруда): 3/2/2, ×7 поимённо
    const fishOk =
      POND_FISH.filter((f) => f.category === 'small').length === 3 &&
      POND_FISH.filter((f) => f.category === 'medium').length === 2 &&
      POND_FISH.filter((f) => f.category === 'rare').length === 2 &&
      POND_FISH.map((f) => f.id).join(',') === 'crucian,rotan,perch,tench,pike,mirror_carp,golden_carp';
    const idsOk =
      [...POND_FISH.map((f) => f.id), ...TRASH_ITEMS.map((t) => t.id)].every((id) =>
        ITEMS.some((i) => i.id === id),
      ) &&
      CHEST_TABLE.filter((c) => c.kind === 'item').every((c) => ITEMS.some((i) => i.id === c.defId));
    results.push(
      check('контент: категории ×6 = карточке §3 (25/40/20/8*/4*/3* lucky); рыбы пруда ×7 [M07.2: +Золотой карп] (3/2/2 поимённо); мусор ×3; сундук ×9 [M07.2: +золото-пакеты ×3 + карта]; события ×2 с опциями; defId — предметы каталога', () =>
        catOk && fishOk && idsOk && TRASH_ITEMS.length === 3 && CHEST_TABLE.length === 9 && FISHING_EVENTS.length === 2, {
        expected: 'trash:25 small:40 medium:20 rare:8* treasure:4* event:3*; 3/2/2; сундук 9; ссылки целы',
        actual: `${catOk ? 'категории ок' : 'категории НЕ совпали'}; рыбы ${fishOk ? 'ок' : POND_FISH.map((f) => f.id).join(',')}; ссылки ${idsOk ? 'целы' : 'БИТЫЕ'}`,
      }),
    );
  }

  // ------------------------------------------------ 2. контент: удочки ×6 + C3 + наживки ×5 (сверка Червя)
  {
    const prices = RODS.map((r) => r.price).join(',');
    const rodDefs = RODS.map((r) => ITEMS.find((i) => i.id === r.defId));
    const rodsOk =
      prices === '50,150,400,900,2000,5000' &&
      rodDefs.every((d, i) => d !== undefined && d.basePrice === RODS[i]!.price && d.modSlots?.tags.join('+') === 'rod');
    const durs = rodDefs.map((d) => d?.durabilityMax ?? 0).join(',');
    const rarities = rodDefs.map((d) => d?.rarity).join(',');
    const rodCandidates = MOD_TYPES.filter((m) => m.scopeTags.includes('rod')).length;
    const wormOk = ITEMS.some((i) => i.id === 'worm_bait'); // сверка F5 по реестру
    const baitPrices = BAITS.map((b) => b.price).join(',');
    const legendary = BAITS.find((b) => b.defId === 'legendary_bait')!;
    results.push(
      check('контент: удочки ×6 (цены 50/150/400/900/2000/5000 = basePrice; прочность 30/40/60/80/120/200; редкости common/uncommon/rare/epic/epic/legendary; C3 rod-кандидаты ≥3); наживки ×5 (2/5/25/40/150; Червь = worm_bait жив в каталоге — сверка F5; легендарная: −60/−25)', () =>
        rodsOk && durs === '30,40,60,80,120,200' && rarities === 'common,uncommon,rare,epic,epic,legendary' &&
        rodCandidates >= 3 && wormOk && baitPrices === '2,5,25,40,150' &&
        legendary.mods.length === 2 && legendary.mods[0]!.value === -60 && legendary.mods[1]!.value === -25, {
        expected: 'лестница/цены/C3 ≥3/наживки ок',
        actual: `удочки ${rodsOk ? 'ок' : 'РАСХОЖДЕНИЕ'}; прочность ${durs}; редкости ${rarities}; rod-кандидаты ${rodCandidates}; червь ${wormOk ? 'жив' : 'НЕТ'}; цены наживок ${baitPrices}`,
      }),
    );
  }

  // ------------------------------------------------ 9. манифест = факту
  // [M07.2] один bump 1.0.0 → 1.1.0: publicApi ×8 (+= album/location + dev
  // choice), taskExecutors ['fishing.cast'] (F16)
  {
    const m = createFishingManifest();
    results.push(
      check('манифест 1.1.0 = факту [M07.2]: publicApi ×8 (+= fish.album/fish.location + dev fish.choice); eventsPublished ровно [cast.completed, fish.caught] (= каталогу 02 §4); subscribed [] (таймеров нет); providers [fishing.bait]; executors [fishing.cast] (F16); counters []', () =>
        m.version === '1.1.0' && m.id === 'fishing' && m.stateKey === 'fishing' &&
        m.publicApi?.length === 8 &&
        JSON.stringify(m.eventsPublished) === JSON.stringify(['cast.completed', 'fish.caught']) &&
        m.eventsSubscribed?.length === 0 &&
        JSON.stringify(m.modifierProviders) === JSON.stringify(['fishing.bait']) &&
        JSON.stringify(m.taskExecutors) === JSON.stringify(['fishing.cast']) && m.statsCounters?.length === 0),
    );
  }

  return results;
}
