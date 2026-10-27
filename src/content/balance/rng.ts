/**
 * Рандом: журнал роллов + ДЕМО-таблицы для фазы 0.
 * Игровые таблицы (рыбалка, лут шахты) появятся с модулями M07+/M12+.
 */
import type { RollTable } from '@/kernel/bus/rng-bus/rng-bus';

export interface RngTable {
  rollLogCap: number;
}

export const RNG_TABLE: RngTable = {
  rollLogCap: 200,
};

/** Демо-таблицы: проверка RngBus/luck из debug-консоли (lucky-записи тянет удача таблицы) */
export const ROLL_TABLES: RollTable[] = [
  {
    id: 'demo.loot',
    luckStat: 'player.luck',
    entries: [
      { id: 'iron_ore', weight: 50 },
      { id: 'turnip', weight: 25 },
      { id: 'apple_pie', weight: 15 },
      { id: 'lucky_charm', weight: 2, lucky: true },
      { id: 'nothing', weight: 8 },
    ],
  },
  {
    id: 'demo.treasure',
    luckStat: 'fishing.luck.rare',
    entries: [
      { id: 'turnip', weight: 40 },
      { id: 'iron_ingot', weight: 30, lucky: true },
      { id: 'lucky_charm', weight: 10, lucky: true },
      { id: 'nothing', weight: 20 },
    ],
  },
];
