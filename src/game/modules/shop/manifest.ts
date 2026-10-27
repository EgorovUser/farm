/**
 * Манифест M04 (01-CORE §9): единственное место точек интеграции модуля.
 * Зависимости — ТОЛЬКО ядро (карточка §5: «ни один другой модуль не
 * импортируется»); выдача предметов/роллов — колбэки app-слоя (прецеденты
 * D33/D38), вайрятся в bootstrap через ModuleRegistry (П4).
 *
 * События — каталог ядра 02-BUSES §4: shop.purchased (покупка; слушают
 * квесты/ачивки M15 и XP магазина) и shop.rotated (время старта завоза —
 * таймер UI). Подписка: time.dayTick → ротация нового дня (§2).
 *
 * Провайдеры: shop.branches — StatBus (эффекты веток §3 «в StatBus»);
 * shop.stock / shop.level — PriceBus (04-DISCOUNTS §2.2 + §2 карточки:
 * скидки объявляются источниками, итог считает шина).
 *
 * [M04.2 · §5 карточки] СКУПКА У ИГРОКА — reuse модуля M02, новой логики
 * нет ([DECISION] M04.1 §2.4): priceBus.sellPrice (40% базы, без дневных
 * скидок) → inventory.sell → событие item.sold; витрина раздела «Скупка» —
 * UI фазы 6. Покупка ветвей — TransactionService (eventId shop.branch),
 * событие каталогом §6 НЕ предусмотрено (только purchased/rotated).
 *
 * [M04.2] 1.0.0 → 1.1.0 (аддитивно): 'shop.branch.view' (витрина ветвей:
 * уровни/цены/эффекты) и 'shop.branch.buy' (покупка уровня за золото;
 * выборы ассортимента/заказов — параметром pick).
 */
import type { ModuleManifest } from '@/game/module-registry';

export function createShopManifest(): ModuleManifest {
  return {
    id: 'shop',
    title: 'M04 Магазин',
    version: '1.1.0',
    stateKey: 'shop',
    publicApi: [
      'shop.ensureStock',
      'shop.stock',
      'shop.buy',
      'shop.reroll',
      'shop.levelup',
      'shop.view',
      // --- M04.2: ветви §3
      'shop.branch.view',
      'shop.branch.buy',
    ],
    eventsPublished: ['shop.purchased', 'shop.rotated'],
    eventsSubscribed: [{ event: 'time.dayTick', handler: 'onDayTick' }],
    modifierProviders: ['shop.branches'],
    priceModifierProviders: ['shop.stock', 'shop.level'],
    statsCounters: [],
  };
}
