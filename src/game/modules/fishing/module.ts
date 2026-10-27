/**
 * FishingModule (M07.1) — каркас и монтаж (карточка M07, бриф §3.2).
 *
 * Изоляция (01 §5–§7): модуль не импортирует другие модули; контент —
 * чтение общих реестров (П4 п.6); энергия/выдача/экипировка/износ/роллы —
 * колбэки app-слоя через ModuleRegistry (паттерн pen, прецеденты D33/D38/C4):
 *   withEnergy → player.withEnergy; acquire/probeCapacity/equippedView/
 *   unequip/equip/wear → inventory.*; rollItem/applyRolls → modforge.*;
 *   gateExtras → player.ctxExtras + quests.gateExtras (N10-прецедент —
 *   гейт-условия рыб читают ачивки, уровень).
 * Золото покупок и расход наживки — ТОЛЬКО TransactionService.
 *
 * События (каталог 02 §4, строки с фазы 0): cast.completed {категория,
 * defId, вес/качество} + fish.caught {defId, редкость, качество, qty,
 * weightGrams} — XP игрока/навыка «Рыболовство» (+8, таблицы M01 с фазы 1)
 * и счётчик fish.total (конфиг ядра) поднимаются событиями автоматически.
 *
 * Таймеров НЕТ (F2) — sweep не требуется: срез — только счётчики.
 */
import type { GameModule, ModuleContext } from '@/game/module-registry';
import type { StatId, ID, QualityTier, Rarity } from '@/shared/types/ids';
import type { Result } from '@/shared/types/result';
import type { RolledModEntry } from '@/shared/types/rolled-mod';
import type { DropCategoryDef, FishDef, TrashDef, ChestEntryDef, FishingEventDef, TreasureMapEntryDef, TreasureMapEventDef } from '@/content/fishing/fish';
import type { RodShopDef } from '@/content/fishing/rods';
import type { BaitShopDef } from '@/content/fishing/baits';
import type { FishingTable } from '@/content/balance/fishing';
import { createFishingManifest } from './manifest';
import { defaultFishState, fishingSaveSlice, type FishState } from './state';
import { makeBaitProvider, BAIT_PROVIDER_ID, type EquippedEntryView } from './logic/bait-provider';
import { CastService, type CastReceipt } from './cast';
import type { ChoiceReceipt, TreasureReceipt } from './logic/event-resolve';
import { FishingShop, type BuyReceipt } from './shop';
import {
  buildFishingStateView,
  buildFishingTablesView,
  buildFishingAlbumView,
  type FishingStateView,
  type FishingTablesView,
  type FishingAlbumView,
} from './view';

export interface FishingModuleDeps {
  gateExtras(): Record<string, unknown>;
  withEnergy(stat: StatId, action: () => Result<unknown>, reason?: string): Result<unknown>;
  /** app-слой: inventory.equipped (D30-вид) */
  equippedView(): Array<EquippedEntryView>;
  /** app-слой: inventory.acquire (D23) */
  acquire(defId: ID, qty: number, source: string): Result<{ quality: { tier: QualityTier; value: number }; iids: ID[] }>;
  /** app-слой: inventory.canAcquire (проба вместимости) */
  probeCapacity(defId: ID, qty: number): Result<{ fits: boolean; free: number; newEntries: number }>;
  /** app-слой: inventory.unequip / equip */
  unequip(slot: ID): Result<unknown>;
  equip(iid: ID, slot: ID): Result<unknown>;
  /** app-слой: первая запись defId в рюкзаке (авто-пополнение слота наживки) */
  findEntryByDef(defId: ID): ID | null;
  /** app-слой: inventory.wear (D35) */
  wear(iid: ID, n: number): Result<{ current: number; max: number; broken: boolean }>;
  /** [M07.2 · F13] app-слой: inventory.remove (расход карты при «Открыть») */
  removeItem(defId: ID, qty: number, source: string): Result<unknown>;
  /** [M07.2 · F14] app-слой: skills.addXp (исход skillXp событий) */
  grantSkillXp(skill: ID, amount: number, source: string): void;
  /** app-слой: modforge.rollItem (стартовые роллы удочки) */
  rollItem(defId: ID, streamKey: string, target: { kind: 'item'; refId: ID }): Result<{ rolls: RolledModEntry[] }>;
  /** app-слой: inventory.setRolls */
  applyRolls(iid: ID, rolls: RolledModEntry[]): Result<unknown>;
  /** app-слой: количество defId у игрока ЦЕЛИКОМ (канон M04) */
  itemCount(defId: ID): number;
}

