/**
 * Self-checks M16.2 «Деревня» — часть 6: РЕЙДЫ и roundtrip (бриф G5/G1):
 * окно рейда чистое (предвестник РОВНО за 24 ч, маркеры week/warned/
 * lastResult — идемпотентность ×2), исход = РАСЧЁТ vs порог (поражение:
 * капа ≤ 20% склада cozy + защита Склада; победа: кража 0), живой цикл
 * поражение → reload (маркеры из среза) → победа (снаряжение), roundtrip
 * байт-в-байт с вложенными ключами + ленивость + пост-wipe тишина.
 */
import { VILLAGE_RAID } from '@/content/village/raid';
import {
  raidAtOfWeek,
  raidWeekKeyOf,
  raidWindowAction,
  resolveRaidOutcome,
  warningAtOf,
} from '@/game/modules/village/raid';
import type { VillageState } from '@/game/modules/village/state';
import { check, type CheckResult } from './types';
import { synthVillage } from './village-checks-part3';
import {
  VILLAGE_T0,
  giveItems,
  hourTickAt,
  makeSeededVillageGame,
  makeVillageGame,
  openVillageGate,
  raiseVillageToLevel2,
  readVillageSlice,
  type R,
} from './village-fixture';

const MS_HOUR = 3_600_000;
const MS_DAY = 86_400_000;

