/**
 * Каталог событий ядра (02-BUSES §4).
 * Модули расширяют каталог своими событиями вида `<модуль>.<сущность>.<действие>`.
 * Payload — обычные сериализуемые данные.
 *
 * [РАСШИРЕНИЕ] Сверх таблицы §4 добавлены события: `time.catchUpDone` (координация
 * оффлайн-досчёта) и `debug.command` (аудит ввода консоли) — без них в таблице.
 *
 * [M01 · DEBT-14] События игрока из таблицы §4 (player.energySpent / hpChanged /
 * levelUp, skill.levelUp — «игрок M01») плюс производные для ленты/квестов:
 * player.energyChanged, player.xpGained, skill.xpGained. Владелец — модуль M01.
 */

export interface CoreEventPayloads {
  'time.minuteTick': { tick: number; now: number; catchUp?: boolean };
  'time.hourTick': { hourIndex: number; now: number; catchUp?: boolean; crossed?: number };
  'time.dayTick': { dayIndex: number; now: number; catchUp?: boolean; dateISO: string; crossed?: number };
  'time.catchUpDone': {
    from: number;
    to: number;
    hours: number;
    days: number;
    hoursCapped: boolean;
    daysCapped: boolean;
  };

  // --- игрок (M01, 02-BUSES §4)
  /** расход энергии на действие (после списания) */
  'player.energySpent': { stat: string; cost: number; current: number; max: number; reason?: string };
  /** любое изменение отображаемой энергии (расход/грант/реген) */
  'player.energyChanged': { delta: number; current: number; max: number; reason: string };
  /** любое изменение HP; смерть — died: true и тег death (карточка M01 §3) */
  'player.hpChanged': { delta: number; current: number; max: number; died: boolean; tags: string[]; reason: string };
  'player.xpGained': { amount: number; source: string; xp: number; level: number };
  'player.levelUp': { level: number; source: string };
  'skill.xpGained': { skill: string; amount: number; source: string; xp: number; level: number };
  'skill.levelUp': { skill: string; level: number; source: string };

  'wallet.transaction': {
    eventId: string;
    ok: boolean;
    costs: { t: 'currency' | 'item'; id: string; qty: number }[];
    grants: { t: 'currency' | 'item'; id: string; qty: number }[];
    reason?: string;
  };

  'item.acquired': { defId: string; qty: number; source: string };
  'item.consumed': { defId: string; qty: number; source: string };

  'invalidate.stat': { stats?: string[] };
  'invalidate.price': Record<string, never>;

  'debug.command': { input: string; at: number };
}

export type CoreEventName = keyof CoreEventPayloads & string;
export type EventName = string;
export type EventPayload = unknown;

/** Полная запись события для лога/отчётов */
export interface EventRecord {
  name: EventName;
  payload: EventPayload;
  at: number;
}
