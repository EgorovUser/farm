/**
 * Self-checks M16.2 «Деревня» — часть 3: ЗДАНИЯ, данные и старт стройки
 * (бриф G2/G8): данные карточки §3 сеткой (9 × уровни 1–3, цены/часы/
 * эффекты, все id живы), чистые функции эффектов (ленивые ключи), постройка
 * живьём (TransactionService village.build + ЧАСЫ реального времени,
 * finishAt-таймер) и честные отказы ×4 (уровень/таймер/неизвестное/
 * не хватает ресурсов). Части 4 — таймеры/Дом/провайдер, 5 — экип, 6 — рейды.
 */
import { VILLAGE_BUILDINGS, buildingEffectOf } from '@/content/village/buildings';
import { CURRENCY_INFO } from '@/content/player/currencies';
import {
  buildingDefenseOf,
  happinessAuraOf,
  houseBonusOf,
  marketDiscountOf,
  repairDiscountOf,
  warehouseProtectionOf,
} from '@/game/modules/village/buildings';
import type { VillageState } from '@/game/modules/village/state';
import { check, type CheckResult } from './types';
import {
  makeSeededVillageGame,
  openVillageGate,
  raiseVillageToLevel2,
  readVillageSlice,
  type R,
} from './village-fixture';

const MS_HOUR = 3_600_000;

/** синтетический срез (v: 1 — БЕЗ bump; ленивые ключи опциональны) */
export function synthVillage(partial?: Partial<VillageState>): VillageState {
  return { v: 1, unlocked: true, xp: 0, villagers: {}, helpLastDay: null, ...partial };
}

