/**
 * Подарки деревни (карточка M16 §3; бриф G7) — шанс при удовлетворении
 * потребности, выше при высоком счастье. Ролл — RngBus (стримы
 * 'village:gift' — шанс, 'village:gift:pick' — выбор), детерминизм —
 * оракулы selftest. Только СУЩЕСТВУЮЩИЕ предметы/валюты: ресурсы,
 * редкие семена, рыба A (тир выдачи — канал inventory.add), карты
 * сокровищ (treasure_map жив с M07.2 F13 — [QUESTION] не требуется).
 */
import type { VillageGiftsTable } from './types';

export const VILLAGE_GIFTS: VillageGiftsTable = {
  chanceBasePercent: 12,
  chanceHappinessBonusPercent: 18,
  chanceHappinessMalusPercent: 8,
  happinessPivot: 50,
  table: [
    // ресурсы: золото/доски/гвозди (валюты — транзакция)
    { t: 'currency', id: 'gold', qtyMin: 40, qtyMax: 90, weight: 22 },
    { t: 'currency', id: 'planks', qtyMin: 2, qtyMax: 5, weight: 10 },
    { t: 'currency', id: 'nails', qtyMin: 2, qtyMax: 6, weight: 10 },
    // редкие семена (M04/M05: лаванда/виноград/солнечник)
    { t: 'item', id: 'seed_lavender', qtyMin: 1, qtyMax: 2, weight: 8, tier: 'C', value: 50 },
    { t: 'item', id: 'seed_grape', qtyMin: 1, qtyMax: 1, weight: 5, tier: 'C', value: 50 },
    { t: 'item', id: 'seed_sunflower', qtyMin: 1, qtyMax: 2, weight: 7, tier: 'C', value: 50 },
    // рыба A (тир выдачи — канал inventory.add, прецедент addItemQ M13)
    { t: 'item', id: 'sturgeon', qtyMin: 1, qtyMax: 1, weight: 5, tier: 'A', value: 55 },
    { t: 'item', id: 'zander', qtyMin: 1, qtyMax: 1, weight: 6, tier: 'A', value: 55 },
    // карта сокровищ (M07.2 F13 — живой деф)
    { t: 'item', id: 'treasure_map', qtyMin: 1, qtyMax: 1, weight: 6, tier: 'C', value: 50 },
    // травы/ягоды (M09-входы)
    { t: 'item', id: 'healing_herb', qtyMin: 2, qtyMax: 4, weight: 9, tier: 'C', value: 50 },
    { t: 'item', id: 'honey', qtyMin: 1, qtyMax: 2, weight: 8, tier: 'C', value: 50 },
  ],
};

/** шанс подарка при данном счастье (oracle-паритет; рантайм — через данные) */
export function giftChancePercent(gifts: VillageGiftsTable, happiness: number): number {
  const h = Math.max(0, Math.min(100, happiness));
  if (h >= gifts.happinessPivot) {
    const span = 100 - gifts.happinessPivot;
    return gifts.chanceBasePercent + (gifts.chanceHappinessBonusPercent * (h - gifts.happinessPivot)) / span;
  }
  return gifts.chanceBasePercent - (gifts.chanceHappinessMalusPercent * (gifts.happinessPivot - h)) / gifts.happinessPivot;
}
