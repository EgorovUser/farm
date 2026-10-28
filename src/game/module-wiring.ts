/**
 * Монтаж игровых модулей (вынесено из bootstrap.ts по правилу 01-CORE §6:
 * файл превысил 300 строк при касании M04.1 — сборка ядра и монтаж модулей
 * разные ответственности).
 *
 * Здесь — ЕДИНСТВЕННОЕ место, где модули знают друг о друге: колбэки
 * app-слоя вайрятся через ModuleRegistry (П4: прямые импорты запрещены;
 * прецеденты D33 applyUseEffect, D38 getSubject/applyRolls).
 *
 * [M04.1 · C4] каналы магазина: deliverItem → inventory.acquire (D23),
 * probeCapacity → inventory.canAcquire (проба до оплаты), rollItem →
 * modforge.rollItem (именованный стрим shop:issue:N), applyRolls →
 * inventory.setRolls; saveId — детерминизм ротации (карточка §2).
 */
import type { GameDirector } from './game-director';
import type { ModuleRegistry } from './module-registry';
import type { ContentRegistry } from '@/kernel/content/content-registry';
import type { SaveDirector } from '@/kernel/save/save-director';
import type { WalletService } from '@/kernel/services/wallet/wallet-service';
import type { BuffService } from '@/kernel/services/buff/buff-service';
import { PlayerModule } from './modules/player/module';
import { InventoryModule } from './modules/inventory/module';
import { ModForgeModule } from './modules/modforge/module';
import { ShopModule } from './modules/shop/module';
import { CraftModule } from './modules/craft/module';
import { ForgeModule } from './modules/forge/module';
import { FarmModule } from './modules/farm/module';
import { PenModule } from './modules/pen/module';
import { FishingModule } from './modules/fishing/module';
import { LakeModule } from './modules/lake/module';
import { WorkersModule } from './modules/workers/module';
import { MineModule } from './modules/mine/module';
import { PassivesModule } from './modules/passives/module';
// [M16.1] Деревня: монтаж ПОСЛЕ passives ДО quests (бриф §0 — ЯВНО
// санкционировано, прецедент M14.1)
import { VillageModule } from './modules/village/module';
import { QuestsModule } from './modules/quests/module';
import type { DeliverReceipt } from './modules/shop/purchase';
import type { PlayerTable } from '@/content/player/progression';
import type { SkillDef } from '@/content/player/skills';
import type { CounterDef } from '@/content/player/counters';
import type { RolledModEntry } from '@/shared/types/rolled-mod';
import type { AcquireReceipt } from './modules/inventory/store';
import type { Result } from '@/shared/types/result';
import type { CurrencyId, ID, QualityTier, StatId } from '@/shared/types/ids';
import type { StationViewRow } from './modules/craft/stations';
import { effectiveQualityOf } from './modules/forge/outcome';
import type { ForgeTable } from '@/content/balance/forging';

