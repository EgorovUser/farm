/**
 * Self-checks M04.1 — магазин (группа-оркестратор; сами проверки разложены
 * по частям 01 §6: файл превысил 500 строк):
 *  - shop-rotation-part.ts — ротация §2 (состав/детерминизм/30%/скидки/капы)
 *  - shop-purchase-part.ts — покупки §5 (гейты §4, атомарность §7.5, C4)
 *  - shop-save-part.ts — экономика/прогрессия/сейв v6/ветки/C3/C5
 * Имя группы и имена чеков неизменны (вывод selftest стабилен).
 */
import { group, type CheckGroup } from './types';
import { shopRotationChecks } from './shop-rotation-part';
import { shopPurchaseChecks } from './shop-purchase-part';
import { shopSaveChecks } from './shop-save-part';

export async function runShopChecks(): Promise<CheckGroup> {
  const results = [
    ...(await shopRotationChecks()),
    ...(await shopPurchaseChecks()),
    ...(await shopSaveChecks()),
  ];
  return group('M04 · Магазин: ротация и покупки (§2/§4/§5)', results);
}
