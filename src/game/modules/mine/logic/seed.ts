/**
 * Фикс-сид боя (--seed S, бриф F8): детерминированные именованные стримы —
 * КАНОН RngBus.stream (mulberry32(hash(`${seed}:${streamId}`))). Каждый
 * ролл зеркалится в журнал roll.log формой rollRange(0, 1, 'uniform')
 * (source = имя стрима: mine:attack:<…> / mine:block / mine:crit / …),
 * чтобы golden-пробы читали стримы из журнала как у живых боёв.
 */
import { hashString, mulberry32 } from '@/shared/utils/rng';
import type { RollLog } from '@/kernel/bus/rng-bus/roll-log';

export function makeSeededRoll(
  seed: number,
  log: RollLog,
  now: () => number,
): (streamId: string) => number {
  const streams = new Map<string, () => number>();
  return (streamId: string): number => {
    let s = streams.get(streamId);
    if (s === undefined) {
      s = mulberry32(hashString(`${seed}:${streamId}`));
      streams.set(streamId, s);
    }
    const v = s();
    log.push({
      at: now(),
      kind: 'range',
      source: streamId,
      input: '0..1 (uniform)',
      output: v.toFixed(2),
      luck: 0,
    });
    return v;
  };
}
