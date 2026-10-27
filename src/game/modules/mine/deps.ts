/**
 * Контракты app-шва модуля шахты (распил module.ts по wc-гигиене M12.2,
 * прецедент b4af909). Изоляция (01 §5–§7): модуль НЕ импортирует чужие
 * модули — все межмодульные каналы приходят колбэками витрин/оценщиков.
 *
 * [M13.1] новые швы (заявлены поимённо в отчёте): saveId — детерминизм сида
 * генерации hash(saveId, layer, runNumber); addItemQ — выдача ТОЧНОГО
 * качества (канон inventory.add с value, для runBag-выдачи); acquireItem —
 * покупка крота (D23-канон M04: acquire роллит качество + enforceCapacity);
 * addXp — «пустая пещера» (публичный API M01, П4); addBuff/listBuffs/
 * removeBuff — штатный Buff-канал ядра kernel.buff (BUF-1: зелья крота;
 * очистка runs-бафов при runEnded — API владельца, канон 02 §2).
 */
import type { QualityTier } from '@/shared/types/ids';
import type { Result } from '@/shared/types/result';
import type { Modifier } from '@/kernel/bus/stat-bus/modifier';

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
  /** [M13.1] выдача ТОЧНОГО качества (тир + дробное value) — runBag-выдача */
  addItemQ(defId: string, tier: QualityTier, value: number, qty: number, source: string): Result<unknown>;
  /** [M13.1] покупка крота: D23-канон M04 — acquire роллит качество, кап соблюдён */
  acquireItem(defId: string, qty: number, source: string): Result<unknown>;
  /** [M13.1] XP «пустой пещеры» — публичный API M01 (П4: player.addXp) */
  addXp(amount: number, reason: string): void;
  /** [M13.1] штатный Buff-канал ядра (BUF-1: зелья крота, duration runs) */
  addBuff(mod: Modifier): Result<string>;
  /** [M13.1] список бафов канала (очистка runs-бафов при runEnded) */
  listBuffs(): Array<{ mod: Modifier; addedAt: number }>;
  /** [M13.1] снятие бафа канала по id (API владельца, канон 02 §2) */
  removeBuff(id: string): boolean;
  /** [M13.1] saveId — детерминизм сида генерации (карточка §3) */
  saveId(): string;
  /** проба вместимости (канон D23) */
  canAcquire(defId: string, qty: number): Result<{ fits: boolean; free: number; newEntries: number }>;
  /** HP игрока — публичный API M01 (player.checkHp) */
  playerHp(): { current: number; max: number };
  /** урон HP (player.damageHp — публикует player.hpChanged; смерть — тег death) */
  damageHp(amount: number, reason: string): void;
  /** лечение (player.healHp — cozy-правило HP := 1 после смерти) */
  healHp(amount: number, reason: string): void;
}
