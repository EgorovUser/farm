/**
 * Предзабросная проверка снасти (M07.1, F6): чтение слотов «Удочка»/
 * «Активная наживка» и честные отказы с причинами (нет удочки / сломана /
 * нет наживки). Чистые функции над D30-видом экипировки.
 */
import type { EquippedEntryView } from './bait-provider';
import type { ID, Rarity } from '@/shared/types/ids';
import { err, ok, type Result } from '@/shared/types/result';

export interface GearInfo {
  rodView: EquippedEntryView;
  rodDef: { name: string; rarity: Rarity };
  baitView: EquippedEntryView;
  baitName: string;
}

/** прочность записи (носители рождаются с полем; дефолт — целая) */
export function durabilityCurrent(view: EquippedEntryView): number | undefined {
  return (view.entry as unknown as { durability?: { current: number } }).durability?.current;
}

/** проверить снасть перед забросом (порядок отказов — честные причины) */
export function checkGear(deps: {
  equippedView(): Array<EquippedEntryView>;
  tryItem(defId: ID): { name: string; rarity: Rarity } | undefined;
}): Result<GearInfo> {
  const equipped = deps.equippedView();
  const rodView = equipped.find((e) => e.slot === 'rod');
  const baitView = equipped.find((e) => e.slot === 'bait');
  if (!rodView) {
    return err('нет удочки: слот «Удочка» пуст (fish.buy bamboo_rod → inv equip <iid> rod)');
  }
  const rodDef = deps.tryItem(rodView.entry.defId);
  if (!rodDef) return err(`удочка ${rodView.entry.defId} не найдена в каталоге предметов`);
  const rodDur = durabilityCurrent(rodView);
  if (rodDur !== undefined && rodDur <= 0) {
    return err(
      `удочка «${rodDef.name}» сломана (прочность 0): заброс заблокирован, ремонт — наковальня M09 (craft.repair)`,
    );
  }
  if (!baitView) {
    return err('нет наживки: слот «Активная наживка» пуст (fish.buy worm_bait → inv equip <iid> bait)');
  }
  const baitDef = deps.tryItem(baitView.entry.defId);
  if (!baitDef) return err(`наживка ${baitView.entry.defId} не найдена в каталоге предметов`);
  return ok({ rodView, rodDef, baitView, baitName: baitDef.name });
}
