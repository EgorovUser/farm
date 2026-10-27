/**
 * Витрины рыбалки (П6 «шансы на стол»): fish.state — локация, удочка/
 * наживка в слотах, статы, альбом-сводка, удачи/веса редкости; fish.tables —
 * категории/рыбы ОБЕИХ локаций/редкости/мусор/сундук/события с итоговыми
 * шансами под текущей снастью; [M07.2 · F10] fish.album — витрина альбома
 * «гейты показываем»: все виды по локациям, поймано, гейт-причины ТЕКСТОМ
 * из conditions рыбы (данные → текст, НЕ if-ы), сводки полноты
 * (пруд X/7, река Y/9 — по фактам пулов).
 */
import type { StatBus } from '@/kernel/bus/stat-bus/stat-bus';
import type { TimeService } from '@/kernel/time/time-service';
import type { ID, Rarity } from '@/shared/types/ids';
import type { DropCategoryDef, FishDef, TrashDef, ChestEntryDef, FishingEventDef } from '@/content/fishing/fish';
import type { RodShopDef } from '@/content/fishing/rods';
import type { BaitShopDef } from '@/content/fishing/baits';
import type { FishingTable } from '@/content/balance/fishing';
import type { FishState } from './state';
import type { EquippedEntryView } from './logic/bait-provider';
import { categoryWeights, gateTextForFish, rarityWeights, statOf } from './logic/rolls';

export interface FishingStateView {
  now: number;
  location: string;
  rod: { defId: ID; name: string; tier: number; durability: string; broken: boolean } | null;
  bait: { defId: ID; name: string; stack: number; mods: Array<{ label: string; stat: string; value: number }> } | null;
  stats: { casts: number; caught: number };
  album: Array<{ defId: ID; name: string; rarity: Rarity; count: number }>;
  albumSpecies: number;
  albumTotal: number;
  /** удочки/наживки, которых НЕТ у игрока (витрина fish.buy — П6) */
  shop: {
    rods: Array<{ defId: ID; name: string; tier: number; price: number; owned: number }>;
    baits: Array<{ defId: ID; name: string; price: number; owned: number; mods: string[] }>;
  };
  resolve: {
    luckRare: number;
    luckEvent: number;
    treasureWeight: number;
    biteSpeed: number;
    zonePercent: number;
    rarityWeights: Array<{ rarity: Rarity; weight: number; chancePercent: number }>;
  };
}

export interface FishingTablesView {
  location: string;
  categories: Array<{ id: string; name: string; weight: number; lucky: boolean; chancePercent: number }>;
  fish: Array<{ id: ID; name: string; location: string; category: string; rarity: Rarity; weight: number; biteSeconds: string; sizeGrams: string; gated: boolean }>;
  rarities: Array<{ rarity: Rarity; weight: number; chancePercent: number; lucky: boolean }>;
  trash: Array<{ id: ID; name: string; weight: number }>;
  chest: Array<{ id: ID; kind: string; defId: ID; weight: number; qty: string; lucky: boolean }>;
  events: Array<{ id: ID; name: string; text: string; weight: number; options: string[] }>;
}

/** [M07.2 · F10] витрина альбома: все виды с гейт-причинами */
export interface FishingAlbumView {
  now: number;
  species: Array<{
    defId: ID;
    name: string;
    location: string;
    rarity: Rarity;
    caught: number;
    unlocked: boolean;
    /** гейт-причина ТЕКСТОМ (данные conditions; null — безусловная рыба) */
    gateText: string | null;
  }>;
  totals: {
    pond: { caught: number; total: number };
    river: { caught: number; total: number };
  };
  /** гейт локации реки (данные) */
  river: { skillLevel: number; unlocked: boolean };
}

