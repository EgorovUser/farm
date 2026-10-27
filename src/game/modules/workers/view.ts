/**
 * Витрины M11 (П6 «шансы на стол»; карточка §2/§4):
 *  - workers board: 5 строк со ВСЕМИ полями + трейты текстом (TRAIT_LABELS);
 *  - workers list: нанятые — имя/профессия/звёзды/ЗП/период/объект/mood/
 *    болезнь/кулдаун премии + занятость/лимит (объекты живого состояния).
 */
import type { WorkersTable, WorkerObjectDef, WorkerProfession } from '@/content/workers/table';
import { PROFESSION_NAMES } from '@/content/workers/table';
import { TRAIT_LABELS } from '@/content/workers/traits';
import type { WorkerInstance } from './state';
import { isSick } from './state';
import type { WorkerProfile } from './logic/board';

export interface TraitTextView {
  name: string;
  text: string;
}

export function traitText(typeId: string, value: number): TraitTextView {
  const label = TRAIT_LABELS[typeId];
  if (label === undefined) {
    // неизвестный трейт — рядовой случай (П5): показать как есть
    return { name: typeId, text: `${value > 0 ? '+' : ''}${value}` };
  }
  return { name: label.name, text: label.text(value) };
}

export interface BoardRow {
  idx: number;
  defId: string;
  name: string;
  profession: WorkerProfession;
  professionName: string;
  stars: number;
  salaryPerDay: number;
  checkPeriodHours: number;
  care: number;
  traits: TraitTextView[];
  tool: string | null;
}

export interface ListRow {
  idx: number;
  defId: string;
  name: string;
  profession: WorkerProfession;
  professionName: string;
  stars: number;
  salaryPerDay: number;
  checkPeriodHours: number;
  object: string;
  objectName: string;
  mood: number;
  sick: boolean;
  sickUntil: number | null;
  bonusCooldownMs: number | null;
  traits: TraitTextView[];
  /** [M11.2 · F10] последнее действие тика (null — не действовал) */
  lastAction: { at: number; taskId: string; success: boolean } | null;
}

export interface ObjectRow {
  id: string;
  name: string;
  profession: WorkerProfession;
  worker: string | null;
}

export interface WorkersView {
  board: BoardRow[];
  list: ListRow[];
  objects: ObjectRow[];
  limit: { hired: number; objects: number };
  salaryPerDay: number;
  /** [M11.2 · F15 Домик] знаменатель шкалы настроения = капу */
  moodCap: number;
}

export function buildWorkersView(
  profiles: WorkerProfile[],
  hired: WorkerInstance[],
  objects: WorkerObjectDef[],
  now: number,
  table: WorkersTable,
  moodCap = table.mood.max,
): WorkersView {
  const busy = new Map(hired.map((w) => [w.object, w.name] as const));
  const objectName = (id: string): string => objects.find((o) => o.id === id)?.name ?? id;
  const board: BoardRow[] = profiles.map((p, idx) => ({
    idx,
    defId: p.defId,
    name: p.name,
    profession: p.profession,
    professionName: PROFESSION_NAMES[p.profession],
    stars: p.stars,
    salaryPerDay: p.salaryPerDay,
    checkPeriodHours: p.checkPeriodHours,
    care: p.care,
    traits: p.traits.map((t) => traitText(t.type, t.value)),
    tool: p.toolRequirement !== undefined ? `${p.toolRequirement.slot} ≥ ${p.toolRequirement.minTier}` : null,
  }));
  const list: ListRow[] = hired.map((w, idx) => {
    const cooldownMs =
      w.lastBonusAt !== undefined
        ? Math.max(0, w.lastBonusAt + table.bonus.cooldownDays * 86_400_000 - now)
        : null;
    return {
      idx,
      defId: w.defId,
      name: w.name,
      profession: w.profession,
      professionName: PROFESSION_NAMES[w.profession],
      stars: w.stars,
      salaryPerDay: w.salaryPerDay,
      checkPeriodHours: w.checkPeriodHours,
      object: w.object,
      objectName: objectName(w.object),
      mood: w.mood,
      sick: isSick(w, now),
      sickUntil: w.sickUntil ?? null,
      bonusCooldownMs: cooldownMs,
      traits: w.traits.map((t) => traitText(t.type, t.value)),
      lastAction: w.lastAction !== undefined ? { ...w.lastAction } : null,
    };
  });
  const objectRows: ObjectRow[] = objects.map((o) => ({
    id: o.id,
    name: o.name,
    profession: o.profession,
    worker: busy.get(o.id) ?? null,
  }));
  return {
    board,
    list,
    objects: objectRows,
    limit: { hired: hired.length, objects: objects.length },
    salaryPerDay: hired.reduce((s, w) => s + w.salaryPerDay, 0),
    moodCap,
  };
}
