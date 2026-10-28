/**
 * Генератор слоя M13.1 (бриф R2, карточка §1/§3): 12 карт = 4 колонки × 3
 * («выбор из N») + финальная карта-босс (kind 'boss', payload = bossId слоя
 * по данным M12.2; в колонки НЕ роллится — вес 0).
 *
 * Детерминизм: сид генерации = hash(saveId, layer, runNumber) — форма
 * hashString(`${saveId}:mine:${layer}:${runNumber}`) [DECISION R1];
 * `mine gen --seed S` подставляет S вместо хеша (оракул расклада).
 * Все роллы — детерминированные именованные стримы mine:gen:* (канон
 * RngBus.stream, зеркалятся в roll.log формой range — golden-пробы читают).
 *
 * Открытость (карточка §1: 60% открыты / 40% скрыты): взвешенный ролл
 * с luck-каналом mine.luck.hidden (02-BUSES §6) — скрытая запись lucky:
 *   вес_скрытой = h × max(0, 1 + mine.luck.hidden/100),  вес_открытой = 100 − h
 * где h = resolve('mine.hiddenChance') (база 40; Освещение — inc −25 → 30 —
 * оракул R9). База h=40, luck=0 → ровно 40% скрытых; положительная удача
 * скрытого — больше тайн (и надёжнее факел: тот же стат, R5).
 */
import { hashString } from '@/shared/utils/rng';
import type { RngBus } from '@/kernel/bus/rng-bus/rng-bus';
import type { StatBus } from '@/kernel/bus/stat-bus/stat-bus';
import type { ResolveCtx } from '@/kernel/bus/stat-bus/modifier';
import type { MineLayerDef } from '@/content/mine/layers';
import type { MineCardDef, MineLayerStatusDef } from '@/content/mine/cards';
import type { MineMobDef } from '@/content/mine/mobs';
import type { RunCard } from './state';
import { makeSeededRoll } from './logic/seed';

export const COLUMNS = 4;
export const CARDS_PER_COLUMN = 3;
/** индекс карты-босса в run.cards (12 колонок + финал) */
export const BOSS_CARD_INDEX = COLUMNS * CARDS_PER_COLUMN;

/** колонка карты: 1..4 для колонок, 5 — финальная карта-босс */
export function columnOfCard(index: number): number {
  return Math.min(COLUMNS + 1, Math.floor(index / CARDS_PER_COLUMN) + 1);
}

/** сид генерации забега: hash(saveId, layer, runNumber) — форма [DECISION R1] */
export function runSeedOf(saveId: string, layer: number, runNumber: number): number {
  return hashString(`${saveId}:mine:${layer}:${runNumber}`);
}

export interface GenDeps {
  cards: MineCardDef[];
  statuses: MineLayerStatusDef[];
  mobs: MineMobDef[];
  statBus: StatBus;
  rngBus: RngBus;
  time: { now(): number };
}

export interface GeneratedLayout {
  cards: RunCard[];
  seed: number;
  status: string | null;
  /** развёрнутые шансы открытости (витрина-оракул, П6) */
  openInfo: { hiddenChance: number; luck: number };
}

/** статус слоя — данные (карточка §1; витрина + тег ctx; эффекты — R2) */
export function statusOfLayer(statuses: MineLayerStatusDef[], layer: number): MineLayerStatusDef | undefined {
  return statuses.find((s) => s.layer === layer);
}

/**
 * Генерация расклада слоя по сиду. Чистая от состояния игры, кроме резолва
 * статов скрытости/удачи (шину читает на момент вызова — база/luck в тестах
 * фиксируются мод-каналом или равны базовым).
 */
export function generateLayer(
  deps: GenDeps,
  layer: number,
  seed: number,
  layerDef: MineLayerDef,
  ctx: ResolveCtx,
): GeneratedLayout {
  const roll = makeSeededRoll(seed >>> 0, deps.rngBus.rollLog(), () => deps.time.now());
  const hRaw = deps.statBus.resolve({ stat: 'mine.hiddenChance', ctx });
  const luck = deps.statBus.resolve({ stat: 'mine.luck.hidden', ctx });
  const h = Math.min(100, Math.max(0, hRaw));
  const luckMult = Math.max(0, 1 + luck / 100);
  const hiddenWeight = h * luckMult;
  const openWeight = Math.max(0, 100 - h);

  // кандидаты колонок: все kinds кроме boss (вес 0 в колонках — R2)
  const pool = deps.cards.filter((c) => c.kind !== 'boss' && c.weight > 0);
  const totalWeight = pool.reduce((s, c) => s + c.weight, 0);

  const cards: RunCard[] = [];
  for (let i = 0; i < COLUMNS * CARDS_PER_COLUMN; i++) {
    const col = columnOfCard(i);
    // ролл вида карты (стрим mine:gen:kind:<col>:<slot>)
    const uk = roll(`mine:gen:kind:${col}:${(i % CARDS_PER_COLUMN) + 1}`) * totalWeight;
    let def: MineCardDef = pool[pool.length - 1]!;
    let acc = 0;
    for (const c of pool) {
      acc += c.weight;
      if (uk < acc) {
        def = c;
        break;
      }
    }
    // ролл открытости (стрим mine:gen:open:<col>:<slot>) — скрытая запись lucky
    const uo = roll(`mine:gen:open:${col}:${(i % CARDS_PER_COLUMN) + 1}`) * (hiddenWeight + openWeight);
    const hidden = uo < hiddenWeight;
    const card: RunCard = {
      id: def.id,
      kind: def.kind,
      hidden,
      payload: def.payload ?? null,
    };
    // моб: mobId роллится при генерации (детерминизм расклада), элита — шансом
    // из ПОДДЕРЖИВАЕМЫХ мобом модификаторов (данные mobs.ts; П5)
    if (def.kind === 'mob') {
      const p = def.payload as { mobPool: string[]; eliteChance: number };
      const um = roll(`mine:gen:mob:${col}:${(i % CARDS_PER_COLUMN) + 1}`) * p.mobPool.length;
      card.mobId = p.mobPool[Math.min(p.mobPool.length - 1, Math.floor(um))]!;
      const mobDef = deps.mobs.find((m) => m.id === card.mobId);
      const elitePool = mobDef?.eliteMods ?? [];
      const ue = roll(`mine:gen:elite:${col}:${(i % CARDS_PER_COLUMN) + 1}`) * 100;
      if (ue < p.eliteChance && elitePool.length > 0) {
        const ui = Math.floor(roll(`mine:gen:elitePick:${col}:${(i % CARDS_PER_COLUMN) + 1}`) * elitePool.length);
        card.elite = elitePool[Math.min(elitePool.length - 1, ui)]!;
      } else {
        card.elite = null;
      }
    }
    cards.push(card);
  }

  // финальная карта-босс: payload = bossId слоя (данные M12.2)
  cards.push({
    id: 'card_boss',
    kind: 'boss',
    hidden: false,
    payload: layerDef.bossId,
  });

  const st = statusOfLayer(deps.statuses, layer);
  return {
    cards,
    seed: seed >>> 0,
    status: st?.status ?? null,
    openInfo: { hiddenChance: h, luck },
  };
}
