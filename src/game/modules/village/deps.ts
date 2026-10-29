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
  /** [M16.2 · G4] записи рюкзака для выбора экземпляра снаряжения:
   *  транзакция изымает ХУДШИЕ-вперёд (D25) — снапшот берётся с того
   *  экземпляра, который реально будет списан (витрина inventory.list) */
  listBackpack(): Array<{ iid: string; defId: string; qty: number; tier: string; value: number }>;
  /** [M16.2 · G4] уровень заточки экземпляра (витрина forge.levelOf — M10
   *  хранит sharpening по iid в СВОЁМ срезе; чтение, НЕ импорт) */
  forgeLevelOf(iid: string): number;
  /** [M16.2 · G5] золото кошелька на момент рейда («склад дня» кражи) */
  walletGold(): number;
  /** [M16.3 · G6] покупка уникального товара: выдача с РОЛЛОМ качества —
   *  канал inventory.acquire (паттерн deliverItem магазина C4; после
   *  D23-пробы гарантирован); source — для журнала */
  acquireItem(defId: string, qty: number, source: string): Result<{ iids: string[]; entries: number; quality: { tier: string; value: number } }>;
}
