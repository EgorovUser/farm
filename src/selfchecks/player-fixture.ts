/**
 * Фикстуры self-checks M01: мини-игра с активным модулем игрока.
 * createGame(ManualClock, MemoryStorage) — полный бутстрап (контент валиден,
 * модуль активирован в bootstrap), но init() НЕ вызывается: тики не идут,
 * стартовый капитал не выдаётся — состояние полностью управляется проверкой.
 */
import { ManualClock } from '@/kernel/di/clock';
import { MemoryStorage } from '@/kernel/save/storage-drivers';
import { createGame, type Game } from '@/game/bootstrap';
import type { PlayerSnapshot } from '@/game/modules/player/module';

/** 1 января 2024, 12:00 локального времени */
export const FIX_T0 = new Date(2024, 0, 1, 12, 0, 0, 0).getTime();

export interface PlayerFixture {
  game: Game;
  clock: ManualClock;
  api: Record<string, (...args: unknown[]) => unknown>;
  snapshot(): PlayerSnapshot;
  /** ручной минутный тик (реген подписан на time.minuteTick) */
  tick(n?: number): void;
  /** ручной catchUp-досчёт (реген подписан на time.catchUpDone) */
  catchUp(from: number, to: number): void;
  dispose(): void;
}

export function makePlayerGame(startMs: number = FIX_T0): PlayerFixture {
  const clock = new ManualClock(startMs);
  const game = createGame(clock, new MemoryStorage());
  const api = game.modules.get('player')?.api ?? {};
  let tickNo = 0;
  return {
    game,
    clock,
    api,
    snapshot: () => api['player.snapshot']() as PlayerSnapshot,
    tick(n = 1): void {
      for (let i = 0; i < n; i++) {
        clock.set(clock.now() + 1000); // тик = 1 игровая минута = 1000ms
        tickNo++;
        game.bus.publish('time.minuteTick', { tick: tickNo, now: clock.now() });
      }
    },
    catchUp(from: number, to: number): void {
      clock.set(to);
      game.bus.publish('time.catchUpDone', {
        from,
        to,
        hours: 0,
        days: 0,
        hoursCapped: false,
        daysCapped: false,
      });
    },
    dispose(): void {
      game.dispose();
    },
  };
}

/** Шпион на прямые записи в кошелёк (приёмка §8: «ни один модуль не пишет напрямую») */
export function spyWallet(game: Game): { directWrites: () => number } {
  const wallet = game.wallet as unknown as {
    grant: (id: never, qty: number) => number;
    spend: (id: never, qty: number) => number;
  };
  const origGrant = wallet.grant.bind(game.wallet);
  const origSpend = wallet.spend.bind(game.wallet);
  let writes = 0;
  wallet.grant = (id, qty) => {
    writes++;
    return origGrant(id, qty);
  };
  wallet.spend = (id, qty) => {
    writes++;
    return origSpend(id, qty);
  };
  return { directWrites: () => writes };
}
