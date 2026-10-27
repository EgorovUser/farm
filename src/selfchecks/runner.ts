/**
 * Раннер runtime self-checks — критерий приёмки Фазы 0 (02-BUSES §13).
 * Запуск: debug-команда `selftest` (браузер) или `bun scripts/selftest.ts` (headless).
 * Все проверки изолированы от живой игры.
 *
 * [FIX-0.1 K] каталог вынесен из src/kernel/: проверки импортируют @/game и @/content
 * (фикстуры), а ядро не должно импортировать ничего выше себя (01-CORE §5).
 */
import { runProviderChecks, runStatAggregationChecks } from './stat-checks';
import { runPityChecks, runRngChecks } from './rng-pity-checks';
import { runTaskRegistryChecks, runTransactionChecks } from './transaction-task-checks';
import { runCatchUpChecks, runSaveChecks } from './time-save-checks';
import { runPriceChecks } from './price-checks';
import { runContentChecks } from './content-checks';
import { runBuffRunsChecks } from './buff-runs-checks';
import { runModifierFilterChecks } from './modifier-filter-checks';
import { runPlayerEnergyChecks, runPlayerRegenChecks, runWalletSpyChecks } from './player-body-checks';
import {
  runPlayerCounterChecks,
  runPlayerSaveChecks,
  runPlayerSkillChecks,
  runPlayerXpChecks,
} from './player-progress-checks';
import { runColdReconcileChecks, runFocusReconcileChecks, runResolveKeyChecks, runSeedSyncChecks } from './fix-m01-checks';
import { runInventoryChecks } from './inventory-checks';
import { runInventoryEquipChecks } from './inventory-equip-checks';
import { runInventoryActionChecks } from './inventory-action-checks';
import { runInventoryMultidropChecks } from './inventory-multidrop-checks';
import { runModForgeCostChecks } from './modforge-cost-checks';
import { runModForgeRollChecks } from './modforge-roll-checks';
import { runModForgeApiChecks } from './modforge-api-checks';
import { runModForgeRerollChecks } from './modforge-reroll-checks';
import { runModForgeC6Checks } from './modforge-c6-checks';
import { runShopChecks } from './shop-checks';
import { shopBranchChecks } from './shop-branches-checks';
import { runCraftChecks } from './craft-checks';
import { runCraftQueueChecks } from './craft-queue-checks';
import { runForgeChecks } from './forge-checks';
import { runForgeCardsChecks } from './forge-cards-checks';
import { runQuestsChecks } from './quests-checks';
import { runFarmChecks } from './farm-checks';
import { runPenChecks } from './pen-checks';
import { runFishChecks } from './fish-checks';
import { runLakeChecks } from './lake-checks';
import { runWorkersChecks } from './workers-checks';
import { runMineChecks } from './mine-checks';
import { runMineRunChecks } from './mine-run-checks';
// [M13.2] помощники (наёмники забегов) — доска/страхи/классы/доля/репутация
import { runMineHelpersChecks } from './mine-helpers-checks';
// [REG-1] живой реестр: агрегатор рантайм-реестров (модули/шины/сервисы/
// команды/контент) — списки расширяются сами (запрос спеки между M12.1 и M12.2)
import { runRegistryChecks } from './registry-checks';
import type { CheckGroup } from './types';

export type { CheckGroup, CheckResult } from './types';

