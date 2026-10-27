/**
 * [M15.2 · N10] ФИКСТУРЫ ГЕЙТОВ АССОРТИМЕНТА M04 (карточка M04 §4 «гейты» —
 * буква, не расширение): предметы «городских наград для героев», скрытые до
 * ачивки/флага. Гейт — unlock на ItemDef (Requirement-оценщик 03-DATA §2:
 * {t:'achievement'} / {t:'flag'}); читают его ОБА потребителя: гейт покупки
 * (shop/purchase.ts gateBlock: poolEntry.unlock ?? def.unlock) и витрина
 * shop.stock (П6 «гейты показываем» — 🔒 + текст до выполнения).
 *
 * В РОТАЦИОННЫЙ ПУЛ (shopPool.ts) НЕ входят [DECISION]: пул-оракулы M04
 * считаются по факту пула (ceil(0.30×пул) — чужие чеки не мутируем); канал
 * поступления — каталог «что привозить» (assortmentCatalog, ветка
 * «Ассортимент» §3): выбор игроком → предмет в пуле candidates → гарантия
 * стока — постоянный заказ (ветка «Заказ»). Флаги производит ТОЛЬКО движок
 * ачивок/цепочек M15 (unlockFlags / Reward{t:'flag'}); магазин их ЧИТАЕТ
 * через шов gateExtras (module-wiring), не спец-кодом.
 */
import type { ItemDef } from './items';

export const REWARD_ITEMS: ItemDef[] = [
  {
    id: 'whetstone_of_luck',
    name: 'Брусок удачи',
    itemType: 'consumable',
    rarity: 'uncommon',
    basePrice: 45, // тюнюется
    stackable: true,
    maxStack: 20,
    useAction: { effects: [{ t: 'grantEnergy', value: 20 }] },
    unlock: { t: 'achievement', id: 'ach_first_spark' },
  },
  {
    id: 'masters_apron',
    name: 'Фартук кузнеца',
    itemType: 'armor',
    subType: 'apron',
    rarity: 'rare',
    basePrice: 340, // тюнюется
    durabilityMax: 80,
    baseStats: { 'combat.defense': 6 },
    unlock: { t: 'achievement', id: 'ach_forge_master' },
  },
  {
    id: 'apprentice_mug',
    name: 'Кружка подмастерья',
    itemType: 'consumable',
    rarity: 'uncommon',
    basePrice: 38, // тюнюется
    stackable: true,
    maxStack: 20,
    useAction: { effects: [{ t: 'grantEnergy', value: 25 }, { t: 'grantHp', value: 15 }] },
    unlock: { t: 'achievement', id: 'ach_craft_apprentice' },
  },
  {
    id: 'merchants_scale',
    name: 'Весы торговца',
    itemType: 'treasure',
    rarity: 'rare',
    basePrice: 380, // тюнюется
    stackable: false,
    unlock: { t: 'achievement', id: 'ach_merchant' },
  },
  {
    id: 'customer_card',
    name: 'Карта клиента',
    itemType: 'treasure',
    rarity: 'uncommon',
    basePrice: 120, // тюнюется
    stackable: false,
    unlock: { t: 'achievement', id: 'ach_regular_customer' },
  },
  {
    id: 'rerollers_coin',
    name: 'Монета перерождений',
    itemType: 'treasure',
    rarity: 'rare',
    basePrice: 300, // тюнюется
    stackable: false,
    unlock: { t: 'achievement', id: 'ach_reroll_gourmet' },
  },
  {
    // гейт по ФЛАГУ цепочки (N10: оба пути оценщика — {t:'flag'} и {t:'achievement'}):
    // «Набор точильщика» открывает флаг workshop.sharpened — шаг 3 цепочки
    // «Восстановление хутора» (первая успешная заточка хутора)
    id: 'sharpening_kit',
    name: 'Набор точильщика',
    itemType: 'tool',
    subType: 'kit',
    rarity: 'uncommon',
    basePrice: 90, // тюнюется
    durabilityMax: 50,
    unlock: { t: 'flag', flag: 'workshop.sharpened' },
  },
  {
    // гейт по ФЛАГУ ачивки ({t:'flag'} — «Металлург»): демонстрирует путь
    // «ачивка → unlockFlags → флаг → гейт» без {t:'achievement'}-условия
    id: 'metallurgist_hammer',
    name: 'Молот металлурга',
    itemType: 'tool',
    subType: 'hammer',
    rarity: 'rare',
    basePrice: 260, // тюнюется
    durabilityMax: 60,
    unlock: { t: 'flag', flag: 'ach.smelter.master' },
  },
];
