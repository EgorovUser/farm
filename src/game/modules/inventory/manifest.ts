/**
 * Манифест M02 (01-CORE §9): единственное место точек интеграции модуля.
 * Все четыре события item.* декларируются сразу (SESSION-M02 §2: карточка §6 —
 * единственное место точек интеграции); публикация — по мере сеансов:
 * M02.1 шлёт item.acquired (acquire/add) и item.consumed (изъятие с событием);
 * M02.2 шлёт item.equipped (equip; снятие — БЕЗ события, D21); item.sold — M02.3.
 *
 * [DECISION · FIX-PHASE-2 · 4.6 · N6] payload item.sold обогащён аддитивным
 * полем gold (сумма гранта продажи): маркер карточки M15 §3 / Task 29, вариант
 * (а), прецедент C1 — поле читает счётчик sell.gold (конфиг M01 §6, valueKey).
 * Байт-строгие оракулы M02.3 обновлены ПОИМЁННО (inventory-action-sell /
 * inventory-multidrop). Ратификация канона 02-BUSES §4 — спека-стороной
 * при приёмке (каталог payload не редактируется сеансом).
 *
 * [DECISION] publicApi шире списка карточки §6 на 'inventory.acquire' — прямо
 * вытекает из D23 («единая точка приобретения», give кладёт через acquire) и
 * §3.7 брифа: без записи в манифесте команде пришлось бы обходить реестр (П4).
 * Ратифицировано при приёмке M02.1 (D24).
 *
 * [DECISION · M02.2] publicApi расширен читателем/штампами: 'inventory.equipped'
 * (вид экипировки для debug-панели и UI), 'inventory.mod' / 'inventory.dur'
 * (dev-штампы для приёмочных проб брифа §2.6) — прецедент D24 (info/clear,
 * player.setEnergy/setHp: манифест — единственный реестр точек интеграции).
 *
 * [DECISION · M02.3] publicApi += действия над предметом (бриф §2.3–§2.5):
 * 'inventory.use' (D32), 'inventory.sell' (D34), 'inventory.wear' (D35) —
 * карточка §3 «Действия над предметом» + debug-команды; тот же прецедент D24.
 *
 * [DECISION · M03.3] publicApi += 'inventory.setRolls' — производственный
 * канал записи ривен-роллов (карточка §1: «генерирует M03, здесь — хранение
 * и применение»). Реролл M03 применяет варианты, будущие M09/M10 — свои
 * партии. Версия 1.2.0 → 1.3.0 (манифест = факту).
 *
 * [DECISION · M04.1] publicApi += 'inventory.canAcquire' (проба вместимости
 * до покупки — прямо вытекает из D23-решения store.ts: «потребители
 * транзакционных грантов (магазин M04+) обязаны проверять вместимость до
 * покупки через API модуля»); AcquireReceipt += iids созданных записей
 * (C4: применение стартовых роллов к новой покупке). 1.3.0 → 1.4.0.
 *
 * invalidate.stat — сервисное событие каталога ядра (02 §4), публикуется при
 * смене экипировки/штампах; в eventsPublished не числится — прецедент M01
 * (player.levelUp → invalidate.stat без записи).
 */
import type { ModuleManifest } from '@/game/module-registry';

export function createInventoryManifest(): ModuleManifest {
  return {
    id: 'inventory',
    title: 'M02 Инвентарь',
    // [FIX-PHASE-2 · 4.7] 1.4.0 → 1.5.0: publicApi += 'inventory.salvage',
    // eventsPublished += 'item.salvaged' (D24-паритет фактом)
    version: '1.5.0',
    stateKey: 'inventory',
    publicApi: [
      'inventory.acquire',
      'inventory.add',
      'inventory.remove',
      'inventory.has',
      'inventory.list',
      'inventory.info',
      'inventory.clear',
      // --- M02.2: экипировка + провайдер + dev-штампы (бриф §2.3/§2.6)
      'inventory.equip',
      'inventory.unequip',
      'inventory.equipped',
      'inventory.mod',
      'inventory.dur',
      // --- M02.3: действия над предметом (бриф §2.3–§2.5)
      'inventory.use',
      'inventory.sell',
      'inventory.wear',
      // --- [FIX-PHASE-2 · 4.7 · SALV-1] «Разобрать» (карточка M02 §3)
      'inventory.salvage',
      // --- M03.3: канал записи ривен-роллов (генерация — M03, хранение — M02)
      'inventory.setRolls',
      // --- M04.1: проба вместимости до покупки (канон D23-решения store.ts)
      'inventory.canAcquire',
    ],
    // [FIX-PHASE-2 · 4.7] item.salvaged — аддитивно (ратификация канона
    // 02-BUSES §4 — спека-стороной при приёмке, НЕ сеансом)
    eventsPublished: ['item.acquired', 'item.consumed', 'item.equipped', 'item.sold', 'item.salvaged'],
    eventsSubscribed: [],
    // [M02.2] провайдер модификаторов экипировки (карточка §5, D31/D22)
    modifierProviders: ['inventory.equipment'],
    statsCounters: [],
  };
}
