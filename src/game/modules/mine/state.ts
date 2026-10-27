/**
 * Состояние шахты (M12.1 срез + M13.1 забег-контейнер, бриф R1): срез `mine`
 * = форма v15 (migrate14to15 добавляет дефолт). Счётчики — витрина/ачивки
 * M12.2: fights/kills/bossKills/deaths.
 *
 * [M13.1 · R1] персистенция забега — ЛЕНИВО-ОПЦИОНАЛЬНЫЕ поля БЕЗ bump
 * (прецеденты pairs/location/lake2/upgrades?/lastAction?): `run?` — активный
 * забег (автосейв/перезагрузка продолжают; roundtrip байт-в-байт),
 * `upgrades?` — купленные улучшения ×4, `lastRunDay?` — «Насыщенность»
 * (dateISO первого забега дня). Канонический порядок полей — roundtrip
 * байт-в-байт; ленивые дефолты идемпотентны (повторный load без дописывания).
 */
import type { SaveSlice } from '@/kernel/save/save-director';
import type { QualityTier } from '@/shared/types/ids';
import type { MineCardKind } from '@/content/mine/cards';

export interface MineStats {
  fights: number;
  kills: number;
  bossKills: number;
  deaths: number;
}

/** карта забега на поле: деф колонки + состояние экземпляра (M13.1) */
export interface RunCard {
  id: string;
  kind: MineCardKind;
  /** ролл скрытости при генерации (карточка §1: 40% скрыты) */
  hidden: boolean;
  /** payload дефа (данные карты: моб-пул, таблицы сундука/лагеря, офферы) */
  payload: unknown;
  /** вскрыта факелом (создаётся скрытой — скрытой и остаётся до факела) */
  revealed?: boolean;
  /** уничтожена обвалом (колонка исключает её из выбора) */
  destroyed?: boolean;
  /** разыграна (выбрана/разрешена) */
  resolved?: boolean;
  /** payload моба, роллящийся при генерации: mobId/elite */
  mobId?: string;
  elite?: string | null;
}

/** рюкзак забега: стакинг defId+quality как в инвентаре (Task 70: quality?) */
export interface RunBagEntry {
  defId: string;
  qty: number;
  quality?: { tier: QualityTier; value: number };
}

/** баф забега в контейнере (алтарь; providит runBuffProvider, duration runs) */
export interface RunMod {
  id: string;
  stat: string;
  op: 'flat' | 'inc' | 'more';
  value: number;
  label: string;
}

/** контейнер забега — канон 03-DATA §7 MineRun + модульные поля M13.1 */
export interface MineRunState {
  runId: string;
  layer: number;
  column: number;
  /** 12 карт колонок + финальная карта-босс (index 12; канон §7 cards[]) */
  cards: RunCard[];
  runBag: RunBagEntry[];
  torches: number;
  /** зеркало player HP (истина — M01 через шину; поле — для персистенции) */
  hp: number;
  /** ПУСТ в M13.1 — слоты M13.2 (канон §7 helpers) */
  helpers: Array<{ instanceId: string; status: string[] }>;
  // --- модульные поля M13.1 (аддитивно к канону, санитизируются лениво)
  runNumber: number;
  seed: number;
  status: string | null;
  firstOfDay: boolean;
  campfire: boolean;
  cardsResolved: number;
  /** оффер алтаря роллится при разрешении карты; баф живёт до runEnded */
  altarMods: RunMod[];
  /** режимы mine.pick: обвал — выбор карты к утрате; крот — торговая сессия */
  pendingCollapse: boolean;
  traderOpen: boolean;
}

export interface MineState {
  v: 1;
  stats: MineStats;
  /** активный забег (лениво-опционально, БЕЗ bump — R1) */
  run?: MineRunState;
  /** купленные улучшения (id → true; лениво-опционально) */
  upgrades?: Record<string, boolean>;
  /** dateISO последнего забега («Насыщенность»: первый забег дня; R2) */
  lastRunDay?: string;
}

export function defaultMineState(): MineState {
  return { v: 1, stats: { fights: 0, kills: 0, bossKills: 0, deaths: 0 } };
}

const num = (v: unknown, def: number): number =>
  typeof v === 'number' && Number.isFinite(v) ? v : def;

const int = (v: unknown, def: number): number => Math.max(0, Math.floor(num(v, def)));

const str = (v: unknown): string | null => (typeof v === 'string' && v.length > 0 ? v : null);

