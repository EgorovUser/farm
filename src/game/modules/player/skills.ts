/**
 * SkillEngine (M01 §5): навыки от использования.
 *
 * Значимое действие публикует событие → этот движок по манифесту подписок
 * (xpEvents в данных навыка) добавляет XP. xpToNext(skillLevel) =
 * skillXpBase × skillXpGrowth^skillLevel — кривая целиком из данных
 * ([FIX-M01 · DEBT-19]: раньше 50 и 1.2 были литералами здесь). Заточка
 * качает кузнечество даже при провале — подписка на forge.attempt (попытку).
 * Эффекты раздаёт НЕ движок, а провайдер skillProvider (providers.ts) —
 * «сам модуль не раздаёт эффекты руками» (карточка §5).
 */
import type { EventBus } from '@/kernel/bus/event-bus/event-bus';
import type { SkillDef } from '@/content/player/skills';
import type { PlayerState, SkillState } from './state';
import { wireXpRules } from './progress';

export interface SkillsDeps {
  bus: EventBus;
  table: readonly SkillDef[];
  /** кривая навыка из content/player/progression.ts (DEBT-19): base × growth^level */
  xpCurve: { base: number; growth: number };
  getState: () => PlayerState;
  markDirty(): void;
}

export interface SkillSnapshot {
  id: string;
  name: string;
  level: number;
  xp: number;
  xpNeed: number;
}

export class SkillEngine {
  private readonly deps: SkillsDeps;

  constructor(deps: SkillsDeps) {
    this.deps = deps;
  }

  /** xpToNext(skillLevel) = skillXpBase × skillXpGrowth^skillLevel — из данных (карточка §5) */
  xpToNext(skillLevel: number): number {
    const { base, growth } = this.deps.xpCurve;
    return Math.round(base * growth ** skillLevel);
  }

  /** skills.get() — публичный API: срез навыка или null */
  get(skillId: string): SkillSnapshot | null {
    const def = this.deps.table.find((d) => d.id === skillId);
    const st = this.deps.getState().skills[skillId];
    if (!def || !st) return null;
    return { id: def.id, name: def.name, level: st.level, xp: Math.floor(st.xp), xpNeed: this.xpToNext(st.level) };
  }

  list(): SkillSnapshot[] {
    return this.deps.table.map((def) => {
      const st = this.skillState(def.id);
      return { id: def.id, name: def.name, level: st.level, xp: Math.floor(st.xp), xpNeed: this.xpToNext(st.level) };
    });
  }

  levelOf(skillId: string): number {
    return this.skillState(skillId).level;
  }

  /** skills.addXp — API для будущих модулей и debug */
  addXp(skillId: string, amount: number, source: string): { gained: number; levelsUp: number } {
    const def = this.deps.table.find((d) => d.id === skillId);
    if (!def || !(amount > 0)) return { gained: 0, levelsUp: 0 };
    const st = this.skillState(skillId);
    const before = st.level;
    st.xp += amount;
    let guard = 0;
    while (st.xp >= this.xpToNext(st.level) && guard < 1000) {
      st.xp -= this.xpToNext(st.level);
      st.level++;
      guard++;
      this.deps.bus.publish('skill.levelUp', { skill: def.id, level: st.level, source });
    }
    this.deps.markDirty();
    this.deps.bus.publish('skill.xpGained', { skill: def.id, amount, source, xp: Math.floor(st.xp), level: st.level });
    if (st.level !== before) this.deps.bus.publish('invalidate.stat', {});
    return { gained: amount, levelsUp: st.level - before };
  }

  /**
   * Ключи для ResolveCtx.extra — чтобы условия {t:'skill'} работали в шине,
   * вызывающий строит ctx с этими данными (StatBus читает extra['skill:<id>']).
   */
  ctxExtras(): Record<string, unknown> {
    const out: Record<string, unknown> = {};
    for (const def of this.deps.table) {
      out[`skill:${def.id}`] = this.skillState(def.id).level;
    }
    return out;
  }

  /** Подписки по манифесту данных: событие → XP навыка */
  wire(): () => void {
    const offs = this.deps.table.map((def) =>
      wireXpRules(this.deps.bus, def.xpEvents, (amount) => this.addXp(def.id, amount, def.id)),
    );
    return () => offs.forEach((off) => off());
  }

  private skillState(skillId: string): SkillState {
    const s = this.deps.getState();
    let st = s.skills[skillId];
    if (!st) {
      st = { level: 0, xp: 0 };
      s.skills[skillId] = st;
    }
    return st;
  }
}
