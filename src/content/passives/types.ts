/**
 * Типы контента M14 «Дерево пассивик» (карточка §3; 03-DATA §9
 * PassiveNodeDef — канон: id/name/kind/mods/links/pos/cluster).
 *
 * NodeMod — ДЕКЛАРАТИВНАЯ форма модификатора узла: id и source синтезирует
 * провайдер (passivesProvider) при перечислении выделенных узлов; здесь —
 * только стат/операция/значение (+опциональные priority/label канона 02 §2).
 */
import type { Op, StatId } from '@/shared/types/ids';

export type PassiveNodeKind = 'small' | 'notable' | 'keystone';

/** кластеры полного дерева (M14.2): core/farm/fish/mine/economy/animals */
export type PassiveCluster = 'core' | 'farm' | 'fish' | 'mine' | 'economy' | 'animals';

export interface PassiveNodeMod {
  stat: StatId;
  op: Op;
  value: number;
  /** для override: побеждает max(priority) — канон 02-BUSES §2 */
  priority?: number;
  /** подпись для витрин (П6) */
  label?: string;
}

export interface PassiveNodeDef {
  id: string;
  name: string;
  kind: PassiveNodeKind;
  cluster: PassiveCluster;
  /** очки пассивок; старт-узел — cost 0 и выделения не требует */
  cost: number;
  mods: PassiveNodeMod[];
  /** рёбра: перечисляются с любой из вершин, граф НЕориентированный */
  links: string[];
  /** позиция для UI-зума (фаза 6 — M18; здесь только хранится) */
  pos: { x: number; y: number };
  /** витринная заметка (не поведение) */
  note?: string;
}

export interface PassivesTree {
  /** старт-узлы: корни достижимости, всегда «активны» без выделения */
  startNodes: string[];
  nodes: PassiveNodeDef[];
}

/** очки: каналы начисления + маркеры «крупных»/боссовых ачивок (бриф §0) */
export interface PassivesPointsTable {
  /** +N за уровень игрока (канон «за каждый обладаемый уровень»; ретро = level) */
  perLevel: number;
  /** +N за босса слоя (живой канал mine.bossKilled; ретро — по флагам ачивок) */
  perBoss: number;
  /** «крупные» ачивки: маркер очков ДАННЫМИ по СУЩЕСТВУЮЩИМ ачивкам M15 */
  largeAchievements: Array<{ id: string; points: number }>;
  /** боссовые ачивки ach_mine_boss_1..9 — ретро-факты (+perBoss за флаг) */
  bossAchievements: string[];
}

/** кривая респека: стоимость растёт от накопленного числа сброшенных узлов */
export interface PassivesRespecTable {
  /** цена первой операции респека (золото) */
  baseCost: number;
  /** множитель за каждый уже сброшенный узел (respecTotal) */
  growthMult: number;
}
