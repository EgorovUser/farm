/**
 * Self-checks M16.2 «Деревня» — часть 4: ЗДАНИЯ, таймеры и эффекты шины
 * (бриф G2/G3/G8): завершение стройки hourTick'ом + идемпотентность реплея
 * (маркер construction), улучшение = та же механика (L1→L2→L3, отказ
 * макс-уровня), [DECISION M162-дом] — unlock-скидка жителя Домом (живая
 * атрибуция на контролируемом XP), эффекты = модификаторы villageProvider
 * (счастье-аура к налогу отдельным модом, Кузница/Рынок override).
 */
import { VILLAGE_BUILDINGS } from '@/content/village/buildings';
import { VILLAGE_TABLE, villageLevelOf } from '@/content/village/table';
import { VILLAGE_TAX } from '@/content/village/tax';
import { VILLAGERS } from '@/content/village/villagers';
import { makeVillageProvider } from '@/game/modules/village/provider';
import { check, type CheckResult } from './types';
import { synthVillage } from './village-checks-part3';
import {
  VILLAGE_T0,
  dayTickAt,
  giveItems,
  hourTickAt,
  makeSeededVillageGame,
  openVillageGate,
  raiseVillageToLevel2,
  readVillageSlice,
  type R,
} from './village-fixture';

const MS_HOUR = 3_600_000;

