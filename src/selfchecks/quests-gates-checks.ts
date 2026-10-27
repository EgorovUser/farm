/**
 * Self-checks M15 «Квесты и ачивки», часть 3 (бриф M15.2 §4.7: 16–17):
 * ачивка-данными (§7-1 карточки — ноль спец-обработчиков) и живой гейт
 * «ачивка → флаг → ассортимент M04 → покупка» (§7-3, N10 — главный пункт
 * сеанса). Собирается в ОДНУ группу «M15 · Квесты и ачивки» (расщепление
 * 01 §6 — quests-live-checks превысил бы 300 строк).
 */
import { check, type CheckResult } from './types';
import {
  DAY_MS,
  advanceWithCatchUp,
  devUnlock,
  flagsOf,
  giveItem,
  grantGold,
  listAch,
  makeSeededQuestsGame,
} from './quests-fixture';
import { ACHIEVEMENTS } from '@/content/quests/achievements';
import type { AchievementDef } from '@/content/quests/types';

export async function runQuestsGatesChecks(): Promise<CheckResult[]> {
  const results: CheckResult[] = [];

  // ------------------------------------------- 16. [M15.2] ачивка-данными (§7-1 карточки)
  // НОВАЯ ачивка регистрируется в реестре ДО init (перерегистрация таблицы —
  // движок не трогается): живое событие item.acquired ×2 → unlock + флаг +
  // событие achievement.unlocked — без единой строки кода
  const probeAch: AchievementDef = {
    id: 'ach_selfcheck_probe',
    name: 'Чековая ачивка (фикстура)',
    condition: { t: 'counterAtLeast', counter: 'items.acquired', value: 2 },
    rewards: [{ t: 'currency', id: 'gold', qty: 7 }],
    unlockFlags: ['probe.flag'],
  };
  const f16 = await makeSeededQuestsGame('m15-ach-data', undefined, undefined, [...ACHIEVEMENTS, probeAch]);
  giveItem(f16, 'bread'); // acquired 1 — порог ещё не взят
  const probeMidRow = listAch(f16).find((a) => a.id === 'ach_selfcheck_probe');
  giveItem(f16, 'bread'); // acquired 2 → счётчик → условие → unlock
  const probeAchRow = listAch(f16).find((a) => a.id === 'ach_selfcheck_probe');
  const probeEv = f16.events.find((e) => e.name === 'achievement.unlocked' && e.payload.id === 'ach_selfcheck_probe');
  results.push(
    check('ноль спец-обработчиков (АЧИВКА): новый шаблон ачивки в данных → счётчик → unlock + флаг + событие без пересборки (§7 карточки)', () =>
      probeMidRow !== undefined && probeMidRow.unlocked === false &&
      probeAchRow !== undefined && probeAchRow.unlocked === true &&
      probeEv !== undefined && probeEv.payload.hidden === false &&
      flagsOf(f16).includes('probe.flag')),
  );
  f16.dispose();

  // ------------------------------------------- 17. [M15.2] гейт ачивки → флаг → M04 → покупка (§7-3, N10)
  // живой интеграционный тест ROADMAP M15: каталог «что привозить» + постоянный
  // заказ → предмет в стоке ежедневно; покупка под гейтом — валидный отказ с
  // текстом; ачивка → unlockFlags → гейт открыт (оба пути: {t:'achievement'}
  // и {t:'flag'}) → покупка проходит
  const f17 = await makeSeededQuestsGame('m15-gate');
  grantGold(f17, 2500);
  const shop = f17.game.modules.get('shop')?.api ?? {};
  const pickA = shop['shop.branch.buy']('assortment', 'whetstone_of_luck') as { ok: boolean };
  const pinA = shop['shop.branch.buy']('permanent', 'whetstone_of_luck') as { ok: boolean };
  const pickB = shop['shop.branch.buy']('assortment', 'metallurgist_hammer') as { ok: boolean; error?: string };
  const pinB = shop['shop.branch.buy']('permanent', 'metallurgist_hammer') as { ok: boolean; error?: string };
  advanceWithCatchUp(f17, DAY_MS); // +1d → dayTick → свежий сток с заказами
  const stock17 = shop['shop.stock']() as { entries: Array<{ id: string; pinned?: boolean }> };
  const stockHas = (id: string): boolean => stock17.entries.some((e) => e.id === id && e.pinned === true);
  const buyLockedA = shop['shop.buy']('whetstone_of_luck', 1) as { ok: boolean; error?: string };
  const buyLockedB = shop['shop.buy']('metallurgist_hammer', 1) as { ok: boolean; error?: string };
  devUnlock(f17, 'ach_first_spark'); // ачивка → флаг ach.forge.first
  devUnlock(f17, 'ach_smelter_master'); // ачивка → флаг ach.smelter.master
  const gateFlags17 = flagsOf(f17);
  const gold17 = f17.game.wallet.get('gold');
  const buyOpenA = shop['shop.buy']('whetstone_of_luck', 1) as { ok: boolean };
  const buyOpenB = shop['shop.buy']('metallurgist_hammer', 1) as { ok: boolean };
  results.push(
    check('гейт ачивки открывает РЕАЛЬНЫЙ гейт магазина (§7-3/N10): фикс-предметы в стоке (заказ), покупка под гейтом — отказ с текстом, после ачивки — обе (achievement/flag) покупки проходят', () =>
      pickA.ok && pinA.ok && pickB.ok && pinB.ok &&
      stockHas('whetstone_of_luck') && stockHas('metallurgist_hammer') &&
      !buyLockedA.ok && String(buyLockedA.error).includes('ачивка') &&
      !buyLockedB.ok && String(buyLockedB.error).includes('ach.smelter.master') &&
      gateFlags17.includes('ach.forge.first') && gateFlags17.includes('ach.smelter.master') &&
      buyOpenA.ok && buyOpenB.ok && f17.game.wallet.get('gold') === gold17 - 68 - 650),
  );
  f17.dispose();

  return results;
}
