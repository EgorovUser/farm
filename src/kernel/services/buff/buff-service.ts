/**
 * BuffService — хранилище транзиентных модификаторов (бафов/дебафов).
 * 02-BUSES §2: «Отдельных систем бафов/дебафов НЕ СУЩЕСТВУЕТ — всё модификаторы».
 * Значит ядру нужен один общий провайдер временных модификаторов:
 * debug-команды, еда, зелья, погода, страхи — все кладут сюда Modifier с expiresAt.
 */
import type { EventBus } from '@/kernel/bus/event-bus/event-bus';
import type { Modifier, ModifierProvider, ResolveCtx } from '@/kernel/bus/stat-bus/modifier';
import type { StatId } from '@/shared/types/ids';
import type { Result } from '@/shared/types/result';
import { err, ok } from '@/shared/types/result';
import { MS_DAY } from '@/shared/utils/math';

export interface BuffEntry {
  mod: Modifier;
  addedAt: number;
}

export class BuffService implements ModifierProvider {
  readonly id = 'kernel.buffs';

  private readonly buffs = new Map<string, BuffEntry>();
  private readonly bus: EventBus;

  constructor(bus: EventBus) {
    this.bus = bus;
  }

  provide(stat: StatId, _ctx: ResolveCtx): Modifier[] {
    // фильтрацию (условия/теги/срок) делает StatBus — провайдер только отдаёт своё
    void _ctx;
    const out: Modifier[] = [];
    for (const entry of this.buffs.values()) {
      if (entry.mod.stat === stat) out.push(entry.mod);
    }
    return out;
  }

  /** Добавить баф. duration без expiresAt → expiresAt = now + duration (абсолютные даты).
   *  [FIX-0.1 G] kind:'runs' — «до конца забега»: expiresAt НЕ выставляется.
   *  Раньше now + Infinity → JSON.stringify → null → после загрузки баф признавался
   *  истёкшим и съедался sweep'ом (ловушка M13). Очистка runs-бафов — API конца
   *  забега (M13), в фазе 0 не реализуется. */
  add(mod: Modifier, now: number): Result<string> {
    let m: Modifier = mod;
    if (m.expiresAt === undefined && m.duration && m.duration.kind !== 'runs') {
      m = { ...m, expiresAt: now + durationToMs(m.duration) };
    }
    if (!m.id) return err('у модификатора нет id');
    this.buffs.set(m.id, { mod: m, addedAt: now });
    this.bus.publish('invalidate.stat', { stats: [m.stat] });
    return ok(m.id);
  }

  remove(id: string): boolean {
    const entry = this.buffs.get(id);
    if (!entry) return false;
    this.buffs.delete(id);
    this.bus.publish('invalidate.stat', { stats: [entry.mod.stat] });
    return true;
  }

  removeByStat(stat: StatId): number {
    let removed = 0;
    for (const [id, entry] of this.buffs) {
      if (entry.mod.stat === stat) {
        this.buffs.delete(id);
        removed++;
      }
    }
    if (removed > 0) this.bus.publish('invalidate.stat', { stats: [stat] });
    return removed;
  }

  clear(): void {
    this.buffs.clear();
    this.bus.publish('invalidate.stat', {});
  }

  get(id: string): BuffEntry | undefined {
    return this.buffs.get(id);
  }

  list(): BuffEntry[] {
    return [...this.buffs.values()].sort((a, b) => a.addedAt - b.addedAt);
  }

  /** Убрать истёкшие; вызывается на тиках. Возвращает количество удалённых.
   *  runs-бафы (без expiresAt) не трогаются — их чистит API конца забега (M13). */
  sweep(now: number): number {
    let removed = 0;
    for (const [id, entry] of this.buffs) {
      if (entry.mod.expiresAt !== undefined && entry.mod.expiresAt <= now) {
        this.buffs.delete(id);
        removed++;
      }
    }
    if (removed > 0) this.bus.publish('invalidate.stat', {});
    return removed;
  }

  // ------------------------------------------------------------- save slice

  saveState(): unknown {
    return { buffs: this.list().map((e) => ({ mod: e.mod, addedAt: e.addedAt })) };
  }

  loadState(data: unknown): void {
    this.buffs.clear();
    const parsed = data as { buffs?: { mod: Modifier; addedAt: number }[] } | null;
    if (!parsed?.buffs || !Array.isArray(parsed.buffs)) return;
    for (const e of parsed.buffs) {
      if (e?.mod?.id) this.buffs.set(e.mod.id, { mod: e.mod, addedAt: e.addedAt ?? 0 });
    }
  }
}

function durationToMs(d: Modifier['duration']): number {
  if (!d) return 0;
  switch (d.kind) {
    case 'ticks':
      // тик ядра = 1 реальная секунда (настройка в данных времени); для бафов
      // достаточно приближения — точность критична только для absolute expiresAt
      return d.value * 1000;
    case 'seconds':
      return d.value * 1000;
    case 'days':
      return d.value * MS_DAY;
    case 'runs':
      // недостижимо для expiresAt: runs обрабатывается в add() без даты (FIX-0.1 G)
      return Number.POSITIVE_INFINITY;
    default:
      return 0;
  }
}