export class FishingModule implements GameModule {
  readonly manifest = createFishingManifest();
  api: Record<string, (...args: unknown[]) => unknown> = {};
  private state: FishState = defaultFishState();
  private readonly moduleDeps: FishingModuleDeps;
  private detach: (() => void) | null = null;

  constructor(deps: FishingModuleDeps) {
    this.moduleDeps = deps;
  }

  activate(ctx: ModuleContext): void {
    const { save, content, time, statBus, transaction } = ctx;
    const table = content.get<FishingTable>('fishing');
    const categories = content.get<DropCategoryDef[]>('fishing.categories');
    const fish = content.get<FishDef[]>('fishing.fish');
    const trash = content.get<TrashDef[]>('fishing.trash');
    const chest = content.get<ChestEntryDef[]>('fishing.chest');
    const events = content.get<FishingEventDef[]>('fishing.events');
    const riverFish = content.get<FishDef[]>('fishing.river');
    const treasureMap = content.get<TreasureMapEntryDef[]>('fishing.treasureMap');
    const treasureEvent = content.get<TreasureMapEventDef>('fishing.treasureEvent');
    const rods = content.get<RodShopDef[]>('fishing.rods');
    const baits = content.get<BaitShopDef[]>('fishing.baits');
    // [M07.2 · F12] пул рыб по локации (мусор/события/веса — общие)
    const fishOf = (location: string): readonly FishDef[] =>
      location === 'river' ? riverFish : fish;

    save.registerSlice(
      'fishing',
      fishingSaveSlice(
        () => this.state,
        (s) => {
          this.state = s;
        },
      ),
    );

    // F2: baitProvider — статы-моды активной наживки (удочка — через
    // существующий equipmentProvider M02: baseStats дефа в слоте «Удочка»)
    statBus.registerProvider(
      makeBaitProvider({ equippedView: () => this.moduleDeps.equippedView(), baits }),
    );

    const tryItem = (defId: ID): { name: string; rarity: Rarity } | undefined => {
      const def = ctx.content.get<Array<{ id: ID; name: string; rarity: Rarity }>>('items')?.find(
        (i) => i.id === defId,
      );
      return def;
    };
    // [M07.2 · F10] имена ачивок для гейт-текстов (реестр M15 данными)
    const achievements = content.get<Array<{ id: ID; name: string }>>('quests.achievements') ?? [];
    const tryAchievement = (id: ID): string | undefined =>
      achievements.find((a) => a.id === id)?.name;

    const viewDeps = {
      statBus,
      time,
      table,
      categories,
      trash,
      chest,
      events,
      rods,
      baits,
      tryItem,
      tryAchievement,
      fishOf,
      equippedView: () => this.moduleDeps.equippedView(),
      itemCount: (defId: ID) => this.moduleDeps.itemCount(defId),
      gateExtras: () => this.moduleDeps.gateExtras(),
      getState: () => this.state,
    };

    // [M07.2 · F13/F14] dev fish.choice — одноразовая подмена выбора
    // события-мини/«Клада» (пробы «Спрятать»/«Продать» до фазы 6)
    let devChoice: string | null = null;
    const cast = new CastService({
      bus: ctx.bus,
      rngBus: ctx.rngBus,
      statBus,
      transaction,
      time,
      save,
      table,
      categories,
      trash,
      chest,
      events,
      rods,
      fishOf,
      treasureMap,
      treasureEvent,
      equippedView: () => this.moduleDeps.equippedView(),
      acquire: (defId, qty, source) => this.moduleDeps.acquire(defId, qty, source),
      probeCapacity: (defId, qty) => this.moduleDeps.probeCapacity(defId, qty),
      unequip: (slot) => this.moduleDeps.unequip(slot),
      equip: (iid, slot) => this.moduleDeps.equip(iid, slot),
      findEntryByDef: (defId) => this.moduleDeps.findEntryByDef(defId),
      removeItem: (defId, qty, source) => this.moduleDeps.removeItem(defId, qty, source),
      wear: (iid, n) => this.moduleDeps.wear(iid, n),
      grantSkillXp: (skill, amount, source) => this.moduleDeps.grantSkillXp(skill, amount, source),
      popChoice: () => {
        const c = devChoice;
        devChoice = null;
        return c;
      },
      tryItem,
      gateExtras: () => this.moduleDeps.gateExtras(),
      withEnergy: (stat, action, reason) => this.moduleDeps.withEnergy(stat, action, reason),
      getState: () => this.state,
      setState: (s) => {
        this.state = s;
      },
    });

    const shop = new FishingShop({
      transaction,
      save,
      rods,
      baits,
      acquire: (defId, qty, source) => this.moduleDeps.acquire(defId, qty, source),
      probeCapacity: (defId, qty) => this.moduleDeps.probeCapacity(defId, qty),
      rollItem: (defId, streamKey, target) => this.moduleDeps.rollItem(defId, streamKey, target),
      applyRolls: (iid, rolls) => this.moduleDeps.applyRolls(iid, rolls),
      tryItem,
    });

    // [M07.2 · F16] исполнитель TaskRegistry — тонкая обёртка publicApi
    // (паттерн pen.* M06.2); worker.actionDone НЕ публикуется — домен M11
    ctx.tasks.register(
      'fishing.cast',
      (() => ({
        label: 'заброс удочки (текущая локация)',
        run: (taskCtx: { params?: Record<string, unknown> }): Result<{ message: string }> => {
          const loc = typeof taskCtx.params?.location === 'string' ? taskCtx.params.location : undefined;
          const r = cast.cast(loc);
          return r.ok ? { ok: true, value: { message: 'fishing.cast: ok' } } : r;
        },
      }))(),
    );

    this.detach = () => {
      statBus.unregisterProvider(BAIT_PROVIDER_ID);
      if (ctx.tasks.has('fishing.cast')) ctx.tasks.unregister('fishing.cast');
    };

    this.api = {
      'fish.state': (): FishingStateView => buildFishingStateView(viewDeps),
      'fish.tables': (): FishingTablesView => buildFishingTablesView(viewDeps),
      // [M07.2 · F10] витрина альбома («гейты показываем»)
      'fish.album': (): FishingAlbumView => buildFishingAlbumView(viewDeps),
      'fish.cast': (location?: unknown, _unused?: unknown): Result<CastReceipt> =>
        cast.cast(location === undefined ? undefined : String(location)),
      'fish.buy': (id: unknown, qty?: unknown): Result<BuyReceipt> =>
        shop.buy(String(id), qty === undefined ? 1 : Number(qty)),
      // [M07.2 · F12] переход локации (гейт навыка — данные)
      'fish.location': (loc?: unknown): Result<{ location: string }> =>
        loc === undefined
          ? { ok: true, value: { location: this.state.location } }
          : cast.setLocation(String(loc)),
      // --- dev: форс результата заброса (карточка §6) — полный каст
      //     с принудительной рыбой/сундуком/событием (косты честны; гейты
      //     пула игнорируются — dev-семантика «принудить»)
      'fish.force': (spec: unknown): Result<CastReceipt> => cast.cast(undefined, String(spec)),
      // --- dev [M07.2 · F13/F14]: одноразовая подмена выбора события-мини
      'fish.choice': (choice?: unknown): { set: string | null } => {
        devChoice = choice === undefined || choice === '' ? null : String(choice);
        return { set: devChoice };
      },
    };
  }

  deactivate(): void {
    this.detach?.();
    this.detach = null;
  }

  getState(): FishState {
    return this.state;
  }
}

export type { CastReceipt, BuyReceipt, FishingStateView, FishingTablesView, FishingAlbumView, ChoiceReceipt, TreasureReceipt };