export async function runVillagePart6(): Promise<CheckResult[]> {
  const results: CheckResult[] = [];

  // 24. окно рейда чистое: предвестник ровно за 24 ч, маркеры, исход-расчёт
  {
    const st = synthVillage();
    const raidAt = raidAtOfWeek(VILLAGE_T0, VILLAGE_RAID);
    const warnAt = warningAtOf(raidAt, VILLAGE_RAID);
    const week = raidWeekKeyOf(raidAt);
    const a0 = raidWindowAction(st, VILLAGE_RAID, VILLAGE_T0);
    const a1 = raidWindowAction(st, VILLAGE_RAID, warnAt);
    const warned = synthVillage({ raid: { week, warned: true } });
    const a2 = raidWindowAction(warned, VILLAGE_RAID, warnAt + MS_HOUR);
    const a3 = raidWindowAction(warned, VILLAGE_RAID, raidAt);
    const resolved = synthVillage({ raid: { week, warned: true, lastResult: { success: false, stolen: 200, dateISO: '2026-10-30', week } } });
    const a4 = raidWindowAction(resolved, VILLAGE_RAID, raidAt);
    const a5 = raidWindowAction(resolved, VILLAGE_RAID, raidAt + MS_DAY);
    const nextWarn = raidWindowAction(resolved, VILLAGE_RAID, warnAt + 7 * MS_DAY);
    // исходы: поражение (защита 0, кошелёк 1000) / поражение со Складом / победа
    const lose = resolveRaidOutcome(st, [], VILLAGE_RAID, { villageLevel: 1, walletGold: 1000, buildingDefense: 0, warehouseProtection: 0, itemTypeOf: () => 'other', itemName: (i) => i, now: raidAt, raidAt });
    const loseWh = resolveRaidOutcome(st, [], VILLAGE_RAID, { villageLevel: 1, walletGold: 1000, buildingDefense: 0, warehouseProtection: 15, itemTypeOf: () => 'other', itemName: (i) => i, now: raidAt, raidAt });
    const win = resolveRaidOutcome(synthVillage({ buildings: { fence: { level: 3 }, wall: { level: 1 } } }), [], VILLAGE_RAID, { villageLevel: 1, walletGold: 1000, buildingDefense: 10 + 8, warehouseProtection: 0, itemTypeOf: () => 'other', itemName: (i) => i, now: raidAt, raidAt });
    const ok24 =
      a0.t === 'quiet' &&
      a1.t === 'warn' &&
      a1.leadHours === 24 &&
      a1.warningAt === raidAt - 24 * MS_HOUR &&
      a1.raidAt === raidAt &&
      a2.t === 'quiet' &&
      a3.t === 'resolve' &&
      a4.t === 'quiet' &&
      a5.t === 'quiet' &&
      nextWarn.t === 'warn' &&
      !lose.success &&
      lose.defense === 0 &&
      lose.threshold === 12 &&
      lose.deficit === 12 &&
      lose.stolenPercent === 20 &&
      lose.stolenGold === 200 &&
      loseWh.stolenGold === 170 &&
      win.success &&
      win.stolenGold === 0 &&
      win.defense === 18;
    results.push(
      check(
        'окно рейда чистое (G5): до окна — тихо; В МОМЕНТ warningAt = raidAt − 24 ч — предвестник РОВНО за 24 ч («разведчик видел огни»); маркер raid.week/warned → повторные hourTick ТИХИ (идемпотентность ×2); raidAt — разрешение; lastResult.week → тихо до конца недели И при реплее; следующая неделя — НОВОЕ окно; исход = РАСЧЁТ: поражение (защита 0 vs порог 12 → дефицит 12 → капа 20% → 200з из 1000; Склад L1 → 170з), победа (Частокол L3 + Стена L1 = 18 ≥ 12 → кража 0)',
        () => ok24,
        {
          expected: 'quiet/warn 24ч/quiet/resolve/тихо×2/новая неделя; 200/170/0',
          actual: `${a0.t}/${a1.t}/${a2.t}/${a3.t}/${a4.t}/${a5.t}/${nextWarn.t}; ${lose.stolenGold}/${loseWh.stolenGold}/${win.stolenGold}`,
        },
      ),
    );
  }

  // 25. живой цикл: поражение → reload (маркеры) → победа (снаряжение), ×1 события
  {
    const f = await makeSeededVillageGame('v162-raid');
    openVillageGate(f);
    f.game.wallet.grant('gold', 1000);
    const raidEvents: Array<{ name: string; payload: Record<string, unknown> }> = [];
    const offW = f.game.bus.subscribe('village.raidWarning', (p) => raidEvents.push({ name: 'village.raidWarning', payload: p as Record<string, unknown> }));
    const offR = f.game.bus.subscribe('village.raidResolved', (p) => raidEvents.push({ name: 'village.raidResolved', payload: p as Record<string, unknown> }));
    const raidAt = raidAtOfWeek(VILLAGE_T0, VILLAGE_RAID);
    const warnAt = warningAtOf(raidAt, VILLAGE_RAID);
    const week1 = raidWeekKeyOf(raidAt);
    hourTickAt(f, VILLAGE_T0); // среда — тишина
    hourTickAt(f, warnAt); // предвестник ×1
    hourTickAt(f, warnAt + MS_HOUR); // реплей — маркер
    hourTickAt(f, raidAt); // ночь — поражение (защиты нет)
    hourTickAt(f, raidAt + MS_HOUR); // реплей — маркер
    const slice1 = await readVillageSlice(f);
    const wallet1 = f.game.wallet.get('gold');
    await f.game.save.save();
    offW();
    offR();
    f.dispose();
    // reload: маркеры из среза — час той же недели ТИХО; затем победа через снаряжение
    const f2 = await makeVillageGame(f.storage);
    const raidEvents2: Array<{ name: string; payload: Record<string, unknown> }> = [];
    const offW2 = f2.game.bus.subscribe('village.raidWarning', (p) => raidEvents2.push({ name: 'village.raidWarning', payload: p as Record<string, unknown> }));
    const offR2 = f2.game.bus.subscribe('village.raidResolved', (p) => raidEvents2.push({ name: 'village.raidResolved', payload: p as Record<string, unknown> }));
    hourTickAt(f2, raidAt + 2 * MS_HOUR); // та же неделя — ТИХО (lastResult.week)
    giveItems(f2, 'iron_sword', 3); // стек ×3 — троим жителям
    const e1 = f2.village['village.equip']('villager_varvara', 'iron_sword') as R<unknown>;
    const e2 = f2.village['village.equip']('villager_miron', 'iron_sword') as R<unknown>;
    const e3 = f2.village['village.equip']('villager_zoya', 'iron_sword') as R<unknown>;
    hourTickAt(f2, warnAt + 7 * MS_DAY); // предвестник новой недели
    hourTickAt(f2, raidAt + 7 * MS_DAY); // ночь — ПОБЕДА (3 меча ≥ порога 12)
    const slice2 = await readVillageSlice(f2);
    const wallet2 = f2.game.wallet.get('gold');
    const raidView = f2.village['village.raid']() as { defense: { total: number }; lastResult: { success: boolean; stolen: number } | null };
    offW2();
    offR2();
    results.push(
      check(
        'живой рейд-цикл (G5): час среда — тихо; hourTick в warningAt → village.raidWarning ×1 (реплей — тихо, маркер raid.week); ночь → village.raidResolved ×1 ПОРАЖЕНИЕ (защита 0 < 12 → кража 20% склада = 200з из 1000, TransactionService village.raidLoss; реплей — тихо, lastResult.week); reload в новой игре — час той же недели ТИХО (маркеры из среза); снарядили троих (стек ×3) → предвестник новой недели ×1 → ночь → ПОБЕДА (Σ сил ≥ порога: кража 0, кошелёк цел, +строка счастья каждому 70 → 74); события ровно по ×1 на окно',
        () =>
          raidEvents.length === 2 &&
          raidEvents[0]?.name === 'village.raidWarning' &&
          raidEvents[1]?.name === 'village.raidResolved' &&
          raidEvents[1]?.payload.success === false &&
          raidEvents[1]?.payload.stolen === 200 &&
          wallet1 === 800 &&
          slice1?.raid?.week === week1 &&
          slice1?.raid?.warned === true &&
          slice1?.raid?.lastResult?.week === week1 &&
          raidEvents2.length === 2 &&
          raidEvents2[0]?.name === 'village.raidWarning' &&
          raidEvents2[1]?.payload.success === true &&
          raidEvents2[1]?.payload.stolen === 0 &&
          e1.ok && e2.ok && e3.ok &&
          wallet2 === 800 &&
          slice2?.raid?.lastResult?.success === true &&
          slice2?.raid?.lastResult?.week === raidWeekKeyOf(raidAt + 7 * MS_DAY) &&
          Object.values(slice2?.villagers ?? {}).every((v) => v.happiness === 74) &&
          raidView.defense.total >= 12 &&
          raidView.lastResult?.success === true,
        {
          expected: 'нед.1: warn+resolved(200з); нед.2: warn+resolved(0, победа); счастье 74',
          actual: `нед.1 ×${raidEvents.length} (${String(raidEvents[1]?.payload.stolen)}з, кошелёк ${wallet1}); нед.2 ×${raidEvents2.length} (${String(raidEvents2[1]?.payload.stolen)}з, кошелёк ${wallet2}); защита ${raidView.defense.total}; счастье ${Object.values(slice2?.villagers ?? {}).map((v) => v.happiness).join(',')}`,
        },
      ),
    );
    f2.dispose();
  }

  // 26. roundtrip байт-в-байт с вложенными ключами + ленивость + пост-wipe тишина
  {
    const f = await makeSeededVillageGame('v162-round');
    openVillageGate(f);
    const lazy = await readVillageSlice(f); // гейт открыт, ничего не делалось
    await raiseVillageToLevel2(f); // уровень 2 — гейт построек
    const raidAt = raidAtOfWeek(VILLAGE_T0, VILLAGE_RAID);
    const warnAt = warningAtOf(raidAt, VILLAGE_RAID);
    f.game.wallet.grant('gold', 10_000);
    f.game.wallet.grant('logs', 50);
    f.game.wallet.grant('planks', 50);
    f.game.wallet.grant('nails', 20);
    f.village['village.build']('fence'); // 4 ч — завершится на рейд-тиках
    hourTickAt(f, warnAt); // предвестник (+ завершение стройки, если час прошёл)
    hourTickAt(f, raidAt); // поражение (защита Частокола L1 = 4 < 12)
    f.village['village.build']('fence'); // улучшение L2 — ЖИВОЙ таймер в сейве
    giveItems(f, 'iron_sword', 1);
    f.village['village.equip']('villager_varvara', 'iron_sword');
    await f.game.save.save();
    const raw1 = JSON.stringify((JSON.parse((await f.storage.get('main')) as string) as { modules: Record<string, unknown> }).modules['village']);
    f.dispose();
    const f2 = await makeVillageGame(f.storage);
    const raw2 = JSON.stringify((JSON.parse((await f.storage.get('main')) as string) as { modules: Record<string, unknown> }).modules['village']);
    await f2.game.save.save();
    const raw3 = JSON.stringify((JSON.parse((await f.storage.get('main')) as string) as { modules: Record<string, unknown> }).modules['village']);
    const full = await readVillageSlice(f2);
    const silent = await makeSeededVillageGame('v162-silent'); // чистая игра — гейт закрыт
    const silentSlice = await readVillageSlice(silent);
    results.push(
      check(
        'roundtrip + ленивость (G1): гейт открыт БЕЗ действий — вложенных ключей НЕТ (buildings/construction/equipped/raid все undefined — материализация ТОЛЬКО при использовании); после стройки/рейда/экипа срез несёт РОВНО использованные ключи (buildings.fence L1, construction.fence живой таймер, equipped.varvara, raid.lastResult); сейв → загрузка → повторная запись — срез village байт-в-байт (v1 = v2 = v3, канонический порядок ключей); пост-wipe тишина: чистая игра — ключа village НЕТ',
        () =>
          lazy?.buildings === undefined &&
          lazy?.construction === undefined &&
          lazy?.equipped === undefined &&
          lazy?.raid === undefined &&
          full?.buildings?.fence?.level === 1 &&
          full?.construction?.fence !== undefined &&
          full?.equipped?.villager_varvara?.defId === 'iron_sword' &&
          full?.raid?.lastResult !== undefined &&
          raw1 === raw2 &&
          raw2 === raw3 &&
          silentSlice === undefined,
        {
          expected: 'лениво → материализовано → байт-в-байт; тишина',
          actual: `lazy ${lazy?.buildings === undefined && lazy?.raid === undefined ? 'чист' : 'FAIL'}; full ${[full?.buildings?.fence?.level, full?.construction?.fence !== undefined, full?.equipped?.villager_varvara !== undefined, full?.raid?.lastResult !== undefined].join('/')}; ${raw1 === raw2 && raw2 === raw3 ? 'roundtrip ok' : 'FAIL'}; wipe ${silentSlice === undefined ? 'тихо' : 'ЕСТЬ КЛЮЧ'}`,
        },
      ),
    );
    f2.dispose();
    silent.dispose();
  }

  return results;
}
