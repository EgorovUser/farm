/**
 * Состояние M16.1 «Деревня» — срез `village` [DECISION M161-срез, бриф §0]:
 * { v: 1, unlocked, xp, villagers: Record<id, { happiness, grumbleDays,
 * lastSatisfied?, need? }>, helpLastDay } — лениво-дефолтный БЕЗ bump
 * (ЧЕТЫРНАДЦАТАЯ заморозка ядра; прецеденты passives/run?/helpers?).
 *
 * КЛЮЧЕВЫЕ ИНВАРИАНТЫ:
 *  - ДО открытия гейта срез НЕ инициализируется: save() → undefined,
 *    файл чистой игры НЕ получает ключа village (контраст экспортов
 *    до/после гейта — прецедент passives; «пост-wipe тишина»).
 *  - Маркер «день обработан» = villager.need.day === today (недельные
 *    потребности ПОДТВЕРЖДАЮТСЯ каждый день: day обновляется, item/qty
 *    стабильны всю iso-неделю) — идемпотентность dayTick/catchUp:
 *    повторный тик того же дня ничего не делает, налог НЕ задваивается.
 *  - Удовлетворённая потребность НЕ стирается до следующего дня-паса:
 *    факт удовлетворения = lastSatisfied (день — daily; iso-неделя — weekly).
 *  - Счётчики ядра (налоги-итого/подарки-итого/сделки — задел трендов
 *    M16.3) в срез НЕ входят (бриф §0);XP — входит (уровень = производная).
 *
 * Санитизация load: happiness/grumbleDays — клэмп; need — валидация полей;
 * unknown-жители НЕ выкидываются молча (срез каноничен пофайлово), но
 * неизвестные item в need сохраняются (контент мог уйти — проверка
 * соответствия живым данным при поставке честно откажет).
 */
import type { SaveSlice } from '@/kernel/save/save-director';
import type { VillagerDef } from '@/content/village/types';

export interface VillageNeedState {
  item: string;
  qty: number;
  kind: 'daily' | 'weekly';
  /** день последнего подтверждения/ролла (weekly: обновляется ежедневно,
   *  item/qty стабильны в пределах iso-недели — см. шапку) */
  day: string;
}

export interface VillagerLiveState {
  happiness: number;
  grumbleDays: number;
  lastSatisfied?: string;
  need?: VillageNeedState;
}

export interface VillageState {
  v: 1;
  unlocked: boolean;
  xp: number;
  villagers: Record<string, VillagerLiveState>;
  helpLastDay: string | null;
}

export function defaultVillageState(): VillageState {
  return { v: 1, unlocked: false, xp: 0, villagers: {}, helpLastDay: null };
}

/** «чист» ли срез: деревня не открыта и ничего не делалось → тишина файла */
export function isPristineVillage(s: VillageState): boolean {
  return (
    !s.unlocked &&
    s.xp === 0 &&
    Object.keys(s.villagers).length === 0 &&
    s.helpLastDay === null
  );
}

const num = (v: unknown, def: number): number =>
  typeof v === 'number' && Number.isFinite(v) ? v : def;

const clampInt = (v: unknown, def: number, min: number, max: number): number =>
  Math.max(min, Math.min(max, Math.floor(num(v, def))));

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const dateOrNull = (v: unknown): string | null => (typeof v === 'string' && DATE_RE.test(v) ? v : null);

function canonicalNeed(raw: unknown): VillageNeedState | undefined {
  if (raw === null || typeof raw !== 'object') return undefined;
  const n = raw as Record<string, unknown>;
  const item = typeof n.item === 'string' && n.item.length > 0 ? n.item : null;
  const day = dateOrNull(n.day);
  if (item === null || day === null) return undefined;
  const qty = clampInt(n.qty, 1, 1, 1_000_000);
  const kind = n.kind === 'weekly' ? 'weekly' : 'daily';
  return { item, qty, kind, day };
}

function canonicalVillager(raw: unknown): VillagerLiveState {
  const v = (raw === null || typeof raw !== 'object' ? {} : raw) as Record<string, unknown>;
  return {
    happiness: clampInt(v.happiness, 70, 0, 100),
    grumbleDays: clampInt(v.grumbleDays, 0, 0, 365),
    ...(dateOrNull(v.lastSatisfied) !== null ? { lastSatisfied: dateOrNull(v.lastSatisfied)! } : {}),
    ...(canonicalNeed(v.need) !== undefined ? { need: canonicalNeed(v.need)! } : {}),
  };
}

/** канонический порядок полей — roundtrip байт-в-байт */
export function canonicalVillageState(s: VillageState, defs: VillagerDef[]): VillageState {
  const known = new Set(defs.map((d) => d.id));
  const villagers: Record<string, VillagerLiveState> = {};
  const raw = (s.villagers ?? {}) as Record<string, unknown>;
  // порядок ключей — порядок контента (стабильный roundtrip)
  for (const def of defs) {
    if (Object.prototype.hasOwnProperty.call(raw, def.id)) {
      villagers[def.id] = canonicalVillager(raw[def.id]);
    }
  }
  // неизвестные id не переносятся (контент ушёл — санитизация, П5)
  void known;
  return {
    v: 1,
    unlocked: s.unlocked === true,
    xp: Math.max(0, Math.floor(num(s.xp, 0))),
    villagers,
    helpLastDay: dateOrNull(s.helpLastDay),
  };
}

/**
 * Срез сейва: чистые данные; save() → undefined для чистого среза (до
 * открытия гейта ключ village НЕ пишется — «пост-wipe тишина»).
 */
export function villageSaveSlice(
  getState: () => VillageState,
  setState: (s: VillageState) => void,
  defs: VillagerDef[],
): SaveSlice {
  return {
    save: () => {
      const s = getState();
      return isPristineVillage(s) ? undefined : canonicalVillageState(s, defs);
    },
    load: (data: unknown) => {
      const s = data as VillageState | undefined;
      if (!s || typeof s !== 'object') {
        setState(defaultVillageState());
        return;
      }
      setState(canonicalVillageState(s, defs));
    },
  };
}
