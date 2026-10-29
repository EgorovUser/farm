/**
 * Депсы M14 (П4: модуль НЕ импортирует чужие модули — каналы приходят
 * колбэками app-слоя, паттерн MineModuleDeps). Для ретро-подсчёта по ФАКТАМ
 * сейва (бриф §0/§5): уровень игрока + открытые ачивки — витрины publicApi
 * M01/M15 через ModuleRegistry (module-wiring.ts).
 */
export interface PassivesModuleDeps {
  /** уровень игрока (player.ctxExtras → 'player:level') */
  playerLevel(): number;
  /** открыта ли ачивка (quests.gateExtras → 'achievement:<id>') */
  hasAchievement(id: string): boolean;
}