export async function runAllSelfChecks(): Promise<CheckGroup[]> {
  return [
    runStatAggregationChecks(),
    runProviderChecks(),
    runPityChecks(),
    runRngChecks(),
    runTransactionChecks(),
    runCatchUpChecks(),
    await runSaveChecks(),
    runTaskRegistryChecks(),
    runPriceChecks(),
    runContentChecks(),
    runModifierFilterChecks(),
    runBuffRunsChecks(),
    // --- M01 «Игрок» (карточка §8)
    runPlayerRegenChecks(),
    runPlayerEnergyChecks(),
    runWalletSpyChecks(),
    runPlayerXpChecks(),
    runPlayerSkillChecks(),
    runPlayerCounterChecks(),
    await runPlayerSaveChecks(),
    // --- FIX-M01 (бриф §2.4: MISS-7 + D13)
    runResolveKeyChecks(),
    await runSeedSyncChecks(),
    await runColdReconcileChecks(),
    runFocusReconcileChecks(),
    // --- M02 «Инвентарь» (карточка §8, сеанс M02.1 — часть 1)
    await runInventoryChecks(),
    // --- M02 «Инвентарь» (сеанс M02.2 — часть 2: экипировка, провайдер, гейты)
    await runInventoryEquipChecks(),
    // --- M02 «Инвентарь» (сеанс M02.3 — часть 3: действия над предметом)
    await runInventoryActionChecks(),
    // --- M02 · FIX-M02 (CRIT-1 аудита AUDIT-M02): изъятие партий (мульти-дроп)
    await runInventoryMultidropChecks(),
    // --- M03 «Модфордж» (сеанс M03.1 — часть 1: стоимости и бюджеты)
    runModForgeCostChecks(),
    // --- M03 «Модфордж» (сеанс M03.2 — части 2/3: движок rollFor §5 + API/сейв v5)
    runModForgeRollChecks(),
    await runModForgeApiChecks(),
    // --- M03 «Модфордж» (сеанс M03.3 — часть 4: реролл-цикл §6 + шов setRolls)
    await runModForgeRerollChecks(),
    // --- M03 · C6 (M04.1, AUDIT-M03 леджер): фикс сида реролла на saveId
    await runModForgeC6Checks(),
    // --- M04 «Магазин» (сеанс M04.1: ротация §2 + гейты §4 + покупка §5 + C4)
    await runShopChecks(),
    // --- M04 «Магазин» (сеанс M04.2: ветви §3 за золото + C2-реролл-экономика)
    await shopBranchChecks(),
    // --- M09 «Крафт» (карточка §7: контент/формула/станции + очередь/сбор/экономика)
    await runCraftChecks(),
    await runCraftQueueChecks(),
    await runForgeChecks(),
    await runForgeCardsChecks(),
    // --- M15 «Квесты и ачивки» (карточка §7 + бриф M15.1 §4.7; одна группа:
    //     движок + живые пробы — quests-checks.ts оркестратор)
    await runQuestsChecks(),
    // --- M05 «Ферма» (сеанс M05.1 — часть 1: каркас + FSM + сейв v10)
    await runFarmChecks(),
    // --- M06 «Загон» (сеанс M06.1 — часть 1: каркас + животные + уход +
    //     продукция + сейв v11)
    await runPenChecks(),
    // --- M07 «Рыбалка» (сеанс M07.1 — часть 1: каркас + таблицы дропа +
    //     удочки/наживки + процесс + альбом + сейв v12)
    await runFishChecks(),
    // --- M08 «Озеро» (сеанс M08.1 — часть 1: каркас + срез v13 + вода/условия +
    //     уход + разведение 89/10/1 + выравнивание pen)
    await runLakeChecks(),
    // --- M11 «Работники» (сеанс M11.1: доска dailySeed + найм/объекты +
    //     настроение/болезни/расчётный день/увольнение + срез v14)
    await runWorkersChecks(),
    // --- M12 «Шахта» (сеанс M12.1 — часть 1: чистый боевой движок +
    //     мобы/элиты + витрины + срез v15; бриф SESSION-M12.1 F9)
    await runMineChecks(),
    // --- M13 «Забег» (сеанс M13.1 — карточный рогалик: генерация/карты/факел/runBag)
    await runMineRunChecks(),
    // --- M13 «Помощники» (сеанс M13.2 — наёмники: доска dailySeed/страхи-Condition/
    //     классы ×5/доля по вкладу/зарплата/репутация/перк 50+/Отряд/энергоконтракт)
    await runMineHelpersChecks(),
    // --- Реестр (сеанс REG-1): живой обзор — модули M01–M15/шины/сервисы/
    //     команды/контент без ручных списков (агрегатор registry-overview)
    await runRegistryChecks(),
  ];
}

export function summarize(groups: CheckGroup[]): { total: number; passed: number; failed: number } {
  const all = groups.flatMap((g) => g.results);
  return {
    total: all.length,
    passed: all.filter((r) => r.passed).length,
    failed: all.filter((r) => !r.passed).length,
  };
}
