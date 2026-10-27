/**
 * Контракты app-шва модуля шахты (распил module.ts по wc-гигиене M12.2,
 * прецедент b4af909). Изоляция (01 §5–§7): модуль НЕ импортирует чужие
 * модули — все межмодульные каналы приходят колбэками витрин/оценщиков.
 */
import type { QualityTier } from '@/shared/types/ids';
import type { Result } from '@/shared/types/result';

/** витрина кирки (app-слой: M02 equipped + M10 заточка) */
export interface PickaxeView {
  hasPickaxe: boolean;
  defId: string | null;
  iid: string | null;
  /** эффективный тир: качество (D=1…SS=6) + floor(заточка/10) — канал M10 §2 */
  tier: number;
  quality: QualityTier | null;
  forgeLevel: number;
  name: string | null;
}

export interface MineModuleDeps {
  /** витрина M02: экипированный щит (слот 'shield') — чтение publicApi (П4) */
  shieldView(): { hasShield: boolean; tier: QualityTier | null };
  /** витрина M02+M10: экипированная кирка (слот 'pickaxe') + эффективный тир */
  pickaxeView(): PickaxeView;
  /** app-шов гейтов (прецедент shop N10): player.ctxExtras + quests.gateExtras */
  gateExtras(): Record<string, unknown>;
  /** app-шов (П4): количество defId в инвентаре (канон M04 — без экипированных) */
  itemCount(defId: string): number;
  /** износ кирки — inventory.wear (D35; −1 за победу с добычей, G4) */
  wear(iid: string, n: number): Result<{ before: number; current: number; max: number; broken: boolean }>;
  /** энергия входа — player.spendEnergy('action.mine.enter.energyCost') */
  spendEnterEnergy(reason: string): Result<{ cost: number; current: number; max: number }>;
  /** выдача предмета ТОЧНОГО тира (прецедент craft deliverOutput) */
  addItem(defId: string, tier: QualityTier, qty: number, source: string): Result<unknown>;
  /** проба вместимости (канон D23) */
  canAcquire(defId: string, qty: number): Result<{ fits: boolean; free: number; newEntries: number }>;
  /** HP игрока — публичный API M01 (player.checkHp) */
  playerHp(): { current: number; max: number };
  /** урон HP (player.damageHp — публикует player.hpChanged; смерть — тег death) */
  damageHp(amount: number, reason: string): void;
  /** лечение (player.healHp — cozy-правило HP := 1 после смерти) */
  healHp(amount: number, reason: string): void;
}
