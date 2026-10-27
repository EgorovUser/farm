/**
 * Sweep очередей крафта §5 (карточка M09) — ядро модели времени.
 *
 * МОДЕЛЬ (инвариант 02-BUSES §8 — абсолютные даты): пакет хранит enqueuedAt;
 * startedAt/endsAt проставляются в момент фактического старта. Старт головы:
 * (а) предыдущая партия только что завершилась (prevEnd — цепочка оффлайн-
 * досчёта), (б) станция простаивала — max(now, enqueuedAt), (в) готовый
 * буфер ≥ readyCap — ПАУЗА ([DECISION] M09: карточка «копит до cap» — и
 * старт, и ЗАВЕРШЕНИЕ останавливаются, инвариант ready ≤ cap на станции
 * всегда; потерь нет, cozy — сбор возобновляет). catchUp отдельного кода
 * не требует: sweep(now) детерминированно достраивает цепочку до текущего
 * момента (прецедент «grownAt в прошлом = READY», §8 п.1).
 *
 * ЗАВЕРШЕНИЕ: качество по формуле §4 — детерминированно от снапшота inputTier
 * партии, minigame-поправки постановки и ТЕКУЩЕГО навыка (уровень растёт —
 * поздние партии выходят лучше; [DECISION] M09) → готовый буфер →
 * craft.completed (defId, качество — XP/навык/квесты; контент M01 подписан).
 */
import type { StationId } from '@/content/craft/stations';
import type { CraftReadyBatch, CraftState } from './state';
import { outputQuality } from './quality';
import type { QueueDeps } from './deps';

export interface SweepReceipt {
  started: number;
  completed: number;
  paused: StationId[];
}

/** Санитарный предел итераций одной станции (защита от вырожденных цепочек) */
const ITERATION_GUARD = 10_000;

/**
 * [FIX-PHASE-2 · 4.4 · OBS-5 AUDIT-M09] время партии с потреблением
 * craft.speedPercent (перк «Крафт» ур.10 и будущие источники — через шину П3):
 * resolve — процентный (база 100 = нейтраль, прецедент craft.qualityBonus);
 * seconds = max(minBatchSeconds, round(craftSeconds × (1 − (resolve−100)/100)))
 * — клэмп-минимум из content (тюнюется). Без модов resolve=100 → время
 * ровно craftSeconds (существующие оракулы дат не тронуты).
 */
function batchSecondsOf(deps: QueueDeps, craftSeconds: number): number {
  const speed = deps.statBus.resolve({ stat: 'craft.speedPercent', ctx: deps.resolveCtx() }) - 100;
  const factor = Math.max(0, 1 - speed / 100);
  return Math.max(deps.table.queue.minBatchSeconds, Math.round(craftSeconds * factor));
}

/**
 * Досчитать очереди до текущего момента (лениво на каждом доступе +
 * time.minuteTick/hourTick + исполнитель craft.queue). Идемпотентно:
 * повторный sweep по тому же now — no-op.
 */
export function sweepQueues(deps: QueueDeps): SweepReceipt {
  const now = deps.now();
  const state = deps.getState();
  const queues = { ...state.queues };
  const ready = [...state.ready];
  let started = 0;
  let completed = 0;
  const paused: StationId[] = [];
  let changed = false;
  const { readyCap, pauseOnReadyCap } = deps.table.queue;

  for (const station of Object.keys(queues) as StationId[]) {
    const list = [...(queues[station] ?? [])];
    let prevEnd: number | null = null;
    let guard = 0;
    while (list.length > 0 && guard++ < ITERATION_GUARD) {
      const first = { ...list[0] };
      const recipe = deps.recipes.find((r) => r.id === first.recipeId);
      if (!recipe) {
        // П5: контент исчез — партия выброшена (удаление контента = миграция)
        list.shift();
        changed = true;
        continue;
      }
      const readyCount = ready.filter((r) => r.station === station).length;
      const atCap = pauseOnReadyCap && readyCount >= readyCap;

      if (first.startedAt === undefined) {
        if (atCap) {
          if (!paused.includes(station)) paused.push(station);
          break;
        }
        // цепочка: сразу после предыдущей ИЛИ с момента простоя станции
        first.startedAt = prevEnd !== null ? prevEnd : Math.max(now, first.enqueuedAt);
        first.endsAt = first.startedAt + batchSecondsOf(deps, recipe.craftSeconds) * 1000;
        list[0] = first;
        changed = true;
        started++;
        deps.bus.publish('craft.started', {
          recipeId: recipe.id,
          station,
          batchId: first.id,
          startedAt: first.startedAt,
          endsAt: first.endsAt,
        });
      }
      if (first.endsAt !== undefined && first.endsAt <= now) {
        if (atCap) {
          // работа сделана, но буфер полон: партия ждёт сбора (endsAt в
          // прошлом — следующий sweep завершит её после освобождения места)
          if (!paused.includes(station)) paused.push(station);
          break;
        }
        // --- завершение: качество по формуле §4 (детерминированно)
        const quality = outputQuality(
          {
            avgInputTier: first.inputTier,
            skillLevel: deps.skillLevel(),
            qualityBonus: deps.statBus.resolve({ stat: 'craft.qualityBonus', ctx: deps.resolveCtx() }),
            minigameAdj: first.minigameAdj ?? 0,
          },
          deps.table,
        );
        const done: CraftReadyBatch = {
          id: first.id,
          recipeId: recipe.id,
          station,
          completedAt: first.endsAt,
          quality,
        };
        ready.push(done);
        list.shift();
        prevEnd = done.completedAt;
        changed = true;
        completed++;
        deps.bus.publish('craft.completed', {
          recipeId: recipe.id,
          station,
          batchId: first.id,
          defId: recipe.output.defId,
          qty: recipe.output.qty,
          quality,
        });
        continue;
      }
      break;
    }
    if (list.length > 0) queues[station] = list;
    else delete queues[station];
  }

  if (changed) {
    deps.setState({ ...(deps.getState() as CraftState), queues, ready });
    deps.markDirty();
  }
  return { started, completed, paused };
}
