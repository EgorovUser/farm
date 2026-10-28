/**
 * Депсы M16 (П4: модуль НЕ импортирует чужие модули — каналы приходят
 * колбэками app-слоя, паттерн PassivesModuleDeps/MineModuleDeps):
 *  - гейт (G1): уровень игрока + флаг ачивки «Мастер хутора» — витрины
 *    publicApi M01/M15 через ModuleRegistry (чтение, НЕ импорт);
 *  - unlock-гейты жителей: ConditionCtx строит сам модуль (stat — StatBus
 *    провайдера village.level, остальное — эти коллбэки);
 *  - поставка (G3): TransactionService (app-шов ctx.transaction — НЕ деп);
 *  - подарки (G7): выдача предметов с ТИРОМ — канал inventory.add
 *    (прецедент addItemQ M13) + проба вместимости canAcquire (D23);
 *  - помощь (G8): withVillagerEnergy — энергонейтральный вызов
 *    (прецедент withWorkerEnergy M11.2/M13.2) + витрины фермы/озера/загона
 *    для целеподбора (паттерн SystemViews WorkersDirector);
 *  - детерминизм: saveId (роллы потребностей dailySeed-каноном).
 */
import type { Result } from '@/shared/types/result';

export interface VillageViews {
  farmTabs(): Array<{
    id: string;
    tiles: Array<{ index: number; state: string; weeds: number; wet: boolean }>;
  }>;
  lakes(): Array<{ cleanliness: number; active: boolean; hungryCount: number }>;
  pens(): Array<{
    animals: Array<{ fedToday: boolean; pettedToday: boolean; cleanliness: number }>;
  }>;
}

export interface VillageModuleDeps {
  playerLevel(): number;
  hasFlag(flag: string): boolean;
  hasAchievement(id: string): boolean;
  skillLevel(skill: string): number;
  itemCount(defId: string): number;
  saveId(): string;
  /** выдача предмета с ТИРОМ (подарки-«рыба A»; канал inventory.add) */
  giveItem(defId: string, tier: string, value: number, qty: number, source: string): Result<unknown>;
  /** проба вместимости D23 перед предметным подарком */
  canAcquireItem(defId: string, qty: number): { fits: boolean; free: number; newEntries: number };
  /** энергетически нейтральный вызов исполнителя (G8 «бесплатно») */
  withVillagerEnergy(run: () => Result<unknown>): Result<unknown>;
  views: VillageViews;
}