export async function runVillagePart3(): Promise<CheckResult[]> {
  const results: CheckResult[] = [];

  // 15. данные зданий сеткой (карточка §3 — 9 штук × уровни 1–3)
  {
    const f = await makeSeededVillageGame('v162-data');
    const defs = f.game.content.get<typeof VILLAGE_BUILDINGS>('village.buildings');
    const items = f.game.content.get<Array<{ id: string }>>('items');
    const itemIds = new Set(items.map((d) => d.id));
    const currIds = new Set(Object.keys(CURRENCY_INFO));
    const EXPECT: Record<string, { unlock: number; kind: string; eff: [number, number, number] }> = {
      house: { unlock: 2, kind: 'house', eff: [1, 2, 3] },
      warehouse: { unlock: 3, kind: 'warehouse', eff: [15, 30, 45] },
      forge_village: { unlock: 4, kind: 'forge', eff: [30, 40, 50] },
      market: { unlock: 6, kind: 'market', eff: [5, 8, 10] },
      fence: { unlock: 2, kind: 'defense', eff: [4, 7, 10] },
      wall: { unlock: 8, kind: 'defense', eff: [8, 12, 16] },
      well: { unlock: 3, kind: 'happiness', eff: [2, 3, 4] },
      temple: { unlock: 10, kind: 'happiness', eff: [3, 4, 5] },
      bath: { unlock: 5, kind: 'happiness', eff: [2, 3, 4] },
    };
    const gridOk =
      defs.length === 9 &&
      defs.every((d, i) => {
        const e = EXPECT[d.id];
        return (
          e !== undefined &&
          Object.keys(EXPECT)[i] === d.id &&
          d.kind === e.kind &&
          d.levels.length === 3 &&
          d.levels.every((lv, li) => lv.effect === e.eff[li] && lv.costGold > 0 && lv.hours >= 1 && lv.hours <= 72 && lv.xp >= 1) &&
          d.unlock.t === 'statAtLeast' &&
          d.unlock.stat === 'village.level' &&
          d.unlock.value === e.unlock &&
          d.levels.every((lv) => lv.items.every((c) => (c.t === 'currency' ? currIds.has(c.id) : itemIds.has(c.id)) && c.qty >= 1))
        );
      });
    results.push(
      check(
        'данные зданий = карточке §3 (G2): РОВНО 9 (Дом/Склад/Кузница/Рынок/Частокол/Стена/Колодец/Храм/Баня); уровни 1–3; гейт = statAtLeast village.level (2/3/4/6/2/8/3/10/5); эффекты сеткой (Дом 1-2-3, Склад 15-30-45, Кузница 30-40-50 → полцены на L3, Рынок 5-8-10 → −10% на L3, Частокол 4-7-10, Стена 8-12-16, аура 2-3-4/3-4-5/2-3-4); цены: золото + материалы/изделия (все id живы: валюты CURRENCY_INFO / предметы каталога); часы 1–72; XP ≥ 1 (zod-регистрация жива)',
        () => gridOk,
        { expected: '9 зданий, сетка эффектов и гейтов', actual: `${defs.length}; ${defs.map((d) => d.id).join(',')}` },
      ),
    );
    f.dispose();
  }

  // 16. чистые функции эффектов (синтетика: построено → эффект уровня)
  {
    const g = (b?: VillageState['buildings']) => b;
    const ok16 =
      buildingEffectOf(undefined, 'fence', VILLAGE_BUILDINGS) === 0 &&
      buildingEffectOf(g({ fence: { level: 2 } }), 'fence', VILLAGE_BUILDINGS) === 7 &&
      buildingEffectOf(g({ fence: { level: 99 } }), 'fence', VILLAGE_BUILDINGS) === 10 && // клэмп уровня
      houseBonusOf(synthVillage({ buildings: { house: { level: 1 } } }), VILLAGE_BUILDINGS) === 1 &&
      houseBonusOf(synthVillage({ buildings: { house: { level: 3 } } }), VILLAGE_BUILDINGS) === 3 &&
      warehouseProtectionOf(synthVillage({ buildings: { warehouse: { level: 2 } } }), VILLAGE_BUILDINGS) === 30 &&
      buildingDefenseOf(synthVillage({ buildings: { fence: { level: 3 }, wall: { level: 2 } } }), VILLAGE_BUILDINGS) === 22 &&
      happinessAuraOf(synthVillage({ buildings: { well: { level: 1 }, temple: { level: 1 }, bath: { level: 1 } } }), VILLAGE_BUILDINGS) === 7 &&
      repairDiscountOf(synthVillage({ buildings: { forge_village: { level: 3 } } }), VILLAGE_BUILDINGS) === 50 &&
      marketDiscountOf(synthVillage({ buildings: { market: { level: 3 } } }), VILLAGE_BUILDINGS) === 10 &&
      repairDiscountOf(synthVillage(), VILLAGE_BUILDINGS) === 0 &&
      marketDiscountOf(synthVillage(), VILLAGE_BUILDINGS) === 0;
    results.push(
      check(
        'чистые функции эффектов (G2): buildingEffectOf 0/уровень/клэмп; Дом-бонус 1..3; Склад 15/30/45; защита построек = Частокол + Стена (10+12=22); аура = Колодец+Храм+Баня (2+3+2=7); Кузница 30/40/50; Рынок 5/8/10; без построек — везде 0 (ленивые ключи)',
        () => ok16,
        { expected: 'сетка синтетики', actual: ok16 ? 'ok' : 'FAIL' },
      ),
    );
  }

  // 17. постройка живьём: транзакция списала, таймер материализован, отказы ×4
  {
    const f = await makeSeededVillageGame('v162-build');
    openVillageGate(f);
    await raiseVillageToLevel2(f);
    const t = f.clock.now();
    f.game.wallet.grant('gold', 10_000);
    f.game.wallet.grant('logs', 50);
    f.game.wallet.grant('planks', 50); // гвозди НЕ даём — отказ «не хватает»
    const w0 = { gold: f.game.wallet.get('gold'), logs: f.game.wallet.get('logs'), planks: f.game.wallet.get('planks') };
    const rFence = f.village['village.build']('fence') as R<{ header: string; lines: string[] }>;
    const afterFence = { gold: f.game.wallet.get('gold'), logs: f.game.wallet.get('logs'), planks: f.game.wallet.get('planks') };
    const slice = await readVillageSlice(f);
    const wall = f.village['village.build']('wall') as R<unknown>;
    const again = f.village['village.build']('fence') as R<unknown>;
    const unknown = f.village['village.build']('castle') as R<unknown>;
    const noNails = f.village['village.build']('house') as R<unknown>;
    const wallErr = !wall.ok ? wall.error : '';
    const againErr = !again.ok ? again.error : '';
    const unknownErr = !unknown.ok ? unknown.error : '';
    const noNailsErr = !noNails.ok ? noNails.error : '';
    f.game.wallet.grant('nails', 10);
    const w1 = { gold: f.game.wallet.get('gold'), planks: f.game.wallet.get('planks'), nails: f.game.wallet.get('nails') };
    const rHouse = f.village['village.build']('house') as R<{ header: string; lines: string[] }>;
    const after = await readVillageSlice(f);
    results.push(
      check(
        'постройка живьём (G2): village.build fence → TransactionService village.build списал 100з + logs 8 + planks 4, таймер finishAt = now + 4 ч (часы реального времени); отказы честные ×4: уровень деревни (Стена: нужен 8), таймер уже жив (повтор Частокола), неизвестное здание, не хватает ресурсов (Дом без гвоздей); после гранта — Дом строится (150з + planks 6 + nails 4)',
        () =>
          rFence.ok &&
          slice?.construction?.fence?.finishAt === t + 4 * MS_HOUR &&
          afterFence.gold === w0.gold - 100 &&
          afterFence.logs === w0.logs - 8 &&
          afterFence.planks === w0.planks - 4 &&
          !wall.ok &&
          wallErr.includes('уровень деревни 8') &&
          !again.ok &&
          againErr.includes('стройка уже идёт') &&
          !unknown.ok &&
          unknownErr.includes('неизвестное здание') &&
          !noNails.ok &&
          noNailsErr.includes('не хватает') &&
          rHouse.ok &&
          after?.construction?.house !== undefined &&
          f.game.wallet.get('gold') === w1.gold - 150 &&
          f.game.wallet.get('planks') === w1.planks - 6 &&
          f.game.wallet.get('nails') === w1.nails - 4,
        {
          expected: 'fence ok +4 отказа + house ok; списания точны',
          actual: `${rFence.ok ? 'fence ok' : 'fence FAIL'}; отказы ${[wallErr, againErr, unknownErr, noNailsErr].every((e) => e.length > 0) ? '×4 ok' : 'FAIL'}; ${rHouse.ok ? 'house ok' : 'house FAIL'}; финиш ${slice?.construction?.fence?.finishAt ?? '—'} vs ${t + 4 * MS_HOUR}`,
        },
      ),
    );
    f.dispose();
  }

  return results;
}
