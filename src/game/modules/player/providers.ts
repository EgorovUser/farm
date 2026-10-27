/**
 * Провайдеры модификаторов M01 (карточка §7): skillProvider и
 * levelBonusProvider. Все перки навыков и бонусы уровня — ТОЛЬКО модификаторы
 * через StatBus: «сам модуль не раздаёт эффекты руками».
 *
 * Семантика perLevel: модификатор применяется ЗА КАЖДЫЙ уровень навыка —
 * провайдер отдаёт level копий с уникальными id (для inc это сумма, для
 * more — честное перемножение каждой копии). Пороги (каждые 5 уровней) —
 * отдаются с достигнутых уровней.
 *
 * levelBonus: +энергия/+HP к капам за каждый уровень игрока СВЕРХ первого
 * (уровень 1 — стартовый, без бонуса). Значения — из данных progression.ts.
 */
import type { Modifier, ModifierProvider, ResolveCtx } from '@/kernel/bus/stat-bus/modifier';
import type { StatId } from '@/shared/types/ids';
import type { SkillDef } from '@/content/player/skills';
import type { PlayerTable } from '@/content/player/progression';

export interface SkillProviderDeps {
  table: readonly SkillDef[];
  levelOf(skillId: string): number;
}

/** Провайдер перков навыков (манифест modifierProviders: 'player.skills') */
export class SkillProvider implements ModifierProvider {
  readonly id = 'player.skills';

  private readonly deps: SkillProviderDeps;

  constructor(deps: SkillProviderDeps) {
    this.deps = deps;
  }

  provide(stat: StatId, _ctx: ResolveCtx): Modifier[] {
    void _ctx; // фильтрацию (условия/теги) делает StatBus — провайдер только отдаёт
    const out: Modifier[] = [];
    for (const def of this.deps.table) {
      const level = this.deps.levelOf(def.id);
      if (level <= 0) continue;
      for (let k = 1; k <= level; k++) {
        for (const m of def.perLevel) {
          if (m.stat !== stat) continue;
          out.push({
            id: `skill.${def.id}.lvl${k}`,
            source: { kind: 'skill', refId: def.id },
            stat: m.stat,
            op: m.op,
            value: m.value,
            label: `${def.name} ур.${k}${m.label ? ` — ${m.label}` : ''}`,
          });
        }
      }
      for (const thr of def.thresholds) {
        if (level < thr.level) continue;
        for (const m of thr.mods) {
          if (m.stat !== stat) continue;
          out.push({
            id: `skill.${def.id}.thr${thr.level}`,
            source: { kind: 'skill', refId: def.id },
            stat: m.stat,
            op: m.op,
            value: m.value,
            label: `${def.name} порог ${thr.level}${thr.note ? ` — ${thr.note}` : ''}`,
          });
        }
      }
    }
    return out;
  }
}

export interface LevelBonusProviderDeps {
  table: PlayerTable;
  playerLevel(): number;
}

/** Провайдер бонусов уровня (манифест: 'player.levelBonus') */
export class LevelBonusProvider implements ModifierProvider {
  readonly id = 'player.levelBonus';

  private readonly deps: LevelBonusProviderDeps;

  constructor(deps: LevelBonusProviderDeps) {
    this.deps = deps;
  }

  provide(stat: StatId, _ctx: ResolveCtx): Modifier[] {
    void _ctx;
    const out: Modifier[] = [];
    const level = this.deps.playerLevel();
    if (level <= 1) return out; // уровень 1 — стартовый, бонусов нет
    const { energyMaxPerLevel, hpMaxPerLevel } = this.deps.table.levelBonus;
    for (let lvl = 2; lvl <= level; lvl++) {
      if (stat === 'player.energy.max' && energyMaxPerLevel > 0) {
        out.push({
          id: `player.level.${lvl}.energy`,
          source: { kind: 'passive', refId: 'player.level' },
          stat: 'player.energy.max',
          op: 'flat',
          value: energyMaxPerLevel,
          label: `уровень ${lvl} — +${energyMaxPerLevel} энергии`,
        });
      }
      if (stat === 'player.hp.max' && hpMaxPerLevel > 0) {
        out.push({
          id: `player.level.${lvl}.hp`,
          source: { kind: 'passive', refId: 'player.level' },
          stat: 'player.hp.max',
          op: 'flat',
          value: hpMaxPerLevel,
          label: `уровень ${lvl} — +${hpMaxPerLevel} HP`,
        });
      }
    }
    return out;
  }
}
