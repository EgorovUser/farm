/**
 * EventBus — типизированный pub/sub (02-BUSES §4).
 * - порядок вызова обработчиков не гарантирован;
 * - отменить чужое событие нельзя;
 * - wildcard-подписка только для отладки (лог, UI);
 * - обработчик падает => ошибка в лог консоли, шина живёт дальше.
 */
import type { CoreEventName, CoreEventPayloads, EventName, EventPayload, EventRecord } from './events';

export type Handler = (payload: unknown, name: EventName) => void;
export type Unsubscribe = () => void;

export class EventBus {
  private readonly handlers = new Map<EventName, Set<Handler>>();
  private readonly wildcards = new Set<Handler>();
  private readonly recent: EventRecord[] = [];
  private readonly recentCap = 100;
  private publishingDepth = 0;
  private readonly pendingRemovals: Array<{ map: Map<EventName, Set<Handler>> | 'wild'; handler: Handler; name?: EventName }> = [];

  publish<K extends CoreEventName>(name: K, payload: CoreEventPayloads[K]): void;
  publish(name: EventName, payload: EventPayload): void;
  publish(name: EventName, payload: EventPayload): void {
    this.remember({ name, payload, at: Date.now() });
    const set = this.handlers.get(name);
    if (set) {
      for (const h of [...set]) {
        this.safeCall(h, name, payload);
      }
    }
    for (const h of [...this.wildcards]) {
      this.safeCall(h, name, payload);
    }
  }

  subscribe(name: EventName, handler: Handler): Unsubscribe {
    let set = this.handlers.get(name);
    if (!set) {
      set = new Set();
      this.handlers.set(name, set);
    }
    set.add(handler);
    return () => this.unsubscribe(this.handlers, handler, name);
  }

  /** Подписка на ВСЕ события — только debug/UI. Не для игровой логики. */
  subscribeAll(handler: Handler): Unsubscribe {
    this.wildcards.add(handler);
    return () => this.unsubscribe('wild' as unknown as Map<EventName, Set<Handler>>, handler);
  }

  subscriberCount(name?: EventName): number {
    if (name === undefined) {
      let total = this.wildcards.size;
      for (const set of this.handlers.values()) total += set.size;
      return total;
    }
    return this.handlers.get(name)?.size ?? 0;
  }

  eventNames(): EventName[] {
    return [...this.handlers.keys()].sort();
  }

  /** Последние события (для debug-панели) */
  recentEvents(): readonly EventRecord[] {
    return this.recent;
  }

  private unsubscribe(
    map: Map<EventName, Set<Handler>> | 'wild',
    handler: Handler,
    name?: EventName,
  ): void {
    if (this.publishingDepth > 0) {
      this.pendingRemovals.push({ map, handler, name });
      return;
    }
    this.applyRemoval({ map, handler, name });
  }

  private applyRemoval(entry: { map: Map<EventName, Set<Handler>> | 'wild'; handler: Handler; name?: EventName }): void {
    if (entry.map === 'wild') {
      this.wildcards.delete(entry.handler);
      return;
    }
    const set = entry.name ? entry.map.get(entry.name) : undefined;
    if (!set) return;
    set.delete(entry.handler);
    if (set.size === 0 && entry.name) entry.map.delete(entry.name);
  }

  private safeCall(h: Handler, name: EventName, payload: EventPayload): void {
    this.publishingDepth++;
    try {
      h(payload, name);
    } catch (e) {
      // Шина не имеет права падать из-за чужого обработчика
       
      console.error(`[EventBus] обработчик события "${name}" упал:`, e);
    } finally {
      this.publishingDepth--;
      if (this.publishingDepth === 0 && this.pendingRemovals.length > 0) {
        const pending = [...this.pendingRemovals];
        this.pendingRemovals.length = 0;
        for (const entry of pending) this.applyRemoval(entry);
      }
    }
  }

  private remember(record: EventRecord): void {
    this.recent.push(record);
    if (this.recent.length > this.recentCap) this.recent.shift();
  }
}
