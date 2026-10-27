/**
 * Разведение загона (M06.2, бриф F5; карточка §4) — чистые функции.
 *
 * [M08 · 89/10/1 · ВЫРАВНИВАНИЕ к решению №3 «2+ @1%» (Task 45 / M08 §8,
 * санкция брифа M08.1 F7)] Формула потомства — ЕДИНАЯ с M08 §4:
 *   childTier = clamp(max(родители) − 1 + mutationRoll, D, SS)
 * мутация — КАТЕГОРИЙНЫЙ ролл (прежде бинарный 10% Task 41):
 *   89% → +0 / 10% → +1 / 1% → +2 — ТЕ ЖЕ окна, что у озера
 *   ([0, 0.89) / [0.89, 0.99) / [0.99, 1]; +2 теперь достижим и в загоне —
 * потомок ВЫШЕ лучшего родителя (max+1 в пределах клампа до SS). Ролл —
 * стрим `pen:breed:<species>:mutation` В МОМЕНТ рождения (журнал П6;
 * детерминизм по saveId). Потомок: качество = childTier, счастье/сытость/
 * здоровье/чистота 100 (newborn), nextProduceAt = момент рождения + период.
 *
 * Числа 89/10/1 канонизированы решением заказчика в тексте санкции F7
 * (дифф pen = ровно logic/breeding.ts + оракулы, по букве брифа M08.1 —
 * content/balance/pen.ts НЕ тронут; поле PEN_TABLE.breeding.mutationChance
 * более не читается роллом — рудимент данных, снятие = контент-пас
 * pen-касающегося сеанса).
 *
 * Рождение лениво (канон 02 §8): dueAt ≤ now И свободный слот в загоне пары
 * («свободный слот обязателен (иначе — ожидание)» — процесс ждёт слот,
 * переоценка на каждом проходе/обращении).
 */
import { QUALITY_TIERS, type QualityTier } from '@/shared/types/ids';
import type { AnimalDef } from '@/content/pen/animals';
import type { PenTable } from '@/content/balance/pen';
import type { AnimalInstance, BreedingInfo, PenState } from '../state';
import { canonicalAnimal } from '../state';

/** [M08 · 89/10/1] окна категорийного ролла мутации загона — те же, что у
 * озера (контракт [0, 0.89) / [0.89, 0.99) / [0.99, 1]; решение №3 Task 45) */
const MUTATION_PLUS1_FROM = 0.89;
const MUTATION_PLUS2_FROM = 0.99;

/** [M08 · 89/10/1] категорийный ролл мутации: окно ролла → бонус тира */
export function mutationBonusOf(roll: number): 0 | 1 | 2 {
  if (roll >= MUTATION_PLUS2_FROM) return 2;
  if (roll >= MUTATION_PLUS1_FROM) return 1;
  return 0;
}

/** формула потомка (M08 §4 — единая): max(родители) − 1 + бонус мутации,
 *  кап [D, SS]; редкая +2 даёт потомка ВЫШЕ лучшего родителя (max+1, кап SS) */
export function childTierOf(maxParentTier: QualityTier, mutationBonus: number): QualityTier {
  const base = QUALITY_TIERS.indexOf(maxParentTier) - 1 + mutationBonus;
  const clamped = Math.min(QUALITY_TIERS.length - 1, Math.max(0, base));
  return QUALITY_TIERS[clamped] as QualityTier;
}

/** рождение: мутационный ролл + слот + потомок; false — слота нет (ожидание) */
export function tryBirth(
  state: PenState,
  now: number,
  table: PenTable,
  animals: readonly AnimalDef[],
  roll01: (streamId: string) => number,
  slotsOf: (pen: 1 | 2) => { used: number; base: number },
): { state: PenState; born: AnimalInstance | null; tier: QualityTier | null } {
  const b = state.breeding;
  if (b === undefined || now < b.dueAt) return { state, born: null, tier: null };
  const def = animals.find((a) => a.id === b.speciesId);
  if (!def) {
    // вид исчез из контента (не воспроизводится в живой игре): процесс снят
    return { state: { ...state, breeding: undefined }, born: null, tier: null };
  }
  const slots = slotsOf(b.pen);
  const list = b.pen === 1 ? state.animals : (state.animals2 ?? []);
  if (list.length >= slots.base) return { state, born: null, tier: null }; // ждёт слот
  const roll = roll01(`pen:breed:${b.speciesId}:mutation`);
  const bonus = mutationBonusOf(roll);
  const tier = childTierOf(b.maxParentTier, bonus);
  const newborn = canonicalAnimal({
    speciesId: def.id,
    quality: tier,
    happiness: table.newborn.happiness,
    satiety: table.newborn.satiety,
    health: table.newborn.health,
    cleanliness: table.newborn.cleanliness,
    nextProduceAt: now + def.produce.periodHours * 3_600_000,
  });
  const next: PenState = { ...state, breeding: undefined };
  if (b.pen === 1) next.animals = [...state.animals, newborn];
  else next.animals2 = [...(state.animals2 ?? []), newborn];
  return { state: next, born: newborn, tier };
}

/** валидация пары для pen.breed (ошибки — с причиной; [] = можно) */
export function breedCheck(
  state: PenState,
  table: PenTable,
  animals: readonly AnimalDef[],
  upgrades: { has(id: string): boolean },
  idx1: number,
  idx2: number,
  pen: 1 | 2,
  now: number,
): { ok: true; maxParentTier: QualityTier; dueAt: number } | { ok: false; error: string } {
  if (!upgrades.has('upg_breeding_pen')) {
    return { ok: false, error: 'разведение закрыто — постройте «Родильный загон» (pen.upgrade upg_breeding_pen)' };
  }
  if (state.breeding !== undefined) {
    return { ok: false, error: 'разведение уже идёт — потомство по таймеру (pen.state)' };
  }
  const list = pen === 1 ? state.animals : (state.animals2 ?? []);
  const a1 = list[idx1];
  const a2 = list[idx2];
  if (!a1 || !a2) return { ok: false, error: `в загоне ${pen} нет животных №${!a1 ? idx1 : idx2} (pen.state — витрина)` };
  if (idx1 === idx2) return { ok: false, error: 'нужны ДВА разных животного одного вида' };
  if (a1.speciesId !== a2.speciesId) {
    return { ok: false, error: `разведение только одного вида: ${a1.speciesId} × ${a2.speciesId}` };
  }
  const def = animals.find((a) => a.id === a1.speciesId);
  if (!def) return { ok: false, error: `вид ${a1.speciesId} не найден (pen.animals — каталог)` };
  for (const [who, a] of [['№' + idx1, a1], ['№' + idx2, a2]] as const) {
    if (a.sickAt !== undefined && now < a.sickAt + table.sickness.healHours * 3_600_000) {
      return { ok: false, error: `животное ${who} больно — вылечите сначала (pen.heal ${who.slice(1)})` };
    }
    if (a.satiety < table.breeding.minSatiety) {
      return { ok: false, error: `животное ${who} голодно (сытость ${a.satiety} < ${table.breeding.minSatiety}) — покормите` };
    }
  }
  const maxParentTier =
    QUALITY_TIERS.indexOf(a1.quality) >= QUALITY_TIERS.indexOf(a2.quality) ? a1.quality : a2.quality;
  return {
    ok: true,
    maxParentTier,
    dueAt: now + table.breeding.periodHours * 3_600_000,
  };
}
