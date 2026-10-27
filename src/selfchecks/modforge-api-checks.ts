/**
 * Self-checks M03.2 (часть 2) — модульный API модфорджа и сейв v5:
 * событие modforge.rolled (02-BUSES §4), rollFor-валидация, rollItem
 * (бюджет modSlots.budgetBase + форма редкости), costOf, холодная загрузка
 * v4-файла с миграцией до v5 и инициализацией среза modforge.
 * Расщепление движковых/API-проверок — по 01-CORE §6 (файл > 300 строк).
 */
import { MemoryStorage } from '@/kernel/save/storage-drivers';
import { mulberry32 } from '@/shared/utils/rng';
import { MOD_TYPES } from '@/content/mods/registry';
import { MODFORGE_TABLE } from '@/content/balance/modforge';
import { rollFor, type RollOutcome } from '@/game/modules/modforge/roll';
import { makeActionGame, type ActionFixture } from './inventory-action-fixture';
import { check, group, type CheckGroup, type CheckResult } from './types';

type MfApi = Record<string, (...args: unknown[]) => unknown>;
type R<T> = { ok: true; value: T } | { ok: false; error: string };

function mfOf(f: ActionFixture): MfApi {
  return f.game.modules.get('modforge')?.api ?? {};
}

const WEAPON = ['weapon', 'melee'];