export interface ViewDeps {
  statBus: StatBus;
  time: TimeService;
  table: FishingTable;
  categories: readonly DropCategoryDef[];
  trash: readonly TrashDef[];
  chest: readonly ChestEntryDef[];
  events: readonly FishingEventDef[];
  rods: readonly RodShopDef[];
  baits: readonly BaitShopDef[];
  tryItem(defId: ID): { name: string; rarity: Rarity } | undefined;
  /** [M07.2 · F10] имя ачивки для гейт-текста (реестр M15; заглушки → id) */
  tryAchievement(id: ID): string | undefined;
  /** [M07.2 · F12] пул рыб локации */
  fishOf(location: string): readonly FishDef[];
  equippedView(): Array<EquippedEntryView>;
  itemCount(defId: ID): number;
  gateExtras(): Record<string, unknown>;
  getState(): FishState;
}

export function buildFishingStateView(d: ViewDeps): FishingStateView {
  const state = d.getState();
  const ctx = d.time.ctx('player');
  const equipped = d.equippedView();
  const rodView = equipped.find((e) => e.slot === 'rod');
  const baitView = equipped.find((e) => e.slot === 'bait');
  const rodTier = rodView ? (d.rods.find((r) => r.defId === rodView.entry.defId)?.tier ?? 0) : 0;

  const rod =
    rodView !== undefined
      ? {
          defId: rodView.entry.defId,
          name: d.tryItem(rodView.entry.defId)?.name ?? rodView.entry.defId,
          tier: rodTier,
          durability: (() => {
            const dur = (rodView.entry as unknown as { durability?: { current: number; max: number } }).durability;
            return dur ? `${dur.current}/${dur.max}` : '—';
          })(),
          broken: (() => {
            const dur = (rodView.entry as unknown as { durability?: { current: number } }).durability;
            return dur !== undefined && dur.current <= 0;
          })(),
        }
      : null;

  const baitDef = baitView ? d.baits.find((b) => b.defId === baitView.entry.defId) : undefined;
  const bait =
    baitView !== undefined
      ? {
          defId: baitView.entry.defId,
          name: d.tryItem(baitView.entry.defId)?.name ?? baitView.entry.defId,
          stack: baitView.entry.qty,
          mods: (baitDef?.mods ?? []).map((m) => ({ label: m.label, stat: m.stat, value: m.value })),
        }
      : null;

  const album = Object.entries(state.album)
    .map(([defId, count]) => {
      const def = [...d.fishOf('pond'), ...d.fishOf('river')].find((f) => f.id === defId);
      return {
        defId,
        name: def?.name ?? d.tryItem(defId)?.name ?? defId,
        rarity: def?.rarity ?? 'common',
        count,
      };
    })
    .sort((a, b) => b.count - a.count || a.defId.localeCompare(b.defId));

  const rw = rarityWeights(d.statBus, ctx);
  const rwTotal = rw.reduce((s, e) => s + e.weight, 0);

  return {
    now: d.time.now(),
    location: state.location,
    rod,
    bait,
    stats: { casts: state.stats.casts, caught: state.stats.caught },
    album,
    albumSpecies: album.length,
    albumTotal: album.reduce((s, a) => s + a.count, 0),
    shop: {
      rods: d.rods.map((r) => ({
        defId: r.defId,
        name: d.tryItem(r.defId)?.name ?? r.name,
        tier: r.tier,
        price: r.price,
        owned: d.itemCount(r.defId),
      })),
      baits: d.baits.map((b) => ({
        defId: b.defId,
        name: d.tryItem(b.defId)?.name ?? b.name,
        price: b.price,
        owned: d.itemCount(b.defId),
        mods: b.mods.map((m) => m.label),
      })),
    },
    resolve: {
      luckRare: statOf(d.statBus, ctx, 'fishing.luck.rare'),
      luckEvent: statOf(d.statBus, ctx, 'fishing.luck.event'),
      treasureWeight: statOf(d.statBus, ctx, 'fishing.treasure.weight'),
      biteSpeed: statOf(d.statBus, ctx, 'fishing.bite.speed'),
      zonePercent: statOf(d.statBus, ctx, 'fish.minigame.zonePercent'),
      rarityWeights: rw.map((e) => ({
        rarity: e.rarity,
        weight: e.weight,
        chancePercent: rwTotal > 0 ? (e.weight / rwTotal) * 100 : 0,
      })),
    },
  };
}

