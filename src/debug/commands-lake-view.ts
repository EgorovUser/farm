/**
 * Витрина lake.state (M08.1 + M08.2, П6) — вынос из commands-lake.ts по
 * 01 §6 (файл превысил 300 строк при касании M08.2): активное озеро, вода,
 * рыбы (требования вида текстом + шанс болезни), пары/икра, улучшения,
 * лаборатория, второе озеро, статы, цена Корма.
 */
import type { CommandContext } from './console-types';

interface FishRow {
  idx: number;
  fishId: string;
  name: string;
  quality: string;
  hungry: boolean;
  sick: boolean;
  requirementsMet: boolean;
  requirementsText: string | null;
  sickChance: number;
}

interface UpgradeRow {
  id: string;
  name: string;
  price: number;
  bought: boolean;
  description: string;
}

interface LakeView {
  now: number;
  activeLake: number;
  hasLake2: boolean;
  slots: { used: number; base: number };
  water: { temperature: number; cleanliness: number; driftPerDay: number };
  fish: FishRow[];
  pairs: Array<{ fishId: string; name: string; maxParentTier: string; remainingMs: number }>;
  roe: Array<{ fishId: string; name: string; tier: string; remainingMs: number; waitingSlot: boolean }>;
  stats: { released: number; bred: number; harvested: number };
  hungryCount: number;
  sickCount: number;
  feedPrice: number | null;
  upgrades: UpgradeRow[];
  research: { built: boolean; mode: 'plus1' | 'plus2' | null; cooldownMs: number };
  other: { idx: number; water: { temperature: number; cleanliness: number }; slots: { used: number; base: number } } | null;
}

function fmtRemaining(ms: number): string {
  const s = Math.ceil(ms / 1000);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  return h > 0 ? `${h}ч ${m}м` : `${m}м ${s % 60}с`;
}

type LakeApi = Record<string, (...args: unknown[]) => unknown>;

function apiLake(ctx: CommandContext): LakeApi {
  return ctx.game.modules.get('lake')?.api ?? {};
}

export function printLakeState(ctx: CommandContext, api: LakeApi = apiLake(ctx)): void {
  const v = api['lake.state']() as LakeView;
  const lakeNo = v.activeLake + 1;
  ctx.printTitle(
    `Озеро №${lakeNo}${v.hasLake2 ? ' (lake.switch 0|1)' : ''} · слоты ${v.slots.used}/${v.slots.base} · вода: ${v.water.temperature}° · чистота ${v.water.cleanliness}/100 (дрейф ${v.water.driftPerDay}/день)`,
  );
  if (v.fish.length === 0) {
    ctx.print('  озеро пусто — выпустите пойманную рыбу: lake.release <iid> (iid — в inv list)');
  }
  for (const f of v.fish) {
    const parts = [
      `слот ${f.idx}: ${f.name} (${f.fishId}) · тир ${f.quality}`,
      f.hungry ? 'ГОЛОДНА' : 'сыта',
      f.sick ? 'БОЛЬНА (lake.treat ' + f.idx + ')' : 'здорова',
    ];
    ctx.print(`  ${parts.join(' · ')}`);
    ctx.print(
      `    требования вида: ${f.requirementsMet ? 'в норме' : `НАРУШЕНЫ — ${f.requirementsText}`} · шанс болезни ${(f.sickChance * 100).toFixed(0)}%/день`,
    );
  }
  if (v.pairs.length > 0) {
    ctx.print(`  пары (до икры): ${v.pairs.map((p) => `${p.name} → тир потомка ≤ ${p.maxParentTier} · через ${fmtRemaining(p.remainingMs)}`).join(' · ')}`);
  }
  if (v.roe.length > 0) {
    ctx.print(`  икра (очередь): ${v.roe.map((r) => `${r.name} тир ${r.tier}${r.waitingSlot ? ' · ЖДЁТ СВОБОДНЫЙ СЛОТ' : ` · созреет через ${fmtRemaining(r.remainingMs)}`}`).join(' · ')}`);
  }
  ctx.print(
    `  статы: выпущено ${v.stats.released} · выведено ${v.stats.bred} · собрано ${v.stats.harvested} · голодных ${v.hungryCount} · больных ${v.sickCount}`,
  );
  const bought = v.upgrades.filter((u) => u.bought);
  ctx.print(
    `  улучшения (${bought.length}/${v.upgrades.length}): ${bought.length > 0 ? bought.map((u) => u.name).join(' · ') : 'нет (lake.upgrade — витрина)'}`,
  );
  if (v.research.built) {
    const cd = v.research.cooldownMs > 0 ? ` · перезарядка ${fmtRemaining(v.research.cooldownMs)}` : '';
    ctx.print(
      `  лаборатория: ${v.research.mode !== null ? `форс ${v.research.mode} заряжен — ждёт следующую икру` : `готова (lake.research plus1|plus2)${cd}`}`,
    );
  }
  if (v.other !== null) {
    ctx.print(
      `  озеро №${v.other.idx + 1} (неактивное): вода ${v.other.water.temperature}°/${v.other.water.cleanliness} · слоты ${v.other.slots.used}/${v.other.slots.base}`,
    );
  }
  ctx.print(
    `  Корм: цена ${v.feedPrice !== null ? `${v.feedPrice}з/шт (lake.buy feed N)` : 'нет цены (shop.currencyGoods)'} · кормление всех голодных — lake.feed`,
  );
}