export function wireGameModules(
  director: GameDirector,
  modules: ModuleRegistry,
  content: ContentRegistry,
  save: SaveDirector,
  wallet: WalletService,
  // [M13.1] Buff-канал ядра + часы: швы mine (зелья крота — kernel.buff,
  // BUF-1; expiresAt — абсолютной датой от now)
  buffs: BuffService,
  now: () => number,
): void {
  // --- M01 «Игрок»: активируется ДО init/load — срез и подписки должны
  //     стоять до save.load() (иначе реген пропустит оффлайн-досчёт)
  modules.register(
    new PlayerModule(
      content.get<PlayerTable>('player.progression'),
      content.get<SkillDef[]>('player.skills'),
      content.get<CounterDef[]>('player.counters'),
    ),
  );
  director.activate('player');

  // --- M02 «Инвентарь»: подмена ItemPort (D17) в activate; гейт-контекст и
  //     канал эффектов useAction — через публичный API игрока (П4);
  //     [M10.1 · шов §4.5] statScaleOf/effectiveTierOf — заточка в статах/цене
  //     (forge через ModuleRegistry; до активации forge — дефолты 1/identity)
  modules.register(
    new InventoryModule({
      gateExtras: () =>
        (modules.call('player', 'player.ctxExtras') ?? {}) as Record<string, unknown>,
      applyUseEffect: (t, value, reason) => {
        if (t === 'grantEnergy') modules.call('player', 'player.grantEnergy', value, reason);
        else modules.call('player', 'player.grantHp', value, reason);
      },
      statScaleOf: (iid) =>
        (modules.call('forge', 'forge.statScale', iid) as number | undefined) ?? 1,
      effectiveTierOf: (iid, tier) =>
        (modules.call('forge', 'forge.effectiveTier', iid, tier) as QualityTier | undefined) ?? tier,
    }),
  );
  director.activate('inventory');

  // --- M03 «Модфордж»: доступ к предмету реролл-цикла — колбэки app-слоя
  //     (прецедент D33); [M04.1 · C6] saveId — стабильный сид реролла
  modules.register(
    new ModForgeModule({
      getSubject: (iid) => {
        const items = (modules.call('inventory', 'inventory.list') ?? []) as Array<{
          iid: string;
          defId: string;
          rolledMods: RolledModEntry[];
        }>;
        const it = items.find((e) => e.iid === iid);
        return it ? { defId: it.defId, rolls: it.rolledMods } : null;
      },
      applyRolls: (iid, rolls) =>
        (modules.call('inventory', 'inventory.setRolls', iid, rolls) ?? {
          ok: false as const,
          error: 'модуль инвентаря недоступен',
        }) as Result<unknown>,
      saveId: () => save.getSaveId(),
    }),
  );
  director.activate('modforge');

  // --- M04 «Магазин» (фаза 2): выдача/роллы/гейты — колбэки app-слоя (П4);
  //     itemCount — по рюкзаку (inventory.list; equipped-записи гейтами
  //     покупки не учитываются — владение уже состоявшейся выдачей)
  //     [M15.2 · N10] gateExtras: гейты ассортимента читают флаги/ачивки M15
  //     (unlock на строке пула/ItemDef → Requirement-оценщик → hasFlag/
  //     hasAchievement из extras) — шов app-слоя, логика M04 не тронута
  modules.register(
    new ShopModule({
      deliverItem: (defId, qty, source) =>
        (modules.call('inventory', 'inventory.acquire', defId, qty, source) ?? {
          ok: false as const,
          error: 'модуль инвентаря недоступен',
        }) as Result<DeliverReceipt>,
      probeCapacity: (defId, qty) =>
        (modules.call('inventory', 'inventory.canAcquire', defId, qty) ?? {
          ok: false as const,
          error: 'модуль инвентаря недоступен',
        }) as Result<{ fits: boolean; free: number; newEntries: number }>,
      rollItem: (defId, streamKey) =>
        (modules.call('modforge', 'modforge.rollItem', defId, streamKey) ?? {
          ok: false as const,
          error: 'модуль модфорджа недоступен',
        }) as Result<{ rolls: RolledModEntry[] }>,
      applyRolls: (iid, rolls) =>
        (modules.call('inventory', 'inventory.setRolls', iid, rolls) ?? {
          ok: false as const,
          error: 'модуль инвентаря недоступен',
        }) as Result<unknown>,
      gateExtras: () =>
        ({
          ...(modules.call('player', 'player.ctxExtras') ?? {}),
          ...(modules.call('quests', 'quests.gateExtras') ?? {}),
        }) as Record<string, unknown>,
      itemCount: (defId) => {
        const items = (modules.call('inventory', 'inventory.list') ?? []) as Array<{
          defId: string;
          qty: number;
        }>;
        return items.filter((i) => i.defId === defId).reduce((s, i) => s + i.qty, 0);
      },
      saveId: () => save.getSaveId(),
    }),
  );
  director.activate('shop');

  // --- M09 «Крафт» (фаза 2): выдача/роллы/энергия/гейты/ремонт — колбэки
  //     app-слоя (П4, прецеденты D33/D38/C4); walletGet — чтение для плана
  //     входов (списание — только TransactionService)
  modules.register(
    new CraftModule({
      listItems: () =>
        (modules.call('inventory', 'inventory.list') ?? []) as Array<{
          iid: ID;
          defId: ID;
          qty: number;
          quality: { tier: QualityTier; value: number };
          durability?: { current: number; max: number };
        }>,
      walletGet: (id) => wallet.get(id as CurrencyId),
      deliverOutput: (defId, tier, value, qty, source) =>
        (modules.call('inventory', 'inventory.add', defId, tier, value, qty, source) ?? {
          ok: false as const,
          error: 'модуль инвентаря недоступен',
        }) as Result<AcquireReceipt>,
      probeCapacity: (defId, qty) =>
        (modules.call('inventory', 'inventory.canAcquire', defId, qty) ?? {
          ok: false as const,
          error: 'модуль инвентаря недоступен',
        }) as Result<{ fits: boolean; free: number; newEntries: number }>,
      rollItem: (defId, streamKey) =>
        (modules.call('modforge', 'modforge.rollItem', defId, streamKey) ?? {
          ok: false as const,
          error: 'модуль модфорджа недоступен',
        }) as Result<{ rolls: RolledModEntry[] }>,
      applyRolls: (iid, rolls) =>
        (modules.call('inventory', 'inventory.setRolls', iid, rolls) ?? {
          ok: false as const,
          error: 'модуль инвентаря недоступен',
        }) as Result<unknown>,
      gateExtras: () =>
        (modules.call('player', 'player.ctxExtras') ?? {}) as Record<string, unknown>,
      withEnergy: (stat: StatId, action: () => Result<unknown>, reason?: string) =>
        (modules.call('player', 'player.withEnergy', stat, action, reason) ?? {
          ok: false as const,
          error: 'модуль игрока недоступен',
        }) as Result<unknown>,
      setDurability: (iid, current) =>
        (modules.call('inventory', 'inventory.dur', iid, current) ?? {
          ok: false as const,
          error: 'модуль инвентаря недоступен',
        }) as Result<{ iid: ID; current: number; max: number }>,
    }),
  );
  director.activate('craft');

  // --- M10 «Заточка» (фаза 2): рюкзак/витрина станций/гейты — колбэки
  //     app-слоя (П4, прецедент D38/C4); наковальня — через api craft.stations
  //     («вкладка ЗАТОЧКИ у наковальни» карточки M09 §2 — вызов, не импорт);
  //     [M10.2 · §5] карточные каналы: modforge.rollFor (бюджет 4×L, теги
  //     card:forge, target R4) + inventory.setRolls (append выбранной карточки)
  modules.register(
    new ForgeModule({
      listItems: () =>
        (modules.call('inventory', 'inventory.list') ?? []) as Array<{
          iid: ID;
          defId: ID;
          quality: { tier: QualityTier; value: number };
          rolledMods?: RolledModEntry[];
        }>,
      craftStationBuilt: (id) =>
        ((modules.call('craft', 'craft.stations') ?? []) as StationViewRow[]).some(
          (s) => s.id === id && s.built,
        ),
      gateExtras: () =>
        (modules.call('player', 'player.ctxExtras') ?? {}) as Record<string, unknown>,
      rollFor: (req) =>
        (modules.call('modforge', 'modforge.rollFor', req) ?? {
          ok: false as const,
          error: 'модуль модфорджа недоступен',
        }) as Result<{ rolls: RolledModEntry[]; detail: { budget: number; refund: number; spent: number } }>,
      applyRolls: (iid, rolls) =>
        (modules.call('inventory', 'inventory.setRolls', iid, rolls) ?? {
          ok: false as const,
          error: 'модуль инвентаря недоступен',
        }) as Result<unknown>,
    }),
  );
  director.activate('forge');

  // --- M05 «Ферма» (фаза 3): энергия/семя/урожай/вместимость — колбэки
  //     app-слоя (П4, паттерн craft — прецеденты D33/D38/C4); удобрение —
  //     валюта кошелька, модуль проводит её сам через TransactionService
  //     из контекста активации; гейты культур — player.ctxExtras
  //     [M05.3 · G6] + quests.gateExtras (N10-прецедент магазина): гейт
  //     солнечника читает ачивку «Агроном» (achievement:<id> из флагов M15)
  modules.register(
    new FarmModule({
      gateExtras: () =>
        ({
          ...(modules.call('player', 'player.ctxExtras') ?? {}),
          ...(modules.call('quests', 'quests.gateExtras') ?? {}),
        }) as Record<string, unknown>,
      withEnergy: (stat, action, reason) =>
        (modules.call('player', 'player.withEnergy', stat, action, reason) ?? {
          ok: false as const,
          error: 'модуль игрока недоступен',
        }) as Result<unknown>,
      removeSeed: (defId, qty, source) =>
        (modules.call('inventory', 'inventory.remove', defId, qty, source) ?? {
          ok: false as const,
          error: 'модуль инвентаря недоступен',
        }) as Result<unknown>,
      deliverCrop: (defId, tier, value, qty, source) =>
        (modules.call('inventory', 'inventory.add', defId, tier, value, qty, source) ?? {
          ok: false as const,
          error: 'модуль инвентаря недоступен',
        }) as Result<unknown>,
      probeCapacity: (defId, qty) =>
        (modules.call('inventory', 'inventory.canAcquire', defId, qty) ?? {
          ok: false as const,
          error: 'модуль инвентаря недоступен',
        }) as Result<{ fits: boolean; free: number; newEntries: number }>,
    }),
  );
  director.activate('farm');

  // --- M06 «Загон» (фаза 3): энергия/выдача продукции/вместимость — колбэки
  //     app-слоя (П4, паттерн фермы — прецеденты D33/D38/C4); золото покупки
  //     и Корм — модуль проводит сам через TransactionService из контекста
  //     активации; гейты животных — player.ctxExtras + quests.gateExtras
  //     (N10-прецедент: гейт Свиньи читает ачивку «Грибник»)
  modules.register(
    new PenModule({
      gateExtras: () =>
        ({
          ...(modules.call('player', 'player.ctxExtras') ?? {}),
          ...(modules.call('quests', 'quests.gateExtras') ?? {}),
        }) as Record<string, unknown>,
      withEnergy: (stat, action, reason) =>
        (modules.call('player', 'player.withEnergy', stat, action, reason) ?? {
          ok: false as const,
          error: 'модуль игрока недоступен',
        }) as Result<unknown>,
      deliverProduct: (defId, tier, value, qty, source) =>
        (modules.call('inventory', 'inventory.add', defId, tier, value, qty, source) ?? {
          ok: false as const,
          error: 'модуль инвентаря недоступен',
        }) as Result<unknown>,
      probeCapacity: (defId, qty) =>
        (modules.call('inventory', 'inventory.canAcquire', defId, qty) ?? {
          ok: false as const,
          error: 'модуль инвентаря недоступен',
        }) as Result<{ fits: boolean; free: number; newEntries: number }>,
    }),
  );
  director.activate('pen');

  // --- M07 «Рыбалка» (фаза 3): энергия/выдача/экипировка/износ/роллы —
  //     колбэки app-слоя (П4, паттерн pen — прецеденты D33/D38/C4); золото
  //     покупок и расход наживки модуль проводит сам через TransactionService
  //     из контекста активации; гейт-условия рыб — player.ctxExtras +
  //     quests.gateExtras (N10-прецедент); событие fish.caught поднимает
  //     XP/навык/счётчики таблицами M01 с фазы 1 — без вайринга
  modules.register(
    new FishingModule({
      gateExtras: () =>
        ({
          ...(modules.call('player', 'player.ctxExtras') ?? {}),
          ...(modules.call('quests', 'quests.gateExtras') ?? {}),
        }) as Record<string, unknown>,
      withEnergy: (stat, action, reason) =>
        (modules.call('player', 'player.withEnergy', stat, action, reason) ?? {
          ok: false as const,
          error: 'модуль игрока недоступен',
        }) as Result<unknown>,
      equippedView: () =>
        (modules.call('inventory', 'inventory.equipped') ?? []) as Array<{
          slot: string;
          slotName: string;
          entry: { iid: ID; defId: ID; qty: number };
        }>,
      acquire: (defId, qty, source) =>
        (modules.call('inventory', 'inventory.acquire', defId, qty, source) ?? {
          ok: false as const,
          error: 'модуль инвентаря недоступен',
        }) as Result<{ quality: { tier: QualityTier; value: number }; iids: ID[] }>,
      probeCapacity: (defId, qty) =>
        (modules.call('inventory', 'inventory.canAcquire', defId, qty) ?? {
          ok: false as const,
          error: 'модуль инвентаря недоступен',
        }) as Result<{ fits: boolean; free: number; newEntries: number }>,
      unequip: (slot) =>
        (modules.call('inventory', 'inventory.unequip', slot) ?? {
          ok: false as const,
          error: 'модуль инвентаря недоступен',
        }) as Result<unknown>,
      equip: (iid, slot) =>
        (modules.call('inventory', 'inventory.equip', iid, slot) ?? {
          ok: false as const,
          error: 'модуль инвентаря недоступен',
        }) as Result<unknown>,
      findEntryByDef: (defId) => {
        const items = (modules.call('inventory', 'inventory.list') ?? []) as Array<{
          iid: ID;
          defId: string;
        }>;
        return items.find((i) => i.defId === defId)?.iid ?? null;
      },
      wear: (iid, n) =>
        (modules.call('inventory', 'inventory.wear', iid, n) ?? {
          ok: false as const,
          error: 'модуль инвентаря недоступен',
        }) as Result<{ current: number; max: number; broken: boolean }>,
      // [M07.2 · F13] расход карты при «Открыть сейчас» (штатный канал M02)
      removeItem: (defId, qty, source) =>
        (modules.call('inventory', 'inventory.remove', defId, qty, source) ?? {
          ok: false as const,
          error: 'модуль инвентаря недоступен',
        }) as Result<unknown>,
      // [M07.2 · F14] исход skillXp событий-мини (publicApi M01)
      grantSkillXp: (skill, amount, source) => {
        modules.call('player', 'skills.addXp', skill, amount, source);
      },
      rollItem: (defId, streamKey, target) =>
        (modules.call('modforge', 'modforge.rollItem', defId, streamKey, target) ?? {
          ok: false as const,
          error: 'модуль модфорджа недоступен',
        }) as Result<{ rolls: RolledModEntry[] }>,
      applyRolls: (iid, rolls) =>
        (modules.call('inventory', 'inventory.setRolls', iid, rolls) ?? {
          ok: false as const,
          error: 'модуль инвентаря недоступен',
        }) as Result<unknown>,
      itemCount: (defId) => {
        const items = (modules.call('inventory', 'inventory.list') ?? []) as Array<{
          defId: string;
          qty: number;
        }>;
        return items.filter((i) => i.defId === defId).reduce((s, i) => s + i.qty, 0);
      },
    }),
  );
  director.activate('fishing');

  // --- M08 «Озеро» (фаза 3): энергия/инвентарь — колбэки app-слоя (П4,
  //     паттерн pen/fishing — прецеденты D33/D38/C4); Корм/золото/лекарство —
  //     модуль проводит сам через TransactionService из контекста активации;
  //     дефы рыб — чтение общих таблиц контента (без импорта fishing);
  //     монтаж ПОСЛЕ fishing ДО quests (бриф F2, прецедент pen → fishing)
  modules.register(
    new LakeModule({
      withEnergy: (stat, action, reason) =>
        (modules.call('player', 'player.withEnergy', stat, action, reason) ?? {
          ok: false as const,
          error: 'модуль игрока недоступен',
        }) as Result<unknown>,
      listInventory: () =>
        (modules.call('inventory', 'inventory.list') ?? []) as Array<{
          iid: ID;
          defId: ID;
          qty: number;
          quality: { tier: QualityTier; value: number };
        }>,
      removeItem: (defId, qty, source) =>
        (modules.call('inventory', 'inventory.remove', defId, qty, source) ?? {
          ok: false as const,
          error: 'модуль инвентаря недоступен',
        }) as Result<unknown>,
      deliverFish: (defId, tier, value, qty, source) =>
        (modules.call('inventory', 'inventory.add', defId, tier, value, qty, source) ?? {
          ok: false as const,
          error: 'модуль инвентаря недоступен',
        }) as Result<unknown>,
      probeCapacity: (defId, qty) =>
        (modules.call('inventory', 'inventory.canAcquire', defId, qty) ?? {
          ok: false as const,
          error: 'модуль инвентаря недоступен',
        }) as Result<{ fits: boolean; free: number; newEntries: number }>,
    }),
  );
  director.activate('lake');

  // --- M11 «Работники» (фаза 3): монтаж ПОСЛЕ lake ДО quests (бриф F8,
  //     санкция SESSION-M11); изоляция [DECISION-архитектура]: чтение
  //     живого состояния farm/lake/pen — ТОЛЬКО через витрины publicApi
  //     (колбэки views), трейты — через ЖИВОЙ ривен-конструктор M03
  //     (modforge.rollFor, скоуп 'worker'), золото — wallet-сервис ядра
  //     (расчётный день F6); модуль systems НЕ импортирует (rg ×3 ПУСТ).
  //     [M11.2 · F10] РАСШИРЕНИЕ ВИТРИННЫХ КОЛБЭКОВ (декларируемое касание
  //     wiring: МОНТАЖ не изменён — только поля возврата существующих
  //     колбэков для ЦЕЛЕПОДБОРА директора: тайлы вкладок/активность озёр/
  //     животные загонов; weedsMax/avgHappiness сохранены — dirtyProbe жив)
  modules.register(
    new WorkersModule({
      views: {
        // farm.state: вкладки фермы + сорняки (dirtyProbe) + тайлы (директор)
        farmTabs: () =>
          ((modules.call('farm', 'farm.state') ?? { tabs: [] }) as {
            tabs: Array<{
              id: string;
              kind: string;
              tiles: Array<{ index: number; state: string; weeds?: number; wet?: boolean }>;
            }>;
          }).tabs.map((t) => ({
            id: t.id,
            kind: t.kind,
            weedsMax: t.tiles.reduce((m, tile) => Math.max(m, tile.weeds ?? 0), 0),
            tiles: t.tiles.map((tile) => ({
              index: tile.index,
              state: tile.state,
              weeds: tile.weeds ?? 0,
              wet: tile.wet === true,
            })),
          })),
        // lake.state: чистота озёр + АКТИВНОСТЬ (директор F10: работник
        // действует только на СВОЁ активное озеро; activeLake/other.idx)
        lakes: () => {
          const v = (modules.call('lake', 'lake.state') ?? null) as {
            activeLake?: number;
            water?: { cleanliness: number };
            other?: { idx?: number; water?: { cleanliness: number } } | null;
          } | null;
          if (v === null || v.water === undefined) return [];
          if (v.other != null && v.other.water !== undefined) {
            const active = v.activeLake ?? 0; // v.water — активное, other — второе
            return [0, 1].map((i) => ({
              cleanliness: i === active ? v.water!.cleanliness : v.other!.water!.cleanliness,
              active: i === active,
            }));
          }
          return [{ cleanliness: v.water.cleanliness, active: true }];
        },
        // pen.state: среднее счастье (dirtyProbe) + животные (директор)
        pens: () => {
          const v = (modules.call('pen', 'pen.state') ?? null) as {
            animals?: Array<{ happiness: number; fedToday: boolean; pettedToday: boolean; cleanliness: number }>;
            pen2?: { animals?: Array<{ happiness: number; fedToday: boolean; pettedToday: boolean; cleanliness: number }> } | null;
          } | null;
          if (v === null) return [];
          const avg = (list: Array<{ happiness: number }> | undefined): number | null =>
            list === undefined || list.length === 0
              ? null
              : list.reduce((s, a) => s + a.happiness, 0) / list.length;
          const zoo = (list: Array<{ fedToday: boolean; pettedToday: boolean; cleanliness: number }> | undefined) =>
            (list ?? []).map((a) => ({
              fedToday: a.fedToday,
              pettedToday: a.pettedToday,
              cleanliness: a.cleanliness,
            }));
          const pens = [{ avgHappiness: avg(v.animals), animals: zoo(v.animals) }];
          if (v.pen2 !== null && v.pen2 !== undefined) {
            pens.push({ avgHappiness: avg(v.pen2.animals), animals: zoo(v.pen2.animals) });
          }
          return pens;
        },
      },
      // трейты доски — живой ривен-конструктор M03 (П4: через реестр)
      rollTraits: (budget, shape, rng) => {
        const r = modules.call('modforge', 'modforge.rollFor', {
          budget,
          scopeTags: ['worker'],
          shape,
          rng,
        }) as { ok: true; value: { rolls: RolledModEntry[] } } | { ok: false; error: string } | null;
        return r !== null && r.ok ? r.value.rolls : [];
      },
      gold: () => wallet.get('gold'),
      // [M11.2 · F10 · DECISION-энергии] энергетически нейтральный вызов
      // исполнителя: резерв до капа → run() → восстановление исходного
      // значения игрока (публичный API игрока по реестру, П4 п.5; override-0
      // через StatBus НЕ проходит — meta.min = 1 у action.*.energyCost,
      // канон M01; прецедент pen.autofeeder «механизм, не труд игрока»)
      withWorkerEnergy: (run: () => Result<unknown>): Result<unknown> => {
        const snap = () =>
          (modules.call('player', 'player.snapshot') ?? { energy: { current: 0, max: 0 } }) as {
            energy: { current: number; max: number };
          };
        const before = snap().energy.current;
        const max = snap().energy.max;
        if (max > before) {
          modules.call('player', 'player.grantEnergy', max - before, 'worker.reserve');
        }
        try {
          return run();
        } finally {
          modules.call('player', 'player.setEnergy', before);
        }
      },
    }),
  );
  director.activate('workers');

  // --- M12 «Шахта» (фаза 4): монтаж ПОСЛЕ workers ДО quests (бриф F2 —
  //     ЯВНО санкционирован); изоляция: щит/кирка — витрина publicApi M02
  //     (слоты 'shield'/'pickaxe', чтение колбэком — M02 НЕ тронут); HP — публичный
  //     API M01 (checkHp/damageHp/healHp — смерть-тег публикует канал M01);
  //     атака/защита/скорость/крит/урон/вещий/чутьё — StatBus resolve
  //     (живые статы + equipmentProvider M02); золото — TransactionService
  //     eventId mine.loot/bossLoot из контекста активации; модуль НЕ импортирует
  //     чужие модули (rg ×3 ПУСТ).
  //     [M12.2 · G3/G4] тир кирки — живой канал forge.effectiveTier (M10 §2:
  //     качество + floor(заточка/tierStepLevels), клэмп SS); гейт ачивки —
  //     Requirement-оценщик (прецедент gateExtras M04/N10); износ — inventory.
  //     wear (D35, «потребители M05+»); энергия — player.spendEnergy по стату
  //     action.mine.enter.energyCost (данные bases с фазы 0); A+-предмет —
  //     inventory.add каналом точного тира (прецедент craft.collect)
  modules.register(
    new MineModule({
      shieldView: () => {
        const eq = (modules.call('inventory', 'inventory.equipped') ?? []) as Array<{
          slot: string;
          entry: { iid: ID; quality?: { tier: QualityTier } };
        }>;
        const shield = eq.find((e) => e.slot === 'shield');
        return { hasShield: shield !== undefined, tier: shield?.entry.quality?.tier ?? null };
      },
      pickaxeView: () => {
        const eq = (modules.call('inventory', 'inventory.equipped') ?? []) as Array<{
          slot: string;
          entry: {
            iid: ID;
            defId: ID;
            quality?: { tier: QualityTier; value: number };
          };
        }>;
        const pick = eq.find((e) => e.slot === 'pickaxe');
        if (pick === undefined) {
          return {
            hasPickaxe: false,
            defId: null,
            iid: null,
            tier: 0,
            quality: null,
            forgeLevel: 0,
            name: null,
          };
        }
        const q = pick.entry.quality?.tier ?? 'D';
        // [M12.2 · шов] forge.effectiveTier не видит ЭКИПИРОВАННЫЕ записи
        // (listItems = лист рюкзака, D30-семантика гейта заточки), поэтому тир
        // витрины собирается из тех же живых каналов ЧИСТОЙ функцией M10:
        // forge.levelOf + effectiveQualityOf (формула floor(L/tierStepLevels)
        // НЕ дублируется — таблица из реестра 'forge')
        const level = (modules.call('forge', 'forge.levelOf', pick.entry.iid) ?? 0) as number;
        const forgeTable = content.get<ForgeTable>('forge');
        const eff =
          forgeTable !== undefined && pick.entry.quality !== undefined
            ? effectiveQualityOf(q, pick.entry.quality.value, level, forgeTable).tier
            : q;
        const def = (content.get<Array<{ id: ID; name: string }>>('items') ?? []).find(
          (d) => d.id === pick.entry.defId,
        );
        const tierNumbers: Record<QualityTier, number> = { D: 1, C: 2, B: 3, A: 4, S: 5, SS: 6 };
        return {
          hasPickaxe: true,
          defId: pick.entry.defId,
          iid: pick.entry.iid,
          tier: tierNumbers[eff],
          quality: q,
          forgeLevel: level,
          name: def?.name ?? pick.entry.defId,
        };
      },
      gateExtras: () =>
        ({
          ...(modules.call('player', 'player.ctxExtras') ?? {}),
          ...(modules.call('quests', 'quests.gateExtras') ?? {}),
        }) as Record<string, unknown>,
      itemCount: (defId) => {
        const items = (modules.call('inventory', 'inventory.list') ?? []) as Array<{
          defId: ID;
          qty: number;
        }>;
        return items.filter((i) => i.defId === defId).reduce((s, i) => s + i.qty, 0);
      },
      wear: (iid, n) =>
        (modules.call('inventory', 'inventory.wear', iid, n) ?? {
          ok: false as const,
          error: 'модуль инвентаря недоступен',
        }) as Result<{ before: number; current: number; max: number; broken: boolean }>,
      spendEnterEnergy: (reason) =>
        (modules.call('player', 'player.spendEnergy', 'action.mine.enter.energyCost', reason) ?? {
          ok: false as const,
          error: 'модуль игрока недоступен',
        }) as Result<{ cost: number; current: number; max: number }>,
      addItem: (defId, tier, qty, source) =>
        (modules.call('inventory', 'inventory.add', defId, tier, 0, qty, source) ?? {
          ok: false as const,
          error: 'модуль инвентаря недоступен',
        }) as Result<unknown>,
      // [M13.1] выдача ТОЧНОГО качества (тир + дробное value) — runBag-выдача
      addItemQ: (defId, tier, value, qty, source) =>
        (modules.call('inventory', 'inventory.add', defId, tier, value, qty, source) ?? {
          ok: false as const,
          error: 'модуль инвентаря недоступен',
        }) as Result<unknown>,
      // [M13.1] покупка крота: D23-канон M04 — acquire (ролл качества + кап)
      acquireItem: (defId, qty, source) =>
        (modules.call('inventory', 'inventory.acquire', defId, qty, source) ?? {
          ok: false as const,
          error: 'модуль инвентаря недоступен',
        }) as Result<unknown>,
      // [M13.1] XP «пустой пещеры» — публичный API M01 (П4)
      addXp: (amount, reason) => {
        modules.call('player', 'player.addXp', amount, reason);
      },
      // [M13.1] штатный Buff-канал ядра kernel.buff (BUF-1: зелья крота;
      // очистка runs-бафов при runEnded — API владельца, канон 02 §2)
      addBuff: (mod) => buffs.add(mod, now()),
      listBuffs: () => buffs.list(),
      removeBuff: (id) => buffs.remove(id),
      // [M13.1] saveId — детерминизм сида генерации hash(saveId,layer,runNumber)
      saveId: () => save.getSaveId(),
      // [M13.2] трейты доски наёмников — ЖИВЫМ ривен-конструктором M03 (П4:
      // через реестр модулей; скоуп 'helper', бюджет по редкости — данные
      // modforge.traitBudgets.helper; паттерн workers rollTraits F2)
      rollTraits: (budget, shape, rng) => {
        const r = modules.call('modforge', 'modforge.rollFor', {
          budget,
          scopeTags: ['helper'],
          shape,
          rng,
        }) as { ok: true; value: { rolls: RolledModEntry[] } } | { ok: false; error: string } | null;
        return r !== null && r.ok ? r.value.rolls : [];
      },
      canAcquire: (defId, qty) =>
        (modules.call('inventory', 'inventory.canAcquire', defId, qty) ?? {
          ok: false as const,
          error: 'модуль инвентаря недоступен',
        }) as Result<{ fits: boolean; free: number; newEntries: number }>,
      playerHp: () =>
        (modules.call('player', 'player.checkHp') ?? { current: 1, max: 1, alive: true }) as {
          current: number;
          max: number;
        },
      damageHp: (amount, reason) => {
        modules.call('player', 'player.damageHp', amount, reason);
      },
      healHp: (amount, reason) => {
        modules.call('player', 'player.healHp', amount, reason);
      },
    }),
  );
  director.activate('mine');

  // --- M14 «Пассивки» (фаза 4): монтаж ПОСЛЕ mine ДО quests (бриф §0 —
  //     ЯВНО санкционирован). Изоляция: факты сейва для ретро-подсчёта —
  //     витрины publicApi M01/M15 через ModuleRegistry (П4: уровень —
  //     player.ctxExtras, ачивки — quests.gateExtras; чтение, НЕ импорт);
  //     модификаторы узлов — passivesProvider в StatBus (02 §2); очки —
  //     подписки ×3 (player.levelUp / achievement.unlocked / mine.bossKilled
  //     — каналы брифа §0); респек — TransactionService eventId passives.respec;
  //     срез passives ленивый БЕЗ bump (ДВЕНАДЦАТАЯ заморозка ядра)
  modules.register(
    new PassivesModule({
      playerLevel: () =>
        Number((modules.call('player', 'player.ctxExtras') as Record<string, unknown> | null ?? {})['player:level'] ?? 0),
      hasAchievement: (id) =>
        Boolean(
          (modules.call('quests', 'quests.gateExtras') as Record<string, unknown> | null ?? {})[
            `achievement:${id}`
          ],
        ),
    }),
  );
  director.activate('passives');

  // --- M16.1 «Деревня» (фаза 5): монтаж ПОСЛЕ passives ДО quests (бриф
  //     SESSION-M16.1 §0 — санкционированная строка; прецедент M14.1).
  //     Изоляция (П4): гейт — уровень/флаг через витрины publicApi M01/M15;
  //     ConditionCtx unlock-гейтов жителей — stat через StatBus
  //     (villageProvider override), остальное — deps-коллбэки; поставка —
  //     TransactionService (app-шов ctx.transaction); подарки-предметы с
  //     ТИРОМ — канал inventory.add (прецедент addItemQ M13) + D23-проба;
  //     помощь — ctx.tasks.runTask СУЩЕСТВУЮЩИХ типов + энергонейтральная
  //     обёртка (прецедент withWorkerEnergy M11.2/M13.2); импорт игровых
  //     модулей — 0 (линтер изоляции rg ×3).
  modules.register(
    new VillageModule({
      playerLevel: () =>
        Number((modules.call('player', 'player.ctxExtras') as Record<string, unknown> | null ?? {})['player:level'] ?? 0),
      hasFlag: (flag) =>
        Boolean((modules.call('quests', 'quests.gateExtras') as Record<string, unknown> | null ?? {})[`flag:${flag}`]),
      hasAchievement: (id) =>
        Boolean(
          (modules.call('quests', 'quests.gateExtras') as Record<string, unknown> | null ?? {})[
            `achievement:${id}`
          ],
        ),
      skillLevel: (skill) =>
        Number((modules.call('player', 'player.ctxExtras') as Record<string, unknown> | null ?? {})[`skill:${skill}`] ?? 0),
      itemCount: (defId) =>
        ((modules.call('inventory', 'inventory.list') ?? []) as Array<{ defId: string; qty: number }>)
          .filter((i) => i.defId === defId)
          .reduce((s, i) => s + i.qty, 0),
      saveId: () => save.getSaveId(),
      giveItem: (defId, tier, value, qty, source) =>
        (modules.call('inventory', 'inventory.add', defId, tier, value, qty, source) ?? {
          ok: false as const,
          error: 'модуль инвентаря недоступен',
        }) as Result<unknown>,
      canAcquireItem: (defId, qty) =>
        (modules.call('inventory', 'inventory.canAcquire', defId, qty) ?? {
          fits: false,
          free: 0,
          newEntries: 0,
        }) as { fits: boolean; free: number; newEntries: number },
      withVillagerEnergy: (run: () => Result<unknown>): Result<unknown> => {
        const snap = () =>
          (modules.call('player', 'player.snapshot') ?? { energy: { current: 0, max: 0 } }) as {
            energy: { current: number; max: number };
          };
        const before = snap().energy.current;
        const max = snap().energy.max;
        if (max > before) {
          modules.call('player', 'player.grantEnergy', max - before, 'villager.reserve');
        }
        try {
          return run();
        } finally {
          modules.call('player', 'player.setEnergy', before);
        }
      },
      views: {
        farmTabs: () =>
          ((modules.call('farm', 'farm.state') ?? { tabs: [] }) as {
            tabs: Array<{
              id: string;
              tiles: Array<{ index: number; state: string; weeds?: number; wet?: boolean }>;
            }>;
          }).tabs.map((t) => ({
            id: t.id,
            tiles: t.tiles.map((tile) => ({
              index: tile.index,
              state: tile.state,
              weeds: tile.weeds ?? 0,
              wet: tile.wet === true,
            })),
          })),
        lakes: () => {
          const v = (modules.call('lake', 'lake.state') ?? null) as {
            activeLake?: number;
            water?: { cleanliness: number };
            hungryCount?: number;
            other?: { water?: { cleanliness: number } } | null;
          } | null;
          if (v === null || v.water === undefined) return [];
          if (v.other != null && v.other.water !== undefined) {
            const active = v.activeLake ?? 0;
            return [0, 1].map((i) => ({
              cleanliness: i === active ? v.water!.cleanliness : v.other!.water!.cleanliness,
              active: i === active,
              hungryCount: i === active ? (v.hungryCount ?? 0) : 0,
            }));
          }
          return [{ cleanliness: v.water.cleanliness, active: true, hungryCount: v.hungryCount ?? 0 }];
        },
        pens: () => {
          const v = (modules.call('pen', 'pen.state') ?? null) as {
            animals?: Array<{ fedToday: boolean; pettedToday: boolean; cleanliness: number }>;
            pen2?: { animals?: Array<{ fedToday: boolean; pettedToday: boolean; cleanliness: number }> } | null;
          } | null;
          if (v === null) return [];
          const zoo = (list: Array<{ fedToday: boolean; pettedToday: boolean; cleanliness: number }> | undefined) =>
            (list ?? []).map((a) => ({
              fedToday: a.fedToday,
              pettedToday: a.pettedToday,
              cleanliness: a.cleanliness,
            }));
          const pens = [{ animals: zoo(v.animals) }];
          if (v.pen2 !== null && v.pen2 !== undefined) {
            pens.push({ animals: zoo(v.pen2.animals) });
          }
          return pens;
        },
      },
    }),
  );
  director.activate('village');

  // --- M15 «Квесты» (фаза 2): активируется ПОСЛЕДНИМ — подписки движка
  //     встают после CountersEngine M01 (счётчики подняты до переоценки);
  //     уровень/навыки — player.ctxExtras, hasItem — рюкзак (П4, прецеденты
  //     D38/C4: itemCount по канону M04 — inventory.list, экипированные
  //     записи не учитываются, владение уже состоявшейся выдачей)
  modules.register(
    new QuestsModule(
      {
        gateExtras: () =>
          (modules.call('player', 'player.ctxExtras') ?? {}) as Record<string, unknown>,
        itemCount: (defId) => {
          const items = (modules.call('inventory', 'inventory.list') ?? []) as Array<{
            iid: string;
            defId: string;
            qty: number;
          }>;
          return items.filter((i) => i.defId === defId).reduce((s, i) => s + i.qty, 0);
        },
        saveId: () => save.getSaveId(),
      },
      content.get<CounterDef[]>('player.counters'),
    ),
  );
  director.activate('quests');
}
