/**
 * Клиентский синглтон игры. Только браузер: ядро живёт в памяти вкладки,
 * автосейв пишет в IndexedDB (fallback: localStorage).
 */
import { createGame, type Game } from './bootstrap';

let instance: Game | null = null;

export function getGame(): Game {
  if (typeof window === 'undefined') {
    throw new Error('getGame() вызван вне браузера — ядро создаётся только на клиенте');
  }
  if (!instance) {
    instance = createGame();
  }
  return instance;
}

/** Только для тестов/self-checks: сбросить синглтон */
export function resetGameInstance(): void {
  if (instance) {
    instance.dispose();
    instance = null;
  }
}
