/**
 * Self-checks M16 «Деревня» — часть 1 (бриф G9: гейт/ачивка/детерминизм/
 * поставка/unlock уровнем). Оракулы руками; срез читается из ФАЙЛА сейва
 * (честная истина — прецедент «витрины + чистые функции»).
 */
import { VILLAGERS } from '@/content/village/villagers';
import { VILLAGE_NEEDS } from '@/content/village/needs';
import type { VillagerDef } from '@/content/village/types';
import { VILLAGE_TABLE, villageLevelOf } from '@/content/village/table';
import { rollDailyNeed, rollNeedFor, rollWeeklyNeed, type VillagerLiveState } from '@/game/modules/village/logic';
import { check, type CheckResult } from './types';
import {
  dayTickAt,
  giveItems,
  localDateISO,
  makeSeededVillageGame,
  makeVillageGame,
  needsOf,
  openVillageGate,
  taxEventsOf,
  VILLAGE_DAY,
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

/** срез деревни из файла сейва (undefined — ключа нет: до гейта) */
async function readSlice(f: VillageFixture): Promise<SliceShape | undefined> {
  await f.game.save.save();
  const raw = JSON.parse((await f.storage.get('main')) as string) as { modules: Record<string, unknown> };
  return raw.modules['village'] as SliceShape | undefined;
}

export async function runVillagePart1(): Promise<CheckResult[]> {
  const results: CheckResult[] = [];

  // 1. гейт-отказ + тишина файла (G1: до открытия срез НЕ пишется)
  {
    const f = await makeVillageGame();
    const v = f.village['village.state']() as { unlocked: boolean; gateLines: string[] };
    const r = f.village['village.supply']('villager_varvara', 'wheat_grain') as R<unknown>;
    const slice = await readSlice(f);
    results.push(
      check(
        'гейт-отказ честный (G1): свежая игра → деревня заперта, условия текстом; срез НЕ инициализируется (файл без ключа village); поставка отказана',
        () =>
          v.unlocked === false &&
          v.gateLines.length === 2 &&
          v.gateLines[0]!.includes('уровень игрока 30') &&
          v.gateLines[1]!.includes('Мастер хутора') &&
          !r.ok &&
          r.error.includes('заперта') &&
          slice === undefined,
        { expected: 'unlocked=false; файл без village', actual: `${v.unlocked}; ${slice === undefined ? 'нет ключа' : 'ЕСТЬ ключ'}` },
      ),
    );
    f.dispose();
  }

  // 2. ветка (б) [DECISION M161-гейт]: РОВНО ОДНА новая ачивка, пул 61 → 62
  {
    const f = await makeVillageGame();
    const pool = f.game.content.get<Array<{ id: string; unlockFlags?: string[]; rewards?: Array<{ t: string }>; condition: { t: string } }>>('quests.achievements');
    const ach = pool.find((a) => a.id === 'ach_homestead_master');
    results.push(
      check(
        'ачивка «Мастер хутора» (ветка б): пул 62 (61 + РОВНО ОДНА); unlockFlag village.homestead.master; награда БЕЗ passivePoint (очки пассивок НЕ растут); условие compound',
        () =>
          pool.length === 62 &&
          ach !== undefined &&
          JSON.stringify(ach.unlockFlags) === JSON.stringify(['village.homestead.master']) &&
          (ach.rewards ?? []).every((r) => r.t !== 'passivePoint') &&
          ach.condition.t === 'all',
        { expected: '62 / flag / без passivePoint / all', actual: `${pool.length} / ${ach?.unlockFlags?.[0] ?? '—'} / ${(ach?.rewards ?? []).map((r) => r.t).join(',') || '—'} / ${ach?.condition.t}` },
      ),
    );
    f.dispose();
  }

  // 3. гейт-открытие ЧЕСТНЫМ путём (XP + ачивка M15) + материализация
  {
    const f = await makeSeededVillageGame('v161-open');
    openVillageGate(f);
    const v = f.village['village.state']() as {
      unlocked: boolean;
      xp: number;
      villagers: Array<{ id: string; happiness: number; need: { item: string; kind: string; satisfied: boolean } | null }>;
    };
    const slice = await readSlice(f);
    const needOk = Object.values(slice?.villagers ?? {}).every(
      (lv) => lv.need !== undefined && lv.need.day === DAY0 && (lv.need.kind === 'daily' || lv.need.kind === 'weekly'),
    );
    results.push(
      check(
        'гейт-открытие честным путём (G1): xp add → ур.30 + ach unlock (канал M15) → материализация: 3 стартовых жителя, счастье 70, потребности дня, ключ village в файле',
        () =>
          v.unlocked === true &&
          v.villagers.length === 3 &&
          v.villagers.map((r) => r.id).join(',') === 'villager_varvara,villager_miron,villager_zoya' &&
          v.xp === 0 &&
          v.villagers.every((r) => r.happiness === 70 && r.need !== null && r.need.satisfied === false) &&
          slice !== undefined &&
          slice.unlocked === true &&
          needOk,
        { expected: '3 стартовых / 70 / need.day=D0', actual: `${v.villagers.length} / ${v.villagers[0]?.happiness}` },
      ),
    );
    f.dispose();
  }

  // 4. детерминизм потребностей ×2 (G2) + weekly по iso-неделе
  {
    const f1 = await makeSeededVillageGame('v161-det');
    const f2 = await makeSeededVillageGame('v161-det');
    openVillageGate(f1);
    openVillageGate(f2);
    const rows1 = JSON.stringify(needsOf(f1));
    const rows2 = JSON.stringify(needsOf(f2));
    const def = VILLAGERS[0]!;
    const pools = VILLAGE_NEEDS;
    const pure1 = JSON.stringify(rollDailyNeed('v161-det', def, pools, DAY0));
    const pure2 = JSON.stringify(rollDailyNeed('v161-det', def, pools, DAY0));
    // weekly: сид — якорь iso-недели (стабилен пн–вс), day-маркер — дата
    // ролла (инвариант state.ts). Синтетический житель с ДВУМЯ кандидатами
    // (honey w3 / cloth w4) — предвычислено: неделя 2026-10-26 → cloth ×3,
    // неделя 2026-11-02 → honey ×2 (оракул .zscripts/m161-weekly-probe.ts)
    const synth: VillagerDef = {
      id: 'villager_synth',
      name: 'Синт',
      profession: 'Тест',
      needs: { daily: [], weekly: [{ defId: 'honey', qty: 2 }, { defId: 'cloth', qty: 3 }] },
    };
    const wMon = rollWeeklyNeed('v161-det', synth, pools, '2026-10-26');
    const wFri = rollWeeklyNeed('v161-det', synth, pools, '2026-10-30');
    const wNext = rollWeeklyNeed('v161-det', synth, pools, '2026-11-02');
    const weekStable = wMon !== undefined && wFri !== undefined && wMon.item === wFri.item && wMon.qty === wFri.qty;
    const dayTracks = wMon?.day === '2026-10-26' && wFri?.day === '2026-10-30' && wNext?.day === '2026-11-02';
    const newWeekRoll = wMon !== undefined && wNext !== undefined && wNext.item !== wMon.item;
    results.push(
      check(
        'детерминизм потребностей ×2 (G2): две игры одного saveId — байт-идентичны; чистый ролл ×2 совпадает; weekly: сид = якорь iso-недели (пн≈пт по предмету/количеству — синтетика с 2 кандидатами), новая неделя — ДРУГОЙ предмет (новый ролл), day-маркер = дата ролла',
        () => rows1 === rows2 && pure1 === pure2 && weekStable && dayTracks && newWeekRoll,
        { expected: 'rows=rows; weekly стабилен в неделе; новая неделя — новый ролл', actual: `rows ${rows1 === rows2 ? '=' : '≠'}; weekly ${weekStable ? 'стабилен' : 'FAIL'}; новая неделя ${newWeekRoll ? 'новый предмет' : 'FAIL'}; day ${dayTracks ? 'ок' : 'FAIL'}` },
      ),
    );
    f1.dispose();
    f2.dispose();
  }

  // 5. смена дня — новый ролл (оракул rollNeedFor по вчерашнему срезу)
  {
    const f = await makeSeededVillageGame('v161-day');
    openVillageGate(f);
    const slice0 = await readSlice(f);
    dayTickAt(f, 1);
    const taxCount = taxEventsOf(f).length;
    const slice1 = await readSlice(f);
    const DAY1 = localDateISO(VILLAGE_T0 + VILLAGE_DAY);
    let oracleOk = true;
    for (const def of VILLAGERS) {
      const prev = slice0?.villagers[def.id];
      const next = slice1?.villagers[def.id];
      if (prev === undefined || next === undefined) continue;
      const expected = rollNeedFor('v161-day', def, prev as VillagerLiveState, VILLAGE_NEEDS, DAY1);
      if (JSON.stringify(expected) !== JSON.stringify(next.need)) oracleOk = false;
    }
    results.push(
      check(
        'смена дня — новый ролл (G2): dayTick → need.day = новая дата; оракул rollNeedFor(вчерашний срез, новая дата) = факту; налог дня стрелял ровно ×1',
        () =>
          Object.values(slice1?.villagers ?? {}).every((lv) => lv.need !== undefined && lv.need.day === DAY1) &&
          oracleOk &&
          taxCount === 1,
        { expected: 'need.day=D1; оракул = факт; tax ×1', actual: `oracle ${oracleOk ? 'ok' : 'FAIL'}; tax ×${taxCount}` },
      ),
    );
    f.dispose();
  }

  // 6. поставка-транзакция + отказы (G3)
  {
    const f = await makeSeededVillageGame('v161-sup');
    openVillageGate(f);
    const slice0 = await readSlice(f);
    const need = slice0!.villagers['villager_varvara']!.need!;
    const mironNeed = slice0!.villagers['villager_miron']!.need!;
    const wrong = f.village['village.supply']('villager_varvara', 'turnip') as R<unknown>;
    const little = f.village['village.supply']('villager_varvara', need.item, Math.max(1, need.qty - 1)) as R<unknown>;
    giveItems(f, need.item, need.qty + 5);
    const ok1 = f.village['village.supply']('villager_varvara', need.item) as R<{ lines: string[] }>;
    const again = f.village['village.supply']('villager_varvara', need.item) as R<unknown>;
    const noitems = f.village['village.supply']('villager_miron', mironNeed.item) as R<unknown>;
    const slice1 = await readSlice(f);
    const invList = f.inv['inventory.list']() as Array<{ defId: string; qty: number }>;
    const rest = invList.filter((i) => i.defId === need.item).reduce((s, i) => s + i.qty, 0);
    const xpGain = need.kind === 'weekly' ? VILLAGE_TABLE.xp.perWeeklyNeed : VILLAGE_TABLE.xp.perDailyNeed;
    results.push(
      check(
        'поставка через TransactionService (G3): списано item×qty, XP деревне, счастье 70→76, lastSatisfied=день; отказы: чужой предмет / мало / повтор / нехватка',
        () =>
          !wrong.ok && wrong.error.includes('чужой предмет') &&
          !little.ok && little.error.includes('мало') &&
          ok1.ok && rest === 5 &&
          slice1!.xp === xpGain &&
          slice1!.villagers['villager_varvara']!.happiness === 76 &&
          slice1!.villagers['villager_varvara']!.lastSatisfied === DAY0 &&
          !again.ok && again.error.includes('уже удовлетворена') &&
          !noitems.ok && noitems.error.includes('не хватает'),
        { expected: `поставка ok; xp=${xpGain}; h=76; отказы ×4`, actual: `xp=${slice1!.xp}; h=${slice1!.villagers['villager_varvara']?.happiness}; rest=${rest}` },
      ),
    );
    f.dispose();
  }

  // 7. unlock жителей уровнем деревни + провайдер village.level (G2/G5)
  {
    const f = await makeSeededVillageGame('v161-lvl');
    openVillageGate(f);
    let joined = false;
    for (let day = 0; day < 6 && !joined; day++) {
      const slice = await readSlice(f);
      for (const [id, lv] of Object.entries(slice!.villagers)) {
        if (lv.need === undefined || lv.lastSatisfied !== undefined) continue;
        giveItems(f, lv.need.item, lv.need.qty);
        const r = f.village['village.supply'](id, lv.need.item) as R<unknown>;
        if (!r.ok) throw new Error(String(r));
      }
      if (day < 5) dayTickAt(f, day + 1);
      const after = await readSlice(f);
      joined = after!.villagers['villager_akulina'] !== undefined;
    }
    const final = await readSlice(f);
    const level = villageLevelOf(final!.xp, VILLAGE_TABLE.level);
    const resolved = f.game.statBus.resolve({ stat: 'village.level', ctx: f.game.time.ctx('player') });
    results.push(
      check(
        'уровень деревни открывает жителей (G2/G5): поставки копят XP → уровень 3 → Акулина присоединяется; resolve(village.level) = override провайдера = уровню кривой',
        () =>
          Object.keys(final!.villagers).length >= 4 &&
          final!.villagers['villager_akulina'] !== undefined &&
          level >= 3 &&
          resolved === level,
        { expected: 'жителей ≥ 4; resolve = level ≥ 3', actual: `${Object.keys(final!.villagers).length}; xp=${final!.xp}; level=${level}; resolve=${resolved}` },
      ),
    );
    f.dispose();
  }

  return results;
}