export function buildFishingTablesView(d: ViewDeps): FishingTablesView {
  const ctx = d.time.ctx('player');
  const extra = d.gateExtras();
  const hasAchievement = (id: string) => Boolean(extra[`achievement:${id}`]);
  const playerLevel = Number(extra['player:level'] ?? 0);
  const baitView = d.equippedView().find((e) => e.slot === 'bait');
  const rodView = d.equippedView().find((e) => e.slot === 'rod');
  const rodTier = rodView ? (d.rods.find((r) => r.defId === rodView.entry.defId)?.tier ?? 0) : 0;
  const ctxInfo = {
    baitDefId: baitView?.entry.defId ?? null,
    rodTier,
    playerLevel,
    hasAchievement,
  };

  const cw = categoryWeights(d.categories, d.statBus, ctx);
  const cwTotal = cw.reduce((s, e) => s + e.weight, 0);
  const rw = rarityWeights(d.statBus, ctx);
  const rwTotal = rw.reduce((s, e) => s + e.weight, 0);

  return {
    location: d.getState().location,
    categories: cw.map((e) => ({
      id: e.def.id,
      name: e.def.name,
      weight: e.def.weight,
      lucky: Boolean(e.def.lucky),
      chancePercent: cwTotal > 0 ? (e.weight / cwTotal) * 100 : 0,
    })),
    fish: [...d.fishOf('pond'), ...d.fishOf('river')].map((f) => ({
      id: f.id,
      name: f.name,
      location: d.fishOf('pond').some((p) => p.id === f.id) ? 'пруд' : 'река',
      category: f.category,
      rarity: f.rarity,
      weight: f.weight,
      biteSeconds: `${f.biteSeconds[0]}–${f.biteSeconds[1]} с`,
      sizeGrams: `${f.sizeGrams[0]}–${f.sizeGrams[1]} г`,
      gated: f.conditions !== undefined,
    })),
    rarities: rw.map((e) => ({
      rarity: e.rarity,
      weight: e.weight,
      chancePercent: rwTotal > 0 ? (e.weight / rwTotal) * 100 : 0,
      lucky: ['rare', 'epic', 'legendary', 'mythic'].includes(e.rarity),
    })),
    trash: d.trash.map((t) => ({ id: t.id, name: t.name, weight: t.weight })),
    chest: d.chest.map((c) => ({
      id: c.id,
      kind: c.kind,
      defId: c.defId,
      weight: c.weight,
      qty: `${c.qty[0]}–${c.qty[1]}`,
      lucky: Boolean(c.lucky),
    })),
    events: d.events.map((e) => ({
      id: e.id,
      name: e.name,
      text: e.text,
      weight: e.weight,
      options: e.options.map((o) => `${o.label} (${o.outcome.t})`),
    })),
  };
}

/** [M07.2 · F10] витрина альбома — «гейты показываем» (карточка §5) */
export function buildFishingAlbumView(d: ViewDeps): FishingAlbumView {
  const state = d.getState();
  const extra = d.gateExtras();
  const names = {
    bait: (id: string) => d.baits.find((b) => b.defId === id)?.name,
    rodTier: (tier: number) => d.rods.find((r) => r.tier === tier)?.name,
    achievement: (id: string) => d.tryAchievement(id),
  };
  const rowsOf = (location: string): FishingAlbumView['species'] =>
    d.fishOf(location).map((f) => {
      const caught = state.album[f.id] ?? 0;
      return {
        defId: f.id,
        name: f.name,
        location: location === 'pond' ? 'пруд' : 'река',
        rarity: f.rarity,
        caught,
        unlocked: caught > 0,
        gateText: gateTextForFish(f, names),
      };
    });
  const pond = rowsOf('pond');
  const river = rowsOf('river');
  const riverSkill = Number(extra['skill:fishing'] ?? 0);
  return {
    now: d.time.now(),
    species: [...pond, ...river],
    totals: {
      pond: { caught: pond.filter((r) => r.unlocked).length, total: pond.length },
      river: { caught: river.filter((r) => r.unlocked).length, total: river.length },
    },
    river: {
      skillLevel: d.table.locations.riverSkillLevel,
      unlocked: riverSkill >= d.table.locations.riverSkillLevel,
    },
  };
}