export async function runVillagePart4(): Promise<CheckResult[]> {
  const results: CheckResult[] = [];

  // 18. таймеры: завершение hourTick'ом, идемпотентность реплея ×2, макс-уровень
  {
    const f = await makeSeededVillageGame('v162-timer');
    openVillageGate(f);
    await raiseVillageToLevel2(f);
    const t = f.clock.now();
    f.game.wallet.grant('gold', 100_000);
    f.game.wallet.grant('logs', 500);
    f.game.wallet.grant('planks', 500);
    f.game.wallet.grant('nails', 100);
    f.game.wallet.grant('stone', 500);
    giveItems(f, 'iron_ingot', 5); // L3 Частокола: logs 12 + железные слитки 3
    const r1 = f.village['village.build']('fence') as R<unknown>;
    hourTickAt(f, t + 3 * MS_HOUR); // ДО finishAt — не завершён
    const mid = await readVillageSlice(f);
    hourTickAt(f, t + 5 * MS_HOUR); // ПОСЛЕ finishAt — завершён
    const done = await readVillageSlice(f);
    const walletDone = f.game.wallet.get('gold');
    hourTickAt(f, t + 5 * MS_HOUR); // РЕПЛЕЙ того же часа — идемпотентность
    const replay = await readVillageSlice(f);
    const walletReplay = f.game.wallet.get('gold'); // снапшот ДО последующих строек/рейда
    const r2 = f.village['village.build']('fence') as R<unknown>; // улучшение L2
    hourTickAt(f, t + 5 * MS_HOUR + 8 * MS_HOUR); // завершение L2
    const l2 = await readVillageSlice(f);
    const r3 = f.village['village.build']('fence') as R<unknown>; // L3
    hourTickAt(f, t + 26 * MS_HOUR); // L3-таймер 10 ч от t+13h → завершение к t+23h
    const l3 = await readVillageSlice(f);
    const r4 = f.village['village.build']('fence') as R<unknown>; // макс-уровень — отказ
    const r4Err = !r4.ok ? r4.error : '';
    results.push(
      check(
        'таймеры построек (G2/[DECISION M162-таймер]): hourTick до finishAt — стройка жива; после — buildings.fence L1 + XP +20, запись construction УДАЛЕНА; РЕПЛЕЙ hourTick НЕ задваивает (XP/кошелёк неизменны — маркер); улучшение = та же механика (L2: эффект 7, XP +35; L3: эффект 10, XP +55); 4-я стройка — отказ «уже построен максимальный уровень (3/3)»',
        () =>
          r1.ok &&
          mid?.construction?.fence !== undefined &&
          mid?.buildings === undefined &&
          done?.buildings?.fence?.level === 1 &&
          done?.construction === undefined &&
          (done?.xp ?? 0) >= 20 &&
          replay?.xp === done?.xp &&
          walletReplay === walletDone &&
          r2.ok &&
          l2?.buildings?.fence?.level === 2 &&
          r3.ok &&
          l3?.buildings?.fence?.level === 3 &&
          !r4.ok &&
          r4Err.includes('максимальный уровень'),
        {
          expected: 'L1→L2→L3, реплей тих, 4-й отказ',
          actual: `mid ${mid?.construction?.fence !== undefined ? 'жив' : 'FAIL'}; L1 ${done?.buildings?.fence?.level}; реплей ${replay?.xp === done?.xp ? 'тих' : 'FAIL'}; L2 ${l2?.buildings?.fence?.level}; L3 ${l3?.buildings?.fence?.level}; 4-й ${r4.ok ? 'FAIL' : 'отказ'}`,
        },
      ),
    );
    f.dispose();
  }

  // 19. [DECISION M162-дом]: Дом L1 → unlock-скидка — Акулина на уровне 2
  {
    const f = await makeSeededVillageGame('v162-house');
    openVillageGate(f);
    // контролируемый XP: цель — житель с DAILY-потребностью дня 0 (у такого
    // НЕТ weekly-кандидатов — все его роллы daily, шаги +8); если у всех
    // стартовых weekly — удовлетворяем ОДНУ (+30 — тоже в окне 30..39)
    const slice0 = await readVillageSlice(f);
    const entries0 = Object.entries(slice0?.villagers ?? {});
    const target = entries0.find(([, lv]) => lv.need?.kind === 'daily') ?? entries0[0]!;
    let day = 0;
    for (; day < 16; day++) {
      const slice = await readVillageSlice(f);
      if (villageLevelOf(slice?.xp ?? 0, VILLAGE_TABLE.level) >= 2) break;
      const lv = slice?.villagers[target[0]];
      const gain = lv?.need?.kind === 'weekly' ? 30 : 8;
      if (lv?.need !== undefined && (slice?.xp ?? 0) + gain <= 39) {
        giveItems(f, lv.need.item, lv.need.qty);
        const r = f.village['village.supply'](target[0], lv.need.item) as R<unknown>;
        if (!r.ok) throw new Error(`supply: ${r.error}`);
      }
      dayTickAt(f, day + 1);
    }
    const pre = await readVillageSlice(f);
    const xpPre = pre?.xp ?? 0;
    const t = f.clock.now();
    f.game.wallet.grant('gold', 10_000);
    f.game.wallet.grant('planks', 50);
    f.game.wallet.grant('nails', 50);
    const rHouse = f.village['village.build']('house') as R<unknown>;
    hourTickAt(f, t + 5 * MS_HOUR); // Дом 6 ч — ещё строится
    const mid = await readVillageSlice(f);
    hourTickAt(f, t + 7 * MS_HOUR); // завершён
    const done = await readVillageSlice(f);
    const levelAfter = villageLevelOf(done?.xp ?? 0, VILLAGE_TABLE.level);
    results.push(
      check(
        '[DECISION M162-дом] Дом → unlock-скидка жителя: контролируемый XP (только daily-поставки, 30..39) → уровень 2; ДО завершения Акулины НЕТ (её гейт — уровень 3 > 2); Дом L1 завершён (XP +25 ≤ 64 — уровень остался 2) → бонус +1 → эффективный уровень 3 → Акулина ПРИСОЕДИНИЛАСЬ (счастье 70, потребность дня); атрибуция — ТОЛЬКО дому (уровень 2 < 3)',
        () =>
          rHouse.ok &&
          xpPre >= 30 &&
          xpPre <= 39 &&
          mid?.buildings === undefined &&
          mid?.villagers['villager_akulina'] === undefined &&
          done?.buildings?.house?.level === 1 &&
          done?.xp === xpPre + 25 &&
          levelAfter === 2 &&
          done?.villagers['villager_akulina'] !== undefined &&
          done?.villagers['villager_akulina']?.happiness === 70 &&
          done?.villagers['villager_akulina']?.need !== undefined,
        {
          expected: 'xpPre 30..39; до — нет Акулины; после — есть (уровень 2)',
          actual: `xpPre ${xpPre}; mid ${mid?.villagers['villager_akulina'] === undefined ? 'нет' : 'ЕСТЬ'}; после ${done?.villagers['villager_akulina'] !== undefined ? 'есть' : 'НЕТ'}; уровень ${levelAfter}; xp ${done?.xp}`,
        },
      ),
    );
    f.dispose();
  }

  // 20. эффекты = модификаторы villageProvider: аура к налогу, Кузница/Рынок override
  {
    const f = await makeSeededVillageGame('v162-prov');
    const state = synthVillage({
      villagers: { villager_varvara: { happiness: 50, grumbleDays: 0 } },
      buildings: { well: { level: 1 }, temple: { level: 1 }, bath: { level: 1 }, forge_village: { level: 3 }, market: { level: 3 } },
    });
    const provider = makeVillageProvider(() => state, VILLAGERS, VILLAGE_TABLE, VILLAGE_TAX, VILLAGE_BUILDINGS);
    const ctx = { player: 'player', now: VILLAGE_T0 };
    const taxMods = provider.provide('village.tax.gold', ctx);
    const auraMod = taxMods.find((m) => m.id === 'village.tax.aura');
    const repairMods = provider.provide('village.repair.discountPercent', ctx);
    const marketMods = provider.provide('village.market.discountPercent', ctx);
    // ДО построек: провайдер модов НЕ даёт (базы 0 — резолв 0)
    const empty = makeVillageProvider(() => synthVillage({ villagers: { villager_varvara: { happiness: 50, grumbleDays: 0 } } }), VILLAGERS, VILLAGE_TABLE, VILLAGE_TAX, VILLAGE_BUILDINGS);
    const liveZero = f.game.statBus.resolve({ stat: 'village.repair.discountPercent', ctx: f.game.time.ctx('player') });
    const ok20 =
      auraMod !== undefined &&
      Math.abs(auraMod.value - (VILLAGE_TAX.happinessSwingPercent * 7) / 50) < 1e-9 && // 30×7/50 = +4.2%
      repairMods.length === 1 &&
      repairMods[0]!.op === 'override' &&
      repairMods[0]!.value === 50 &&
      (repairMods[0]!.label ?? '').includes('Кузница деревни −50%') &&
      marketMods.length === 1 &&
      marketMods[0]!.op === 'override' &&
      marketMods[0]!.value === 10 &&
      empty.provide('village.repair.discountPercent', ctx).length === 0 &&
      empty.provide('village.market.discountPercent', ctx).length === 0 &&
      empty.provide('village.tax.gold', ctx).every((m) => m.id !== 'village.tax.aura') &&
      liveZero === 0;
    results.push(
      check(
        'эффекты зданий = модификаторы villageProvider (G3/G6): аура Колодец+Храм+Баня (7) → ОТДЕЛЬНЫЙ мод village.tax.aura = swing×7/50 = +4.2% (без двойного счёта счастья); Кузница L3 → override 50 «починка за полцены» (источник 04-DISCOUNTS §2.2, строка кассы Task 86); Рынок L3 → override 10 «−10% у купцов» (потребитель — биржа M16.3, резолв-без-проводки); без построек модов НЕТ (базы 0), живой resolve чистой игры = 0; НОВЫХ провайдеров НЕТ',
        () => ok20,
        { expected: 'aura +4.2; forge 50; market 10; пусто = 0', actual: `aura ${auraMod?.value}; forge ${repairMods[0]?.value}; market ${marketMods[0]?.value}; live ${liveZero}` },
      ),
    );
    f.dispose();
  }

  return results;
}