function canonicalBag(raw: unknown): RunBagEntry[] {
  if (!Array.isArray(raw)) return [];
  const out: RunBagEntry[] = [];
  for (const e of raw) {
    const r = e as RunBagEntry | undefined;
    if (!r || typeof r !== 'object' || typeof r.defId !== 'string' || r.defId.length === 0) continue;
    const qty = int(r.qty, 0);
    if (qty < 1) continue;
    const q = r.quality as { tier?: unknown; value?: unknown } | undefined;
    out.push({
      defId: r.defId,
      qty,
      ...(q !== undefined && typeof q === 'object' && typeof q.tier === 'string'
        ? { quality: { tier: q.tier as QualityTier, value: Math.min(100, Math.max(0, num(q.value, 0))) } }
        : {}),
    });
  }
  return out;
}

function canonicalCards(raw: unknown): RunCard[] {
  if (!Array.isArray(raw)) return [];
  const out: RunCard[] = [];
  for (const c of raw) {
    const r = c as RunCard | undefined;
    if (!r || typeof r !== 'object' || typeof r.id !== 'string' || typeof r.kind !== 'string') continue;
    out.push({
      id: r.id,
      kind: r.kind as MineCardKind,
      hidden: r.hidden === true,
      payload: r.payload ?? null,
      ...(r.revealed === true ? { revealed: true } : {}),
      ...(r.destroyed === true ? { destroyed: true } : {}),
      ...(r.resolved === true ? { resolved: true } : {}),
      ...(typeof r.mobId === 'string' ? { mobId: r.mobId } : {}),
      ...(r.elite !== undefined ? { elite: str(r.elite) } : {}),
    });
  }
  return out;
}

function canonicalRun(raw: unknown): MineRunState | undefined {
  const r = raw as MineRunState | undefined;
  if (!r || typeof r !== 'object' || typeof r.runId !== 'string' || typeof r.layer !== 'number') {
    return undefined;
  }
  const mods: RunMod[] = Array.isArray(r.altarMods)
    ? r.altarMods
        .filter((m) => m && typeof m.id === 'string' && typeof m.stat === 'string')
        .map((m) => ({
          id: m.id,
          stat: m.stat,
          op: (m.op === 'inc' || m.op === 'more' ? m.op : 'flat') as RunMod['op'],
          value: num(m.value, 0),
          label: typeof m.label === 'string' ? m.label : 'баф алтаря',
        }))
    : [];
  return {
    runId: r.runId,
    layer: int(r.layer, 1),
    column: Math.min(5, Math.max(1, int(r.column, 1))),
    cards: canonicalCards(r.cards),
    runBag: canonicalBag(r.runBag),
    torches: int(r.torches, 0),
    hp: Math.max(1, num(r.hp, 1)),
    helpers: Array.isArray(r.helpers) ? r.helpers.filter((h) => h && typeof h.instanceId === 'string') : [],
    runNumber: int(r.runNumber, 1),
    seed: Math.floor(num(r.seed, 0)) >>> 0,
    status: str(r.status),
    firstOfDay: r.firstOfDay === true,
    campfire: r.campfire === true,
    cardsResolved: int(r.cardsResolved, 0),
    altarMods: mods,
    pendingCollapse: r.pendingCollapse === true,
    traderOpen: r.traderOpen === true,
  };
}

/** канонический порядок полей — roundtrip байт-в-байт (ленивые поля НЕ дописываются) */
export function canonicalMineState(s: MineState): MineState {
  const out: MineState = {
    v: 1,
    stats: {
      fights: Math.max(0, Math.floor(num(s.stats?.fights, 0))),
      kills: Math.max(0, Math.floor(num(s.stats?.kills, 0))),
      bossKills: Math.max(0, Math.floor(num(s.stats?.bossKills, 0))),
      deaths: Math.max(0, Math.floor(num(s.stats?.deaths, 0))),
    },
  };
  const run = canonicalRun(s.run);
  if (run !== undefined) out.run = run;
  if (s.upgrades !== undefined && typeof s.upgrades === 'object') {
    const up: Record<string, boolean> = {};
    for (const [k, v] of Object.entries(s.upgrades)) if (v === true) up[k] = true;
    if (Object.keys(up).length > 0) out.upgrades = up;
  }
  if (typeof s.lastRunDay === 'string' && s.lastRunDay.length > 0) out.lastRunDay = s.lastRunDay;
  return out;
}

function sanitize(raw: unknown): MineState {
  const s = raw as MineState | undefined;
  if (!s || typeof s !== 'object' || typeof s.stats !== 'object' || s.stats === null) {
    return defaultMineState();
  }
  return canonicalMineState(s);
}

/** Срез сейва: чистые данные; канонический порядок — roundtrip байт-в-байт */
export function mineSaveSlice(
  getState: () => MineState,
  setState: (s: MineState) => void,
): SaveSlice {
  return {
    save: () => canonicalMineState(getState()),
    load: (data: unknown) => setState(sanitize(data)),
  };
}