export async function runModForgeApiChecks(): Promise<CheckGroup> {
  const results: CheckResult[] = [];

  // --- Модульный API: событие modforge.rolled + rollFor + rollItem + costOf
  const f1 = makeActionGame();
  const mf1 = mfOf(f1);
  let events1: Array<Record<string, unknown>> = [];
  const off1 = f1.game.bus.subscribe('modforge.rolled', (p) => events1.push(p as Record<string, unknown>));
  const r1 = mf1['modforge.rollFor']({ budget: 16, scopeTags: WEAPON, rarity: 'uncommon' }) as R<RollOutcome>;
  results.push(
    // [M10.1 · C1] легализация: payload += target (null — вызов без адресата)
    check('API rollFor: событие modforge.rolled ровно одно, payload = исход (source/budget/rolls/refund/spent/scopeTags)', () => {
      if (!r1.ok || events1.length !== 1) return false;
      const e = events1[0];
      return (
        e.source === 'modforge.rollFor' &&
        e.budget === 16 &&
        e.refund === r1.value.detail.refund &&
        e.spent === r1.value.detail.spent &&
        JSON.stringify(e.rolls) === JSON.stringify(r1.value.rolls) &&
        JSON.stringify(e.scopeTags) === JSON.stringify(WEAPON) &&
        e.target === null
      );
    }),
  );
  const r1b = mf1['modforge.rollFor']({ budget: 25, scopeTags: WEAPON, rarity: 'rare', rng: mulberry32(777) }) as R<RollOutcome>;
  // прямой вызов движка с тем же сидом — API обязан совпадать байт-в-байт
  const directOutcome = rollFor(
    {
      budget: 25,
      scopeTags: WEAPON,
      shape: { positives: [2, 2], negChance: MODFORGE_TABLE.byRarity.rare.negChance },
      mods: MOD_TYPES,
      rng: mulberry32(777),
    },
    {
      negativeRefund: MODFORGE_TABLE.negativeRefund,
      positiveExponent: MODFORGE_TABLE.positiveExponent,
      negativeExponent: MODFORGE_TABLE.negativeExponent,
    },
  );
  results.push(
    check('API rollFor: явный rng уважается — результат = прямой вызов движка с тем же сидом', () =>
      r1b.ok && JSON.stringify(r1b.value.rolls) === JSON.stringify(directOutcome.rolls)),
  );
  results.push(
    check('API rollFor: валидация — без rarity/shape отказ; rarity-мусор отказ; budget < 0 отказ; кривой shape отказ', () => {
      const a = mf1['modforge.rollFor']({ budget: 10, scopeTags: [] }) as R<unknown>;
      const b = mf1['modforge.rollFor']({ budget: 10, scopeTags: [], rarity: 'бред' }) as R<unknown>;
      const c = mf1['modforge.rollFor']({ budget: -1, scopeTags: [], rarity: 'common' }) as R<unknown>;
      const d = mf1['modforge.rollFor']({ budget: 10, scopeTags: ['weapon'], shape: { positives: [3, 1], negChance: 0 } }) as R<unknown>;
      return !a.ok && !b.ok && !c.ok && !d.ok;
    }),
  );

  const pick = mf1['modforge.rollItem']('iron_pickaxe') as R<{ defId: string; rarity: string; rolls: Array<{ type: string }>; detail: { budget: number } }>;
  const rod = mf1['modforge.rollItem']('willow_rod') as R<{ rolls: Array<{ type: string }>; detail: { budget: number } }>;
  results.push(
    // [M04.1 · C3] реестр tool/pickaxe расширен (mine_sense + mine_instinct):
    // роллы кирки — любой тип скоупа (обновление ожидания, прецедент M03.2)
    check('API rollItem: кирка — бюджет 16 (modSlots.budgetBase), скоуп tool/pickaxe → mine_sense/mine_instinct', () =>
      pick.ok && pick.value.detail.budget === 16 && pick.value.rolls.every((r) => r.type === 'mine_sense' || r.type === 'mine_instinct') && pick.value.rarity === 'uncommon'),
  );
  results.push(
    // [M07.1 · легализация поимённо] rod-скоуп — 5 кандидатов (лестница удочек
    // F4): бюджет 10 (common [1,1]) роллит один тип из пяти
    check('API rollItem: удочка — бюджет 10, типы из 5 rod-кандидатов; событие source=modforge.rollItem', () => {
      const evOk = events1.length >= 3 && events1.some((e) => e.source === 'modforge.rollItem');
      return rod.ok && rod.value.detail.budget === 10 && rod.value.rolls.every((r) => ['lucky_glow', 'treasure_sense', 'rod_mastery', 'rare_pull', 'epic_pull'].includes(r.type)) && evOk;
    }),
  );
  results.push(
    check('API rollItem: хлеб без modSlots — отказ; неизвестный defId — отказ', () => {
      const a = mf1['modforge.rollItem']('bread') as R<unknown>;
      const b = mf1['modforge.rollItem']('nope') as R<unknown>;
      return !a.ok && !b.ok;
    }),
  );
  results.push(
    check('API costOf: atk_power 15 → 3.92; неизвестный тип/NaN — отказ', () => {
      const a = mf1['modforge.costOf']('atk_power', 15) as R<number>;
      const b = mf1['modforge.costOf']('бред', 5) as R<number>;
      const c = mf1['modforge.costOf']('atk_power', 'x') as R<number>;
      return a.ok && a.value === 3.92 && !b.ok && !c.ok;
    }),
  );
  off1();
  f1.dispose();

  // --- Сейв v5: срез modforge в roundtrip + холодная загрузка v4-файла
  const storage = new MemoryStorage();
  const f2 = makeActionGame(storage);
  await f2.game.init();
  await f2.game.save.save();
  const raw2 = JSON.parse((await storage.get('main')) ?? '{}') as {
    saveVersion: number;
    modules: Record<string, unknown>;
  };
  results.push(
    // [M10.1 · v8 → M15 · v9 → M05.1 · v10 → M06.1 · v11 → M07.1 · v12] срез modforge — форма прежняя, версия файла выросла
    check('сейв v14: версия 14, срез modforge { v:1, rerolls:{} } в файле [M11 · v14]', () =>
      raw2.saveVersion === 15 && // [M12.1 · v15]
      JSON.stringify(raw2.modules.modforge) === JSON.stringify({ v: 1, rerolls: {} })),
  );
  f2.dispose();
  const v4file = {
    saveVersion: 4,
    saveId: 'v4-m03',
    savedAt: 1_700_000_000_000,
    contentVersion: '0.1.0-phase0',
    modules: { 'kernel.wallet': { balances: [['gold', 7]] } },
    lastSeen: 1_700_000_000_000,
  };
  const storageV4 = new MemoryStorage();
  await storageV4.set('main', JSON.stringify(v4file));
  const f3 = makeActionGame(storageV4);
  await f3.game.init();
  results.push(
    check('холодная загрузка v4: миграция до текущей (v12), срез modforge инициализирован, кошелёк цел (7)', () =>
      f3.game.save.info().saveVersion === 15 && // [M05.1 · v10 → M06.1 · v11 → M07.1 · v12 → M11 · v14 → M12.1 · v15]
      f3.game.save.info().slices.includes('modforge') &&
      f3.game.wallet.get('gold') === 7),
  );
  f3.dispose();

  return group('M03 · Модфордж: модульный API и сейв v7', results);
}
